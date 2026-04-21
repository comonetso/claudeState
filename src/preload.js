const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('claudeState', {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (payload) => ipcRenderer.invoke('settings:save', payload),
  refreshUsage: () => ipcRenderer.invoke('usage:refresh'),
  openSettings: () => ipcRenderer.invoke('window:open-settings'),
  quit: () => ipcRenderer.invoke('app:quit'),
  hideWidget: () => ipcRenderer.invoke('widget:hide'),
  showWidgetContextMenu: () => ipcRenderer.invoke('widget:context-menu'),
  moveWidget: (dx, dy) => ipcRenderer.invoke('widget:move', dx, dy),
  widgetDragStart: () => ipcRenderer.invoke('widget:drag-start'),
  setWidgetPosition: (x, y) => ipcRenderer.invoke('widget:set-position', x, y),
  onUsageUpdate: (handler) => {
    const listener = (_event, payload) => handler(payload);
    ipcRenderer.on('usage:update', listener);
    return () => ipcRenderer.removeListener('usage:update', listener);
  }
});
