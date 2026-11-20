import { GameStoreState } from '../../store/types';

/**
 * Evaluates whether a forced interstitial ad should be displayed upon oasis arrival.
 * Evaluated ONLY within OASIS_SETTLEMENT state.
 *
 * Rules:
 * 1. Play time < 900s (15 min) OR currentAct === 1 -> false (100% ad-free onboarding)
 * 2. adTier === 3 (VIP Permanent Ad Removal) -> false (0% ads)
 * 3. adTier === 2 (Standard Pass) -> isChapterBossClear (only upon clearing chapter boss)
 * 4. adTier === 1 (Light Pass) -> oasisArrivalCount % 5 === 0 (every 5th arrival, 60% reduction)
 * 5. adTier === 0 (Free-to-Play) -> oasisArrivalCount % 2 === 0 (every 2nd arrival)
 */
export function shouldShowInterstitialAd(
  state: GameStoreState,
  isChapterBossClear: boolean
): boolean {
  const { totalPlaySeconds, currentAct, oasisArrivalCount } = state.meta;

  // Rule 1: No forced ads during first 15 mins (900s) OR throughout Act 1 (including invalid/NaN/non-positive values)
  if (
    typeof totalPlaySeconds !== 'number' ||
    Number.isNaN(totalPlaySeconds) ||
    totalPlaySeconds < 900 ||
    typeof currentAct !== 'number' ||
    Number.isNaN(currentAct) ||
    currentAct <= 1
  ) {
    return false;
  }

  // Rule 2: VIP (Tier 3) never receives forced interstitial ads (0%)
  if (state.monetization.adTier === 3) {
    return false;
  }

  // Rule 3: Standard Pass (Tier 2) shows ads ONLY upon clearing Chapter Boss
  if (state.monetization.adTier === 2) {
    return Boolean(isChapterBossClear);
  }

  // Guard invalid, negative, or zero arrival count before modulo checks
  if (
    typeof oasisArrivalCount !== 'number' ||
    !Number.isFinite(oasisArrivalCount) ||
    oasisArrivalCount <= 0
  ) {
    return false;
  }

  // Rule 4: Light Pass (Tier 1) shows ads every 5th oasis arrival (60% reduction)
  if (state.monetization.adTier === 1) {
    return oasisArrivalCount % 5 === 0;
  }

  // Rule 5: Free-to-Play (Tier 0) shows ads every 2nd oasis arrival
  if (state.monetization.adTier === 0) {
    return oasisArrivalCount % 2 === 0;
  }

  return false;
}
