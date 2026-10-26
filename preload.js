const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('whiteNoise', {
  trackMenu: id => ipcRenderer.invoke('track-menu', id),
  renameTrack: (id, title) => ipcRenderer.invoke('rename-track', id, title),
  deleteTrack: (id, library) => ipcRenderer.invoke('delete-track', id, library),
  getTracks: library => ipcRenderer.invoke('get-tracks', library),
  download: (url, library) => ipcRenderer.invoke('download-youtube', url, library),
  resize: expanded => ipcRenderer.invoke('resize-window', Boolean(expanded)),
  onProgress: callback => { const listener = (_event, status) => callback(status); ipcRenderer.on('download-progress', listener); return () => ipcRenderer.removeListener('download-progress', listener); }
});
