import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  computeCargoCapacityValue,
  computeOfflineGoldReward,
  computeTradeProfit,
  computeUpgradeCost,
  computeWagonPurchaseCost,
  resolveEventChoice,
  selectCheapestAutoUpgrade,
} from '@/systems/CaravanEconomy';
import { DESERT_EVENTS, clampSpeechBubble, getEventForDistance } from '@/data/eventData';
import {
  SAVE_BACKUP_KEY_V2,
  SAVE_STORAGE_KEY_V2,
  createInitialSaveStateV2,
  gameStore,
  loadSaveStateV2,
  persistSaveStateV2,
} from '@/data/saveStore';

class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  public get length(): number {
    return this.map.size;
  }
  public clear(): void {
    this.map.clear();
  }
  public getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  public key(index: number): string | null {
    return Array.from(this.map.keys())[index] ?? null;
  }
  public removeItem(key: string): void {
    this.map.delete(key);
  }
  public setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
}

describe('Phase 3: CaravanEconomy, 300m Events, Auto-Upgrade & Save Persistence', () => {
  beforeEach(() => {
    gameStore.getState().resetAll();
  });

  it('computes PRD upgrade cost formula floor(100 * 1.28^(L-1)) accurately', () => {
    expect(computeUpgradeCost(1)).toBe(100);
    expect(computeUpgradeCost(2)).toBe(128);
    expect(computeUpgradeCost(3)).toBe(163);
    expect(computeUpgradeCost(4)).toBe(209);
    expect(computeUpgradeCost(5)).toBe(268);
    expect(computeWagonPurchaseCost(1)).toBe(128);
    expect(computeCargoCapacityValue(1)).toBe(200);
    expect(computeCargoCapacityValue(3)).toBe(320);
  });

  it('computes Oasis Trade Profit across all 4 biomes with Harun bonus and 2x Jafar multiplier', () => {
    // Base cargo 200, Zone 1 (0.35) + Harun Lv1 (0.05) = 200 * 1.40 = 280
    const z1 = computeTradeProfit(200, 0, 1, 1.0);
    expect(z1.totalProfit).toBe(280);

    // Zone 2 (0.50) + Harun Lv2 (0.10) = 200 * 1.60 = 320
    const z2 = computeTradeProfit(200, 1, 2, 1.0);
    expect(z2.totalProfit).toBe(320);

    // Zone 3 (0.70) + Harun Lv1 (0.05) = 200 * 1.75 = 350
    const z3 = computeTradeProfit(200, 2, 1, 1.0);
    expect(z3.totalProfit).toBe(350);

    // Zone 4 (1.00) + Harun Lv3 (0.15) with 2x Jafar = floor(200 * 2.15 * 2) = 860
    const z4Double = computeTradeProfit(200, 3, 3, 2.0);
    expect(z4Double.totalProfit).toBe(860);

    expect(computeOfflineGoldReward(30, 500, 1)).toBe(0);
    expect(computeOfflineGoldReward(600, 500, 1)).toBeGreaterThan(0);
  });

  it('enforces <= 35 char speech bubble limit and resolves 300m event choices cleanly', () => {
    expect(DESERT_EVENTS.length).toBe(6);
    for (const ev of DESERT_EVENTS) {
      expect(ev.choices.length).toBe(2);
      for (const c of ev.choices) {
        expect(Array.from(c.resultLine).length).toBeLessThanOrEqual(35);
      }
    }
    expect(Array.from(clampSpeechBubble('가'.repeat(50))).length).toBe(35);

    const ev300 = getEventForDistance(300, []);
    expect(ev300.id).toBe('EVT_STRANDED_MERCHANT');
    const res0 = resolveEventChoice(ev300.choices[0], 300);
    expect(res0.affordable).toBe(true);
    expect(res0.gearsDelta).toBe(5);
    expect(res0.moraleBonusSec).toBe(30);
    expect(res0.triggerShieldCooldown).toBe(true);

    const altar = getEventForDistance(1800, ['EVT_STRANDED_MERCHANT']);
    const unaffordable = resolveEventChoice(altar.choices[0], 50);
    expect(unaffordable.affordable).toBe(false);
  });

  it('applies store upgrades, wagon cap, merc unlock/levelup, and cheapest auto-upgrade', () => {
    const s = gameStore.getState();
    s.addPlayerResources({ gold: 500 }); // 800G total
    expect(s.upgradeTurret('TUR_01')).toBe(true); // -100 -> 700G, Lv 2
    expect(gameStore.getState().sandwalker.turretLevels.TUR_01).toBe(2);
    expect(s.upgradeTurret('TUR_02')).toBe(false); // locked before 500m

    expect(s.upgradeLeg()).toBe(true); // -100 -> 600G, Lv 2
    expect(s.upgradeShield()).toBe(true); // -100 -> 500G, Lv 2
    expect(s.buyWagon()).toBe(true); // -128 -> 372G, 2 wagons, cargo 260
    expect(gameStore.getState().player.wagonCount).toBe(2);
    expect(gameStore.getState().player.cargoValue).toBe(260);

    expect(s.upgradeOrUnlockMercenary('tarek')).toBe(true); // -220 -> 152G
    expect(gameStore.getState().mercenaries.find((m) => m.id === 'tarek')?.unlocked).toBe(true);

    const pick = selectCheapestAutoUpgrade(gameStore.getState());
    expect(pick).toEqual({ target: 'TUR_01', cost: 128 });
  });

  it('persists Phase 3 SaveStateV2 roundtrip and isolates corrupt storage safely', () => {
    const storage = new MemoryStorage();
    const state = createInitialSaveStateV2(1000);
    state.meta.hasSeenOpeningStoryboard = true;
    state.meta.autoUpgradeEnabled = true;
    state.player.gold = 945;
    state.player.cargoValue = 320;
    state.sandwalker.turretLevels.TUR_01 = 3;
    state.sandwalker.legLevel = 2;

    persistSaveStateV2(state, storage);
    const reloaded = loadSaveStateV2(storage);
    expect(reloaded.recoveredFromCorruption).toBe(false);
    expect(reloaded.state.meta.hasSeenOpeningStoryboard).toBe(true);
    expect(reloaded.state.meta.autoUpgradeEnabled).toBe(true);
    expect(reloaded.state.player.gold).toBe(945);
    expect(reloaded.state.sandwalker.turretLevels.TUR_01).toBe(3);

    storage.setItem(SAVE_STORAGE_KEY_V2, '{corrupted_json');
    const recovered = loadSaveStateV2(storage);
    expect(recovered.recoveredFromCorruption).toBe(true);
    expect(storage.getItem(SAVE_BACKUP_KEY_V2)).toBe('{corrupted_json');
    expect(recovered.state.schemaVersion).toBe('2.0.0');
  });

  it('maintains strict SRP in CaravanEconomy.ts with zero DOM or Canvas references', () => {
    const src = readFileSync(
      resolve(__dirname, '../../../src/systems/CaravanEconomy.ts'),
      'utf-8'
    );
    expect(src).not.toMatch(/CanvasRenderingContext2D|document\.|window\./);
  });
});
