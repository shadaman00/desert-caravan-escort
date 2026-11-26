// ============================================================================
// File: tests/e2e/v2/phase3-story-events-and-camp.spec.ts
// Phase 3 E2E Verification: 15s 3-Cut Storyboard, 300m Choice Event + 35-char
// Speech Bubble, 500m Oasis Slide-Up Camp, Auto-Upgrade Toggle & Save Persistence.
// Adheres strictly to Opaque-Box E2E rule (zero src/ or @/ imports).
// ============================================================================

import { test, expect, type Page } from '@playwright/test';

interface V2EconomySnap {
  hasSeenOpeningStoryboard: boolean;
  autoUpgradeEnabled: boolean;
  cargoValue: number;
  wagonCount: number;
  mapPieces: number;
  templeKeys: number;
  turretLevels: { TUR_01: number; TUR_02: number; TUR_03: number };
  unlockedTurrets: string[];
  legLevel: number;
  shieldLevel: number;
  nextEventDistance: number;
  nextOasisDistance: number;
  activeSpeechBubble: string | null;
  activeEventId: string | null;
  campOpen: boolean;
  tradeSettledThisStop: boolean;
}

async function readAll(page: Page) {
  return page.evaluate(() => {
    const api = (
      window as unknown as {
        __SANDWALKER_V2__: {
          getSnapshot: () => { scene: string; distanceMeters: number; gold: number; ancientGears: number };
          getCombatState: () => { mechFsmState: string };
          getEconomyState: () => V2EconomySnap;
        };
      }
    ).__SANDWALKER_V2__;
    return {
      snap: api.getSnapshot(),
      combat: api.getCombatState(),
      econ: api.getEconomyState(),
    };
  });
}

test.describe('Phase 3 (PRD v2.0 Landscape): Storyboard, 300m Events, 500m Oasis Camp & Save', () => {
  test('TC-V2-P3-01: Fresh launch plays 15s 3-cut Storyboard with Skip and persists first-launch flag across reload', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.setViewportSize({ width: 960, height: 540 });
    await page.goto('/');
    await page.locator('[data-testid="btn-start-expedition"]').click();

    const storyboard = page.locator('[data-testid="opening-storyboard"]');
    await expect(storyboard).toBeVisible();
    await expect(page.locator('[data-testid="storyboard-cut-indicator"]')).toHaveText('1 / 3');
    await expect(page.locator('[data-testid="storyboard-subtitle"]')).toContainText('태양의 신전');

    // Advance 5.1s -> Cut 2
    await page.evaluate(() => {
      (window as unknown as { __SANDWALKER_V2__: { advanceStoryboard: (dt: number) => void } })
        .__SANDWALKER_V2__.advanceStoryboard(5.1);
    });
    await expect(page.locator('[data-testid="storyboard-cut-indicator"]')).toHaveText('2 / 3');
    await expect(page.locator('[data-testid="storyboard-subtitle"]')).toContainText('괴충이 솟구쳤다');

    // Skip Storyboard -> enters EXPEDITION immediately and marks save
    await page.locator('[data-testid="btn-skip-storyboard"]').click();
    await expect(storyboard).toBeHidden();
    expect((await readAll(page)).snap.scene).toBe('EXPEDITION');
    expect((await readAll(page)).econ.hasSeenOpeningStoryboard).toBe(true);

    // Reload -> second launch skips storyboard directly into EXPEDITION
    await page.reload();
    await page.locator('[data-testid="btn-start-expedition"]').click();
    await expect(storyboard).toBeHidden();
    expect((await readAll(page)).snap.scene).toBe('EXPEDITION');
    expect(errors).toEqual([]);
  });

  test('TC-V2-P3-02: Crossing 300m pauses march (EVENT_PAUSE), applies choice reward, and shows <= 35-char bubble', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.setViewportSize({ width: 960, height: 540 });
    await page.goto('/');
    await page.locator('[data-testid="btn-start-expedition"]').click();
    await page.locator('[data-testid="btn-skip-storyboard"]').click();

    // Jump to 297m (nextEventDistance remains 300m) so natural rAF march crosses 300m
    await page.evaluate(() => {
      (window as unknown as { __SANDWALKER_V2__: { setDistance: (m: number) => void } })
        .__SANDWALKER_V2__.setDistance(297);
    });

    await expect(page.locator('[data-testid="event-choice-modal"]')).toBeVisible({ timeout: 5000 });
    expect((await readAll(page)).combat.mechFsmState).toBe('EVENT_PAUSE');
    await expect(page.locator('[data-testid="event-title"]')).toContainText('조난 상인');

    const beforeGears = (await readAll(page)).snap.ancientGears;
    await page.locator('[data-testid="event-choice-0"]').click();

    await expect(page.locator('[data-testid="event-choice-modal"]')).toBeHidden();
    const after = await readAll(page);
    expect(after.snap.scene).toBe('EXPEDITION');
    expect(after.snap.ancientGears).toBeGreaterThanOrEqual(beforeGears + 5);
    expect(after.econ.activeSpeechBubble).not.toBeNull();
    expect(Array.from(after.econ.activeSpeechBubble!).length).toBeLessThanOrEqual(35);
    expect(errors).toEqual([]);
  });

  test('TC-V2-P3-03: 500m Oasis Camp settles trade, upgrades parts, toggles auto-upgrade & persists on reload', async ({
    page,
  }) => {
    const errors: string[] = [];
    const failedResponses: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    page.on('response', (res) => {
      if (res.status() >= 400 && !res.url().endsWith('/favicon.ico')) {
        failedResponses.push(`${res.status()} ${res.url()}`);
      }
    });

    await page.setViewportSize({ width: 960, height: 540 });
    await page.goto('/');
    await page.locator('[data-testid="btn-start-expedition"]').click();
    await page.locator('[data-testid="btn-skip-storyboard"]').click();

    await page.evaluate(() => {
      (window as unknown as { __SANDWALKER_V2__: { openCampAt: (m: number) => void } })
        .__SANDWALKER_V2__.openCampAt(500);
    });

    const campModal = page.locator('[data-testid="oasis-camp-modal"]');
    await expect(campModal).toBeVisible();
    // At 500m (Zone 2 50% rate + Harun Lv1 5%): 200 * 1.55 = 310 G
    await expect(page.locator('[data-testid="camp-trade-profit"]')).toContainText('310 G');

    // Settle base trade (+310 G)
    const goldBeforeSettle = (await readAll(page)).snap.gold;
    await page.locator('[data-testid="btn-camp-settle"]').click();
    expect((await readAll(page)).snap.gold).toBe(goldBeforeSettle + 310);

    // Upgrade TUR_01 (100 G) and LEG_01 (100 G)
    await page.locator('[data-testid="btn-upgrade-TUR_01"]').click();
    await page.locator('[data-testid="btn-upgrade-LEG_01"]').click();
    const afterUpgrades = await readAll(page);
    expect(afterUpgrades.econ.turretLevels.TUR_01).toBe(2);
    expect(afterUpgrades.econ.legLevel).toBe(2);
    expect(afterUpgrades.econ.unlockedTurrets).toContain('TUR_02');

    // Enable Auto-Upgrade Toggle (spends surplus gold on cheapest available parts) and Depart
    const goldBeforeAuto = (await readAll(page)).snap.gold;
    await page.locator('[data-testid="toggle-auto-upgrade"]').click();
    const afterAuto = await readAll(page);
    expect(afterAuto.econ.autoUpgradeEnabled).toBe(true);
    expect(afterAuto.snap.gold).toBeLessThan(goldBeforeAuto);

    await page.locator('[data-testid="btn-camp-depart"]').click();
    await expect(campModal).toBeHidden();
    expect((await readAll(page)).snap.scene).toBe('EXPEDITION');

    // Verify full save persistence across reload
    await page.reload();
    const reloaded = await readAll(page);
    expect(reloaded.econ.hasSeenOpeningStoryboard).toBe(true);
    expect(reloaded.econ.turretLevels.TUR_01).toBeGreaterThanOrEqual(2);
    expect(reloaded.econ.legLevel).toBeGreaterThanOrEqual(2);
    expect(reloaded.econ.autoUpgradeEnabled).toBe(true);
    expect(reloaded.snap.distanceMeters).toBeGreaterThanOrEqual(500);

    expect(errors).toEqual([]);
    expect(failedResponses).toEqual([]);
  });
});
