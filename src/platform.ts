// Electron 메인 프로세스와의 연결. 브라우저에서 열었을 때(개발/테스트)는 간단한 대체 동작을 쓴다.

export interface FileResult {
  path: string;
  content: string;
}

export interface DesktopApi {
  openFile(): Promise<FileResult | null>;
  openPath(path: string): Promise<FileResult | null>;
  save(path: string | null, content: string, suggestedName: string): Promise<string | null>;
  recent(): Promise<string[]>;
  removeRecent(path: string): Promise<void>;
  openImage(): Promise<string | null>;
  setDirty(dirty: boolean): void;
  setTitle(title: string): void;
  setTheme(theme: 'light' | 'dark'): void;
  forceClose(): void;
  onSaveAndClose(cb: () => void): void;
  initialFile(): Promise<FileResult | null>;
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

const browserApi: DesktopApi = {
  async openFile() {
    const f = await pickFile('.wsht,.json', false);
    return f ? { path: f.name, content: f.data } : null;
  },
  async openPath() {
    return null;
  },
  async save(path, content, suggestedName) {
    const name = path ?? `${suggestedName}.wsht`;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
    return name;
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
