// Sprint E5 — Selection layer: dwell, blink, anti-Midas-touch.
//
// Usage:
//   SelectionEngine.start()          → call once after GazeEngine is ready
//   SelectionEngine.onSelect(cb)     → subscribe to selection events
//   data-gaze-id="<id>" attribute    → marks a DOM element as selectable

import { effect, signal } from '@preact/signals';
import { gazeX, gazeY, blinkState } from '../store/gazeStore';
import { settings } from '../store/settingsStore';
import { updateDwell, resetDwell } from '../core/dwell';

export interface SelectionEvent {
  id: string;
  method: 'dwell' | 'blink';
  x: number;
  y: number;
}

// Observable state for UI (progress rings, hover highlights)
export const dwellTargetId = signal<string | null>(null);
export const dwellProgress = signal(0);  // 0–1

type SelectionCallback = (ev: SelectionEvent) => void;
const callbacks = new Set<SelectionCallback>();

let cooldownUntil = 0;
let lastSelectedId: string | null = null;
let blinkWasOpen = true;

export const SelectionEngine = {
  start(): void {
    // Dwell selection loop — runs on every gazeX/gazeY change
    effect(() => {
      const x  = gazeX.value;
      const y  = gazeY.value;
      const s  = settings.value;
      const now = performance.now();

      if (now < cooldownUntil) {
        dwellProgress.value = 0;
        return;
      }

      const el     = document.elementFromPoint(x, y);
      const target = el?.closest('[data-gaze-id]') as HTMLElement | null;
      const id     = target?.dataset.gazeId ?? null;

      if (id !== dwellTargetId.value) {
        dwellTargetId.value = id;
        lastSelectedId = null;
        resetDwell();
        dwellProgress.value = 0;
        return;
      }

      if (!id) { dwellProgress.value = 0; return; }

      const result = updateDwell(x, y, 40, s.dwellMs);
      dwellProgress.value = result.progress;

      if (result.fired && id !== lastSelectedId) {
        lastSelectedId = id;
        cooldownUntil  = now + s.cooldownMs;
        callbacks.forEach(cb => cb({ id, method: 'dwell', x, y }));
      }
    });

    // Blink selection — fires on intentional blink while over a target
    effect(() => {
      const state = blinkState.value;
      const now   = performance.now();
      const s     = settings.value;
      if (!['dwell', 'blink', 'both'].includes(s.selectionMethod)) return;
      if (s.selectionMethod === 'dwell') return;

      // Detect OPEN→CLOSED→OPEN transition
      if (state === 'OPEN' && !blinkWasOpen) {
        blinkWasOpen = true;
      } else if (state === 'CLOSED' && blinkWasOpen) {
        blinkWasOpen = false;
      } else if (state === 'OPEN' && !blinkWasOpen) {
        blinkWasOpen = true;
        if (now < cooldownUntil) return;
        const el     = document.elementFromPoint(gazeX.value, gazeY.value);
        const target = el?.closest('[data-gaze-id]') as HTMLElement | null;
        const id     = target?.dataset.gazeId ?? null;
        if (id) {
          cooldownUntil = now + s.cooldownMs;
          callbacks.forEach(cb => cb({ id, method: 'blink', x: gazeX.value, y: gazeY.value }));
        }
      }
    });
  },

  onSelect(cb: SelectionCallback): () => void {
    callbacks.add(cb);
    return () => callbacks.delete(cb);
  },
};
