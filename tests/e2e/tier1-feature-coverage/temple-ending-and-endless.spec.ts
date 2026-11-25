// ============================================================================
// File: tests/e2e/tier1-feature-coverage/temple-ending-and-endless.spec.ts
// Phase 4 Production Feature Coverage: Sun Temple Gate, Ending Sequence & Endless Deep Desert
// Adheres strictly to Opaque-Box E2E rule (zero src/ or @/ imports).
// ============================================================================

import { test, expect } from '../fixtures/appFixture';
import {
  SELECTORS,
  waitForCanvasReady,
  selectDashboardTab,
  readDebugSnapshot,
  setDebugSpeed,
  setDebugProgress,
  sortieFromOasis,
  switchTurret,
  waitForFsmState,
} from '../fixtures/testHelpers';
import {
  injectGameState,
  createAct4RouteSeed,
  createBossSeedForAct,
} from '../fixtures/mockStorage';

test.describe('Phase 4 Production: Sun Temple Gate, Ending Sequence & Endless Mode', () => {
  test('TC-END-01: Sun Temple Gate blocks entry below 10 fragments / 3 keys with guides, then unlocks at 10/3', async ({
    gamePage,
    errorTracker,
  }) => {
    // Locked state: 4 fragments, 1 key at Act 4 Oasis 11
    const lockedSeed = createAct4RouteSeed(11, 12);
    lockedSeed.currencies.mapFragments = 4;
    lockedSeed.currencies.templeKeys = 1;
    await injectGameState(gamePage, lockedSeed);
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);

    await expect(gamePage.locator('[data-testid="temple-gate-banner"]')).toBeVisible();
    await selectDashboardTab(gamePage, 'mech');
    await expect(gamePage.locator(SELECTORS.templeGatePanel)).toBeVisible();
    await expect(gamePage.locator(SELECTORS.templeGateGuide)).toBeVisible();
    await expect(gamePage.locator(SELECTORS.btnUnlockTempleGate)).toBeDisabled();

    // Unlocked state: 10 fragments, 3 keys
    const unlockedSeed = createAct4RouteSeed(11, 12);
    unlockedSeed.currencies.mapFragments = 10;
    unlockedSeed.currencies.templeKeys = 3;
    await injectGameState(gamePage, unlockedSeed);
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);

    await selectDashboardTab(gamePage, 'mech');
    await expect(gamePage.locator(SELECTORS.templeGateGuide)).toHaveCount(0);
    await expect(gamePage.locator(SELECTORS.btnUnlockTempleGate)).toBeEnabled();
    await gamePage.locator(SELECTORS.btnUnlockTempleGate).click();

    await waitForFsmState(gamePage, 'MARCH_NORMAL', 10000);
    const snap = await readDebugSnapshot(gamePage);
    expect(snap?.endgame?.templeGateUnlocked).toBe(true);

    errorTracker.assertNoErrors();
  });

  test('TC-END-02: Clearing Act 4 Sandworm with Temple Gate triggers Ending Sequence modal, commemorative relic & Endless entry', async ({
    gamePage,
    errorTracker,
  }) => {
    const seed = createBossSeedForAct(4, {
      turretLevel: 30,
      turretTier: 3,
      adTier: 3,
      oasisIndex: 11,
      unlockedMercIds: ['harun', 'sera', 'zara', 'tarik', 'lili'],
    });
    seed.currencies.mapFragments = 10;
    seed.currencies.templeKeys = 3;
    await injectGameState(gamePage, seed);
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);

    await sortieFromOasis(gamePage);
    await switchTurret(gamePage, 'HARPOON');
    await setDebugProgress(gamePage, 95);
    await waitForFsmState(gamePage, 'BOSS_ENCOUNTER', 5000);
    await setDebugSpeed(gamePage, 4);

    await expect
      .poll(
        async () => {
          const snap = await readDebugSnapshot(gamePage);
          const phase = snap?.combat.boss?.phase;
          if (phase === 2 && snap?.combat.activeTurret !== 'HEAT_RAY') {
            await switchTurret(gamePage, 'HEAT_RAY');
          } else if (phase === 3 && snap?.combat.activeTurret !== 'MORTAR') {
            await switchTurret(gamePage, 'MORTAR');
          }
          return snap?.combat.fsmStateId;
        },
        { timeout: 30000, intervals: [150] }
      )
      .toBe('OASIS_SETTLEMENT');

    const settlementModal = gamePage.locator(SELECTORS.settlementModal).first();
    await expect(settlementModal).toBeVisible();
    await expect(settlementModal).toContainText('태양 신전 탈환 성공');

    await gamePage.locator(SELECTORS.settlementProceedBtn).first().click();
    await waitForFsmState(gamePage, 'OASIS_HUB', 10000);

    const endingModal = gamePage.locator(SELECTORS.endingSequenceModal);
    await expect(endingModal).toBeVisible();
    await expect(endingModal).toContainText('[세라]');
    await expect(endingModal).toContainText('[하룬]');
    await expect(endingModal).toContainText('[자라]');
    await expect(gamePage.locator('[data-testid="ending-stats-grid"]')).toBeVisible();

    const afterEndingSnap = await readDebugSnapshot(gamePage);
    expect(afterEndingSnap?.endgame?.endingCompleted).toBe(true);
    expect(afterEndingSnap?.relics?.codex).toContain('relic_sun_heart');

    await gamePage.locator(SELECTORS.btnEnterEndless).click();
    await expect(endingModal).toHaveCount(0);
    await expect(gamePage.locator('[data-testid="hud-act-badge"]')).toContainText('심층 D1');

    await selectDashboardTab(gamePage, 'mech');
    await expect(gamePage.locator(SELECTORS.endlessModePanel)).toBeVisible();

    await selectDashboardTab(gamePage, 'trading');
    await expect(gamePage.locator(SELECTORS.goldenTradeBadge)).toBeVisible();

    errorTracker.assertNoErrors();
  });

  test('TC-END-03: Endless Depth 3 applies dual-gimmick hazards and Depth clear advances depth + auto-upgrade + Golden Trade', async ({
    gamePage,
    errorTracker,
  }) => {
    const seed = createBossSeedForAct(4, {
      turretLevel: 30,
      turretTier: 3,
      adTier: 3,
      legPartLevel: 1,
      oasisIndex: 12,
      unlockedMercIds: ['harun', 'sera', 'zara', 'tarik', 'lili'],
    });
    seed.currencies.mapFragments = 10;
    seed.currencies.templeKeys = 3;
    seed.trade.nextOasisPriceRate = 2.0;
    seed.endgame = {
      templeGateUnlocked: true,
      endingCompleted: true,
      pendingEndingModal: false,
      endlessUnlocked: true,
      endlessActive: true,
      currentDepth: 3,
      maxDepthCleared: 2,
      goldenTradeActive: true,
    };
    await injectGameState(gamePage, seed);
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);

    await expect(gamePage.locator('[data-testid="hud-act-badge"]')).toContainText('심층 D3');

    await sortieFromOasis(gamePage);
    await setDebugProgress(gamePage, 38);
    await waitForFsmState(gamePage, 'HAZARD_ZONE', 10000);

    const hazardSnap = await readDebugSnapshot(gamePage);
    expect(hazardSnap?.combat.isQuicksandSlowed).toBe(true);
    expect(hazardSnap?.combat.isSandstorm).toBe(true);
    expect(hazardSnap?.combat.relayTowerVisible).toBe(true);

    // Depth 3 rotates boss Act 3 (Mirage Spirit King -> HEAT_RAY weakpoint)
    await switchTurret(gamePage, 'HEAT_RAY');
    await setDebugProgress(gamePage, 95);
    await waitForFsmState(gamePage, 'BOSS_ENCOUNTER', 10000);
    await setDebugSpeed(gamePage, 4);
    await waitForFsmState(gamePage, 'OASIS_SETTLEMENT', 30000);

    await gamePage.locator(SELECTORS.settlementProceedBtn).first().click();
    await waitForFsmState(gamePage, 'OASIS_HUB', 10000);

    await expect(gamePage.locator('[data-testid="hud-act-badge"]')).toContainText('심층 D4');
    const finalSnap = await readDebugSnapshot(gamePage);
    expect(finalSnap?.endgame?.currentDepth).toBe(4);
    expect(finalSnap?.endgame?.maxDepthCleared).toBeGreaterThanOrEqual(3);
    expect(finalSnap?.trade?.nextOasisPriceRate ?? 0).toBeGreaterThanOrEqual(2.0);
    expect(finalSnap?.trade?.nextOasisPriceRate ?? 0).toBeLessThanOrEqual(4.0);
    expect(
      (finalSnap?.progression?.recentAutoUpgrades ?? []).some((ev) =>
        ev.triggerReason.includes('심층 Depth 3 보상')
      )
    ).toBe(true);

    errorTracker.assertNoErrors();
  });
});
