"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const sidecar_1 = require("./sidecar");
// electron-updater é opcional — instalado separadamente após npm install
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let autoUpdater = null;
try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    autoUpdater = require('electron-updater').autoUpdater;
}
catch {
    console.info('[AutoUpdater] electron-updater não instalado — atualizações desativadas');
}
// Registrar esquema personalizado ANTES de app.ready
// Isso permite fetch() para irisflow:// — crítico para MediaPipe WASM offline
electron_1.protocol.registerSchemesAsPrivileged([
    {
        scheme: 'irisflow',
        privileges: { secure: true, standard: true, supportFetchAPI: true, stream: true },
    },
]);
function getDistPath() {
    if (electron_1.app.isPackaged) {
        return path_1.default.join(process.resourcesPath, 'app.asar.unpacked', 'dist');
    }
    return path_1.default.join(__dirname, '..', 'dist');
}
function createWindow() {
    const win = new electron_1.BrowserWindow({
        width: 1280,
        height: 800,
        minWidth: 1280,
        minHeight: 800,
        frame: false,
        backgroundColor: '#0D0D0D',
        webPreferences: {
            preload: path_1.default.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });
    const devUrl = process.env['VITE_DEV_SERVER_URL'];
    if (devUrl) {
        win.loadURL(devUrl);
        win.webContents.openDevTools();
    }
    else {
        win.loadFile(path_1.default.join(electron_1.app.getAppPath(), 'dist', 'index.html'));
    }
    return win;
}
// Mantém referência da janela principal para enviar eventos de sidecar
let mainWindow = null;
electron_1.app.whenReady().then(() => {
    electron_1.protocol.handle('irisflow', async (request) => {
        const url = new URL(request.url);
        const parts = url.pathname.split('/').filter(Boolean);
        const filePath = path_1.default.join(getDistPath(), url.hostname, ...parts);
        const fileUrl = `file://${filePath.replace(/\\/g, '/')}`;
        return electron_1.net.fetch(fileUrl);
    });
    mainWindow = createWindow();
    // Inicia o sidecar e empurra atualizações de status para o renderer
    sidecar_1.sidecarManager.on('status', (status) => {
        mainWindow?.webContents.send('sidecar-status-changed', status);
        console.log(`[sidecar] status → ${status}`);
        // Quando pronto, envia dimensões reais da tela
        if (status === 'ready') {
            const { width, height } = electron_1.screen.getPrimaryDisplay().size;
            sidecar_1.sidecarManager.sendScreenSize(width, height);
            console.log(`[sidecar] screen size sent: ${width}×${height}`);
        }
    });
    sidecar_1.sidecarManager.start();
    electron_1.app.on('activate', () => {
        if (electron_1.BrowserWindow.getAllWindows().length === 0) {
            mainWindow = createWindow();
        }
    });
});
// Mata o sidecar antes de fechar o app — nenhum processo Python órfão
electron_1.app.on('before-quit', () => {
    sidecar_1.sidecarManager.stop();
});
electron_1.app.on('window-all-closed', () => {
    if (process.platform !== 'darwin')
        electron_1.app.quit();
});
// ── IPC Handlers ──────────────────────────────────────────────────────────────
const userDataPath = electron_1.app.getPath('userData');
const profilesDir = path_1.default.join(userDataPath, 'profiles');
const phrasesFile = path_1.default.join(userDataPath, 'phrases.json');
function ensureDir(dir) {
    if (!fs_1.default.existsSync(dir))
        fs_1.default.mkdirSync(dir, { recursive: true });
}
electron_1.ipcMain.handle('save-profile', (_event, id, data) => {
    const profileDir = path_1.default.join(profilesDir, id);
    ensureDir(profileDir);
    fs_1.default.writeFileSync(path_1.default.join(profileDir, 'profile.json'), JSON.stringify(data, null, 2), 'utf-8');
});
electron_1.ipcMain.handle('load-profile', (_event, id) => {
    const file = path_1.default.join(profilesDir, id, 'profile.json');
    if (!fs_1.default.existsSync(file))
        return null;
    return JSON.parse(fs_1.default.readFileSync(file, 'utf-8'));
});
electron_1.ipcMain.handle('save-phrases', (_event, data) => {
    ensureDir(userDataPath);
    fs_1.default.writeFileSync(phrasesFile, JSON.stringify(data, null, 2), 'utf-8');
});
electron_1.ipcMain.handle('load-phrases', () => {
    if (!fs_1.default.existsSync(phrasesFile))
        return null;
    return JSON.parse(fs_1.default.readFileSync(phrasesFile, 'utf-8'));
});
electron_1.ipcMain.handle('export-log', (_event, data) => {
    const logsDir = path_1.default.join(userDataPath, 'logs');
    ensureDir(logsDir);
    const filename = `session-${Date.now()}.json`;
    fs_1.default.writeFileSync(path_1.default.join(logsDir, filename), data, 'utf-8');
    return filename;
});
electron_1.ipcMain.handle('get-app-version', () => electron_1.app.getVersion());
electron_1.ipcMain.handle('sidecar-get-status', () => sidecar_1.sidecarManager.getStatus());
// ── Auto-updater (desativado por padrão — ativado pelo usuário em Configurações) ─
if (autoUpdater) {
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false;
    autoUpdater.on('update-available', (info) => {
        console.info('[AutoUpdater] Atualização disponível:', info.version);
    });
    autoUpdater.on('error', (err) => {
        console.warn('[AutoUpdater] Erro:', err.message);
    });
}
// O renderer envia este evento quando o usuário ativa atualizações automáticas
electron_1.ipcMain.on('set-auto-updater', (_event, enabled) => {
    if (enabled && electron_1.app.isPackaged && autoUpdater) {
        autoUpdater.checkForUpdates().catch((err) => {
            console.warn('[AutoUpdater] Falha ao verificar atualizações:', err);
        });
    }
});
