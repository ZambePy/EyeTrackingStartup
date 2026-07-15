import { trainRidgeModel, predictRidge, findBestLambda } from './ridge';
import type { RidgeModel } from './ridge';
import type { HeadPose } from './extractor';
import { startAccuracyTest } from './accuracy';
import { StandardScaler } from './scaler';
import { getViewport } from './viewport';

// ── Interfaces ────────────────────────────────────────────────────────────────

interface CalibrationPoint {
  screenX: number;
  screenY: number;
  featuresLeft: number[];
  featuresRight: number[];
}

// DynamicSample sem weight — só amostras de fixação são adicionadas (G4)
interface DynamicSample {
  screenX: number;
  screenY: number;
  featuresLeft: number[];
  featuresRight: number[];
}

// Resultado de mapeamento de olhar com flag de baixa confiança (G7)
export interface GazeResult {
  x: number;              // posição em pixels (clamped ao viewport)
  y: number;
  lowConfidence: boolean; // true quando predição cai fora do hull de calibração
}

// ── Grade 3×3 (9 pontos) ─────────────────────────────────────────────────────
const TARGET_POINTS = [
  { name: "Canto Superior Esquerdo",  screenX: 0.05, screenY: 0.05 },
  { name: "Superior Centro",          screenX: 0.50, screenY: 0.05 },
  { name: "Canto Superior Direito",   screenX: 0.95, screenY: 0.05 },
  { name: "Médio Esquerdo",           screenX: 0.05, screenY: 0.50 },
  { name: "Centro",                   screenX: 0.50, screenY: 0.50 },
  { name: "Médio Direito",            screenX: 0.95, screenY: 0.50 },
  { name: "Canto Inferior Esquerdo",  screenX: 0.05, screenY: 0.95 },
  { name: "Inferior Centro",          screenX: 0.50, screenY: 0.95 },
  { name: "Canto Inferior Direito",   screenX: 0.95, screenY: 0.95 },
];

const COLLECTION_MS  = 1500;
const TRANSITION_MS  = 1000;
const DYN_MOVE_MS    = 1200;
const DYN_PULSE_MS   = 1500;
// Sprint 3 – T2: descarta primeiros 300ms de cada fixação (perseguição ocular ainda resolvendo)
const ONSET_SKIP_MS  = 300;

// Snake path 3×3
const DYNAMIC_WAYPOINTS = [
  { x: 0.05, y: 0.05 },
  { x: 0.50, y: 0.05 },
  { x: 0.95, y: 0.05 },
  { x: 0.95, y: 0.50 },
  { x: 0.50, y: 0.50 },
  { x: 0.05, y: 0.50 },
  { x: 0.05, y: 0.95 },
  { x: 0.50, y: 0.95 },
  { x: 0.95, y: 0.95 },
];

// ── Estado de calibração ──────────────────────────────────────────────────────
let profile: CalibrationPoint[] = [];
export let isCalibrating = false;
let isDynamicCalibrating = false;
let currentPointIndex = 0;
let isCollecting = false;
let collectionStartTime = 0;
let collectedFeaturesLeft: number[][] = [];
let collectedFeaturesRight: number[][] = [];

let dynamicSamples: DynamicSample[] = [];
let dynamicBallX = 0.5;
let dynamicBallY = 0.5;
let dynamicIsFixation = false;
let dynamicFixationStartTime = 0; // Sprint 3 – T2: onset skip na fase dinâmica

// Sprint 3 – T2: histórico de EAR para detecção de fechamento parcial
const calibEarHistory: number[] = [];
// Sprint 3 – T6: variâncias dos pontos bem-sucedidos para threshold adaptativo
let baselineVariances: number[] = [];

// ── Modelos Ridge e Scaler ────────────────────────────────────────────────────
let ridgeModelLeft: RidgeModel | null = null;
let ridgeModelRight: RidgeModel | null = null;
export const featureScalerLeft = new StandardScaler();
export const featureScalerRight = new StandardScaler();

// Sprint 3 – T4: hull convexo (bounding box) dos pontos de calibração
let calibHull = { minX: 0.05, maxX: 0.95, minY: 0.05, maxY: 0.95 };

// Sprint 4 – T3/T4: versão do perfil e estado inter-sessão
const PROFILE_VERSION = 2;
let latestFeaturesLeft: number[] = [];
let latestFeaturesRight: number[] = [];
let calibrationPoses: HeadPose[] = [];
let refHeadPose: HeadPose | null = null;
let poseBuffer: HeadPose[] = [];
let poseCheckDone = false;
let sessionCorrection: { scaleX: number; biasX: number; scaleY: number; biasY: number } | null = null;

// ── Session counter ──────────────────────────────────────────────────────────
let sessionCount = 0;

function loadSessionCount(): void {
  try {
    sessionCount = parseInt(localStorage.getItem('irisflowSession') ?? '0', 10) + 1;
    localStorage.setItem('irisflowSession', String(sessionCount));
  } catch (_) {}
}

// ── Pré-calibração ────────────────────────────────────────────────────────────
export let isPreCalibrating = false;

const IOD_MIN       = 0.045;
const IOD_MAX       = 0.13;
const IOD_IDEAL_MIN = 0.06;
const IOD_IDEAL_MAX = 0.10;

export function feedFaceMetrics(detected: boolean, iod: number): void {
  if (isPreCalibrating) updatePreCalibrationUI(detected, iod);
}

// ── Sprint 3 – T2: filtragem por fechamento parcial ──────────────────────────
// Rejeita frame se EAR < 85% da média adaptativa (fechamento parcial do olho)
function isPartialBlink(ear: number): boolean {
  if (ear <= 0) return false;
  calibEarHistory.push(ear);
  if (calibEarHistory.length > 120) calibEarHistory.shift();
  if (calibEarHistory.length < 20) return false;
  const mean = calibEarHistory.reduce((a, b) => a + b, 0) / calibEarHistory.length;
  return ear < mean * 0.85;
}

// ── Sprint 3 – T6: threshold de variância adaptativo ─────────────────────────
// Base de 0.0005; após 3 pontos bem-sucedidos usa 3× a variância observada.
const BASE_VARIANCE_THRESHOLD  = 0.0005;
const VARIANCE_SCALE_FACTOR    = 3.0;

function getVarianceThreshold(): number {
  if (baselineVariances.length >= 3) {
    const mean = baselineVariances.reduce((a, b) => a + b, 0) / baselineVariances.length;
    return Math.max(BASE_VARIANCE_THRESHOLD, mean * VARIANCE_SCALE_FACTOR);
  }
  return BASE_VARIANCE_THRESHOLD;
}

// ── Persistência ──────────────────────────────────────────────────────────────

export function loadProfile(): boolean {
  try {
    const saved = localStorage.getItem("calibrationProfile");
    if (saved) {
      const parsed = JSON.parse(saved);
      // Sprint 4 – T4: rejeita perfil com versão de features incompatível
      if (parsed.version !== PROFILE_VERSION) {
        console.warn(`[IrisFlow S4] Perfil v${parsed.version ?? 1} incompatível com v${PROFILE_VERSION} — recalibração necessária`);
        return false;
      }
      if (parsed.ridgeModelLeft && parsed.ridgeModelRight && parsed.scalerParamsLeft && parsed.scalerParamsRight) {
        ridgeModelLeft  = parsed.ridgeModelLeft;
        ridgeModelRight = parsed.ridgeModelRight;
        featureScalerLeft.setParams(parsed.scalerParamsLeft.means, parsed.scalerParamsLeft.stds);
        featureScalerRight.setParams(parsed.scalerParamsRight.means, parsed.scalerParamsRight.stds);
        if (parsed.hull) calibHull = parsed.hull;
        if (parsed.refHeadPose) refHeadPose = parsed.refHeadPose;
        poseCheckDone = false;
        sessionCorrection = null;
        return true;
      }
    }
  } catch (e) {
    console.error("Erro ao carregar calibrationProfile:", e);
  }
  ridgeModelLeft  = null;
  ridgeModelRight = null;
  return false;
}

function saveProfile() {
  if (ridgeModelLeft && ridgeModelRight) {
    localStorage.setItem("calibrationProfile", JSON.stringify({
      version:           PROFILE_VERSION,
      ridgeModelLeft,
      ridgeModelRight,
      scalerParamsLeft:  featureScalerLeft.getParams(),
      scalerParamsRight: featureScalerRight.getParams(),
      hull:              calibHull,
      refHeadPose,
    }));
  }
}

export function clearCalibration() {
  profile           = [];
  ridgeModelLeft    = null;
  ridgeModelRight   = null;
  baselineVariances = [];
  calibHull         = { minX: 0.05, maxX: 0.95, minY: 0.05, maxY: 0.95 };
  // Sprint 4 – T3/T4: reset inter-session state
  refHeadPose       = null;
  calibrationPoses  = [];
  poseBuffer        = [];
  poseCheckDone     = false;
  sessionCorrection = null;
  localStorage.removeItem("calibrationProfile");
  localStorage.removeItem("accuracyResult");
  updateStatusUI();
}

export function isCalibrated(): boolean {
  return ridgeModelLeft !== null && ridgeModelRight !== null;
}

// ── Pré-Calibração ────────────────────────────────────────────────────────────

export function startPreCalibration() {
  if (isCalibrating || isPreCalibrating) return;
  isPreCalibrating = true;
  createPreCalibrationOverlay();
}

function createPreCalibrationOverlay() {
  if (document.getElementById("precalib-overlay")) return;

  const overlay = document.createElement("div");
  overlay.id = "precalib-overlay";
  overlay.className = "precalib-overlay";
  overlay.innerHTML = `
    <div class="precalib-card">
      <div class="precalib-title">Preparação para Calibração</div>
      <div class="precalib-subtitle">Verifique as condições antes de iniciar</div>

      <div class="precalib-checklist">
        <div class="precalib-item" id="precalib-face">
          <div class="precalib-icon" id="precalib-face-icon">○</div>
          <div class="precalib-text">
            <div class="precalib-item-title">Rosto Detectado</div>
            <div class="precalib-item-desc" id="precalib-face-desc">Posicione-se de frente para a câmera</div>
          </div>
        </div>

        <div class="precalib-item" id="precalib-distance">
          <div class="precalib-icon" id="precalib-distance-icon">○</div>
          <div class="precalib-text">
            <div class="precalib-item-title">Distância Adequada</div>
            <div class="precalib-item-desc" id="precalib-distance-desc">Sente-se a ~60cm da tela</div>
          </div>
          <div class="precalib-distance-bar-wrap">
            <div class="precalib-distance-zone precalib-zone-far">Longe</div>
            <div class="precalib-distance-zone precalib-zone-ideal">Ideal</div>
            <div class="precalib-distance-zone precalib-zone-close">Perto</div>
            <div class="precalib-distance-indicator" id="precalib-dist-indicator"></div>
          </div>
        </div>

        <div class="precalib-item" id="precalib-light">
          <div class="precalib-icon" id="precalib-light-icon">○</div>
          <div class="precalib-text">
            <div class="precalib-item-title">Iluminação</div>
            <div class="precalib-item-desc" id="precalib-light-desc">Garanta iluminação frontal adequada</div>
          </div>
        </div>
      </div>

      <div class="precalib-tips">
        <div class="precalib-tips-title">💡 Dicas para melhor precisão</div>
        <ul>
          <li>Centralize seu rosto na câmera</li>
          <li>Evite luz forte atrás de você (contraluz)</li>
          <li>Mantenha a cabeça parada durante a calibração</li>
          <li>Olhe fixamente para cada ponto sem piscar</li>
        </ul>
      </div>

      <div class="precalib-actions">
        <button id="btn-precalib-start" class="btn btn-primary precalib-start-btn">Iniciar Calibração</button>
        <button id="btn-precalib-cancel" class="btn btn-secondary">Cancelar</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  document.getElementById("btn-precalib-start")?.addEventListener("click", () => {
    closePreCalibration();
    startCalibrationMode();
  });

  document.getElementById("btn-precalib-cancel")?.addEventListener("click", () => {
    closePreCalibration();
  });
}

function updatePreCalibrationUI(detected: boolean, iod: number) {
  const faceIcon = document.getElementById("precalib-face-icon");
  const faceDesc = document.getElementById("precalib-face-desc");
  if (faceIcon && faceDesc) {
    if (detected) {
      faceIcon.textContent = "✓";
      faceIcon.className = "precalib-icon precalib-ok";
      faceDesc.textContent = "Rosto detectado com sucesso";
    } else {
      faceIcon.textContent = "✗";
      faceIcon.className = "precalib-icon precalib-fail";
      faceDesc.textContent = "Posicione-se de frente para a câmera";
    }
  }

  const distIcon = document.getElementById("precalib-distance-icon");
  const distDesc = document.getElementById("precalib-distance-desc");
  const distIndicator = document.getElementById("precalib-dist-indicator");

  if (distIcon && distDesc && distIndicator) {
    if (!detected) {
      distIcon.textContent = "○";
      distIcon.className = "precalib-icon";
      distDesc.textContent = "Aguardando detecção do rosto...";
      distIndicator.style.display = "none";
    } else {
      distIndicator.style.display = "block";
      const pct = Math.min(Math.max((iod - IOD_MIN) / (IOD_MAX - IOD_MIN), 0), 1) * 100;
      distIndicator.style.left = `${pct}%`;

      if (iod >= IOD_IDEAL_MIN && iod <= IOD_IDEAL_MAX) {
        distIcon.textContent = "✓";
        distIcon.className = "precalib-icon precalib-ok";
        distDesc.textContent = "Distância ideal (~60cm)";
      } else if (iod < IOD_IDEAL_MIN) {
        distIcon.textContent = "⚠";
        distIcon.className = "precalib-icon precalib-warn";
        distDesc.textContent = "Muito longe — aproxime-se da tela";
      } else {
        distIcon.textContent = "⚠";
        distIcon.className = "precalib-icon precalib-warn";
        distDesc.textContent = "Muito perto — afaste-se um pouco";
      }
    }
  }

  const lightIcon = document.getElementById("precalib-light-icon");
  const lightDesc = document.getElementById("precalib-light-desc");
  const lightingWarning = document.getElementById("lighting-warning");
  const isDark = lightingWarning ? lightingWarning.style.display !== 'none' : false;

  if (lightIcon && lightDesc) {
    if (!detected) {
      lightIcon.textContent = "○";
      lightIcon.className = "precalib-icon";
    } else if (isDark) {
      lightIcon.textContent = "✗";
      lightIcon.className = "precalib-icon precalib-fail";
      lightDesc.textContent = "Iluminação insuficiente — aproxime-se de uma luz";
    } else {
      lightIcon.textContent = "✓";
      lightIcon.className = "precalib-icon precalib-ok";
      lightDesc.textContent = "Iluminação adequada";
    }
  }
}

function closePreCalibration() {
  isPreCalibrating = false;
  document.getElementById("precalib-overlay")?.remove();
}

// ── Variância de features ─────────────────────────────────────────────────────
function calculateFeatureVariance(featuresList: number[][]): number {
  if (featuresList.length === 0) return 0;
  const numFeatures = featuresList[0].length;
  let totalVar = 0;
  for (let j = 0; j < numFeatures; j++) {
    let sum = 0;
    for (let i = 0; i < featuresList.length; i++) sum += featuresList[i][j];
    const mean = sum / featuresList.length;
    let sumSq = 0;
    for (let i = 0; i < featuresList.length; i++) {
      const diff = featuresList[i][j] - mean;
      sumSq += diff * diff;
    }
    totalVar += sumSq / featuresList.length;
  }
  return totalVar / numFeatures;
}

// ── Calibração Estática (9 pontos) ───────────────────────────────────────────

export function startCalibrationMode() {
  if (isCalibrating) return;
  isCalibrating         = true;
  currentPointIndex     = 0;
  isCollecting          = false;
  profile               = [];
  dynamicSamples        = [];
  collectedFeaturesLeft  = [];
  collectedFeaturesRight = [];
  ridgeModelLeft        = null;
  ridgeModelRight       = null;
  baselineVariances     = [];
  calibEarHistory.length = 0;
  calibrationPoses      = [];
  sessionCorrection     = null;
  createCalibrationOverlay();
  startCountdown();
}

let countdownTimer: number | null = null;
function startCountdown() {
  const overlay = document.getElementById("calibration-overlay");
  if (!overlay) return;

  const instruction = document.getElementById("calibration-instruction");
  if (instruction) {
    instruction.innerHTML = `
      Prepare-se! A calibração começará em breve.<br>
      <span class="highlight">Foque no ponto que aparecerá e não desvie o olhar.</span>
    `;
  }

  let count = 5;
  const countDisplay = document.createElement("div");
  countDisplay.id = "calibration-countdown";
  countDisplay.style.cssText = "position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-size:6rem;color:#00fff0;font-weight:bold;text-shadow:0 0 20px rgba(0,255,240,0.5)";
  countDisplay.innerText = count.toString();
  overlay.appendChild(countDisplay);

  countdownTimer = window.setInterval(() => {
    count--;
    if (count > 0) {
      countDisplay.innerText = count.toString();
    } else {
      if (countdownTimer) clearInterval(countdownTimer);
      countDisplay.remove();
      showNextPoint();
    }
  }, 1000);
}

function runAccuracyTest() {
  setTimeout(() => {
    startAccuracyTest((result) => updateStatusUI(result));
  }, 800);
}

function cancelCalibration() {
  isDynamicCalibrating = false;
  dynamicSamples       = [];
  baselineVariances    = [];
  calibEarHistory.length = 0;
  cleanupOverlay();
  loadProfile();
  updateStatusUI();
  isCalibrating = false;
  if (countdownTimer) clearInterval(countdownTimer);
}

function createCalibrationOverlay() {
  if (document.getElementById("calibration-overlay")) return;

  const overlay = document.createElement("div");
  overlay.id = "calibration-overlay";
  overlay.className = "calibration-overlay";
  overlay.innerHTML = `
    <div id="calibration-instruction" class="calibration-instruction"></div>
    <button id="btn-cancel-calibration" class="btn btn-secondary cancel-btn">Cancelar</button>
  `;
  document.body.appendChild(overlay);

  document.getElementById("btn-cancel-calibration")?.addEventListener("click", (e) => {
    e.stopPropagation();
    cancelCalibration();
  });
}

function cleanupOverlay() {
  document.getElementById("calibration-overlay")?.remove();
}

function showNextPoint() {
  const overlay = document.getElementById("calibration-overlay");
  if (!overlay) return;

  document.getElementById("calibration-dot")?.remove();

  const point = TARGET_POINTS[currentPointIndex];
  // Sprint 3 – T5: posicionamento em px via clientWidth/Height (consistente com predição)
  const { w, h } = getViewport();
  const dot = document.createElement("div");
  dot.id = "calibration-dot";
  dot.className = "calibration-dot";
  dot.style.left = `${Math.round(point.screenX * w)}px`;
  dot.style.top  = `${Math.round(point.screenY * h)}px`;
  dot.innerHTML = `
    <div class="dot-inner"></div>
    <div class="dot-pulse"></div>
    <svg class="countdown-ring" viewBox="0 0 56 56" xmlns="http://www.w3.org/2000/svg">
      <circle class="ring-track" cx="28" cy="28" r="24"/>
      <circle class="ring-fill"  cx="28" cy="28" r="24"/>
    </svg>
  `;
  overlay.appendChild(dot);

  const instruction = document.getElementById("calibration-instruction");
  if (instruction) {
    instruction.innerHTML = `
      Olhe fixamente para o ponto <span class="highlight">${currentPointIndex + 1}/${TARGET_POINTS.length}</span>
    `;
  }

  setTimeout(() => {
    startCollection();
  }, TRANSITION_MS);
}

function startCollection() {
  if (isDynamicCalibrating || isCollecting || !isCalibrating) return;
  isCollecting          = true;
  collectionStartTime   = performance.now();
  collectedFeaturesLeft  = [];
  collectedFeaturesRight = [];

  const dot = document.getElementById("calibration-dot");
  if (dot) {
    dot.classList.remove("capturing", "unstable", "captured");
    void (dot as HTMLElement).offsetWidth;
    dot.classList.add("capturing");
  }
}

// ── Ingestão de dados de calibração ──────────────────────────────────────────

// ear é passado pelo main.ts para filtragem de fechamento parcial (T2)
// headPose passado pelo main.ts para acúmulo da pose de referência (Sprint 4 – T4)
export function feedRawData(
  featuresLeft: number[],
  featuresRight: number[],
  ear = 1.0,
  headPose?: HeadPose,
) {
  // Sprint 4 – T3: mantém as últimas features para express recalibration
  latestFeaturesLeft  = featuresLeft;
  latestFeaturesRight = featuresRight;

  if (isDynamicCalibrating) {
    // Sprint 3 – T1: só amostras de fixação (sem trânsito)
    if (!dynamicIsFixation) return;
    // Sprint 3 – T2: descarta onset de cada fixação
    if (performance.now() - dynamicFixationStartTime < ONSET_SKIP_MS) return;
    // Sprint 3 – T2: descarta fechamento parcial
    if (isPartialBlink(ear)) return;

    dynamicSamples.push({
      screenX:      dynamicBallX,
      screenY:      dynamicBallY,
      featuresLeft,
      featuresRight,
    });
    // Sprint 4 – T4: acumula pose durante fixações de calibração
    if (headPose) calibrationPoses.push(headPose);
    return;
  }

  if (!isCalibrating || !isCollecting) return;
  // Sprint 3 – T2: onset skip na calibração estática
  if (performance.now() - collectionStartTime < ONSET_SKIP_MS) return;
  // Sprint 3 – T2: rejeita fechamento parcial
  if (isPartialBlink(ear)) return;

  collectedFeaturesLeft.push(featuresLeft);
  collectedFeaturesRight.push(featuresRight);

  if (performance.now() - collectionStartTime >= COLLECTION_MS) {
    isCollecting = false;
    processStaticPoint();
  }
}

function processStaticPoint() {
  const avgVarLeft  = calculateFeatureVariance(collectedFeaturesLeft);
  const avgVarRight = calculateFeatureVariance(collectedFeaturesRight);

  // Sprint 3 – T6: threshold adaptativo baseado em pontos anteriores bem-sucedidos
  const threshold = getVarianceThreshold();

  if (avgVarLeft > threshold || avgVarRight > threshold) {
    const instruction = document.getElementById("calibration-instruction");
    if (instruction) {
      instruction.innerHTML = `<span class="highlight" style="color:#ff3366;">Atenção! Movimento detectado.</span><br>Reiniciando este ponto…`;
    }
    const dot = document.getElementById("calibration-dot");
    if (dot) dot.classList.add("unstable");
    setTimeout(() => { showNextPoint(); }, 2000);
    return;
  }

  // Sprint 3 – T6: registra variância do ponto bem-sucedido para calibrar o threshold
  baselineVariances.push(Math.max(avgVarLeft, avgVarRight));

  const targetX = TARGET_POINTS[currentPointIndex].screenX;
  const targetY = TARGET_POINTS[currentPointIndex].screenY;

  for (let i = 0; i < collectedFeaturesLeft.length; i++) {
    profile.push({
      screenX:      targetX,
      screenY:      targetY,
      featuresLeft:  collectedFeaturesLeft[i],
      featuresRight: collectedFeaturesRight[i],
    });
  }

  currentPointIndex++;

  const dot = document.getElementById("calibration-dot");
  if (dot) {
    dot.classList.remove("capturing");
    dot.classList.add("captured");
  }

  setTimeout(() => {
    if (currentPointIndex < TARGET_POINTS.length) {
      showNextPoint();
    } else {
      transitionToDynamicPhase();
    }
  }, TRANSITION_MS);
}

function handleGlobalKeyDown(e: KeyboardEvent) {
  if (!isCalibrating || isCollecting || isDynamicCalibrating) return;
  if (e.code === "Space" || e.code === "Enter") {
    e.preventDefault();
    startCollection();
  }
}

// ── Fase 2: Calibração Dinâmica ──────────────────────────────────────────────

function transitionToDynamicPhase() {
  document.getElementById("calibration-dot")?.remove();
  const instruction = document.getElementById("calibration-instruction");
  if (instruction) {
    instruction.innerHTML = `
      <span class="phase-badge">Fase 1 concluída ✓</span>
      <p class="phase-sub">Preparando calibração dinâmica…</p>
    `;
  }
  setTimeout(startDynamicCalibration, 2000);
}

function startDynamicCalibration() {
  isDynamicCalibrating = true;
  dynamicSamples       = [];

  const overlay = document.getElementById("calibration-overlay");
  if (!overlay) return;
  overlay.classList.add("dynamic-phase");

  const instruction = document.getElementById("calibration-instruction");
  if (instruction) {
    instruction.innerHTML = `
      <span class="phase-badge">Fase 2 / 2 — Calibração Dinâmica</span>
      <p class="phase-sub">Acompanhe a bolinha com os olhos suavemente</p>
    `;
  }

  const progressEl = document.createElement("div");
  progressEl.id = "dynamic-progress";
  progressEl.className = "dynamic-progress";
  DYNAMIC_WAYPOINTS.forEach((_, i) => {
    const d = document.createElement("div");
    d.className = "progress-dot" + (i === 0 ? " active" : "");
    d.id = `pdot-${i}`;
    progressEl.appendChild(d);
  });
  overlay.appendChild(progressEl);

  // Sprint 3 – T5: usa clientWidth/Height para consistência com predição (G8)
  const { w, h } = getViewport();
  const ball = document.createElement("div");
  ball.id = "dynamic-ball";
  ball.className = "dynamic-ball";
  const wp0 = DYNAMIC_WAYPOINTS[0];
  ball.style.left = `${Math.round(wp0.x * w)}px`;
  ball.style.top  = `${Math.round(wp0.y * h)}px`;
  dynamicBallX = wp0.x;
  dynamicBallY = wp0.y;
  overlay.appendChild(ball);

  setTimeout(() => pulseBall(ball, () => runDynamicSequence(1)), 500);
}

function runDynamicSequence(index: number) {
  if (index >= DYNAMIC_WAYPOINTS.length) {
    completeDynamicCalibration();
    return;
  }

  const prev = document.getElementById(`pdot-${index - 1}`);
  if (prev) { prev.classList.remove("active"); prev.classList.add("done"); }
  const curr = document.getElementById(`pdot-${index}`);
  if (curr) curr.classList.add("active");

  const ball = document.getElementById("dynamic-ball") as HTMLElement | null;
  if (!ball) return;

  moveBallSmoothly(ball, DYNAMIC_WAYPOINTS[index], () => {
    pulseBall(ball, () => runDynamicSequence(index + 1));
  });
}

function moveBallSmoothly(
  ball: HTMLElement,
  target: { x: number; y: number },
  onComplete: () => void
) {
  // Sprint 3 – T5: usa clientWidth/Height (G8)
  const { w, h } = getViewport();
  const startX = dynamicBallX * w;
  const startY = dynamicBallY * h;
  const endX   = target.x * w;
  const endY   = target.y * h;
  const t0     = performance.now();

  dynamicIsFixation = false;

  function frame() {
    const t = Math.min((performance.now() - t0) / DYN_MOVE_MS, 1.0);
    const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

    dynamicBallX = (startX + (endX - startX) * e) / w;
    dynamicBallY = (startY + (endY - startY) * e) / h;
    ball.style.left = `${Math.round(dynamicBallX * w)}px`;
    ball.style.top  = `${Math.round(dynamicBallY * h)}px`;

    if (t < 1.0) {
      requestAnimationFrame(frame);
    } else {
      dynamicBallX = target.x;
      dynamicBallY = target.y;
      onComplete();
    }
  }

  requestAnimationFrame(frame);
}

function pulseBall(ball: HTMLElement, onComplete: () => void) {
  dynamicIsFixation     = true;
  // Sprint 3 – T2: registra início da fixação para onset skip
  dynamicFixationStartTime = performance.now();

  ball.classList.remove("pulsing");
  void ball.offsetWidth;
  ball.classList.add("pulsing");

  setTimeout(() => {
    ball.classList.remove("pulsing");
    dynamicIsFixation = false;
    onComplete();
  }, DYN_PULSE_MS);
}

// ── Completar calibração dinâmica ─────────────────────────────────────────────
function completeDynamicCalibration() {
  isDynamicCalibrating = false;

  // Sprint 3 – T1: dynamicSamples já contém apenas amostras de fixação
  // (feedRawData filtra trânsito + onset + piscada parcial)
  for (const s of dynamicSamples) {
    profile.push({
      screenX:      s.screenX,
      screenY:      s.screenY,
      featuresLeft:  s.featuresLeft,
      featuresRight: s.featuresRight,
    });
  }

  const instruction = document.getElementById("calibration-instruction");
  if (instruction) {
    instruction.innerHTML = `<span class="phase-badge">Otimizando modelo…</span>`;
  }

  const trainFeaturesLeft  = profile.map(p => p.featuresLeft);
  const trainFeaturesRight = profile.map(p => p.featuresRight);
  const trainTargets       = profile.map(p => ({ screenX: p.screenX, screenY: p.screenY }));

  // Fit scalers
  featureScalerLeft.fit(trainFeaturesLeft);
  featureScalerRight.fit(trainFeaturesRight);

  const scaledLeft  = featureScalerLeft.transform(trainFeaturesLeft);
  const scaledRight = featureScalerRight.transform(trainFeaturesRight);

  // Sprint 3 – T3: λ ótimo por LOO-CV (usa olho esquerdo; aplica a ambos)
  const bestLambda = findBestLambda(scaledLeft, trainTargets);

  // Sprint 3 – T3: treina com λ ótimo
  ridgeModelLeft  = trainRidgeModel(scaledLeft,  trainTargets, bestLambda);
  ridgeModelRight = trainRidgeModel(scaledRight, trainTargets, bestLambda);

  // Sprint 3 – T4: hull (bounding box) dos pontos de calibração
  calibHull = {
    minX: Math.min(...trainTargets.map(t => t.screenX)),
    maxX: Math.max(...trainTargets.map(t => t.screenX)),
    minY: Math.min(...trainTargets.map(t => t.screenY)),
    maxY: Math.max(...trainTargets.map(t => t.screenY)),
  };

  // Sprint 4 – T4: pose de referência = média das poses de fixação da calibração
  if (calibrationPoses.length > 0) {
    refHeadPose = averageHeadPose(calibrationPoses);
  }
  poseCheckDone = false;
  sessionCorrection = null;

  console.info(`[IrisFlow S3] Amostras de treino: ${profile.length} | Hull: [${calibHull.minX.toFixed(2)},${calibHull.maxX.toFixed(2)}]×[${calibHull.minY.toFixed(2)},${calibHull.maxY.toFixed(2)}]`);
  if (refHeadPose) {
    console.info(`[IrisFlow S4] Pose ref: tx=${refHeadPose.tx.toFixed(3)} ty=${refHeadPose.ty.toFixed(3)} tz=${refHeadPose.tz.toFixed(3)} dist=${refHeadPose.distanceCm.toFixed(1)}cm`);
  }

  saveProfile();
  cleanupOverlay();
  isCalibrating = false;
  window.removeEventListener("keydown", handleGlobalKeyDown);
  runAccuracyTest();
}

// ── Painel de Controle ───────────────────────────────────────────────────────

export function createControlPanel() {
  if (document.getElementById("calibration-control-panel")) return;

  const panel = document.createElement("div");
  panel.id = "calibration-control-panel";
  panel.className = "calibration-control-panel";
  panel.innerHTML = `
    <div class="panel-header">
      Calibração Ocular
      <span id="session-counter" class="session-counter">Sessão ${sessionCount}</span>
    </div>
    <div class="panel-status">
      Status: <span id="calibration-status-badge" class="badge">Não Calibrado</span>
    </div>
    <div id="signal-quality-row" class="signal-quality-row">
      <span class="sq-label">Sinal</span>
      <div class="sq-bar-wrap"><div id="sq-bar" class="sq-bar"></div></div>
      <span id="sq-pct" class="sq-pct">—</span>
    </div>
    <div id="fps-row" class="fps-row">
      <span class="fps-label">FPS</span>
      <span id="fps-value" class="fps-value">—</span>
    </div>
    <div id="lighting-warning" class="lighting-warning" style="display:none">
      ⚠ Iluminação insuficiente (&lt;200 lux estimado). Aproxime-se de uma fonte de luz.
    </div>
    <div id="accuracy-result-area"></div>
    <div class="panel-actions">
      <button id="btn-start-calibration" class="btn btn-primary">Iniciar</button>
      <button id="btn-clear-calibration" class="btn btn-secondary">Limpar</button>
    </div>
    <div class="privacy-note">🔒 Todo processamento ocorre localmente. Nenhum dado de vídeo ou olhar é transmitido.</div>
  `;
  document.body.appendChild(panel);

  document.getElementById("btn-start-calibration")?.addEventListener("click", startPreCalibration);
  document.getElementById("btn-clear-calibration")?.addEventListener("click", clearCalibration);
}

export function updateSignalQuality(pct: number): void {
  const bar  = document.getElementById("sq-bar");
  const text = document.getElementById("sq-pct");
  if (bar)  bar.style.width  = `${pct}%`;
  if (bar)  bar.className    = `sq-bar ${pct >= 80 ? 'sq-good' : pct >= 50 ? 'sq-ok' : 'sq-poor'}`;
  if (text) text.textContent = `${pct}%`;
}

export function updateFpsDisplay(fps: number): void {
  const el = document.getElementById("fps-value");
  if (el) el.textContent = String(fps);
}

export function updateLightingWarning(isDark: boolean): void {
  const el = document.getElementById("lighting-warning");
  if (el) el.style.display = isDark ? 'block' : 'none';
}

export function addFilterControls(
  defaultMincutoff: number,
  defaultBeta: number,
  onChange: (mincutoff: number, beta: number) => void
): void {
  const panel = document.getElementById('calibration-control-panel');
  if (!panel || document.getElementById('filter-controls-section')) return;

  const section = document.createElement('div');
  section.id = 'filter-controls-section';
  section.className = 'filter-controls-section';
  section.innerHTML = `
    <div class="panel-header" style="margin-top:6px">Filtro (1€)</div>
    <div class="filter-row">
      <span class="filter-label">Suavidade</span>
      <input type="range" id="filter-mincutoff"
        min="0.1" max="3.0" step="0.1" value="${defaultMincutoff}">
      <span id="filter-mc-val" class="filter-val">${defaultMincutoff.toFixed(1)}</span>
    </div>
    <div class="filter-row">
      <span class="filter-label">Velocidade</span>
      <input type="range" id="filter-beta"
        min="0" max="0.05" step="0.001" value="${defaultBeta}">
      <span id="filter-b-val" class="filter-val">${defaultBeta.toFixed(3)}</span>
    </div>
  `;

  const privacyNote = panel.querySelector('.privacy-note');
  if (privacyNote) {
    panel.insertBefore(section, privacyNote);
  } else {
    panel.appendChild(section);
  }

  const mcInput = document.getElementById('filter-mincutoff') as HTMLInputElement;
  const bInput  = document.getElementById('filter-beta')      as HTMLInputElement;
  const mcVal   = document.getElementById('filter-mc-val');
  const bVal    = document.getElementById('filter-b-val');

  function update(): void {
    const mc = parseFloat(mcInput.value);
    const b  = parseFloat(bInput.value);
    if (mcVal) mcVal.textContent = mc.toFixed(1);
    if (bVal)  bVal.textContent  = b.toFixed(3);
    onChange(mc, b);
  }

  mcInput.addEventListener('input', update);
  bInput.addEventListener('input', update);
}

export function updateStatusUI(accuracyResult?: {
  meanError: number;
  maxError: number;
  score: string;
  colorClass: string;
  meanErrorDeg?: number;
}) {
  const badge    = document.getElementById("calibration-status-badge");
  const clearBtn = document.getElementById("btn-clear-calibration") as HTMLButtonElement;

  if (badge) {
    if (isCalibrated()) {
      badge.innerText = "Calibrado";
      badge.className = "badge status-calibrated";
      if (clearBtn) clearBtn.disabled = false;
    } else {
      badge.innerText = "Não Calibrado";
      badge.className = "badge status-uncalibrated";
      if (clearBtn) clearBtn.disabled = true;
      const area = document.getElementById("accuracy-result-area");
      if (area) area.innerHTML = "";
    }
  }

  if (accuracyResult) {
    const area = document.getElementById("accuracy-result-area");
    if (area) {
      const degLine = accuracyResult.meanErrorDeg !== undefined
        ? `<div class="accuracy-detail">Erro angular: <strong>${accuracyResult.meanErrorDeg.toFixed(2)}°</strong></div>`
        : '';
      area.innerHTML = `
        <div class="accuracy-result ${accuracyResult.colorClass}">
          <div class="accuracy-label">Precisão</div>
          <div class="accuracy-score">${accuracyResult.score}</div>
          <div class="accuracy-detail">Erro médio: <strong>${Math.round(accuracyResult.meanError)}px</strong></div>
          <div class="accuracy-detail">Erro máximo: <strong>${Math.round(accuracyResult.maxError)}px</strong></div>
          ${degLine}
        </div>
      `;
    }
  }
}

export function init() {
  loadSessionCount();
  loadProfile();
  createControlPanel();
  updateStatusUI();
  try {
    const saved = localStorage.getItem("accuracyResult");
    if (saved && isCalibrated()) updateStatusUI(JSON.parse(saved));
  } catch (_) {}
}

// ── Sprint 4 – Detecção de drift inter-sessão ─────────────────────────────────

function averageHeadPose(poses: HeadPose[]): HeadPose {
  const n = poses.length;
  const sum = poses.reduce((acc, p) => ({
    tx: acc.tx + p.tx, ty: acc.ty + p.ty, tz: acc.tz + p.tz,
    yaw: acc.yaw + p.yaw, pitch: acc.pitch + p.pitch, roll: acc.roll + p.roll,
    distanceCm: acc.distanceCm + p.distanceCm,
  }), { tx: 0, ty: 0, tz: 0, yaw: 0, pitch: 0, roll: 0, distanceCm: 0 });
  return { tx: sum.tx/n, ty: sum.ty/n, tz: sum.tz/n, yaw: sum.yaw/n, pitch: sum.pitch/n, roll: sum.roll/n, distanceCm: sum.distanceCm/n };
}

// T3: acumula 90 frames de pose após calibração e compara com referência
const POSE_BUFFER_SIZE = 90;
const DRIFT_THRESHOLD_TX = 0.04;  // ~4cm em coords normalizadas (empírico)
const DRIFT_THRESHOLD_TY = 0.04;
const DRIFT_THRESHOLD_DIST = 10;  // 10cm de mudança de distância

export function feedPoseFrame(pose: HeadPose): void {
  if (!refHeadPose || poseCheckDone) return;
  poseBuffer.push(pose);
  if (poseBuffer.length >= POSE_BUFFER_SIZE) {
    const avg = averageHeadPose(poseBuffer);
    poseBuffer = [];
    poseCheckDone = true;
    checkInterSessionDrift(avg);
  }
}

function checkInterSessionDrift(avg: HeadPose): void {
  if (!refHeadPose) return;
  const dTx   = Math.abs(avg.tx   - refHeadPose.tx);
  const dTy   = Math.abs(avg.ty   - refHeadPose.ty);
  const dDist = Math.abs(avg.distanceCm - refHeadPose.distanceCm);
  const hasDrift = dTx > DRIFT_THRESHOLD_TX || dTy > DRIFT_THRESHOLD_TY || dDist > DRIFT_THRESHOLD_DIST;
  console.info(`[IrisFlow S4] Drift: Δtx=${dTx.toFixed(3)} Δty=${dTy.toFixed(3)} Δdist=${dDist.toFixed(1)}cm — ${hasDrift ? 'OFERECE recalibração' : 'dentro do limite'}`);
  if (hasDrift) showRecalibrationOffer();
}

function showRecalibrationOffer(): void {
  if (document.getElementById('recalib-offer')) return;
  const banner = document.createElement('div');
  banner.id = 'recalib-offer';
  banner.className = 'recalib-offer';
  banner.innerHTML = `
    <div class="recalib-msg">Sua posição mudou. Recalibração rápida (5 pontos) para restaurar precisão?</div>
    <div class="recalib-actions">
      <button class="btn btn-primary dwell-target" data-key="__express_recalib__">Recalibrar</button>
      <button class="btn btn-secondary dwell-target" data-key="__dismiss_recalib__">Dispensar</button>
    </div>
  `;
  document.body.appendChild(banner);
  banner.querySelector('[data-key="__express_recalib__"]')?.addEventListener('click', () => {
    banner.remove();
    startExpressRecalibration();
  });
  banner.querySelector('[data-key="__dismiss_recalib__"]')?.addEventListener('click', () => {
    banner.remove();
  });
  setTimeout(() => banner.remove(), 30000);
}

// T3: 5-point express recalibration — fits bias/gain correction on top of existing model
const EXPRESS_POINTS = [
  { x: 0.20, y: 0.20 }, { x: 0.80, y: 0.20 }, { x: 0.50, y: 0.50 },
  { x: 0.20, y: 0.80 }, { x: 0.80, y: 0.80 },
];
const EXPRESS_COLLECT_MS = 1000;

export function startExpressRecalibration(): void {
  if (!isCalibrated() || isCalibrating) return;
  const predsX: number[] = [], predsY: number[] = [], targX: number[] = [], targY: number[] = [];
  let idx = 0;

  const { w, h } = getViewport();
  const overlay = document.createElement('div');
  overlay.id = 'express-calib-overlay';
  overlay.className = 'calibration-overlay';
  overlay.innerHTML = '<div id="express-instruction" class="calibration-instruction">Recalibração rápida — olhe para os pontos</div>';
  document.body.appendChild(overlay);

  function showPoint() {
    if (idx >= EXPRESS_POINTS.length) {
      overlay.remove();
      if (predsX.length >= 3) {
        const corrX = fitLinear1D(predsX, targX);
        const corrY = fitLinear1D(predsY, targY);
        sessionCorrection = { scaleX: corrX.scale, biasX: corrX.bias, scaleY: corrY.scale, biasY: corrY.bias };
        console.info(`[IrisFlow S4] Express recalib: scaleX=${corrX.scale.toFixed(3)} biasX=${corrX.bias.toFixed(3)} scaleY=${corrY.scale.toFixed(3)} biasY=${corrY.bias.toFixed(3)}`);
      }
      return;
    }
    document.getElementById('express-dot')?.remove();
    const pt = EXPRESS_POINTS[idx];
    const dot = document.createElement('div');
    dot.id = 'express-dot';
    dot.className = 'calibration-dot';
    dot.style.left = `${Math.round(pt.x * w)}px`;
    dot.style.top  = `${Math.round(pt.y * h)}px`;
    dot.innerHTML = '<div class="dot-inner"></div><div class="dot-pulse"></div>';
    overlay.appendChild(dot);

    const t0 = performance.now();
    const rawPreds: { nx: number; ny: number }[] = [];

    function collect() {
      if (performance.now() - t0 < EXPRESS_COLLECT_MS) {
        const r = getLatestPredRaw();
        if (r) rawPreds.push({ nx: r.normX, ny: r.normY });
        requestAnimationFrame(collect);
      } else {
        if (rawPreds.length > 0) {
          const avgNx = rawPreds.reduce((s, v) => s + v.nx, 0) / rawPreds.length;
          const avgNy = rawPreds.reduce((s, v) => s + v.ny, 0) / rawPreds.length;
          predsX.push(avgNx); targX.push(pt.x);
          predsY.push(avgNy); targY.push(pt.y);
        }
        idx++;
        setTimeout(showPoint, 600);
      }
    }
    requestAnimationFrame(collect);
  }
  setTimeout(showPoint, 800);
}

function fitLinear1D(preds: number[], targets: number[]): { scale: number; bias: number } {
  const n = preds.length;
  if (n < 2) return { scale: 1, bias: 0 };
  let sp = 0, st = 0, spp = 0, stp = 0;
  for (let i = 0; i < n; i++) { sp += preds[i]; st += targets[i]; spp += preds[i]*preds[i]; stp += targets[i]*preds[i]; }
  const det = n*spp - sp*sp;
  if (Math.abs(det) < 1e-12) return { scale: 1, bias: 0 };
  const scale = (n*stp - st*sp) / det;
  const bias  = (st - scale*sp) / n;
  return { scale, bias };
}

function getLatestPredRaw(): { normX: number; normY: number } | null {
  if (!ridgeModelLeft || !ridgeModelRight || latestFeaturesLeft.length === 0) return null;
  const sl = featureScalerLeft.transformSingle(latestFeaturesLeft);
  const sr = featureScalerRight.transformSingle(latestFeaturesRight);
  const pl = predictRidge(ridgeModelLeft,  sl);
  const pr = predictRidge(ridgeModelRight, sr);
  return { normX: (pl.normX + pr.normX) / 2, normY: (pl.normY + pr.normY) / 2 };
}

// ── Mapeamento de Olhar ───────────────────────────────────────────────────────
// Sprint 3 – T4: retorna GazeResult com lowConfidence quando fora do hull (G7).
// Clamp ao viewport mantido para display do cursor, mas SEM compressão linear interna.

export function mapGaze(featuresLeft: number[], featuresRight: number[]): GazeResult | null {
  if (!ridgeModelLeft || !ridgeModelRight) return null;

  const scaledLeft  = featureScalerLeft.transformSingle(featuresLeft);
  const scaledRight = featureScalerRight.transformSingle(featuresRight);

  const predLeft  = predictRidge(ridgeModelLeft,  scaledLeft);
  const predRight = predictRidge(ridgeModelRight, scaledRight);

  let normX = (predLeft.normX + predRight.normX) / 2;
  let normY = (predLeft.normY + predRight.normY) / 2;

  // Sprint 4 – T3: aplica correção inter-sessão bias/ganho se disponível
  if (sessionCorrection) {
    normX = normX * sessionCorrection.scaleX + sessionCorrection.biasX;
    normY = normY * sessionCorrection.scaleY + sessionCorrection.biasY;
  }

  // Flag de baixa confiança: predição fora do hull de calibração
  const lowConfidence =
    normX < calibHull.minX || normX > calibHull.maxX ||
    normY < calibHull.minY || normY > calibHull.maxY;

  // Sprint 3 – T5: viewport via helper único
  const { w, h } = getViewport();
  return {
    x: Math.max(0, Math.min(w, normX * w)),
    y: Math.max(0, Math.min(h, normY * h)),
    lowConfidence,
  };
}
