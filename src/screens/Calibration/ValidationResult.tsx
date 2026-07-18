// Sprint E3/U5 — Post-calibration validation overlay.
// Shows 9 validation points, measures gaze error per point, displays results with traffic-light.

import { signal } from '@preact/signals';
import { mapGaze } from '../../core/calibration';
import { getRawFeatures, getFilteredGaze, getIod, setAccuracyTesting, type AccuracyResult } from '../../core/accuracy';
import { getViewport } from '../../core/viewport';

const VALIDATION_POINTS = [
  { name: 'Sup Esq',  sx: 0.10, sy: 0.10 },
  { name: 'Sup Ctr',  sx: 0.50, sy: 0.10 },
  { name: 'Sup Dir',  sx: 0.90, sy: 0.10 },
  { name: 'Meio Esq', sx: 0.10, sy: 0.50 },
  { name: 'Centro',   sx: 0.50, sy: 0.50 },
  { name: 'Meio Dir', sx: 0.90, sy: 0.50 },
  { name: 'Inf Esq',  sx: 0.10, sy: 0.90 },
  { name: 'Inf Ctr',  sx: 0.50, sy: 0.90 },
  { name: 'Inf Dir',  sx: 0.90, sy: 0.90 },
];

const COLLECT_MS = 1000;
const IOD_REF = 0.08;
const DIST_PX_AT_REF = 2268;

type Phase = 'running' | 'done';
const phase   = signal<Phase>('running');
const ptIdx   = signal(0);
const result  = signal<AccuracyResult | null>(null);

function runTest(onComplete: (r: AccuracyResult) => void): void {
  setAccuracyTesting(true);
  const { w, h } = getViewport();
  const errors: (number | null)[]      = [];
  const precisions: (number | null)[]  = [];
  const filtered: (number | null)[]    = [];
  const iodSamples: number[]           = [];

  let idx = 0;

  function nextPoint(): void {
    if (idx >= VALIDATION_POINTS.length) { finish(); return; }
    ptIdx.value = idx;

    const vp = VALIDATION_POINTS[idx];
    const t0 = performance.now();
    const rawX: number[] = [], rawY: number[] = [], fX: number[] = [], fY: number[] = [];

    function collect(): void {
      const feat = getRawFeatures();
      const filt = getFilteredGaze();
      const gaze = mapGaze(feat.left, feat.right, w, h);
      if (gaze) { rawX.push(gaze.x); rawY.push(gaze.y); }
      fX.push(filt.x); fY.push(filt.y);
      iodSamples.push(getIod());

      if (performance.now() - t0 < COLLECT_MS) { requestAnimationFrame(collect); return; }

      const tx = vp.sx * w, ty = vp.sy * h;
      let acc: number | null = null, prec: number | null = null, fAcc: number | null = null;

      if (rawX.length > 0) {
        const cx = rawX.reduce((s, v) => s + v, 0) / rawX.length;
        const cy = rawY.reduce((s, v) => s + v, 0) / rawY.length;
        acc = Math.sqrt((cx - tx)**2 + (cy - ty)**2);
        prec = Math.sqrt(rawX.reduce((s, x, i) => s + (x-cx)**2 + (rawY[i]-cy)**2, 0) / rawX.length);
      }
      if (fX.length > 0) {
        const cx = fX.reduce((s, v) => s + v, 0) / fX.length;
        const cy = fY.reduce((s, v) => s + v, 0) / fY.length;
        fAcc = Math.sqrt((cx - tx)**2 + (cy - ty)**2);
      }

      errors.push(acc); precisions.push(prec); filtered.push(fAcc);
      idx++;
      setTimeout(nextPoint, 300);
    }
    requestAnimationFrame(collect);
  }

  function finish(): void {
    setAccuracyTesting(false);
    const valid = errors.filter(e => e !== null) as number[];
    const validPrec = precisions.filter(p => p !== null) as number[];
    const validFilt = filtered.filter(f => f !== null) as number[];
    const meanError = valid.length > 0 ? valid.reduce((s, v) => s + v, 0) / valid.length : 0;
    const maxError  = valid.length > 0 ? Math.max(...valid) : 0;
    const meanPrec  = validPrec.length > 0 ? validPrec.reduce((s, v) => s + v, 0) / validPrec.length : 0;
    const meanFilt  = validFilt.length > 0 ? validFilt.reduce((s, v) => s + v, 0) / validFilt.length : 0;
    const diag  = Math.sqrt(w**2 + h**2);
    const avgIod = iodSamples.length > 0 ? iodSamples.reduce((s, v) => s + v, 0) / iodSamples.length : IOD_REF;
    const distPx = DIST_PX_AT_REF * IOD_REF / avgIod;
    const meanErrDeg = +(Math.atan(meanError / distPx) * 180 / Math.PI).toFixed(2);
    const score = meanError < 30 ? 'Excelente' : meanError < 60 ? 'Bom' : meanError < 100 ? 'Regular' : 'Ruim';
    const colorClass = meanError < 30 ? 'accuracy-excellent' : meanError < 60 ? 'accuracy-good' : meanError < 100 ? 'accuracy-regular' : 'accuracy-poor';
    const r: AccuracyResult = {
      meanError, maxError, errorPct: (meanError / diag) * 100, meanErrorDeg: meanErrDeg,
      score, colorClass, pointErrors: errors, pointPrecisions: precisions,
      meanPrecision: meanPrec, pointErrorsFiltered: filtered, meanErrorFiltered: meanFilt,
      validPointCount: valid.length, estimatedDistanceCm: +(distPx * 2.54 / 96).toFixed(1),
    };
    result.value = r;
    phase.value = 'done';
    onComplete(r);
  }

  nextPoint();
}

interface Props { onDone: (r: AccuracyResult) => void; }

export function ValidationResult({ onDone }: Props) {
  if (phase.value === 'running') {
    const { w, h } = getViewport();
    const vp = VALIDATION_POINTS[ptIdx.value];
    return (
      <div class="validation-overlay">
        <p class="validation-instruction">
          Teste de precisao — olhe para o ponto {ptIdx.value + 1}/{VALIDATION_POINTS.length}
        </p>
        <div
          class="validation-dot"
          style={{ left: `${vp.sx * w}px`, top: `${vp.sy * h}px` }}
        />
        {/* Kick off the test loop once on mount */}
        {ptIdx.value === 0 && void runTest(onDone)}
      </div>
    );
  }

  const r = result.value;
  if (!r) return null;

  return (
    <div class="validation-result">
      <h2 class={`validation-score ${r.colorClass}`}>{r.score}</h2>
      <dl class="validation-metrics">
        <dt>Erro medio</dt><dd>{Math.round(r.meanError)}px / {r.meanErrorDeg}°</dd>
        <dt>Erro maximo</dt><dd>{Math.round(r.maxError)}px</dd>
        <dt>Precisao RMS</dt><dd>{Math.round(r.meanPrecision)}px</dd>
        <dt>Distancia est.</dt><dd>{r.estimatedDistanceCm}cm</dd>
        <dt>Pontos validos</dt><dd>{r.validPointCount}/9</dd>
      </dl>
      <div class="validation-actions">
        <button class="btn-primary dwell-target" data-gaze-id="val-use" onClick={() => onDone(r)}>
          Usar assim
        </button>
        <button class="btn-secondary dwell-target" data-gaze-id="val-recalib" onClick={() => { phase.value = 'running'; ptIdx.value = 0; result.value = null; }}>
          Recalibrar
        </button>
      </div>
    </div>
  );
}
