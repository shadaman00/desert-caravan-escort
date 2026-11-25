// ============================================================================
// File: tests/e2e/tier1-feature-coverage/quests-and-codex-v2.spec.ts
// Phase 2 Production Feature Coverage: 12 Oases, 4-Rarity Relics, 3-Tier Quests
// Adheres strictly to Opaque-Box E2E rule (zero src/ or @/ imports).
// ============================================================================

import { test, expect } from '../fixtures/appFixture';
import {
  SELECTORS,
  waitForCanvasReady,
  selectDashboardTab,
  readDebugSnapshot,
  setDebugSpeed,
  sortieFromOasis,
} from '../fixtures/testHelpers';
import {
  injectGameState,
  createEconomyTradeSeed,
  createRelicCodexSeed,
  createUpgradeProgressionSeed,
} from '../fixtures/mockStorage';

test.describe('Phase 2 Production: 12 Oases, 4-Rarity Relics & 3-Tier Quests', () => {
  test('TC-QUEST-01: Oasis 4..12 show unique hub names/specialties, surge jackpot pill >=2.6x & urgent delivery acceptance', async ({
    gamePage,
    errorTracker,
  }) => {
    const seed = createEconomyTradeSeed({
      oasisIndex: 7,
      sunGold: 500,
      nextOasisPriceRate: 2.8,
    });
    seed.meta.currentAct = 3;
    await injectGameState(gamePage, seed);
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);

    await selectDashboardTab(gamePage, 'trading');
    await expect(gamePage.locator('[data-testid="trade-specialty-name"]')).toContainText(
      '신기루 프리즘'
    );
    await expect(gamePage.locator(SELECTORS.surgeJackpotPill)).toBeVisible();
    await expect(gamePage.locator(SELECTORS.surgeJackpotPill)).toContainText('+280%');

    const urgentBtn = gamePage.locator(SELECTORS.btnStartUrgentDelivery).first();
    await expect(urgentBtn).toBeEnabled();
    await urgentBtn.click();
    await expect(urgentBtn).toHaveText('임무 중');

    const snap = await readDebugSnapshot(gamePage);
    expect(snap?.quests?.urgentDelivery.active).toBe(true);
    errorTracker.assertNoErrors();
  });

  test('TC-QUEST-02: Codex tab renders 20 relics across 4 rarities, live passive bonus banner & Main/Sub Quest Board', async ({
    gamePage,
    errorTracker,
  }) => {
    const seed = createRelicCodexSeed({
      codex: ['relic_solar_disc', 'relic_sun_heart', 'relic_royal_carat'],
      decodedSteles: [1],
    });
    await injectGameState(gamePage, seed);
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);

    await selectDashboardTab(gamePage, 'codex');

    await expect(gamePage.locator(SELECTORS.codexPassiveBanner)).toBeVisible();
    await expect(gamePage.locator(SELECTORS.codexPassiveBanner)).toContainText('포탑 +13%');
    await expect(gamePage.locator(SELECTORS.codexPassiveBanner)).toContainText('교역 +7%');
    await expect(gamePage.locator(SELECTORS.codexPassiveBanner)).toContainText('폭풍감소 8%');

    // Verify 20-relic rarity cards render
    await expect(gamePage.locator('[data-testid^="relic-card-"]')).toHaveCount(20);
    await expect(gamePage.locator('[data-testid="relic-card-relic_sun_heart"]')).toContainText('고대');
    await expect(gamePage.locator('[data-testid="relic-card-relic_solar_disc"]')).toContainText('전설');

    // Verify Quest Board renders Act 1 Main & Sub quests
    const questBoard = gamePage.locator(SELECTORS.questBoard).first();
    await expect(questBoard).toBeVisible();
    await expect(gamePage.locator('[data-testid="quest-row-q_main_act1_stele"]')).toBeVisible();
    await expect(gamePage.locator('[data-testid="quest-row-q_sub_act1_silk_rescue"]')).toBeVisible();

    errorTracker.assertNoErrors();
  });

  test('TC-QUEST-03: Completing Sub Quest during live combat grants gold + MERC_MANUAL auto-upgrade with AC-01 zero assets', async ({
    gamePage,
    assetTracker,
    errorTracker,
  }) => {
    const seed = createUpgradeProgressionSeed({
      sunGold: 0,
      turretLevels: { HEAT_RAY: 5, HARPOON: 5, MORTAR: 5 },
    });
    await injectGameState(gamePage, seed);
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await sortieFromOasis(gamePage);
    await setDebugSpeed(gamePage, 4);

    // Wait for 15 kills -> triggers q_sub_act1_silk_rescue (+120G & MERC_MANUAL free level!)
    await expect
      .poll(
        async () => {
          const snap = await readDebugSnapshot(gamePage);
          return snap?.quests?.completedIds.includes('q_sub_act1_silk_rescue') ?? false;
        },
        { timeout: 15000 }
      )
      .toBe(true);

    const postSnap = await readDebugSnapshot(gamePage);
    expect(postSnap?.mercenaries.some((m) => m.level >= 2)).toBe(true);
    expect(postSnap?.currencies.sunGold ?? 0).toBeGreaterThanOrEqual(120);

    assetTracker.assertZeroAssets();
    errorTracker.assertNoErrors();
  });
});
