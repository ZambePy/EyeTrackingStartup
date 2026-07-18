// Sprint U6 — Settings screen (user-facing subset).
// Full settings live in CaregiverPanel. This screen shows read-only status
// and the one user-operable action: call caregiver.

import { settings }       from '../../store/settingsStore';
import { gazeCalibrated, gazeFps, gazeSignalQuality, sidecarStatus } from '../../store/gazeStore';
import { navigate }       from '../../shell/Router';
import { SelectionEngine } from '../../engine/SelectionEngine';

SelectionEngine.onSelect(ev => {
  if (ev.id === 'settings-calibrate') navigate('calibration');
  if (ev.id === 'settings-monitor')   navigate('monitor');
});

export function Settings() {
  const s = settings.value;
  return (
    <div class="screen settings-screen">
      <h2 class="screen-title">Status do Sistema</h2>

      <dl class="settings-list">
        <dt>Rastreamento</dt>
        <dd class={gazeCalibrated.value ? 'status-ok' : 'status-warn'}>
          {gazeCalibrated.value ? 'Calibrado' : 'Nao calibrado'}
        </dd>

        <dt>FPS</dt>
        <dd>{gazeFps.value} fps</dd>

        <dt>Qualidade do sinal</dt>
        <dd>{gazeSignalQuality.value}%</dd>

        <dt>Tempo de dwell</dt>
        <dd>{s.dwellMs} ms</dd>

        <dt>Motor (sidecar)</dt>
        <dd class={`status-${sidecarStatus.value}`}>{sidecarStatus.value}</dd>
      </dl>

      <div class="settings-actions">
        <button
          class="btn-primary dwell-target"
          data-gaze-id="settings-calibrate"
          onClick={() => navigate('calibration')}
        >
          Recalibrar
        </button>
        <button
          class="btn-secondary dwell-target"
          data-gaze-id="settings-monitor"
          onClick={() => navigate('monitor')}
        >
          Monitor de rastreamento
        </button>
      </div>

      <p class="settings-note">
        Para alterar dwell, selecao e aparencia, abra o painel do cuidador (Ctrl+G).
      </p>
    </div>
  );
}
