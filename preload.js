const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('whiteNoise', {
  trackMenu: id => ipcRenderer.invoke('track-menu', id),
  renameTrack: (id, title) => ipcRenderer.invoke('rename-track', id, title),
  deleteTrack: id => ipcRenderer.invoke('delete-track', id),
  getTracks: () => ipcRenderer.invoke('get-tracks'),
  download: url => ipcRenderer.invoke('download-youtube', url),
  resize: expanded => ipcRenderer.invoke('resize-window', Boolean(expanded)),
  onProgress: callback => { const listener = (_event, status) => callback(status); ipcRenderer.on('download-progress', listener); return () => ipcRenderer.removeListener('download-progress', listener); }
});
