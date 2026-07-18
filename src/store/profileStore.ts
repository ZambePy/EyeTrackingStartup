import { signal, computed } from '@preact/signals';

export interface Profile {
  id: string;
  name: string;
  createdAt: string;
  calibrated: boolean;
  onnxModelPath?: string;  // E4: path to personalised ONNX model in userData
}

const STORAGE_KEY = 'irisflow:profiles';

function load(): Profile[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Profile[]) : [];
  } catch {
    return [];
  }
}

export const profiles       = signal<Profile[]>(load());
export const activeId       = signal<string | null>(null);
export const activeProfile  = computed(() => profiles.value.find(p => p.id === activeId.value) ?? null);

function save(): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles.value));
}

export function createProfile(name: string): Profile {
  const profile: Profile = { id: crypto.randomUUID(), name, createdAt: new Date().toISOString(), calibrated: false };
  profiles.value = [...profiles.value, profile];
  save();
  return profile;
}

export function updateProfile(id: string, patch: Partial<Profile>): void {
  profiles.value = profiles.value.map(p => p.id === id ? { ...p, ...patch } : p);
  save();
}

export function deleteProfile(id: string): void {
  profiles.value = profiles.value.filter(p => p.id !== id);
  if (activeId.value === id) activeId.value = null;
  save();
}
