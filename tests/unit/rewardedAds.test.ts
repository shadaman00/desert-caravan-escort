import { describe, it, expect } from 'vitest';
import {
  DAILY_TICKET_QUOTAS,
  REWARDED_FALLBACK_DURATIONS,
  checkDailySkipTicketReset,
  processRewardedAdRequest,
  type RewardedTriggerKind,
} from '@/game/monetization/rewardedAds';
import { getDefaultState } from '@/store/defaults';
import { AdTierLevel } from '@/store/types';

describe('Rewarded Ads & Daily Skip Ticket Suite', () => {
  const makeState = (tier: AdTierLevel, tickets: number, resetDate = '2026-11-17') => {
    const state = getDefaultState();
    state.monetization.adTier = tier;
    state.monetization.dailySkipTicketsLeft = tickets;
    state.monetization.skipTicketsResetDate = resetDate;
    return state;
  };

  it('defines expected daily skip ticket quotas and fallback durations per Tier', () => {
    expect(DAILY_TICKET_QUOTAS).toEqual({
      0: 0,
      1: 5,
      2: 15,
      3: Infinity,
    });
    expect(REWARDED_FALLBACK_DURATIONS).toEqual({
      0: 3,
      1: 3,
      2: 1,
      3: 0,
    });
  });

  it('requires 3s simulation modal for Tier 0 across all 4 triggers', () => {
    const triggers: RewardedTriggerKind[] = [
      'ZAFAR_2X',
      'RELAY_TOWER',
      'RELIC_APPRAISAL',
      'EMERGENCY_REVIVE',
    ];
    const state = makeState(0, 0);

    for (const trigger of triggers) {
      const res = processRewardedAdRequest(state, trigger);
      expect(res).toEqual({
        granted: false,
        usedTicket: false,
        simulationDurationSeconds: 3,
      });
    }
  });

  it('consumes skip ticket when available for Tier 1, then falls back to 3s modal', () => {
    const withTicket = makeState(1, 5);
    expect(processRewardedAdRequest(withTicket, 'ZAFAR_2X')).toEqual({
      granted: true,
      usedTicket: true,
      simulationDurationSeconds: 0,
    });

    const exhausted = makeState(1, 0);
    expect(processRewardedAdRequest(exhausted, 'ZAFAR_2X')).toEqual({
      granted: false,
      usedTicket: false,
      simulationDurationSeconds: 3,
    });
  });

  it('consumes skip ticket when available for Tier 2, then falls back to 1s modal (Decision D2)', () => {
    const withTicket = makeState(2, 15);
    expect(processRewardedAdRequest(withTicket, 'ZAFAR_2X')).toEqual({
      granted: true,
      usedTicket: true,
      simulationDurationSeconds: 0,
    });

    const exhausted = makeState(2, 0);
    expect(processRewardedAdRequest(exhausted, 'ZAFAR_2X')).toEqual({
      granted: false,
      usedTicket: false,
      simulationDurationSeconds: 1,
    });
  });

  it('grants instant 0s bypass without consuming tickets for Tier 3 VIP', () => {
    const state = makeState(3, 0);
    expect(processRewardedAdRequest(state, 'ZAFAR_2X')).toEqual({
      granted: true,
      usedTicket: false,
      simulationDurationSeconds: 0,
    });
  });

  it('falls back safely to 3s duration on out-of-range adTier', () => {
    const state = makeState(0, 0);
    (state.monetization as { adTier: number }).adTier = 99;
    const res = processRewardedAdRequest(state, 'ZAFAR_2X');
    expect(res).toEqual({
      granted: false,
      usedTicket: false,
      simulationDurationSeconds: 3,
    });
  });

  it('resets daily skip tickets only when date changes', () => {
    const stateT1 = makeState(1, 1, '2026-11-16');
    expect(checkDailySkipTicketReset(stateT1, '2026-11-16')).toBeNull();
    expect(checkDailySkipTicketReset(stateT1, '2026-11-17')).toEqual({
      dailySkipTicketsLeft: 5,
      skipTicketsResetDate: '2026-11-17',
    });

    const stateT2 = makeState(2, 0, '2026-11-16');
    expect(checkDailySkipTicketReset(stateT2, '2026-11-17')).toEqual({
      dailySkipTicketsLeft: 15,
      skipTicketsResetDate: '2026-11-17',
    });

    const stateT3 = makeState(3, 9999, '2026-11-16');
    expect(checkDailySkipTicketReset(stateT3, '2026-11-17')).toEqual({
      dailySkipTicketsLeft: 9999,
      skipTicketsResetDate: '2026-11-17',
    });
  });
});
