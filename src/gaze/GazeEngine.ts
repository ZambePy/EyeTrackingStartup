import { FilesetResolver, FaceLandmarker } from '@mediapipe/tasks-vision'
import * as calibration from '../calibration'
import {
  feedAccuracyRaw,
  feedAccuracyFiltered,
  feedAccuracyIod,
  isAccuracyTesting,
} from '../accuracy'
import { logFrame, isSessionLogging } from '../sessionLog'
import { gazeFilter, setGazeFilterParams } from '../oneEuroFilter'
import { blinkDetector } from '../blinkDetector'
import { dwellManager } from '../keyboard/DwellManager'
import { updateDwell, resetDwell } from '../dwell'
import { extractEyeFeatures } from '../extractor'
import { KeyboardState } from '../keyboard/KeyboardState'

// Caminhos locais — SEM CDN, 100% offline após setup
// Dev: Vite serve public/ em http://localhost:5173
// Prod: Electron protocol handler mapeia irisflow:// → dist/
const WASM_PATH = import.meta.env.DEV
  ? './mediapipe/wasm'
  : 'irisflow://mediapipe/wasm'

const MODEL_PATH = import.meta.env.DEV
  ? './models/face_landmarker.task'
  : 'irisflow://models/face_landmarker.task'

type GazeMoveCallback = (x: number, y: number) => void
type BlinkCallback = (intentional: boolean) => void
type VoidCallback = () => void

interface GazeEventMap {
  gazeMove: GazeMoveCallback
  blink: BlinkCallback
  calibrationComplete: VoidCallback
  lowConfidence: GazeMoveCallback
}

type EventKey = keyof GazeEventMap

class GazeEngineImpl {
  private faceLandmarker: FaceLandmarker | null = null
  private video: HTMLVideoElement | null = null
  private canvas: HTMLCanvasElement | null = null
  private cursor: HTMLElement | null = null
  private loadingEl: HTMLElement | null = null

  private lastVideoTime = -1
  private lastValidX = 0
  private lastValidY = 0
  private currentX = 0
  private currentY = 0
  private currentLowConfidence = false

  private running = false
  private animFrameId = 0
  private fpsFrameCount = 0
  private fpsLastTime = 0
  private lightingCanvas: HTMLCanvasElement | null = null
  private signalTimestamps: Array<{ time: number; hasFace: boolean }> = []

  // Listeners de evento
  private listeners = new Map<EventKey, Set<(...args: unknown[]) => void>>()

  // Estado de log por frame
  private logFeaturesLeft: number[] = []
  private logFeaturesRight: number[] = []
  private logPredRaw: { x: number; y: number } | null = null
  private logEar = 0
  private logBlink = false

  on<K extends EventKey>(event: K, cb: GazeEventMap[K]): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set())
    }
    const set = this.listeners.get(event)!
    set.add(cb as (...args: unknown[]) => void)
    return () => set.delete(cb as (...args: unknown[]) => void)
  }

  off<K extends EventKey>(event: K, cb: GazeEventMap[K]): void {
    this.listeners.get(event)?.delete(cb as (...args: unknown[]) => void)
  }

  private emit(event: 'gazeMove', x: number, y: number): void
  private emit(event: 'blink', intentional: boolean): void
  private emit(event: 'calibrationComplete'): void
  private emit(event: 'lowConfidence', x: number, y: number): void
  private emit(event: EventKey, ...args: unknown[]): void {
    this.listeners.get(event)?.forEach(cb => cb(...args))
  }

  async init(
    video: HTMLVideoElement,
    canvas: HTMLCanvasElement,
    cursor: HTMLElement,
    loadingEl: HTMLElement,
  ): Promise<void> {
    this.video = video
    this.canvas = canvas
    this.cursor = cursor
    this.loadingEl = loadingEl
    this.lastValidX = document.documentElement.clientWidth / 2
    this.lastValidY = document.documentElement.clientHeight / 2
    this.currentX = this.lastValidX
    this.currentY = this.lastValidY
    this.fpsLastTime = performance.now()

    // Inicializa MediaPipe com assets locais (nunca CDN)
    const vision = await FilesetResolver.forVisionTasks(WASM_PATH)
    this.faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: MODEL_PATH, delegate: 'GPU' },
      outputFaceBlendshapes: false,
      outputFacialTransformationMatrixes: true,
      runningMode: 'VIDEO',
      numFaces: 1,
    })

    loadingEl.style.display = 'none'
    await this.startCamera()
  }

  private async startCamera(): Promise<void> {
    const video = this.video!
    let stream: MediaStream | null = null

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 1280, height: 720, facingMode: 'user' },
      })
    } catch {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480, facingMode: 'user' },
        })
      } catch (err) {
        console.error('[GazeEngine] Câmera indisponível:', err)
        this.loadingEl!.textContent = 'Erro: câmera não encontrada. Verifique a conexão e recarregue.'
        this.loadingEl!.style.display = 'block'
        return
      }
    }

    video.srcObject = stream
    video.addEventListener(
      'loadeddata',
      () => {
        setInterval(() => this.checkLighting(), 3000)
        this.running = true
        this.loop()
      },
      { once: true },
    )
  }

  private checkLighting(): void {
    const video = this.video
    if (!video || video.videoWidth === 0) return
    if (!this.lightingCanvas) {
      this.lightingCanvas = document.createElement('canvas')
      this.lightingCanvas.width = 32
      this.lightingCanvas.height = 18
    }
    const ctx = this.lightingCanvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0, 32, 18)
    const data = ctx.getImageData(0, 0, 32, 18).data
    let lum = 0
    for (let i = 0; i < data.length; i += 4) {
      lum += data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114
    }
    calibration.updateLightingWarning(lum / (data.length / 4) < 40)
  }

  private tickFps(): void {
    this.fpsFrameCount++
    const now = performance.now()
    const elapsed = now - this.fpsLastTime
    if (elapsed >= 1000) {
      calibration.updateFpsDisplay(Math.round((this.fpsFrameCount * 1000) / elapsed))
      this.fpsFrameCount = 0
      this.fpsLastTime = now
    }
  }

  private recordSignalFrame(hasFace: boolean): void {
    const now = performance.now()
    this.signalTimestamps.push({ time: now, hasFace })
    const cutoff = now - 5000
    while (this.signalTimestamps.length > 0 && this.signalTimestamps[0].time < cutoff) {
      this.signalTimestamps.shift()
    }
    if (this.signalTimestamps.length % 30 === 0 && this.signalTimestamps.length > 0) {
      const pct =
        this.signalTimestamps.filter(s => s.hasFace).length / this.signalTimestamps.length
      calibration.updateSignalQuality(Math.round(pct * 100))
    }
  }

  private readonly loop = (): void => {
    if (!this.running) return
    this.animFrameId = requestAnimationFrame(this.loop)

    const video = this.video!
    const canvas = this.canvas!
    const cursor = this.cursor!

    if (canvas.width !== video.videoWidth) {
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
    }

    const frameTime = performance.now()

    if (this.lastVideoTime !== video.currentTime) {
      this.lastVideoTime = video.currentTime
      this.tickFps()

      const results = this.faceLandmarker!.detectForVideo(video, frameTime)
      const hasFace = !!(results.faceLandmarks && results.faceLandmarks.length > 0)
      this.recordSignalFrame(hasFace)

      if (!hasFace) {
        calibration.feedFaceMetrics(false, 0)
      }

      if (hasFace) {
        const landmarks = results.faceLandmarks[0]
        const rawIod = Math.sqrt(
          (landmarks[33].x - landmarks[263].x) ** 2 +
            (landmarks[33].y - landmarks[263].y) ** 2,
        )
        calibration.feedFaceMetrics(true, rawIod)
        feedAccuracyIod(rawIod)

        const matResult = results.facialTransformationMatrixes?.[0]
        const faceMatrix = matResult ? new Float32Array(matResult.data) : undefined

        const ext = extractEyeFeatures(landmarks, faceMatrix)
        this.logEar = ext.ear
        this.logBlink = ext.blinkDetected

        const blinkResult = blinkDetector.update(ext.ear)

        if (ext.featuresLeft.length > 0) {
          this.logFeaturesLeft = ext.featuresLeft
          this.logFeaturesRight = ext.featuresRight

          calibration.feedRawData(ext.featuresLeft, ext.featuresRight, ext.ear, ext.headPose)
          feedAccuracyRaw(ext.featuresLeft, ext.featuresRight)

          const rawGaze = calibration.mapGaze(ext.featuresLeft, ext.featuresRight)
          this.logPredRaw = rawGaze ? { x: rawGaze.x, y: rawGaze.y } : null
          this.currentLowConfidence = rawGaze?.lowConfidence ?? false

          if (!blinkResult.suppressGaze) {
            let rawX: number
            let rawY: number
            if (rawGaze) {
              rawX = rawGaze.x
              rawY = rawGaze.y
            } else {
              const vw = document.documentElement.clientWidth
              const vh = document.documentElement.clientHeight
              rawX = (1.0 - landmarks[1].x) * vw
              rawY = landmarks[1].y * vh
            }
            const filtered = gazeFilter.filter(rawX, rawY, frameTime)
            this.lastValidX = filtered.x
            this.lastValidY = filtered.y
          }
        }

        this.currentX = this.lastValidX
        this.currentY = this.lastValidY

        if (!calibration.isCalibrating) {
          updateDwell(this.currentX, this.currentY, () => {})
          dwellManager.update(
            this.currentX,
            this.currentY,
            blinkResult.intentionalBlink,
            this.currentLowConfidence,
          )
          if (calibration.isCalibrated()) {
            calibration.feedPoseFrame(ext.headPose)
          }
        } else {
          resetDwell()
          blinkDetector.reset()
          gazeFilter.reset()
        }

        if (this.currentLowConfidence) {
          this.emit('lowConfidence', this.currentX, this.currentY)
        }
        if (blinkResult.intentionalBlink && !calibration.isCalibrating) {
          this.emit('blink', true)
        }
      }
    }

    feedAccuracyFiltered(this.currentX, this.currentY)

    if (isSessionLogging() && this.logFeaturesLeft.length > 0) {
      logFrame({
        featuresLeft: this.logFeaturesLeft,
        featuresRight: this.logFeaturesRight,
        predRaw: this.logPredRaw,
        predFiltered: { x: this.currentX, y: this.currentY },
        ear: this.logEar,
        blinkDetected: this.logBlink,
        keyboardVisible: KeyboardState.getState().isVisible,
        inAccuracyTest: isAccuracyTesting,
      })
    }

    // Cursor: oculto durante calibração, visível sempre fora dela
    if (calibration.isCalibrating) {
      cursor.style.display = 'none'
    } else {
      cursor.style.display = 'block'
      cursor.style.left = `${this.currentX}px`
      cursor.style.top = `${this.currentY}px`
    }

    this.emit('gazeMove', this.currentX, this.currentY)
  }

  stop(): void {
    this.running = false
    cancelAnimationFrame(this.animFrameId)
  }

  applyFilterParams(mincutoff: number, beta: number): void {
    setGazeFilterParams(mincutoff, beta)
    gazeFilter.reset()
  }

  get gaze(): { x: number; y: number } {
    return { x: this.currentX, y: this.currentY }
  }
}

export const GazeEngine = new GazeEngineImpl()
