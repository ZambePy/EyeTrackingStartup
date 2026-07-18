"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld('irisflow', {
    saveProfile: (id, data) => electron_1.ipcRenderer.invoke('save-profile', id, data),
    loadProfile: (id) => electron_1.ipcRenderer.invoke('load-profile', id),
    savePhrases: (data) => electron_1.ipcRenderer.invoke('save-phrases', data),
    loadPhrases: () => electron_1.ipcRenderer.invoke('load-phrases'),
    exportLog: (data) => electron_1.ipcRenderer.invoke('export-log', data),
    getAppVersion: () => electron_1.ipcRenderer.invoke('get-app-version'),
});
electron_1.contextBridge.exposeInMainWorld('sidecar', {
    getStatus: () => electron_1.ipcRenderer.invoke('sidecar-get-status'),
    onStatusChange: (cb) => {
        const listener = (_event, status) => cb(status);
        electron_1.ipcRenderer.on('sidecar-status-changed', listener);
        return () => electron_1.ipcRenderer.removeListener('sidecar-status-changed', listener);
    },
});
