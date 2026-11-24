import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BossSystem } from '@/engine/systems/BossSystem';
import { ParticlePool } from '@/engine/render/draw/particles';
import { getBossDefinitionForAct } from '@/game/data/bosses';
import { getOasisDefinition, getOasisTradeGoods } from '@/game/data/oases';
import { SaveManager, SAVE_STORAGE_KEY } from '@/persistence/saveManager';
import { useGameStore } from '@/store/gameStore';

describe('Phase C: Boss Unique Patterns, Multi-Item Trade, Daily Missions & Save Backup', () => {
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
    useGameStore.getState().resetToDefaults();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('triggers Act 1–3 boss special patterns (SMOKE_RUSH, VENOM_BARRAGE, MIRAGE_SWAP) safely', () => {
    const boss = new BossSystem();
    const particles = new ParticlePool(64);

    // Act 1: VARKA SMOKE_RUSH (lungeOffsetX negative visual dash, bossTarget x stays knockback-immune)
    boss.startEncounter(1);
    const varkaDef = getBossDefinitionForAct(1);
    const startX = varkaDef.x;
    for (let i = 0; i < 35; i++) {
      boss.update(0.1, useGameStore.getState(), { isInvulnerable: true, particlePool: particles });
      if ((boss.getDebugSnapshot()?.specialTriggerCount ?? 0) > 0) break;
    }
    const varkaDbg = boss.getDebugSnapshot();
    const varkaRender = boss.getRenderSnapshot();
    expect(varkaDbg?.specialKind).toBe('SMOKE_RUSH');
    expect(varkaDbg?.specialTriggerCount).toBeGreaterThanOrEqual(1);
    expect(varkaRender?.lungeOffsetX).toBeLessThan(0);
    expect(boss.getCombatTargets()[0].x).toBe(startX);
    expect(particles.getActiveCount()).toBeGreaterThan(0);

    // Act 2: SCORPION_REX VENOM_BARRAGE (0 hullDamage while invulnerable, spawns venom sparks)
    boss.startEncounter(2);
    let damageDuringDodge = 0;
    for (let i = 0; i < 40; i++) {
      const res = boss.update(0.1, useGameStore.getState(), {
        isInvulnerable: true,
        particlePool: particles,
      });
      damageDuringDodge += res.hullDamage;
      if ((boss.getDebugSnapshot()?.specialTriggerCount ?? 0) > 0) break;
    }
    expect(damageDuringDodge).toBe(0);
    expect(boss.getDebugSnapshot()?.specialKind).toBe('VENOM_BARRAGE');
    expect(boss.getDebugSnapshot()?.specialTriggerCount).toBeGreaterThanOrEqual(1);

    // Act 3: MIRAGE_SPIRIT_KING MIRAGE_SWAP (swaps position with alive clone within [430..570, 175..295])
    boss.startEncounter(3);
    for (let i = 0; i < 60; i++) {
      boss.update(0.1, useGameStore.getState(), {
        isInvulnerable: true,
        particlePool: particles,
      });
      if ((boss.getDebugSnapshot()?.specialTriggerCount ?? 0) > 0 && boss.getAdds().length > 0) {
        break;
      }
    }
    const mirageTarget = boss.getCombatTargets()[0];
    expect(boss.getDebugSnapshot()?.specialKind).toBe('MIRAGE_SWAP');
    expect(mirageTarget.x).toBeGreaterThanOrEqual(430);
    expect(mirageTarget.x).toBeLessThanOrEqual(570);
    expect(mirageTarget.y).toBeGreaterThanOrEqual(175);
    expect(mirageTarget.y).toBeLessThanOrEqual(295);
  });

  it('rotates oasis multi-item trade catalog and settles combined multi-item cargo', () => {
    const o1 = getOasisDefinition(1);
    const o2 = getOasisDefinition(2);
    const o3 = getOasisDefinition(3);
    expect(getOasisTradeGoods(1)).toHaveLength(3);
    expect(getOasisTradeGoods(2)).toHaveLength(3);
    expect(getOasisTradeGoods(3)).toHaveLength(3);
    expect(o1.secondaryGoods[0].id).not.toBe(o2.secondaryGoods[0].id);
    expect(o2.secondaryGoods[0].id).not.toBe(o3.secondaryGoods[0].id);

    const store = useGameStore.getState();
    store.addCurrencies({ sunGold: 200 });
    expect(store.buyCargo(o1.specialty.id, 10, o1.specialty.buyPrice)).toBe(true);
    expect(store.buyCargo(o1.secondaryGoods[1].id, 4, o1.secondaryGoods[1].buyPrice)).toBe(true);
    expect(useGameStore.getState().trade.cargo).toHaveLength(2);

    // Cost: 10*1 + 4*5 = 30G -> Remaining 170G -> Sell at 2.0x = 20 + 40 = 60G -> Total 230G
    const payout = useGameStore.getState().sellCargo(2.0, false, false);
    expect(payout).toBe(60);
    expect(useGameStore.getState().currencies.sunGold).toBe(230);
    expect(useGameStore.getState().trade.cargo).toHaveLength(0);
  });

  it('tracks Daily Missions progress automatically and grants free skip tickets + gears on claim', () => {
    const store = useGameStore.getState();
    store.addCurrencies({ sunGold: 5000 });
    expect(store.monetization.adTier).toBe(0);
    expect(store.monetization.dailySkipTicketsLeft).toBe(0);

    // Complete all 3 mission triggers
    store.buyCargo('WATER', 10, 1);
    store.upgradeTurret('HEAT_RAY');
    store.upgradeTurret('HEAT_RAY');
    store.upgradeLeg();
    store.incrementOasisArrival();

    expect(useGameStore.getState().claimDailyMission('BUY_CARGO')).toBe(true);
    // Double claim rejected
    expect(useGameStore.getState().claimDailyMission('BUY_CARGO')).toBe(false);
    expect(useGameStore.getState().claimDailyMission('UPGRADE_UNIT')).toBe(true);
    expect(useGameStore.getState().claimDailyMission('CLEAR_ROUTE')).toBe(true);

    const after = useGameStore.getState();
    // Rewards: skipTickets = 1 + 1 + 2 = 4, ancientGear = 2 + 3 + 5 = 10
    expect(after.monetization.dailySkipTicketsLeft).toBe(4);
    expect(after.currencies.ancientGear).toBe(10);

    // Stale date resets progress cleanly
    after.resetDailyMissionsIfNeeded('2099-01-01');
    const resetState = useGameStore.getState().dailyMissions!;
    expect(resetState.resetDate).toBe('2099-01-01');
    expect(resetState.items.every((m) => m.progress === 0 && !m.claimed)).toBe(true);
  });

  it('exports and imports Save JSON safely without corrupting state on invalid input', () => {
    const store = useGameStore.getState();
    store.setIntroCompleted(true);
    store.addCurrencies({ sunGold: 4321, ancientGear: 17 });
    const exported = SaveManager.exportSaveJson(useGameStore.getState());

    // Reject malformed / invalid JSON without overwriting gold
    const badJsonRes = SaveManager.importSaveJson('{broken json');
    expect(badJsonRes.success).toBe(false);
    expect(useGameStore.getState().currencies.sunGold).toBe(4321);

    const badStructRes = SaveManager.importSaveJson(JSON.stringify({ hello: 'world' }));
    expect(badStructRes.success).toBe(false);
    expect(useGameStore.getState().currencies.sunGold).toBe(4321);

    // Reset and import exported save JSON
    store.resetToDefaults();
    expect(useGameStore.getState().currencies.sunGold).toBe(0);
    const okRes = SaveManager.importSaveJson(exported);
    expect(okRes.success).toBe(true);
    expect(useGameStore.getState().currencies.sunGold).toBe(4321);
    expect(useGameStore.getState().currencies.ancientGear).toBe(17);
    expect(typeof mockStorage[SAVE_STORAGE_KEY]).toBe('string');
  });
});
