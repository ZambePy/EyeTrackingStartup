import { signal } from '@preact/signals';
import type { BlinkState } from '../core/filters/blinkDetector';
import type { SidecarStatus } from '../../electron/sidecar';

// ── Gaze position (updated every frame by GazeEngine) ────────────────────────
export const gazeX = signal(0);
export const gazeY = signal(0);

// ── Pipeline state ────────────────────────────────────────────────────────────
export const gazeTracking   = signal<'idle' | 'tracking' | 'lost'>('idle');
export const gazeCalibrated = signal(false);
export const gazeLowConf    = signal(false);
export const blinkState     = signal<BlinkState>('OPEN');

// ── Metrics (updated by GazeEngine) ──────────────────────────────────────────
export const gazeFps           = signal(0);
export const gazeSignalQuality = signal(0);   // 0–100 %

// ── Sidecar (E1 — updated by IPC listener in main.tsx) ───────────────────────
export const sidecarStatus = signal<SidecarStatus>('stopped');
