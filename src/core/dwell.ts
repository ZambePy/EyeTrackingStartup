export interface DwellResult {
  progress: number;  // 0–1, drives the ring animation
  fired: boolean;
}

let anchorX    = -1;
let anchorY    = -1;
let dwellStart = 0;
let dwellFired = false;

export function updateDwell(gazeX: number, gazeY: number, radiusPx: number, timeMs: number): DwellResult {
  if (anchorX < 0) {
    anchorX = gazeX; anchorY = gazeY;
    dwellStart = performance.now();
    dwellFired = false;
    return { progress: 0, fired: false };
  }

  const dx = gazeX - anchorX, dy = gazeY - anchorY;
  const moved = Math.sqrt(dx*dx + dy*dy) > radiusPx;

  if (moved) {
    anchorX = gazeX; anchorY = gazeY;
    dwellStart = performance.now();
    dwellFired = false;
    return { progress: 0, fired: false };
  }

  const elapsed  = performance.now() - dwellStart;
  const progress = Math.min(elapsed / timeMs, 1);

  if (progress >= 1 && !dwellFired) {
    dwellFired = true;
    return { progress: 1, fired: true };
  }

  return { progress, fired: false };
}

export function resetDwell(): void {
  anchorX = -1;
  anchorY = -1;
  dwellFired = false;
}
