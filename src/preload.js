const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('cloudState', {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (payload) => ipcRenderer.invoke('settings:save', payload),
  refreshUsage: () => ipcRenderer.invoke('usage:refresh'),
  openSettings: () => ipcRenderer.invoke('window:open-settings'),
  quit: () => ipcRenderer.invoke('app:quit'),
  onUsageUpdate: (handler) => {
    const listener = (_event, payload) => handler(payload);
    ipcRenderer.on('usage:update', listener);
    return () => ipcRenderer.removeListener('usage:update', listener);
  }
});
