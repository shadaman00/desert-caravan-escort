export const NO_AD_GRACE_PERIOD_SEC = 900; // 15 minutes
export const INTERSTITIAL_MIN_COOLDOWN_SEC = 360; // 6 minutes
export const TIER0_OASIS_INTERVAL = 3;
export const TIER1_OASIS_INTERVAL = 7;

export type AdTier = 0 | 1 | 2 | 3;

export type RewardedPlacement =
  | 'JAFAR_DOUBLE_TRADE'
  | 'SOLAR_RELAY_SHIELD'
  | 'JAFAR_EVENT_DEAL';

export interface AdMonetizationState {
  adTier: AdTier;
  playTimeSecWithoutAd: number;
  oasisVisitsSinceLastInterstitial: number;
  dailyAdSkipRemaining: number;
  secSinceLastInterstitial: number;
  zone1FirstOasisSettled: boolean;
  totalInterstitialsShown: number;
  totalRewardedWatched: number;
}

export interface InterstitialDecision {
  allowed: boolean;
  reason: string;
  usedSkipTicket: boolean;
}

export interface RewardedDecision {
  granted: boolean;
  instantPass: boolean;
  consumedSkipTicket: boolean;
  placement: RewardedPlacement;
}

/**
 * Combat defeat / retreat NEVER displays forced interstitial ads (PRD Section 6.3).
 */
export function shouldShowInterstitialOnDefeat(): InterstitialDecision {
  return {
    allowed: false,
    reason: 'DEFEAT_NO_AD_PERMANENT',
    usedSkipTicket: false,
  };
}

/**
 * Evaluates forced interstitial eligibility on Oasis Camp arrival settlement (PRD Section 6.3).
 * Zero DOM/Canvas dependencies (strict SRP).
 */
export function evaluateOasisInterstitial(
  state: AdMonetizationState,
  opts?: { isChapterBossCleared?: boolean }
): InterstitialDecision {
  if (state.playTimeSecWithoutAd < NO_AD_GRACE_PERIOD_SEC) {
    return { allowed: false, reason: 'GRACE_PERIOD_15MIN', usedSkipTicket: false };
  }

  if (!state.zone1FirstOasisSettled) {
    return { allowed: false, reason: 'BEFORE_ZONE1_FIRST_OASIS', usedSkipTicket: false };
  }

  if (state.adTier === 3) {
    return { allowed: false, reason: 'TIER_3_AD_FREE', usedSkipTicket: false };
  }

  let eligible = false;
  let reason = 'TIER_NOT_READY';

  if (state.adTier === 2) {
    eligible = Boolean(opts?.isChapterBossCleared);
    reason = eligible ? 'TIER_2_BOSS_CLEAR' : 'TIER_2_WAIT_BOSS';
  } else if (state.adTier === 1) {
    eligible =
      state.oasisVisitsSinceLastInterstitial >= TIER1_OASIS_INTERVAL &&
      state.secSinceLastInterstitial >= INTERSTITIAL_MIN_COOLDOWN_SEC;
    reason = eligible ? 'TIER_1_OASIS_7TH' : 'TIER_1_COOLDOWN';
  } else {
    eligible =
      state.oasisVisitsSinceLastInterstitial >= TIER0_OASIS_INTERVAL &&
      state.secSinceLastInterstitial >= INTERSTITIAL_MIN_COOLDOWN_SEC;
    reason = eligible ? 'TIER_0_OASIS_3RD' : 'TIER_0_COOLDOWN';
  }

  if (!eligible) {
    return { allowed: false, reason, usedSkipTicket: false };
  }

  if (state.dailyAdSkipRemaining > 0) {
    return { allowed: false, reason: 'SKIP_TICKET_USED', usedSkipTicket: true };
  }

  return { allowed: true, reason, usedSkipTicket: false };
}

export function evaluateRewardedAd(
  placement: RewardedPlacement,
  state: AdMonetizationState
): RewardedDecision {
  if (state.adTier === 3) {
    return {
      granted: true,
      instantPass: true,
      consumedSkipTicket: false,
      placement,
    };
  }
  if (state.dailyAdSkipRemaining > 0) {
    return {
      granted: true,
      instantPass: true,
      consumedSkipTicket: true,
      placement,
    };
  }
  return {
    granted: true,
    instantPass: false,
    consumedSkipTicket: false,
    placement,
  };
}

export function advanceMonetizationTimers(
  state: AdMonetizationState,
  dtSec: number
): AdMonetizationState {
  const safeDt = Math.max(0, dtSec);
  return {
    ...state,
    playTimeSecWithoutAd: state.playTimeSecWithoutAd + safeDt,
    secSinceLastInterstitial: state.secSinceLastInterstitial + safeDt,
  };
}
