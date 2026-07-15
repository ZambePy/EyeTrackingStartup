import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('irisflow', {
  saveProfile: (id: string, data: unknown) =>
    ipcRenderer.invoke('save-profile', id, data),
  loadProfile: (id: string) =>
    ipcRenderer.invoke('load-profile', id),
  savePhrases: (data: unknown) =>
    ipcRenderer.invoke('save-phrases', data),
  loadPhrases: () =>
    ipcRenderer.invoke('load-phrases'),
  exportLog: (data: string) =>
    ipcRenderer.invoke('export-log', data),
  getAppVersion: () =>
    ipcRenderer.invoke('get-app-version'),
})
