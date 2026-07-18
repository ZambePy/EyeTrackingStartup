// Sprint E3/U5 — Calibration flow adapted for ALS users.
// No mouse clicks required from the user. Two modes:
//   1. Caregiver-assisted (default): caregiver presses spacebar per point
//   2. Timed autonomous:  automatic collection with countdown per point

import { signal } from '@preact/signals';
import { CalibrationContext } from '../../engine/GazeEngine';
import {
  trainFromPoints, saveCalibration, CALIB_POINTS_9,
  type CalibrationPoint,
} from '../../core/calibration';
import { gazeCalibrated } from '../../store/gazeStore';
import { ValidationResult } from './ValidationResult';
import { navigate } from '../../shell/Router';
import type { AccuracyResult } from '../../core/accuracy';

type Phase =
  | 'pre-check'    // U5 pre-calibration checklist
  | 'countdown'    // 5-second countdown
  | 'collecting'   // capturing frames for current point
  | 'training'     // running ridge regression (brief)
  | 'validation'   // ValidationResult overlay
  | 'done';

const phase      = signal<Phase>('pre-check');
const ptIdx      = signal(0);
const ptProgress = signal(0);  // 0–1 ring animation during collection

const COLLECT_MS   = 1500;
const ONSET_SKIP_MS = 300;
const MIN_EAR       = 0.15;   // reject partial blink frames

let collectedPoints: CalibrationPoint[] = [];
let collectedFrames: { left: number[]; right: number[]; ear: number }[] = [];
let collectStart = 0;
let countdownTimer: number | null = null;

// ── Frame collection ──────────────────────────────────────────────────────────

function startCollection(): void {
  if (phase.value !== 'collecting') return;
  collectStart = performance.now();
  collectedFrames = [];
  ptProgress.value = 0;

  CalibrationContext.active = true;
  CalibrationContext.pendingFeedback = (left, right, ear) => {
    const elapsed = performance.now() - collectStart;
    if (elapsed < ONSET_SKIP_MS) return;
    if (ear < MIN_EAR) return;                    // blink — discard

    collectedFrames.push({ left, right, ear });
    ptProgress.value = Math.min(elapsed / COLLECT_MS, 1);

    if (elapsed >= COLLECT_MS) {
      CalibrationContext.pendingFeedback = null;
      processPoint();
    }
  };
}

function processPoint(): void {
  const pt = CALIB_POINTS_9[ptIdx.value];
  for (const f of collectedFrames) {
    collectedPoints.push({ screenX: pt.x, screenY: pt.y, featuresLeft: f.left, featuresRight: f.right });
  }

  if (ptIdx.value < CALIB_POINTS_9.length - 1) {
    ptIdx.value++;
    ptProgress.value = 0;
    phase.value = 'collecting';
    startCollection();
  } else {
    phase.value = 'training';
    CalibrationContext.active = false;
    setTimeout(() => {
      trainFromPoints(collectedPoints);
      saveCalibration();
      gazeCalibrated.value = true;
      phase.value = 'validation';
    }, 100);
  }
}

function startCountdown(): void {
  phase.value = 'countdown';
  let count = 5;
  if (countdownTimer) clearInterval(countdownTimer);
  countdownTimer = window.setInterval(() => {
    count--;
    if (count <= 0) {
      if (countdownTimer) clearInterval(countdownTimer);
      ptIdx.value = 0;
      collectedPoints = [];
      phase.value = 'collecting';
      startCollection();
    }
  }, 1000);
}

// Spacebar triggers collection (caregiver-assisted mode)
document.addEventListener('keydown', (e: KeyboardEvent) => {
  if (phase.value === 'collecting' && (e.code === 'Space' || e.code === 'Enter')) {
    e.preventDefault();
    startCollection();
  }
});

// ── Sub-views ─────────────────────────────────────────────────────────────────

function PreCheck() {
  return (
    <div class="calib-precheck">
      <h2 class="calib-title">Preparacao para Calibracao</h2>
      <ul class="calib-checklist">
        <li>Posicione o usuario a ~60cm da tela</li>
        <li>Garanta iluminacao frontal adequada (sem contraluz)</li>
        <li>Certifique-se de que o rosto esta centralizado na camera</li>
        <li>O usuario deve olhar fixamente para cada ponto sem piscar</li>
      </ul>
      <div class="calib-actions">
        <button class="btn-primary" onClick={startCountdown}>Iniciar Calibracao (9 pontos)</button>
        <button class="btn-secondary" onClick={() => navigate('home')}>Cancelar</button>
      </div>
    </div>
  );
}

function CountdownView() {
  return (
    <div class="calib-countdown">
      <p class="calib-instruction">Prepare-se — calibracao iniciando em instantes</p>
    </div>
  );
}

function CollectingView() {
  const pt = CALIB_POINTS_9[ptIdx.value];
  const { w, h } = { w: document.documentElement.clientWidth, h: document.documentElement.clientHeight };
  const ringOffset = 100 - ptProgress.value * 100;

  return (
    <div class="calib-overlay">
      <p class="calib-instruction">
        Olhe fixamente para o ponto {ptIdx.value + 1}/{CALIB_POINTS_9.length}
      </p>

      <div
        class="calib-dot"
        style={{ left: `${pt.x * w}px`, top: `${pt.y * h}px` }}
      >
        <svg class="calib-ring" viewBox="0 0 36 36" aria-hidden="true">
          <circle class="calib-ring__track" cx="18" cy="18" r="15.9" />
          <circle
            class="calib-ring__fill"
            cx="18" cy="18" r="15.9"
            style={{ strokeDashoffset: ringOffset }}
          />
        </svg>
      </div>

      <button class="calib-cancel" onClick={() => { CalibrationContext.active = false; navigate('home'); }}>
        Cancelar
      </button>
    </div>
  );
}

function TrainingView() {
  return (
    <div class="calib-training">
      <p class="calib-instruction">Personalizando o rastreamento...</p>
    </div>
  );
}

function handleValidationDone(r: AccuracyResult): void {
  console.info('[Calibration] Result:', r.score, r.meanError.toFixed(0), 'px');
  phase.value = 'done';
  navigate('home');
}

// ── Main component ────────────────────────────────────────────────────────────

export function CalibrationFlow() {
  switch (phase.value) {
    case 'pre-check':   return <PreCheck />;
    case 'countdown':   return <CountdownView />;
    case 'collecting':  return <CollectingView />;
    case 'training':    return <TrainingView />;
    case 'validation':  return <ValidationResult onDone={handleValidationDone} />;
    case 'done':        return null;
    default:            return null;
  }
}
