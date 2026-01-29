const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('hyportal', {
  getTheme: () => ipcRenderer.invoke('hyportal:getTheme'),
  loadServers: () => ipcRenderer.invoke('hyportal:loadServers'),
  saveServers: (servers) => ipcRenderer.invoke('hyportal:saveServers', servers),
  getUserDataPath: () => ipcRenderer.invoke('hyportal:getUserDataPath'),
  getPaths: () => ipcRenderer.invoke('hyportal:getPaths'),
  getAutostart: () => ipcRenderer.invoke('hyportal:getAutostart'),
  setAutostart: (enabled) => ipcRenderer.invoke('hyportal:setAutostart', enabled),
  getSystemMemory: () => ipcRenderer.invoke('hyportal:getSystemMemory'),
  checkJavaRuntime: () => ipcRenderer.invoke('hyportal:checkJavaRuntime'),
  openExternal: (url) => ipcRenderer.invoke('hyportal:openExternal', url),
  selectDirectory: (initialPath) => ipcRenderer.invoke('hyportal:selectDirectory', initialPath),
  generateServerPath: (name) => ipcRenderer.invoke('hyportal:generateServerPath', name),
  isDirectoryEmpty: (payload) => ipcRenderer.invoke('hyportal:isDirectoryEmpty', payload),
  listVersions: () => ipcRenderer.invoke('hyportal:listVersions'),
  checkVersions: (payload) => ipcRenderer.invoke('hyportal:checkVersions', payload),
  getCachedVersions: () => ipcRenderer.invoke('hyportal:getCachedVersions'),
  downloadVersion: (payload) => ipcRenderer.invoke('hyportal:downloadVersion', payload),
  createServerFromVersion: (payload) => ipcRenderer.invoke('hyportal:createServerFromVersion', payload),
  deleteServerDirectory: (payload) => ipcRenderer.invoke('hyportal:deleteServerDirectory', payload),
  deleteVersion: (payload) => ipcRenderer.invoke('hyportal:deleteVersion', payload),
  checkDownloader: () => ipcRenderer.invoke('hyportal:checkDownloader'),
  downloadDownloader: () => ipcRenderer.invoke('hyportal:downloadDownloader'),
  cancelDownloader: () => ipcRenderer.invoke('hyportal:cancelDownloader'),
  authenticateDownloader: () => ipcRenderer.invoke('hyportal:authenticateDownloader'),
  cancelDownloaderProcess: () => ipcRenderer.invoke('hyportal:cancelDownloaderProcess'),
  loadServerSettings: () => ipcRenderer.invoke('hyportal:loadServerSettings'),
  saveServerSettings: (settings) => ipcRenderer.invoke('hyportal:saveServerSettings', settings),
  markWelcomeSeen: () => ipcRenderer.invoke('hyportal:markWelcomeSeen'),
  getRunningServers: () => ipcRenderer.invoke('hyportal:getRunningServers'),
  stopAllServers: () => ipcRenderer.invoke('hyportal:stopAllServers'),
  confirmAppClose: () => ipcRenderer.invoke('hyportal:confirmAppClose'),
  startServer: (payload) => ipcRenderer.invoke('hyportal:startServer', payload),
  stopServer: (payload) => ipcRenderer.invoke('hyportal:stopServer', payload),
  writeServerInput: (payload) => ipcRenderer.invoke('hyportal:writeServerInput', payload),
  onAuthUrl: (callback) => {
    const listener = (_event, payload) => callback?.(payload);
    ipcRenderer.on('hyportal:auth-url', listener);
    return () => ipcRenderer.removeListener('hyportal:auth-url', listener);
  },
  onDownloadProgress: (callback) => {
    const listener = (_event, payload) => callback?.(payload);
    ipcRenderer.on('hyportal:download-progress', listener);
    return () => ipcRenderer.removeListener('hyportal:download-progress', listener);
  },
  onVersionProgress: (callback) => {
    const listener = (_event, payload) => callback?.(payload);
    ipcRenderer.on('hyportal:version-progress', listener);
    return () => ipcRenderer.removeListener('hyportal:version-progress', listener);
  },
  onServerStatus: (callback) => {
    const listener = (_event, payload) => callback?.(payload);
    ipcRenderer.on('hyportal:server-status', listener);
    return () => ipcRenderer.removeListener('hyportal:server-status', listener);
  },
  onServerOutput: (callback) => {
    const listener = (_event, payload) => callback?.(payload);
    ipcRenderer.on('hyportal:server-output', listener);
    return () => ipcRenderer.removeListener('hyportal:server-output', listener);
  },
  onServerAutoInput: (callback) => {
    const listener = (_event, payload) => callback?.(payload);
    ipcRenderer.on('hyportal:server-auto-input', listener);
    return () => ipcRenderer.removeListener('hyportal:server-auto-input', listener);
  },
  onAppCloseRequested: (callback) => {
    const listener = () => callback?.();
    ipcRenderer.on('hyportal:app-close-requested', listener);
    return () => ipcRenderer.removeListener('hyportal:app-close-requested', listener);
  }
});
