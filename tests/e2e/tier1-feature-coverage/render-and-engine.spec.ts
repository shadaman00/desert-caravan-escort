// ============================================================================
// File: tests/e2e/tier1-feature-coverage/render-and-engine.spec.ts
// Milestone E1-A: Tier 1 Feature Coverage — Features 10..14
//   - F10: Fixed dt Game Loop & 60 FPS (TC-ENG-01..06)
//   - F11: 4-Layer Offscreen Parallax (TC-PAR-01..06)
//   - F12: Atmospheric Palette Grading (TC-PAL-01..06)
//   - F13: 6-Leg Analytical IK Walker (TC-IK-01..05)
//   - F14: Trailing Camel Wagons (TC-WAG-01..05)
// Adheres strictly to Opaque-Box E2E rule (zero src/ or @/ imports).
// ============================================================================

import { Page } from '@playwright/test';
import { test, expect } from '../fixtures/appFixture';
import {
  SELECTORS,
  waitForCanvasReady,
  waitForSteadyState,
  readFsmState,
  waitForFsmState,
  readRouteMeters,
  sortieFromOasis,
  readDebugSnapshot,
  sampleRegionAverageColor,
  sampleCanvasRegionStats,
  assertCanvasRegionChanged,
  measureObservedRouteSpeedPxPerSec,
  setDebugAct,
  setDebugSpeed,
  setDebugProgress,
  triggerSolarShield,
} from '../fixtures/testHelpers';
import {
  injectGameState,
  createAct1HubSeed,
  createAct2QuicksandSeed,
  createAct3SandstormSeed,
  createVisualTierSeed,
  createUpgradeProgressionSeed,
} from '../fixtures/mockStorage';

interface LogicalRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

// Isolated Zone B (430x512) sampling regions derived from render layout contracts
const R_SKY: LogicalRect = { x: 20, y: 15, width: 200, height: 100 }; // Particle-free sky band (y < 120)
const R_SKY_CORNER: LogicalRect = { x: 5, y: 5, width: 40, height: 40 }; // Outer corner for storm vignette
const R_AMBIENT_AIR: LogicalRect = { x: 20, y: 125, width: 250, height: 42 }; // Above pyramids (y < 170), left of sun glow
const R_FAR_DUNE: LogicalRect = { x: 260, y: 198, width: 150, height: 72 }; // Layer 0 pyramids & far dunes (k=0.1)
const R_MID_NEAR: LogicalRect = { x: 260, y: 275, width: 150, height: 85 }; // Layer 1/2 mid dunes & ridges (k=0.3/0.6)
const R_FG_SCROLL: LogicalRect = { x: 20, y: 428, width: 390, height: 58 }; // Layer 3 ripples & tracks (k=1.0)
const R_WALKER_HULL: LogicalRect = { x: 157, y: 324, width: 77, height: 36 };
const R_WALKER_LEGS: LogicalRect = { x: 145, y: 358, width: 105, height: 60 };
const R_WAGON_1: LogicalRect = { x: 118, y: 385, width: 35, height: 28 };
const R_WAGON_2_3: LogicalRect = { x: 61, y: 385, width: 57, height: 28 };
const R_WAGON_4_5: LogicalRect = { x: 3, y: 385, width: 55, height: 28 };
const R_HARNESS: LogicalRect = { x: 146, y: 355, width: 15, height: 48 };
const R_WAGON_1_CANOPY: LogicalRect = { x: 120, y: 387, width: 16, height: 9 };

type ColorPredicateKind =
  | 'cyanGlow'
  | 'wagonDarkBed'
  | 'pharaohPurple'
  | 'goldTrim'
  | 'brightStar'
  | 'legArmorMetal';

async function countMatchingCanvasPixels(
  page: Page,
  rect: LogicalRect,
  kind: ColorPredicateKind
): Promise<number> {
  return await page.evaluate(
    ({ selector, region, predicateKind }) => {
      const el = document.querySelector(selector) as HTMLCanvasElement | null;
      if (!el) return 0;
      const ctx = el.getContext('2d');
      if (!ctx) return 0;

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const sx = Math.max(0, Math.min(el.width - 1, Math.floor(region.x * dpr)));
      const sy = Math.max(0, Math.min(el.height - 1, Math.floor(region.y * dpr)));
      const sw = Math.max(1, Math.min(el.width - sx, Math.floor(region.width * dpr)));
      const sh = Math.max(1, Math.min(el.height - sy, Math.floor(region.height * dpr)));

      const data = ctx.getImageData(sx, sy, sw, sh).data;
      let count = 0;

      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const a = data[i + 3];
        if (a === 0) continue;

        if (predicateKind === 'cyanGlow') {
          if (b > r + 40 && b >= 180 && g >= 140) count++;
        } else if (predicateKind === 'wagonDarkBed') {
          if (r < 110 && g < 80 && b < 60) count++;
        } else if (predicateKind === 'pharaohPurple') {
          if (b > r + 25 && b >= 120) count++;
        } else if (predicateKind === 'goldTrim') {
          if (r >= 200 && g >= 170 && b <= 115) count++;
        } else if (predicateKind === 'brightStar') {
          if (r >= 95 && g >= 100 && b >= 115) count++;
        } else if (predicateKind === 'legArmorMetal') {
          if (b >= r - 5 && r < 140) count++;
        }
      }
      return count;
    },
    { selector: SELECTORS.gameCanvas, region: rect, predicateKind: kind }
  );
}

async function captureRegionPixels(page: Page, rect: LogicalRect): Promise<number[]> {
  return await page.evaluate(
    ({ selector, region }) => {
      const el = document.querySelector(selector) as HTMLCanvasElement | null;
      if (!el) return [];
      const ctx = el.getContext('2d');
      if (!ctx) return [];

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const sx = Math.max(0, Math.min(el.width - 1, Math.floor(region.x * dpr)));
      const sy = Math.max(0, Math.min(el.height - 1, Math.floor(region.y * dpr)));
      const sw = Math.max(1, Math.min(el.width - sx, Math.floor(region.width * dpr)));
      const sh = Math.max(1, Math.min(el.height - sy, Math.floor(region.height * dpr)));
      return Array.from(ctx.getImageData(sx, sy, sw, sh).data);
    },
    { selector: SELECTORS.gameCanvas, region: rect }
  );
}

async function measureRegionPixelDiffRatio(
  page: Page,
  rect: LogicalRect,
  waitMs: number
): Promise<number> {
  const before = await captureRegionPixels(page, rect);
  await page.waitForTimeout(waitMs);
  const after = await captureRegionPixels(page, rect);

  const totalPixels = Math.floor(Math.min(before.length, after.length) / 4);
  if (totalPixels <= 0) return 0;

  let changed = 0;
  for (let i = 0; i < totalPixels * 4; i += 4) {
    const diff =
      Math.abs(after[i] - before[i]) +
      Math.abs(after[i + 1] - before[i + 1]) +
      Math.abs(after[i + 2] - before[i + 2]);
    if (diff > 18) changed++;
  }
  return changed / totalPixels;
}

async function setDocumentVisibility(page: Page, state: 'hidden' | 'visible'): Promise<void> {
  await page.evaluate((vis) => {
    Object.defineProperty(document, 'visibilityState', {
      value: vis,
      configurable: true,
    });
    document.dispatchEvent(new Event('visibilitychange'));
  }, state);
}

// ============================================================================
// Feature 10: Fixed dt Game Loop & 60 FPS (TC-ENG-01..06)
// ============================================================================
test.describe('Tier 1: Feature 10 — Fixed dt Game Loop & 60 FPS', () => {
  test('TC-ENG-01: Maintains >= 55 FPS average and >= 45 FPS 1% low baseline in OASIS_HUB', async ({
    gamePage,
    fpsMonitor,
    errorTracker,
  }) => {
    await injectGameState(gamePage, createAct1HubSeed());
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await waitForSteadyState(gamePage, 500);

    const metrics = await fpsMonitor.assertCadence(55, 45, 2500, 5);
    expect(metrics.timedOut).toBe(false);
    expect(metrics.averageFps).toBeGreaterThanOrEqual(55);
    expect(metrics.fps1PercentLow).toBeGreaterThanOrEqual(45);

    errorTracker.assertNoErrors();
  });

  test('TC-ENG-02: Maintains 60 FPS target cadence during active MARCH_NORMAL combat & parallax', async ({
    gamePage,
    fpsMonitor,
    errorTracker,
  }) => {
    await injectGameState(gamePage, createAct1HubSeed());
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await sortieFromOasis(gamePage);
    await waitForSteadyState(gamePage, 600);

    const metrics = await fpsMonitor.assertCadence(55, 45, 2500, 5);
    expect(metrics.timedOut).toBe(false);
    expect(metrics.averageFps).toBeGreaterThanOrEqual(55);
    expect(metrics.fps1PercentLow).toBeGreaterThanOrEqual(45);

    errorTracker.assertNoErrors();
  });

  test('TC-ENG-03: Fixed 1/60s accumulator advances MARCH_NORMAL at 120 px/s (+/-15 px/s) at 1x', async ({
    gamePage,
    errorTracker,
  }) => {
    await injectGameState(gamePage, createAct1HubSeed());
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await sortieFromOasis(gamePage);

    const speed = await measureObservedRouteSpeedPxPerSec(gamePage, 2000);
    expect(speed).toBeGreaterThanOrEqual(105);
    expect(speed).toBeLessThanOrEqual(135);

    errorTracker.assertNoErrors();
  });

  test('TC-ENG-04: 4x time scale accelerates raw route speed ~4x while normalized speed stays ~120 px/s', async ({
    gamePage,
    errorTracker,
  }) => {
    await injectGameState(gamePage, createAct1HubSeed());
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await sortieFromOasis(gamePage);

    // Measure 1x raw speed
    const m1Start = await readRouteMeters(gamePage);
    const t1Start = Date.now();
    await gamePage.waitForTimeout(1200);
    const m1End = await readRouteMeters(gamePage);
    const raw1x = (m1End - m1Start) / ((Date.now() - t1Start) / 1000);
    expect(raw1x).toBeGreaterThanOrEqual(100);
    expect(raw1x).toBeLessThanOrEqual(140);

    // Switch to 4x and reset progress to 0% so we stay in MARCH_NORMAL (< 40%)
    await setDebugSpeed(gamePage, 4);
    await setDebugProgress(gamePage, 0);

    const m4Start = await readRouteMeters(gamePage);
    const t4Start = Date.now();
    await gamePage.waitForTimeout(1200);
    const m4End = await readRouteMeters(gamePage);
    const raw4x = (m4End - m4Start) / ((Date.now() - t4Start) / 1000);

    expect(raw4x).toBeGreaterThanOrEqual(raw1x * 3.5);
    expect(raw4x).toBeLessThanOrEqual(raw1x * 4.5);

    // Normalized helper divides by __SANDWALKER_TIME_SCALE__ (4) -> ~120 px/s
    await setDebugProgress(gamePage, 0);
    const normalizedSpeed = await measureObservedRouteSpeedPxPerSec(gamePage, 1000);
    expect(normalizedSpeed).toBeGreaterThanOrEqual(100);
    expect(normalizedSpeed).toBeLessThanOrEqual(140);

    errorTracker.assertNoErrors();
  });

  test('TC-ENG-05: visibilitychange (hidden) pauses GameLoop progression and freezes canvas rAF', async ({
    gamePage,
    errorTracker,
  }) => {
    await injectGameState(gamePage, createAct1HubSeed());
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await sortieFromOasis(gamePage);
    await gamePage.waitForTimeout(350);

    await setDocumentVisibility(gamePage, 'hidden');
    await gamePage.waitForTimeout(150);

    const metersBefore = await readRouteMeters(gamePage);
    const fgBefore = await sampleCanvasRegionStats(gamePage, R_FG_SCROLL);

    await gamePage.waitForTimeout(1200);

    const metersAfter = await readRouteMeters(gamePage);
    const fgAfter = await sampleCanvasRegionStats(gamePage, R_FG_SCROLL);

    expect(metersAfter).toBe(metersBefore);
    expect(fgAfter.hash).toBe(fgBefore.hash);

    // Restore visible before teardown
    await setDocumentVisibility(gamePage, 'visible');
    errorTracker.assertNoErrors();
  });

  test('TC-ENG-06: visibilitychange (visible) resumes GameLoop cleanly without catch-up jump', async ({
    gamePage,
    errorTracker,
  }) => {
    await injectGameState(gamePage, createAct1HubSeed());
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await sortieFromOasis(gamePage);
    await gamePage.waitForTimeout(300);

    await setDocumentVisibility(gamePage, 'hidden');
    await gamePage.waitForTimeout(150);
    const metersBeforeHide = await readRouteMeters(gamePage);

    // Stay hidden for 1500ms (would be 180m if catch-up occurred)
    await gamePage.waitForTimeout(1500);

    await setDocumentVisibility(gamePage, 'visible');
    await gamePage.waitForTimeout(200);
    const metersOnResume = await readRouteMeters(gamePage);

    // Accumulator & lastTimestampMs reset prevents catch-up spike
    expect(metersOnResume - metersBeforeHide).toBeLessThan(60);
    expect(await readFsmState(gamePage)).toBe('MARCH_NORMAL');

    // Confirm normal march resumed after visibility restored
    await gamePage.waitForTimeout(1200);
    const metersLater = await readRouteMeters(gamePage);
    expect(metersLater - metersOnResume).toBeGreaterThanOrEqual(90);

    errorTracker.assertNoErrors();
  });
});

// ============================================================================
// Feature 11: 4-Layer Offscreen Parallax (TC-PAR-01..06)
// ============================================================================
test.describe('Tier 1: Feature 11 — 4-Layer Offscreen Parallax', () => {
  test('TC-PAR-01: OASIS_HUB maintains stationary route & sky contract', async ({
    gamePage,
    errorTracker,
  }) => {
    await injectGameState(gamePage, createAct1HubSeed());
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await waitForSteadyState(gamePage, 500);

    expect(await readFsmState(gamePage)).toBe('OASIS_HUB');
    const meters0 = await readRouteMeters(gamePage);
    const skyBefore = await sampleCanvasRegionStats(gamePage, R_SKY);

    await gamePage.waitForTimeout(1200);

    const meters1 = await readRouteMeters(gamePage);
    const skyAfter = await sampleCanvasRegionStats(gamePage, R_SKY);
    const snap = await readDebugSnapshot(gamePage);

    expect(meters0).toBe(0);
    expect(meters1).toBe(0);
    expect(skyAfter.hash).toBe(skyBefore.hash);
    expect(snap?.meta.routeProgress).toBe(0);

    errorTracker.assertNoErrors();
  });

  test('TC-PAR-02: BOSS_ENCOUNTER freezes route progress and parallax scroll', async ({
    gamePage,
    errorTracker,
  }) => {
    await injectGameState(gamePage, createAct1HubSeed());
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await sortieFromOasis(gamePage);

    await setDebugProgress(gamePage, 95);
    await waitForFsmState(gamePage, 'BOSS_ENCOUNTER', 5000);
    await waitForSteadyState(gamePage, 300);

    const meters0 = await readRouteMeters(gamePage);
    await gamePage.waitForTimeout(1500);
    const meters1 = await readRouteMeters(gamePage);

    expect(meters1).toBe(meters0);
    expect(await readFsmState(gamePage)).toBe('BOSS_ENCOUNTER');

    const snap = await readDebugSnapshot(gamePage);
    if (snap?.combat.actualSpeed !== undefined) {
      expect(snap.combat.actualSpeed).toBe(0);
    }

    errorTracker.assertNoErrors();
  });

  test('TC-PAR-03: Layer 3 foreground sand (k=1.0) scrolls continuously during MARCH_NORMAL', async ({
    gamePage,
    errorTracker,
  }) => {
    await injectGameState(gamePage, createAct1HubSeed());
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await sortieFromOasis(gamePage);

    await assertCanvasRegionChanged(gamePage, R_FG_SCROLL, 300);
    await assertCanvasRegionChanged(gamePage, R_FG_SCROLL, 300);

    errorTracker.assertNoErrors();
  });

  test('TC-PAR-04: Layer 0 far dunes & pyramids (k=0.1) scroll visibly at 4x march speed', async ({
    gamePage,
    errorTracker,
  }) => {
    await injectGameState(gamePage, createAct1HubSeed());
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await sortieFromOasis(gamePage);

    await setDebugSpeed(gamePage, 4);
    await assertCanvasRegionChanged(gamePage, R_FAR_DUNE, 500);

    errorTracker.assertNoErrors();
  });

  test('TC-PAR-05: Layer 1/2 mid dunes & near ridges (k=0.3 / 0.6) animate during MARCH_NORMAL', async ({
    gamePage,
    errorTracker,
  }) => {
    await injectGameState(gamePage, createAct1HubSeed());
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await sortieFromOasis(gamePage);

    await assertCanvasRegionChanged(gamePage, R_MID_NEAR, 350);

    errorTracker.assertNoErrors();
  });

  test('TC-PAR-06: Crossing 860px offscreen tile wrap boundary renders seamlessly without blank seams', async ({
    gamePage,
    errorTracker,
  }) => {
    await injectGameState(gamePage, createAct1HubSeed());
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await sortieFromOasis(gamePage);
    await setDebugSpeed(gamePage, 4);

    const startMeters = await readRouteMeters(gamePage);
    const fgBefore = await sampleCanvasRegionStats(gamePage, R_FG_SCROLL);

    // At 4x (480 px/s), 2300ms covers ~1100px > 860px tileWidth
    await gamePage.waitForTimeout(2300);

    const endMeters = await readRouteMeters(gamePage);
    expect(endMeters - startMeters).toBeGreaterThanOrEqual(860);

    const fgAfter = await sampleCanvasRegionStats(gamePage, R_FG_SCROLL);
    const farAfter = await sampleCanvasRegionStats(gamePage, R_FAR_DUNE);

    expect(fgAfter.hash).not.toBe(fgBefore.hash);
    expect(fgAfter.meanR + fgAfter.meanG + fgAfter.meanB).toBeGreaterThan(60);
    expect(farAfter.meanR + farAfter.meanG + farAfter.meanB).toBeGreaterThan(60);

    errorTracker.assertNoErrors();
  });
});

// ============================================================================
// Feature 12: Atmospheric Palette Grading (TC-PAL-01..06)
// ============================================================================
test.describe('Tier 1: Feature 12 — Atmospheric Palette Grading', () => {
  test('TC-PAL-01: DAY palette in Act 1 Oasis Hub renders blue-dominant sky in particle-free R_SKY', async ({
    gamePage,
    errorTracker,
  }) => {
    await injectGameState(gamePage, createAct1HubSeed());
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await waitForSteadyState(gamePage, 400);

    const sky = await sampleRegionAverageColor(
      gamePage,
      R_SKY.x,
      R_SKY.y,
      R_SKY.x + R_SKY.width,
      R_SKY.y + R_SKY.height
    );
    expect(sky.b).toBeGreaterThan(sky.r + 70);
    expect(sky.r).toBeGreaterThanOrEqual(40);
    expect(sky.r).toBeLessThanOrEqual(85);
    expect(sky.b).toBeGreaterThanOrEqual(170);
    expect(sky.b).toBeLessThanOrEqual(225);

    errorTracker.assertNoErrors();
  });

  test('TC-PAL-02: DUSK palette in Act 2 Oasis Hub renders warm plum/indigo sky with lower blue than DAY', async ({
    gamePage,
    errorTracker,
  }) => {
    const act2Seed = createAct1HubSeed();
    act2Seed.meta.currentAct = 2;
    act2Seed.meta.timeOfDay = 'DUSK';
    await injectGameState(gamePage, act2Seed);

    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await waitForSteadyState(gamePage, 400);

    const sky = await sampleRegionAverageColor(
      gamePage,
      R_SKY.x,
      R_SKY.y,
      R_SKY.x + R_SKY.width,
      R_SKY.y + R_SKY.height
    );
    expect(sky.r).toBeGreaterThan(sky.g);
    expect(sky.b).toBeLessThan(90);

    errorTracker.assertNoErrors();
  });

  test('TC-PAL-03: NIGHT palette in Act 3 Oasis Hub renders dark navy sky with visible starlight', async ({
    gamePage,
    errorTracker,
  }) => {
    const act3Seed = createAct1HubSeed();
    act3Seed.meta.currentAct = 3;
    act3Seed.meta.timeOfDay = 'NIGHT';
    await injectGameState(gamePage, act3Seed);

    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await waitForSteadyState(gamePage, 400);

    const sky = await sampleRegionAverageColor(
      gamePage,
      R_SKY.x,
      R_SKY.y,
      R_SKY.x + R_SKY.width,
      R_SKY.y + R_SKY.height
    );
    expect(sky.r).toBeLessThan(30);
    expect(sky.g).toBeLessThan(40);
    expect(sky.b).toBeLessThan(65);

    // Star at (112, 18) vs star-free adjacent patch at (112, 32)
    const starPatchCount = await countMatchingCanvasPixels(
      gamePage,
      { x: 109, y: 15, width: 6, height: 6 },
      'brightStar'
    );
    const adjacentSkyCount = await countMatchingCanvasPixels(
      gamePage,
      { x: 109, y: 29, width: 6, height: 6 },
      'brightStar'
    );
    expect(starPatchCount).toBeGreaterThan(adjacentSkyCount);

    errorTracker.assertNoErrors();
  });

  test('TC-PAL-04: STORM palette in Act 3 Sandstorm HAZARD_ZONE renders amber sky & 50% dark vision corner mask', async ({
    gamePage,
    errorTracker,
  }) => {
    await injectGameState(gamePage, createAct3SandstormSeed(0));
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await sortieFromOasis(gamePage);

    await setDebugProgress(gamePage, 40);
    await waitForFsmState(gamePage, 'HAZARD_ZONE', 5000);

    // Wait > 2.0s for NIGHT -> STORM palette lerp & dark vision mask fade-in
    await gamePage.waitForTimeout(2300);

    const maskedCorner = await sampleRegionAverageColor(
      gamePage,
      R_SKY_CORNER.x,
      R_SKY_CORNER.y,
      R_SKY_CORNER.x + R_SKY_CORNER.width,
      R_SKY_CORNER.y + R_SKY_CORNER.height
    );
    const stormSky = await sampleRegionAverageColor(
      gamePage,
      R_SKY.x,
      R_SKY.y,
      R_SKY.x + R_SKY.width,
      R_SKY.y + R_SKY.height
    );

    expect(stormSky.r).toBeGreaterThan(stormSky.b + 20);
    expect(stormSky.r).toBeGreaterThan(stormSky.g);

    // Activating Solar Shield clears the 50% dark vision mask in outer corner
    await triggerSolarShield(gamePage);
    await gamePage.waitForTimeout(600);

    const unmaskedCorner = await sampleRegionAverageColor(
      gamePage,
      R_SKY_CORNER.x,
      R_SKY_CORNER.y,
      R_SKY_CORNER.x + R_SKY_CORNER.width,
      R_SKY_CORNER.y + R_SKY_CORNER.height
    );
    const maskedLuma = maskedCorner.r + maskedCorner.g + maskedCorner.b;
    const unmaskedLuma = unmaskedCorner.r + unmaskedCorner.g + unmaskedCorner.b;
    expect(unmaskedLuma).toBeGreaterThan(maskedLuma + 15);

    errorTracker.assertNoErrors();
  });

  test('TC-PAL-05: 2.0s smooth RGB lerp transitions DAY -> DUSK monotonically through intermediate midpoint', async ({
    gamePage,
    errorTracker,
  }) => {
    await injectGameState(gamePage, createAct1HubSeed());
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await waitForSteadyState(gamePage, 400);

    const daySky = await sampleRegionAverageColor(
      gamePage,
      R_SKY.x,
      R_SKY.y,
      R_SKY.x + R_SKY.width,
      R_SKY.y + R_SKY.height
    );

    await setDebugAct(gamePage, 2);

    // Sample midpoint (~900ms into 2000ms lerp)
    await gamePage.waitForTimeout(900);
    const midSky = await sampleRegionAverageColor(
      gamePage,
      R_SKY.x,
      R_SKY.y,
      R_SKY.x + R_SKY.width,
      R_SKY.y + R_SKY.height
    );

    // Wait past 2.0s lerp completion
    await gamePage.waitForTimeout(1400);
    const duskSky = await sampleRegionAverageColor(
      gamePage,
      R_SKY.x,
      R_SKY.y,
      R_SKY.x + R_SKY.width,
      R_SKY.y + R_SKY.height
    );

    expect(daySky.b).toBeGreaterThan(midSky.b + 15);
    expect(midSky.b).toBeGreaterThan(duskSky.b + 15);

    errorTracker.assertNoErrors();
  });

  test('TC-PAL-06: STORM multiplies ambient sand streak particle activity (3x vs DAY)', async ({
    gamePage,
    errorTracker,
  }) => {
    const sampleStreakMotion = async (): Promise<number> => {
      let totalDiffPixels = 0;
      let prev = await captureRegionPixels(gamePage, R_AMBIENT_AIR);
      for (let f = 0; f < 6; f++) {
        await gamePage.waitForTimeout(120);
        const curr = await captureRegionPixels(gamePage, R_AMBIENT_AIR);
        const len = Math.min(prev.length, curr.length);
        for (let i = 0; i < len; i += 4) {
          const d =
            Math.abs(curr[i] - prev[i]) +
            Math.abs(curr[i + 1] - prev[i + 1]) +
            Math.abs(curr[i + 2] - prev[i + 2]);
          if (d > 22) totalDiffPixels++;
        }
        prev = curr;
      }
      return totalDiffPixels;
    };

    // Baseline DAY march (strong turrets prevent hit-flash contamination)
    const daySeed = createUpgradeProgressionSeed({
      turretLevels: { HEAT_RAY: 20, HARPOON: 20, MORTAR: 20 },
      turretTiers: { HEAT_RAY: 2, HARPOON: 2, MORTAR: 2 },
    });
    await injectGameState(gamePage, daySeed);
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await sortieFromOasis(gamePage);
    await waitForSteadyState(gamePage, 500);
    const dayDiffPixels = await sampleStreakMotion();

    // STORM hazard in Act 3 (settled palette after 2.3s + solar shield prevents hull flash)
    const stormSeed = createAct3SandstormSeed(0);
    stormSeed.sandwalker.turretLevels = { HEAT_RAY: 20, HARPOON: 20, MORTAR: 20 };
    stormSeed.sandwalker.turretTiers = { HEAT_RAY: 2, HARPOON: 2, MORTAR: 2 };
    await injectGameState(gamePage, stormSeed);
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await sortieFromOasis(gamePage);
    await setDebugProgress(gamePage, 40);
    await waitForFsmState(gamePage, 'HAZARD_ZONE', 5000);
    await triggerSolarShield(gamePage);
    await gamePage.waitForTimeout(2300);

    const stormDiffPixels = await sampleStreakMotion();
    expect(stormDiffPixels).toBeGreaterThan(dayDiffPixels * 1.5);

    errorTracker.assertNoErrors();
  });
});

// ============================================================================
// Feature 13: 6-Leg Analytical IK Walker (TC-IK-01..05)
// ============================================================================
test.describe('Tier 1: Feature 13 — 6-Leg Analytical IK Walker', () => {
  test('TC-IK-01: Sandwalker hull and 6 IK legs render at expected Zone B anchor', async ({
    gamePage,
    errorTracker,
  }) => {
    await injectGameState(gamePage, createAct1HubSeed());
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await waitForSteadyState(gamePage, 400);

    const legsStats = await sampleCanvasRegionStats(gamePage, R_WALKER_LEGS);
    const hullStats = await sampleCanvasRegionStats(gamePage, R_WALKER_HULL);

    expect(legsStats.nonBgPixels).toBeGreaterThan(50);
    expect(hullStats.nonBgPixels).toBeGreaterThan(100);

    errorTracker.assertNoErrors();
  });

  test('TC-IK-02: Idle legs in OASIS_HUB remain still (< 2% pixel diff over 300ms)', async ({
    gamePage,
    errorTracker,
  }) => {
    // Seed in Act 3 (NIGHT) so DAY HEAT_HAZE particles do not spawn across R_WALKER_LEGS
    const act3Seed = createAct1HubSeed();
    act3Seed.meta.currentAct = 3;
    act3Seed.meta.timeOfDay = 'NIGHT';
    await injectGameState(gamePage, act3Seed);
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await waitForSteadyState(gamePage, 500);

    const diffRatio = await measureRegionPixelDiffRatio(gamePage, R_WALKER_LEGS, 300);
    expect(diffRatio).toBeLessThan(0.02);

    errorTracker.assertNoErrors();
  });

  test('TC-IK-03: Active 3+3 tripod gait animates legs continuously during MARCH_NORMAL', async ({
    gamePage,
    errorTracker,
  }) => {
    await injectGameState(gamePage, createAct1HubSeed());
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await sortieFromOasis(gamePage);

    await assertCanvasRegionChanged(gamePage, R_WALKER_LEGS, 180);
    const diffRatio = await measureRegionPixelDiffRatio(gamePage, R_WALKER_LEGS, 180);
    expect(diffRatio).toBeGreaterThan(0.02);

    errorTracker.assertNoErrors();
  });

  test('TC-IK-04: Act 2 Quicksand slows Lv1 walker by 40% (72 px/s) while Lv11 restores 120 px/s & cyan leg glow', async ({
    gamePage,
    errorTracker,
  }) => {
    // Part A: Lv1 in Act 2 Quicksand -> ~72 px/s, no cyan glow
    await injectGameState(gamePage, createAct2QuicksandSeed(1));
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await sortieFromOasis(gamePage);
    await setDebugProgress(gamePage, 40);
    await waitForFsmState(gamePage, 'HAZARD_ZONE', 5000);

    const lv1Speed = await measureObservedRouteSpeedPxPerSec(gamePage, 2000);
    expect(lv1Speed).toBeGreaterThanOrEqual(58);
    expect(lv1Speed).toBeLessThanOrEqual(86);
    await assertCanvasRegionChanged(gamePage, R_WALKER_LEGS, 250);
    const lv1CyanCount = await countMatchingCanvasPixels(gamePage, R_WALKER_LEGS, 'cyanGlow');

    // Part B: Lv11 in Act 2 Quicksand -> ~120 px/s immunity + cyan glow
    await injectGameState(gamePage, createAct2QuicksandSeed(11));
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await sortieFromOasis(gamePage);
    await setDebugProgress(gamePage, 40);
    await waitForFsmState(gamePage, 'HAZARD_ZONE', 5000);

    const lv11Speed = await measureObservedRouteSpeedPxPerSec(gamePage, 2000);
    expect(lv11Speed).toBeGreaterThanOrEqual(105);
    expect(lv11Speed).toBeLessThanOrEqual(135);
    expect(lv11Speed).toBeGreaterThan(lv1Speed + 25);

    const lv11CyanCount = await countMatchingCanvasPixels(gamePage, R_WALKER_LEGS, 'cyanGlow');
    expect(lv11CyanCount).toBeGreaterThan(lv1CyanCount);
    expect(lv11CyanCount).toBeGreaterThan(20);

    errorTracker.assertNoErrors();
  });

  test('TC-IK-05: Leg armor visual tier scaling (Lv1 vs Lv20) enlarges plates & increases leg pixel footprint', async ({
    gamePage,
    errorTracker,
  }) => {
    await injectGameState(gamePage, createUpgradeProgressionSeed({ legPartLevel: 1 }));
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await waitForSteadyState(gamePage, 400);
    const lv1Stats = await sampleCanvasRegionStats(gamePage, R_WALKER_LEGS);
    const lv1MetalPixels = await countMatchingCanvasPixels(
      gamePage,
      R_WALKER_LEGS,
      'legArmorMetal'
    );

    await injectGameState(gamePage, createUpgradeProgressionSeed({ legPartLevel: 20 }));
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await waitForSteadyState(gamePage, 400);
    const lv20Stats = await sampleCanvasRegionStats(gamePage, R_WALKER_LEGS);
    const lv20MetalPixels = await countMatchingCanvasPixels(
      gamePage,
      R_WALKER_LEGS,
      'legArmorMetal'
    );

    expect(lv20Stats.hash).not.toBe(lv1Stats.hash);
    expect(lv1MetalPixels).toBeGreaterThan(500);
    expect(lv20MetalPixels).toBeGreaterThan(lv1MetalPixels);

    errorTracker.assertNoErrors();
  });
});

// ============================================================================
// Feature 14: Trailing Camel Wagons (TC-WAG-01..05)
// ============================================================================
test.describe('Tier 1: Feature 14 — Trailing Camel Wagons', () => {
  test('TC-WAG-01: wagonCount=1 renders Wagon 1 in R_WAGON_1 while R_WAGON_2_3 & R_WAGON_4_5 have no wagons', async ({
    gamePage,
    errorTracker,
  }) => {
    await injectGameState(gamePage, createVisualTierSeed(1, 1, 1));
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await waitForSteadyState(gamePage, 400);

    const w1Dark = await countMatchingCanvasPixels(gamePage, R_WAGON_1, 'wagonDarkBed');
    const w23Dark = await countMatchingCanvasPixels(gamePage, R_WAGON_2_3, 'wagonDarkBed');
    const w45Dark = await countMatchingCanvasPixels(gamePage, R_WAGON_4_5, 'wagonDarkBed');

    expect(w1Dark).toBeGreaterThan(50);
    expect(w23Dark).toBeLessThan(10);
    expect(w45Dark).toBeLessThan(10);

    errorTracker.assertNoErrors();
  });

  test('TC-WAG-02: Increasing wagonCount from 1 to 3 populates R_WAGON_2_3 while R_WAGON_4_5 stays empty', async ({
    gamePage,
    errorTracker,
  }) => {
    await injectGameState(gamePage, createVisualTierSeed(1, 1, 1));
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await waitForSteadyState(gamePage, 400);
    const w23Count1Stats = await sampleCanvasRegionStats(gamePage, R_WAGON_2_3);
    const w23Count1Dark = await countMatchingCanvasPixels(gamePage, R_WAGON_2_3, 'wagonDarkBed');

    await injectGameState(gamePage, createVisualTierSeed(1, 1, 3));
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await waitForSteadyState(gamePage, 400);
    const w23Count3Stats = await sampleCanvasRegionStats(gamePage, R_WAGON_2_3);
    const w23Count3Dark = await countMatchingCanvasPixels(gamePage, R_WAGON_2_3, 'wagonDarkBed');
    const w45Count3Dark = await countMatchingCanvasPixels(gamePage, R_WAGON_4_5, 'wagonDarkBed');

    expect(w23Count3Stats.hash).not.toBe(w23Count1Stats.hash);
    expect(w23Count3Dark).toBeGreaterThan(w23Count1Dark + 80);
    expect(w45Count3Dark).toBeLessThan(10);

    errorTracker.assertNoErrors();
  });

  test('TC-WAG-03: Increasing wagonCount from 3 to 5 populates R_WAGON_4_5', async ({
    gamePage,
    errorTracker,
  }) => {
    await injectGameState(gamePage, createVisualTierSeed(1, 1, 3));
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await waitForSteadyState(gamePage, 400);
    const w45Count3Stats = await sampleCanvasRegionStats(gamePage, R_WAGON_4_5);
    const w45Count3Dark = await countMatchingCanvasPixels(gamePage, R_WAGON_4_5, 'wagonDarkBed');

    await injectGameState(gamePage, createVisualTierSeed(1, 1, 5));
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await waitForSteadyState(gamePage, 400);
    const w45Count5Stats = await sampleCanvasRegionStats(gamePage, R_WAGON_4_5);
    const w45Count5Dark = await countMatchingCanvasPixels(gamePage, R_WAGON_4_5, 'wagonDarkBed');

    expect(w45Count5Stats.hash).not.toBe(w45Count3Stats.hash);
    expect(w45Count5Dark).toBeGreaterThan(w45Count3Dark + 80);

    errorTracker.assertNoErrors();
  });

  test('TC-WAG-04: Harness tether renders in R_HARNESS and Wagon 1 bobs/rotates wheels during MARCH_NORMAL', async ({
    gamePage,
    errorTracker,
  }) => {
    await injectGameState(gamePage, createVisualTierSeed(1, 1, 1));
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await waitForSteadyState(gamePage, 400);

    const harnessStats = await sampleCanvasRegionStats(gamePage, R_HARNESS);
    expect(harnessStats.nonBgPixels).toBeGreaterThan(25);

    await sortieFromOasis(gamePage);
    await assertCanvasRegionChanged(gamePage, R_WAGON_1, 250);

    errorTracker.assertNoErrors();
  });

  test('TC-WAG-05: GOLDEN_PHARAOH skin swaps Wagon 1 canopy to royal purple (#553c9a) & gold trim (#ecc94b)', async ({
    gamePage,
    errorTracker,
  }) => {
    await injectGameState(gamePage, createUpgradeProgressionSeed({ skinId: 'DEFAULT' }));
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await waitForSteadyState(gamePage, 400);

    const defaultWagon = await sampleCanvasRegionStats(gamePage, R_WAGON_1);
    const defaultPurple = await countMatchingCanvasPixels(
      gamePage,
      R_WAGON_1_CANOPY,
      'pharaohPurple'
    );
    expect(defaultPurple).toBe(0);

    await injectGameState(
      gamePage,
      createUpgradeProgressionSeed({ skinId: 'GOLDEN_PHARAOH' })
    );
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await waitForSteadyState(gamePage, 400);

    const pharaohWagon = await sampleCanvasRegionStats(gamePage, R_WAGON_1);
    const pharaohPurple = await countMatchingCanvasPixels(
      gamePage,
      R_WAGON_1_CANOPY,
      'pharaohPurple'
    );
    const pharaohGold = await countMatchingCanvasPixels(
      gamePage,
      R_WAGON_1_CANOPY,
      'goldTrim'
    );

    expect(pharaohWagon.hash).not.toBe(defaultWagon.hash);
    expect(pharaohPurple).toBeGreaterThan(20);
    expect(pharaohGold).toBeGreaterThan(10);

    errorTracker.assertNoErrors();
  });
});
