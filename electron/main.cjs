// Electron 메인 프로세스: 창을 만들고, 파일 열기/저장 대화상자와 최근 파일 목록을 맡는다.

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

let win = null;
let dirty = false;
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

  // 저장하지 않은 변경 사항이 있으면 닫기 전에 묻는다
  win.on('close', (e) => {
    if (!dirty || forceClose) return;
    e.preventDefault();
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

ipcMain.on('app:setDirty', (_e, value) => {
  dirty = !!value;
  if (win) win.setDocumentEdited(dirty);
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
