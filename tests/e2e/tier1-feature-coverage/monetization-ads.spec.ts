// ============================================================================
// File: tests/e2e/tier1-feature-coverage/monetization-ads.spec.ts
// Milestone E1: Ad Determination Policy, Rewarded Ad Simulator & DebugBar
// Validates F7 (shouldShowInterstitialAd), F8 (Rewarded Ads), F9 (DebugBar)
// Opaque-box Playwright E2E suite (zero src/ or @/ imports)
// ============================================================================

import { test, expect } from '../fixtures/appFixture';
import {
  SELECTORS,
  waitForCanvasReady,
  readZoneAHud,
  readFsmState,
  waitForFsmState,
  readDebugSnapshot,
  openDebugBar,
  setDebugAct,
  setDebugAdTier,
  setDebugPlayTime,
  setDebugProgress,
  setDebugSpeed,
  clickAddDebugCurrencies,
  resetSaveViaDebugBar,
  exportDebugKpi,
  sortieFromOasis,
  waitForAndCloseAdModal,
  acceptEmergencyRevive,
  retreatFromRevive,
  activateRelayTower,
  appraiseRelic,
  claimOfflineReward,
  skipOpeningHook,
} from '../fixtures/testHelpers';
import {
  AdTierLevel,
  INTRO_SEEN_KEY,
  createAct1HubSeed,
  createAct3SandstormSeed,
  createAdTierSeed,
  injectGameState,
  readCurrentStoredState,
} from '../fixtures/mockStorage';

/**
 * Helper to boost turrets, sortie from Oasis Hub, jump to Boss, and reach OASIS_SETTLEMENT.
 */
async function reachSettlementViaBossClear(page: Parameters<typeof sortieFromOasis>[0]): Promise<void> {
  await sortieFromOasis(page);
  await setDebugSpeed(page, 4);
  await setDebugProgress(page, 95);
  await waitForFsmState(page, 'BOSS_ENCOUNTER', 10000);
  await waitForFsmState(page, 'OASIS_SETTLEMENT', 25000);
}

/**
 * Helper to trigger EMERGENCY_REVIVE naturally via combat & hazard damage (never seeding currentHp=1).
 */
async function reachEmergencyReviveNaturally(
  page: Parameters<typeof sortieFromOasis>[0],
  options?: { hazardProgress?: number; timeoutMs?: number }
): Promise<string> {
  const hazardProgress = options?.hazardProgress ?? 40;
  const timeoutMs = options?.timeoutMs ?? 25000;
  await sortieFromOasis(page);
  await setDebugSpeed(page, 4);
  await setDebugProgress(page, hazardProgress);
  await waitForFsmState(page, 'HAZARD_ZONE', 5000);

  const deadline = Date.now() + timeoutMs;
  let lastCombatState = 'HAZARD_ZONE';
  while (Date.now() < deadline) {
    const fsm = await readFsmState(page);
    if (fsm === 'EMERGENCY_REVIVE') {
      return lastCombatState;
    }
    if (fsm === 'HAZARD_ZONE' || fsm === 'MARCH_NORMAL') {
      lastCombatState = fsm;
      const snap = await readDebugSnapshot(page);
      const progress = snap?.meta.routeProgress ?? 0;
      if (fsm === 'HAZARD_ZONE' && progress >= 62) {
        await setDebugProgress(page, hazardProgress);
      } else if (fsm === 'MARCH_NORMAL' && progress >= 88) {
        await setDebugProgress(page, 72);
      }
    }
    await page.waitForTimeout(250);
  }
  throw new Error('Timed out waiting for natural lethal damage to trigger EMERGENCY_REVIVE');
}

test.describe('Tier 1: Ad Policy Truth Table, Rewarded Ad Simulator & DebugBar (F7, F8, F9)', () => {
  test('TC-AD-01: Interstitial blocked when totalPlaySeconds < 900 onboarding guard even on Act 2 Tier 0 even arrival (F7)', async ({
    gamePage,
  }) => {
    const seed = createAdTierSeed(0, 875, 2, 1); // Enter increments arrivalCount to 2 (even)
    seed.sandwalker.turretLevels = { HEAT_RAY: 25, HARPOON: 25, MORTAR: 25 };
    seed.sandwalker.turretTiers = { HEAT_RAY: 3, HARPOON: 3, MORTAR: 3 };
    await injectGameState(gamePage, seed);

    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);

    await reachSettlementViaBossClear(gamePage);
    await setDebugSpeed(gamePage, 1);

    // If M5 numeric playtime input is available, pin 897s right before settlement dismiss (avoids 1s playTimeAccum rollover to 900)
    await openDebugBar(gamePage);
    const playtimeInput = gamePage.locator(SELECTORS.debugPlayTimeInput).first();
    if (await playtimeInput.isVisible().catch(() => false)) {
      await setDebugPlayTime(gamePage, 897);
    }

    const snapBeforeDismiss = await readDebugSnapshot(gamePage);
    expect(snapBeforeDismiss?.meta.totalPlaySeconds ?? 999).toBeGreaterThanOrEqual(875);
    expect(snapBeforeDismiss?.meta.totalPlaySeconds ?? 999).toBeLessThan(900);

    const proceedBtn = gamePage.locator(SELECTORS.settlementProceedBtn).first();
    await proceedBtn.waitFor({ state: 'visible', timeout: 5000 });
    await proceedBtn.click();

    await expect(gamePage.locator(SELECTORS.adSimModal)).toHaveCount(0);
    await waitForFsmState(gamePage, 'OASIS_HUB', 5000);
  });

  test('TC-AD-02: Interstitial blocked on Act 1 even when totalPlaySeconds >= 900 and Tier 0 even arrival (F7)', async ({
    gamePage,
  }) => {
    const seed = createAdTierSeed(0, 1200, 1, 1); // Act 1, >=900s, arrival -> 2
    seed.sandwalker.turretLevels = { HEAT_RAY: 25, HARPOON: 25, MORTAR: 25 };
    seed.sandwalker.turretTiers = { HEAT_RAY: 3, HARPOON: 3, MORTAR: 3 };
    await injectGameState(gamePage, seed);

    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await reachSettlementViaBossClear(gamePage);

    const proceedBtn = gamePage.locator(SELECTORS.settlementProceedBtn).first();
    await proceedBtn.waitFor({ state: 'visible', timeout: 5000 });
    await proceedBtn.click();

    await expect(gamePage.locator(SELECTORS.adSimModal)).toHaveCount(0);
    await waitForFsmState(gamePage, 'OASIS_HUB', 5000);
  });

  test('TC-AD-03: Tier 0 (F2P) skips interstitial on odd oasisArrivalCount (0->1) and shows 5s interstitial on even (1->2) (F7)', async ({
    gamePage,
  }) => {
    const oddArrivalSeed = createAdTierSeed(0, 1200, 2, 0); // Enter increments 0 -> 1 (odd: no ad)
    oddArrivalSeed.sandwalker.turretLevels = { HEAT_RAY: 25, HARPOON: 25, MORTAR: 25 };
    oddArrivalSeed.sandwalker.turretTiers = { HEAT_RAY: 3, HARPOON: 3, MORTAR: 3 };
    await injectGameState(gamePage, oddArrivalSeed);

    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await reachSettlementViaBossClear(gamePage);

    await gamePage.locator(SELECTORS.settlementProceedBtn).first().click();
    await expect(gamePage.locator(SELECTORS.adSimModal)).toHaveCount(0);
    await waitForFsmState(gamePage, 'OASIS_HUB', 5000);

    // Next arrival: arrivalCount 1 -> 2 (even) triggers 5s interstitial
    await reachSettlementViaBossClear(gamePage);
    await gamePage.locator(SELECTORS.settlementProceedBtn).first().click();

    const adShown = await waitForAndCloseAdModal(gamePage, 10000);
    expect(adShown).toBe(true);
    await waitForFsmState(gamePage, 'OASIS_HUB', 5000);
  });

  test('TC-AD-04: Tier 1 (Light Pass) triggers 5s interstitial only every 5th arrival (4th skipped, 5th shown) (F7)', async ({
    gamePage,
  }) => {
    const arrival4Seed = createAdTierSeed(1, 1200, 2, 3); // Enter increments 3 -> 4
    arrival4Seed.sandwalker.turretLevels = { HEAT_RAY: 25, HARPOON: 25, MORTAR: 25 };
    arrival4Seed.sandwalker.turretTiers = { HEAT_RAY: 3, HARPOON: 3, MORTAR: 3 };
    await injectGameState(gamePage, arrival4Seed);

    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await reachSettlementViaBossClear(gamePage);

    await gamePage.locator(SELECTORS.settlementProceedBtn).first().click();
    await expect(gamePage.locator(SELECTORS.adSimModal)).toHaveCount(0);
    await waitForFsmState(gamePage, 'OASIS_HUB', 5000);

    // 5th arrival (oasisArrivalCount % 5 === 0) triggers interstitial
    await reachSettlementViaBossClear(gamePage);
    await gamePage.locator(SELECTORS.settlementProceedBtn).first().click();

    const adShown = await waitForAndCloseAdModal(gamePage, 10000);
    expect(adShown).toBe(true);
    await waitForFsmState(gamePage, 'OASIS_HUB', 5000);
  });

  test('TC-AD-05: Tier 2 (Standard Pass) triggers 5s interstitial on Chapter Boss clear on Act 2 (>=900s) (F7)', async ({
    gamePage,
  }) => {
    const tier2Seed = createAdTierSeed(2, 1200, 2, 1);
    tier2Seed.sandwalker.turretLevels = { HEAT_RAY: 25, HARPOON: 25, MORTAR: 25 };
    tier2Seed.sandwalker.turretTiers = { HEAT_RAY: 3, HARPOON: 3, MORTAR: 3 };
    await injectGameState(gamePage, tier2Seed);

    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await reachSettlementViaBossClear(gamePage);

    await gamePage.locator(SELECTORS.settlementProceedBtn).first().click();
    const adShown = await waitForAndCloseAdModal(gamePage, 10000);
    expect(adShown).toBe(true);
    await waitForFsmState(gamePage, 'OASIS_HUB', 5000);
  });

  test('TC-AD-06: Tier 3 (VIP) enforces 0% interstitial ads even on Chapter Boss clear and 10th arrival (F7)', async ({
    gamePage,
  }) => {
    const tier3Seed = createAdTierSeed(3, 1800, 2, 9); // Enter -> 10 (divisible by 2 and 5)
    tier3Seed.sandwalker.turretLevels = { HEAT_RAY: 25, HARPOON: 25, MORTAR: 25 };
    tier3Seed.sandwalker.turretTiers = { HEAT_RAY: 3, HARPOON: 3, MORTAR: 3 };
    await injectGameState(gamePage, tier3Seed);

    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await reachSettlementViaBossClear(gamePage);

    await gamePage.locator(SELECTORS.settlementProceedBtn).first().click();
    await expect(gamePage.locator(SELECTORS.adSimModal)).toHaveCount(0);
    await waitForFsmState(gamePage, 'OASIS_HUB', 5000);
  });

  test('TC-AD-07: Ethical Ad Policy (AC-04) shows ZERO forced interstitial ads on Emergency Revive or Retreat (F7)', async ({
    gamePage,
  }) => {
    const seed = createAdTierSeed(0, 1500, 3, 2); // Tier 0, >= 900s, Act 3 Sandstorm (15 HP/s DoT), even arrival
    seed.sandwalker.activeTurret = 'HARPOON';
    seed.mercenaries = seed.mercenaries.map((m) => ({ ...m, isUnlocked: false }));
    await injectGameState(gamePage, seed);

    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);

    // Part 1: Lethal damage -> retreatFromRevive -> 0 forced interstitial ads
    await reachEmergencyReviveNaturally(gamePage);
    await setDebugSpeed(gamePage, 1);
    await retreatFromRevive(gamePage, 10000);

    await expect(gamePage.locator(SELECTORS.adSimModal)).toHaveCount(0);
    expect(await readFsmState(gamePage)).toBe('OASIS_HUB');
    expect((await readDebugSnapshot(gamePage))?.meta.oasisArrivalCount).toBe(2);

    // Part 2: Lethal damage -> acceptEmergencyRevive on Tier 0 (>= 900s, Act 3) -> rewarded only, 0 forced interstitial ads
    const resumeState = await reachEmergencyReviveNaturally(gamePage);
    await setDebugSpeed(gamePage, 1);

    const reviveModal = gamePage.locator(SELECTORS.emergencyReviveModal).first();
    await reviveModal.waitFor({ state: 'visible', timeout: 5000 });
    await reviveModal.locator(SELECTORS.reviveAcceptBtn).first().click();

    const adModal = gamePage.locator(SELECTORS.adSimModal).first();
    await adModal.waitFor({ state: 'visible', timeout: 5000 });
    await expect(adModal).not.toContainText(/전면\s*광고/);
    await waitForAndCloseAdModal(gamePage, { optional: false, timeoutMs: 10000 });

    await reviveModal.waitFor({ state: 'hidden', timeout: 5000 });
    await waitForFsmState(gamePage, resumeState, 5000);
    await expect(gamePage.locator(SELECTORS.adSimModal)).toHaveCount(0);
    expect((await readDebugSnapshot(gamePage))?.meta.oasisArrivalCount).toBe(2);
  });

  test('TC-AD-08: AdSimulator keeps close button disabled during countdown and grants reward only at 0s (F8)', async ({
    gamePage,
  }) => {
    const seed = createAdTierSeed(0, 1000, 2, 1);
    seed.currencies.sunGold = 300;
    seed.meta.lastSavedTimestamp = Date.now() - 10 * 60_000 - 2000; // 20G -> 40G Zafar
    await injectGameState(gamePage, seed);

    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);

    const offlineModal = gamePage.locator(SELECTORS.offlineRewardModal).first();
    await expect(offlineModal).toBeVisible({ timeout: 5000 });
    await offlineModal.locator(SELECTORS.zafarDoubleBtn).first().click();

    const adModal = gamePage.locator(SELECTORS.adSimModal).first();
    const countdown = gamePage.locator(SELECTORS.adSimCountdown).first();
    const closeBtn = gamePage.locator(SELECTORS.adSimCloseBtn).first();

    await expect(adModal).toBeVisible({ timeout: 3000 });
    await expect(countdown).toContainText(/[1-3]초 남음/);
    await expect(closeBtn).toBeDisabled();

    // Early forced click must not dismiss modal or grant reward prematurely
    await closeBtn.click({ force: true });
    await expect(adModal).toBeVisible();
    expect((await readZoneAHud(gamePage)).sunGold).toBe(300);

    await expect(closeBtn).toBeEnabled({ timeout: 6000 });
    await expect(countdown).toContainText('0초 남음');
    await closeBtn.click();

    await expect(adModal).toBeHidden({ timeout: 3000 });
    await expect(offlineModal).toBeHidden({ timeout: 3000 });
    expect((await readZoneAHud(gamePage)).sunGold).toBe(340);
  });

  test('TC-AD-09: Rewarded Trigger (ZAFAR_2X) on Tier 0 displays 3s modal and doubles offline gold (F8)', async ({
    gamePage,
  }) => {
    const seed = createAdTierSeed(0, 1000, 2, 1);
    seed.currencies.sunGold = 300;
    seed.sandwalker.wagonCount = 3;
    seed.sandwalker.cargoCapacity = 150;
    seed.meta.lastSavedTimestamp = Date.now() - 10 * 60_000 - 2000; // 60G base -> 120G Zafar
    await injectGameState(gamePage, seed);

    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);

    const offlineModal = gamePage.locator(SELECTORS.offlineRewardModal).first();
    await expect(offlineModal).toBeVisible({ timeout: 5000 });
    await offlineModal.locator(SELECTORS.zafarDoubleBtn).first().click();

    const adModal = gamePage.locator(SELECTORS.adSimModal).first();
    await expect(adModal).toBeVisible({ timeout: 3000 });
    await expect(gamePage.locator(SELECTORS.adSimCountdown).first()).toContainText(/[23]초 남음/);

    const shown = await waitForAndCloseAdModal(gamePage, 8000);
    expect(shown).toBe(true);
    expect((await readZoneAHud(gamePage)).sunGold).toBe(420);
  });

  test('TC-AD-10: Rewarded Trigger (ZAFAR_2X) on Tier 1 uses 5 daily skip tickets (0s) and falls back to 3s at 0 tickets (F8)', async ({
    gamePage,
  }) => {
    const seedWithTickets = createAdTierSeed(1, 1000, 2, 1);
    seedWithTickets.currencies.sunGold = 300;
    seedWithTickets.meta.lastSavedTimestamp = Date.now() - 10 * 60_000 - 2000; // 40G Zafar
    await injectGameState(gamePage, seedWithTickets);

    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);

    await claimOfflineReward(gamePage, true);
    await expect(gamePage.locator(SELECTORS.adSimModal)).toHaveCount(0);
    expect((await readZoneAHud(gamePage)).sunGold).toBe(340);

    await gamePage.evaluate(() => {
      window.dispatchEvent(new Event('pagehide'));
    });
    const afterTicketUse = await readCurrentStoredState(gamePage);
    expect(afterTicketUse?.monetization.dailySkipTicketsLeft).toBe(4);

    // Exhaust tickets to 0 and re-trigger offline modal
    const zeroTicketSeed = createAdTierSeed(1, 1000, 2, 1);
    zeroTicketSeed.currencies.sunGold = 340;
    zeroTicketSeed.monetization.dailySkipTicketsLeft = 0;
    zeroTicketSeed.meta.lastSavedTimestamp = Date.now() - 10 * 60_000 - 2000;
    await injectGameState(gamePage, zeroTicketSeed);

    await gamePage.reload();
    await waitForCanvasReady(gamePage, 10000);

    const offlineModal = gamePage.locator(SELECTORS.offlineRewardModal).first();
    await expect(offlineModal).toBeVisible({ timeout: 5000 });
    await offlineModal.locator(SELECTORS.zafarDoubleBtn).first().click();

    await expect(gamePage.locator(SELECTORS.adSimModal).first()).toBeVisible({ timeout: 3000 });
    await expect(gamePage.locator(SELECTORS.adSimCountdown).first()).toContainText(/[23]초 남음/);
    await waitForAndCloseAdModal(gamePage, 8000);
    expect((await readZoneAHud(gamePage)).sunGold).toBe(380);
  });

  test('TC-AD-11: Rewarded Trigger (ZAFAR_2X) on Tier 2 uses 15 daily skip tickets and falls back to 1s modal at 0 tickets (D2) (F8)', async ({
    gamePage,
  }) => {
    const seedWithTickets = createAdTierSeed(2, 1000, 2, 1);
    seedWithTickets.currencies.sunGold = 300;
    seedWithTickets.meta.lastSavedTimestamp = Date.now() - 10 * 60_000 - 2000; // 40G Zafar
    await injectGameState(gamePage, seedWithTickets);

    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);

    await claimOfflineReward(gamePage, true);
    await expect(gamePage.locator(SELECTORS.adSimModal)).toHaveCount(0);
    expect((await readZoneAHud(gamePage)).sunGold).toBe(340);

    await gamePage.evaluate(() => {
      window.dispatchEvent(new Event('pagehide'));
    });
    const afterUse = await readCurrentStoredState(gamePage);
    expect(afterUse?.monetization.dailySkipTicketsLeft).toBe(14);

    // Exhaust tickets to 0 -> D2 mandates 1s fallback modal
    const zeroTicketSeed = createAdTierSeed(2, 1000, 2, 1);
    zeroTicketSeed.currencies.sunGold = 340;
    zeroTicketSeed.monetization.dailySkipTicketsLeft = 0;
    zeroTicketSeed.meta.lastSavedTimestamp = Date.now() - 10 * 60_000 - 2000;
    await injectGameState(gamePage, zeroTicketSeed);

    await gamePage.reload();
    await waitForCanvasReady(gamePage, 10000);

    const offlineModal = gamePage.locator(SELECTORS.offlineRewardModal).first();
    await expect(offlineModal).toBeVisible({ timeout: 5000 });
    await offlineModal.locator(SELECTORS.zafarDoubleBtn).first().click();

    await expect(gamePage.locator(SELECTORS.adSimModal).first()).toBeVisible({ timeout: 3000 });
    await expect(gamePage.locator(SELECTORS.adSimCountdown).first()).toContainText(/[01]초 남음/);
    await waitForAndCloseAdModal(gamePage, 4000);
    expect((await readZoneAHud(gamePage)).sunGold).toBe(380);
  });

  test('TC-AD-12: Rewarded Trigger (ZAFAR_2X) on Tier 3 (VIP) grants 0s instant 2x without consuming unlimited tickets (F8)', async ({
    gamePage,
  }) => {
    const vipSeed = createAdTierSeed(3, 1000, 2, 1);
    vipSeed.currencies.sunGold = 300;
    vipSeed.meta.lastSavedTimestamp = Date.now() - 10 * 60_000 - 2000;
    await injectGameState(gamePage, vipSeed);

    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);

    await claimOfflineReward(gamePage, true);
    await expect(gamePage.locator(SELECTORS.adSimModal)).toHaveCount(0);
    expect((await readZoneAHud(gamePage)).sunGold).toBe(340);

    await gamePage.evaluate(() => {
      window.dispatchEvent(new Event('pagehide'));
    });
    const stored = await readCurrentStoredState(gamePage);
    expect(stored?.monetization.dailySkipTicketsLeft).toBe(9999);
  });

  test('TC-AD-13: Daily skip ticket reset restores quota when skipTicketsResetDate is stale (F8)', async ({
    gamePage,
  }) => {
    const staleDateSeed = createAdTierSeed(1, 1000, 2, 1);
    staleDateSeed.currencies.sunGold = 300;
    staleDateSeed.monetization.dailySkipTicketsLeft = 0;
    staleDateSeed.monetization.skipTicketsResetDate = '2020-01-01';
    staleDateSeed.meta.lastSavedTimestamp = Date.now() - 10 * 60_000 - 2000;
    await injectGameState(gamePage, staleDateSeed);

    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);

    // Clicking Zafar 2x invokes resetDailySkipTickets(), restoring 5 tickets and consuming 1 -> 0s grant
    await claimOfflineReward(gamePage, true);
    await expect(gamePage.locator(SELECTORS.adSimModal)).toHaveCount(0);
    expect((await readZoneAHud(gamePage)).sunGold).toBe(340);

    await gamePage.evaluate(() => {
      window.dispatchEvent(new Event('pagehide'));
    });
    const stored = await readCurrentStoredState(gamePage);
    const todayUtc = new Date().toISOString().split('T')[0];
    expect(stored?.monetization.dailySkipTicketsLeft).toBe(4);
    expect(stored?.monetization.skipTicketsResetDate).toBe(todayUtc);
  });

  test('TC-AD-14: Rewarded triggers RELAY_TOWER, RELIC_APPRAISAL, and EMERGENCY_REVIVE obey Tier 0 (3s) vs Tier 3 (0s) rules (F8)', async ({
    gamePage,
  }) => {
    // 1A) RELIC_APPRAISAL on Tier 0 -> strict 3s ad modal
    const relicTier0 = createAdTierSeed(0, 1000, 1, 1);
    relicTier0.relics.pending = [{ id: 'relic_solar_disc', appraiseEndsAt: Date.now() + 60_000 }];
    await injectGameState(gamePage, relicTier0);

    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await appraiseRelic(gamePage, true, { timeoutMs: 10000, requireAdModal: true });
    expect((await readDebugSnapshot(gamePage))?.relics?.codex.length ?? 0).toBeGreaterThanOrEqual(1);

    // 1B) RELIC_APPRAISAL on Tier 3 -> 0s instant appraisal
    const relicTier3 = createAdTierSeed(3, 1000, 1, 1);
    relicTier3.relics.pending = [{ id: 'relic_ankh', appraiseEndsAt: Date.now() + 60_000 }];
    await injectGameState(gamePage, relicTier3);

    await gamePage.reload();
    await waitForCanvasReady(gamePage, 10000);
    await appraiseRelic(gamePage, true, { timeoutMs: 10000 });
    await expect(gamePage.locator(SELECTORS.adSimModal)).toHaveCount(0);
    expect((await readDebugSnapshot(gamePage))?.relics?.codex.length ?? 0).toBeGreaterThanOrEqual(1);

    // 2A) RELAY_TOWER in Act 3 Sandstorm on Tier 0 -> strict 3s ad modal
    const stormTier0 = createAct3SandstormSeed(0);
    stormTier0.monetization.adTier = 0;
    stormTier0.monetization.dailySkipTicketsLeft = 0;
    await injectGameState(gamePage, stormTier0);

    await gamePage.reload();
    await waitForCanvasReady(gamePage, 10000);
    await sortieFromOasis(gamePage);
    await setDebugProgress(gamePage, 45);
    await waitForFsmState(gamePage, 'HAZARD_ZONE', 5000);
    await activateRelayTower(gamePage, { timeoutMs: 10000, requireAdModal: true });
    expect((await readDebugSnapshot(gamePage))?.sandwalker.solarShieldHp ?? 0).toBeGreaterThan(0);

    // 2B) RELAY_TOWER in Act 3 Sandstorm on Tier 3 -> 0s instant activation
    const stormTier3 = createAct3SandstormSeed(0);
    stormTier3.monetization.adTier = 3;
    stormTier3.monetization.dailySkipTicketsLeft = 9999;
    await injectGameState(gamePage, stormTier3);

    await gamePage.reload();
    await waitForCanvasReady(gamePage, 10000);
    await sortieFromOasis(gamePage);
    await setDebugProgress(gamePage, 45);
    await waitForFsmState(gamePage, 'HAZARD_ZONE', 5000);
    await activateRelayTower(gamePage, { timeoutMs: 10000 });
    await expect(gamePage.locator(SELECTORS.adSimModal)).toHaveCount(0);
    expect((await readDebugSnapshot(gamePage))?.sandwalker.solarShieldHp ?? 0).toBeGreaterThan(0);

    // 3A) EMERGENCY_REVIVE on Tier 0 via genuine lethal damage -> strict 3s ad modal
    const reviveTier0 = createAdTierSeed(0, 1200, 3, 1);
    reviveTier0.sandwalker.activeTurret = 'HARPOON';
    reviveTier0.mercenaries = reviveTier0.mercenaries.map((m) => ({ ...m, isUnlocked: false }));
    await injectGameState(gamePage, reviveTier0);

    await gamePage.reload();
    await waitForCanvasReady(gamePage, 10000);
    const resumeState0 = await reachEmergencyReviveNaturally(gamePage);
    await setDebugSpeed(gamePage, 1);
    await acceptEmergencyRevive(gamePage, {
      expectedResumeState: resumeState0,
      timeoutMs: 10000,
      requireAdModal: true,
    });
    expect((await readDebugSnapshot(gamePage))?.sandwalker.currentHp ?? 0).toBeGreaterThan(0);

    // 3B) EMERGENCY_REVIVE on Tier 3 via genuine lethal damage -> 0s instant 50% HP revive
    const reviveTier3 = createAdTierSeed(3, 1200, 3, 1);
    reviveTier3.sandwalker.activeTurret = 'HARPOON';
    reviveTier3.mercenaries = reviveTier3.mercenaries.map((m) => ({ ...m, isUnlocked: false }));
    await injectGameState(gamePage, reviveTier3);

    await gamePage.reload();
    await waitForCanvasReady(gamePage, 10000);
    const resumeState3 = await reachEmergencyReviveNaturally(gamePage);
    await setDebugSpeed(gamePage, 1);
    await acceptEmergencyRevive(gamePage, {
      expectedResumeState: resumeState3,
      timeoutMs: 10000,
    });
    await expect(gamePage.locator(SELECTORS.adSimModal)).toHaveCount(0);
    expect((await readDebugSnapshot(gamePage))?.sandwalker.currentHp ?? 0).toBeGreaterThan(0);
  });

  test('TC-AD-15: DebugBar Act Jump (1..4) and Ad Tier Switch (T0..T3) sync Zone A badges, store, and skip ticket quotas (F9)', async ({
    gamePage,
  }) => {
    await injectGameState(gamePage, createAct1HubSeed());
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);

    await openDebugBar(gamePage);

    for (const act of [1, 2, 3, 4]) {
      await setDebugAct(gamePage, act);
      const hud = await readZoneAHud(gamePage);
      expect(hud.actText).toContain(String(act));
      const snap = await readDebugSnapshot(gamePage);
      expect(snap?.meta.currentAct).toBe(act);
      expect(snap?.meta.hazardConsumed).toBe(false);
    }

    const expectedQuotas: Record<AdTierLevel, number> = {
      0: 0,
      1: 5,
      2: 15,
      3: 9999,
    };

    for (const tier of [0, 1, 2, 3] as AdTierLevel[]) {
      await setDebugAdTier(gamePage, tier);
      const hud = await readZoneAHud(gamePage);
      expect(hud.adTierBadge).toContain(`T${tier}`);

      await gamePage.evaluate(() => {
        window.dispatchEvent(new Event('pagehide'));
      });
      const stored = await readCurrentStoredState(gamePage);
      expect(stored?.monetization.adTier).toBe(tier);
      expect(stored?.monetization.dailySkipTicketsLeft).toBe(expectedQuotas[tier]);
    }
  });

  test('TC-AD-16: DebugBar Playtime controls (0s, 1200s, numeric input) and Progress Slider update meta & Zone A HUD (F9)', async ({
    gamePage,
  }) => {
    await injectGameState(gamePage, createAct1HubSeed());
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);

    await openDebugBar(gamePage);
    await setDebugPlayTime(gamePage, 1200);
    expect((await readDebugSnapshot(gamePage))?.meta.totalPlaySeconds).toBeGreaterThanOrEqual(1200);

    await setDebugPlayTime(gamePage, 0);
    expect((await readDebugSnapshot(gamePage))?.meta.totalPlaySeconds).toBeLessThan(10);

    for (const pct of [40, 70, 95, 100, 0]) {
      await setDebugProgress(gamePage, pct);
      expect((await readDebugSnapshot(gamePage))?.meta.routeProgress).toBe(pct);
      await expect(gamePage.locator(SELECTORS.hudRouteProgress).first()).toContainText(`${pct}.0%`);
    }

    // Arbitrary slider range value (33%)
    await setDebugProgress(gamePage, 33);
    expect((await readDebugSnapshot(gamePage))?.meta.routeProgress).toBe(33);
    await expect(gamePage.locator(SELECTORS.hudRouteProgress).first()).toContainText('33.0%');

    // Arbitrary numeric playtime input (M5 interface contract)
    await setDebugPlayTime(gamePage, 899);
    expect((await readDebugSnapshot(gamePage))?.meta.totalPlaySeconds).toBeGreaterThanOrEqual(899);
  });

  test('TC-AD-17: DebugBar 1x/4x Speed toggle accelerates simulation ~4x and currency cheat adds +1000G/+10 Gears (F9)', async ({
    gamePage,
  }) => {
    await injectGameState(gamePage, createAct1HubSeed());
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);

    await openDebugBar(gamePage);
    await setDebugSpeed(gamePage, 1);
    const scale1 = await gamePage.evaluate(
      () => (window as unknown as { __SANDWALKER_TIME_SCALE__?: number }).__SANDWALKER_TIME_SCALE__ ?? 1
    );
    expect(scale1).toBe(1);

    const t1Start = (await readDebugSnapshot(gamePage))?.meta.totalPlaySeconds ?? 0;
    await gamePage.waitForTimeout(1200);
    const t1End = (await readDebugSnapshot(gamePage))?.meta.totalPlaySeconds ?? 0;
    const delta1x = t1End - t1Start;

    await setDebugSpeed(gamePage, 4);
    const scale4 = await gamePage.evaluate(
      () => (window as unknown as { __SANDWALKER_TIME_SCALE__?: number }).__SANDWALKER_TIME_SCALE__
    );
    expect(scale4).toBe(4);
    await expect(gamePage.locator(SELECTORS.debugSpeedBtn).first()).toContainText('4x');

    const t4Start = (await readDebugSnapshot(gamePage))?.meta.totalPlaySeconds ?? 0;
    await gamePage.waitForTimeout(1200);
    const t4End = (await readDebugSnapshot(gamePage))?.meta.totalPlaySeconds ?? 0;
    const delta4x = t4End - t4Start;

    expect(delta1x).toBeGreaterThanOrEqual(1);
    expect(delta1x).toBeLessThanOrEqual(2);
    expect(delta4x).toBeGreaterThanOrEqual(4);

    await setDebugSpeed(gamePage, 1);
    const scaleBack = await gamePage.evaluate(
      () => (window as unknown as { __SANDWALKER_TIME_SCALE__?: number }).__SANDWALKER_TIME_SCALE__
    );
    expect(scaleBack).toBe(1);

    const beforeGold = (await readZoneAHud(gamePage)).sunGold;
    const beforeGears = (await readZoneAHud(gamePage)).ancientGear;
    await clickAddDebugCurrencies(gamePage, 2);
    const afterHud = await readZoneAHud(gamePage);
    expect(afterHud.sunGold).toBe(beforeGold + 2000);
    expect(afterHud.ancientGear).toBe(beforeGears + 20);
  });

  test('TC-AD-18: DebugBar New Game clears save while keeping sandwalkerIntroSeen=true, plus KPI export side effect (F9)', async ({
    gamePage,
    errorTracker,
  }) => {
    const richSeed = createAct1HubSeed();
    richSeed.currencies.sunGold = 9999;
    richSeed.currencies.ancientGear = 88;
    richSeed.meta.currentAct = 4;
    await injectGameState(gamePage, richSeed, { introSeen: true });

    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);

    expect((await readZoneAHud(gamePage)).sunGold).toBe(9999);

    await resetSaveViaDebugBar(gamePage);

    const introSeen = await gamePage.evaluate((k) => window.localStorage.getItem(k), INTRO_SEEN_KEY);
    expect(introSeen).toBe('true');

    if ((await readFsmState(gamePage)) === 'OPENING_HOOK') {
      await skipOpeningHook(gamePage);
    }

    // Reloaded into OASIS_HUB with intro-skip rewards (300G, 5 Gears) rather than prior 9999G
    expect(await readFsmState(gamePage)).toBe('OASIS_HUB');
    const postResetHud = await readZoneAHud(gamePage);
    expect(postResetHud.sunGold).toBe(300);
    expect(postResetHud.ancientGear).toBe(5);
    expect(postResetHud.actText).toContain('1');

    // Export KPI button contract (M5): verify real side effect (JSON download or clipboard/DOM KPI payload)
    await gamePage.evaluate(() => {
      const w = window as unknown as { __capturedKpiClipboard?: string };
      w.__capturedKpiClipboard = undefined;
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        const orig = navigator.clipboard.writeText.bind(navigator.clipboard);
        navigator.clipboard.writeText = async (text: string) => {
          w.__capturedKpiClipboard = text;
          return orig(text).catch(() => undefined);
        };
      } else {
        Object.defineProperty(navigator, 'clipboard', {
          configurable: true,
          value: {
            writeText: async (text: string) => {
              w.__capturedKpiClipboard = text;
            },
          },
        });
      }
    });

    await openDebugBar(gamePage);
    const debugBarTextBefore =
      (await gamePage.locator(SELECTORS.debugBar).first().textContent()) ?? '';

    const downloadPromise = gamePage.waitForEvent('download', { timeout: 2500 }).catch(() => null);
    await exportDebugKpi(gamePage);
    const download = await downloadPromise;

    if (download) {
      expect(download.suggestedFilename()).toMatch(/\.json$/i);
      const stream = await download.createReadStream().catch(() => null);
      if (stream) {
        const chunks: Buffer[] = [];
        for await (const chunk of stream) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        const raw = Buffer.concat(chunks).toString('utf-8');
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        expect(parsed).toBeTruthy();
        expect(typeof parsed).toBe('object');
      }
    } else {
      const clipboardPayload = await gamePage.evaluate(
        () => (window as unknown as { __capturedKpiClipboard?: string }).__capturedKpiClipboard ?? ''
      );
      const debugBarTextAfter =
        (await gamePage.locator(SELECTORS.debugBar).first().textContent()) ?? '';
      const hasClipboardJson =
        clipboardPayload.includes('{') &&
        /totalPlaySeconds|sunGold|averageFps|avgFps|fps|adTier|act/i.test(clipboardPayload);
      const hasDomExportConfirmation =
        debugBarTextAfter !== debugBarTextBefore &&
        /totalPlaySeconds|sunGold|averageFps|완료|복사|exported|copied|\{/i.test(debugBarTextAfter) &&
        !/totalPlaySeconds|sunGold|averageFps|완료|복사|exported|copied|\{/i.test(debugBarTextBefore);
      expect(hasClipboardJson || hasDomExportConfirmation).toBe(true);
    }
    errorTracker.assertNoErrors();
  });

  test('TC-AD-19: DebugBar collapsed pill reflects Act/Ad Tier/Speed changes, toggles open/close, and displays live positive FPS readout (F9)', async ({
    gamePage,
    errorTracker,
  }) => {
    await injectGameState(gamePage, createAct1HubSeed());
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);

    const toggleBtn = gamePage.locator(SELECTORS.debugToggleBtn).first();
    await expect(toggleBtn).toBeVisible();
    await expect(toggleBtn).toContainText(/1막|Act\s*1/);
    await expect(toggleBtn).toContainText('T0');
    await expect(toggleBtn).toContainText('1x');

    // Open DebugBar, mutate Act / Tier / Speed, then collapse back to pill
    await openDebugBar(gamePage);
    const debugBar = gamePage.locator(SELECTORS.debugBar).first();
    await expect(debugBar).toBeVisible();

    await setDebugAct(gamePage, 3);
    await setDebugAdTier(gamePage, 2);
    await setDebugSpeed(gamePage, 4);

    const collapseBtn = debugBar
      .locator('button:has-text("✕"), [data-testid="debug-toggle-btn"]')
      .first();
    await collapseBtn.click();
    await expect(debugBar).toBeHidden({ timeout: 3000 });
    await expect(toggleBtn).toBeVisible({ timeout: 3000 });
    await expect(toggleBtn).toContainText(/3막|Act\s*3/);
    await expect(toggleBtn).toContainText('T2');
    await expect(toggleBtn).toContainText('4x');

    // Re-open during active simulation and verify live positive debug-fps-readout
    await sortieFromOasis(gamePage);
    await openDebugBar(gamePage);
    const fpsReadout = gamePage.locator(SELECTORS.debugFpsReadout).first();
    await expect(fpsReadout).toBeVisible({ timeout: 5000 });
    await expect
      .poll(
        async () => {
          const txt = (await fpsReadout.textContent()) ?? '';
          const match = txt.match(/(\d+(?:\.\d+)?)/);
          return match ? parseFloat(match[1]) : 0;
        },
        { timeout: 5000 }
      )
      .toBeGreaterThan(0);

    errorTracker.assertNoErrors();
  });
});
