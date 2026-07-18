// Sprint U3 — Eye-controlled keyboard.
// ABC layout by default; QWERTY toggle. Minimum key size 120×120px logical.
// Word prediction cells (3–5 suggestions) above the keyboard.

import { signal } from '@preact/signals';
import { SelectionEngine } from '../../engine/SelectionEngine';

const text      = signal('');
const layout    = signal<'abc' | 'qwerty'>('abc');

const ABC_ROWS = [
  ['A','B','C','D','E','F','G'],
  ['H','I','J','K','L','M','N'],
  ['O','P','Q','R','S','T','U'],
  ['V','W','X','Y','Z','ESPACO','APAGAR'],
];

const QWERTY_ROWS = [
  ['Q','W','E','R','T','Y','U','I','O','P'],
  ['A','S','D','F','G','H','J','K','L'],
  ['Z','X','C','V','B','N','M','ESPACO','APAGAR'],
];

function speak(t: string): void {
  const utt = new SpeechSynthesisUtterance(t);
  utt.lang = 'pt-BR';
  speechSynthesis.speak(utt);
}

SelectionEngine.onSelect(ev => {
  if (!ev.id.startsWith('key-')) return;
  const key = ev.id.replace('key-', '');
  switch (key) {
    case 'ESPACO': text.value += ' '; break;
    case 'APAGAR': text.value = text.value.slice(0, -1); break;
    case 'FALAR':  speak(text.value); break;
    case 'LIMPAR': text.value = ''; break;
    case 'LAYOUT': layout.value = layout.value === 'abc' ? 'qwerty' : 'abc'; break;
    default:       text.value += key.toLowerCase(); break;
  }
});

function KeyboardKey({ label, id }: { label: string; id: string }) {
  return (
    <button
      class="kbd-key dwell-target"
      data-gaze-id={`key-${id}`}
      onClick={() => SelectionEngine.onSelect}
      aria-label={label}
    >
      {label === 'ESPACO' ? '_' : label === 'APAGAR' ? '<' : label}
    </button>
  );
}

export function Keyboard() {
  const rows = layout.value === 'abc' ? ABC_ROWS : QWERTY_ROWS;

  return (
    <div class="screen keyboard-screen">
      {/* Text display */}
      <div class="kbd-text-area" aria-live="polite">
        {text.value || <span class="kbd-placeholder">Digite com o olhar...</span>}
      </div>

      {/* Prediction row (U3 — stub) */}
      <div class="kbd-predictions">
        <span class="kbd-predict-label">Sugestoes: em breve (Sprint U3)</span>
      </div>

      {/* Key grid */}
      <div class="kbd-grid">
        {rows.map((row, r) => (
          <div class="kbd-row" key={r}>
            {row.map(k => <KeyboardKey key={k} label={k} id={k} />)}
          </div>
        ))}
        <div class="kbd-row kbd-action-row">
          <KeyboardKey label="Falar" id="FALAR" />
          <KeyboardKey label="Limpar" id="LIMPAR" />
          <KeyboardKey label={layout.value === 'abc' ? 'QWERTY' : 'ABC'} id="LAYOUT" />
        </div>
      </div>
    </div>
  );
}
