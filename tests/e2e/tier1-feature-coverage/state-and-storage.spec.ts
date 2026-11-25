// ============================================================================
// File: tests/e2e/tier1-feature-coverage/state-and-storage.spec.ts
// Milestone E1: State Store, LocalStorage Persistence, Offline Rewards & Timers
// Validates F2 (GameStoreState), F3 (SaveManager & D7), F4 (Offline Rewards), F6 (TimerService)
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
  selectDashboardTab,
  openDebugBar,
  setDebugAct,
  setDebugAdTier,
  setDebugSpeed,
  setDebugProgress,
  clickAddDebugCurrencies,
  switchTurret,
  sortieFromOasis,
  triggerSolarShield,
  resetSaveViaDebugBar,
  claimOfflineReward,
  acceptEmergencyRevive,
  skipOpeningHook,
} from '../fixtures/testHelpers';
import {
  SAVE_STORAGE_KEY,
  SAVE_BACKUP_KEY,
  INTRO_SEEN_KEY,
  createDefaultGameState,
  createAct1HubSeed,
  createAct3SandstormSeed,
  createAllMercenariesSeed,
  createMercenaryCountSeed,
  createCargoSeed,
  createOpeningHookSeed,
  wrapInSaveEnvelope,
  injectGameState,
  injectRawStorage,
  readCurrentStoredState,
} from '../fixtures/mockStorage';

test.describe('Tier 1: GameStoreState, LocalStorage, Offline Rewards & TimerService (F2, F3, F4, F6)', () => {
  test('TC-STATE-01: Fresh boot without save initializes GameStoreState defaults in HUD and DebugSnapshot (F2)', async ({
    gamePage,
  }) => {
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);

    const hud = await readZoneAHud(gamePage);
    expect(hud.actText).toContain('1');
    expect(hud.sunGold).toBe(0);
    expect(hud.ancientGear).toBe(0);
    expect(hud.mapFragments).toBe(0);
    expect(hud.templeKeys).toBe(0);
    await expect(gamePage.locator(SELECTORS.hudSandwalkerHp).first()).toContainText('1000/1000');

    const snap = await readDebugSnapshot(gamePage);
    expect(snap).not.toBeNull();
    if (snap) {
      expect(snap.meta.currentAct).toBe(1);
      expect(snap.currencies.sunGold).toBe(0);
      expect(snap.sandwalker.maxHp).toBe(1000);
      expect(snap.sandwalker.currentHp).toBe(1000);
      expect(snap.sandwalker.wagonCount).toBe(1);
      expect(snap.sandwalker.cargoCapacity).toBe(50);
      expect(snap.sandwalker.activeTurret).toBe('HEAT_RAY');
    }
  });

  test('TC-STATE-02: Store mutations reflect simultaneously in Zone A/C DOM and DebugSnapshot (F2)', async ({
    gamePage,
  }) => {
    await injectGameState(gamePage, createAct1HubSeed());
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);

    await clickAddDebugCurrencies(gamePage, 1);
    await switchTurret(gamePage, 'HARPOON');
    await setDebugAct(gamePage, 3);
    await setDebugAdTier(gamePage, 2);

    const hud = await readZoneAHud(gamePage);
    expect(hud.sunGold).toBe(1300);
    expect(hud.ancientGear).toBe(15);
    expect(hud.actText).toContain('3');
    expect(hud.adTierBadge).toContain('T2');
    await expect(gamePage.locator(SELECTORS.turretBtnHarpoon).first()).toHaveClass(/active/);

    const snap = await readDebugSnapshot(gamePage);
    expect(snap).not.toBeNull();
    if (snap) {
      expect(snap.currencies.sunGold).toBe(1300);
      expect(snap.currencies.ancientGear).toBe(15);
      expect(snap.meta.currentAct).toBe(3);
      expect(snap.sandwalker.activeTurret).toBe('HARPOON');
    }
  });

  test('TC-STATE-03: Mercenaries 5-slot state toggles Expedition Synergy at 4/5 vs 5/5 unlocked (F2)', async ({
    gamePage,
  }) => {
    await injectGameState(
      gamePage,
      createMercenaryCountSeed(['harun', 'sera', 'zara', 'tarik'], 3)
    );
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);

    await expect(gamePage.locator(SELECTORS.hudSynergyBadge)).toHaveCount(0);
    await selectDashboardTab(gamePage, 'mercenaries');
    await expect(gamePage.locator(SELECTORS.mercenarySynergyStatus).first()).toContainText('4/5');
    await expect(gamePage.locator(SELECTORS.mercSynergyBadge)).toHaveCount(0);

    const snap4 = await readDebugSnapshot(gamePage);
    expect(snap4?.combat.synergyActive).toBe(false);
    expect(snap4?.mercenaries.length).toBe(5);

    await injectGameState(gamePage, createAllMercenariesSeed());
    await gamePage.reload();
    await waitForCanvasReady(gamePage, 10000);

    await expect(gamePage.locator(SELECTORS.hudSynergyBadge).first()).toBeVisible();
    await selectDashboardTab(gamePage, 'mercenaries');
    await expect(gamePage.locator(SELECTORS.mercSynergyBadge).first()).toBeVisible();
    await expect(gamePage.locator(SELECTORS.mercenarySynergyStatus).first()).toContainText(
      /활성|25%/
    );

    const snap5 = await readDebugSnapshot(gamePage);
    expect(snap5?.combat.synergyActive).toBe(true);
  });

  test('TC-STATE-04: Sandwalker HP + Solar Shield formatting and wagonCount -> cargoCapacity sync in tabs (F2)', async ({
    gamePage,
  }) => {
    const seed = createAct1HubSeed();
    seed.sandwalker.maxHp = 1000;
    seed.sandwalker.currentHp = 650;
    seed.sandwalker.solarShieldHp = 250;
    seed.sandwalker.wagonCount = 3;
    seed.sandwalker.cargoCapacity = 150;

    await injectGameState(gamePage, seed);
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);

    // OasisHubState resets shield to 0 and repairs HP on hub enter
    const hpBadge = gamePage.locator(SELECTORS.hudSandwalkerHp).first();
    const shieldBadge = gamePage.locator(SELECTORS.hudSolarShield).first();
    await expect(hpBadge).toContainText(/1000\s*\/\s*1000/);
    await expect(shieldBadge).toContainText(/\b0\b/);

    const snap = await readDebugSnapshot(gamePage);
    expect(snap?.sandwalker.wagonCount).toBe(3);
    expect(snap?.sandwalker.cargoCapacity).toBe(150);

    await selectDashboardTab(gamePage, 'mech');
    const content = gamePage.locator('.zone-c-content').first();
    await expect(content).toContainText('3대');
    await expect(content).toContainText('150');
    await expect(content).toContainText('6G/분');

    await selectDashboardTab(gamePage, 'trading');
    await expect(content).toContainText('150');

    // During active march, activating Solar Shield populates sibling hud-solar-shield while hud-sandwalker-hp stays 1000/1000
    await sortieFromOasis(gamePage);
    await triggerSolarShield(gamePage);
    await expect(hpBadge).toContainText(/1000\s*\/\s*1000/);
    await expect(shieldBadge).toContainText(/[1-9]\d*/);
    const shieldText = (await shieldBadge.textContent()) ?? '';
    const displayedShield = parseInt(shieldText.replace(/[^\d]/g, ''), 10);
    expect(displayedShield).toBeGreaterThan(0);
    const snapWithShield = await readDebugSnapshot(gamePage);
    expect(snapWithShield?.sandwalker.solarShieldHp ?? 0).toBeGreaterThan(0);
  });

  test('TC-STATE-05: Relics pending/codex and Steles decoded counts render in Zone C Codex tab (F2)', async ({
    gamePage,
  }) => {
    const seed = createAct1HubSeed();
    seed.relics = {
      pending: [
        { id: 'relic_pending_1', appraiseEndsAt: Date.now() + 60_000 },
        { id: 'relic_pending_2', appraiseEndsAt: Date.now() + 60_000 },
      ],
      codex: ['relic_scarab', 'relic_ankh', 'relic_crown'],
    };
    seed.steles = { decoded: [1, 2, 3, 4] };

    await injectGameState(gamePage, seed);
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);

    await selectDashboardTab(gamePage, 'codex');
    const content = gamePage.locator(SELECTORS.zoneCContent).first();
    await expect(content).toContainText('4 / 12');
    await expect(content).toContainText(/(?:수집된 고대 유물|유물)[^0-9]*3/);
    await expect(content).toContainText(/(?:대기열|pending)[^0-9]*2/i);
  });

  test('TC-STATE-06: SaveManager 5s auto-save writes valid envelope to primary and _bak keys (F3)', async ({
    gamePage,
  }) => {
    await injectGameState(gamePage, createAct1HubSeed());
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);

    await clickAddDebugCurrencies(gamePage, 1);

    await expect
      .poll(async () => (await readCurrentStoredState(gamePage))?.currencies.sunGold ?? 0, {
        timeout: 7500,
        intervals: [400],
      })
      .toBe(1300);

    const envelopes = await gamePage.evaluate(
      ({ primaryKey, backupKey }) => {
        const rawPrimary = window.localStorage.getItem(primaryKey);
        const rawBackup = window.localStorage.getItem(backupKey);
        return {
          primary: rawPrimary ? JSON.parse(rawPrimary) : null,
          backup: rawBackup ? JSON.parse(rawBackup) : null,
        };
      },
      { primaryKey: SAVE_STORAGE_KEY, backupKey: SAVE_BACKUP_KEY }
    );

    expect(envelopes.primary).not.toBeNull();
    expect(envelopes.backup).not.toBeNull();
    expect(envelopes.primary.v).toBe(2);
    expect(typeof envelopes.primary.savedAt).toBe('number');
    expect(envelopes.primary.state.currencies.sunGold).toBe(1300);
    expect(envelopes.primary.state.currencies.ancientGear).toBe(15);
    expect(envelopes.backup.v).toBe(2);
    expect(envelopes.backup.state.currencies.sunGold).toBe(1300);
  });

  test('TC-STATE-07: visibilitychange (hidden) triggers immediate LocalStorage flush before 5s interval (F3)', async ({
    gamePage,
  }) => {
    await injectGameState(gamePage, createAct1HubSeed());
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);

    await clickAddDebugCurrencies(gamePage, 2);
    await switchTurret(gamePage, 'MORTAR');

    await gamePage.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'hidden',
      });
      document.dispatchEvent(new Event('visibilitychange'));
    });

    const stored = await readCurrentStoredState(gamePage);
    expect(stored).not.toBeNull();
    expect(stored?.currencies.sunGold).toBe(2300);
    expect(stored?.currencies.ancientGear).toBe(25);
    expect(stored?.sandwalker.activeTurret).toBe('MORTAR');
  });

  test('TC-STATE-08: pagehide triggers immediate LocalStorage flush before 5s interval (F3)', async ({
    gamePage,
  }) => {
    await injectGameState(gamePage, createAct1HubSeed());
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);

    await clickAddDebugCurrencies(gamePage, 1);
    await switchTurret(gamePage, 'HARPOON');

    await gamePage.evaluate(() => {
      window.dispatchEvent(new Event('pagehide'));
    });

    const stored = await readCurrentStoredState(gamePage);
    expect(stored).not.toBeNull();
    expect(stored?.currencies.sunGold).toBe(1300);
    expect(stored?.sandwalker.activeTurret).toBe('HARPOON');
  });

  test('TC-STATE-09: Mid-route save policy (D7) resets routeProgress=0 and hazardConsumed=false while preserving cargo & currencies (F3)', async ({
    gamePage,
  }) => {
    const seed = createCargoSeed(12, 100, 2);
    seed.currencies.sunGold = 500;
    seed.sandwalker.legPartLevel = 7;
    seed.meta.hazardConsumed = true;

    await injectGameState(gamePage, seed);
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);

    await openDebugBar(gamePage);
    await setDebugProgress(gamePage, 55);
    await clickAddDebugCurrencies(gamePage, 1);

    await expect(gamePage.locator(SELECTORS.hudRouteProgress).first()).toContainText('55.0%');

    await gamePage.evaluate(() => {
      window.dispatchEvent(new Event('pagehide'));
    });

    const stored = await readCurrentStoredState(gamePage);
    expect(stored).not.toBeNull();
    expect(stored?.meta.routeProgress).toBe(0);
    expect(stored?.meta.hazardConsumed).toBe(false);
    expect(stored?.sandwalker.manualAimTargetId).toBeNull();
    expect(stored?.mercenaries.every((m) => m.skillCooldown === 0)).toBe(true);
    expect(stored?.currencies.sunGold).toBe(1500);
    expect(stored?.sandwalker.legPartLevel).toBe(7);
    expect(stored?.trade.cargo[0]?.qty).toBe(12);

    await gamePage.reload();
    await waitForCanvasReady(gamePage, 10000);

    expect(await readFsmState(gamePage)).toBe('OASIS_HUB');
    const hud = await readZoneAHud(gamePage);
    expect(hud.routeProgress).toBe(0);
    expect(hud.sunGold).toBe(1500);
  });

  test('TC-STATE-10: Primary JSON corruption recovers cleanly from _bak with zero uncaught errors (F3)', async ({
    gamePage,
    errorTracker,
  }) => {
    const backupState = createAct1HubSeed();
    backupState.currencies.sunGold = 4250;
    backupState.meta.currentAct = 3;
    backupState.sandwalker.wagonCount = 4;
    backupState.sandwalker.cargoCapacity = 200;

    await injectRawStorage(gamePage, {
      [SAVE_STORAGE_KEY]: '{broken_json_payload!!!',
      [SAVE_BACKUP_KEY]: JSON.stringify(wrapInSaveEnvelope(backupState)),
      [INTRO_SEEN_KEY]: 'true',
    });

    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);

    const hud = await readZoneAHud(gamePage);
    expect(hud.sunGold).toBe(4250);
    expect(hud.actText).toContain('3');

    const snap = await readDebugSnapshot(gamePage);
    expect(snap?.sandwalker.wagonCount).toBe(4);
    expect(snap?.sandwalker.cargoCapacity).toBe(200);
    errorTracker.assertNoErrors();
  });

  test('TC-STATE-11: Primary invalid envelope structure recovers cleanly from _bak (F3)', async ({
    gamePage,
    errorTracker,
  }) => {
    const backupState = createAct1HubSeed();
    backupState.currencies.sunGold = 7777;
    backupState.meta.currentAct = 2;

    await injectRawStorage(gamePage, {
      [SAVE_STORAGE_KEY]: JSON.stringify({ v: 'corrupt-version', state: null }),
      [SAVE_BACKUP_KEY]: JSON.stringify(wrapInSaveEnvelope(backupState)),
      [INTRO_SEEN_KEY]: 'true',
    });

    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);

    const hud = await readZoneAHud(gamePage);
    expect(hud.sunGold).toBe(7777);
    expect(hud.actText).toContain('2');
    errorTracker.assertNoErrors();
  });

  test('TC-STATE-12: Partial/legacy save migration fills missing slices and normalizes 5 mercenaries (F3)', async ({
    gamePage,
    errorTracker,
  }) => {
    const legacyEnvelope = {
      v: 0,
      savedAt: Date.now() - 10_000,
      state: {
        meta: {
          isIntroCompleted: true,
          currentAct: 2,
          currentOasisIndex: 2,
          totalPlaySeconds: 950,
        },
        currencies: {
          sunGold: 1850,
          ancientGear: 12,
        },
        sandwalker: {
          legPartLevel: 6,
          wagonCount: 2,
          cargoCapacity: 100,
        },
        mercenaries: [
          { id: 'harun', level: 4, isUnlocked: true },
          { id: 'sera', level: 3, isUnlocked: true },
        ],
      },
    };

    const rawLegacy = JSON.stringify(legacyEnvelope);
    await injectRawStorage(gamePage, {
      [SAVE_STORAGE_KEY]: rawLegacy,
      [SAVE_BACKUP_KEY]: rawLegacy,
      [INTRO_SEEN_KEY]: 'true',
    });

    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);

    const hud = await readZoneAHud(gamePage);
    expect(hud.sunGold).toBe(1850);
    expect(hud.ancientGear).toBe(12);
    expect(hud.actText).toContain('2');

    const snap = await readDebugSnapshot(gamePage);
    expect(snap?.meta.saveVersion).toBe(2);
    expect(snap?.mercenaries.length).toBe(5);
    expect(snap?.sandwalker.legPartLevel).toBe(6);
    errorTracker.assertNoErrors();
  });

  test('TC-STATE-13: Dual corruption falls back to defaults (+ intro skip rewards) and logs expected console.error (F3)', async ({
    gamePage,
    errorTracker,
  }) => {
    await injectRawStorage(gamePage, {
      [SAVE_STORAGE_KEY]: '<<<invalid-primary>>>',
      [SAVE_BACKUP_KEY]: '{{{invalid-backup',
      [INTRO_SEEN_KEY]: 'true',
    });

    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);

    const consoleErrors = errorTracker.getConsoleErrors();
    expect(errorTracker.getPageErrors()).toHaveLength(0);
    expect(consoleErrors.length).toBeGreaterThan(0);
    expect(consoleErrors.every((e) => e.text.includes('[SaveManager]'))).toBe(true);
    // Clear expected dual-corruption console.error so appFixture teardown remains clean
    errorTracker.clear();

    if ((await readFsmState(gamePage)) === 'OPENING_HOOK') {
      await skipOpeningHook(gamePage);
    }

    expect(await readFsmState(gamePage)).toBe('OASIS_HUB');
    const hud = await readZoneAHud(gamePage);
    expect(hud.sunGold).toBe(300);
    expect(hud.ancientGear).toBe(5);
  });

  test('TC-STATE-14: Offline reward modal is suppressed for <60s elapsed and negative clock skew (F4)', async ({
    gamePage,
  }) => {
    const shortElapsedSeed = createAct1HubSeed();
    shortElapsedSeed.meta.lastSavedTimestamp = Date.now() - 45_000;
    await injectGameState(gamePage, shortElapsedSeed);

    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);

    const modal = gamePage.locator(SELECTORS.offlineRewardModal);
    await expect(modal).toHaveCount(0);

    const futureSkewSeed = createAct1HubSeed();
    futureSkewSeed.meta.lastSavedTimestamp = Date.now() + 600_000;
    await injectGameState(gamePage, futureSkewSeed);

    await gamePage.reload();
    await waitForCanvasReady(gamePage, 10000);
    await expect(modal).toHaveCount(0);
  });

  test('TC-STATE-15: Offline reward formula calculates 60s boundary and 10m * 3 wagons = 60G / 120G Zafar (F4)', async ({
    gamePage,
  }) => {
    const seed60s = createAct1HubSeed();
    seed60s.sandwalker.wagonCount = 2;
    seed60s.sandwalker.cargoCapacity = 100;
    seed60s.meta.lastSavedTimestamp = Date.now() - 62_000;
    await injectGameState(gamePage, seed60s);

    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);

    const modal = gamePage.locator(SELECTORS.offlineRewardModal).first();
    await expect(modal).toBeVisible({ timeout: 5000 });
    await expect(modal).toContainText('1분');
    await expect(modal).toContainText('+4 G');

    const seed10m = createAct1HubSeed();
    seed10m.sandwalker.wagonCount = 3;
    seed10m.sandwalker.cargoCapacity = 150;
    seed10m.meta.lastSavedTimestamp = Date.now() - 10 * 60_000 - 2000;
    await injectGameState(gamePage, seed10m);

    await gamePage.reload();
    await waitForCanvasReady(gamePage, 10000);

    await expect(modal).toBeVisible({ timeout: 5000 });
    await expect(modal).toContainText('10분');
    await expect(modal).toContainText('+60 G');
    await expect(modal.locator(SELECTORS.zafarDoubleBtn).first()).toContainText('120G');
  });

  test('TC-STATE-16: Offline reward caps at 480 minutes (8h) yielding 4,800G / 9,600G Zafar with 5 wagons (F4)', async ({
    gamePage,
  }) => {
    const seed = createAct1HubSeed();
    seed.sandwalker.wagonCount = 5;
    seed.sandwalker.cargoCapacity = 250;
    seed.meta.lastSavedTimestamp = Date.now() - 600 * 60_000;
    await injectGameState(gamePage, seed);

    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);

    const modal = gamePage.locator(SELECTORS.offlineRewardModal).first();
    await expect(modal).toBeVisible({ timeout: 5000 });
    await expect(modal).toContainText('480분');
    await expect(modal).toContainText('최대 8시간 도달');
    await expect(modal).toContainText('+4,800 G');
    await expect(modal.locator(SELECTORS.zafarDoubleBtn).first()).toContainText(/9,?600\s*G/);
  });

  test('TC-STATE-17: Standard offline reward claim adds gold, closes modal, and persists across reload (F4)', async ({
    gamePage,
  }) => {
    const seed = createAct1HubSeed();
    seed.currencies.sunGold = 300;
    seed.sandwalker.wagonCount = 2;
    seed.sandwalker.cargoCapacity = 100;
    seed.meta.lastSavedTimestamp = Date.now() - 15 * 60_000 - 2000; // 2*2*15 = 60G
    await injectGameState(gamePage, seed);

    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);

    await claimOfflineReward(gamePage, false);

    const hud = await readZoneAHud(gamePage);
    expect(hud.sunGold).toBe(360);

    await gamePage.evaluate(() => {
      window.dispatchEvent(new Event('pagehide'));
    });

    await gamePage.reload();
    await waitForCanvasReady(gamePage, 10000);

    await expect(gamePage.locator(SELECTORS.offlineRewardModal)).toHaveCount(0);
    const reloadedHud = await readZoneAHud(gamePage);
    expect(reloadedHud.sunGold).toBe(360);
  });

  test('TC-STATE-18: Zafar 2x offline claim runs 3s ad on Tier 0 and grants 0s instant 2x on Tier 3 (F4)', async ({
    gamePage,
  }) => {
    const tier0Seed = createAct1HubSeed();
    tier0Seed.currencies.sunGold = 300;
    tier0Seed.sandwalker.wagonCount = 2;
    tier0Seed.sandwalker.cargoCapacity = 100;
    tier0Seed.monetization.adTier = 0;
    tier0Seed.meta.lastSavedTimestamp = Date.now() - 10 * 60_000 - 2000; // 40G base -> 80G Zafar
    await injectGameState(gamePage, tier0Seed);

    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);

    const offlineModal = gamePage.locator(SELECTORS.offlineRewardModal).first();
    await expect(offlineModal).toBeVisible({ timeout: 5000 });
    await offlineModal.locator(SELECTORS.zafarDoubleBtn).first().click();

    const adModal = gamePage.locator(SELECTORS.adSimModal).first();
    await expect(adModal).toBeVisible({ timeout: 3000 });
    const closeBtn = gamePage.locator(SELECTORS.adSimCloseBtn).first();
    await expect(closeBtn).toBeDisabled();
    await expect(closeBtn).toBeEnabled({ timeout: 6000 });
    await closeBtn.click();
    await expect(adModal).toBeHidden({ timeout: 3000 });
    await expect(offlineModal).toBeHidden({ timeout: 3000 });
    expect((await readZoneAHud(gamePage)).sunGold).toBe(380);

    const tier3Seed = createDefaultGameState();
    tier3Seed.meta.isIntroCompleted = true;
    tier3Seed.meta.currentOasisIndex = 1;
    tier3Seed.currencies.sunGold = 380;
    tier3Seed.sandwalker.wagonCount = 2;
    tier3Seed.sandwalker.cargoCapacity = 100;
    tier3Seed.monetization.adTier = 3;
    tier3Seed.monetization.dailySkipTicketsLeft = 9999;
    tier3Seed.meta.lastSavedTimestamp = Date.now() - 10 * 60_000 - 2000;
    await injectGameState(gamePage, tier3Seed);

    await gamePage.reload();
    await waitForCanvasReady(gamePage, 10000);
    await claimOfflineReward(gamePage, true);
    await expect(gamePage.locator(SELECTORS.adSimModal)).toHaveCount(0);
    expect((await readZoneAHud(gamePage)).sunGold).toBe(460);
  });

  test('TC-STATE-19: TimerService cancels OPENING_HOOK interval cleanly when intro is skipped and enforces D10 skip visibility (F6)', async ({
    gamePage,
    errorTracker,
  }) => {
    // D10 first-time user (sandwalkerIntroSeen !== 'true'): skip-intro-btn MUST stay hidden
    await injectGameState(gamePage, createOpeningHookSeed(), { introSeen: false });
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);

    await waitForFsmState(gamePage, 'OPENING_HOOK', 5000);
    await gamePage.waitForTimeout(1200);

    const skipBtn = gamePage.locator(SELECTORS.skipIntroBtn).first();
    await expect(skipBtn).toBeHidden();
    expect(await readFsmState(gamePage)).toBe('OPENING_HOOK');

    // D10 returning user (sandwalkerIntroSeen === 'true' && !isIntroCompleted): skip-intro-btn is visible
    await injectGameState(gamePage, createOpeningHookSeed(), { introSeen: true });
    await gamePage.reload();
    await waitForCanvasReady(gamePage, 10000);

    await waitForFsmState(gamePage, 'OPENING_HOOK', 5000);
    await gamePage.waitForTimeout(1200);
    await skipBtn.waitFor({ state: 'visible', timeout: 5000 });
    await skipBtn.click();

    await waitForFsmState(gamePage, 'OASIS_HUB', 5000);
    await gamePage.waitForTimeout(1500);

    expect(await readFsmState(gamePage)).toBe('OASIS_HUB');
    expect((await readZoneAHud(gamePage)).sunGold).toBe(300);
    errorTracker.assertNoErrors();
  });

  test('TC-STATE-20: TimerService cancels EMERGENCY_REVIVE 5s auto-retreat timer when revive is accepted (F6)', async ({
    gamePage,
    errorTracker,
  }) => {
    const seed = createCargoSeed(10, 100, 3); // Act 3 Sandstorm + base Lv1 stats (no currentHp=1 seed)
    seed.sandwalker.activeTurret = 'HARPOON';
    seed.mercenaries = seed.mercenaries.map((m) => ({ ...m, isUnlocked: false }));
    await injectGameState(gamePage, seed);

    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);

    await sortieFromOasis(gamePage);
    await setDebugSpeed(gamePage, 4);
    await setDebugProgress(gamePage, 40);
    await waitForFsmState(gamePage, 'HAZARD_ZONE', 5000);

    // Wait for genuine lethal hazard/combat damage while keeping progress < 58% so resumed march stays in HAZARD_ZONE
    let expectedResumeState = 'HAZARD_ZONE';
    const deadline = Date.now() + 25000;
    while (Date.now() < deadline) {
      const fsm = await readFsmState(gamePage);
      if (fsm === 'EMERGENCY_REVIVE') break;
      if (fsm === 'HAZARD_ZONE' || fsm === 'MARCH_NORMAL') {
        expectedResumeState = fsm;
        const snap = await readDebugSnapshot(gamePage);
        if (fsm === 'HAZARD_ZONE' && (snap?.meta.routeProgress ?? 0) >= 58) {
          await setDebugProgress(gamePage, 40);
        }
      }
      await gamePage.waitForTimeout(250);
    }
    await waitForFsmState(gamePage, 'EMERGENCY_REVIVE', 2000);

    // Switch back to 1x before testing the 5s timer & resume behavior
    await setDebugSpeed(gamePage, 1);

    await acceptEmergencyRevive(gamePage, {
      expectedResumeState,
      timeoutMs: 10000,
    });

    // Stabilize post-revive combat (Solar Shield + Mortar AOE) so accumulated wave enemies do not re-kill walker during 5.5s wait
    await triggerSolarShield(gamePage);
    await switchTurret(gamePage, 'MORTAR');

    // Wait past the 5s auto-retreat deadline at 1x to prove group timer was cancelled on exit
    await gamePage.waitForTimeout(5500);
    const fsmAfterWait = await readFsmState(gamePage);
    expect(fsmAfterWait).toBe(expectedResumeState);

    const snapAfterWait = await readDebugSnapshot(gamePage);
    if (!snapAfterWait?.trade) {
      await gamePage.evaluate(() => window.dispatchEvent(new Event('pagehide')));
    }
    const storedAfterWait = await readCurrentStoredState(gamePage);
    const cargoQty = snapAfterWait?.trade?.cargo[0]?.qty ?? storedAfterWait?.trade.cargo[0]?.qty;
    expect(cargoQty).toBe(10);
    errorTracker.assertNoErrors();
  });

  test('TC-STATE-21: Rapid DebugBar progress jumps and AdSimulator countdown remain isolated with zero ghost errors (F6)', async ({
    gamePage,
    errorTracker,
  }) => {
    const seed = createAct1HubSeed();
    seed.monetization.adTier = 0;
    seed.meta.lastSavedTimestamp = Date.now() - 10 * 60_000;
    await injectGameState(gamePage, seed);

    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);

    await openDebugBar(gamePage);
    for (const pct of [0, 40, 70, 95, 40, 0]) {
      await setDebugProgress(gamePage, pct);
    }

    const offlineModal = gamePage.locator(SELECTORS.offlineRewardModal).first();
    await expect(offlineModal).toBeVisible({ timeout: 5000 });
    await offlineModal.locator(SELECTORS.zafarDoubleBtn).first().click();

    const adModal = gamePage.locator(SELECTORS.adSimModal).first();
    await expect(adModal).toBeVisible({ timeout: 3000 });

    // Drive rapid DebugBar updates while AdSimulator timer is counting down
    await setDebugSpeed(gamePage, 4);
    await setDebugProgress(gamePage, 40);
    await setDebugProgress(gamePage, 95);
    await setDebugProgress(gamePage, 0);

    const closeBtn = gamePage.locator(SELECTORS.adSimCloseBtn).first();
    await expect(closeBtn).toBeEnabled({ timeout: 6000 });
    await closeBtn.click();
    await expect(adModal).toBeHidden({ timeout: 3000 });

    const snap = await readDebugSnapshot(gamePage);
    expect(snap?.meta.routeProgress).toBe(0);
    errorTracker.assertNoErrors();
  });

  test('TC-STATE-22: EMERGENCY_REVIVE 5s auto-retreat timer expires naturally when unclicked, halving cargo (floor) with 0 ads (F6)', async ({
    gamePage,
    errorTracker,
  }) => {
    const seed = createCargoSeed(11, 100, 3); // floor(11 * 0.5) = 5
    seed.sandwalker.activeTurret = 'HARPOON';
    seed.mercenaries = seed.mercenaries.map((m) => ({ ...m, isUnlocked: false }));
    await injectGameState(gamePage, seed);

    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);

    await sortieFromOasis(gamePage);
    await setDebugSpeed(gamePage, 4);
    await setDebugProgress(gamePage, 40);
    await waitForFsmState(gamePage, 'HAZARD_ZONE', 5000);

    const deadline = Date.now() + 25000;
    while (Date.now() < deadline) {
      const fsm = await readFsmState(gamePage);
      if (fsm === 'EMERGENCY_REVIVE') break;
      if (fsm === 'HAZARD_ZONE') {
        const snap = await readDebugSnapshot(gamePage);
        if ((snap?.meta.routeProgress ?? 0) >= 62) {
          await setDebugProgress(gamePage, 40);
        }
      }
      await gamePage.waitForTimeout(250);
    }
    await waitForFsmState(gamePage, 'EMERGENCY_REVIVE', 2000);

    await setDebugSpeed(gamePage, 1);
    const reviveModal = gamePage.locator(SELECTORS.emergencyReviveModal).first();
    await expect(reviveModal).toBeVisible({ timeout: 3000 });

    // Leave unclicked so the 5s auto-retreat timer expires naturally (~5.5-6.5s)
    await waitForFsmState(gamePage, 'OASIS_HUB', 8000);
    await expect(reviveModal).toBeHidden({ timeout: 2000 });
    await expect(gamePage.locator(SELECTORS.adSimModal)).toHaveCount(0);

    const snapAfterRetreat = await readDebugSnapshot(gamePage);
    expect(snapAfterRetreat?.meta.routeProgress).toBe(0);
    if (!snapAfterRetreat?.trade) {
      await gamePage.evaluate(() => window.dispatchEvent(new Event('pagehide')));
    }
    const stored = await readCurrentStoredState(gamePage);
    const cargoQty = snapAfterRetreat?.trade?.cargo[0]?.qty ?? stored?.trade.cargo[0]?.qty;
    expect(cargoQty).toBe(5);
    errorTracker.assertNoErrors();
  });

  test('TC-STATE-23: resetSaveViaDebugBar cancels active mid-route and OPENING_HOOK timer groups with zero ghost transitions (F6)', async ({
    gamePage,
    errorTracker,
  }) => {
    // Part A: Mid-route HAZARD_ZONE reset
    await injectGameState(gamePage, createAct3SandstormSeed(0), { introSeen: true });
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);

    await sortieFromOasis(gamePage);
    await setDebugProgress(gamePage, 45);
    await waitForFsmState(gamePage, 'HAZARD_ZONE', 5000);

    await resetSaveViaDebugBar(gamePage);
    if ((await readFsmState(gamePage)) === 'OPENING_HOOK') {
      await skipOpeningHook(gamePage);
    }
    await waitForFsmState(gamePage, 'OASIS_HUB', 5000);

    await gamePage.waitForTimeout(2200);
    expect(await readFsmState(gamePage)).toBe('OASIS_HUB');
    const hubSnap = await readDebugSnapshot(gamePage);
    expect(hubSnap?.meta.routeProgress).toBe(0);
    expect(hubSnap?.meta.hazardConsumed).toBe(false);

    // Part B: Active OPENING_HOOK timer group reset
    await injectGameState(gamePage, createOpeningHookSeed(), { introSeen: false });
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await waitForFsmState(gamePage, 'OPENING_HOOK', 5000);
    await gamePage.waitForTimeout(1000);

    await resetSaveViaDebugBar(gamePage);
    await waitForFsmState(gamePage, 'OPENING_HOOK', 5000);
    await gamePage.waitForTimeout(1500);
    const introSnap = await readDebugSnapshot(gamePage);
    expect(introSnap?.currencies.sunGold).toBe(0);
    expect(introSnap?.meta.routeProgress).toBe(0);
    errorTracker.assertNoErrors();
  });
});
