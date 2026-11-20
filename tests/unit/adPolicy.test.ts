import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { shouldShowInterstitialAd } from '@/game/monetization/adPolicy';
import { AdSimulator, type AdSimulatorState } from '@/game/monetization/AdSimulator';
import { getDefaultState } from '@/store/defaults';
import { AdTierLevel } from '@/store/types';

describe('shouldShowInterstitialAd Truth Table Suite', () => {
  const getBaseState = (
    act: number,
    playSec: number,
    tier: AdTierLevel,
    arrivalCount: number
  ) => {
    const state = getDefaultState();
    state.meta.currentAct = act;
    state.meta.totalPlaySeconds = playSec;
    state.monetization.adTier = tier;
    state.meta.oasisArrivalCount = arrivalCount;
    return state;
  };

  describe('Sanctuary Protections (Act 1 & First 15 Minutes)', () => {
    it('blocks interstitial ads under 900 seconds regardless of Act or Tier', () => {
      for (const act of [1, 2, 3, 4]) {
        for (const tier of [0, 1, 2, 3] as AdTierLevel[]) {
          for (const arrival of [2, 4, 5, 10]) {
            for (const bossClear of [false, true]) {
              const state = getBaseState(act, 899, tier, arrival);
              expect(shouldShowInterstitialAd(state, bossClear)).toBe(false);
            }
          }
        }
      }
    });

    it('blocks interstitial ads in Act 1 even after 900 seconds', () => {
      for (const tier of [0, 1, 2, 3] as AdTierLevel[]) {
        for (const arrival of [2, 4, 5, 10]) {
          for (const bossClear of [false, true]) {
            const state = getBaseState(1, 1500, tier, arrival);
            expect(shouldShowInterstitialAd(state, bossClear)).toBe(false);
          }
        }
      }
    });
  });

  describe('Tier 3 (VIP Permanent Ad Removal)', () => {
    it('always returns false regardless of arrivals or boss clears', () => {
      for (const act of [2, 3, 4]) {
        for (const arrival of [1, 2, 5, 10, 20]) {
          for (const bossClear of [false, true]) {
            const state = getBaseState(act, 1200, 3, arrival);
            expect(shouldShowInterstitialAd(state, bossClear)).toBe(false);
          }
        }
      }
    });
  });

  describe('Tier 2 (Standard Pass)', () => {
    it('returns true ONLY when isChapterBossClear is true', () => {
      const state = getBaseState(2, 1200, 2, 4);
      expect(shouldShowInterstitialAd(state, false)).toBe(false);
      expect(shouldShowInterstitialAd(state, true)).toBe(true);
    });

    it('returns false on regular arrivals even on multiples of 2 or 5', () => {
      for (const arrival of [2, 4, 5, 10]) {
        const state = getBaseState(2, 1200, 2, arrival);
        expect(shouldShowInterstitialAd(state, false)).toBe(false);
      }
    });
  });

  describe('Tier 1 (Light Pass)', () => {
    it('shows ads every 5th oasis arrival (oasisArrivalCount % 5 === 0)', () => {
      const testCases = [
        { arrival: 1, expected: false },
        { arrival: 2, expected: false },
        { arrival: 3, expected: false },
        { arrival: 4, expected: false },
        { arrival: 5, expected: true },
        { arrival: 9, expected: false },
        { arrival: 10, expected: true },
        { arrival: 15, expected: true },
      ];

      for (const tc of testCases) {
        const state = getBaseState(2, 1200, 1, tc.arrival);
        expect(shouldShowInterstitialAd(state, false)).toBe(tc.expected);
      }
    });
  });

  describe('Tier 0 (Free-to-Play)', () => {
    it('shows ads every 2nd oasis arrival (oasisArrivalCount % 2 === 0)', () => {
      const testCases = [
        { arrival: 1, expected: false },
        { arrival: 2, expected: true },
        { arrival: 3, expected: false },
        { arrival: 4, expected: true },
        { arrival: 5, expected: false },
        { arrival: 6, expected: true },
      ];

      for (const tc of testCases) {
        const state = getBaseState(2, 1200, 0, tc.arrival);
        expect(shouldShowInterstitialAd(state, false)).toBe(tc.expected);
      }
    });
  });

  describe('Edge Case Guards', () => {
    it('blocks ads when currentAct <= 0, oasisArrivalCount === 0, or totalPlaySeconds is NaN', () => {
      const actZero = getBaseState(0, 1200, 0, 2);
      expect(shouldShowInterstitialAd(actZero, true)).toBe(false);

      const actNegative = getBaseState(-1, 1200, 0, 2);
      expect(shouldShowInterstitialAd(actNegative, true)).toBe(false);

      const arrivalZeroT0 = getBaseState(2, 1200, 0, 0);
      expect(shouldShowInterstitialAd(arrivalZeroT0, false)).toBe(false);

      const arrivalZeroT1 = getBaseState(2, 1200, 1, 0);
      expect(shouldShowInterstitialAd(arrivalZeroT1, false)).toBe(false);

      const nanPlayTime = getBaseState(2, Number.NaN, 0, 2);
      expect(shouldShowInterstitialAd(nanPlayTime, true)).toBe(false);
    });
  });
});

describe('AdSimulator Non-Finite & Zero Duration Guards', () => {
  let setIntervalCalls = 0;
  let clearIntervalCalls = 0;
  let origSetInterval: typeof globalThis.setInterval;
  let origClearInterval: typeof globalThis.clearInterval;

  beforeEach(() => {
    vi.useFakeTimers();
    setIntervalCalls = 0;
    clearIntervalCalls = 0;
    origSetInterval = globalThis.setInterval;
    origClearInterval = globalThis.clearInterval;
    globalThis.setInterval = ((cb: TimerHandler, ms?: number) => {
      setIntervalCalls++;
      return origSetInterval(cb, ms);
    }) as typeof globalThis.setInterval;
    globalThis.clearInterval = ((id?: number) => {
      clearIntervalCalls++;
      return origClearInterval(id);
    }) as typeof globalThis.clearInterval;
  });

  afterEach(() => {
    globalThis.setInterval = origSetInterval;
    globalThis.clearInterval = origClearInterval;
    vi.useRealTimers();
  });

  it('guards non-finite and negative durations in showRewarded without leaking intervals', () => {
    const sim = new AdSimulator();
    let latestState: AdSimulatorState | undefined;
    sim.subscribe((s) => {
      latestState = s;
    });

    for (const invalidDuration of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -5, 0]) {
      const onComplete = vi.fn();
      sim.showRewarded(invalidDuration, onComplete);
      expect(onComplete).toHaveBeenCalledOnce();
      expect(latestState?.isOpen).toBe(false);
      expect(setIntervalCalls).toBe(0);
    }
  });

  it('guards non-finite, negative, and zero durations in showInterstitial with immediate canClose and no interval leak', () => {
    const sim = new AdSimulator();
    let latestState: AdSimulatorState | undefined;
    sim.subscribe((s) => {
      latestState = s;
    });

    for (const duration of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -3, 0]) {
      const onComplete = vi.fn();
      sim.showInterstitial(duration, onComplete);

      expect(latestState?.isOpen).toBe(true);
      expect(latestState?.remainingSeconds).toBe(0);
      expect(latestState?.canClose).toBe(true);
      expect(setIntervalCalls).toBe(0);

      sim.closeModal();
      expect(onComplete).toHaveBeenCalledOnce();
      expect(latestState?.isOpen).toBe(false);
    }
  });

  it('supports default 5-second showInterstitial(onComplete) overload and cleans up its interval', () => {
    const sim = new AdSimulator();
    let latestState: AdSimulatorState | undefined;
    sim.subscribe((s) => {
      latestState = s;
    });

    const onComplete = vi.fn();
    sim.showInterstitial(onComplete);
    expect(latestState?.isOpen).toBe(true);
    expect(latestState?.remainingSeconds).toBe(5);
    expect(latestState?.canClose).toBe(false);
    expect(setIntervalCalls).toBe(1);

    for (let i = 0; i < 5; i++) {
      vi.advanceTimersByTime(1000);
    }
    expect(latestState?.remainingSeconds).toBe(0);
    expect(latestState?.canClose).toBe(true);
    expect(clearIntervalCalls).toBe(1);

    sim.closeModal();
    expect(onComplete).toHaveBeenCalledOnce();
    expect(latestState?.isOpen).toBe(false);
  });
});
