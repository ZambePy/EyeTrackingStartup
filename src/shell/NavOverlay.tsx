// Sprint U1 — User-facing navigation bar.
// Accessible only via gaze (dwell-to-select). Never via mouse click from user side.

import { signal } from '@preact/signals';
import { currentRoute, navigate } from './Router';
import { SelectionEngine } from '../engine/SelectionEngine';

export const trackingPaused = signal(false);

function NavButton({ id, label }: { id: string; label: string }) {
  return (
    <button
      class="nav-btn dwell-target"
      data-gaze-id={id}
      aria-label={label}
    >
      {label}
    </button>
  );
}

// Wire navigation selections once on mount
SelectionEngine.onSelect(ev => {
  switch (ev.id) {
    case 'nav-home':            navigate('home');         break;
    case 'nav-back':            history.back();           break;
    case 'nav-pause-tracking':  trackingPaused.value = !trackingPaused.value; break;
    case 'nav-call-caregiver':  dispatchCaregiverCall();  break;
  }
});

function dispatchCaregiverCall(): void {
  window.dispatchEvent(new CustomEvent('irisflow:callCaregiver'));
}

export function NavOverlay() {
  if (currentRoute.value === 'calibration') return null;

  return (
    <nav class="nav-overlay" aria-label="Navegação por olhar">
      <NavButton id="nav-home"           label="Inicio" />
      <NavButton id="nav-back"           label="Voltar" />
      <NavButton id="nav-pause-tracking" label={trackingPaused.value ? 'Retomar' : 'Pausar'} />
      <NavButton id="nav-call-caregiver" label="Chamar cuidador" />
    </nav>
  );
}
