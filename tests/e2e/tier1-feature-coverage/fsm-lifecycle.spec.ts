// ============================================================================
// File: tests/e2e/tier1-feature-coverage/fsm-lifecycle.spec.ts
// Milestone E1-A: Tier 1 Feature Coverage — Feature 5 (7-State Game FSM)
// Validates all 7 states (OPENING_HOOK, OASIS_HUB, MARCH_NORMAL, HAZARD_ZONE,
// BOSS_ENCOUNTER, EMERGENCY_REVIVE, OASIS_SETTLEMENT) & transition guards.
// Adheres strictly to Opaque-Box E2E rule (zero src/ or @/ imports).
// ============================================================================

import { test, expect } from '../fixtures/appFixture';
import {
  SELECTORS,
  waitForCanvasReady,
  waitForSteadyState,
  readZoneAHud,
  readFsmState,
  waitForFsmState,
  readRouteMeters,
  sortieFromOasis,
  readDebugSnapshot,
  sampleRegionAverageColor,
  assertCanvasRegionChanged,
  setDebugSpeed,
  setDebugProgress,
  dismissSettlement,
  acceptEmergencyRevive,
  retreatFromRevive,
} from '../fixtures/testHelpers';
import {
  injectGameState,
  createOpeningHookSeed,
  createAct1HubSeed,
  createUpgradeProgressionSeed,
  createEconomyTradeSeed,
  createCargoSeed,
  createBossSeedForAct,
} from '../fixtures/mockStorage';

const R_SKY = { x0: 20, y0: 15, x1: 220, y1: 115 } as const;
const R_FG_SCROLL = { x: 20, y: 428, width: 390, height: 58 } as const;

test.describe('Tier 1: Feature 5 — 7-State Game FSM Lifecycle', () => {
  test('TC-FSM-01: Fresh boot without sandwalkerIntroSeen enters OPENING_HOOK with skip button hidden', async ({
    gamePage,
    errorTracker,
  }) => {
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await waitForSteadyState(gamePage, 2300);

    await waitForFsmState(gamePage, 'OPENING_HOOK', 5000);
    expect(await readFsmState(gamePage)).toBe('OPENING_HOOK');

    const snapshot = await readDebugSnapshot(gamePage);
    expect(snapshot).not.toBeNull();
    expect(snapshot!.combat.fsmStateId).toBe('OPENING_HOOK');
    expect(snapshot!.meta.isIntroCompleted).toBe(false);

    // Decision D10: First-time player cannot skip the opening hook
    const skipBtn = gamePage.locator(SELECTORS.skipIntroBtn).first();
    await expect(skipBtn).toBeHidden();

    // Opening Hook t < 30s uses NIGHT sky palette
    const sky = await sampleRegionAverageColor(
      gamePage,
      R_SKY.x0,
      R_SKY.y0,
      R_SKY.x1,
      R_SKY.y1
    );
    expect(sky.r).toBeLessThan(35);
    expect(sky.g).toBeLessThan(45);
    expect(sky.b).toBeLessThan(70);

    errorTracker.assertNoErrors();
  });

  test('TC-FSM-02: D10 skip flow transitions OPENING_HOOK -> OASIS_HUB with intro rewards', async ({
    gamePage,
    errorTracker,
  }) => {
    const introSeed = createOpeningHookSeed();
    await injectGameState(gamePage, introSeed, { introSeen: true });

    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await waitForFsmState(gamePage, 'OPENING_HOOK', 5000);

    const skipBtn = gamePage.locator(SELECTORS.skipIntroBtn).first();
    await expect(skipBtn).toBeVisible({ timeout: 5000 });
    await skipBtn.click();

    await waitForFsmState(gamePage, 'OASIS_HUB', 10000);

    const hud = await readZoneAHud(gamePage);
    expect(hud.sunGold).toBeGreaterThanOrEqual(300);
    expect(hud.ancientGear).toBeGreaterThanOrEqual(5);
    expect(hud.mapFragments).toBeGreaterThanOrEqual(1);

    const snapshot = await readDebugSnapshot(gamePage);
    expect(snapshot).not.toBeNull();
    expect(snapshot!.combat.fsmStateId).toBe('OASIS_HUB');
    expect(snapshot!.meta.isIntroCompleted).toBe(true);
    expect(snapshot!.currencies.sunGold).toBeGreaterThanOrEqual(300);
    expect(snapshot!.currencies.ancientGear).toBeGreaterThanOrEqual(5);
    expect(snapshot!.currencies.mapFragments).toBeGreaterThanOrEqual(1);

    const harun = snapshot!.mercenaries.find((m) => m.id === 'harun');
    const sera = snapshot!.mercenaries.find((m) => m.id === 'sera');
    expect(harun?.isUnlocked).toBe(true);
    expect(sera?.isUnlocked).toBe(true);

    errorTracker.assertNoErrors();
  });

  test('TC-FSM-03: OASIS_HUB resets route/shield/HP and sortieFromOasis enters MARCH_NORMAL', async ({
    gamePage,
    errorTracker,
  }) => {
    const dirtyHubSeed = createAct1HubSeed();
    dirtyHubSeed.meta.routeProgress = 32;
    dirtyHubSeed.meta.hazardConsumed = true;
    dirtyHubSeed.sandwalker.currentHp = 450;
    dirtyHubSeed.sandwalker.solarShieldHp = 150;
    await injectGameState(gamePage, dirtyHubSeed);

    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await waitForFsmState(gamePage, 'OASIS_HUB', 5000);

    const hubSnap = await readDebugSnapshot(gamePage);
    expect(hubSnap).not.toBeNull();
    expect(hubSnap!.meta.routeProgress).toBe(0);
    expect(hubSnap!.meta.hazardConsumed).toBe(false);
    expect(hubSnap!.sandwalker.currentHp).toBe(hubSnap!.sandwalker.maxHp);
    expect(hubSnap!.sandwalker.solarShieldHp).toBe(0);
    expect(await readRouteMeters(gamePage)).toBe(0);

    await sortieFromOasis(gamePage);
    expect(await readFsmState(gamePage)).toBe('MARCH_NORMAL');

    await gamePage.waitForTimeout(800);
    const marchMeters = await readRouteMeters(gamePage);
    expect(marchMeters).toBeGreaterThan(0);

    await assertCanvasRegionChanged(gamePage, R_FG_SCROLL, 300);
    errorTracker.assertNoErrors();
  });

  test('TC-FSM-04: MARCH_NORMAL enters HAZARD_ZONE at 40%..70% and exits back at >=70% setting hazardConsumed', async ({
    gamePage,
    errorTracker,
  }) => {
    await injectGameState(gamePage, createAct1HubSeed());
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await sortieFromOasis(gamePage);

    await setDebugProgress(gamePage, 40);
    await waitForFsmState(gamePage, 'HAZARD_ZONE', 5000);

    const hazardSnap = await readDebugSnapshot(gamePage);
    expect(hazardSnap).not.toBeNull();
    expect(hazardSnap!.combat.fsmStateId).toBe('HAZARD_ZONE');
    expect(hazardSnap!.meta.hazardConsumed).toBe(false);

    await setDebugProgress(gamePage, 70);
    await waitForFsmState(gamePage, 'MARCH_NORMAL', 5000);

    const postHazardSnap = await readDebugSnapshot(gamePage);
    expect(postHazardSnap).not.toBeNull();
    expect(postHazardSnap!.combat.fsmStateId).toBe('MARCH_NORMAL');
    expect(postHazardSnap!.meta.hazardConsumed).toBe(true);

    errorTracker.assertNoErrors();
  });

  test('TC-FSM-05: hazardConsumed guard prevents re-entering HAZARD_ZONE when progress slides back to 50%', async ({
    gamePage,
    errorTracker,
  }) => {
    await injectGameState(gamePage, createAct1HubSeed());
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await sortieFromOasis(gamePage);

    // Traverse HAZARD_ZONE once (40% -> 70%)
    await setDebugProgress(gamePage, 40);
    await waitForFsmState(gamePage, 'HAZARD_ZONE', 5000);
    await setDebugProgress(gamePage, 70);
    await waitForFsmState(gamePage, 'MARCH_NORMAL', 5000);

    const afterExitSnap = await readDebugSnapshot(gamePage);
    expect(afterExitSnap?.meta.hazardConsumed).toBe(true);

    // Slide progress back into 40..70% band within same route
    await setDebugProgress(gamePage, 50);
    await gamePage.waitForTimeout(1000);

    expect(await readFsmState(gamePage)).toBe('MARCH_NORMAL');
    const guardSnap = await readDebugSnapshot(gamePage);
    expect(guardSnap?.combat.fsmStateId).toBe('MARCH_NORMAL');
    expect(guardSnap?.meta.hazardConsumed).toBe(true);

    errorTracker.assertNoErrors();
  });

  test('TC-FSM-06: MARCH_NORMAL -> BOSS_ENCOUNTER at 95% freezes route and transitions to OASIS_SETTLEMENT on boss clear', async ({
    gamePage,
    errorTracker,
  }) => {
    const bossClearSeed = createUpgradeProgressionSeed({
      sunGold: 20000,
      ancientGear: 30,
      turretLevels: { HEAT_RAY: 30, HARPOON: 30, MORTAR: 30 },
      turretTiers: { HEAT_RAY: 3, HARPOON: 3, MORTAR: 3 },
    });
    await injectGameState(gamePage, bossClearSeed);

    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await sortieFromOasis(gamePage);

    await setDebugProgress(gamePage, 95);
    await waitForFsmState(gamePage, 'BOSS_ENCOUNTER', 5000);

    const bossHud = gamePage.locator(SELECTORS.bossHud).first();
    await expect(bossHud).toBeVisible({ timeout: 5000 });

    // Route progression must freeze during BOSS_ENCOUNTER (actualSpeed === 0)
    const metersStart = await readRouteMeters(gamePage);
    await gamePage.waitForTimeout(600);
    const metersEnd = await readRouteMeters(gamePage);
    expect(metersEnd).toBe(metersStart);

    const bossSnap = await readDebugSnapshot(gamePage);
    if (bossSnap?.combat.actualSpeed !== undefined) {
      expect(bossSnap.combat.actualSpeed).toBe(0);
    }

    // Accelerate combat to defeat the boss and enter OASIS_SETTLEMENT
    await setDebugSpeed(gamePage, 4);
    await waitForFsmState(gamePage, 'OASIS_SETTLEMENT', 30000);

    const settlementModal = gamePage.locator(SELECTORS.settlementModal).first();
    await expect(settlementModal).toBeVisible({ timeout: 5000 });

    const settlementSnap = await readDebugSnapshot(gamePage);
    expect(settlementSnap?.combat.fsmStateId).toBe('OASIS_SETTLEMENT');
    expect(settlementSnap?.meta.routeProgress).toBe(100);

    errorTracker.assertNoErrors();
  });

  test('TC-FSM-07: OASIS_SETTLEMENT sells cargo, increments oasisArrivalCount/index, and returns to OASIS_HUB on dismiss', async ({
    gamePage,
    errorTracker,
  }) => {
    const tradeBossSeed = createEconomyTradeSeed({
      sunGold: 500,
      oasisIndex: 1,
      cargo: [{ goodsId: 'SPICE', qty: 10, buyPrice: 100 }],
      nextOasisPriceRate: 2.0,
    });
    tradeBossSeed.sandwalker.turretLevels = { HEAT_RAY: 30, HARPOON: 30, MORTAR: 30 };
    tradeBossSeed.sandwalker.turretTiers = { HEAT_RAY: 3, HARPOON: 3, MORTAR: 3 };

    const initialArrivalCount = tradeBossSeed.meta.oasisArrivalCount;
    const initialOasisIndex = tradeBossSeed.meta.currentOasisIndex;
    const initialGold = tradeBossSeed.currencies.sunGold;

    await injectGameState(gamePage, tradeBossSeed);
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await sortieFromOasis(gamePage);

    await setDebugProgress(gamePage, 95);
    await waitForFsmState(gamePage, 'BOSS_ENCOUNTER', 5000);
    await setDebugSpeed(gamePage, 4);
    await waitForFsmState(gamePage, 'OASIS_SETTLEMENT', 30000);

    const settlementSnap = await readDebugSnapshot(gamePage);
    expect(settlementSnap).not.toBeNull();
    expect(settlementSnap!.meta.oasisArrivalCount).toBe(initialArrivalCount + 1);
    expect(settlementSnap!.meta.currentOasisIndex).toBe(initialOasisIndex + 1);
    expect(settlementSnap!.currencies.sunGold).toBeGreaterThan(initialGold);
    if (settlementSnap!.trade) {
      expect(settlementSnap!.trade.cargo.length).toBe(0);
    }

    await dismissSettlement(gamePage);
    expect(await readFsmState(gamePage)).toBe('OASIS_HUB');

    const hubSnap = await readDebugSnapshot(gamePage);
    expect(hubSnap?.meta.routeProgress).toBe(0);
    expect(hubSnap?.meta.hazardConsumed).toBe(false);

    errorTracker.assertNoErrors();
  });

  test('TC-FSM-08: EMERGENCY_REVIVE accept restores 50% HP & preserves boss state; retreat halves cargo, resets progress, shows 0 ads', async ({
    gamePage,
    errorTracker,
  }) => {
    // Part A: Boss encounter lethal damage -> Accept Revive restores ~50% HP & keeps boss HP/phase
    const bossSeed = createBossSeedForAct(4);
    bossSeed.sandwalker.turretLevels = { HEAT_RAY: 5, HARPOON: 5, MORTAR: 5 };
    await injectGameState(gamePage, bossSeed);

    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await sortieFromOasis(gamePage);
    await setDebugProgress(gamePage, 95);
    await waitForFsmState(gamePage, 'BOSS_ENCOUNTER', 5000);
    await setDebugSpeed(gamePage, 4);

    await waitForFsmState(gamePage, 'EMERGENCY_REVIVE', 35000);
    const reviveSnap = await readDebugSnapshot(gamePage);
    const bossBeforeRevive = reviveSnap?.combat.boss ?? null;

    await acceptEmergencyRevive(gamePage, { expectedResumeState: 'BOSS_ENCOUNTER' });

    const resumedSnap = await readDebugSnapshot(gamePage);
    expect(resumedSnap).not.toBeNull();
    expect(resumedSnap!.combat.fsmStateId).toBe('BOSS_ENCOUNTER');
    expect(resumedSnap!.sandwalker.currentHp).toBeGreaterThan(0);
    expect(resumedSnap!.sandwalker.currentHp).toBeLessThanOrEqual(
      Math.ceil(resumedSnap!.sandwalker.maxHp * 0.5)
    );
    if (bossBeforeRevive && resumedSnap!.combat.boss) {
      expect(resumedSnap!.combat.boss.phase).toBeGreaterThanOrEqual(bossBeforeRevive.phase);
      expect(resumedSnap!.combat.boss.hp).toBeLessThanOrEqual(bossBeforeRevive.hp);
    }

    // Part B: Act 3 Sandstorm lethal damage -> Retreat halves cargo (floor(11*0.5)=5), resets progress=0, 0 forced ads
    const cargoSeed = createCargoSeed(11, 100, 3);
    await injectGameState(gamePage, cargoSeed);
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await sortieFromOasis(gamePage);
    await setDebugProgress(gamePage, 42);
    await waitForFsmState(gamePage, 'HAZARD_ZONE', 5000);
    await setDebugSpeed(gamePage, 4);

    // Keep routeProgress inside HAZARD_ZONE until Sandstorm DoT + enemies deplete HP
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      const state = await readFsmState(gamePage);
      if (state === 'EMERGENCY_REVIVE') break;
      const snap = await readDebugSnapshot(gamePage);
      if (snap && snap.meta.routeProgress >= 62 && state === 'HAZARD_ZONE') {
        await setDebugProgress(gamePage, 42);
      }
      await gamePage.waitForTimeout(250);
    }
    await waitForFsmState(gamePage, 'EMERGENCY_REVIVE', 5000);

    // Strictly ZERO interstitial ads when entering Emergency Revive
    const adModal = gamePage.locator(SELECTORS.adSimModal).first();
    await expect(adModal).toBeHidden();

    await retreatFromRevive(gamePage, 10000);
    await expect(adModal).toBeHidden();

    const postRetreatSnap = await readDebugSnapshot(gamePage);
    expect(postRetreatSnap).not.toBeNull();
    expect(postRetreatSnap!.combat.fsmStateId).toBe('OASIS_HUB');
    expect(postRetreatSnap!.meta.routeProgress).toBe(0);
    expect(postRetreatSnap!.sandwalker.currentHp).toBe(postRetreatSnap!.sandwalker.maxHp);
    if (postRetreatSnap!.trade) {
      const remainingQty = postRetreatSnap!.trade.cargo.reduce((sum, item) => sum + item.qty, 0);
      expect(remainingQty).toBe(5);
    }

    errorTracker.assertNoErrors();
  });

  test('TC-FSM-09: Single-transition-per-tick re-entrancy guard handles rapid clicks on sortie & settlement', async ({
    gamePage,
    errorTracker,
  }) => {
    const seed = createUpgradeProgressionSeed({
      sunGold: 10000,
      turretLevels: { HEAT_RAY: 30, HARPOON: 30, MORTAR: 30 },
      turretTiers: { HEAT_RAY: 3, HARPOON: 3, MORTAR: 3 },
    });
    const initialArrivalCount = seed.meta.oasisArrivalCount;
    const initialOasisIndex = seed.meta.currentOasisIndex;

    await injectGameState(gamePage, seed);
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await waitForFsmState(gamePage, 'OASIS_HUB', 5000);

    // Trigger rapid synchronous double-click on sortie button in the same tick
    const sortieBtn = gamePage.locator(SELECTORS.sortieBtn).first();
    await expect(sortieBtn).toBeVisible({ timeout: 5000 });
    await sortieBtn.evaluate((el) => {
      const btn = el as HTMLButtonElement;
      btn.click();
      btn.click();
    });

    await waitForFsmState(gamePage, 'MARCH_NORMAL', 5000);
    const marchSnap = await readDebugSnapshot(gamePage);
    expect(marchSnap?.combat.fsmStateId).toBe('MARCH_NORMAL');

    // Advance to Boss -> Settlement, then rapid-click settlementProceedBtn twice
    await setDebugProgress(gamePage, 95);
    await waitForFsmState(gamePage, 'BOSS_ENCOUNTER', 5000);
    await setDebugSpeed(gamePage, 4);
    await waitForFsmState(gamePage, 'OASIS_SETTLEMENT', 30000);

    const proceedBtn = gamePage.locator(SELECTORS.settlementProceedBtn).first();
    await expect(proceedBtn).toBeVisible({ timeout: 5000 });
    await proceedBtn.evaluate((el) => {
      const btn = el as HTMLButtonElement;
      btn.click();
      btn.click();
    });

    // Handle optional interstitial ad if shown
    const adModal = gamePage.locator(SELECTORS.adSimModal).first();
    if (await adModal.isVisible().catch(() => false)) {
      const closeBtn = gamePage.locator(SELECTORS.adSimCloseBtn).first();
      await expect(closeBtn).toBeEnabled({ timeout: 10000 });
      await closeBtn.click();
    }

    await waitForFsmState(gamePage, 'OASIS_HUB', 10000);
    const finalSnap = await readDebugSnapshot(gamePage);
    expect(finalSnap).not.toBeNull();
    expect(finalSnap!.combat.fsmStateId).toBe('OASIS_HUB');
    expect(finalSnap!.meta.oasisArrivalCount).toBe(initialArrivalCount + 1);
    expect(finalSnap!.meta.currentOasisIndex).toBe(initialOasisIndex + 1);

    errorTracker.assertNoErrors();
  });
});
