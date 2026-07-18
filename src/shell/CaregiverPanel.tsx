// Sprint U6 — Caregiver configuration panel.
// Opened via keyboard shortcut (Ctrl+G) or physical button — never accessible via gaze alone.
// PIN-protected to prevent accidental entry.

import { signal } from '@preact/signals';
import { navigate }         from './Router';
import { settings, updateSettings } from '../store/settingsStore';

type CaregiverTab = 'calibration' | 'selection' | 'tracking' | 'appearance' | 'profiles';

export const caregiverOpen   = signal(false);
const pinInput               = signal('');
const authenticated          = signal(false);
const activeTab              = signal<CaregiverTab>('calibration');

// Ctrl+G toggles panel
if (typeof window !== 'undefined') {
  document.addEventListener('keydown', (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'g') {
      e.preventDefault();
      if (!caregiverOpen.value) { pinInput.value = ''; authenticated.value = false; }
      caregiverOpen.value = !caregiverOpen.value;
    }
    if (e.key === 'Escape' && caregiverOpen.value) caregiverOpen.value = false;
  });

  window.addEventListener('irisflow:callCaregiver', () => {
    caregiverOpen.value = true;
  });
}

function PinGate() {
  const handleSubmit = (e: Event) => {
    e.preventDefault();
    if (pinInput.value === settings.value.caregiverPin) {
      authenticated.value = true;
    } else {
      pinInput.value = '';
    }
  };

  return (
    <form class="pin-gate" onSubmit={handleSubmit}>
      <h2 class="pin-title">Modo Cuidador</h2>
      <p class="pin-desc">Digite o PIN para acessar as configuracoes</p>
      <input
        class="pin-input"
        type="password"
        maxLength={8}
        value={pinInput.value}
        onInput={(e) => { pinInput.value = (e.target as HTMLInputElement).value; }}
        autoFocus
        aria-label="PIN do cuidador"
      />
      <button class="btn-primary" type="submit">Entrar</button>
    </form>
  );
}

function TabBar() {
  const tabs: Array<{ id: CaregiverTab; label: string }> = [
    { id: 'calibration', label: 'Calibracao' },
    { id: 'selection',   label: 'Selecao' },
    { id: 'tracking',    label: 'Rastreamento' },
    { id: 'appearance',  label: 'Aparencia' },
    { id: 'profiles',    label: 'Perfis' },
  ];
  return (
    <div class="caregiver-tabs" role="tablist">
      {tabs.map(t => (
        <button
          key={t.id}
          role="tab"
          aria-selected={activeTab.value === t.id}
          class={`caregiver-tab ${activeTab.value === t.id ? 'active' : ''}`}
          onClick={() => { activeTab.value = t.id; }}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

function SelectionTab() {
  const s = settings.value;
  return (
    <div class="tab-content">
      <label class="setting-row">
        <span>Tempo de dwell</span>
        <input
          type="range" min={300} max={3000} step={50}
          value={s.dwellMs}
          onInput={e => updateSettings({ dwellMs: +(e.target as HTMLInputElement).value })}
        />
        <span class="setting-value">{s.dwellMs} ms</span>
      </label>
      <label class="setting-row">
        <span>Metodo de selecao</span>
        <select
          value={s.selectionMethod}
          onChange={e => updateSettings({ selectionMethod: (e.target as HTMLSelectElement).value as typeof s.selectionMethod })}
        >
          <option value="dwell">Dwell</option>
          <option value="blink">Piscada</option>
          <option value="both">Ambos</option>
        </select>
      </label>
    </div>
  );
}

function TrackingTab() {
  const s = settings.value;
  return (
    <div class="tab-content">
      <label class="setting-row">
        <span>Suavidade (mincutoff)</span>
        <input
          type="range" min={0.1} max={3.0} step={0.1}
          value={s.minCutoff}
          onInput={e => updateSettings({ minCutoff: +(e.target as HTMLInputElement).value })}
        />
        <span class="setting-value">{s.minCutoff.toFixed(1)}</span>
      </label>
      <label class="setting-row">
        <span>Responsividade (beta)</span>
        <input
          type="range" min={0} max={0.05} step={0.001}
          value={s.beta}
          onInput={e => updateSettings({ beta: +(e.target as HTMLInputElement).value })}
        />
        <span class="setting-value">{s.beta.toFixed(3)}</span>
      </label>
      <button class="btn-secondary" onClick={() => navigate('calibration')}>
        Iniciar calibracao
      </button>
    </div>
  );
}

function ActiveTab() {
  switch (activeTab.value) {
    case 'selection':  return <SelectionTab />;
    case 'tracking':   return <TrackingTab />;
    default:           return <div class="tab-content tab-placeholder">Em breve (Sprint U6)</div>;
  }
}

export function CaregiverPanel() {
  if (!caregiverOpen.value) return null;

  return (
    <div class="caregiver-backdrop" onClick={() => { caregiverOpen.value = false; }}>
      <aside class="caregiver-panel" onClick={e => e.stopPropagation()} aria-modal="true" role="dialog">
        <header class="caregiver-header">
          <h1 class="caregiver-title">Configuracoes do Cuidador</h1>
          <button class="btn-close" onClick={() => { caregiverOpen.value = false; }} aria-label="Fechar">X</button>
        </header>

        {!authenticated.value ? (
          <PinGate />
        ) : (
          <>
            <TabBar />
            <ActiveTab />
          </>
        )}
      </aside>
    </div>
  );
}
