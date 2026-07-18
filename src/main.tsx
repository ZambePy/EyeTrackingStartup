import { render } from 'preact';
import { App }          from './shell/App';
import { GazeEngine }   from './engine/GazeEngine';
import { SelectionEngine } from './engine/SelectionEngine';
import { loadCalibration } from './core/calibration';
import { sidecarIpc }   from './ipc';
import { sidecarStatus } from './store/gazeStore';
import type { SidecarStatus } from '../electron/sidecar';
import './app.css';

// ── Load persisted calibration ────────────────────────────────────────────────
loadCalibration();

// ── Sync sidecar status into reactive store ───────────────────────────────────
sidecarIpc.onStatusChange((status: string) => {
  sidecarStatus.value = status as SidecarStatus;
});

// ── Mount Preact app ──────────────────────────────────────────────────────────
const appRoot = document.getElementById('app');
if (!appRoot) throw new Error('[IrisFlow] #app not found');
render(<App />, appRoot);

// ── Init GazeEngine after render (video element must exist in DOM) ────────────
requestAnimationFrame(() => {
  const video = document.getElementById('webcam') as HTMLVideoElement | null;
  if (!video) { console.error('[IrisFlow] #webcam not found'); return; }
  GazeEngine.init(video).catch(err => {
    console.error('[IrisFlow] GazeEngine init failed:', err);
  });
});

// ── Start selection engine (dwell + blink) ────────────────────────────────────
SelectionEngine.start();

// ── Dev-only session log shortcuts ────────────────────────────────────────────
if (import.meta.env.DEV) {
  import('./core/sessionLog').then(({ toggleSessionLog, exportSessionLog }) => {
    document.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'l') { e.preventDefault(); toggleSessionLog(); }
      if (e.ctrlKey && e.key === 'e') { e.preventDefault(); exportSessionLog(); }
    });
  });
}
