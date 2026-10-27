// Electron 메인 프로세스: 창을 만들고, 워크시트 모음(파일)과 열기/저장 대화상자, 최근 파일 목록을 맡는다.

const { app, BrowserWindow, Menu, dialog, ipcMain, nativeTheme, shell } = require('electron');
const fs = require('fs');
const path = require('path');

// 포터블 모드: 설정과 최근 파일 목록을 실행 파일 옆 WorksheetData 폴더에 둔다.
// (쓰기 권한이 없는 곳에서 실행하면 기본 위치를 쓴다)
if (app.isPackaged) {
  const base = process.env.PORTABLE_EXECUTABLE_DIR || path.dirname(process.execPath);
  const dataDir = path.join(base, 'WorksheetData');
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.accessSync(dataDir, fs.constants.W_OK);
    app.setPath('userData', dataDir);
  } catch {
    // 기본 userData 위치 사용
  }
}

const RECENT_LIMIT = 12;
const recentFile = () => path.join(app.getPath('userData'), 'recent.json');

function readRecent() {
  try {
    const list = JSON.parse(fs.readFileSync(recentFile(), 'utf8'));
    return Array.isArray(list) ? list.filter((p) => typeof p === 'string') : [];
  } catch {
    return [];
  }
}

function writeRecent(list) {
  try {
    fs.mkdirSync(path.dirname(recentFile()), { recursive: true });
    fs.writeFileSync(recentFile(), JSON.stringify(list.slice(0, RECENT_LIMIT), null, 2));
  } catch {
    // 최근 목록 저장 실패는 무시한다
  }
}

function addRecent(p) {
  writeRecent([p, ...readRecent().filter((x) => x !== p)]);
}

const FILTERS = [
  { name: 'Worksheet 파일', extensions: ['wsht'] },
  { name: '모든 파일', extensions: ['*'] },
];

const IMAGE_MIME = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml',
};

// ---------- 내 워크시트 모음 ----------
// 새로 만든 워크시트는 이 폴더에 바로 파일로 생기고, 자동으로 저장된다.

const libraryDir = () => path.join(app.getPath('userData'), 'Worksheets');

function ensureLibrary() {
  fs.mkdirSync(libraryDir(), { recursive: true });
  return libraryDir();
}

const inLibrary = (p) => path.resolve(path.dirname(p)) === path.resolve(libraryDir());

/** 파일 이름으로 쓸 수 없는 글자를 바꾸고, 너무 길면 자른다 */
function safeName(title) {
  const t = String(title || '')
    .trim()
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
    .replace(/[. ]+$/, '');
  return (t || '제목 없음').slice(0, 80);
}

/** dir 안에서 겹치지 않는 파일 경로 ("이름.wsht", "이름 2.wsht", ...) */
function uniquePath(dir, base, except) {
  let p = path.join(dir, `${base}.wsht`);
  for (let i = 2; fs.existsSync(p) && p !== except; i++) p = path.join(dir, `${base} ${i}.wsht`);
  return p;
}

/** 시작 화면 카드에 그릴 미리보기 (이미지 같은 큰 데이터는 뺀다) */
function previewOf(content) {
  try {
    const d = JSON.parse(content);
    const boxes = Array.isArray(d.boxes) ? d.boxes : [];
    return {
      title: typeof d.title === 'string' ? d.title : '',
      count: boxes.length,
      boxes: boxes.slice(0, 300).map((b) => ({
        x: b.x, y: b.y, w: b.w, h: b.h, kind: b.kind, shape: b.shape, fill: b.fill, stroke: b.stroke,
        text: typeof b.text === 'string' && b.text.trim() !== '',
      })),
    };
  } catch {
    return null;
  }
}

function listItem(p, external) {
  try {
    const st = fs.statSync(p);
    return { path: p, name: path.basename(p).replace(/\.wsht$/i, ''), mtime: st.mtimeMs, external, preview: previewOf(fs.readFileSync(p, 'utf8')) };
  } catch {
    return null;
  }
}

const isSheet = (p) => typeof p === 'string' && /\.wsht$/i.test(p);

let win = null;
/** 'clean' 저장됨 · 'autosave' 곧 자동 저장됨 · 'unsaved' 저장 안 됨 (닫을 때 물어봄) */
let saveState = 'clean';
let forceClose = false;

function initialFileArg() {
  const args = process.argv.slice(app.isPackaged ? 1 : 2);
  return args.find((a) => /\.wsht$/i.test(a) && fs.existsSync(a)) || null;
}

function readSheet(p) {
  return { path: p, content: fs.readFileSync(p, 'utf8') };
}

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    show: false,
    backgroundColor: '#fbfaf7',
    title: 'Worksheet',
    // 창과 작업 표시줄 아이콘
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  Menu.setApplicationMenu(null);
  win.once('ready-to-show', () => win.show());

  // 외부 링크는 기본 브라우저로 연다
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e) => e.preventDefault());

  // 저장하지 않은 변경 사항이 있으면 닫기 전에 저장하거나 묻는다
  win.on('close', (e) => {
    if (saveState === 'clean' || forceClose) return;
    e.preventDefault();
    if (saveState === 'autosave') {
      // 자동 저장을 기다리는 중이면 바로 저장하고 닫는다
      win.webContents.send('app:save-and-close');
      return;
    }
    const choice = dialog.showMessageBoxSync(win, {
      type: 'question',
      buttons: ['저장', '저장하지 않음', '취소'],
      defaultId: 0,
      cancelId: 2,
      title: 'Worksheet',
      message: '저장하지 않은 변경 사항이 있어요.',
      detail: '닫기 전에 저장할까요?',
    });
    if (choice === 0) win.webContents.send('app:save-and-close');
    else if (choice === 1) {
      forceClose = true;
      win.close();
    }
  });

  if (process.env.VITE_DEV_SERVER_URL) win.loadURL(process.env.VITE_DEV_SERVER_URL);
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}

ipcMain.handle('file:open', async () => {
  const r = await dialog.showOpenDialog(win, { title: '워크시트 열기', properties: ['openFile'], filters: FILTERS });
  if (r.canceled || r.filePaths.length === 0) return null;
  const f = readSheet(r.filePaths[0]);
  addRecent(f.path);
  return f;
});

ipcMain.handle('file:openPath', async (_e, p) => {
  if (typeof p !== 'string' || !fs.existsSync(p)) return null;
  const f = readSheet(p);
  addRecent(p);
  return f;
});

ipcMain.handle('file:save', async (_e, { path: target, content, suggestedName }) => {
  let p = target;
  if (!p) {
    const safe = String(suggestedName || '제목 없음').replace(/[\\/:*?"<>|]/g, '_');
    const r = await dialog.showSaveDialog(win, {
      title: '워크시트 저장',
      defaultPath: path.join(app.getPath('documents'), `${safe}.wsht`),
      filters: FILTERS,
    });
    if (r.canceled || !r.filePath) return null;
    p = r.filePath;
  }
  // 저장 중에 꺼져도 원본이 깨지지 않도록 임시 파일에 쓰고 바꿔 끼운다
  const tmp = `${p}.tmp`;
  fs.writeFileSync(tmp, content, 'utf8');
  fs.renameSync(tmp, p);
  addRecent(p);
  return p;
});

ipcMain.handle('recent:list', async () => {
  const list = readRecent();
  const existing = list.filter((p) => fs.existsSync(p));
  if (existing.length !== list.length) writeRecent(existing);
  return existing;
});

ipcMain.handle('recent:remove', async (_e, p) => {
  writeRecent(readRecent().filter((x) => x !== p));
});

ipcMain.handle('image:open', async () => {
  const r = await dialog.showOpenDialog(win, {
    title: '이미지 고르기',
    properties: ['openFile'],
    filters: [{ name: '이미지', extensions: Object.keys(IMAGE_MIME).map((x) => x.slice(1)) }],
  });
  if (r.canceled || r.filePaths.length === 0) return null;
  const p = r.filePaths[0];
  const mime = IMAGE_MIME[path.extname(p).toLowerCase()] || 'application/octet-stream';
  return `data:${mime};base64,${fs.readFileSync(p).toString('base64')}`;
});

ipcMain.handle('app:initialFile', async () => {
  const p = initialFileArg();
  if (!p) return null;
  addRecent(p);
  return readSheet(p);
});

ipcMain.handle('app:dataDir', async () => app.getPath('userData'));

ipcMain.on('app:setDirty', (_e, value) => {
  saveState = value === 'autosave' || value === 'unsaved' ? value : 'clean';
  if (win) win.setDocumentEdited(saveState !== 'clean');
});

ipcMain.handle('lib:list', async () => {
  const dir = ensureLibrary();
  const items = [];
  for (const f of fs.readdirSync(dir)) {
    if (!isSheet(f)) continue;
    const it = listItem(path.join(dir, f), false);
    if (it) items.push(it);
  }
  // 모음 밖에서 연 파일도 최근 목록에 있으면 함께 보여 준다
  for (const p of readRecent()) {
    if (inLibrary(p) || !fs.existsSync(p)) continue;
    const it = listItem(p, true);
    if (it) items.push(it);
  }
  return items.sort((a, b) => b.mtime - a.mtime);
});

ipcMain.handle('lib:create', async (_e, title, content) => {
  const p = uniquePath(ensureLibrary(), safeName(title));
  fs.writeFileSync(p, String(content), 'utf8');
  addRecent(p);
  return p;
});

ipcMain.handle('lib:rename', async (_e, p, title) => {
  // 제목을 바꾸면 같은 폴더 안에서 파일 이름도 바꾼다
  if (!isSheet(p) || !fs.existsSync(p)) return p;
  const next = uniquePath(path.dirname(p), safeName(title), p);
  if (next === p) return p;
  fs.renameSync(p, next);
  writeRecent(readRecent().map((x) => (x === p ? next : x)));
  return next;
});

ipcMain.handle('lib:duplicate', async (_e, p) => {
  if (!isSheet(p) || !fs.existsSync(p)) return null;
  const content = fs.readFileSync(p, 'utf8');
  const base = path.basename(p).replace(/\.wsht$/i, '');
  const next = uniquePath(ensureLibrary(), safeName(`${base} 사본`));
  fs.writeFileSync(next, content, 'utf8');
  return next;
});

ipcMain.handle('lib:trash', async (_e, p) => {
  if (!isSheet(p) || !fs.existsSync(p)) return false;
  try {
    await shell.trashItem(p);
  } catch {
    return false;
  }
  writeRecent(readRecent().filter((x) => x !== p));
  return true;
});

ipcMain.handle('lib:reveal', async (_e, p) => {
  if (isSheet(p) && fs.existsSync(p)) shell.showItemInFolder(p);
  else shell.openPath(ensureLibrary());
});

// ---------- 내보내기 (PNG / PDF) ----------

const EXPORT_FILTERS = {
  png: [{ name: 'PNG 그림', extensions: ['png'] }],
  pdf: [{ name: 'PDF 문서', extensions: ['pdf'] }],
};

async function askExportPath(name, ext) {
  const r = await dialog.showSaveDialog(win, {
    title: ext === 'pdf' ? 'PDF 로 내보내기' : 'PNG 그림으로 내보내기',
    defaultPath: path.join(app.getPath('documents'), `${safeName(name)}.${ext}`),
    filters: EXPORT_FILTERS[ext],
  });
  return r.canceled || !r.filePath ? null : r.filePath;
}

ipcMain.handle('export:png', async (_e, name, bytes) => {
  const target = await askExportPath(name, 'png');
  if (!target) return null;
  fs.writeFileSync(target, Buffer.from(bytes));
  return target;
});

// 화면에 띄운 내보내기 무대(print 용 CSS 로 그것만 보이게 한 상태)를 한 장짜리 PDF 로 찍는다
ipcMain.handle('export:pdf', async (e, name, size) => {
  const target = await askExportPath(name, 'pdf');
  if (!target) return null;
  const data = await e.sender.printToPDF({
    printBackground: true,
    margins: { marginType: 'none' },
    pageSize: { width: size.width / 96, height: size.height / 96 },
  });
  fs.writeFileSync(target, data);
  return target;
});

ipcMain.handle('export:show', async (_e, p) => {
  if (typeof p === 'string' && fs.existsSync(p)) shell.showItemInFolder(p);
});

ipcMain.on('app:setTitle', (_e, title) => {
  if (win && typeof title === 'string') win.setTitle(title);
});

// 테마에 맞춰 창 바탕색과 제목 표시줄/대화상자 색을 바꾼다
ipcMain.on('app:setTheme', (_e, theme) => {
  const dark = theme === 'dark';
  nativeTheme.themeSource = dark ? 'dark' : 'light';
  if (win) win.setBackgroundColor(dark ? '#26292e' : '#fbfaf7');
});

ipcMain.on('app:forceClose', () => {
  forceClose = true;
  if (win) win.close();
});

// 같은 프로그램을 두 번 실행하면 기존 창을 앞으로 가져온다
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
  app.whenReady().then(createWindow);
  app.on('window-all-closed', () => app.quit());
}
