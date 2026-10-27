// Electron 메인 프로세스와의 연결. 브라우저에서 열었을 때(개발/테스트)는 localStorage 로 흉내 낸다.

export interface FileResult {
  path: string;
  content: string;
}

/** 시작 화면 카드에 그리는 미리보기 */
export interface PreviewBox {
  x: number;
  y: number;
  w: number;
  h: number;
  kind: string;
  shape: string;
  fill: string;
  stroke: string;
  text: boolean;
}

export interface LibraryItem {
  path: string;
  name: string;
  mtime: number;
  /** 모음 폴더 밖에 있는 파일 */
  external: boolean;
  preview: { title: string; count: number; boxes: PreviewBox[] } | null;
}

/** 'clean' 저장됨 · 'autosave' 곧 자동 저장됨 · 'unsaved' 저장 안 됨 */
export type DirtyState = 'clean' | 'autosave' | 'unsaved';

export interface DesktopApi {
  openFile(): Promise<FileResult | null>;
  openPath(path: string): Promise<FileResult | null>;
  /** path 가 없으면 저장 위치를 묻는다. 저장한 경로를 돌려준다 */
  save(path: string | null, content: string, suggestedName: string): Promise<string | null>;
  recent(): Promise<string[]>;
  removeRecent(path: string): Promise<void>;
  openImage(): Promise<string | null>;
  setDirty(state: DirtyState): void;
  setTitle(title: string): void;
  setTheme(theme: 'light' | 'dark'): void;
  forceClose(): void;
  onSaveAndClose(cb: () => void): void;
  initialFile(): Promise<FileResult | null>;
  /** 설정과 최근 파일 목록이 저장되는 폴더 */
  dataDir(): Promise<string | null>;
  libList(): Promise<LibraryItem[]>;
  libCreate(title: string, content: string): Promise<string>;
  /** 모음 안의 파일이면 이름을 바꾸고 새 경로를 돌려준다 */
  libRename(path: string, title: string): Promise<string>;
  libDuplicate(path: string): Promise<string | null>;
  libTrash(path: string): Promise<boolean>;
  libReveal(path: string | null): Promise<void>;
  /** PNG 를 저장할 곳을 묻고 저장한다 */
  exportPng(name: string, bytes: Uint8Array): Promise<string | null>;
  /** 지금 화면에 띄운 내보내기 무대를 PDF 한 장으로 찍어 저장한다 (크기는 px) */
  exportPdf(name: string, size: { width: number; height: number }): Promise<string | null>;
  showExported(path: string): Promise<void>;
}

declare global {
  interface Window {
    api?: DesktopApi;
  }
}

function pickFile(accept: string, asDataUrl: boolean): Promise<{ name: string; data: string } | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => {
      const f = input.files?.[0];
      if (!f) return resolve(null);
      const reader = new FileReader();
      reader.onload = () => resolve({ name: f.name, data: String(reader.result) });
      reader.onerror = () => resolve(null);
      if (asDataUrl) reader.readAsDataURL(f);
      else reader.readAsText(f);
    };
    input.click();
  });
}

// ---------- 브라우저용 대체 모음 (localStorage) ----------

const LIB_KEY = 'worksheet-library-v1';
type LocalLib = Record<string, { content: string; mtime: number }>;

function readLib(): LocalLib {
  try {
    return JSON.parse(localStorage.getItem(LIB_KEY) ?? '{}') as LocalLib;
  } catch {
    return {};
  }
}

function writeLib(lib: LocalLib) {
  try {
    localStorage.setItem(LIB_KEY, JSON.stringify(lib));
  } catch {
    // 저장 공간이 꽉 찼으면 이번 실행 동안만 유지된다
  }
}

const safeName = (t: string) => (t.trim().replace(/[\\/:*?"<>|]/g, '_') || '제목 없음').slice(0, 80);

function uniqueLocal(lib: LocalLib, base: string, except?: string) {
  let p = `local/${base}.wsht`;
  for (let i = 2; lib[p] && p !== except; i++) p = `local/${base} ${i}.wsht`;
  return p;
}

export function previewOf(content: string): LibraryItem['preview'] {
  try {
    const d = JSON.parse(content) as { title?: string; boxes?: Record<string, unknown>[] };
    const boxes = Array.isArray(d.boxes) ? d.boxes : [];
    return {
      title: typeof d.title === 'string' ? d.title : '',
      count: boxes.length,
      boxes: boxes.slice(0, 300).map((b) => ({
        x: Number(b.x),
        y: Number(b.y),
        w: Number(b.w),
        h: Number(b.h),
        kind: String(b.kind),
        shape: String(b.shape),
        fill: String(b.fill),
        stroke: String(b.stroke),
        text: typeof b.text === 'string' && b.text.trim() !== '',
      })),
    };
  } catch {
    return null;
  }
}

const browserApi: DesktopApi = {
  async openFile() {
    const f = await pickFile('.wsht,.json', false);
    if (!f) return null;
    // 브라우저에서는 연 파일을 모음에 복사해서 계속 자동 저장되게 한다
    const lib = readLib();
    const p = uniqueLocal(lib, safeName(fileNameOf(f.name)));
    lib[p] = { content: f.data, mtime: Date.now() };
    writeLib(lib);
    return { path: p, content: f.data };
  },
  async openPath(path) {
    const item = readLib()[path];
    return item ? { path, content: item.content } : null;
  },
  async save(path, content, suggestedName) {
    if (path && path.startsWith('local/')) {
      const lib = readLib();
      lib[path] = { content, mtime: Date.now() };
      writeLib(lib);
      return path;
    }
    // 다른 이름으로 저장: 파일로 내려받는다
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
    a.download = `${safeName(suggestedName)}.wsht`;
    a.click();
    URL.revokeObjectURL(a.href);
    return path;
  },
  async recent() {
    return [];
  },
  async removeRecent() {},
  async openImage() {
    const f = await pickFile('image/*', true);
    return f ? f.data : null;
  },
  setDirty() {},
  setTitle(title) {
    document.title = title;
  },
  setTheme() {},
  forceClose() {},
  onSaveAndClose() {},
  async initialFile() {
    return null;
  },
  async dataDir() {
    return null;
  },
  async libList() {
    return Object.entries(readLib())
      .map(([path, v]) => ({ path, name: fileNameOf(path), mtime: v.mtime, external: false, preview: previewOf(v.content) }))
      .sort((a, b) => b.mtime - a.mtime);
  },
  async libCreate(title, content) {
    const lib = readLib();
    const p = uniqueLocal(lib, safeName(title));
    lib[p] = { content, mtime: Date.now() };
    writeLib(lib);
    return p;
  },
  async libRename(path, title) {
    const lib = readLib();
    if (!lib[path]) return path;
    const next = uniqueLocal(lib, safeName(title), path);
    if (next === path) return path;
    lib[next] = lib[path];
    delete lib[path];
    writeLib(lib);
    return next;
  },
  async libDuplicate(path) {
    const lib = readLib();
    if (!lib[path]) return null;
    const next = uniqueLocal(lib, safeName(`${fileNameOf(path)} 사본`));
    lib[next] = { content: lib[path].content, mtime: Date.now() };
    writeLib(lib);
    return next;
  },
  async libTrash(path) {
    const lib = readLib();
    if (!lib[path]) return false;
    delete lib[path];
    writeLib(lib);
    return true;
  },
  async libReveal() {},
  async exportPng(name, bytes) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([bytes], { type: 'image/png' }));
    a.download = `${safeName(name)}.png`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    return a.download;
  },
  async exportPdf() {
    // 브라우저에서는 인쇄 창에서 'PDF 로 저장' 을 고른다
    window.print();
    return null;
  },
  async showExported() {},
};

export const platform: DesktopApi = window.api ?? browserApi;
export const isDesktop = !!window.api;

export function fileNameOf(path: string): string {
  const base = path.split(/[\\/]/).pop() ?? path;
  return base.replace(/\.(wsht|json)$/i, '');
}

export function readImageFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

const MAX_IMAGE = 1600;

/**
 * 넣는 이미지가 너무 크면 긴 변을 1600px 로 줄여서 파일이 커지지 않게 한다.
 * 사진(JPEG)은 JPEG 로, 나머지는 투명도를 지키는 WebP 로 다시 저장한다. SVG 와 GIF 는 그대로 둔다.
 */
export function shrinkImage(dataUrl: string): Promise<string> {
  const mime = /^data:([^;,]+)/.exec(dataUrl)?.[1] ?? '';
  if (mime === 'image/svg+xml' || mime === 'image/gif') return Promise.resolve(dataUrl);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, MAX_IMAGE / Math.max(img.naturalWidth, img.naturalHeight, 1));
      // 작고 가벼운 이미지는 손대지 않는다
      if (scale === 1 && dataUrl.length < 700_000) return resolve(dataUrl);
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) return resolve(dataUrl);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const out = mime === 'image/jpeg' ? canvas.toDataURL('image/jpeg', 0.88) : canvas.toDataURL('image/webp', 0.9);
      resolve(out.length < dataUrl.length ? out : dataUrl);
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}
