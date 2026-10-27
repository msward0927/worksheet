// 렌더러(화면)에 안전한 API 만 노출한다. src/platform.ts 의 DesktopApi 와 맞춰야 한다.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  openFile: () => ipcRenderer.invoke('file:open'),
  openPath: (p) => ipcRenderer.invoke('file:openPath', p),
  save: (path, content, suggestedName) => ipcRenderer.invoke('file:save', { path, content, suggestedName }),
  recent: () => ipcRenderer.invoke('recent:list'),
  removeRecent: (p) => ipcRenderer.invoke('recent:remove', p),
  openImage: () => ipcRenderer.invoke('image:open'),
  setDirty: (dirty) => ipcRenderer.send('app:setDirty', dirty),
  setTitle: (title) => ipcRenderer.send('app:setTitle', title),
  setTheme: (theme) => ipcRenderer.send('app:setTheme', theme),
  forceClose: () => ipcRenderer.send('app:forceClose'),
  onSaveAndClose: (cb) => {
    ipcRenderer.removeAllListeners('app:save-and-close');
    ipcRenderer.on('app:save-and-close', () => cb());
  },
  initialFile: () => ipcRenderer.invoke('app:initialFile'),
  dataDir: () => ipcRenderer.invoke('app:dataDir'),
  libList: () => ipcRenderer.invoke('lib:list'),
  libCreate: (title, content) => ipcRenderer.invoke('lib:create', title, content),
  libRename: (p, title) => ipcRenderer.invoke('lib:rename', p, title),
  libDuplicate: (p) => ipcRenderer.invoke('lib:duplicate', p),
  libTrash: (p) => ipcRenderer.invoke('lib:trash', p),
  libReveal: (p) => ipcRenderer.invoke('lib:reveal', p),
  exportPng: (name, bytes) => ipcRenderer.invoke('export:png', name, bytes),
  exportPdf: (name, size) => ipcRenderer.invoke('export:pdf', name, size),
  showExported: (p) => ipcRenderer.invoke('export:show', p),
});
