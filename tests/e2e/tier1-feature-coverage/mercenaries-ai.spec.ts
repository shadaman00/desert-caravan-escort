// ============================================================================
// File: tests/e2e/tier1-feature-coverage/mercenaries-ai.spec.ts
// Milestone E1-B: Tier 1 Feature Coverage — Features 22..23
//   - F22: 5 Mercenaries Autonomous AI (TC-MERC-01..10)
//   - F23: Expedition Synergy Buff (TC-MERC-11..15)
// Adheres strictly to Opaque-Box E2E rule (zero src/ or @/ imports).
// ============================================================================

import { test, expect } from '../fixtures/appFixture';
import {
  SELECTORS,
  waitForCanvasReady,
  waitForFsmState,
  sortieFromOasis,
  readDebugSnapshot,
  readZoneAHud,
  selectDashboardTab,
  upgradeMercenary,
  dismissSettlement,
  readSettlementProfit,
  setDebugProgress,
  setDebugSpeed,
  mercCardSelector,
  mercUpgradeBtnSelector,
} from '../fixtures/testHelpers';
import {
  injectGameState,
  createAct1HubSeed,
  createMercenaryCountSeed,
  createAllMercenariesSeed,
  createBossSeedForAct,
  createEconomyTradeSeed,
} from '../fixtures/mockStorage';

// ============================================================================
// Feature 22: 5 Mercenaries Autonomous AI
// ============================================================================
test.describe('Tier 1: Feature 22 — 5 Mercenaries Autonomous AI', () => {
  test('TC-MERC-01: Harun and Sera are active post-intro and deal autonomous MERCENARY damage (F22)', async ({
    gamePage,
    errorTracker,
  }) => {
    await injectGameState(gamePage, createAct1HubSeed());
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await waitForFsmState(gamePage, 'OASIS_HUB', 5000);

    const hubSnap = await readDebugSnapshot(gamePage);
    expect(hubSnap?.combat.activeMercenaries).toEqual(['harun', 'sera']);

    await sortieFromOasis(gamePage);

    await expect
      .poll(
        async () => {
          const snap = await readDebugSnapshot(gamePage);
          const mercHits = (snap?.combat.recentDamageEvents ?? []).filter(
            (ev) => ev.source === 'MERCENARY'
          );
          return mercHits.length;
        },
        { timeout: 8000, intervals: [50] }
      )
      .toBeGreaterThanOrEqual(1);

    errorTracker.assertNoErrors();
  });

  test('TC-MERC-02: Sera fires 0.65s rapid arrows and 6.0s 3-arrow crit volley (F22)', async ({
    gamePage,
    errorTracker,
  }) => {
    const seed = createBossSeedForAct(1, {
      turretLevel: 1,
      turretTier: 1,
      unlockedMercIds: ['sera'],
    });
    seed.mercenaries = seed.mercenaries.map((m) =>
      m.id === 'sera' ? { ...m, level: 5, isUnlocked: true } : { ...m, isUnlocked: false }
    );
    await injectGameState(gamePage, seed);
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await waitForFsmState(gamePage, 'OASIS_HUB', 5000);
    await sortieFromOasis(gamePage);
    await setDebugProgress(gamePage, 95);
    await waitForFsmState(gamePage, 'BOSS_ENCOUNTER', 5000);

    // Observe rapid ~0.65s arrow cadence at 1x
    await gamePage.waitForTimeout(2200);
    const snap1x = await readDebugSnapshot(gamePage);
    const rapidHits = (snap1x?.combat.recentDamageEvents ?? []).filter(
      (ev) => ev.source === 'MERCENARY'
    );
    expect(rapidHits.length).toBeGreaterThanOrEqual(2);

    // Advance via 4x to trigger 6.0s 3-arrow crit volley (round(statAt(24,5)*0.85*1.75) = 67)
    await setDebugSpeed(gamePage, 4);
    await expect
      .poll(
        async () => {
          const snap = await readDebugSnapshot(gamePage);
          const mercHits = (snap?.combat.recentDamageEvents ?? []).filter(
            (ev) => ev.source === 'MERCENARY' && ev.damage >= 60
          );
          return mercHits.length;
        },
        { timeout: 8000, intervals: [60] }
      )
      .toBeGreaterThanOrEqual(3);

    errorTracker.assertNoErrors();
  });

  test('TC-MERC-03: Zara triggers 7.0s Solar Nova AOE damage against enemy waves (F22)', async ({
    gamePage,
    errorTracker,
  }) => {
    await injectGameState(gamePage, createMercenaryCountSeed(['zara'], 5));
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await waitForFsmState(gamePage, 'OASIS_HUB', 5000);
    await sortieFromOasis(gamePage);
    await setDebugSpeed(gamePage, 4);

    // Solar Nova Lv5 base = round(52 * (1 + 0.22 * 4)) = 98 (vs basic attack 56)
    await expect
      .poll(
        async () => {
          const snap = await readDebugSnapshot(gamePage);
          return (snap?.combat.recentDamageEvents ?? []).some(
            (ev) => ev.source === 'MERCENARY' && ev.damage >= 90
          );
        },
        { timeout: 10000, intervals: [80] }
      )
      .toBe(true);

    const snap = await readDebugSnapshot(gamePage);
    expect(snap?.combat.activeMercenaries).toEqual(['zara']);
    errorTracker.assertNoErrors();
  });

  test('TC-MERC-04: Tarik grants Solar Buckler shield automatically during combat (F22)', async ({
    gamePage,
    errorTracker,
  }) => {
    await injectGameState(gamePage, createMercenaryCountSeed(['tarik'], 5));
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await waitForFsmState(gamePage, 'OASIS_HUB', 5000);
    await sortieFromOasis(gamePage);
    await setDebugSpeed(gamePage, 4);

    // Tarik triggers 8.0s Solar Buckler granting shield capped at 35% maxHp (350)
    await expect
      .poll(
        async () => {
          const snap = await readDebugSnapshot(gamePage);
          return snap?.sandwalker.solarShieldHp ?? 0;
        },
        { timeout: 10000, intervals: [80] }
      )
      .toBeGreaterThan(0);

    const snap = await readDebugSnapshot(gamePage);
    expect(snap?.sandwalker.solarShieldHp).toBeLessThanOrEqual(350);
    const hud = await readZoneAHud(gamePage);
    expect(hud.solarShieldHp).toBeGreaterThan(0);
    errorTracker.assertNoErrors();
  });

  test('TC-MERC-05: Lili heals Sandwalker HP passively and via Solar Blessing when HP < maxHp (F22)', async ({
    gamePage,
    errorTracker,
  }) => {
    const seed = createBossSeedForAct(4, {
      turretLevel: 1,
      turretTier: 1,
      unlockedMercIds: ['lili'],
    });
    seed.mercenaries = seed.mercenaries.map((m) =>
      m.id === 'lili' ? { ...m, level: 5, isUnlocked: true } : { ...m, isUnlocked: false }
    );
    await injectGameState(gamePage, seed);
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await waitForFsmState(gamePage, 'OASIS_HUB', 5000);
    await sortieFromOasis(gamePage);
    await setDebugProgress(gamePage, 95);
    await waitForFsmState(gamePage, 'BOSS_ENCOUNTER', 5000);

    // Wait at 4x until Great Sandworm WORM_LUNGE reduces HP below maxHp
    await setDebugSpeed(gamePage, 4);
    let damagedHp = 1000;
    await expect
      .poll(
        async () => {
          const snap = await readDebugSnapshot(gamePage);
          const hp = snap?.sandwalker.currentHp ?? 1000;
          if (hp < 950 && hp > 0) {
            damagedHp = hp;
            return true;
          }
          return false;
        },
        { timeout: 15000, intervals: [50] }
      )
      .toBe(true);

    // Switch back to 1x between boss lunges so Lili's 2%/s passive + 5% burst visibly heals
    await setDebugSpeed(gamePage, 1);
    const baselineSnap = await readDebugSnapshot(gamePage);
    const baselineHp = Math.min(damagedHp, baselineSnap?.sandwalker.currentHp ?? damagedHp);

    await expect
      .poll(
        async () => {
          const snap = await readDebugSnapshot(gamePage);
          return (snap?.sandwalker.currentHp ?? 0) > baselineHp + 10;
        },
        { timeout: 6000, intervals: [100] }
      )
      .toBe(true);

    errorTracker.assertNoErrors();
  });

  test('TC-MERC-06: Harun grants Coin Fling bonus gold in combat and +25% trade sell bonus (F22)', async ({
    gamePage,
    errorTracker,
  }) => {
    const bossSeed = createBossSeedForAct(1, {
      turretLevel: 1,
      turretTier: 1,
      sunGold: 0,
      unlockedMercIds: ['harun'],
    });
    await injectGameState(gamePage, bossSeed);
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await waitForFsmState(gamePage, 'OASIS_HUB', 5000);
    await sortieFromOasis(gamePage);
    await setDebugProgress(gamePage, 95);
    await waitForFsmState(gamePage, 'BOSS_ENCOUNTER', 5000);
    await setDebugSpeed(gamePage, 4);

    // No regular enemies die during boss fight; gold gain comes from Harun Coin Fling (+3G per 8s)
    await expect
      .poll(async () => (await readDebugSnapshot(gamePage))?.currencies.sunGold ?? 0, {
        timeout: 10000,
        intervals: [100],
      })
      .toBeGreaterThanOrEqual(3);

    // Verify +25% trade sell bonus on settlement (10 * 10 * 2.0 * 1.25 = 250G)
    const tradeSeed = createEconomyTradeSeed({
      sunGold: 100,
      cargo: [{ goodsId: 'WATER', qty: 10, buyPrice: 10 }],
      nextOasisPriceRate: 2.0,
      harunUnlocked: true,
    });
    tradeSeed.mercenaries = tradeSeed.mercenaries.map((m) =>
      m.id === 'harun' ? { ...m, isUnlocked: true } : { ...m, isUnlocked: false }
    );
    tradeSeed.sandwalker.turretLevels = { HEAT_RAY: 25, HARPOON: 25, MORTAR: 25 };
    tradeSeed.sandwalker.turretTiers = { HEAT_RAY: 3, HARPOON: 3, MORTAR: 3 };
    tradeSeed.sandwalker.activeTurret = 'HARPOON';

    await injectGameState(gamePage, tradeSeed);
    await gamePage.reload();
    await waitForCanvasReady(gamePage, 10000);
    await waitForFsmState(gamePage, 'OASIS_HUB', 5000);
    await sortieFromOasis(gamePage);
    await setDebugSpeed(gamePage, 4);
    await setDebugProgress(gamePage, 95);
    await waitForFsmState(gamePage, 'BOSS_ENCOUNTER', 5000);
    await waitForFsmState(gamePage, 'OASIS_SETTLEMENT', 20000);

    const profit = await readSettlementProfit(gamePage);
    expect(profit).toBe(250);
    errorTracker.assertNoErrors();
  });

  test('TC-MERC-07: Decision D9 unlocks Zara upon arriving at Act 1 Oasis 2 (F22)', async ({
    gamePage,
    errorTracker,
  }) => {
    const seed = createAct1HubSeed({
      currentOasisIndex: 1,
      unlockedMercIds: ['harun', 'sera'],
    });
    seed.sandwalker.turretLevels = { HEAT_RAY: 25, HARPOON: 25, MORTAR: 25 };
    seed.sandwalker.turretTiers = { HEAT_RAY: 3, HARPOON: 3, MORTAR: 3 };
    seed.sandwalker.activeTurret = 'HARPOON';

    await injectGameState(gamePage, seed);
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await waitForFsmState(gamePage, 'OASIS_HUB', 5000);

    await sortieFromOasis(gamePage);
    await setDebugSpeed(gamePage, 4);
    await setDebugProgress(gamePage, 95);
    await waitForFsmState(gamePage, 'OASIS_SETTLEMENT', 20000);

    await dismissSettlement(gamePage);
    await selectDashboardTab(gamePage, 'mercenaries');

    const snap = await readDebugSnapshot(gamePage);
    const zara = snap?.mercenaries.find((m) => m.id === 'zara');
    expect(zara?.isUnlocked).toBe(true);

    const zaraCard = gamePage.locator(mercCardSelector('zara')).first();
    await expect(zaraCard).toBeVisible();
    await expect(zaraCard).toContainText(/탑승 중|Lv\./);
    errorTracker.assertNoErrors();
  });

  test('TC-MERC-08: Decision D9 unlocks Tarik and Lili upon clearing Act 1 Boss Varka (F22)', async ({
    gamePage,
    errorTracker,
  }) => {
    const seed = createBossSeedForAct(1, {
      turretLevel: 25,
      turretTier: 3,
      unlockedMercIds: ['harun', 'sera'],
    });
    seed.sandwalker.activeTurret = 'HARPOON';

    await injectGameState(gamePage, seed);
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await waitForFsmState(gamePage, 'OASIS_HUB', 5000);
    await sortieFromOasis(gamePage);
    await setDebugSpeed(gamePage, 4);
    await setDebugProgress(gamePage, 95);
    await waitForFsmState(gamePage, 'BOSS_ENCOUNTER', 5000);
    await waitForFsmState(gamePage, 'OASIS_SETTLEMENT', 20000);

    const snap = await readDebugSnapshot(gamePage);
    const tarik = snap?.mercenaries.find((m) => m.id === 'tarik');
    const lili = snap?.mercenaries.find((m) => m.id === 'lili');
    expect(tarik?.isUnlocked).toBe(true);
    expect(lili?.isUnlocked).toBe(true);

    await dismissSettlement(gamePage);
    await selectDashboardTab(gamePage, 'mercenaries');
    await expect(gamePage.locator(mercCardSelector('tarik')).first()).toContainText(/탑승 중|Lv\./);
    await expect(gamePage.locator(mercCardSelector('lili')).first()).toContainText(/탑승 중|Lv\./);
    errorTracker.assertNoErrors();
  });

  test('TC-MERC-09: Mercenaries tab renders all 5 cards and upgrades unlocked mercs with Sun Gold (F22)', async ({
    gamePage,
    errorTracker,
  }) => {
    await injectGameState(
      gamePage,
      createAct1HubSeed({ sunGold: 500, unlockedMercIds: ['harun', 'sera'] })
    );
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await waitForFsmState(gamePage, 'OASIS_HUB', 5000);

    await selectDashboardTab(gamePage, 'mercenaries');

    for (const id of ['harun', 'sera', 'zara', 'tarik', 'lili']) {
      await expect(gamePage.locator(mercCardSelector(id)).first()).toBeVisible();
    }

    // Locked mercenaries cannot be upgraded
    for (const lockedId of ['zara', 'tarik', 'lili']) {
      const btn = gamePage.locator(mercUpgradeBtnSelector(lockedId)).first();
      if ((await btn.count()) > 0 && (await btn.isVisible().catch(() => false))) {
        await expect(btn).toBeDisabled();
      }
    }

    // Upgrade unlocked Harun Lv1 -> Lv2 (costs upgradeCost(1) = 50G)
    await upgradeMercenary(gamePage, 'harun', 1);

    const snap = await readDebugSnapshot(gamePage);
    const harun = snap?.mercenaries.find((m) => m.id === 'harun');
    expect(harun?.level).toBe(2);
    expect(snap?.currencies.sunGold).toBe(450);
    await expect(gamePage.locator(mercCardSelector('harun')).first()).toContainText('Lv.2');
    errorTracker.assertNoErrors();
  });

  test('TC-MERC-10: Locked mercenaries stay inactive and emit zero MERCENARY damage events (F22)', async ({
    gamePage,
    errorTracker,
  }) => {
    await injectGameState(gamePage, createMercenaryCountSeed([], 1));
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await waitForFsmState(gamePage, 'OASIS_HUB', 5000);
    await sortieFromOasis(gamePage);

    await gamePage.waitForTimeout(2500);
    const snap = await readDebugSnapshot(gamePage);
    expect(snap?.combat.activeMercenaries).toEqual([]);
    const mercHits = (snap?.combat.recentDamageEvents ?? []).filter(
      (ev) => ev.source === 'MERCENARY'
    );
    expect(mercHits).toHaveLength(0);
    errorTracker.assertNoErrors();
  });
});

// ============================================================================
// Feature 23: Expedition Synergy Buff
// ============================================================================
test.describe('Tier 1: Feature 23 — Expedition Synergy Buff', () => {
  test('TC-MERC-11: Synergy remains INACTIVE when only 4 of 5 mercenaries are unlocked (F23)', async ({
    gamePage,
    errorTracker,
  }) => {
    await injectGameState(
      gamePage,
      createMercenaryCountSeed(['harun', 'sera', 'zara', 'tarik'], 5)
    );
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await waitForFsmState(gamePage, 'OASIS_HUB', 5000);

    const snap = await readDebugSnapshot(gamePage);
    expect(snap?.combat.synergyActive).toBe(false);

    const hudSynergy = gamePage.locator(SELECTORS.hudSynergyBadge).first();
    await expect(hudSynergy).toBeHidden();

    await selectDashboardTab(gamePage, 'mercenaries');
    await expect(gamePage.locator(SELECTORS.mercSynergyBadge).first()).toBeHidden();
    const statusLoc = gamePage.locator(SELECTORS.mercenarySynergyStatus).first();
    await expect(statusLoc).toBeVisible();
    await expect(statusLoc).not.toHaveClass(/active/);
    await expect(statusLoc).toContainText(/4\s*\/\s*5/);
    errorTracker.assertNoErrors();
  });

  test('TC-MERC-12: Synergy becomes ACTIVE when all 5 mercenaries are unlocked (F23)', async ({
    gamePage,
    errorTracker,
  }) => {
    await injectGameState(gamePage, createAllMercenariesSeed());
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await waitForFsmState(gamePage, 'OASIS_HUB', 5000);

    const snap = await readDebugSnapshot(gamePage);
    expect(snap?.combat.synergyActive).toBe(true);

    await expect(gamePage.locator(SELECTORS.hudSynergyBadge).first()).toBeVisible();
    const hud = await readZoneAHud(gamePage);
    expect(hud.synergyActive).toBe(true);

    await selectDashboardTab(gamePage, 'mercenaries');
    await expect(gamePage.locator(SELECTORS.mercSynergyBadge).first()).toBeVisible();
    await expect(gamePage.locator(SELECTORS.mercenarySynergyStatus).first()).toHaveClass(/active/);
    errorTracker.assertNoErrors();
  });

  test('TC-MERC-13: Expedition Synergy grants +25% Party Attack multiplier to turret damage (F23)', async ({
    gamePage,
    errorTracker,
  }) => {
    // Baseline 4 mercenaries: Lv1 HEAT_RAY deals 4 dmg on SMALL_SWARM (1.0x)
    await injectGameState(
      gamePage,
      createMercenaryCountSeed(['harun', 'sera', 'zara', 'tarik'], 1)
    );
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await waitForFsmState(gamePage, 'OASIS_HUB', 5000);
    await sortieFromOasis(gamePage);

    let damageWithoutSynergy = 0;
    await expect
      .poll(
        async () => {
          const snap = await readDebugSnapshot(gamePage);
          const hit = (snap?.combat.recentDamageEvents ?? []).find(
            (ev) =>
              ev.source === 'TURRET' &&
              ev.turret === 'HEAT_RAY' &&
              ev.tags.includes('SMALL_SWARM')
          );
          if (hit) {
            damageWithoutSynergy = hit.damage;
            return true;
          }
          return false;
        },
        { timeout: 8000, intervals: [50] }
      )
      .toBe(true);
    expect(damageWithoutSynergy).toBe(4);

    // With all 5 mercenaries: Lv1 HEAT_RAY deals round(4 * 1.25) = 5 dmg
    await injectGameState(gamePage, createAllMercenariesSeed());
    await gamePage.reload();
    await waitForCanvasReady(gamePage, 10000);
    await waitForFsmState(gamePage, 'OASIS_HUB', 5000);
    await sortieFromOasis(gamePage);

    let damageWithSynergy = 0;
    await expect
      .poll(
        async () => {
          const snap = await readDebugSnapshot(gamePage);
          const hit = (snap?.combat.recentDamageEvents ?? []).find(
            (ev) =>
              ev.source === 'TURRET' &&
              ev.turret === 'HEAT_RAY' &&
              ev.tags.includes('SMALL_SWARM')
          );
          if (hit) {
            damageWithSynergy = hit.damage;
            return true;
          }
          return false;
        },
        { timeout: 8000, intervals: [50] }
      )
      .toBe(true);
    expect(damageWithSynergy).toBe(5);
    errorTracker.assertNoErrors();
  });

  test('TC-MERC-14: Expedition Synergy grants +20% Trade Gold income stacked with Harun +25% (F23)', async ({
    gamePage,
    errorTracker,
  }) => {
    const seed = createEconomyTradeSeed({
      sunGold: 100,
      cargo: [{ goodsId: 'WATER', qty: 100, buyPrice: 1 }],
      nextOasisPriceRate: 2.0,
      allMercsUnlocked: true,
    });
    seed.sandwalker.turretLevels = { HEAT_RAY: 25, HARPOON: 25, MORTAR: 25 };
    seed.sandwalker.turretTiers = { HEAT_RAY: 3, HARPOON: 3, MORTAR: 3 };
    seed.sandwalker.activeTurret = 'HARPOON';

    await injectGameState(gamePage, seed);
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await waitForFsmState(gamePage, 'OASIS_HUB', 5000);
    await sortieFromOasis(gamePage);
    await setDebugSpeed(gamePage, 4);
    await setDebugProgress(gamePage, 95);
    await waitForFsmState(gamePage, 'BOSS_ENCOUNTER', 5000);
    await waitForFsmState(gamePage, 'OASIS_SETTLEMENT', 20000);

    // Expected payout = floor(100 * 1 * 2.0 * 1.25 * 1.20) = 300G
    const profit = await readSettlementProfit(gamePage);
    expect(profit).toBe(300);
    const snap = await readDebugSnapshot(gamePage);
    expect(snap?.currencies.sunGold).toBeGreaterThanOrEqual(400);
    errorTracker.assertNoErrors();
  });

  test('TC-MERC-15: Unlocking the 5th mercenary live activates Expedition Synergy immediately (F23)', async ({
    gamePage,
    errorTracker,
  }) => {
    const seed = createBossSeedForAct(1, {
      turretLevel: 25,
      turretTier: 3,
      unlockedMercIds: ['harun', 'sera', 'zara'],
    });
    seed.sandwalker.activeTurret = 'HARPOON';

    await injectGameState(gamePage, seed);
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await waitForFsmState(gamePage, 'OASIS_HUB', 5000);

    const beforeSnap = await readDebugSnapshot(gamePage);
    expect(beforeSnap?.combat.synergyActive).toBe(false);
    await expect(gamePage.locator(SELECTORS.hudSynergyBadge).first()).toBeHidden();

    // Clearing Varka unlocks Tarik & Lili (completing 5/5)
    await sortieFromOasis(gamePage);
    await setDebugSpeed(gamePage, 4);
    await setDebugProgress(gamePage, 95);
    await waitForFsmState(gamePage, 'BOSS_ENCOUNTER', 5000);
    await waitForFsmState(gamePage, 'OASIS_SETTLEMENT', 20000);

    const afterSnap = await readDebugSnapshot(gamePage);
    expect(afterSnap?.combat.synergyActive).toBe(true);
    await expect(gamePage.locator(SELECTORS.hudSynergyBadge).first()).toBeVisible();
    errorTracker.assertNoErrors();
  });
});
