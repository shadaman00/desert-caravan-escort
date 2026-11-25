import { test, expect } from '../fixtures/appFixture';
import {
  SELECTORS,
  waitForCanvasReady,
  setDebugSpeed,
  setDebugProgress,
  waitForFsmState,
  sortieFromOasis,
  triggerSolarShield,
} from '../fixtures/testHelpers';
import {
  injectGameState,
  createAct1HubSeed,
  createAct3SandstormSeed,
  createBossSeedForAct,
} from '../fixtures/mockStorage';

test.describe('Readability Stage 3: Hybrid Dual-Pass Pipeline, Tab Fit & Shortcut Legend Non-Overlap', () => {
  test('TC-READ-01: 1280x720 hides bottom shortcut legend to avoid [3] Mortar overlap; 1280x800 shows it cleanly in letterbox', async ({
    gamePage,
    errorTracker,
  }) => {
    await injectGameState(gamePage, createAct1HubSeed());

    // 1280x720 (100% viewport utilization -> no bottom letterbox space)
    await gamePage.setViewportSize({ width: 1280, height: 720 });
    await gamePage.goto('/?debug=0');
    await waitForCanvasReady(gamePage, 10000);
    const legend = gamePage.locator('.desktop-shortcut-legend').first();
    await expect(legend).not.toBeVisible();

    // 1280x800 (letterbox space >= 40px top/bottom -> visible strictly below viewport-shell)
    await gamePage.setViewportSize({ width: 1280, height: 800 });
    await gamePage.waitForTimeout(150);
    await expect(legend).toBeVisible();

    const boxes = await gamePage.evaluate(() => {
      const lRect = document.querySelector('.desktop-shortcut-legend')?.getBoundingClientRect();
      const sRect = document.querySelector('[data-testid="viewport-shell"]')?.getBoundingClientRect();
      const mRect = document.querySelector('[data-testid="turret-btn-mortar"]')?.getBoundingClientRect();
      return {
        legendTop: lRect?.top ?? 0,
        shellBottom: sRect?.bottom ?? 0,
        mortarBottom: mRect?.bottom ?? 0,
      };
    });
    expect(boxes.legendTop).toBeGreaterThanOrEqual(boxes.mortarBottom - 1);
    expect(boxes.legendTop).toBeGreaterThanOrEqual(boxes.shellBottom - 4);

    errorTracker.assertNoErrors();
  });

  test('TC-READ-02: All 4 Zone C growth tabs fit inside 280px side panel without clipping or overflow', async ({
    gamePage,
    errorTracker,
  }) => {
    await injectGameState(gamePage, createAct1HubSeed());
    await gamePage.goto('/?debug=0');
    await waitForCanvasReady(gamePage, 10000);

    const tabMetrics = await gamePage.evaluate(() => {
      const container = document.querySelector('.zone-c-tabs');
      const cRect = container?.getBoundingClientRect();
      const btns = Array.from(document.querySelectorAll('.zone-c-tabs .tab-btn'));
      return {
        containerWidth: cRect?.width ?? 0,
        tabs: btns.map((btn) => {
          const r = btn.getBoundingClientRect();
          return {
            text: btn.textContent?.trim() ?? '',
            scrollWidth: btn.scrollWidth,
            clientWidth: btn.clientWidth,
            rightEdgeOk: cRect ? r.right <= cRect.right + 1 : false,
          };
        }),
      };
    });

    expect(tabMetrics.tabs).toHaveLength(4);
    for (const tab of tabMetrics.tabs) {
      expect(tab.scrollWidth).toBeLessThanOrEqual(tab.clientWidth + 1);
      expect(tab.rightEdgeOk).toBe(true);
    }

    errorTracker.assertNoErrors();
  });

  test('TC-READ-03: Hybrid dual-pass renders crisp Solar Shield dome & Act 4 boss telegraph with AC-01 zero external assets', async ({
    gamePage,
    assetTracker,
    errorTracker,
  }) => {
    // Act 3 Sandstorm + Solar Shield
    await injectGameState(gamePage, createAct3SandstormSeed(0));
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await sortieFromOasis(gamePage);
    await setDebugProgress(gamePage, 40);
    await waitForFsmState(gamePage, 'HAZARD_ZONE', 5000);
    await triggerSolarShield(gamePage);
    await gamePage.waitForTimeout(250);

    const canvasState = await gamePage.evaluate((sel) => {
      const canvas = document.querySelector(sel) as HTMLCanvasElement | null;
      const ctx = canvas?.getContext('2d');
      return {
        smoothing: ctx?.imageSmoothingEnabled ?? true,
        imageRendering: canvas ? getComputedStyle(canvas).imageRendering : '',
      };
    }, SELECTORS.gameCanvas);
    expect(canvasState.smoothing).toBe(false);
    expect(canvasState.imageRendering).toMatch(/pixelated|crisp-edges/i);

    // Act 4 Sandworm Boss + Telegraph
    await injectGameState(gamePage, createBossSeedForAct(4, { turretLevel: 1 }));
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await sortieFromOasis(gamePage);
    await setDebugSpeed(gamePage, 4);
    await setDebugProgress(gamePage, 95);
    await waitForFsmState(gamePage, 'BOSS_ENCOUNTER', 8000);
    await gamePage.waitForTimeout(900);
    await setDebugSpeed(gamePage, 1);

    await expect(gamePage.locator(SELECTORS.bossHud).first()).toBeVisible();
    assetTracker.assertZeroAssets();
    errorTracker.assertNoErrors();
  });
});
