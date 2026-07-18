// Sprint U8 — Tracking monitor (caregiver view).
// Live telemetry: FPS, signal quality, pipeline state, last validation error.

import {
  gazeX, gazeY, gazeTracking, gazeCalibrated,
  gazeFps, gazeSignalQuality, blinkState, sidecarStatus,
} from '../store/gazeStore';
import { onnxStatus } from '../engine/OnnxEngine';
import { wsStatus }   from '../engine/WsClient';

function MetricRow({ label, value, status }: { label: string; value: string; status?: 'ok' | 'warn' | 'error' }) {
  return (
    <div class={`metric-row ${status ? `metric-row--${status}` : ''}`}>
      <span class="metric-label">{label}</span>
      <span class="metric-value">{value}</span>
    </div>
  );
}

export function Monitor() {
  const tracking = gazeTracking.value;

  return (
    <div class="screen monitor-screen">
      <h2 class="screen-title">Monitor de Rastreamento</h2>

      <section class="monitor-section">
        <h3 class="section-title">Pipeline</h3>
        <MetricRow
          label="Camera / MediaPipe"
          value={tracking}
          status={tracking === 'tracking' ? 'ok' : tracking === 'lost' ? 'error' : 'warn'}
        />
        <MetricRow label="Calibracao"  value={gazeCalibrated.value ? 'pronto' : 'necessaria'} status={gazeCalibrated.value ? 'ok' : 'warn'} />
        <MetricRow label="Sidecar"     value={sidecarStatus.value} status={sidecarStatus.value === 'ready' ? 'ok' : 'warn'} />
        <MetricRow label="ONNX"        value={onnxStatus.value} />
        <MetricRow label="WebSocket"   value={wsStatus.value} />
      </section>

      <section class="monitor-section">
        <h3 class="section-title">Metricas ao vivo</h3>
        <MetricRow label="FPS"             value={`${gazeFps.value}`}            status={gazeFps.value >= 25 ? 'ok' : 'warn'} />
        <MetricRow label="Qualidade sinal" value={`${gazeSignalQuality.value}%`} status={gazeSignalQuality.value >= 80 ? 'ok' : gazeSignalQuality.value >= 50 ? 'warn' : 'error'} />
        <MetricRow label="Gaze X"          value={`${Math.round(gazeX.value)}px`} />
        <MetricRow label="Gaze Y"          value={`${Math.round(gazeY.value)}px`} />
        <MetricRow label="Piscada"         value={blinkState.value} />
      </section>

      <section class="monitor-section">
        <h3 class="section-title">Acoes de diagnostico</h3>
        <div class="monitor-actions">
          <button class="btn-secondary" onClick={() => window.location.reload()}>
            Reiniciar motor
          </button>
        </div>
        <p class="monitor-note">
          Log de sessao: Ctrl+L para iniciar/pausar, Ctrl+E para exportar.
        </p>
      </section>
    </div>
  );
}
