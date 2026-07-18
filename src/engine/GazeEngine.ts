import { FilesetResolver, FaceLandmarker } from '@mediapipe/tasks-vision';
import { extractEyeFeatures } from '../core/extractor';
import { gazeFilter, setGazeFilterParams } from '../core/filters/oneEuroFilter';
import { blinkDetector } from '../core/filters/blinkDetector';
import { mapGaze, feedFeatures, isCalibrated } from '../core/calibration';
import { feedRaw, feedFiltered, feedIod } from '../core/accuracy';
import { getViewport } from '../core/viewport';
import { logFrame, isSessionLogging } from '../core/sessionLog';
import {
  gazeX, gazeY, gazeTracking, gazeCalibrated, gazeLowConf,
  blinkState, gazeFps, gazeSignalQuality,
} from '../store/gazeStore';
import { settings } from '../store/settingsStore';

const WASM_PATH = import.meta.env.DEV
  ? './mediapipe/wasm'
  : 'irisflow://mediapipe/wasm';

const MODEL_PATH = import.meta.env.DEV
  ? './models/face_landmarker.task'
  : 'irisflow://models/face_landmarker.task';

// ── Calibration context ───────────────────────────────────────────────────────
// The CalibrationFlow screen sets pendingFeedback to receive raw features.
// The engine calls it on every valid frame while _calibrating is true.
export const CalibrationContext = {
  active: false,
  pendingFeedback: null as ((left: number[], right: number[], ear: number) => void) | null,
};

// ── Engine ────────────────────────────────────────────────────────────────────

class GazeEngineImpl {
  private faceLandmarker: FaceLandmarker | null = null;
  private video: HTMLVideoElement | null = null;

  private lastVideoTime = -1;
  private lastValidX = 0;
  private lastValidY = 0;
  private running = false;
  private animFrameId = 0;
  private fpsCount = 0;
  private fpsLastTime = 0;
  private signalTs: Array<{ time: number; hasFace: boolean }> = [];

  // Per-frame log data
  private logFeatLeft: number[] = [];
  private logFeatRight: number[] = [];
  private logPredRaw: { x: number; y: number } | null = null;
  private logEar = 0;
  private logBlink = false;

  async init(video: HTMLVideoElement): Promise<void> {
    this.video = video;
    const { w, h } = getViewport();
    this.lastValidX = w / 2;
    this.lastValidY = h / 2;
    this.fpsLastTime = performance.now();
    gazeTracking.value = 'idle';

    const vision = await FilesetResolver.forVisionTasks(WASM_PATH);
    this.faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: MODEL_PATH, delegate: 'GPU' },
      outputFaceBlendshapes: false,
      outputFacialTransformationMatrixes: true,
      runningMode: 'VIDEO',
      numFaces: 1,
    });

    await this.startCamera();
  }

  private async startCamera(): Promise<void> {
    const video = this.video!;
    let stream: MediaStream | null = null;

    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720, facingMode: 'user' } });
    } catch {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: 'user' } });
      } catch (err) {
        console.error('[GazeEngine] Camera unavailable:', err);
        gazeTracking.value = 'lost';
        return;
      }
    }

    video.srcObject = stream;
    video.addEventListener('loadeddata', () => {
      this.running = true;
      gazeTracking.value = 'tracking';
      this.loop();
    }, { once: true });
  }

  private tickFps(): void {
    this.fpsCount++;
    const now = performance.now();
    const elapsed = now - this.fpsLastTime;
    if (elapsed >= 1000) {
      gazeFps.value = Math.round((this.fpsCount * 1000) / elapsed);
      this.fpsCount = 0;
      this.fpsLastTime = now;
    }
  }

  private recordSignalFrame(hasFace: boolean): void {
    const now = performance.now();
    this.signalTs.push({ time: now, hasFace });
    const cutoff = now - 5000;
    while (this.signalTs.length > 0 && this.signalTs[0].time < cutoff) this.signalTs.shift();
    if (this.signalTs.length % 30 === 0 && this.signalTs.length > 0) {
      gazeSignalQuality.value = Math.round(
        this.signalTs.filter(s => s.hasFace).length / this.signalTs.length * 100,
      );
    }
  }

  private readonly loop = (): void => {
    if (!this.running) return;
    this.animFrameId = requestAnimationFrame(this.loop);

    const video     = this.video!;
    const frameTime = performance.now();

    if (this.lastVideoTime === video.currentTime) return;
    this.lastVideoTime = video.currentTime;
    this.tickFps();

    const results = this.faceLandmarker!.detectForVideo(video, frameTime);
    const hasFace = !!(results.faceLandmarks?.length);
    this.recordSignalFrame(hasFace);

    if (!hasFace) {
      gazeTracking.value = 'lost';
      return;
    }

    gazeTracking.value = 'tracking';
    const landmarks = results.faceLandmarks[0];
    const rawIod = Math.sqrt((landmarks[33].x - landmarks[263].x)**2 + (landmarks[33].y - landmarks[263].y)**2);
    feedIod(rawIod);

    const matResult  = results.facialTransformationMatrixes?.[0];
    const faceMatrix = matResult ? new Float32Array(matResult.data) : undefined;

    const ext = extractEyeFeatures(landmarks, faceMatrix);
    this.logEar   = ext.ear;
    this.logBlink = ext.blinkDetected;

    const blinkResult = blinkDetector.update(ext.ear);
    blinkState.value  = blinkResult.state;

    if (ext.featuresLeft.length > 0) {
      this.logFeatLeft  = ext.featuresLeft;
      this.logFeatRight = ext.featuresRight;

      feedRaw(ext.featuresLeft, ext.featuresRight);
      feedFeatures(ext.featuresLeft, ext.featuresRight);

      // Forward raw features to calibration flow if active
      if (CalibrationContext.active && CalibrationContext.pendingFeedback) {
        CalibrationContext.pendingFeedback(ext.featuresLeft, ext.featuresRight, ext.ear);
      }

      if (!CalibrationContext.active) {
        const { w, h } = getViewport();
        const gaze = mapGaze(ext.featuresLeft, ext.featuresRight, w, h);
        this.logPredRaw = gaze;

        if (!blinkResult.suppressGaze) {
          const rawX = gaze?.x ?? (1.0 - landmarks[1].x) * w;
          const rawY = gaze?.y ?? landmarks[1].y * h;
          const s = settings.value;
          setGazeFilterParams(s.minCutoff, s.beta);
          const filtered = gazeFilter.filter(rawX, rawY, frameTime);
          this.lastValidX = filtered.x;
          this.lastValidY = filtered.y;
        }

        gazeLowConf.value = gaze?.lowConfidence ?? false;
      }
    }

    if (!CalibrationContext.active) {
      gazeX.value = this.lastValidX;
      gazeY.value = this.lastValidY;
    }

    gazeCalibrated.value = isCalibrated();
    feedFiltered(this.lastValidX, this.lastValidY);

    if (isSessionLogging() && this.logFeatLeft.length > 0) {
      logFrame({
        featuresLeft:  this.logFeatLeft,
        featuresRight: this.logFeatRight,
        predRaw:       this.logPredRaw,
        predFiltered:  { x: this.lastValidX, y: this.lastValidY },
        ear:           this.logEar,
        blinkDetected: this.logBlink,
        keyboardVisible: false,
        inAccuracyTest:  false,
      });
    }
  };

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.animFrameId);
  }
}

export const GazeEngine = new GazeEngineImpl();
