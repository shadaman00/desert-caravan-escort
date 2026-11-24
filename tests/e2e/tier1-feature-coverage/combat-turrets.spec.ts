// ============================================================================
// File: tests/e2e/tier1-feature-coverage/combat-turrets.spec.ts
// Milestone E1-B: Tier 1 Feature Coverage — Features 16..21
//   - F16: Real-time 3-Turret Switching (TC-COMB-01..05)
//   - F17: Heat Ray Piercing Beam (TC-COMB-06..10)
//   - F18: Harpoon Armor Piercing & Knockback (TC-COMB-11..15)
//   - F19: Mortar Parabolic AOE (TC-COMB-16..20)
//   - F20: Weapon Affinity Engine (TC-COMB-21..25)
//   - F21: Manual Weak-Point Drag Aim (TC-COMB-26..30)
// Adheres strictly to Opaque-Box E2E rule (zero src/ or @/ imports).
// ============================================================================

import { Page } from '@playwright/test';
import { test, expect } from '../fixtures/appFixture';
import {
  SELECTORS,
  waitForCanvasReady,
  waitForFsmState,
  sortieFromOasis,
  switchTurret,
  waitForActiveTurret,
  waitForSwitchCooldownReady,
  dragWeakPointAim,
  aimAtFirstEnemyWeakPoint,
  readDebugSnapshot,
  assertCanvasRegionChanged,
  setDebugProgress,
  setDebugSpeed,
  CombatDamageEventSnapshot,
} from '../fixtures/testHelpers';
import {
  injectGameState,
  createAct1HubSeed,
  createAct2QuicksandSeed,
  createBossSeedForAct,
  createTurretLevelSeed,
  readCurrentStoredState,
  TurretType,
} from '../fixtures/mockStorage';

const R_COMBAT_LANE = { x: 235, y: 180, width: 425, height: 175 };

async function enterAct1Combat(
  page: Page,
  turret: TurretType = 'HEAT_RAY',
  level = 1,
  tier = 1,
  opts?: { unlockedMercIds?: string[] }
): Promise<void> {
  const seed = createTurretLevelSeed(turret, level, tier);
  if (opts?.unlockedMercIds !== undefined) {
    seed.mercenaries = seed.mercenaries.map((m) => ({
      ...m,
      isUnlocked: opts.unlockedMercIds!.includes(m.id),
    }));
  }
  await injectGameState(page, seed);
  await page.goto('/');
  await waitForCanvasReady(page, 10000);
  await waitForFsmState(page, 'OASIS_HUB', 5000);
  await sortieFromOasis(page);
}

async function enterBossFight(
  page: Page,
  act: 1 | 2 | 3 | 4,
  opts?: {
    turretLevel?: number;
    turretTier?: number;
    activeTurret?: TurretType;
    unlockedMercIds?: string[];
  }
): Promise<void> {
  const seed = createBossSeedForAct(act, {
    turretLevel: opts?.turretLevel,
    turretTier: opts?.turretTier,
  });
  if (opts?.activeTurret) {
    seed.sandwalker.activeTurret = opts.activeTurret;
  }
  if (opts?.unlockedMercIds !== undefined) {
    seed.mercenaries = seed.mercenaries.map((m) => ({
      ...m,
      isUnlocked: opts.unlockedMercIds!.includes(m.id),
    }));
  }
  await injectGameState(page, seed);
  await page.goto('/');
  await waitForCanvasReady(page, 10000);
  await waitForFsmState(page, 'OASIS_HUB', 5000);
  await sortieFromOasis(page);
  await setDebugProgress(page, 95);
  await waitForFsmState(page, 'BOSS_ENCOUNTER', 5000);
}

async function collectDamageEvent(
  page: Page,
  predicate: (ev: CombatDamageEventSnapshot) => boolean,
  timeoutMs = 8000
): Promise<CombatDamageEventSnapshot> {
  let matched: CombatDamageEventSnapshot | null = null;
  await expect
    .poll(
      async () => {
        const snap = await readDebugSnapshot(page);
        const events = snap?.combat.recentDamageEvents ?? [];
        const hit = events.find(predicate);
        if (hit) {
          matched = hit;
          return true;
        }
        return false;
      },
      { timeout: timeoutMs, intervals: [50] }
    )
    .toBe(true);

  if (!matched) {
    throw new Error('Expected matching combat damage event within timeout');
  }
  return matched;
}

// ============================================================================
// Feature 16: Real-time 3-Turret Switching
// ============================================================================
test.describe('Tier 1: Feature 16 — Real-time 3-Turret Switching', () => {
  test('TC-COMB-01: Switches cleanly across HEAT_RAY, HARPOON, and MORTAR with active button state (F16)', async ({
    gamePage,
    errorTracker,
  }) => {
    await enterAct1Combat(gamePage, 'HEAT_RAY', 1, 1);

    const heatRayBtn = gamePage.locator(SELECTORS.turretBtnHeatRay).first();
    const harpoonBtn = gamePage.locator(SELECTORS.turretBtnHarpoon).first();
    const mortarBtn = gamePage.locator(SELECTORS.turretBtnMortar).first();

    await expect(heatRayBtn).toBeVisible();
    await expect(harpoonBtn).toBeVisible();
    await expect(mortarBtn).toBeVisible();
    await expect(heatRayBtn).toHaveClass(/active/);

    await switchTurret(gamePage, 'HARPOON');
    await waitForActiveTurret(gamePage, 'HARPOON');
    await expect(harpoonBtn).toHaveClass(/active/);
    await expect(heatRayBtn).not.toHaveClass(/active/);

    await waitForSwitchCooldownReady(gamePage);
    await switchTurret(gamePage, 'MORTAR');
    await waitForActiveTurret(gamePage, 'MORTAR');
    await expect(mortarBtn).toHaveClass(/active/);
    await expect(harpoonBtn).not.toHaveClass(/active/);

    await waitForSwitchCooldownReady(gamePage);
    await switchTurret(gamePage, 'HEAT_RAY');
    await waitForActiveTurret(gamePage, 'HEAT_RAY');
    await expect(heatRayBtn).toHaveClass(/active/);

    const snap = await readDebugSnapshot(gamePage);
    expect(snap?.combat.activeTurret).toBe('HEAT_RAY');
    expect(snap?.sandwalker.activeTurret).toBe('HEAT_RAY');
    errorTracker.assertNoErrors();
  });

  test('TC-COMB-02: Enforces 0.3s switch cooldown and displays cooldown badge inside turret button (F16)', async ({
    gamePage,
    errorTracker,
  }) => {
    await enterAct1Combat(gamePage, 'HEAT_RAY', 1, 1);

    const harpoonBtn = gamePage.locator(SELECTORS.turretBtnHarpoon).first();
    const mortarBtn = gamePage.locator(SELECTORS.turretBtnMortar).first();

    await harpoonBtn.click();
    // Immediately attempt a second switch before 0.3s expires
    await mortarBtn.click();

    const snap = await readDebugSnapshot(gamePage);
    expect(snap?.combat.activeTurret).toBe('HARPOON');
    expect(snap?.combat.switchCooldownRemaining).toBeGreaterThan(0);
    expect(snap?.combat.switchCooldownRemaining).toBeLessThanOrEqual(0.3);

    const cooldownBadge = harpoonBtn.locator(SELECTORS.turretCooldownBadge).first();
    await expect(cooldownBadge).toBeVisible({ timeout: 2000 });
    await expect(harpoonBtn).toHaveClass(/active/);
    await expect(mortarBtn).not.toHaveClass(/active/);
    errorTracker.assertNoErrors();
  });

  test('TC-COMB-03: Allows subsequent turret switch once 0.3s cooldown expires (F16)', async ({
    gamePage,
    errorTracker,
  }) => {
    await enterAct1Combat(gamePage, 'HEAT_RAY', 1, 1);

    await switchTurret(gamePage, 'HARPOON');
    await waitForActiveTurret(gamePage, 'HARPOON');

    await waitForSwitchCooldownReady(gamePage, 2000);
    const readySnap = await readDebugSnapshot(gamePage);
    expect(readySnap?.combat.switchCooldownRemaining).toBe(0);

    await switchTurret(gamePage, 'MORTAR');
    await waitForActiveTurret(gamePage, 'MORTAR');

    const mortarSnap = await readDebugSnapshot(gamePage);
    expect(mortarSnap?.combat.activeTurret).toBe('MORTAR');
    errorTracker.assertNoErrors();
  });

  test('TC-COMB-04: Clicking already-active turret is a no-op without triggering 0.3s cooldown (F16)', async ({
    gamePage,
    errorTracker,
  }) => {
    await enterAct1Combat(gamePage, 'HEAT_RAY', 1, 1);

    await switchTurret(gamePage, 'HEAT_RAY');
    const snap = await readDebugSnapshot(gamePage);
    expect(snap?.combat.activeTurret).toBe('HEAT_RAY');
    expect(snap?.combat.switchCooldownRemaining).toBe(0);

    const heatRayBtn = gamePage.locator(SELECTORS.turretBtnHeatRay).first();
    await expect(heatRayBtn.locator(SELECTORS.turretCooldownBadge)).toHaveCount(0);
    errorTracker.assertNoErrors();
  });

  test('TC-COMB-05: Selected active turret persists across pagehide save flush and reload (F16)', async ({
    gamePage,
    errorTracker,
  }) => {
    await enterAct1Combat(gamePage, 'HEAT_RAY', 1, 1);

    await switchTurret(gamePage, 'MORTAR');
    await waitForActiveTurret(gamePage, 'MORTAR');

    await gamePage.evaluate(() => {
      window.dispatchEvent(new Event('pagehide'));
    });

    await expect
      .poll(async () => (await readCurrentStoredState(gamePage))?.sandwalker.activeTurret ?? null, {
        timeout: 4000,
      })
      .toBe('MORTAR');

    await gamePage.reload();
    await waitForCanvasReady(gamePage, 10000);
    await waitForFsmState(gamePage, 'OASIS_HUB', 5000);

    const snapAfterReload = await readDebugSnapshot(gamePage);
    expect(snapAfterReload?.sandwalker.activeTurret).toBe('MORTAR');
    await expect(gamePage.locator(SELECTORS.turretBtnMortar).first()).toHaveClass(/active/);
    errorTracker.assertNoErrors();
  });
});

// ============================================================================
// Feature 17: Heat Ray Piercing Beam
// ============================================================================
test.describe('Tier 1: Feature 17 — Heat Ray Piercing Beam', () => {
  test('TC-COMB-06: Heat Ray activates straight piercing beam (hasBeam) when enemies enter range (F17)', async ({
    gamePage,
    errorTracker,
  }) => {
    await enterAct1Combat(gamePage, 'HEAT_RAY', 1, 1);

    await expect
      .poll(
        async () => {
          const snap = await readDebugSnapshot(gamePage);
          return Boolean(snap && snap.combat.enemyCount >= 1 && snap.combat.activeProjectiles.hasBeam);
        },
        { timeout: 6000, intervals: [40] }
      )
      .toBe(true);

    const hit = await collectDamageEvent(
      gamePage,
      (ev) => ev.source === 'TURRET' && ev.turret === 'HEAT_RAY'
    );
    expect(hit.damage).toBeGreaterThan(0);
    errorTracker.assertNoErrors();
  });

  test('TC-COMB-07: Heat Ray fires at ~0.1s tick cadence producing rapid multi-hit events at 1x (F17)', async ({
    gamePage,
    errorTracker,
  }) => {
    await enterAct1Combat(gamePage, 'HEAT_RAY', 1, 1);

    await expect
      .poll(async () => (await readDebugSnapshot(gamePage))?.combat.enemyCount ?? 0, {
        timeout: 5000,
        intervals: [50],
      })
      .toBeGreaterThanOrEqual(1);

    const beforeSnap = await readDebugSnapshot(gamePage);
    const baselineTs = Math.max(
      0,
      ...(beforeSnap?.combat.recentDamageEvents ?? []).map((ev) => ev.timestamp)
    );
    await gamePage.waitForTimeout(700);
    const snap = await readDebugSnapshot(gamePage);
    const heatHits = (snap?.combat.recentDamageEvents ?? []).filter(
      (ev) =>
        ev.source === 'TURRET' &&
        ev.turret === 'HEAT_RAY' &&
        ev.timestamp >= baselineTs
    );

    expect(heatHits.length).toBeGreaterThanOrEqual(3);
    errorTracker.assertNoErrors();
  });

  test('TC-COMB-08: Heat Ray pierces multiple aligned enemies and animates Zone B combat lane (F17)', async ({
    gamePage,
    errorTracker,
  }) => {
    await enterAct1Combat(gamePage, 'HEAT_RAY', 1, 1);

    await expect
      .poll(async () => (await readDebugSnapshot(gamePage))?.combat.enemyCount ?? 0, {
        timeout: 7000,
        intervals: [50],
      })
      .toBeGreaterThanOrEqual(2);

    await expect
      .poll(
        async () => {
          const snap = await readDebugSnapshot(gamePage);
          const damaged = (snap?.combat.enemies ?? []).filter((e) => e.hp < e.maxHp);
          return damaged.length;
        },
        { timeout: 6000, intervals: [50] }
      )
      .toBeGreaterThanOrEqual(2);

    await assertCanvasRegionChanged(gamePage, R_COMBAT_LANE, 300);
    errorTracker.assertNoErrors();
  });

  test('TC-COMB-09: Heat Ray applies 0.5x armor crush factor against armored boss targets (F17)', async ({
    gamePage,
    errorTracker,
  }) => {
    await enterBossFight(gamePage, 1, {
      turretLevel: 1,
      turretTier: 1,
      activeTurret: 'HEAT_RAY',
    });

    await expect
      .poll(
        async () => {
          const snap = await readDebugSnapshot(gamePage);
          return (snap?.combat.boss?.armor ?? 500) < 492;
        },
        { timeout: 6000, intervals: [50] }
      )
      .toBe(true);

    const snap = await readDebugSnapshot(gamePage);
    const boss = snap?.combat.boss;
    expect(boss).not.toBeNull();
    if (boss) {
      const armorLost = 500 - boss.armor;
      const hpLost = 2000 - boss.hp;
      expect(armorLost).toBeGreaterThan(0);
      expect(hpLost).toBeGreaterThan(0);
      // 0.5x armor crush factor strips less armor than HP damage dealt
      expect(armorLost).toBeLessThan(hpLost);
    }
    errorTracker.assertNoErrors();
  });

  test('TC-COMB-10: Higher turret level & Tier 3 scales Heat Ray damage via statAt formula (F17)', async ({
    gamePage,
    errorTracker,
  }) => {
    await enterAct1Combat(gamePage, 'HEAT_RAY', 1, 1);
    const lv1Hit = await collectDamageEvent(
      gamePage,
      (ev) =>
        ev.source === 'TURRET' &&
        ev.turret === 'HEAT_RAY' &&
        ev.tags.includes('SMALL_SWARM')
    );
    expect(lv1Hit.multiplier).toBe(1.0);
    expect(lv1Hit.damage).toBe(4);

    await injectGameState(gamePage, createTurretLevelSeed('HEAT_RAY', 21, 3));
    await gamePage.reload();
    await waitForCanvasReady(gamePage, 10000);
    await waitForFsmState(gamePage, 'OASIS_HUB', 5000);
    await sortieFromOasis(gamePage);

    const lv21Hit = await collectDamageEvent(
      gamePage,
      (ev) =>
        ev.source === 'TURRET' &&
        ev.turret === 'HEAT_RAY' &&
        ev.tags.includes('SMALL_SWARM')
    );
    // statAt(4.0, 21) = 4.0 * (1 + 0.22 * 20) = 21.6 -> rounded 22
    expect(lv21Hit.damage).toBeGreaterThanOrEqual(20);
    expect(lv21Hit.damage).toBeGreaterThan(lv1Hit.damage * 4);
    errorTracker.assertNoErrors();
  });
});

// ============================================================================
// Feature 18: Harpoon Armor Piercing & Knockback
// ============================================================================
test.describe('Tier 1: Feature 18 — Harpoon Armor Piercing & Knockback', () => {
  test('TC-COMB-11: Harpoon fires high-velocity projectile (harpoons > 0) and records HARPOON hits at 1x (F18)', async ({
    gamePage,
    errorTracker,
  }) => {
    await enterAct1Combat(gamePage, 'HARPOON', 1, 1);

    await expect
      .poll(
        async () => (await readDebugSnapshot(gamePage))?.combat.activeProjectiles.harpoons ?? 0,
        { timeout: 6000, intervals: [20] }
      )
      .toBeGreaterThanOrEqual(1);

    const hit = await collectDamageEvent(
      gamePage,
      (ev) => ev.source === 'TURRET' && ev.turret === 'HARPOON'
    );
    expect(hit.damage).toBeGreaterThan(0);
    errorTracker.assertNoErrors();
  });

  test('TC-COMB-12: Harpoon deals 2.2x affinity damage (121 at Lv1) against HEAVY_ARMOR Scorpions (F18)', async ({
    gamePage,
    errorTracker,
  }) => {
    const seed = createAct2QuicksandSeed(1, {
      turretLevel: 1,
      turretTier: 1,
      unlockedMercIds: [],
    });
    seed.sandwalker.activeTurret = 'HARPOON';
    await injectGameState(gamePage, seed);
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await waitForFsmState(gamePage, 'OASIS_HUB', 5000);
    await sortieFromOasis(gamePage);
    await setDebugProgress(gamePage, 45);
    await waitForFsmState(gamePage, 'HAZARD_ZONE', 5000);

    const heavyHit = await collectDamageEvent(
      gamePage,
      (ev) =>
        ev.source === 'TURRET' &&
        ev.turret === 'HARPOON' &&
        ev.tags.includes('HEAVY_ARMOR'),
      12000
    );

    expect(heavyHit.multiplier).toBe(2.2);
    expect(heavyHit.damage).toBe(121);
    errorTracker.assertNoErrors();
  });

  test('TC-COMB-13: Harpoon applies 2.0x armor crush on Varka Armored Car armor bar (F18)', async ({
    gamePage,
    errorTracker,
  }) => {
    await enterBossFight(gamePage, 1, {
      turretLevel: 1,
      turretTier: 1,
      activeTurret: 'HARPOON',
      unlockedMercIds: [],
    });

    await expect
      .poll(
        async () => {
          const snap = await readDebugSnapshot(gamePage);
          return (snap?.combat.boss?.armor ?? 500) < 500;
        },
        { timeout: 6000, intervals: [40] }
      )
      .toBe(true);

    const snap = await readDebugSnapshot(gamePage);
    const boss = snap?.combat.boss;
    expect(boss).not.toBeNull();
    if (boss) {
      const armorLost = 500 - boss.armor;
      const hpLost = 2000 - boss.hp;
      expect(armorLost).toBeGreaterThan(0);
      expect(hpLost).toBeGreaterThan(0);
      // 2.0x armor crush factor strips ~2x the HP damage dealt per Harpoon hit
      expect(armorLost).toBeGreaterThanOrEqual(hpLost * 1.8);
    }
    errorTracker.assertNoErrors();
  });

  test('TC-COMB-14: Harpoon knocks back regular non-immune enemies rightward on impact (F18)', async ({
    gamePage,
    errorTracker,
  }) => {
    const seed = createAct2QuicksandSeed(1, {
      turretLevel: 1,
      turretTier: 1,
      unlockedMercIds: [],
    });
    seed.sandwalker.activeTurret = 'HARPOON';
    await injectGameState(gamePage, seed);
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await waitForFsmState(gamePage, 'OASIS_HUB', 5000);
    await sortieFromOasis(gamePage);
    await setDebugProgress(gamePage, 45);
    await waitForFsmState(gamePage, 'HAZARD_ZONE', 5000);

    // Wait for a durable SCORPION (174 HP in Act 2, survives Lv1 Harpoon 121 dmg)
    let trackedId = '';
    let xBeforeHit = 0;

    await expect
      .poll(
        async () => {
          const snap = await readDebugSnapshot(gamePage);
          const scorpion = (snap?.combat.enemies ?? []).find(
            (e) => e.archetypeId === 'SCORPION' && e.hp === e.maxHp && e.x < 665
          );
          if (scorpion) {
            trackedId = scorpion.id;
            xBeforeHit = scorpion.x;
            return true;
          }
          return false;
        },
        { timeout: 10000, intervals: [25] }
      )
      .toBe(true);

    // Poll until that exact scorpion takes damage and observe rightward knockback
    let xAfterHit = xBeforeHit;
    await expect
      .poll(
        async () => {
          const snap = await readDebugSnapshot(gamePage);
          const target = (snap?.combat.enemies ?? []).find((e) => e.id === trackedId);
          if (!target) return false;
          if (target.hp < target.maxHp && target.x > xBeforeHit) {
            xAfterHit = target.x;
            return true;
          }
          // Update pre-hit baseline while scorpion is still marching leftward unhit
          if (target.hp === target.maxHp) {
            xBeforeHit = target.x;
          }
          return false;
        },
        { timeout: 8000, intervals: [20] }
      )
      .toBe(true);

    expect(xAfterHit).toBeGreaterThan(xBeforeHit);
    errorTracker.assertNoErrors();
  });

  test('TC-COMB-15: Harpoon does NOT knock back knockbackImmune bosses across hits (F18)', async ({
    gamePage,
    errorTracker,
  }) => {
    await enterBossFight(gamePage, 1, {
      turretLevel: 1,
      turretTier: 1,
      activeTurret: 'HARPOON',
    });

    const initialSnap = await readDebugSnapshot(gamePage);
    const bossEnemyBefore = initialSnap?.combat.enemies.find(
      (e) => e.id === 'boss_varka_armored_car'
    );
    expect(bossEnemyBefore).toBeDefined();
    const initialBossX = bossEnemyBefore?.x ?? 0;

    await expect
      .poll(async () => (await readDebugSnapshot(gamePage))?.combat.boss?.armor ?? 500, {
        timeout: 6000,
        intervals: [50],
      })
      .toBeLessThan(300);

    const afterSnap = await readDebugSnapshot(gamePage);
    const bossEnemyAfter = afterSnap?.combat.enemies.find(
      (e) => e.id === 'boss_varka_armored_car'
    );
    expect(bossEnemyAfter).toBeDefined();
    if (bossEnemyAfter) {
      expect(Math.abs(bossEnemyAfter.x - initialBossX)).toBeLessThanOrEqual(2);
    }
    errorTracker.assertNoErrors();
  });
});

// ============================================================================
// Feature 19: Mortar Parabolic AOE
// ============================================================================
test.describe('Tier 1: Feature 19 — Mortar Parabolic AOE', () => {
  test('TC-COMB-16: Mortar launches parabolic shell (mortars > 0) during 1x flight window (F19)', async ({
    gamePage,
    errorTracker,
  }) => {
    await enterAct1Combat(gamePage, 'MORTAR', 1, 1);

    await expect
      .poll(
        async () => (await readDebugSnapshot(gamePage))?.combat.activeProjectiles.mortars ?? 0,
        { timeout: 7000, intervals: [30] }
      )
      .toBeGreaterThanOrEqual(1);

    errorTracker.assertNoErrors();
  });

  test('TC-COMB-17: Mortar impact triggers AOE explosion ring (explosions > 0) and particles (F19)', async ({
    gamePage,
    errorTracker,
  }) => {
    await enterAct1Combat(gamePage, 'MORTAR', 1, 1);

    await expect
      .poll(
        async () => {
          const snap = await readDebugSnapshot(gamePage);
          return Boolean(
            snap &&
              snap.combat.activeProjectiles.explosions >= 1 &&
              (snap.combat.particleCount ?? 0) > 0
          );
        },
        { timeout: 8000, intervals: [25] }
      )
      .toBe(true);

    errorTracker.assertNoErrors();
  });

  test('TC-COMB-18: Single Mortar impact AOE (90px radius) damages multiple clustered bandits (F19)', async ({
    gamePage,
    errorTracker,
  }) => {
    await enterAct1Combat(gamePage, 'MORTAR', 1, 1);

    await expect
      .poll(
        async () => {
          const snap = await readDebugSnapshot(gamePage);
          const mortarEvents = (snap?.combat.recentDamageEvents ?? []).filter(
            (ev) => ev.source === 'TURRET' && ev.turret === 'MORTAR'
          );
          for (let i = 0; i < mortarEvents.length; i++) {
            const simultaneous = mortarEvents.filter(
              (ev) => Math.abs(ev.timestamp - mortarEvents[i].timestamp) <= 0.05
            );
            if (simultaneous.length >= 2) {
              return true;
            }
          }
          return false;
        },
        { timeout: 10000, intervals: [50] }
      )
      .toBe(true);

    errorTracker.assertNoErrors();
  });

  test('TC-COMB-19: Mortar deals 2.0x affinity damage (105 at Lv1) against SMALL_SWARM enemies (F19)', async ({
    gamePage,
    errorTracker,
  }) => {
    await enterAct1Combat(gamePage, 'MORTAR', 1, 1);

    const hit = await collectDamageEvent(
      gamePage,
      (ev) =>
        ev.source === 'TURRET' &&
        ev.turret === 'MORTAR' &&
        ev.tags.includes('SMALL_SWARM')
    );

    expect(hit.multiplier).toBe(2.0);
    expect(hit.damage).toBe(105);
    errorTracker.assertNoErrors();
  });

  test('TC-COMB-20: Mortar deals 0.8x on SINGLE_LARGE_BOSS (Sandworm P3) and 2.2x on PARASITE adds (F19)', async ({
    gamePage,
    errorTracker,
  }) => {
    await enterBossFight(gamePage, 4, {
      turretLevel: 25,
      turretTier: 3,
      activeTurret: 'HARPOON',
    });

    await setDebugSpeed(gamePage, 4);

    // Wait for Phase 2 then switch to HEAT_RAY to melt Exposed Core
    await expect
      .poll(async () => (await readDebugSnapshot(gamePage))?.combat.boss?.phase ?? 1, {
        timeout: 20000,
        intervals: [100],
      })
      .toBeGreaterThanOrEqual(2);

    await waitForSwitchCooldownReady(gamePage);
    await switchTurret(gamePage, 'HEAT_RAY');

    // Wait for Phase 3 (SINGLE_LARGE_BOSS + PARASITE waves)
    await expect
      .poll(async () => (await readDebugSnapshot(gamePage))?.combat.boss?.phase ?? 1, {
        timeout: 20000,
        intervals: [100],
      })
      .toBe(3);

    await setDebugSpeed(gamePage, 1);
    await waitForSwitchCooldownReady(gamePage);
    await switchTurret(gamePage, 'MORTAR');

    const bossP3Hit = await collectDamageEvent(
      gamePage,
      (ev) =>
        ev.source === 'TURRET' &&
        ev.turret === 'MORTAR' &&
        ev.tags.includes('SINGLE_LARGE_BOSS'),
      10000
    );
    expect(bossP3Hit.multiplier).toBe(0.8);

    const parasiteHit = await collectDamageEvent(
      gamePage,
      (ev) =>
        ev.source === 'TURRET' &&
        ev.turret === 'MORTAR' &&
        ev.tags.includes('PARASITE'),
      12000
    );
    expect(parasiteHit.multiplier).toBe(2.2);
    errorTracker.assertNoErrors();
  });
});

// ============================================================================
// Feature 20: Weapon Affinity Engine
// ============================================================================
test.describe('Tier 1: Feature 20 — Weapon Affinity Engine', () => {
  test('TC-COMB-21: MIRAGE target receives 2.0x from HEAT_RAY and 1.0x from HARPOON/MORTAR (F20)', async ({
    gamePage,
    errorTracker,
  }) => {
    await enterBossFight(gamePage, 3, {
      turretLevel: 1,
      turretTier: 1,
      activeTurret: 'HEAT_RAY',
    });

    const heatHit = await collectDamageEvent(
      gamePage,
      (ev) =>
        ev.source === 'TURRET' &&
        ev.turret === 'HEAT_RAY' &&
        ev.tags.includes('MIRAGE')
    );
    expect(heatHit.multiplier).toBe(2.0);

    await waitForSwitchCooldownReady(gamePage);
    await switchTurret(gamePage, 'HARPOON');
    const harpoonHit = await collectDamageEvent(
      gamePage,
      (ev) =>
        ev.source === 'TURRET' &&
        ev.turret === 'HARPOON' &&
        ev.tags.includes('MIRAGE')
    );
    expect(harpoonHit.multiplier).toBe(1.0);

    await waitForSwitchCooldownReady(gamePage);
    await switchTurret(gamePage, 'MORTAR');
    const mortarHit = await collectDamageEvent(
      gamePage,
      (ev) =>
        ev.source === 'TURRET' &&
        ev.turret === 'MORTAR' &&
        ev.tags.includes('MIRAGE')
    );
    expect(mortarHit.multiplier).toBe(1.0);
    errorTracker.assertNoErrors();
  });

  test('TC-COMB-22: HEAVY_ARMOR target receives 2.2x HARPOON, 0.6x HEAT_RAY, and 1.0x MORTAR (F20)', async ({
    gamePage,
    errorTracker,
  }) => {
    await enterBossFight(gamePage, 1, {
      turretLevel: 1,
      turretTier: 1,
      activeTurret: 'HARPOON',
    });

    const harpoonHit = await collectDamageEvent(
      gamePage,
      (ev) =>
        ev.source === 'TURRET' &&
        ev.turret === 'HARPOON' &&
        ev.tags.includes('HEAVY_ARMOR')
    );
    expect(harpoonHit.multiplier).toBe(2.2);

    await waitForSwitchCooldownReady(gamePage);
    await switchTurret(gamePage, 'HEAT_RAY');
    const heatHit = await collectDamageEvent(
      gamePage,
      (ev) =>
        ev.source === 'TURRET' &&
        ev.turret === 'HEAT_RAY' &&
        ev.tags.includes('HEAVY_ARMOR')
    );
    expect(heatHit.multiplier).toBe(0.6);

    await waitForSwitchCooldownReady(gamePage);
    await switchTurret(gamePage, 'MORTAR');
    const mortarHit = await collectDamageEvent(
      gamePage,
      (ev) =>
        ev.source === 'TURRET' &&
        ev.turret === 'MORTAR' &&
        ev.tags.includes('HEAVY_ARMOR')
    );
    expect(mortarHit.multiplier).toBe(1.0);
    errorTracker.assertNoErrors();
  });

  test('TC-COMB-23: WORM_HEAD_SHELL (Sandworm P1) receives 2.0x HARPOON, 0.6x HEAT_RAY, 1.0x MORTAR (F20)', async ({
    gamePage,
    errorTracker,
  }) => {
    await enterBossFight(gamePage, 4, {
      turretLevel: 1,
      turretTier: 1,
      activeTurret: 'HARPOON',
    });

    const harpoonHit = await collectDamageEvent(
      gamePage,
      (ev) =>
        ev.source === 'TURRET' &&
        ev.turret === 'HARPOON' &&
        ev.tags.includes('WORM_HEAD_SHELL')
    );
    expect(harpoonHit.multiplier).toBe(2.0);

    await waitForSwitchCooldownReady(gamePage);
    await switchTurret(gamePage, 'HEAT_RAY');
    const heatHit = await collectDamageEvent(
      gamePage,
      (ev) =>
        ev.source === 'TURRET' &&
        ev.turret === 'HEAT_RAY' &&
        ev.tags.includes('WORM_HEAD_SHELL')
    );
    expect(heatHit.multiplier).toBe(0.6);

    await waitForSwitchCooldownReady(gamePage);
    await switchTurret(gamePage, 'MORTAR');
    const mortarHit = await collectDamageEvent(
      gamePage,
      (ev) =>
        ev.source === 'TURRET' &&
        ev.turret === 'MORTAR' &&
        ev.tags.includes('WORM_HEAD_SHELL')
    );
    expect(mortarHit.multiplier).toBe(1.0);
    errorTracker.assertNoErrors();
  });

  test('TC-COMB-24: EXPOSED_CORE (Sandworm P2) receives 1.8x HEAT_RAY and 1.0x HARPOON (F20)', async ({
    gamePage,
    errorTracker,
  }) => {
    await enterBossFight(gamePage, 4, {
      turretLevel: 30,
      turretTier: 3,
      activeTurret: 'HARPOON',
    });

    await setDebugSpeed(gamePage, 4);
    await expect
      .poll(async () => (await readDebugSnapshot(gamePage))?.combat.boss?.phase ?? 1, {
        timeout: 20000,
        intervals: [100],
      })
      .toBe(2);

    await setDebugSpeed(gamePage, 1);
    const harpoonHit = await collectDamageEvent(
      gamePage,
      (ev) =>
        ev.source === 'TURRET' &&
        ev.turret === 'HARPOON' &&
        ev.tags.includes('EXPOSED_CORE')
    );
    expect(harpoonHit.multiplier).toBe(1.0);

    await waitForSwitchCooldownReady(gamePage);
    await switchTurret(gamePage, 'HEAT_RAY');
    const heatHit = await collectDamageEvent(
      gamePage,
      (ev) =>
        ev.source === 'TURRET' &&
        ev.turret === 'HEAT_RAY' &&
        ev.tags.includes('EXPOSED_CORE')
    );
    expect(heatHit.multiplier).toBe(1.8);
    errorTracker.assertNoErrors();
  });

  test('TC-COMB-25: SMALL_SWARM (DESERT_BANDIT) receives 2.0x MORTAR, 0.7x HARPOON, 1.0x HEAT_RAY (F20)', async ({
    gamePage,
    errorTracker,
  }) => {
    await enterAct1Combat(gamePage, 'MORTAR', 1, 1, { unlockedMercIds: [] });

    const mortarHit = await collectDamageEvent(
      gamePage,
      (ev) =>
        ev.source === 'TURRET' &&
        ev.turret === 'MORTAR' &&
        ev.tags.includes('SMALL_SWARM')
    );
    expect(mortarHit.multiplier).toBe(2.0);

    await waitForSwitchCooldownReady(gamePage);
    await switchTurret(gamePage, 'HARPOON');
    await aimAtFirstEnemyWeakPoint(
      gamePage,
      (e) => e.archetypeId === 'DESERT_BANDIT' && e.x > 280 && e.x < 660
    ).catch(() => null);
    const harpoonHit = await collectDamageEvent(
      gamePage,
      (ev) =>
        ev.source === 'TURRET' &&
        ev.turret === 'HARPOON' &&
        ev.tags.includes('SMALL_SWARM')
    );
    expect(harpoonHit.multiplier).toBe(0.7);

    await waitForSwitchCooldownReady(gamePage);
    await switchTurret(gamePage, 'HEAT_RAY');
    const heatHit = await collectDamageEvent(
      gamePage,
      (ev) =>
        ev.source === 'TURRET' &&
        ev.turret === 'HEAT_RAY' &&
        ev.tags.includes('SMALL_SWARM')
    );
    expect(heatHit.multiplier).toBe(1.0);
    errorTracker.assertNoErrors();
  });
});

// ============================================================================
// Feature 21: Manual Weak-Point Drag Aim
// ============================================================================
test.describe('Tier 1: Feature 21 — Manual Weak-Point Drag Aim', () => {
  test('TC-COMB-26: Dragging within 40px of enemy weak point locks target and shows locked aim-reticle (F21)', async ({
    gamePage,
    errorTracker,
  }) => {
    const seed = createTurretLevelSeed('HEAT_RAY', 1, 1);
    seed.mercenaries = seed.mercenaries.map((m) => ({ ...m, isUnlocked: false }));
    await injectGameState(gamePage, seed);
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await waitForFsmState(gamePage, 'OASIS_HUB', 5000);
    await sortieFromOasis(gamePage);

    const target = await aimAtFirstEnemyWeakPoint(
      gamePage,
      (e) => e.x > 280 && e.x < 660 && e.hp >= 18,
      { steps: 4, holdMs: 30, release: true }
    );

    const snap = await readDebugSnapshot(gamePage);
    expect(snap?.combat.lockedTargetId).toBe(target.id);
    expect(snap?.sandwalker.manualAimTargetId).toBe(target.id);
    expect(snap?.combat.lockRemainingSec).toBeGreaterThan(0);

    const reticle = gamePage.locator(SELECTORS.aimReticle).first();
    await expect(reticle).toBeVisible();
    await expect(reticle).toHaveClass(/locked/);
    errorTracker.assertNoErrors();
  });

  test('TC-COMB-27: Dragging outside 40px weak-point snap radius does NOT lock any target (F21)', async ({
    gamePage,
    errorTracker,
  }) => {
    await enterAct1Combat(gamePage, 'HEAT_RAY', 1, 1);

    // Drag in top-left sky corner far from all ground/aerial enemies
    await dragWeakPointAim(gamePage, { x: 25, y: 25 }, { x: 60, y: 55 }, { steps: 6, holdMs: 80 });

    const snap = await readDebugSnapshot(gamePage);
    expect(snap?.combat.lockedTargetId).toBeNull();
    expect(snap?.combat.lockRemainingSec).toBe(0);
    await expect(gamePage.locator(SELECTORS.aimReticle)).toHaveCount(0);
    errorTracker.assertNoErrors();
  });

  test('TC-COMB-28: Manual weak-point lock persists ~2.0s after pointer release then auto-unlocks (F21)', async ({
    gamePage,
    errorTracker,
  }) => {
    // Use durable Act 2 boss so target stays alive for > 2.3s
    await enterBossFight(gamePage, 2, {
      turretLevel: 1,
      turretTier: 1,
      activeTurret: 'HEAT_RAY',
    });

    const target = await aimAtFirstEnemyWeakPoint(gamePage, undefined, {
      steps: 8,
      holdMs: 80,
      release: true,
    });

    const lockedSnap = await readDebugSnapshot(gamePage);
    expect(lockedSnap?.combat.lockedTargetId).toBe(target.id);
    expect(lockedSnap?.combat.lockRemainingSec).toBeGreaterThan(0);
    expect(lockedSnap?.combat.lockRemainingSec).toBeLessThanOrEqual(2.0);

    // Still locked at ~0.9s
    await gamePage.waitForTimeout(900);
    const midSnap = await readDebugSnapshot(gamePage);
    expect(midSnap?.combat.lockedTargetId).toBe(target.id);
    await expect(gamePage.locator(SELECTORS.aimReticle).first()).toBeVisible();

    // Auto-unlocks after 2.0s total
    await expect
      .poll(async () => (await readDebugSnapshot(gamePage))?.combat.lockedTargetId ?? null, {
        timeout: 2500,
        intervals: [80],
      })
      .toBeNull();

    await expect(gamePage.locator(SELECTORS.aimReticle)).toHaveCount(0);
    errorTracker.assertNoErrors();
  });

  test('TC-COMB-29: Manual lock grants 1.5x weak-point damage bonus on regular enemy (F21)', async ({
    gamePage,
    errorTracker,
  }) => {
    const seed = createAct1HubSeed({ unlockedMercIds: [] });
    seed.sandwalker.activeTurret = 'HEAT_RAY';
    seed.sandwalker.turretLevels.HEAT_RAY = 1;
    await injectGameState(gamePage, seed);
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await waitForFsmState(gamePage, 'OASIS_HUB', 5000);
    await sortieFromOasis(gamePage);

    // Baseline unlocked HEAT_RAY damage on DESERT_BANDIT = 4
    const unlockedHit = await collectDamageEvent(
      gamePage,
      (ev) =>
        ev.source === 'TURRET' &&
        ev.turret === 'HEAT_RAY' &&
        ev.tags.includes('SMALL_SWARM')
    );
    expect(unlockedHit.damage).toBe(4);

    // Lock onto a regular DESERT_BANDIT weak point and confirm 1.5x (4 * 1.5 = 6)
    const beforeLockSnap = await readDebugSnapshot(gamePage);
    const baselineTs = Math.max(
      0,
      ...(beforeLockSnap?.combat.recentDamageEvents ?? []).map((ev) => ev.timestamp)
    );
    await aimAtFirstEnemyWeakPoint(
      gamePage,
      (e) => e.archetypeId === 'DESERT_BANDIT' && e.hp >= 12 && e.x < 665,
      { steps: 6, holdMs: 60, release: true }
    );

    const lockedHit = await collectDamageEvent(
      gamePage,
      (ev) =>
        ev.source === 'TURRET' &&
        ev.turret === 'HEAT_RAY' &&
        ev.tags.includes('SMALL_SWARM') &&
        ev.timestamp >= baselineTs &&
        ev.damage === 6,
      5000
    );

    expect(lockedHit.damage).toBe(6);
    errorTracker.assertNoErrors();
  });

  test('TC-COMB-30: Manual weak-point lock clears immediately when locked enemy dies (F21)', async ({
    gamePage,
    errorTracker,
  }) => {
    const seed = createTurretLevelSeed('HARPOON', 15, 2);
    seed.mercenaries = seed.mercenaries.map((m) => ({ ...m, isUnlocked: false }));
    await injectGameState(gamePage, seed);
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await waitForFsmState(gamePage, 'OASIS_HUB', 5000);
    await sortieFromOasis(gamePage);

    // Lock onto a low-HP DESERT_BANDIT (30 HP, one-shot by Lv15 Harpoon)
    const target = await aimAtFirstEnemyWeakPoint(
      gamePage,
      (e) => e.archetypeId === 'DESERT_BANDIT' && e.x > 290 && e.x < 665,
      { steps: 6, holdMs: 60, release: true }
    );

    const snapAtLock = await readDebugSnapshot(gamePage);
    const lockedId = snapAtLock?.combat.lockedTargetId ?? target.id;
    expect(snapAtLock?.combat.lockedTargetId).toBeTruthy();

    // Wait for target death and verify immediate lock & reticle cleanup
    await expect
      .poll(
        async () => {
          const snap = await readDebugSnapshot(gamePage);
          const stillAlive = (snap?.combat.enemies ?? []).some((e) => e.id === lockedId);
          return !stillAlive && snap?.combat.lockedTargetId === null;
        },
        { timeout: 6000, intervals: [40] }
      )
      .toBe(true);

    await expect(gamePage.locator(SELECTORS.aimReticle)).toHaveCount(0);
    errorTracker.assertNoErrors();
  });
});
