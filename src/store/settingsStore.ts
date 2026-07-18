import { signal, effect } from '@preact/signals';

export interface Settings {
  // Selection
  dwellMs: number;
  selectionMethod: 'dwell' | 'blink' | 'both';
  cooldownMs: number;

  // Tracking filter
  minCutoff: number;
  beta: number;

  // Appearance
  theme: 'dark' | 'high-contrast';
  fontSize: 'normal' | 'large' | 'xlarge';
  gridCols: number;
  gridRows: number;

  // Caregiver
  caregiverPin: string;
}

const DEFAULTS: Settings = {
  dwellMs: 800,
  selectionMethod: 'dwell',
  cooldownMs: 500,
  minCutoff: 0.5,
  beta: 0.007,
  theme: 'dark',
  fontSize: 'normal',
  gridCols: 4,
  gridRows: 3,
  caregiverPin: '1234',
};

function load(): Settings {
  try {
    const raw = localStorage.getItem('irisflow:settings');
    if (raw) return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch { /* ignore corrupt storage */ }
  return { ...DEFAULTS };
}

export const settings = signal<Settings>(load());

effect(() => {
  localStorage.setItem('irisflow:settings', JSON.stringify(settings.value));
});

export function updateSettings(patch: Partial<Settings>): void {
  settings.value = { ...settings.value, ...patch };
}
