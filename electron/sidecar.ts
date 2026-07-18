import { ChildProcess, spawn, execSync } from 'child_process'
import { EventEmitter } from 'events'
import path from 'path'
import http from 'http'
import { app } from 'electron'

export type SidecarStatus = 'stopped' | 'starting' | 'ready' | 'error'

const MODEL      = 'itracker_mpiiface.tar'
const PORT       = 8002
const HEALTH_URL = `http://127.0.0.1:${PORT}/config/gaze_filtered`

const POLL_INTERVAL_MS = 2000
const HEALTH_TIMEOUT   = 1500
const MAX_RESTARTS     = 5
const BACKOFF_BASE_MS  = 1500

function devPaths(): { python: string; script: string; cwd: string } {
  const root = process.env['EYETHEIA_ROOT']
    ?? path.join(app.getPath('home'), 'OneDrive', 'Desktop', 'EyeTheia')
  return {
    python: process.env['EYETHEIA_PYTHON']
      ?? path.join(root, 'eyetheia-env', 'Scripts', 'python.exe'),
    script: path.join(root, 'src', 'run_server.py'),
    cwd:    root,
  }
}

function prodPaths(): { python: string; script: string; cwd: string } {
  const dir = path.join(process.resourcesPath, 'sidecar')
  return {
    python: path.join(dir, 'run_server', 'run_server.exe'),
    script: '',
    cwd:    dir,
  }
}

export class SidecarManager extends EventEmitter {
  private proc: ChildProcess | null = null
  private _status: SidecarStatus = 'stopped'
  private pollTimer: NodeJS.Timeout | null = null
  private restartTimer: NodeJS.Timeout | null = null
  private restartCount = 0
  private killed = false

  // ── Public API ──────────────────────────────────────────────────────────────

  start(): void {
    if (this.proc || this.killed) return
    this._spawn()
  }

  stop(): void {
    this.killed = true
    this._clearTimers()
    this._killProc()
    this._setStatus('stopped')
  }

  getStatus(): SidecarStatus {
    return this._status
  }

  /** Send real screen dimensions to the sidecar REST endpoint. */
  sendScreenSize(w: number, h: number): void {
    const body = `width=${w}&height=${h}`
    const req = http.request({
      hostname: '127.0.0.1',
      port: PORT,
      path: '/config/update_screen',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
      },
    })
    req.on('error', () => { /* ignore — called only when ready */ })
    req.end(body)
  }

  // ── Internal ────────────────────────────────────────────────────────────────

  private _spawn(): void {
    const p = app.isPackaged ? prodPaths() : devPaths()

    this._setStatus('starting')
    console.log(`[sidecar] spawning: ${p.python}`)

    const args = app.isPackaged
      ? []
      : [p.script, '--model_path', MODEL]

    this.proc = spawn(p.python, args, {
      cwd: p.cwd,
      env: { ...process.env },
      windowsHide: true,
    })

    this.proc.stdout?.on('data', (d: Buffer) => {
      for (const line of d.toString().split('\n').filter(Boolean))
        console.log(`[sidecar] ${line}`)
    })

    this.proc.stderr?.on('data', (d: Buffer) => {
      for (const line of d.toString().split('\n').filter(Boolean))
        console.log(`[sidecar] ${line}`)
    })

    this.proc.on('exit', (code) => {
      console.log(`[sidecar] exited (code ${code})`)
      this.proc = null
      this._clearTimers()
      if (!this.killed) {
        this._setStatus('error')
        this._scheduleRestart()
      }
    })

    this._startPolling()
  }

  private _startPolling(): void {
    this._clearPoll()
    this.pollTimer = setInterval(() => this._healthCheck(), POLL_INTERVAL_MS)
  }

  private _clearPoll(): void {
    if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null }
  }

  private _clearTimers(): void {
    this._clearPoll()
    if (this.restartTimer) { clearTimeout(this.restartTimer); this.restartTimer = null }
  }

  private _healthCheck(): void {
    const req = http.get(HEALTH_URL, (res) => {
      if (res.statusCode === 200 && this._status !== 'ready') {
        this.restartCount = 0
        this._setStatus('ready')
      }
      res.resume()
    })
    req.on('error', () => { /* still starting */ })
    req.setTimeout(HEALTH_TIMEOUT, () => req.destroy())
  }

  private _scheduleRestart(): void {
    if (this.restartCount >= MAX_RESTARTS) {
      console.error('[sidecar] max restarts reached — giving up')
      this._setStatus('error')
      return
    }
    const delay = BACKOFF_BASE_MS * Math.pow(2, this.restartCount)
    this.restartCount++
    console.log(`[sidecar] restart #${this.restartCount} in ${delay}ms`)
    this.restartTimer = setTimeout(() => {
      if (!this.killed) this._spawn()
    }, delay)
  }

  private _killProc(): void {
    if (!this.proc) return
    const pid = this.proc.pid
    this.proc = null
    if (!pid) return

    try {
      if (process.platform === 'win32') {
        execSync(`taskkill /F /T /PID ${pid}`, { stdio: 'ignore' })
      } else {
        process.kill(-pid, 'SIGTERM')
      }
    } catch {
      /* process may already be gone */
    }
  }

  private _setStatus(s: SidecarStatus): void {
    if (this._status === s) return
    this._status = s
    this.emit('status', s)
  }
}

export const sidecarManager = new SidecarManager()
