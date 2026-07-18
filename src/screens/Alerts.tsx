// Sprint U4 — Alerts / Emergency screen.
// Reachable from any screen in <= 2 gaze selections (U4 gate).
// Alarm cell triggers audible sound + caregiver notification.

import { signal } from '@preact/signals';
import { SelectionEngine } from '../engine/SelectionEngine';

const alarmActive = signal(false);

let alarmAudio: AudioContext | null = null;

function triggerAlarm(): void {
  alarmActive.value = true;
  window.dispatchEvent(new CustomEvent('irisflow:alarm'));

  // Generate audible alarm via Web Audio (no external file needed)
  if (!alarmAudio) alarmAudio = new AudioContext();
  const osc   = alarmAudio.createOscillator();
  const gain  = alarmAudio.createGain();
  osc.type    = 'square';
  osc.frequency.value = 880;
  gain.gain.value = 0.4;
  osc.connect(gain);
  gain.connect(alarmAudio.destination);
  osc.start();
  setTimeout(() => { osc.stop(); alarmActive.value = false; }, 3000);
}

const BODY_PARTS = [
  { id: 'bp-cabeca',   label: 'Cabeca' },
  { id: 'bp-pescoco',  label: 'Pescoco' },
  { id: 'bp-torax',    label: 'Torax' },
  { id: 'bp-abdomen',  label: 'Abdomen' },
  { id: 'bp-costas',   label: 'Costas' },
  { id: 'bp-braco-e',  label: 'Braco Esq' },
  { id: 'bp-braco-d',  label: 'Braco Dir' },
  { id: 'bp-perna-e',  label: 'Perna Esq' },
  { id: 'bp-perna-d',  label: 'Perna Dir' },
];

SelectionEngine.onSelect(ev => {
  if (ev.id === 'alert-alarm') triggerAlarm();
  const bp = BODY_PARTS.find(p => p.id === ev.id);
  if (bp) {
    const utt = new SpeechSynthesisUtterance(`Estou com dor no ${bp.label}`);
    utt.lang = 'pt-BR';
    speechSynthesis.speak(utt);
  }
});

export function Alerts() {
  return (
    <div class="screen alerts-screen">
      <h2 class="screen-title">Alertas</h2>

      {/* Emergency alarm — always top-left, always biggest */}
      <button
        class={`alert-alarm dwell-target ${alarmActive.value ? 'alert-alarm--active' : ''}`}
        data-gaze-id="alert-alarm"
        onClick={triggerAlarm}
        aria-label="Acionar alarme de emergencia"
      >
        {alarmActive.value ? 'ALARME ATIVO' : 'ALARME'}
      </button>

      {/* Body pain locator (U4) */}
      <section class="body-pain-section">
        <h3 class="section-title">Onde esta a dor?</h3>
        <div class="body-grid">
          {BODY_PARTS.map(p => (
            <button
              key={p.id}
              class="body-cell dwell-target"
              data-gaze-id={p.id}
            >
              {p.label}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
