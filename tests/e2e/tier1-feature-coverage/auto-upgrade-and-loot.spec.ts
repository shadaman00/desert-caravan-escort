// ============================================================================
// File: tests/e2e/tier1-feature-coverage/auto-upgrade-and-loot.spec.ts
// Phase 1 Production Feature Coverage: Condition- & Item-Driven Auto-Upgrade
// Adheres strictly to Opaque-Box E2E rule (zero src/ or @/ imports).
// ============================================================================

import { test, expect } from '../fixtures/appFixture';
import {
  SELECTORS,
  waitForCanvasReady,
  waitForFsmState,
  sortieFromOasis,
  readDebugSnapshot,
  setDebugSpeed,
  spawnDebugLoot,
  selectDashboardTab,
} from '../fixtures/testHelpers';
import {
  injectGameState,
  readCurrentStoredState,
  createAct1HubSeed,
  createUpgradeProgressionSeed,
} from '../fixtures/mockStorage';

test.describe('Phase 1 Production: Auto-Upgrade Engine & Battlefield Loot Pickups', () => {
  test('TC-AUTO-01: Zone C Mech tab renders Auto-Upgrade policy selector, milestone trackers & feed within Zone C bounds', async ({
    gamePage,
    errorTracker,
  }) => {
    await injectGameState(gamePage, createAct1HubSeed());
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);

    await selectDashboardTab(gamePage, 'mech');

    const policySelect = gamePage.locator(SELECTORS.autoInvestPolicySelect).first();
    const passivesSummary = gamePage.locator(SELECTORS.explorerPassivesSummary).first();
    const feed = gamePage.locator(SELECTORS.autoUpgradeFeed).first();

    await expect(policySelect).toBeVisible();
    await expect(policySelect).toHaveValue('MANUAL');
    await expect(passivesSummary).toBeVisible();
    await expect(feed).toBeVisible();
    await expect(gamePage.locator(SELECTORS.turretAutoProgress).first()).toBeVisible();
    await expect(gamePage.locator(SELECTORS.legAutoProgress).first()).toBeVisible();
    await expect(gamePage.locator(SELECTORS.wagonAutoProgress).first()).toBeVisible();

    // Ensure Zone C height stayed clamped cleanly at 484 logical px
    const shellBox = await gamePage.locator(SELECTORS.viewportShell).first().boundingBox();
    const zoneCBox = await gamePage.locator(SELECTORS.zoneC).first().boundingBox();
    expect(shellBox).not.toBeNull();
    expect(zoneCBox).not.toBeNull();
    if (shellBox && zoneCBox) {
      const scale = shellBox.width / 960;
      const logicalZoneCHeight = zoneCBox.height / scale;
      expect(logicalZoneCHeight).toBeCloseTo(484, 1);
    }

    errorTracker.assertNoErrors();
  });

  test('TC-AUTO-02: Battlefield loot magnetizes & applies free upgrades with toast, sound, and milestone kills', async ({
    gamePage,
    assetTracker,
    errorTracker,
  }) => {
    const seed = createUpgradeProgressionSeed({
      sunGold: 200,
      ancientGear: 10,
      turretLevels: { HEAT_RAY: 9, HARPOON: 1, MORTAR: 1 },
      turretTiers: { HEAT_RAY: 1, HARPOON: 1, MORTAR: 1 },
    });
    await injectGameState(gamePage, seed);
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await waitForFsmState(gamePage, 'OASIS_HUB', 5000);
    await sortieFromOasis(gamePage);
    await setDebugSpeed(gamePage, 4);

    // Unlock WebAudio cleanly
    await gamePage.locator(SELECTORS.turretBtnHarpoon).first().click();
    await expect
      .poll(async () => (await readDebugSnapshot(gamePage))?.combat.switchCooldownRemaining ?? 1, {
        timeout: 2500,
      })
      .toBe(0);
    await gamePage.locator(SELECTORS.turretBtnHeatRay).first().click();

    // Spawn 2 real battlefield loot drops: hydraulic blueprint + heat core (chains Lv9 -> Lv10 -> Tier 2!)
    await spawnDebugLoot(gamePage, 'HYDRAULIC_BLUEPRINT');
    await spawnDebugLoot(gamePage, 'TURRET_PART_HEAT');

    // Toast displays non-blocking upgrade feedback in Zone B
    await expect(gamePage.locator(SELECTORS.autoUpgradeToast).first()).toBeVisible({
      timeout: 6000,
    });

    // Wait for loot pickups & automatic upgrades to apply (leg 11, heat Lv >= 10, Tier 2)
    await expect
      .poll(
        async () => {
          const snap = await readDebugSnapshot(gamePage);
          return (
            (snap?.sandwalker.legPartLevel ?? 1) >= 11 &&
            (snap?.sandwalker.turretLevels.HEAT_RAY ?? 1) >= 10 &&
            (snap?.sandwalker.turretTiers.HEAT_RAY ?? 1) >= 2 &&
            (snap?.progression?.counters.lootCollected ?? 0) >= 2 &&
            (snap?.currencies.sunGold ?? 0) >= 200
          );
        },
        { timeout: 6000 }
      )
      .toBe(true);

    // Organic combat kills reach 5-kill milestone for free automatic upgrade
    await expect
      .poll(
        async () => {
          const snap = await readDebugSnapshot(gamePage);
          return snap?.progression?.counters.killsByTurret.HEAT_RAY ?? 0;
        },
        { timeout: 10000 }
      )
      .toBeGreaterThanOrEqual(5);

    const postCombatSnap = await readDebugSnapshot(gamePage);
    expect(postCombatSnap?.sandwalker.legPartLevel).toBeGreaterThanOrEqual(11);
    expect(postCombatSnap?.sandwalker.turretLevels.HEAT_RAY).toBeGreaterThanOrEqual(11);
    expect(postCombatSnap?.sandwalker.turretTiers.HEAT_RAY).toBeGreaterThanOrEqual(2);
    expect(postCombatSnap?.progression?.counters.lootCollected).toBeGreaterThanOrEqual(2);
    expect(postCombatSnap?.progression?.completedMilestones).toContain('ms_heat_kills_5');
    expect(postCombatSnap?.progression?.recentAutoUpgrades.length ?? 0).toBeGreaterThanOrEqual(3);

    assetTracker.assertZeroAssets();
    errorTracker.assertNoErrors();
  });

  test('TC-AUTO-03: Changing Auto-Invest policy to COMBAT invests surplus gold while preserving reserve and persists v2 save', async ({
    gamePage,
    errorTracker,
  }) => {
    const seed = createUpgradeProgressionSeed({
      sunGold: 260,
      ancientGear: 0,
      wagonCount: 1,
      turretLevels: { HEAT_RAY: 1, HARPOON: 1, MORTAR: 1 },
    });
    await injectGameState(gamePage, seed);
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);

    await selectDashboardTab(gamePage, 'mech');
    await gamePage.locator(SELECTORS.autoInvestPolicySelect).first().selectOption('COMBAT');

    await expect
      .poll(async () => (await readDebugSnapshot(gamePage))?.sandwalker.turretLevels.HEAT_RAY ?? 1, {
        timeout: 4000,
      })
      .toBeGreaterThanOrEqual(3);

    const snap = await readDebugSnapshot(gamePage);
    expect(snap?.progression?.autoInvestPolicy).toBe('COMBAT');
    expect(snap?.currencies.sunGold ?? 0).toBeGreaterThanOrEqual(100);
    await expect(gamePage.locator(SELECTORS.autoUpgradeFeed).first()).toContainText('전투 자동 투자');

    // Reload and verify saveVersion 2 persistence
    await gamePage.reload();
    await waitForCanvasReady(gamePage, 10000);

    const reloadedSnap = await readDebugSnapshot(gamePage);
    expect(reloadedSnap?.progression?.autoInvestPolicy).toBe('COMBAT');
    expect(reloadedSnap?.sandwalker.turretLevels.HEAT_RAY).toBeGreaterThanOrEqual(3);

    const stored = await readCurrentStoredState(gamePage);
    expect((stored?.meta as { saveVersion?: number } | undefined)?.saveVersion).toBe(2);

    errorTracker.assertNoErrors();
  });
});
