import { app, BrowserWindow, ipcMain, protocol, net } from 'electron'
import path from 'path'
import fs from 'fs'

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

function createWindow(): void {
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
}

app.whenReady().then(() => {
  // Protocolo irisflow:// serve arquivos locais (WASM + modelo do MediaPipe)
  // evitando restrições de CORS com file:// no renderer
  protocol.handle('irisflow', async (request) => {
    const url = new URL(request.url)
    const parts = url.pathname.split('/').filter(Boolean)
    const filePath = path.join(getDistPath(), url.hostname, ...parts)
    const fileUrl = `file://${filePath.replace(/\\/g, '/')}`
    return net.fetch(fileUrl)
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
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
