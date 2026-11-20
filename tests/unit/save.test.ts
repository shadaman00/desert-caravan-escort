import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  SaveManager,
  SAVE_STORAGE_KEY,
  AUTO_SAVE_INTERVAL_MS,
} from '@/persistence/saveManager';
import { migrate } from '@/persistence/migrate';
import { getDefaultState } from '@/store/defaults';
import { calculateOfflineReward } from '@/persistence/offlineReward';
import { useGameStore } from '@/store/gameStore';

describe('Save & Persistence Unit Suite', () => {
  let mockStorage: Record<string, string> = {};

  beforeEach(() => {
    mockStorage = {};
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => mockStorage[key] ?? null,
      setItem: (key: string, val: string) => {
        mockStorage[key] = val;
      },
      removeItem: (key: string) => {
        delete mockStorage[key];
      },
      clear: () => {
        mockStorage = {};
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('performs serialization round-trip cleanly', () => {
    const saveManager = new SaveManager();
    const state = getDefaultState();
    state.currencies.sunGold = 777;
    state.currencies.ancientGear = 12;

    saveManager.save(state);
    const loaded = saveManager.load();

    expect(loaded).not.toBeNull();
    expect(loaded?.currencies.sunGold).toBe(777);
    expect(loaded?.currencies.ancientGear).toBe(12);
  });

  it('falls back to backup key on corrupted JSON', () => {
    const saveManager = new SaveManager();
    const state = getDefaultState();
    state.currencies.sunGold = 500;

    // Save good state
    saveManager.save(state);

    // Corrupt primary key
    mockStorage['sandwalkerSaveDataV1'] = '{"corrupted: true, invalid...';

    const loaded = saveManager.load();
    expect(loaded).not.toBeNull();
    expect(loaded?.currencies.sunGold).toBe(500);
  });

  it('falls back to backup key when primary key has valid JSON failing envelope validation', () => {
    const saveManager = new SaveManager();
    const state = getDefaultState();
    state.currencies.sunGold = 8888;
    saveManager.save(state);

    // Valid JSON, invalid envelope ('{}')
    mockStorage[SAVE_STORAGE_KEY] = '{}';

    const loaded = saveManager.load();
    expect(loaded).not.toBeNull();
    expect(loaded?.success).toBe(true);
    expect(loaded?.fromBackup).toBe(true);
    expect(loaded?.currencies.sunGold).toBe(8888);
  });

  it('validates slice types in migrate() and falls back to defaults on non-object slices', () => {
    const result = migrate({
      v: 1,
      savedAt: 1700000000000,
      state: {
        meta: 'corrupt-meta',
        currencies: 'corrupt',
        sandwalker: null,
        monetization: 42,
      },
    });

    expect(result.success).toBe(true);
    expect(result.state.currencies).toEqual({
      sunGold: 0,
      ancientGear: 0,
      mapFragments: 0,
      templeKeys: 0,
    });
    expect(result.state.meta.currentAct).toBe(1);
    expect(result.state.sandwalker.maxHp).toBe(1000);
    expect(result.state.monetization.adTier).toBe(0);
  });

  it('resets routeProgress to 0 upon saving mid-route (Decision D7)', () => {
    const saveManager = new SaveManager();
    const state = getDefaultState();
    state.meta.routeProgress = 65.5; // Mid-route in march
    state.trade.cargo = [{ goodsId: 'WATER', qty: 20, buyPrice: 1 }];

    saveManager.save(state);

    const rawSaved = JSON.parse(mockStorage['sandwalkerSaveDataV1']);
    expect(rawSaved.state.meta.routeProgress).toBe(0);

    const loaded = saveManager.load();
    expect(loaded?.meta.routeProgress).toBe(0);
    expect(loaded?.trade.cargo).toHaveLength(1);
    expect(loaded?.trade.cargo[0].qty).toBe(20);
  });

  describe('Offline Idle Rewards: 2 * wagons * min(mins, 480)', () => {
    it('returns 0 for absence under 60 seconds', () => {
      const now = 1700000000000;
      const last = now - 45000; // 45 seconds
      const reward = calculateOfflineReward(last, 2, now);
      expect(reward.eligible).toBe(false);
      expect(reward.gold).toBe(0);
    });

    it('calculates correct gold for normal absence', () => {
      const now = 1700000000000;
      const last = now - 30 * 60 * 1000; // 30 minutes
      const reward = calculateOfflineReward(last, 3, now); // 3 wagons
      expect(reward.eligible).toBe(true);
      expect(reward.gold).toBe(2 * 3 * 30); // 180 Sun Gold
      expect(reward.zafarGold).toBe(360);
    });

    it('caps absence at 8 hours (480 minutes)', () => {
      const now = 1700000000000;
      const last = now - 12 * 60 * 60 * 1000; // 12 hours (720 mins)
      const reward = calculateOfflineReward(last, 2, now); // 2 wagons
      expect(reward.eligible).toBe(true);
      expect(reward.minutes).toBe(480);
      expect(reward.gold).toBe(2 * 2 * 480); // 1,920 Sun Gold
      expect(reward.isCapped).toBe(true);
    });

    it('handles small positive now values unambiguously with (lastSaved, wagonCount, now)', () => {
      const reward = calculateOfflineReward(0, 3, 90_000);
      expect(reward.eligible).toBe(true);
      expect(reward.clampedMinutes).toBe(1);
      expect(reward.gold).toBe(6);
      expect(reward.zafarGold).toBe(12);
    });

    it('returns 0 for negative timestamps or future timestamps (now < lastSavedTimestamp)', () => {
      const negLast = calculateOfflineReward(-1_000_000, 2, 1_700_000_000_000);
      expect(negLast.eligible).toBe(false);
      expect(negLast.gold).toBe(0);

      const negNow = calculateOfflineReward(1000, 2, -5000);
      expect(negNow.eligible).toBe(false);
      expect(negNow.gold).toBe(0);

      const futureLast = calculateOfflineReward(2_000_000, 2, 1_000_000);
      expect(futureLast.eligible).toBe(false);
      expect(futureLast.gold).toBe(0);
    });
  });

  describe('SaveManager StrictMode Remount Auto-Save Recovery', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      SaveManager.stopAutoSave();
      vi.useRealTimers();
    });

    it('restarts auto-save timer when init() is called again after stopAutoSave()', () => {
      useGameStore.getState().resetToDefaults();
      useGameStore.getState().addCurrencies({ sunGold: 321 });

      // Simulate Mount 1 -> Unmount cleanup -> Remount 2 (React.StrictMode)
      SaveManager.init();
      SaveManager.stopAutoSave();
      SaveManager.init();

      vi.advanceTimersByTime(AUTO_SAVE_INTERVAL_MS);

      expect(typeof mockStorage[SAVE_STORAGE_KEY]).toBe('string');
      const parsed = JSON.parse(mockStorage[SAVE_STORAGE_KEY]);
      expect(parsed.state.currencies.sunGold).toBe(321);
    });
  });

  describe('sellCargo Input Validation', () => {
    it('rejects non-finite and non-positive rateMultiplier without corrupting sunGold or losing cargo', () => {
      const store = useGameStore.getState();
      store.resetToDefaults();
      store.addCurrencies({ sunGold: 500 });
      store.setCargo([{ goodsId: 'SPICE', qty: 10, buyPrice: 20 }]);

      for (const badRate of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 0, -2.5]) {
        const payout = useGameStore.getState().sellCargo(badRate, false, false);
        expect(payout).toBe(0);
        expect(useGameStore.getState().currencies.sunGold).toBe(500);
        expect(Number.isNaN(useGameStore.getState().currencies.sunGold)).toBe(false);
        expect(useGameStore.getState().trade.cargo).toHaveLength(1);
      }

      const validPayout = useGameStore.getState().sellCargo(2.0, false, false);
      expect(validPayout).toBe(400);
      expect(useGameStore.getState().currencies.sunGold).toBe(900);
      expect(useGameStore.getState().trade.cargo).toHaveLength(0);
    });
  });
});
