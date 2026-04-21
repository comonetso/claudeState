const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('claudeState', {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (payload) => ipcRenderer.invoke('settings:save', payload),
  refreshUsage: () => ipcRenderer.invoke('usage:refresh'),
  openSettings: () => ipcRenderer.invoke('window:open-settings'),
  quit: () => ipcRenderer.invoke('app:quit'),
  hideWidget: () => ipcRenderer.invoke('widget:hide'),
  showWidgetContextMenu: () => ipcRenderer.invoke('widget:context-menu'),
  onUsageUpdate: (handler) => {
    const listener = (_event, payload) => handler(payload);
    ipcRenderer.on('usage:update', listener);
    return () => ipcRenderer.removeListener('usage:update', listener);
  }
});
