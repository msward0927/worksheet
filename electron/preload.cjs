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
  forceClose: () => ipcRenderer.send('app:forceClose'),
  onSaveAndClose: (cb) => {
    ipcRenderer.removeAllListeners('app:save-and-close');
    ipcRenderer.on('app:save-and-close', () => cb());
  },
  initialFile: () => ipcRenderer.invoke('app:initialFile'),
});
