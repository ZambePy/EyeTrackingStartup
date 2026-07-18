import { app, BrowserWindow, ipcMain, protocol, net, screen } from 'electron'
import path from 'path'
import fs from 'fs'
import { sidecarManager } from './sidecar'

// electron-updater é opcional — instalado separadamente após npm install
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let autoUpdater: any = null
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  autoUpdater = require('electron-updater').autoUpdater
} catch {
  console.info('[AutoUpdater] electron-updater não instalado — atualizações desativadas')
}

// Registrar esquema personalizado ANTES de app.ready
// Isso permite fetch() para irisflow:// — crítico para MediaPipe WASM offline
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'irisflow',
    privileges: { secure: true, standard: true, supportFetchAPI: true, stream: true },
  },
])

function getDistPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'app.asar.unpacked', 'dist')
  }
  return path.join(__dirname, '..', 'dist')
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1280,
    minHeight: 800,
    frame: false,
    backgroundColor: '#0D0D0D',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  const devUrl = process.env['VITE_DEV_SERVER_URL']
  if (devUrl) {
    win.loadURL(devUrl)
    win.webContents.openDevTools()
  } else {
    win.loadFile(path.join(app.getAppPath(), 'dist', 'index.html'))
  }
  return win
}

// Mantém referência da janela principal para enviar eventos de sidecar
let mainWindow: BrowserWindow | null = null

app.whenReady().then(() => {
  protocol.handle('irisflow', async (request) => {
    const url = new URL(request.url)
    const parts = url.pathname.split('/').filter(Boolean)
    const filePath = path.join(getDistPath(), url.hostname, ...parts)
    const fileUrl = `file://${filePath.replace(/\\/g, '/')}`
    return net.fetch(fileUrl)
  })

  mainWindow = createWindow()

  // Inicia o sidecar e empurra atualizações de status para o renderer
  sidecarManager.on('status', (status: string) => {
    mainWindow?.webContents.send('sidecar-status-changed', status)
    console.log(`[sidecar] status → ${status}`)

    // Quando pronto, envia dimensões reais da tela
    if (status === 'ready') {
      const { width, height } = screen.getPrimaryDisplay().size
      sidecarManager.sendScreenSize(width, height)
      console.log(`[sidecar] screen size sent: ${width}×${height}`)
    }
  })

  sidecarManager.start()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow()
    }
  })
})

// Mata o sidecar antes de fechar o app — nenhum processo Python órfão
app.on('before-quit', () => {
  sidecarManager.stop()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// ── IPC Handlers ──────────────────────────────────────────────────────────────

const userDataPath = app.getPath('userData')
const profilesDir = path.join(userDataPath, 'profiles')
const phrasesFile = path.join(userDataPath, 'phrases.json')

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

ipcMain.handle('save-profile', (_event, id: string, data: unknown) => {
  const profileDir = path.join(profilesDir, id)
  ensureDir(profileDir)
  fs.writeFileSync(
    path.join(profileDir, 'profile.json'),
    JSON.stringify(data, null, 2),
    'utf-8',
  )
})

ipcMain.handle('load-profile', (_event, id: string) => {
  const file = path.join(profilesDir, id, 'profile.json')
  if (!fs.existsSync(file)) return null
  return JSON.parse(fs.readFileSync(file, 'utf-8')) as unknown
})

ipcMain.handle('save-phrases', (_event, data: unknown) => {
  ensureDir(userDataPath)
  fs.writeFileSync(phrasesFile, JSON.stringify(data, null, 2), 'utf-8')
})

ipcMain.handle('load-phrases', () => {
  if (!fs.existsSync(phrasesFile)) return null
  return JSON.parse(fs.readFileSync(phrasesFile, 'utf-8')) as unknown
})

ipcMain.handle('export-log', (_event, data: string) => {
  const logsDir = path.join(userDataPath, 'logs')
  ensureDir(logsDir)
  const filename = `session-${Date.now()}.json`
  fs.writeFileSync(path.join(logsDir, filename), data, 'utf-8')
  return filename
})

ipcMain.handle('get-app-version', () => app.getVersion())

ipcMain.handle('sidecar-get-status', () => sidecarManager.getStatus())

// ── Auto-updater (desativado por padrão — ativado pelo usuário em Configurações) ─
if (autoUpdater) {
  autoUpdater.autoDownload         = false
  autoUpdater.autoInstallOnAppQuit = false

  autoUpdater.on('update-available', (info: { version: string }) => {
    console.info('[AutoUpdater] Atualização disponível:', info.version)
  })
  autoUpdater.on('error', (err: Error) => {
    console.warn('[AutoUpdater] Erro:', err.message)
  })
}

// O renderer envia este evento quando o usuário ativa atualizações automáticas
ipcMain.on('set-auto-updater', (_event, enabled: boolean) => {
  if (enabled && app.isPackaged && autoUpdater) {
    autoUpdater.checkForUpdates().catch((err: Error) => {
      console.warn('[AutoUpdater] Falha ao verificar atualizações:', err)
    })
  }
})
