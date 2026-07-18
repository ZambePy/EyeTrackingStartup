"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sidecarManager = exports.SidecarManager = void 0;
const child_process_1 = require("child_process");
const events_1 = require("events");
const path_1 = __importDefault(require("path"));
const http_1 = __importDefault(require("http"));
const electron_1 = require("electron");
const MODEL = 'itracker_mpiiface.tar';
const PORT = 8002;
const HEALTH_URL = `http://127.0.0.1:${PORT}/config/gaze_filtered`;
const POLL_INTERVAL_MS = 2000;
const HEALTH_TIMEOUT = 1500;
const MAX_RESTARTS = 5;
const BACKOFF_BASE_MS = 1500;
function devPaths() {
    const root = process.env['EYETHEIA_ROOT']
        ?? path_1.default.join(electron_1.app.getPath('home'), 'OneDrive', 'Desktop', 'EyeTheia');
    return {
        python: process.env['EYETHEIA_PYTHON']
            ?? path_1.default.join(root, 'eyetheia-env', 'Scripts', 'python.exe'),
        script: path_1.default.join(root, 'src', 'run_server.py'),
        cwd: root,
    };
}
function prodPaths() {
    const dir = path_1.default.join(process.resourcesPath, 'sidecar');
    return {
        python: path_1.default.join(dir, 'run_server', 'run_server.exe'),
        script: '',
        cwd: dir,
    };
}
class SidecarManager extends events_1.EventEmitter {
    proc = null;
    _status = 'stopped';
    pollTimer = null;
    restartTimer = null;
    restartCount = 0;
    killed = false;
    // ── Public API ──────────────────────────────────────────────────────────────
    start() {
        if (this.proc || this.killed)
            return;
        this._spawn();
    }
    stop() {
        this.killed = true;
        this._clearTimers();
        this._killProc();
        this._setStatus('stopped');
    }
    getStatus() {
        return this._status;
    }
    /** Send real screen dimensions to the sidecar REST endpoint. */
    sendScreenSize(w, h) {
        const body = `width=${w}&height=${h}`;
        const req = http_1.default.request({
            hostname: '127.0.0.1',
            port: PORT,
            path: '/config/update_screen',
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(body),
            },
        });
        req.on('error', () => { });
        req.end(body);
    }
    // ── Internal ────────────────────────────────────────────────────────────────
    _spawn() {
        const p = electron_1.app.isPackaged ? prodPaths() : devPaths();
        this._setStatus('starting');
        console.log(`[sidecar] spawning: ${p.python}`);
        const args = electron_1.app.isPackaged
            ? []
            : [p.script, '--model_path', MODEL];
        this.proc = (0, child_process_1.spawn)(p.python, args, {
            cwd: p.cwd,
            env: { ...process.env },
            windowsHide: true,
        });
        this.proc.stdout?.on('data', (d) => {
            for (const line of d.toString().split('\n').filter(Boolean))
                console.log(`[sidecar] ${line}`);
        });
        this.proc.stderr?.on('data', (d) => {
            for (const line of d.toString().split('\n').filter(Boolean))
                console.log(`[sidecar] ${line}`);
        });
        this.proc.on('exit', (code) => {
            console.log(`[sidecar] exited (code ${code})`);
            this.proc = null;
            this._clearTimers();
            if (!this.killed) {
                this._setStatus('error');
                this._scheduleRestart();
            }
        });
        this._startPolling();
    }
    _startPolling() {
        this._clearPoll();
        this.pollTimer = setInterval(() => this._healthCheck(), POLL_INTERVAL_MS);
    }
    _clearPoll() {
        if (this.pollTimer) {
            clearInterval(this.pollTimer);
            this.pollTimer = null;
        }
    }
    _clearTimers() {
        this._clearPoll();
        if (this.restartTimer) {
            clearTimeout(this.restartTimer);
            this.restartTimer = null;
        }
    }
    _healthCheck() {
        const req = http_1.default.get(HEALTH_URL, (res) => {
            if (res.statusCode === 200 && this._status !== 'ready') {
                this.restartCount = 0;
                this._setStatus('ready');
            }
            res.resume();
        });
        req.on('error', () => { });
        req.setTimeout(HEALTH_TIMEOUT, () => req.destroy());
    }
    _scheduleRestart() {
        if (this.restartCount >= MAX_RESTARTS) {
            console.error('[sidecar] max restarts reached — giving up');
            this._setStatus('error');
            return;
        }
        const delay = BACKOFF_BASE_MS * Math.pow(2, this.restartCount);
        this.restartCount++;
        console.log(`[sidecar] restart #${this.restartCount} in ${delay}ms`);
        this.restartTimer = setTimeout(() => {
            if (!this.killed)
                this._spawn();
        }, delay);
    }
    _killProc() {
        if (!this.proc)
            return;
        const pid = this.proc.pid;
        this.proc = null;
        if (!pid)
            return;
        try {
            if (process.platform === 'win32') {
                (0, child_process_1.execSync)(`taskkill /F /T /PID ${pid}`, { stdio: 'ignore' });
            }
            else {
                process.kill(-pid, 'SIGTERM');
            }
        }
        catch {
            /* process may already be gone */
        }
    }
    _setStatus(s) {
        if (this._status === s)
            return;
        this._status = s;
        this.emit('status', s);
    }
}
exports.SidecarManager = SidecarManager;
exports.sidecarManager = new SidecarManager();
