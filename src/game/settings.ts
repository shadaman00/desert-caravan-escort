export type ToastDensity = 'ALL' | 'IMPORTANT' | 'OFF';

export interface UserSettings {
  masterVolume: number;
  bgmVolume: number;
  sfxVolume: number;
  muted: boolean;
  hapticsEnabled: boolean;
  toastDensity: ToastDensity;
}

export const SETTINGS_STORAGE_KEY = 'SANDWALKER_SETTINGS_V1';

export const DEFAULT_USER_SETTINGS: UserSettings = {
  masterVolume: 1.0,
  bgmVolume: 0.55,
  sfxVolume: 0.85,
  muted: false,
  hapticsEnabled: true,
  toastDensity: 'ALL',
};

function clampUnit(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(1, Math.max(0, Math.round(value * 100) / 100));
}

export function normalizeUserSettings(raw: unknown): UserSettings {
  if (!raw || typeof raw !== 'object') {
    return { ...DEFAULT_USER_SETTINGS };
  }
  const obj = raw as Record<string, unknown>;
  const toastDensity: ToastDensity =
    obj.toastDensity === 'IMPORTANT' || obj.toastDensity === 'OFF' || obj.toastDensity === 'ALL'
      ? obj.toastDensity
      : DEFAULT_USER_SETTINGS.toastDensity;

  return {
    masterVolume: clampUnit(obj.masterVolume, DEFAULT_USER_SETTINGS.masterVolume),
    bgmVolume: clampUnit(obj.bgmVolume, DEFAULT_USER_SETTINGS.bgmVolume),
    sfxVolume: clampUnit(obj.sfxVolume, DEFAULT_USER_SETTINGS.sfxVolume),
    muted: typeof obj.muted === 'boolean' ? obj.muted : DEFAULT_USER_SETTINGS.muted,
    hapticsEnabled:
      typeof obj.hapticsEnabled === 'boolean'
        ? obj.hapticsEnabled
        : DEFAULT_USER_SETTINGS.hapticsEnabled,
    toastDensity,
  };
}

export function loadUserSettings(): UserSettings {
  if (typeof window === 'undefined') {
    return { ...DEFAULT_USER_SETTINGS };
  }
  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_USER_SETTINGS };
    return normalizeUserSettings(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_USER_SETTINGS };
  }
}

export function saveUserSettings(settings: UserSettings): UserSettings {
  const normalized = normalizeUserSettings(settings);
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(normalized));
    } catch {
      // Ignore quota / storage errors
    }
  }
  return normalized;
}
