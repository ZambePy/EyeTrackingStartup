import { trainRidgeModel, predictRidge, findBestLambda } from './ridge';
import type { RidgeModel } from './ridge';
import type { HeadPose } from './extractor';
import { StandardScaler } from './scaler';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CalibrationPoint {
  screenX: number;
  screenY: number;
  featuresLeft: number[];
  featuresRight: number[];
}

export interface GazeResult {
  x: number;              // pixels, clamped to viewport
  y: number;
  normX: number;          // normalized [0,1] (pre-clamp)
  normY: number;
  lowConfidence: boolean; // true when prediction falls outside calibration hull
}

export interface CalibrationModel {
  version: number;
  ridgeLeft: RidgeModel;
  ridgeRight: RidgeModel;
  scalerLeft: { means: number[]; stds: number[] };
  scalerRight: { means: number[]; stds: number[] };
  hull: { minX: number; maxX: number; minY: number; maxY: number };
  refPose?: HeadPose;
}

// ── Calibration point grids ───────────────────────────────────────────────────

export const CALIB_POINTS_5 = [
  { name: 'Centro',      x: 0.50, y: 0.50 },
  { name: 'Sup Esq',    x: 0.10, y: 0.10 },
  { name: 'Sup Dir',    x: 0.90, y: 0.10 },
  { name: 'Inf Esq',    x: 0.10, y: 0.90 },
  { name: 'Inf Dir',    x: 0.90, y: 0.90 },
] as const;

export const CALIB_POINTS_9 = [
  { name: 'Sup Esq',    x: 0.05, y: 0.05 },
  { name: 'Sup Centro', x: 0.50, y: 0.05 },
  { name: 'Sup Dir',    x: 0.95, y: 0.05 },
  { name: 'Meio Esq',   x: 0.05, y: 0.50 },
  { name: 'Centro',     x: 0.50, y: 0.50 },
  { name: 'Meio Dir',   x: 0.95, y: 0.50 },
  { name: 'Inf Esq',    x: 0.05, y: 0.95 },
  { name: 'Inf Centro', x: 0.50, y: 0.95 },
  { name: 'Inf Dir',    x: 0.95, y: 0.95 },
] as const;

export const CALIB_POINTS_13 = [
  ...CALIB_POINTS_9,
  { name: 'Sup 1/3 Esq', x: 0.30, y: 0.05 },
  { name: 'Sup 1/3 Dir', x: 0.70, y: 0.05 },
  { name: 'Inf 1/3 Esq', x: 0.30, y: 0.95 },
  { name: 'Inf 1/3 Dir', x: 0.70, y: 0.95 },
] as const;

// ── State ─────────────────────────────────────────────────────────────────────

const MODEL_VERSION = 3;
const STORAGE_KEY   = 'irisflow:calibration';

const scalerLeft  = new StandardScaler();
const scalerRight = new StandardScaler();
let ridgeLeft:  RidgeModel | null = null;
let ridgeRight: RidgeModel | null = null;
let calibHull = { minX: 0.05, maxX: 0.95, minY: 0.05, maxY: 0.95 };
let latestFeatLeft:  number[] = [];
let latestFeatRight: number[] = [];
let sessionCorrection: { scaleX: number; biasX: number; scaleY: number; biasY: number } | null = null;

// ── Public API ────────────────────────────────────────────────────────────────

export function isCalibrated(): boolean {
  return ridgeLeft !== null && ridgeRight !== null;
}

export function clearCalibration(): void {
  ridgeLeft = null;
  ridgeRight = null;
  sessionCorrection = null;
  localStorage.removeItem(STORAGE_KEY);
}

export function saveCalibration(refPose?: HeadPose): void {
  if (!ridgeLeft || !ridgeRight) return;
  const model: CalibrationModel = {
    version: MODEL_VERSION,
    ridgeLeft, ridgeRight,
    scalerLeft:  scalerLeft.getParams(),
    scalerRight: scalerRight.getParams(),
    hull: calibHull,
    refPose,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(model));
}

export function loadCalibration(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const m = JSON.parse(raw) as CalibrationModel;
    if (m.version !== MODEL_VERSION) return false;
    ridgeLeft  = m.ridgeLeft;
    ridgeRight = m.ridgeRight;
    scalerLeft.setParams(m.scalerLeft.means,  m.scalerLeft.stds);
    scalerRight.setParams(m.scalerRight.means, m.scalerRight.stds);
    calibHull  = m.hull;
    return true;
  } catch {
    return false;
  }
}

export function trainFromPoints(points: CalibrationPoint[]): void {
  const featLeft  = points.map(p => p.featuresLeft);
  const featRight = points.map(p => p.featuresRight);
  const targets   = points.map(p => ({ screenX: p.screenX, screenY: p.screenY }));

  scalerLeft.fit(featLeft);
  scalerRight.fit(featRight);

  const scaledLeft  = scalerLeft.transform(featLeft);
  const scaledRight = scalerRight.transform(featRight);

  const lambda   = findBestLambda(scaledLeft, targets);
  ridgeLeft      = trainRidgeModel(scaledLeft,  targets, lambda);
  ridgeRight     = trainRidgeModel(scaledRight, targets, lambda);

  calibHull = {
    minX: Math.min(...targets.map(t => t.screenX)),
    maxX: Math.max(...targets.map(t => t.screenX)),
    minY: Math.min(...targets.map(t => t.screenY)),
    maxY: Math.max(...targets.map(t => t.screenY)),
  };
}

// Called every frame by GazeEngine so that getLatestRawPred() is always fresh.
export function feedFeatures(left: number[], right: number[]): void {
  latestFeatLeft  = left;
  latestFeatRight = right;
}

export function mapGaze(featLeft: number[], featRight: number[], vw: number, vh: number): GazeResult | null {
  if (!ridgeLeft || !ridgeRight) return null;

  const sl = scalerLeft.transformSingle(featLeft);
  const sr = scalerRight.transformSingle(featRight);
  const pl = predictRidge(ridgeLeft,  sl);
  const pr = predictRidge(ridgeRight, sr);

  let normX = (pl.normX + pr.normX) / 2;
  let normY = (pl.normY + pr.normY) / 2;

  if (sessionCorrection) {
    normX = normX * sessionCorrection.scaleX + sessionCorrection.biasX;
    normY = normY * sessionCorrection.scaleY + sessionCorrection.biasY;
  }

  const lowConfidence =
    normX < calibHull.minX || normX > calibHull.maxX ||
    normY < calibHull.minY || normY > calibHull.maxY;

  return {
    x: Math.max(0, Math.min(vw, normX * vw)),
    y: Math.max(0, Math.min(vh, normY * vh)),
    normX, normY, lowConfidence,
  };
}

export function getLatestRawPred(): { normX: number; normY: number } | null {
  if (!ridgeLeft || !ridgeRight || latestFeatLeft.length === 0) return null;
  const sl = scalerLeft.transformSingle(latestFeatLeft);
  const sr = scalerRight.transformSingle(latestFeatRight);
  const pl = predictRidge(ridgeLeft,  sl);
  const pr = predictRidge(ridgeRight, sr);
  return { normX: (pl.normX + pr.normX) / 2, normY: (pl.normY + pr.normY) / 2 };
}

export function applySessionCorrection(
  sc: { scaleX: number; biasX: number; scaleY: number; biasY: number },
): void {
  sessionCorrection = sc;
}

export function clearSessionCorrection(): void {
  sessionCorrection = null;
}
