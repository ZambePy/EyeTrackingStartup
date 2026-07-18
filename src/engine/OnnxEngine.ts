// Sprint E4 — ONNX Runtime Web inference for daily-use mode (no Python sidecar needed).
//
// After calibration the personalised .onnx model is downloaded from the sidecar
// and cached to userData/profiles/<id>/model.onnx (via IPC).
// This engine loads it and runs inference inside a Web Worker so the main thread
// is never blocked.
//
// extract_features() reimplementation in TypeScript lives here alongside the engine
// so that both sides (sidecar for calibration, OnnxEngine for daily use) use the same
// preprocessing path — pariry test gate from Sprint E4.

import { signal } from '@preact/signals';

export type OnnxStatus = 'idle' | 'loading' | 'ready' | 'error';
export const onnxStatus = signal<OnnxStatus>('idle');

class OnnxEngineImpl {
  // Will hold an ort.InferenceSession once onnxruntime-web is added (Sprint E4).
  // Typed as unknown here to avoid pulling the full ORT dependency into the scaffold.
  private session: unknown = null;

  async load(_modelPath: string): Promise<void> {
    // E4 implementation:
    //   const ort = await import('onnxruntime-web')
    //   this.session = await ort.InferenceSession.create(modelPath, { executionProviders: ['wasm'] })
    //   onnxStatus.value = 'ready'
    onnxStatus.value = 'idle';
    console.info('[OnnxEngine] stub — implement in Sprint E4');
  }

  // E4: infer from pre-extracted features (same shapes as EyeTheia server expects).
  async infer(
    _faceImg: Float32Array,   // 224×224×3
    _leftEye: Float32Array,   // 224×224×3
    _rightEye: Float32Array,  // 224×224×3
    _faceGrid: Float32Array,  // 25×25
  ): Promise<{ x: number; y: number }> {
    return { x: 0, y: 0 };
  }

  isReady(): boolean { return this.session !== null; }
}

export const onnxEngine = new OnnxEngineImpl();
