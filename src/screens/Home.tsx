// Sprint U1 — Home screen: page set grid + status bar.

import { navigate, type Route } from '../shell/Router';
import { gazeCalibrated, gazeTracking, sidecarStatus, gazeFps, gazeSignalQuality } from '../store/gazeStore';
import { SelectionEngine } from '../engine/SelectionEngine';

const PAGE_SETS: Array<{ id: Route; label: string; desc: string }> = [
  { id: 'communication', label: 'Comunicacao',   desc: 'Grade AAC principal' },
  { id: 'keyboard',      label: 'Teclado',        desc: 'Digitar por olhar' },
  { id: 'quick-phrases', label: 'Frases rapidas', desc: 'Respostas em 1 olhar' },
  { id: 'alerts',        label: 'Alertas',        desc: 'Chamar ajuda' },
];

SelectionEngine.onSelect(ev => {
  const page = PAGE_SETS.find(p => `home-cell-${p.id}` === ev.id);
  if (page) navigate(page.id);
  if (ev.id === 'home-calibrate') navigate('calibration');
});

function StatusBar() {
  const tracking = gazeTracking.value;
  const calibrated = gazeCalibrated.value;
  const sidecar = sidecarStatus.value;

  return (
    <div class="status-bar">
      <span class={`status-dot status-dot--${tracking === 'tracking' ? 'ok' : 'warn'}`} aria-hidden="true" />
      <span class="status-label">IrisFlow</span>
      <span class="status-fps">{gazeFps.value} fps</span>
      <span class="status-signal">Sinal: {gazeSignalQuality.value}%</span>
      {sidecar !== 'stopped' && (
        <span class={`sidecar-badge sidecar-badge--${sidecar}`}>
          Motor: {sidecar === 'ready' ? 'pronto' : sidecar}
        </span>
      )}
      {!calibrated && (
        <span class="status-warn">Nao calibrado</span>
      )}
    </div>
  );
}

function PageCell({ page }: { page: typeof PAGE_SETS[0] }) {
  return (
    <button
      class="page-cell dwell-target"
      data-gaze-id={`home-cell-${page.id}`}
      onClick={() => navigate(page.id)}
    >
      <span class="page-cell__label">{page.label}</span>
      <span class="page-cell__desc">{page.desc}</span>
    </button>
  );
}

export function Home() {
  return (
    <div class="screen home-screen">
      <StatusBar />

      <div class="page-grid">
        {PAGE_SETS.map(p => <PageCell key={p.id} page={p} />)}
      </div>

      {!gazeCalibrated.value && (
        <div class="calib-prompt">
          <button
            class="btn-primary dwell-target"
            data-gaze-id="home-calibrate"
            onClick={() => navigate('calibration')}
          >
            Calibrar rastreamento
          </button>
        </div>
      )}
    </div>
  );
}
