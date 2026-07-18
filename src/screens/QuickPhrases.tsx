// Sprint U4 — Quick phrases: fixed-position 1-gaze responses.
// Same positions across page refreshes for muscle-memory reliability.

import { SelectionEngine } from '../engine/SelectionEngine';

interface QuickPhrase { id: string; label: string; text: string; }

// Fixed grid — positions must NOT change between sessions (U4)
const PHRASES: QuickPhrase[] = [
  { id: 'qp-sim',    label: 'Sim',     text: 'Sim' },
  { id: 'qp-nao',    label: 'Nao',     text: 'Nao' },
  { id: 'qp-depois', label: 'Depois',  text: 'Depois' },
  { id: 'qp-naosei', label: 'Nao sei', text: 'Nao sei' },
  { id: 'qp-ok',     label: 'Ok',      text: 'Ok' },
  { id: 'qp-por-favor', label: 'Por favor', text: 'Por favor' },
  { id: 'qp-obrigado',  label: 'Obrigado',  text: 'Obrigado' },
  { id: 'qp-desculpe',  label: 'Desculpe',  text: 'Desculpe' },
];

function speak(text: string): void {
  const utt = new SpeechSynthesisUtterance(text);
  utt.lang = 'pt-BR';
  speechSynthesis.speak(utt);
}

SelectionEngine.onSelect(ev => {
  const p = PHRASES.find(ph => ph.id === ev.id);
  if (p) speak(p.text);
});

export function QuickPhrases() {
  return (
    <div class="screen quick-phrases-screen">
      <h2 class="screen-title">Frases Rapidas</h2>
      <div class="qp-grid">
        {PHRASES.map(p => (
          <button
            key={p.id}
            class="qp-cell dwell-target"
            data-gaze-id={p.id}
            onClick={() => speak(p.text)}
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}
