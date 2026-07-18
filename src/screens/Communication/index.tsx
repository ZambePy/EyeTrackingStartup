// Sprint U2 — Communication grid screen.
// Renders a page set of AAC cells. Message bar accumulates text for TTS output.

import { signal } from '@preact/signals';
import { Cell, type CellDef } from './Cell';
import { SelectionEngine } from '../../engine/SelectionEngine';
import { navigate } from '../../shell/Router';

// Message bar state (U2)
const messageBar = signal('');

// Default vocabulary — will be replaced by user-defined page sets in U2/U7
const DEFAULT_CELLS: CellDef[] = [
  { id: 'c-eu',         label: 'Eu',         action: { type: 'append', text: 'Eu ' } },
  { id: 'c-quero',      label: 'Quero',      action: { type: 'append', text: 'quero ' } },
  { id: 'c-nao',        label: 'Nao',        action: { type: 'append', text: 'nao ' } },
  { id: 'c-sim',        label: 'Sim',        action: { type: 'append', text: 'sim ' } },
  { id: 'c-agua',       label: 'Agua',       action: { type: 'speak', text: 'Eu quero agua' } },
  { id: 'c-dor',        label: 'Dor',        action: { type: 'speak', text: 'Estou com dor' } },
  { id: 'c-banheiro',   label: 'Banheiro',   action: { type: 'speak', text: 'Preciso ir ao banheiro' } },
  { id: 'c-obrigado',   label: 'Obrigado',   action: { type: 'speak', text: 'Obrigado' } },
  { id: 'c-ajuda',      label: 'Ajuda',      action: { type: 'speak', text: 'Preciso de ajuda' } },
  { id: 'c-cansado',    label: 'Cansado',    action: { type: 'speak', text: 'Estou cansado' } },
  { id: 'c-speak-bar',  label: 'Falar',      action: { type: 'speak', text: '' }, color: '#00fff0' },
  { id: 'c-clear-bar',  label: 'Limpar',     action: { type: 'clear' }, color: '#ff3366' },
  { id: 'c-back',       label: 'Voltar',     action: { type: 'back' } },
  { id: 'c-keyboard',   label: 'Teclado',    action: { type: 'navigate', route: 'keyboard' } },
];

function speak(text: string): void {
  if (!text) return;
  const utt = new SpeechSynthesisUtterance(text);
  utt.lang = 'pt-BR';
  speechSynthesis.speak(utt);
}

function activateCell(cell: CellDef): void {
  switch (cell.action.type) {
    case 'speak':      speak(cell.action.text || messageBar.value); break;
    case 'append':     messageBar.value += cell.action.text; break;
    case 'clear':      messageBar.value = ''; break;
    case 'delete-word': messageBar.value = messageBar.value.trimEnd().replace(/\S+\s*$/, ''); break;
    case 'navigate':   navigate(cell.action.route as Parameters<typeof navigate>[0]); break;
    case 'back':       navigate('home'); break;
  }
}

// Wire gaze selections
SelectionEngine.onSelect(ev => {
  const cell = DEFAULT_CELLS.find(c => c.id === ev.id);
  if (cell) activateCell(cell);
});

function MessageBar() {
  return (
    <div class="message-bar">
      <span class="message-bar__text" aria-live="polite" aria-label="Mensagem composta">
        {messageBar.value || <span class="message-bar__placeholder">Olhe para uma celula para compor...</span>}
      </span>
      <button
        class="message-bar__speak dwell-target"
        data-gaze-id="c-speak-bar"
        onClick={() => speak(messageBar.value)}
        aria-label="Falar mensagem"
      >
        Falar
      </button>
    </div>
  );
}

export function Communication() {
  return (
    <div class="screen communication-screen">
      <MessageBar />
      <div class="aac-grid">
        {DEFAULT_CELLS.map(cell => (
          <Cell key={cell.id} cell={cell} onActivate={activateCell} />
        ))}
      </div>
    </div>
  );
}
