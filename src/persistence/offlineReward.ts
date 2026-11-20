export const MAX_OFFLINE_MINUTES = 480; // 8 hours cap
export const MIN_OFFLINE_SECONDS_FOR_POPUP = 60; // < 60s suppressed
export const GOLD_PER_WAGON_PER_MINUTE = 2;

export interface OfflineRewardResult {
  eligible: boolean;
  elapsedSeconds: number;
  elapsedMinutes: number;
  clampedMinutes: number;
  minutes: number;
  isCapped: boolean;
  gold: number;
  zafarGold: number; // 2x multiplier via Rewarded Ad
}

/**
 * Calculates idle gold accumulated while player was offline.
 * Formula: 2 * wagonCount * min(floor(deltaSeconds / 60), 480)
 */
export function calculateOfflineReward(
  lastSavedTimestamp: number,
  wagonCount: number,
  now: number = Date.now()
): OfflineRewardResult {
  const emptyResult: OfflineRewardResult = {
    eligible: false,
    elapsedSeconds: 0,
    elapsedMinutes: 0,
    clampedMinutes: 0,
    minutes: 0,
    isCapped: false,
    gold: 0,
    zafarGold: 0,
  };

  if (
    !Number.isFinite(lastSavedTimestamp) ||
    !Number.isFinite(now) ||
    lastSavedTimestamp < 0 ||
    now < 0 ||
    now < lastSavedTimestamp
  ) {
    return emptyResult;
  }

  const safeWagonCount = Number.isFinite(wagonCount)
    ? Math.min(5, Math.max(1, Math.floor(wagonCount)))
    : 1;
  const elapsedMs = now - lastSavedTimestamp;
  const elapsedSeconds = Math.max(0, Math.floor(elapsedMs / 1000));

  // If away for less than 60 seconds, do not show offline reward modal
  if (elapsedSeconds < MIN_OFFLINE_SECONDS_FOR_POPUP) {
    return {
      ...emptyResult,
      elapsedSeconds,
    };
  }

  const elapsedMinutes = Math.floor(elapsedSeconds / 60);
  const clampedMinutes = Math.min(elapsedMinutes, MAX_OFFLINE_MINUTES);
  const isCapped = elapsedMinutes > MAX_OFFLINE_MINUTES;

  const gold = GOLD_PER_WAGON_PER_MINUTE * safeWagonCount * clampedMinutes;
  const zafarGold = gold * 2;

  return {
    eligible: true,
    elapsedSeconds,
    elapsedMinutes,
    clampedMinutes,
    minutes: clampedMinutes,
    isCapped,
    gold,
    zafarGold,
  };
}
