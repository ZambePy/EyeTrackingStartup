// Data-feed functions called by GazeEngine every frame.
// The accuracy test UI and measurement loop live in screens/Calibration/ValidationResult.tsx.

export interface AccuracyResult {
  meanError: number;
  maxError: number;
  errorPct: number;
  meanErrorDeg: number;
  score: string;
  colorClass: 'accuracy-excellent' | 'accuracy-good' | 'accuracy-regular' | 'accuracy-poor';
  pointErrors: (number | null)[];
  pointPrecisions: (number | null)[];
  meanPrecision: number;
  pointErrorsFiltered: (number | null)[];
  meanErrorFiltered: number;
  validPointCount: number;
  estimatedDistanceCm: number;
}

let currentFeatLeft:  number[] = [];
let currentFeatRight: number[] = [];
let currentFilteredX = 0;
let currentFilteredY = 0;
let currentIod = 0.08;

export let isAccuracyTesting = false;

export function feedRaw(left: number[], right: number[]): void {
  currentFeatLeft  = left;
  currentFeatRight = right;
}

export function feedFiltered(x: number, y: number): void {
  currentFilteredX = x;
  currentFilteredY = y;
}

export function feedIod(iod: number): void {
  if (iod > 0.01 && iod < 0.5) currentIod = iod;
}

export function getRawFeatures(): { left: number[]; right: number[] } {
  return { left: currentFeatLeft, right: currentFeatRight };
}

export function getFilteredGaze(): { x: number; y: number } {
  return { x: currentFilteredX, y: currentFilteredY };
}

export function getIod(): number { return currentIod; }

export function setAccuracyTesting(active: boolean): void { isAccuracyTesting = active; }
