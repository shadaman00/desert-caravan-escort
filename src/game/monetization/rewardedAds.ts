import { AdTierLevel, GameStoreState } from '../../store/types';

export type RewardedTriggerKind =
  | 'ZAFAR_2X'
  | 'RELAY_TOWER'
  | 'SOLAR_RELAY'
  | 'RELIC_APPRAISAL'
  | 'EMERGENCY_REVIVE'
  | 'MERCHANT_REROLL';

export interface RewardedAdResult {
  granted: boolean;
  usedTicket: boolean;
  simulationDurationSeconds: number;
}

export const DAILY_TICKET_QUOTAS: Record<AdTierLevel, number> = {
  0: 0,
  1: 5,
  2: 15,
  3: Infinity,
};

export const REWARDED_FALLBACK_DURATIONS: Record<AdTierLevel, number> = {
  0: 3, // Tier 0: 3s countdown modal
  1: 3, // Tier 1: 3s countdown modal when tickets exhausted
  2: 1, // Tier 2: 1s countdown modal when tickets exhausted (Decision D2)
  3: 0, // Tier 3: Instant 0s
};

/**
 * Checks and resets daily skip tickets if date has changed.
 */
export function checkDailySkipTicketReset(
  state: GameStoreState,
  todayStr: string
): Partial<GameStoreState['monetization']> | null {
  if (state.monetization.skipTicketsResetDate !== todayStr) {
    const quota = DAILY_TICKET_QUOTAS[state.monetization.adTier] ?? 0;
    return {
      dailySkipTicketsLeft: quota === Infinity ? 9999 : quota,
      skipTicketsResetDate: todayStr,
    };
  }
  return null;
}

/**
 * Handles request for a rewarded trigger.
 */
export function processRewardedAdRequest(
  state: GameStoreState,
  _trigger: RewardedTriggerKind
): RewardedAdResult {
  const tier = state.monetization.adTier;

  // Tier 3: Instant bypass
  if (tier === 3) {
    return { granted: true, usedTicket: false, simulationDurationSeconds: 0 };
  }

  // Skip tickets available
  if (state.monetization.dailySkipTicketsLeft > 0) {
    return { granted: true, usedTicket: true, simulationDurationSeconds: 0 };
  }

  // Fallback to simulation modal
  const duration = REWARDED_FALLBACK_DURATIONS[tier] ?? REWARDED_FALLBACK_DURATIONS[0];
  return { granted: false, usedTicket: false, simulationDurationSeconds: duration };
}
