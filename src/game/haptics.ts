let hapticsEnabled = true;

export function setHapticsEnabled(enabled: boolean): void {
  hapticsEnabled = Boolean(enabled);
}

export function isHapticsEnabled(): boolean {
  return hapticsEnabled;
}

/**
 * Graceful Web Vibration API wrapper for tactile hits and upgrades.
 */
export function triggerHaptic(pattern: number | number[] = 15): void {
  if (!hapticsEnabled) return;
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(pattern);
    }
  } catch {
    // Ignore vibration errors in restricted browsers or headless environments
  }
}
