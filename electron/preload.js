const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  loadData: (table) => ipcRenderer.invoke('load-data', table),
  saveData: (table, data) => ipcRenderer.invoke('save-data', table, data),
  onFileWatch: (callback) => ipcRenderer.on('file-detected', (_event, value) => callback(value)),
});