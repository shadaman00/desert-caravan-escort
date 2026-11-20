/**
 * Graceful Web Vibration API wrapper for tactile hits and upgrades.
 */
export function triggerHaptic(pattern: number | number[] = 15): void {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(pattern);
    }
  } catch {
    // Ignore vibration errors in restricted browsers or headless environments
  }
}
