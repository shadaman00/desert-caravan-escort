// ============================================================================
// File: tests/e2e/v2/phase2-controls-and-combat.spec.ts
// Phase 2 E2E Verification: 4 Active Controls (Lock-On 1.5x, Overheat Vent,
// Golden Counter Parry, Touch Relic Excavation) & Sandworm 4-Stage FSM
// Adheres strictly to Opaque-Box E2E rule (zero src/ or @/ imports).
// ============================================================================

import { test, expect, type Page } from '@playwright/test';

interface V2CombatStateSnap {
  mechFsmState: string;
  heat: number;
  inSweetSpot: boolean;
  isOverdrive: boolean;
  forcedCoolRemainingSec: number;
  isShieldActive: boolean;
  dodgeCooldownSec: number;
  enemyCount: number;
  relicCount: number;
  lockedEnemyId: number | null;
  lockedWeakPoint: boolean;
  sandwormState: string | null;
  bossTelegraphActive: boolean;
}

async function readDebug(page: Page) {
  return page.evaluate(() => {
    const api = (
      window as unknown as {
        __SANDWALKER_V2__: {
          getSnapshot: () => { gold: number; ancientGears: number; equippedTurret: string };
          getCombatState: () => V2CombatStateSnap;
          setHeat: (h: number) => void;
          spawnRaider: (x?: number) => void;
          spawnBoss: (kind: string, x?: number) => void;
          spawnRelic: (x?: number, g?: number, gear?: number) => void;
        };
      }
    ).__SANDWALKER_V2__;
    return {
      snap: api.getSnapshot(),
      combat: api.getCombatState(),
    };
  });
}

async function startAndSkipStoryboard(page: Page) {
  await page.locator('[data-testid="btn-start-expedition"]').click();
  const skipBtn = page.locator('[data-testid="btn-skip-storyboard"]');
  if (await skipBtn.isVisible()) {
    await skipBtn.click();
  }
}

test.describe('Phase 2 (PRD v2.0 Landscape): 4 Active Controls & Sandworm FSM', () => {
  test('TC-V2-P2-01: Manual enemy lock-on and touch/F-key relic excavation grant rewards immediately', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.setViewportSize({ width: 960, height: 540 });
    await page.goto('/');
    await startAndSkipStoryboard(page);

    // Spawn raider at x=640 (grounded at y=330, center y=313) & click to lock on
    await page.evaluate(() => {
      (window as unknown as { __SANDWALKER_V2__: { spawnRaider: (x: number) => void } })
        .__SANDWALKER_V2__.spawnRaider(640);
    });
    await page.locator('[data-testid="game-canvas"]').click({ position: { x: 640, y: 313 } });

    await expect
      .poll(async () => (await readDebug(page)).combat.lockedEnemyId, { timeout: 3000 })
      .not.toBeNull();

    // Spawn glowing relic at x=420 (y=318), click inside 28px hit radius -> gold +85, gear +1
    const beforeGold = (await readDebug(page)).snap.gold;
    const beforeGears = (await readDebug(page)).snap.ancientGears;
    await page.evaluate(() => {
      (window as unknown as { __SANDWALKER_V2__: { spawnRelic: (x: number, g: number, gear: number) => void } })
        .__SANDWALKER_V2__.spawnRelic(420, 85, 1);
    });
    await page.locator('[data-testid="game-canvas"]').click({ position: { x: 420, y: 318 } });

    await expect
      .poll(async () => (await readDebug(page)).snap.gold, { timeout: 3000 })
      .toBeGreaterThanOrEqual(beforeGold + 85);
    expect((await readDebug(page)).snap.ancientGears).toBeGreaterThanOrEqual(beforeGears + 1);

    // Spawn another relic and excavate via F key
    await page.evaluate(() => {
      (window as unknown as { __SANDWALKER_V2__: { spawnRelic: (x: number, g: number, gear: number) => void } })
        .__SANDWALKER_V2__.spawnRelic(520, 100, 2);
    });
    const goldMid = (await readDebug(page)).snap.gold;
    await page.keyboard.press('f');
    await expect
      .poll(async () => (await readDebug(page)).snap.gold, { timeout: 3000 })
      .toBeGreaterThanOrEqual(goldMid + 100);

    expect(errors).toEqual([]);
  });

  test('TC-V2-P2-02: Engine overheat [75..95] vents via hull tap / W key into Overdrive, and 100 triggers forced cool', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.setViewportSize({ width: 960, height: 540 });
    await page.goto('/');
    await startAndSkipStoryboard(page);

    await page.evaluate(() => {
      (window as unknown as { __SANDWALKER_V2__: { setHeat: (h: number) => void } })
        .__SANDWALKER_V2__.setHeat(84);
    });

    await expect(page.locator('[data-testid="hud-heat-hint"]')).toHaveClass(/sweet-spot/);

    // Tap Sandwalker hull directly at (268, 305)
    await page.locator('[data-testid="game-canvas"]').click({ position: { x: 268, y: 305 } });

    await expect
      .poll(async () => (await readDebug(page)).combat.isOverdrive, { timeout: 3000 })
      .toBe(true);
    const overdriveState = await readDebug(page);
    expect(overdriveState.combat.mechFsmState).toBe('OVERDRIVE_VENT');
    expect(overdriveState.combat.heat).toBe(0);
    await expect(page.locator('[data-testid="hud-heat-hint"]')).toContainText('오버드라이브');

    // Verify 100 heat triggers forced cooling penalty
    await page.evaluate(() => {
      (window as unknown as { __SANDWALKER_V2__: { setHeat: (h: number) => void } })
        .__SANDWALKER_V2__.setHeat(100);
    });
    const coolState = await readDebug(page);
    expect(coolState.combat.forcedCoolRemainingSec).toBeGreaterThan(2.0);
    await expect(page.locator('[data-testid="hud-heat-hint"]')).toHaveClass(/forced-cool/);

    expect(errors).toEqual([]);
  });

  test('TC-V2-P2-03: Apophis Sandworm TELEGRAPH_WARN triggers Golden Counter Parry + STUN and Solar Shield [E]', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.setViewportSize({ width: 960, height: 540 });
    await page.goto('/');
    await startAndSkipStoryboard(page);

    await page.evaluate(() => {
      (window as unknown as { __SANDWALKER_V2__: { spawnBoss: (kind: string, x: number) => void } })
        .__SANDWALKER_V2__.spawnBoss('BOSS_SANDWORM', 640);
    });

    // Wait for SUBMERGE (2.5s) -> TELEGRAPH_WARN
    await expect
      .poll(async () => (await readDebug(page)).combat.sandwormState, { timeout: 6000 })
      .toBe('TELEGRAPH_WARN');

    const dodgeBtn = page.locator('[data-testid="btn-dodge"]');
    await expect(dodgeBtn).toHaveClass(/golden-ready/);

    // Trigger Golden Counter Parry via [Space] or dodge button
    await dodgeBtn.click();

    await expect
      .poll(async () => (await readDebug(page)).combat.sandwormState, { timeout: 3000 })
      .toBe('COUNTERED_STUN');
    expect((await readDebug(page)).combat.dodgeCooldownSec).toBeGreaterThan(2.5);

    // Activate Solar Shield via [E] key
    await page.keyboard.press('e');
    await expect
      .poll(async () => (await readDebug(page)).combat.isShieldActive, { timeout: 3000 })
      .toBe(true);

    expect(errors).toEqual([]);
  });
});
