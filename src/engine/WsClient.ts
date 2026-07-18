// Sprint E2 — WebSocket binary protocol for real-time gaze prediction via EyeTheia sidecar.
//
// Protocol (ws_model.py):
//   Client → Server: binary frame  [meta JSON bytes (4 B length prefix) + JPEG bytes]
//   Server → Client: JSON          { x_px: number, y_px: number }
//
// Protocol (ws_calibration.py):
//   calib_start  → { type: 'calib_start', points: 5|9|13 }
//   calib_point  → { type: 'calib_point', image: base64, landmarks: [...], target: [x,y] }
//   Server acks  → { type: 'ack'|'progress'|'result' }

import { signal } from '@preact/signals';

export type WsStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export const wsStatus = signal<WsStatus>('disconnected');

type PredictionCallback = (x: number, y: number) => void;

class EyeTheiaWsClient {
  private wsModel: WebSocket | null = null;
  private predCallbacks = new Set<PredictionCallback>();

  // Latest-only policy: if a new frame arrives before the server acked the last, we discard.
  private pendingSend = false;

  connect(port = 8002): void {
    if (this.wsModel?.readyState === WebSocket.OPEN) return;
    wsStatus.value = 'connecting';

    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws_model`);
    ws.binaryType = 'arraybuffer';

    ws.onopen  = () => { wsStatus.value = 'connected'; this.pendingSend = false; };
    ws.onclose = () => { wsStatus.value = 'disconnected'; this.wsModel = null; };
    ws.onerror = () => { wsStatus.value = 'error'; };

    ws.onmessage = (ev: MessageEvent) => {
      this.pendingSend = false;
      try {
        const msg = JSON.parse(ev.data as string) as { x_px: number; y_px: number };
        this.predCallbacks.forEach(cb => cb(msg.x_px, msg.y_px));
      } catch { /* malformed */ }
    };

    this.wsModel = ws;
  }

  // Sends a JPEG frame + MediaPipe landmarks.
  // latest-only: skips if the previous send hasn't been acked yet.
  sendFrame(jpeg: Blob, landmarks: object[], screenW: number, screenH: number): void {
    if (this.wsModel?.readyState !== WebSocket.OPEN) return;
    if (this.pendingSend) return;

    const meta = JSON.stringify({ screen: { w: screenW, h: screenH }, landmarks });
    const encoder = new TextEncoder();
    const metaBytes = encoder.encode(meta);
    const metaLen = new Uint32Array([metaBytes.byteLength]);

    jpeg.arrayBuffer().then(jpegBuf => {
      const buf = new Uint8Array(4 + metaBytes.byteLength + jpegBuf.byteLength);
      buf.set(new Uint8Array(metaLen.buffer), 0);
      buf.set(metaBytes, 4);
      buf.set(new Uint8Array(jpegBuf), 4 + metaBytes.byteLength);
      this.wsModel!.send(buf.buffer);
      this.pendingSend = true;
    });
  }

  onPrediction(cb: PredictionCallback): () => void {
    this.predCallbacks.add(cb);
    return () => this.predCallbacks.delete(cb);
  }

  disconnect(): void {
    this.wsModel?.close();
    this.wsModel = null;
  }
}

export const wsClient = new EyeTheiaWsClient();
