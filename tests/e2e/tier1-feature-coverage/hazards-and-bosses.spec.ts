// ============================================================================
// File: tests/e2e/tier1-feature-coverage/hazards-and-bosses.spec.ts
// Milestone E1-B: Tier 1 Feature Coverage — Features 24..30 (36 Tests)
//   - F24: Basic Enemy Waves & Tactical Bar (TC-HAZ-01..05)
//   - F25: Quicksand Speed Penalty & Ignore (TC-HAZ-06..10)
//   - F26: Sandstorm & Solar Shield (TC-HAZ-11..15)
//   - F27: Ancient Solar Relay Tower (TC-HAZ-16..20)
//   - F28: Great Sandworm 3-Phase Boss (TC-BOSS-01..06)
//   - F29: 3 Boss Verification Encounters (TC-BOSS-07..11)
//   - F30: Emergency Revive & Defeat Retreat (TC-BOSS-12..16)
// Adheres strictly to Opaque-Box E2E rule (zero src/ or @/ imports).
// ============================================================================

import { Page } from '@playwright/test';
import { test, expect } from '../fixtures/appFixture';
import {
  SELECTORS,
  waitForCanvasReady,
  waitForSteadyState,
  readZoneAHud,
  readFsmState,
  waitForFsmState,
  sortieFromOasis,
  readDebugSnapshot,
  sampleRegionAverageColor,
  measureObservedRouteSpeedPxPerSec,
  setDebugSpeed,
  setDebugProgress,
  triggerDodgeBoost,
  triggerSolarShield,
  activateRelayTower,
  acceptEmergencyRevive,
  retreatFromRevive,
  switchTurret,
  waitForAndCloseAdModal,
  SandwalkerDebugSnapshot,
} from '../fixtures/testHelpers';
import {
  injectGameState,
  createAct1HubSeed,
  createAct2QuicksandSeed,
  createAct3SandstormSeed,
  createAct4RouteSeed,
  createBossSeedForAct,
  createCargoSeed,
  createAdTierSeed,
  createTurretLevelSeed,
} from '../fixtures/mockStorage';

const R_SKY_SAMPLE = { x0: 20, y0: 15, x1: 220, y1: 115 } as const;

async function driveToLethalSandstormRevive(page: Page, timeoutMs = 30000): Promise<void> {
  await setDebugSpeed(page, 4);
  await setDebugProgress(page, 40);
  await waitForFsmState(page, 'HAZARD_ZONE', 5000);

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const fsm = await readFsmState(page);
    if (fsm === 'EMERGENCY_REVIVE') {
      return;
    }
    const snap = await readDebugSnapshot(page);
    if (snap && snap.meta.routeProgress > 62 && snap.combat.fsmStateId === 'HAZARD_ZONE') {
      await setDebugProgress(page, 40);
    }
    await page.waitForTimeout(200);
  }
  await waitForFsmState(page, 'EMERGENCY_REVIVE', 5000);
}

// ============================================================================
// Feature 24: Basic Enemy Waves & Tactical Bar (TC-HAZ-01..05)
// ============================================================================
test.describe('Tier 1: Feature 24 — Basic Enemy Waves & Tactical Bar', () => {
  test('TC-HAZ-01: Wave spawner spawns all 3 canonical archetypes (DESERT_BANDIT, SCORPION, MIRAGE_SPIRIT) (F24)', async ({
    gamePage,
    errorTracker,
  }) => {
    await injectGameState(gamePage, createTurretLevelSeed('HEAT_RAY', 1, 1));
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await sortieFromOasis(gamePage);
    await setDebugSpeed(gamePage, 4);

    let sawBandit = false;
    let sawScorpion = false;
    let sawMirage = false;

    await expect
      .poll(
        async () => {
          const snap = await readDebugSnapshot(gamePage);
          if (!snap) return false;
          if (snap.meta.routeProgress > 34) {
            await setDebugProgress(gamePage, 5);
          }
          for (const enemy of snap.combat.enemies) {
            if (enemy.archetypeId === 'DESERT_BANDIT') {
              expect(enemy.maxHp).toBe(30);
              expect(enemy.tags).toContain('SMALL_SWARM');
              sawBandit = true;
            } else if (enemy.archetypeId === 'SCORPION') {
              expect(enemy.maxHp).toBe(120);
              expect(enemy.armor).toBeLessThanOrEqual(40);
              expect(enemy.tags).toContain('HEAVY_ARMOR');
              sawScorpion = true;
            } else if (enemy.archetypeId === 'MIRAGE_SPIRIT') {
              expect(enemy.maxHp).toBe(60);
              expect(enemy.tags).toContain('MIRAGE');
              expect(enemy.y).toBeLessThan(365);
              sawMirage = true;
            }
          }
          return sawBandit && sawScorpion && sawMirage;
        },
        { timeout: 20000, intervals: [150] }
      )
      .toBe(true);

    errorTracker.assertNoErrors();
  });

  test('TC-HAZ-02: Act 2 enemy HP scaling applies 1.45x multiplier across wave archetypes (F24)', async ({
    gamePage,
    errorTracker,
  }) => {
    const act2Seed = createAct1HubSeed();
    act2Seed.meta.currentAct = 2;
    await injectGameState(gamePage, act2Seed);
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await sortieFromOasis(gamePage);
    await setDebugSpeed(gamePage, 4);

    let verifiedScaled = false;
    await expect
      .poll(
        async () => {
          const snap = await readDebugSnapshot(gamePage);
          if (!snap || snap.combat.enemies.length === 0) return false;
          for (const enemy of snap.combat.enemies) {
            if (enemy.archetypeId === 'DESERT_BANDIT') {
              expect(enemy.maxHp).toBe(44);
              verifiedScaled = true;
            } else if (enemy.archetypeId === 'SCORPION') {
              expect(enemy.maxHp).toBe(174);
              verifiedScaled = true;
            } else if (enemy.archetypeId === 'MIRAGE_SPIRIT') {
              expect(enemy.maxHp).toBe(87);
              verifiedScaled = true;
            }
          }
          return verifiedScaled;
        },
        { timeout: 10000, intervals: [100] }
      )
      .toBe(true);

    errorTracker.assertNoErrors();
  });

  test('TC-HAZ-03: Tactical Dodge Boost grants 1.5s active state, 1.6x speed (192 px/s), invulnerability, and 8s cooldown (F24)', async ({
    gamePage,
    errorTracker,
  }) => {
    await injectGameState(gamePage, createAct1HubSeed({ legPartLevel: 1 }));
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await sortieFromOasis(gamePage);

    const dodgeBtn = gamePage.locator(SELECTORS.dodgeBoostBtn).first();
    await expect(dodgeBtn).toBeEnabled();

    const preHp = (await readDebugSnapshot(gamePage))!.sandwalker.currentHp;
    await triggerDodgeBoost(gamePage);

    await expect(dodgeBtn).toHaveAttribute('data-active', 'true');
    const activeSnap = await readDebugSnapshot(gamePage);
    expect(activeSnap?.combat.actualSpeed).toBe(192);
    const activeHud = await readZoneAHud(gamePage);
    if (activeHud.actualSpeedPx !== undefined) {
      expect(activeHud.actualSpeedPx).toBe(192);
    }

    // Invulnerability window while active
    await gamePage.waitForTimeout(800);
    const midSnap = await readDebugSnapshot(gamePage);
    expect(midSnap?.sandwalker.currentHp).toBeGreaterThanOrEqual(preHp);

    // Wait past 1.5s active duration for cooldown phase
    await expect(dodgeBtn).toHaveAttribute('data-active', 'false', { timeout: 3000 });
    await expect(dodgeBtn).toBeDisabled();
    const cooldownAttr = await dodgeBtn.getAttribute('data-cooldown');
    expect(cooldownAttr).not.toBeNull();
    const cdSec = parseFloat(cooldownAttr || '0');
    expect(cdSec).toBeGreaterThan(0);
    expect(cdSec).toBeLessThanOrEqual(8);

    errorTracker.assertNoErrors();
  });

  test('TC-HAZ-04: Tactical Solar Shield grants +20% maxHp (200) shield and triggers 12s cooldown (F24)', async ({
    gamePage,
    errorTracker,
  }) => {
    await injectGameState(gamePage, createAct1HubSeed());
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await sortieFromOasis(gamePage);

    const shieldBtn = gamePage.locator(SELECTORS.solarShieldBtn).first();
    await expect(shieldBtn).toBeEnabled();

    await triggerSolarShield(gamePage);

    const snap = await readDebugSnapshot(gamePage);
    expect(snap).not.toBeNull();
    expect(snap!.sandwalker.solarShieldHp).toBe(200);

    const hud = await readZoneAHud(gamePage);
    if (hud.solarShieldHp !== undefined) {
      expect(hud.solarShieldHp).toBe(200);
    }

    await expect(shieldBtn).toBeDisabled();
    const cdAttr = await shieldBtn.getAttribute('data-cooldown');
    expect(cdAttr).not.toBeNull();
    const cdSec = parseFloat(cdAttr || '0');
    expect(cdSec).toBeGreaterThan(8);
    expect(cdSec).toBeLessThanOrEqual(12);

    errorTracker.assertNoErrors();
  });

  test('TC-HAZ-05: Tactical Dodge and Solar Shield buttons are disabled in OASIS_HUB and EMERGENCY_REVIVE (F24)', async ({
    gamePage,
    errorTracker,
  }) => {
    await injectGameState(gamePage, createAct3SandstormSeed(0, { turretLevel: 1 }));
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await waitForFsmState(gamePage, 'OASIS_HUB', 5000);

    const dodgeBtn = gamePage.locator(SELECTORS.dodgeBoostBtn).first();
    const shieldBtn = gamePage.locator(SELECTORS.solarShieldBtn).first();
    await expect(dodgeBtn).toBeDisabled();
    await expect(shieldBtn).toBeDisabled();

    await sortieFromOasis(gamePage);
    await driveToLethalSandstormRevive(gamePage, 30000);
    await setDebugSpeed(gamePage, 1);

    await expect(gamePage.locator(SELECTORS.emergencyReviveModal).first()).toBeVisible();
    await expect(dodgeBtn).toBeDisabled();
    await expect(shieldBtn).toBeDisabled();

    errorTracker.assertNoErrors();
  });
});

// ============================================================================
// Feature 25: Quicksand Speed Penalty & Ignore (TC-HAZ-06..10)
// ============================================================================
test.describe('Tier 1: Feature 25 — Quicksand Speed Penalty & Ignore', () => {
  test('TC-HAZ-06: Act 1 Weakened Quicksand slows Lv1 walker by 20% to 96 px/s (F25)', async ({
    gamePage,
    errorTracker,
  }) => {
    await injectGameState(gamePage, createAct1HubSeed({ legPartLevel: 1 }));
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await sortieFromOasis(gamePage);
    await setDebugProgress(gamePage, 45);
    await waitForFsmState(gamePage, 'HAZARD_ZONE', 5000);

    const snap = await readDebugSnapshot(gamePage);
    expect(snap).not.toBeNull();
    expect(snap!.combat.actualSpeed).toBe(96);
    expect(snap!.combat.isQuicksandSlowed).toBe(true);
    expect(snap!.combat.isQuicksandBypassed).toBe(false);

    const hud = await readZoneAHud(gamePage);
    if (hud.actualSpeedPx !== undefined) {
      expect(hud.actualSpeedPx).toBe(96);
    }

    errorTracker.assertNoErrors();
  });

  test('TC-HAZ-07: Act 2 Standard Quicksand slows Lv1 walker by 40% to 72 px/s (F25)', async ({
    gamePage,
    errorTracker,
  }) => {
    await injectGameState(gamePage, createAct2QuicksandSeed(1));
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await sortieFromOasis(gamePage);
    await setDebugProgress(gamePage, 45);
    await waitForFsmState(gamePage, 'HAZARD_ZONE', 5000);

    const snap = await readDebugSnapshot(gamePage);
    expect(snap).not.toBeNull();
    expect(snap!.combat.actualSpeed).toBe(72);
    expect(snap!.combat.isQuicksandSlowed).toBe(true);
    expect(snap!.combat.isQuicksandBypassed).toBe(false);

    const observedSpeed = await measureObservedRouteSpeedPxPerSec(gamePage, 2000);
    expect(observedSpeed).toBeGreaterThanOrEqual(58);
    expect(observedSpeed).toBeLessThanOrEqual(86);

    errorTracker.assertNoErrors();
  });

  test('TC-HAZ-08: Leg Lv6 (R_ignore = 0.5) halves Act 2 Quicksand penalty to 96 px/s (F25)', async ({
    gamePage,
    errorTracker,
  }) => {
    await injectGameState(gamePage, createAct2QuicksandSeed(6));
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await sortieFromOasis(gamePage);
    await setDebugProgress(gamePage, 45);
    await waitForFsmState(gamePage, 'HAZARD_ZONE', 5000);

    const snap = await readDebugSnapshot(gamePage);
    expect(snap).not.toBeNull();
    expect(snap!.combat.actualSpeed).toBe(96);
    expect(snap!.combat.isQuicksandSlowed).toBe(true);
    expect(snap!.combat.isQuicksandBypassed).toBe(false);

    errorTracker.assertNoErrors();
  });

  test('TC-HAZ-09: Leg Lv11+ (R_ignore = 1.0) completely ignores Quicksand at 120 px/s (F25)', async ({
    gamePage,
    errorTracker,
  }) => {
    await injectGameState(gamePage, createAct2QuicksandSeed(11));
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await sortieFromOasis(gamePage);
    await setDebugProgress(gamePage, 45);
    await waitForFsmState(gamePage, 'HAZARD_ZONE', 5000);

    const snap = await readDebugSnapshot(gamePage);
    expect(snap).not.toBeNull();
    expect(snap!.combat.actualSpeed).toBe(120);
    expect(snap!.combat.isQuicksandSlowed).toBe(false);
    expect(snap!.combat.isQuicksandBypassed).toBe(true);

    const observedSpeed = await measureObservedRouteSpeedPxPerSec(gamePage, 2000);
    expect(observedSpeed).toBeGreaterThanOrEqual(105);
    expect(observedSpeed).toBeLessThanOrEqual(135);

    errorTracker.assertNoErrors();
  });

  test('TC-HAZ-10: Act 4 even oasisIndex (2) resolves to Quicksand hazard at Lv1 legs (F25)', async ({
    gamePage,
    errorTracker,
  }) => {
    await injectGameState(gamePage, createAct4RouteSeed(2, 1));
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await sortieFromOasis(gamePage);
    await setDebugProgress(gamePage, 45);
    await waitForFsmState(gamePage, 'HAZARD_ZONE', 5000);

    const snap = await readDebugSnapshot(gamePage);
    expect(snap).not.toBeNull();
    expect(snap!.combat.isQuicksandSlowed).toBe(true);
    expect(snap!.combat.isSandstorm).toBe(false);
    expect(snap!.combat.actualSpeed).toBe(72);

    errorTracker.assertNoErrors();
  });
});

// ============================================================================
// Feature 26: Sandstorm & Solar Shield (TC-HAZ-11..15)
// ============================================================================
test.describe('Tier 1: Feature 26 — Sandstorm & Solar Shield', () => {
  test('TC-HAZ-11: Act 3 Sandstorm triggers STORM palette and deals 1.5%/s DoT to Sandwalker HP (F26)', async ({
    gamePage,
    errorTracker,
  }) => {
    await injectGameState(gamePage, createAct3SandstormSeed(0, { turretLevel: 20 }));
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await sortieFromOasis(gamePage);
    await setDebugProgress(gamePage, 45);
    await waitForFsmState(gamePage, 'HAZARD_ZONE', 5000);

    const startSnap = await readDebugSnapshot(gamePage);
    expect(startSnap).not.toBeNull();
    expect(startSnap!.meta.timeOfDay).toBe('STORM');
    expect(startSnap!.combat.isSandstorm).toBe(true);
    const startHp = startSnap!.sandwalker.currentHp;

    await gamePage.waitForTimeout(2100);
    const endSnap = await readDebugSnapshot(gamePage);
    expect(endSnap!.sandwalker.currentHp).toBeLessThanOrEqual(startHp - 28);

    errorTracker.assertNoErrors();
  });

  test('TC-HAZ-12: Sandstorm with zero Solar Shield activates dark vision mask and darkens canvas sky (F26)', async ({
    gamePage,
    errorTracker,
  }) => {
    // Baseline DAY sky sample
    await injectGameState(gamePage, createAct1HubSeed());
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await waitForSteadyState(gamePage, 400);
    const daySky = await sampleRegionAverageColor(
      gamePage,
      R_SKY_SAMPLE.x0,
      R_SKY_SAMPLE.y0,
      R_SKY_SAMPLE.x1,
      R_SKY_SAMPLE.y1
    );

    // Act 3 Sandstorm sample
    await injectGameState(gamePage, createAct3SandstormSeed(0));
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await sortieFromOasis(gamePage);
    await setDebugProgress(gamePage, 45);
    await waitForFsmState(gamePage, 'HAZARD_ZONE', 5000);
    await gamePage.waitForTimeout(2200);

    const stormSnap = await readDebugSnapshot(gamePage);
    expect(stormSnap).not.toBeNull();
    expect(stormSnap!.combat.isSandstormVisionMasked).toBe(true);

    const stormSky = await sampleRegionAverageColor(
      gamePage,
      R_SKY_SAMPLE.x0,
      R_SKY_SAMPLE.y0,
      R_SKY_SAMPLE.x1,
      R_SKY_SAMPLE.y1
    );
    expect(stormSky.r + stormSky.g + stormSky.b).toBeLessThan(daySky.r + daySky.g + daySky.b);

    errorTracker.assertNoErrors();
  });

  test('TC-HAZ-13: Tactical Solar Shield absorbs Sandstorm DoT first and clears vision mask (F26)', async ({
    gamePage,
    errorTracker,
  }) => {
    await injectGameState(gamePage, createAct3SandstormSeed(0, { turretLevel: 20 }));
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await sortieFromOasis(gamePage);
    await setDebugProgress(gamePage, 45);
    await waitForFsmState(gamePage, 'HAZARD_ZONE', 5000);

    await triggerSolarShield(gamePage);
    const afterShield = await readDebugSnapshot(gamePage);
    expect(afterShield).not.toBeNull();
    expect(afterShield!.sandwalker.solarShieldHp).toBeGreaterThan(150);
    expect(afterShield!.combat.isSandstormVisionMasked).toBe(false);

    const protectedHp = afterShield!.sandwalker.currentHp;
    const initialShield = afterShield!.sandwalker.solarShieldHp;

    await gamePage.waitForTimeout(2000);
    const laterSnap = await readDebugSnapshot(gamePage);
    expect(laterSnap!.sandwalker.solarShieldHp).toBeLessThan(initialShield);
    expect(laterSnap!.sandwalker.currentHp).toBe(protectedHp);

    errorTracker.assertNoErrors();
  });

  test('TC-HAZ-14: Act 4 odd oasisIndex (1) resolves to Sandstorm with Solar Relay Tower available (F26)', async ({
    gamePage,
    errorTracker,
  }) => {
    await injectGameState(gamePage, createAct4RouteSeed(1, 1));
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await sortieFromOasis(gamePage);
    await setDebugProgress(gamePage, 45);
    await waitForFsmState(gamePage, 'HAZARD_ZONE', 5000);

    const snap = await readDebugSnapshot(gamePage);
    expect(snap).not.toBeNull();
    expect(snap!.combat.isSandstorm).toBe(true);
    expect(snap!.combat.isQuicksandSlowed).toBe(false);
    expect(snap!.combat.relayTowerVisible).toBe(true);

    errorTracker.assertNoErrors();
  });

  test('TC-HAZ-15: Lethal Sandstorm DoT before 70% triggers EMERGENCY_REVIVE instead of MARCH_NORMAL (F26)', async ({
    gamePage,
    errorTracker,
  }) => {
    await injectGameState(gamePage, createAct3SandstormSeed(0, { turretLevel: 1 }));
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await sortieFromOasis(gamePage);

    await driveToLethalSandstormRevive(gamePage, 30000);
    await setDebugSpeed(gamePage, 1);

    expect(await readFsmState(gamePage)).toBe('EMERGENCY_REVIVE');
    await expect(gamePage.locator(SELECTORS.emergencyReviveModal).first()).toBeVisible();

    errorTracker.assertNoErrors();
  });
});

// ============================================================================
// Feature 27: Ancient Solar Relay Tower (TC-HAZ-16..20)
// ============================================================================
test.describe('Tier 1: Feature 27 — Ancient Solar Relay Tower', () => {
  test('TC-HAZ-16: Relay Tower banner is visible ONLY in Sandstorm HAZARD_ZONE (hidden in MARCH_NORMAL & Quicksand) (F27)', async ({
    gamePage,
    errorTracker,
  }) => {
    // Act 2 Quicksand check
    await injectGameState(gamePage, createAct2QuicksandSeed(1));
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await sortieFromOasis(gamePage);
    const banner = gamePage.locator(SELECTORS.relayTowerBanner).first();
    await expect(banner).toBeHidden();

    await setDebugProgress(gamePage, 45);
    await waitForFsmState(gamePage, 'HAZARD_ZONE', 5000);
    await expect(banner).toBeHidden();
    expect((await readDebugSnapshot(gamePage))?.combat.relayTowerVisible).toBe(false);

    // Act 3 Sandstorm check
    await injectGameState(gamePage, createAct3SandstormSeed(0));
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await sortieFromOasis(gamePage);
    await expect(banner).toBeHidden();

    await setDebugProgress(gamePage, 45);
    await waitForFsmState(gamePage, 'HAZARD_ZONE', 5000);
    await expect(banner).toBeVisible();
    expect((await readDebugSnapshot(gamePage))?.combat.relayTowerVisible).toBe(true);

    errorTracker.assertNoErrors();
  });

  test('TC-HAZ-17: Activating Relay Tower grants +50% maxHp shield (500), +30% progress, and exits to MARCH_NORMAL (F27)', async ({
    gamePage,
    errorTracker,
  }) => {
    await injectGameState(gamePage, createAct3SandstormSeed(0, { adTier: 3 }));
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await sortieFromOasis(gamePage);

    await setDebugProgress(gamePage, 42);
    await waitForFsmState(gamePage, 'HAZARD_ZONE', 5000);

    await activateRelayTower(gamePage, { timeoutMs: 8000 });
    await waitForFsmState(gamePage, 'MARCH_NORMAL', 5000);

    const snap = await readDebugSnapshot(gamePage);
    expect(snap).not.toBeNull();
    expect(snap!.sandwalker.solarShieldHp).toBeGreaterThanOrEqual(480);
    expect(snap!.sandwalker.solarShieldHp).toBeLessThanOrEqual(500);
    expect(snap!.meta.routeProgress).toBeGreaterThanOrEqual(72);
    expect(snap!.meta.hazardConsumed).toBe(true);

    errorTracker.assertNoErrors();
  });

  test('TC-HAZ-18: Relay Tower +50% maxHp shield is strictly capped at maxHp (1000) (F27)', async ({
    gamePage,
    errorTracker,
  }) => {
    await injectGameState(gamePage, createAct3SandstormSeed(0, { adTier: 3, turretLevel: 20 }));
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await sortieFromOasis(gamePage);

    // Accumulate 600 shield in MARCH_NORMAL before entering Sandstorm so +500 tests maxHp (1000) cap
    await setDebugSpeed(gamePage, 4);
    for (let i = 0; i < 3; i++) {
      await triggerSolarShield(gamePage);
      if (i < 2) {
        await expect(gamePage.locator(SELECTORS.solarShieldBtn).first()).toBeEnabled({ timeout: 6000 });
      }
    }
    await setDebugSpeed(gamePage, 1);

    await setDebugProgress(gamePage, 45);
    await waitForFsmState(gamePage, 'HAZARD_ZONE', 5000);

    await activateRelayTower(gamePage, { timeoutMs: 8000 });
    await waitForFsmState(gamePage, 'MARCH_NORMAL', 5000);

    const snap = await readDebugSnapshot(gamePage);
    expect(snap).not.toBeNull();
    expect(snap!.sandwalker.solarShieldHp).toBeGreaterThan(650);
    expect(snap!.sandwalker.solarShieldHp).toBeLessThanOrEqual(snap!.sandwalker.maxHp);
    expect(snap!.meta.routeProgress).toBeGreaterThanOrEqual(75);
    await expect(gamePage.locator(SELECTORS.relayTowerBanner).first()).toBeHidden();

    errorTracker.assertNoErrors();
  });

  test('TC-HAZ-19: Relay Tower activation is single-use and idempotent per route (F27)', async ({
    gamePage,
    errorTracker,
  }) => {
    await injectGameState(gamePage, createAct3SandstormSeed(0, { adTier: 3 }));
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await sortieFromOasis(gamePage);

    await setDebugProgress(gamePage, 45);
    await waitForFsmState(gamePage, 'HAZARD_ZONE', 5000);

    await activateRelayTower(gamePage, { timeoutMs: 8000 });
    await waitForFsmState(gamePage, 'MARCH_NORMAL', 5000);

    const banner = gamePage.locator(SELECTORS.relayTowerBanner).first();
    await expect(banner).toBeHidden();

    // Even if progress is moved back into 50%, hazardConsumed prevents re-entering or re-showing relay
    await setDebugProgress(gamePage, 50);
    await gamePage.waitForTimeout(300);

    const snap = await readDebugSnapshot(gamePage);
    expect(snap!.meta.hazardConsumed).toBe(true);
    expect(snap!.combat.relayTowerVisible).toBe(false);
    expect(await readFsmState(gamePage)).toBe('MARCH_NORMAL');
    await expect(banner).toBeHidden();

    errorTracker.assertNoErrors();
  });

  test('TC-HAZ-20: Tier 0 3s Rewarded Ad modal guards Relay shield and progress until ad-sim-close-btn is clicked (F27)', async ({
    gamePage,
    errorTracker,
  }) => {
    await injectGameState(gamePage, createAct3SandstormSeed(0, { adTier: 0 }));
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await sortieFromOasis(gamePage);

    await setDebugProgress(gamePage, 45);
    await waitForFsmState(gamePage, 'HAZARD_ZONE', 5000);

    const relayBtn = gamePage.locator(SELECTORS.relayActivateBtn).first();
    await relayBtn.waitFor({ state: 'visible', timeout: 5000 });
    await relayBtn.click();

    const adModal = gamePage.locator(SELECTORS.adSimModal).first();
    await adModal.waitFor({ state: 'visible', timeout: 5000 });

    // Before closing ad, shield must remain 0 and progress < 70
    const duringAdSnap = await readDebugSnapshot(gamePage);
    expect(duringAdSnap!.sandwalker.solarShieldHp).toBe(0);
    expect(duringAdSnap!.meta.routeProgress).toBeLessThan(70);
    expect(await readFsmState(gamePage)).toBe('HAZARD_ZONE');

    const closeBtn = gamePage.locator(SELECTORS.adSimCloseBtn).first();
    await expect(closeBtn).toBeEnabled({ timeout: 6000 });
    await closeBtn.click();
    await adModal.waitFor({ state: 'hidden', timeout: 5000 });

    await waitForFsmState(gamePage, 'MARCH_NORMAL', 5000);
    const postAdSnap = await readDebugSnapshot(gamePage);
    expect(postAdSnap!.sandwalker.solarShieldHp).toBeGreaterThanOrEqual(480);
    expect(postAdSnap!.meta.routeProgress).toBeGreaterThanOrEqual(75);
    expect(postAdSnap!.meta.hazardConsumed).toBe(true);

    errorTracker.assertNoErrors();
  });
});

// ============================================================================
// Feature 28: Great Sandworm 3-Phase Boss (TC-BOSS-01..06)
// ============================================================================
test.describe('Tier 1: Feature 28 — Great Sandworm 3-Phase Boss', () => {
  test('TC-BOSS-01: Act 4 95% spawns GREAT_SANDWORM (7000 maxHp, Phase 1/3, 2000 armor) and displays Boss HUD (F28)', async ({
    gamePage,
    errorTracker,
  }) => {
    await injectGameState(gamePage, createBossSeedForAct(4));
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await sortieFromOasis(gamePage);

    await setDebugProgress(gamePage, 95);
    await waitForFsmState(gamePage, 'BOSS_ENCOUNTER', 5000);

    await expect(gamePage.locator(SELECTORS.bossHud).first()).toBeVisible();
    await expect(gamePage.locator(SELECTORS.bossName).first()).toContainText('샌드웜');
    await expect(gamePage.locator(SELECTORS.bossPhaseBadge).first()).toContainText('1/3');

    const snap = await readDebugSnapshot(gamePage);
    expect(snap?.combat.boss).not.toBeNull();
    expect(snap!.combat.boss!.id).toBe('GREAT_SANDWORM');
    expect(snap!.combat.boss!.phase).toBe(1);
    expect(snap!.combat.boss!.maxHp).toBe(7000);
    expect(snap!.combat.boss!.hp).toBe(7000);
    expect(snap!.combat.boss!.armor).toBe(2000);

    errorTracker.assertNoErrors();
  });

  test('TC-BOSS-02: Sandworm P1 WORM_LUNGE triggers 1.5s telegraph warning and is negated by Dodge Boost (F28)', async ({
    gamePage,
    errorTracker,
  }) => {
    await injectGameState(gamePage, createBossSeedForAct(4, { turretLevel: 1 }));
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await sortieFromOasis(gamePage);

    await setDebugProgress(gamePage, 95);
    await waitForFsmState(gamePage, 'BOSS_ENCOUNTER', 5000);

    const telegraphWarn = gamePage.locator(SELECTORS.bossTelegraphWarning).first();
    await telegraphWarn.waitFor({ state: 'visible', timeout: 12000 });

    const preDodgeSnap = await readDebugSnapshot(gamePage);
    expect(preDodgeSnap?.combat.boss?.telegraphActive).toBe(true);
    const hpBeforeLunge = preDodgeSnap!.sandwalker.currentHp;

    await triggerDodgeBoost(gamePage);
    await gamePage.waitForTimeout(1600);

    const postLungeSnap = await readDebugSnapshot(gamePage);
    expect(postLungeSnap!.sandwalker.currentHp).toBe(hpBeforeLunge);

    errorTracker.assertNoErrors();
  });

  test('TC-BOSS-03: Breaking Sandworm P1 2000 armor triggers Groggy, awards +5 Gear/+1 Key, and enters Phase 2 (F28)', async ({
    gamePage,
    errorTracker,
  }) => {
    await injectGameState(gamePage, createBossSeedForAct(4, { turretLevel: 30, turretTier: 3 }));
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await sortieFromOasis(gamePage);
    await switchTurret(gamePage, 'HARPOON');

    const startSnap = await readDebugSnapshot(gamePage);
    const initialGears = startSnap!.currencies.ancientGear;
    const initialKeys = startSnap!.currencies.templeKeys;

    await setDebugProgress(gamePage, 95);
    await waitForFsmState(gamePage, 'BOSS_ENCOUNTER', 5000);
    await setDebugSpeed(gamePage, 4);

    let sawGroggy = false;
    await expect
      .poll(
        async () => {
          const snap = await readDebugSnapshot(gamePage);
          if (snap?.combat.boss?.isGroggy) {
            sawGroggy = true;
          }
          return snap?.combat.boss?.phase ?? 1;
        },
        { timeout: 20000, intervals: [60] }
      )
      .toBe(2);

    expect(sawGroggy).toBe(true);
    await expect(gamePage.locator(SELECTORS.bossPhaseBadge).first()).toContainText('2/3');

    const p2Snap = await readDebugSnapshot(gamePage);
    expect(p2Snap!.currencies.ancientGear).toBeGreaterThanOrEqual(initialGears + 5);
    expect(p2Snap!.currencies.templeKeys).toBeGreaterThanOrEqual(initialKeys + 1);
    expect(p2Snap!.combat.boss!.hp).toBeLessThanOrEqual(5000);

    errorTracker.assertNoErrors();
  });

  test('TC-BOSS-04: Sandworm P2 EXPOSED_CORE (HEAT_RAY 1.8x) transitions cleanly to Phase 3 (F28)', async ({
    gamePage,
    errorTracker,
  }) => {
    await injectGameState(gamePage, createBossSeedForAct(4, { turretLevel: 30, turretTier: 3 }));
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await sortieFromOasis(gamePage);
    await switchTurret(gamePage, 'HARPOON');

    await setDebugProgress(gamePage, 95);
    await waitForFsmState(gamePage, 'BOSS_ENCOUNTER', 5000);
    await setDebugSpeed(gamePage, 4);

    await expect
      .poll(
        async () => (await readDebugSnapshot(gamePage))?.combat.boss?.phase ?? 1,
        { timeout: 20000, intervals: [60] }
      )
      .toBe(2);

    await switchTurret(gamePage, 'HEAT_RAY');

    let sawExposedCoreAffinity = false;
    await expect
      .poll(
        async () => {
          const snap = await readDebugSnapshot(gamePage);
          const events = snap?.combat.recentDamageEvents ?? [];
          if (
            events.some(
              (ev) =>
                ev.turret === 'HEAT_RAY' &&
                ev.tags.includes('EXPOSED_CORE') &&
                Math.abs(ev.multiplier - 1.8) < 0.01
            )
          ) {
            sawExposedCoreAffinity = true;
          }
          return snap?.combat.boss?.phase ?? 2;
        },
        { timeout: 20000, intervals: [50] }
      )
      .toBe(3);

    expect(sawExposedCoreAffinity).toBe(true);
    await expect(gamePage.locator(SELECTORS.bossPhaseBadge).first()).toContainText('3/3');
    const p3Snap = await readDebugSnapshot(gamePage);
    expect(p3Snap!.combat.boss!.hp).toBeLessThanOrEqual(2000);

    errorTracker.assertNoErrors();
  });

  test('TC-BOSS-05: Sandworm P3 spawns waves of PARASITE and SMALL_SWARM adds (F28)', async ({
    gamePage,
    errorTracker,
  }) => {
    await injectGameState(gamePage, createBossSeedForAct(4, { turretLevel: 18, turretTier: 2 }));
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await sortieFromOasis(gamePage);
    await switchTurret(gamePage, 'HARPOON');

    await setDebugProgress(gamePage, 95);
    await waitForFsmState(gamePage, 'BOSS_ENCOUNTER', 5000);
    await setDebugSpeed(gamePage, 4);

    await expect
      .poll(
        async () => (await readDebugSnapshot(gamePage))?.combat.boss?.phase ?? 1,
        { timeout: 25000, intervals: [80] }
      )
      .toBe(2);

    await switchTurret(gamePage, 'HEAT_RAY');

    await expect
      .poll(
        async () => (await readDebugSnapshot(gamePage))?.combat.boss?.phase ?? 2,
        { timeout: 25000, intervals: [80] }
      )
      .toBe(3);

    await setDebugSpeed(gamePage, 1);

    let sawParasite = false;
    let sawSmallSwarm = false;
    await expect
      .poll(
        async () => {
          const snap = await readDebugSnapshot(gamePage);
          const waves = snap?.combat.boss?.wavesSpawned ?? 0;
          for (const enemy of snap?.combat.enemies ?? []) {
            if (enemy.tags.includes('PARASITE')) sawParasite = true;
            if (enemy.tags.includes('SMALL_SWARM')) sawSmallSwarm = true;
          }
          return waves >= 1 && sawParasite && sawSmallSwarm;
        },
        { timeout: 10000, intervals: [50] }
      )
      .toBe(true);

    errorTracker.assertNoErrors();
  });

  test('TC-BOSS-06: Defeating Sandworm P3 awards clear rewards and transitions to OASIS_SETTLEMENT (F28)', async ({
    gamePage,
    errorTracker,
  }) => {
    await injectGameState(
      gamePage,
      createBossSeedForAct(4, { turretLevel: 30, turretTier: 3, adTier: 3 })
    );
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);

    const initSnap = await readDebugSnapshot(gamePage);
    const startGear = initSnap!.currencies.ancientGear;
    const startFragments = initSnap!.currencies.mapFragments;
    const startKeys = initSnap!.currencies.templeKeys;

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

    await expect(gamePage.locator(SELECTORS.settlementModal).first()).toBeVisible();
    const endSnap = await readDebugSnapshot(gamePage);
    expect(endSnap!.currencies.ancientGear).toBeGreaterThanOrEqual(startGear + 15);
    expect(endSnap!.currencies.mapFragments).toBe(startFragments + 1);
    expect(endSnap!.currencies.templeKeys).toBeGreaterThanOrEqual(startKeys + 2);

    errorTracker.assertNoErrors();
  });
});

// ============================================================================
// Feature 29: 3 Boss Verification Encounters (TC-BOSS-07..11)
// ============================================================================
test.describe('Tier 1: Feature 29 — 3 Boss Verification Encounters', () => {
  test('TC-BOSS-07: Act 1 VARKA_ARMORED_CAR clear unlocks tarik and lili with +5 Gear and +1 Map Fragment (F29)', async ({
    gamePage,
    errorTracker,
  }) => {
    await injectGameState(
      gamePage,
      createBossSeedForAct(1, { turretLevel: 25, turretTier: 3, adTier: 3 })
    );
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);

    const startSnap = await readDebugSnapshot(gamePage);
    const startGear = startSnap!.currencies.ancientGear;
    const startFragments = startSnap!.currencies.mapFragments;

    await sortieFromOasis(gamePage);
    await switchTurret(gamePage, 'HARPOON');
    await setDebugProgress(gamePage, 95);
    await waitForFsmState(gamePage, 'BOSS_ENCOUNTER', 5000);

    const bossSnap = await readDebugSnapshot(gamePage);
    expect(bossSnap?.combat.boss?.id).toBe('VARKA_ARMORED_CAR');
    expect(bossSnap?.combat.boss?.maxHp).toBe(2000);
    await expect(gamePage.locator(SELECTORS.bossArmorBar).first()).toBeVisible();

    await setDebugSpeed(gamePage, 4);
    await waitForFsmState(gamePage, 'OASIS_SETTLEMENT', 20000);
    await expect(gamePage.locator(SELECTORS.settlementModal).first()).toBeVisible();

    const endSnap = await readDebugSnapshot(gamePage);
    expect(endSnap!.currencies.ancientGear).toBeGreaterThanOrEqual(startGear + 5);
    expect(endSnap!.currencies.mapFragments).toBe(startFragments + 1);
    expect(endSnap!.mercenaries.find((m) => m.id === 'tarik')?.isUnlocked).toBe(true);
    expect(endSnap!.mercenaries.find((m) => m.id === 'lili')?.isUnlocked).toBe(true);

    errorTracker.assertNoErrors();
  });

  test('TC-BOSS-08: Act 2 SCORPION_REX triggers 1.5s Groggy and awards +3 Gear/+1 Key on armor break (F29)', async ({
    gamePage,
    errorTracker,
  }) => {
    await injectGameState(
      gamePage,
      createBossSeedForAct(2, { turretLevel: 25, turretTier: 3, adTier: 3 })
    );
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);

    const startSnap = await readDebugSnapshot(gamePage);
    const startGear = startSnap!.currencies.ancientGear;
    const startKeys = startSnap!.currencies.templeKeys;

    await sortieFromOasis(gamePage);
    await switchTurret(gamePage, 'HARPOON');
    await setDebugProgress(gamePage, 95);
    await waitForFsmState(gamePage, 'BOSS_ENCOUNTER', 5000);

    let sawGroggy = false;
    let partBreakSnap: SandwalkerDebugSnapshot | null = null;
    await expect
      .poll(
        async () => {
          const snap = await readDebugSnapshot(gamePage);
          if (snap?.combat.boss?.id === 'SCORPION_REX' && snap.combat.boss.isGroggy) {
            sawGroggy = true;
            partBreakSnap = snap;
          }
          return sawGroggy;
        },
        { timeout: 15000, intervals: [50] }
      )
      .toBe(true);

    await expect(gamePage.locator(SELECTORS.bossGroggyBadge).first()).toBeVisible();
    expect(partBreakSnap!.currencies.ancientGear).toBeGreaterThanOrEqual(startGear + 3);
    expect(partBreakSnap!.currencies.templeKeys).toBeGreaterThanOrEqual(startKeys + 1);

    errorTracker.assertNoErrors();
  });

  test('TC-BOSS-09: Act 3 MIRAGE_SPIRIT_KING has zero armor and spawns <= 3 MIRAGE_CLONEs (F29)', async ({
    gamePage,
    errorTracker,
  }) => {
    await injectGameState(
      gamePage,
      createBossSeedForAct(3, { turretLevel: 15, turretTier: 2, adTier: 3 })
    );
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await sortieFromOasis(gamePage);
    await switchTurret(gamePage, 'HEAT_RAY');

    await setDebugProgress(gamePage, 95);
    await waitForFsmState(gamePage, 'BOSS_ENCOUNTER', 5000);

    const bossSnap = await readDebugSnapshot(gamePage);
    expect(bossSnap?.combat.boss?.id).toBe('MIRAGE_SPIRIT_KING');
    expect(bossSnap?.combat.boss?.maxHp).toBe(3500);
    expect(bossSnap?.combat.boss?.armor).toBe(0);
    await expect(gamePage.locator(SELECTORS.bossArmorBar).first()).toBeHidden();

    await expect
      .poll(
        async () => {
          const snap = await readDebugSnapshot(gamePage);
          const clones = (snap?.combat.enemies ?? []).filter((e) =>
            e.id.startsWith('boss_add_') && e.tags.includes('MIRAGE')
          );
          expect(clones.length).toBeLessThanOrEqual(3);
          return clones.length;
        },
        { timeout: 12000, intervals: [150] }
      )
      .toBeGreaterThanOrEqual(1);

    errorTracker.assertNoErrors();
  });

  test('TC-BOSS-10: Entering BOSS_ENCOUNTER retreats existing regular wave enemies (F29)', async ({
    gamePage,
    errorTracker,
  }) => {
    await injectGameState(gamePage, createBossSeedForAct(1, { turretLevel: 1 }));
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await sortieFromOasis(gamePage);

    await expect
      .poll(
        async () => (await readDebugSnapshot(gamePage))?.combat.enemyCount ?? 0,
        { timeout: 6000 }
      )
      .toBeGreaterThanOrEqual(1);

    await setDebugProgress(gamePage, 95);
    await waitForFsmState(gamePage, 'BOSS_ENCOUNTER', 5000);

    const snap = await readDebugSnapshot(gamePage);
    const nonBossEnemies = (snap?.combat.enemies ?? []).filter(
      (e) => !e.id.startsWith('boss_')
    );
    expect(nonBossEnemies.length).toBe(0);

    errorTracker.assertNoErrors();
  });

  test('TC-BOSS-11: Boss HUD HP and Armor bars decrease monotonically and hide on OASIS_SETTLEMENT (F29)', async ({
    gamePage,
    errorTracker,
  }) => {
    await injectGameState(
      gamePage,
      createBossSeedForAct(1, { turretLevel: 20, turretTier: 2, adTier: 3 })
    );
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await sortieFromOasis(gamePage);
    await switchTurret(gamePage, 'HARPOON');

    await setDebugProgress(gamePage, 95);
    await waitForFsmState(gamePage, 'BOSS_ENCOUNTER', 5000);

    const bossHud = gamePage.locator(SELECTORS.bossHud).first();
    const hpBar = gamePage.locator(SELECTORS.bossHpBar).first();
    const armorBar = gamePage.locator(SELECTORS.bossArmorBar).first();

    await expect(bossHud).toBeVisible();
    const initialHpNow = parseFloat((await hpBar.getAttribute('aria-valuenow')) || '0');
    const initialArmorNow = parseFloat((await armorBar.getAttribute('aria-valuenow')) || '0');

    await setDebugSpeed(gamePage, 4);
    await expect
      .poll(
        async () => {
          const hpNow = parseFloat((await hpBar.getAttribute('aria-valuenow')) || '0');
          const armorNow = parseFloat((await armorBar.getAttribute('aria-valuenow')) || '0');
          return hpNow < initialHpNow && armorNow < initialArmorNow;
        },
        { timeout: 10000, intervals: [100] }
      )
      .toBe(true);

    await waitForFsmState(gamePage, 'OASIS_SETTLEMENT', 20000);
    await expect(bossHud).toBeHidden();

    errorTracker.assertNoErrors();
  });
});

// ============================================================================
// Feature 30: Emergency Revive & Defeat Retreat (TC-BOSS-12..16)
// ============================================================================
test.describe('Tier 1: Feature 30 — Emergency Revive & Defeat Retreat', () => {
  test('TC-BOSS-12: Lethal boss damage opens emergency-revive-modal and pauses combat simulation (F30)', async ({
    gamePage,
    errorTracker,
  }) => {
    await injectGameState(gamePage, createBossSeedForAct(4, { turretLevel: 1 }));
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await sortieFromOasis(gamePage);
    await setDebugProgress(gamePage, 95);
    await waitForFsmState(gamePage, 'BOSS_ENCOUNTER', 5000);

    await setDebugSpeed(gamePage, 4);
    await waitForFsmState(gamePage, 'EMERGENCY_REVIVE', 25000);
    await setDebugSpeed(gamePage, 1);

    await expect(gamePage.locator(SELECTORS.emergencyReviveModal).first()).toBeVisible();

    const snap1 = await readDebugSnapshot(gamePage);
    expect(snap1?.combat.actualSpeed).toBe(0);
    const bossHp1 = snap1?.combat.boss?.hp ?? -1;

    await gamePage.waitForTimeout(800);
    const snap2 = await readDebugSnapshot(gamePage);
    expect(snap2?.combat.boss?.hp ?? -1).toBe(bossHp1);

    errorTracker.assertNoErrors();
  });

  test('TC-BOSS-13: Accepting Revive restores 50% HP and resumes BOSS_ENCOUNTER preserving boss HP and phase (F30)', async ({
    gamePage,
    errorTracker,
  }) => {
    await injectGameState(
      gamePage,
      createBossSeedForAct(4, { turretLevel: 1, adTier: 0 })
    );
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await sortieFromOasis(gamePage);
    await switchTurret(gamePage, 'HARPOON');
    await setDebugProgress(gamePage, 95);
    await waitForFsmState(gamePage, 'BOSS_ENCOUNTER', 5000);

    await setDebugSpeed(gamePage, 4);
    await waitForFsmState(gamePage, 'EMERGENCY_REVIVE', 25000);
    await setDebugSpeed(gamePage, 1);

    const reviveSnap = await readDebugSnapshot(gamePage);
    const preservedBossHp = reviveSnap?.combat.boss?.hp ?? 7000;
    const preservedBossPhase = reviveSnap?.combat.boss?.phase ?? 1;
    expect(preservedBossHp).toBeLessThan(7000);

    await acceptEmergencyRevive(gamePage, {
      expectedResumeState: 'BOSS_ENCOUNTER',
      timeoutMs: 12000,
      requireAdModal: true,
    });

    const resumedSnap = await readDebugSnapshot(gamePage);
    expect(resumedSnap?.sandwalker.currentHp).toBeGreaterThanOrEqual(450);
    expect(resumedSnap?.sandwalker.currentHp).toBeLessThanOrEqual(500);
    expect(resumedSnap?.combat.boss?.phase).toBe(preservedBossPhase);
    expect(resumedSnap?.combat.boss?.hp).toBeLessThanOrEqual(preservedBossHp);

    errorTracker.assertNoErrors();
  });

  test('TC-BOSS-14: Defeat Retreat halves cargo, keeps gold/gears, repairs HP, and resets routeProgress to 0 (F30)', async ({
    gamePage,
    errorTracker,
  }) => {
    const seed = createCargoSeed(15, 3, 3);
    seed.currencies.sunGold = 500;
    seed.currencies.ancientGear = 12;
    seed.sandwalker.currentHp = 15;
    seed.sandwalker.turretLevels = { HEAT_RAY: 1, HARPOON: 1, MORTAR: 1 };
    seed.mercenaries = seed.mercenaries.map((m) => ({ ...m, isUnlocked: false }));
    await injectGameState(gamePage, seed);
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await sortieFromOasis(gamePage);

    await driveToLethalSandstormRevive(gamePage, 30000);
    await setDebugSpeed(gamePage, 1);

    const reviveSnap = await readDebugSnapshot(gamePage);
    expect(reviveSnap).not.toBeNull();
    const goldBeforeRetreat = reviveSnap!.currencies.sunGold;
    const gearBeforeRetreat = reviveSnap!.currencies.ancientGear;
    expect(goldBeforeRetreat).toBeGreaterThanOrEqual(500);
    expect(gearBeforeRetreat).toBeGreaterThanOrEqual(12);

    await retreatFromRevive(gamePage, 10000);

    const hubSnap = await readDebugSnapshot(gamePage);
    expect(hubSnap).not.toBeNull();
    expect(hubSnap!.combat.fsmStateId).toBe('OASIS_HUB');
    expect(hubSnap!.trade?.cargo[0]?.qty).toBe(7); // floor(15 * 0.5)
    expect(hubSnap!.currencies.sunGold).toBe(goldBeforeRetreat);
    expect(hubSnap!.currencies.ancientGear).toBe(gearBeforeRetreat);
    expect(hubSnap!.sandwalker.currentHp).toBe(hubSnap!.sandwalker.maxHp);
    expect(hubSnap!.meta.routeProgress).toBe(0);

    errorTracker.assertNoErrors();
  });

  test('TC-BOSS-15: Ignoring emergency-revive-modal for 5s wall-clock auto-retreats with 50% cargo loss (F30)', async ({
    gamePage,
    errorTracker,
  }) => {
    const seed = createCargoSeed(11, 1, 3);
    seed.sandwalker.turretLevels = { HEAT_RAY: 1, HARPOON: 1, MORTAR: 1 };
    await injectGameState(gamePage, seed);
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await sortieFromOasis(gamePage);

    await driveToLethalSandstormRevive(gamePage, 30000);
    // Switch back to 1x so wall-clock countdown & post-retreat state remain predictable
    await setDebugSpeed(gamePage, 1);

    const reviveModal = gamePage.locator(SELECTORS.emergencyReviveModal).first();
    await expect(reviveModal).toBeVisible();

    // Do not click Accept or Retreat; wait ~5-6s wall-clock for automatic retreat
    await waitForFsmState(gamePage, 'OASIS_HUB', 8500);
    await expect(reviveModal).toBeHidden();

    const hubSnap = await readDebugSnapshot(gamePage);
    expect(hubSnap!.trade?.cargo[0]?.qty).toBe(5); // floor(11 * 0.5)
    expect(hubSnap!.sandwalker.currentHp).toBe(hubSnap!.sandwalker.maxHp);

    errorTracker.assertNoErrors();
  });

  test('TC-BOSS-16: AC-04 ZERO forced interstitial ads on both Defeat Retreat and Emergency Revive (F30)', async ({
    gamePage,
    errorTracker,
  }) => {
    // Part A: Defeat Retreat under Act 3, >=900s, Tier 0, arrivalCount=1 (conditions where settlement would show interstitial)
    const retreatSeed = createAdTierSeed(0, 1200, 3, 1);
    retreatSeed.trade.cargo = [{ goodsId: 'SPICE', qty: 10, buyPrice: 5 }];
    await injectGameState(gamePage, retreatSeed);
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await sortieFromOasis(gamePage);

    await driveToLethalSandstormRevive(gamePage, 30000);
    await setDebugSpeed(gamePage, 1);
    await retreatFromRevive(gamePage, 10000);

    await gamePage.waitForTimeout(800);
    expect(await gamePage.locator(SELECTORS.adSimModal).count()).toBe(0);
    const postRetreatSnap = await readDebugSnapshot(gamePage);
    expect(postRetreatSnap!.meta.oasisArrivalCount).toBe(1);

    // Part B: Emergency Revive Accept with Tier 3 (0s rewarded ad) triggers zero interstitial ads
    const reviveSeed = createAdTierSeed(3, 1200, 3, 1);
    await injectGameState(gamePage, reviveSeed);
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await sortieFromOasis(gamePage);

    await driveToLethalSandstormRevive(gamePage, 30000);
    await setDebugSpeed(gamePage, 1);

    const modal = gamePage.locator(SELECTORS.emergencyReviveModal).first();
    await modal.locator(SELECTORS.reviveAcceptBtn).first().click();
    await waitForAndCloseAdModal(gamePage, { optional: true, timeoutMs: 2000 });
    await waitForFsmState(gamePage, 'HAZARD_ZONE', 5000);

    await gamePage.waitForTimeout(600);
    expect(await gamePage.locator(SELECTORS.adSimModal).count()).toBe(0);

    errorTracker.assertNoErrors();
  });
});
