// ============================================================================
// File: tests/e2e/tier1-feature-coverage/viewport-and-layout.spec.ts
// Milestone E1: Viewport, 3-Zone Layout & Infrastructure Smoke Test
// Validates F1 (3-Zone Viewport Split), F15 (Zone B Canvas), F36 (UI Layout)
// Adheres strictly to AC-01 Zero-Asset and 430x932 logical resolution
// ============================================================================

import { test, expect } from '../fixtures/appFixture';
import {
  SELECTORS,
  waitForCanvasReady,
  waitForSteadyState,
  assert3ZoneLayout,
  assertCanvasRegionChanged,
  sampleCanvasRegionStats,
  readZoneAHud,
  readDebugSnapshot,
  selectDashboardTab,
  openDebugBar,
  mercCardSelector,
} from '../fixtures/testHelpers';
import {
  injectGameState,
  createAct1HubSeed,
  createAllMercenariesSeed,
  createOpeningHookSeed,
} from '../fixtures/mockStorage';

test.describe('Tier 1: Viewport & Layout Infrastructure Suite', () => {
  test.beforeEach(async ({ gamePage }) => {
    // Seed initial Act 1 Hub state before page navigation
    const state = createAct1HubSeed();
    await injectGameState(gamePage, state);
  });

  test('TC-VPORT-01: App container loads at 960x540 logical landscape viewport with zero external image assets (F1, AC-01)', async ({
    gamePage,
    assetTracker,
  }) => {
    await gamePage.goto('/');

    // Verify page title
    await expect(gamePage).toHaveTitle(/사막 캐러밴 호위대|Sandwalker/i);

    // Verify zero image asset requests occurred during navigation
    const requests = assetTracker.getRequests();
    expect(requests.length).toBe(0);
    assetTracker.assertZeroAssets();

    // Verify root viewport container exists
    const appRoot = gamePage.locator(SELECTORS.appRoot).first();
    await expect(appRoot).toBeVisible({ timeout: 10000 });
  });

  test('TC-VPORT-02: 3-Zone L-Shape landscape layout partition integrity (Zone A, Zone B, Zone C-1 Tactical, Zone C) (F1)', async ({
    gamePage,
  }) => {
    await gamePage.goto('/');

    // Assert strict L-Shape 3-Zone layout
    await assert3ZoneLayout(gamePage);

    const zoneA = gamePage.locator(SELECTORS.zoneA).first();
    const zoneB = gamePage.locator(SELECTORS.zoneB).first();
    const zoneC = gamePage.locator(SELECTORS.zoneC).first();
    const zoneTac = gamePage.locator(SELECTORS.zoneCTactical).first();

    const boxA = await zoneA.boundingBox();
    const boxB = await zoneB.boundingBox();
    const boxC = await zoneC.boundingBox();
    const boxTac = await zoneTac.boundingBox();

    expect(boxA).not.toBeNull();
    expect(boxB).not.toBeNull();
    expect(boxC).not.toBeNull();
    expect(boxTac).not.toBeNull();

    if (boxA && boxB && boxC && boxTac) {
      const shellBox = await gamePage.locator(SELECTORS.viewportShell).first().boundingBox();
      const scale = shellBox && shellBox.width > 0 ? shellBox.width / 960 : 1;

      const logicalWidthA = boxA.width / scale;
      const logicalWidthB = boxB.width / scale;
      const logicalWidthC = boxC.width / scale;
      const logicalWidthTac = boxTac.width / scale;
      const logicalHeightA = boxA.height / scale;
      const logicalHeightB = boxB.height / scale;
      const logicalHeightC = boxC.height / scale;
      const logicalHeightTac = boxTac.height / scale;

      expect(logicalWidthA).toBeCloseTo(960, 0);
      expect(logicalWidthB).toBeCloseTo(680, 0);
      expect(logicalWidthTac).toBeCloseTo(680, 0);
      expect(logicalWidthC).toBeCloseTo(280, 0);

      expect(logicalHeightA).toBeCloseTo(56, 0);
      expect(logicalHeightB).toBeCloseTo(412, 0);
      expect(logicalHeightTac).toBeCloseTo(72, 0);
      expect(logicalHeightC).toBeCloseTo(484, 0);
      expect(logicalHeightA + logicalHeightB + logicalHeightTac).toBeCloseTo(540, 0);
    }
  });

  test('TC-VPORT-03: Zone B canvas mounts and initializes rendering context (F15)', async ({
    gamePage,
  }) => {
    await gamePage.goto('/');

    // Verify game canvas is visible and painted
    await waitForCanvasReady(gamePage, 10000);

    const canvas = gamePage.locator(SELECTORS.gameCanvas).first();
    await expect(canvas).toBeVisible();

    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    if (box) {
      expect(box.width).toBeGreaterThan(0);
      expect(box.height).toBeGreaterThan(0);
    }
  });

  test('TC-VPORT-04: rAF frame profiler captures valid 60 FPS performance metrics (AC-01)', async ({
    gamePage,
    fpsMonitor,
  }) => {
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await waitForSteadyState(gamePage, 500);

    // Measure and assert 60 FPS cadence over 4000ms with 0 warmup frames
    const metrics = await fpsMonitor.assertCadence(55, 45, 4000, 0);

    expect(metrics.timedOut).toBe(false);
    expect(metrics.frameCount).toBeGreaterThan(0);
    expect(metrics.durationMs).toBeGreaterThanOrEqual(3800);
    expect(metrics.averageFps).toBeGreaterThanOrEqual(55);
    expect(metrics.fps1PercentLow).toBeGreaterThanOrEqual(45);
    expect(metrics.sampleFrameIntervalsMs.length).toBeGreaterThan(0);
  });

  test('TC-VPORT-05: Zero uncaught runtime or console errors occur during viewport lifecycle (AC-01)', async ({
    gamePage,
    errorTracker,
  }) => {
    await gamePage.goto('/');

    // Wait for canvas ready and settle
    await waitForCanvasReady(gamePage, 10000);

    // Verify errorTracker reports 0 unhandled errors
    const errors = errorTracker.getAllErrors();
    expect(errors.length).toBe(0);
    errorTracker.assertNoErrors();
  });
});


test.describe('Tier 1: Viewport, Zone B Canvas & UI Dashboard Coverage (F1, F15, F36)', () => {
  test('TC-VPORT-06: Small viewport letterbox scaling (480x320) fits without scrollbars (F1)', async ({
    gamePage,
  }) => {
    await injectGameState(gamePage, createAct1HubSeed());
    await gamePage.setViewportSize({ width: 480, height: 320 });
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);

    const shell = gamePage.locator(SELECTORS.viewportShell).first();
    const expectedScale = Math.min(480 / 960, 320 / 540);
    await expect
      .poll(async () => (await shell.boundingBox())?.width ?? 0, { timeout: 5000 })
      .toBeCloseTo(960 * expectedScale, 0);

    const box = await shell.boundingBox();
    expect(box).not.toBeNull();
    if (box) {
      expect(Math.abs(box.width - 480)).toBeLessThanOrEqual(2);
      expect(Math.abs(box.height - 540 * expectedScale)).toBeLessThanOrEqual(2);
      expect(box.x).toBeGreaterThanOrEqual(-1);
      expect(box.x).toBeLessThanOrEqual(1);
    }

    const scrollMetrics = await gamePage.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      scrollHeight: document.documentElement.scrollHeight,
    }));
    expect(scrollMetrics.scrollWidth).toBeLessThanOrEqual(480);
    expect(scrollMetrics.scrollHeight).toBeLessThanOrEqual(320);
  });

  test('TC-VPORT-07: Wide desktop viewport letterbox scaling (1280x640) centers 960:540 shell (F1)', async ({
    gamePage,
  }) => {
    await injectGameState(gamePage, createAct1HubSeed());
    await gamePage.setViewportSize({ width: 1280, height: 640 });
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);

    const shell = gamePage.locator(SELECTORS.viewportShell).first();
    const expectedScale = Math.min(1280 / 960, 640 / 540);
    await expect
      .poll(async () => (await shell.boundingBox())?.height ?? 0, { timeout: 5000 })
      .toBeCloseTo(540 * expectedScale, 0);

    const box = await shell.boundingBox();
    expect(box).not.toBeNull();
    if (box) {
      expect(Math.abs(box.height - 640)).toBeLessThanOrEqual(2);
      expect(Math.abs(box.width - 960 * expectedScale)).toBeLessThanOrEqual(2);
      const centerX = box.x + box.width / 2;
      expect(Math.abs(centerX - 640)).toBeLessThanOrEqual(2);
      expect(Math.abs(box.width / box.height - 960 / 540)).toBeLessThan(0.01);
    }
  });

  test('TC-VPORT-08: Dynamic viewport resize updates uniform scale and preserves L-Shape 3-Zone layout (F1)', async ({
    gamePage,
  }) => {
    await injectGameState(gamePage, createAct1HubSeed());
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);

    const viewports = [
      { width: 960, height: 540 },
      { width: 640, height: 360 },
      { width: 1280, height: 800 },
    ];

    const shell = gamePage.locator(SELECTORS.viewportShell).first();
    const zoneA = gamePage.locator(SELECTORS.zoneA).first();
    const zoneB = gamePage.locator(SELECTORS.zoneB).first();
    const zoneC = gamePage.locator(SELECTORS.zoneC).first();

    for (const vp of viewports) {
      await gamePage.setViewportSize(vp);
      const expectedScale = Math.min(vp.width / 960, vp.height / 540);

      await expect
        .poll(async () => (await shell.boundingBox())?.width ?? 0, { timeout: 5000 })
        .toBeCloseTo(960 * expectedScale, 0);

      await assert3ZoneLayout(gamePage);

      const boxA = await zoneA.boundingBox();
      const boxB = await zoneB.boundingBox();
      const boxC = await zoneC.boundingBox();
      expect(boxA).not.toBeNull();
      expect(boxB).not.toBeNull();
      expect(boxC).not.toBeNull();
      if (boxA && boxB && boxC) {
        expect(Math.abs(boxA.height - 56 * expectedScale)).toBeLessThanOrEqual(2.5);
        expect(Math.abs(boxB.height - 412 * expectedScale)).toBeLessThanOrEqual(2.5);
        expect(Math.abs(boxC.height - 484 * expectedScale)).toBeLessThanOrEqual(2.5);
      }
    }
  });

  test('TC-VPORT-09: Zone B canvas enforces DPR backing store cap <= 2 (1360x824 at DPR 2) (F15)', async ({
    gamePage,
  }) => {
    await injectGameState(gamePage, createAct1HubSeed());
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);

    const metrics = await gamePage.evaluate((selector) => {
      const el = document.querySelector(selector) as HTMLCanvasElement | null;
      if (!el) return null;
      const cs = window.getComputedStyle(el);
      return {
        dpr: window.devicePixelRatio || 1,
        width: el.width,
        height: el.height,
        cssWidth: parseFloat(cs.width),
        cssHeight: parseFloat(cs.height),
      };
    }, SELECTORS.gameCanvas);

    expect(metrics).not.toBeNull();
    if (metrics) {
      const cappedDpr = Math.min(metrics.dpr, 2);
      expect(cappedDpr).toBeLessThanOrEqual(2);
      expect(metrics.width).toBe(Math.round(680 * cappedDpr));
      expect(metrics.height).toBe(Math.round(412 * cappedDpr));
      expect(metrics.cssWidth).toBeCloseTo(680, 0);
      expect(metrics.cssHeight).toBeCloseTo(412, 0);
    }
  });

  test('TC-VPORT-10: Zone B canvas renders multi-band procedural scene and animates while marching (F15)', async ({
    gamePage,
  }) => {
    await injectGameState(gamePage, createOpeningHookSeed(), { introSeen: false });
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await waitForSteadyState(gamePage, 300);

    const skyBand = await sampleCanvasRegionStats(gamePage, { x: 20, y: 12, width: 320, height: 65 });
    const groundBand = await sampleCanvasRegionStats(gamePage, {
      x: 40,
      y: 245,
      width: 580,
      height: 145,
    });

    expect(skyBand.meanR + skyBand.meanG + skyBand.meanB).toBeGreaterThan(30);
    expect(groundBand.meanR + groundBand.meanG + groundBand.meanB).toBeGreaterThan(30);
    const bandColorDelta =
      Math.abs(skyBand.meanR - groundBand.meanR) +
      Math.abs(skyBand.meanG - groundBand.meanG) +
      Math.abs(skyBand.meanB - groundBand.meanB);
    expect(bandColorDelta).toBeGreaterThan(5);

    await assertCanvasRegionChanged(gamePage, { x: 40, y: 245, width: 580, height: 145 }, 450);
  });

  test('TC-VPORT-11: Zone B pointer drag renders aim-reticle clamped to [0..680, 0..412] and hides on pointerup (F15)', async ({
    gamePage,
  }) => {
    await injectGameState(gamePage, createAct1HubSeed());
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);

    const canvas = gamePage.locator(SELECTORS.gameCanvas).first();
    const zoneB = gamePage.locator(SELECTORS.zoneB).first();
    const box = await canvas.boundingBox();
    const zoneBBox = await zoneB.boundingBox();
    expect(box).not.toBeNull();
    expect(zoneBBox).not.toBeNull();

    if (box && zoneBBox) {
      await gamePage.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.4);
      await gamePage.mouse.down();

      const reticle = gamePage.locator(SELECTORS.aimReticle).first();
      await expect(reticle).toBeVisible({ timeout: 3000 });

      // Drag past top-left and bottom-right canvas bounds to genuinely exercise [0..680, 0..412] clamping
      await gamePage.mouse.move(box.x - 40, box.y - 40, { steps: 4 });
      const minCoords = await reticle.evaluate((el) => ({
        left: parseFloat((el as HTMLElement).style.left || '0'),
        top: parseFloat((el as HTMLElement).style.top || '0'),
      }));
      expect(minCoords.left).toBeGreaterThanOrEqual(0);
      expect(minCoords.top).toBeGreaterThanOrEqual(0);
      expect(minCoords.left).toBeCloseTo(0, 0);
      expect(minCoords.top).toBeCloseTo(0, 0);

      await gamePage.mouse.move(box.x + box.width + 40, box.y + box.height + 40, { steps: 6 });

      const styleCoords = await reticle.evaluate((el) => ({
        left: parseFloat((el as HTMLElement).style.left || '0'),
        top: parseFloat((el as HTMLElement).style.top || '0'),
      }));
      expect(styleCoords.left).toBeGreaterThanOrEqual(0);
      expect(styleCoords.left).toBeLessThanOrEqual(680);
      expect(styleCoords.top).toBeGreaterThanOrEqual(0);
      expect(styleCoords.top).toBeLessThanOrEqual(412);
      expect(styleCoords.left).toBeCloseTo(680, 0);
      expect(styleCoords.top).toBeCloseTo(412, 0);

      const retBox = await reticle.boundingBox();
      expect(retBox).not.toBeNull();
      if (retBox) {
        const retCenterX = retBox.x + retBox.width / 2;
        const retCenterY = retBox.y + retBox.height / 2;
        expect(retCenterX).toBeGreaterThanOrEqual(zoneBBox.x - 2);
        expect(retCenterX).toBeLessThanOrEqual(zoneBBox.x + zoneBBox.width + 2);
        expect(retCenterY).toBeGreaterThanOrEqual(zoneBBox.y - 2);
        expect(retCenterY).toBeLessThanOrEqual(zoneBBox.y + zoneBBox.height + 2);
      }

      await gamePage.mouse.up();
      await expect(reticle).toBeHidden({ timeout: 3000 });
    }
  });

  test('TC-VPORT-12: Zone A HUD renders route, Act, progress, HP, 4 currencies and badges within Zone A bounds (F36)', async ({
    gamePage,
  }) => {
    await injectGameState(gamePage, createAct1HubSeed());
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);

    const hudSelectors = [
      SELECTORS.hudOasisName,
      SELECTORS.hudActBadge,
      SELECTORS.hudRouteProgress,
      SELECTORS.hudSandwalkerHp,
      SELECTORS.hudSunGold,
      SELECTORS.hudAncientGear,
      SELECTORS.hudMapFragments,
      SELECTORS.hudTempleKeys,
      SELECTORS.hudSurgeBadge,
      SELECTORS.hudAdTierBadge,
      SELECTORS.hudFsmBadge,
    ];

    const shellBox = await gamePage.locator(SELECTORS.viewportShell).first().boundingBox();
    expect(shellBox).not.toBeNull();

    if (shellBox) {
      const scale = shellBox.width / 960;
      for (const sel of hudSelectors) {
        const loc = gamePage.locator(sel).first();
        await expect(loc).toBeVisible();
        const b = await loc.boundingBox();
        expect(b).not.toBeNull();
        if (b) {
          const logicalLeft = (b.x - shellBox.x) / scale;
          const logicalRight = (b.x + b.width - shellBox.x) / scale;
          const logicalTop = (b.y - shellBox.y) / scale;
          const logicalBottom = (b.y + b.height - shellBox.y) / scale;
          expect(logicalLeft).toBeGreaterThanOrEqual(-1);
          expect(logicalRight).toBeLessThanOrEqual(961);
          expect(logicalTop).toBeGreaterThanOrEqual(-1);
          expect(logicalBottom).toBeLessThanOrEqual(57);
        }
      }
    }

    const hud = await readZoneAHud(gamePage);
    expect(hud.oasisName.length).toBeGreaterThan(0);
    expect(hud.actText).toContain('1');
    expect(hud.sunGold).toBe(300);
    expect(hud.ancientGear).toBe(5);
    expect(hud.mapFragments).toBe(1);
    expect(hud.adTierBadge).toContain('T0');
    expect(hud.fsmState).toBe('OASIS_HUB');
  });

  test('TC-VPORT-13: Zone A Synergy badge toggles cleanly between <5 and 5/5 unlocked mercenaries (F36)', async ({
    gamePage,
  }) => {
    await injectGameState(gamePage, createAct1HubSeed());
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);

    const synergyBadge = gamePage.locator(SELECTORS.hudSynergyBadge);
    await expect(synergyBadge).toHaveCount(0);

    await injectGameState(gamePage, createAllMercenariesSeed());
    await gamePage.reload();
    await waitForCanvasReady(gamePage, 10000);

    await expect(synergyBadge.first()).toBeVisible({ timeout: 5000 });
    await expect(synergyBadge.first()).toContainText(/결속|25%/);
  });

  test('TC-VPORT-14: Zone C Tactical Bar renders 3 turrets + Dodge + Shield and updates active turret & cooldown bar (F36)', async ({
    gamePage,
  }) => {
    await injectGameState(gamePage, createOpeningHookSeed(), { introSeen: false });
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);

    const heatRayBtn = gamePage.locator(SELECTORS.turretBtnHeatRay).first();
    const harpoonBtn = gamePage.locator(SELECTORS.turretBtnHarpoon).first();
    const mortarBtn = gamePage.locator(SELECTORS.turretBtnMortar).first();
    const dodgeBtn = gamePage.locator(SELECTORS.dodgeBoostBtn).first();
    const shieldBtn = gamePage.locator(SELECTORS.solarShieldBtn).first();

    await expect(heatRayBtn).toBeVisible();
    await expect(harpoonBtn).toBeVisible();
    await expect(mortarBtn).toBeVisible();
    await expect(dodgeBtn).toBeVisible();
    await expect(shieldBtn).toBeVisible();
    await expect(heatRayBtn).toHaveClass(/active/);

    await harpoonBtn.click();
    await expect(harpoonBtn).toHaveClass(/active/);
    await expect(heatRayBtn).not.toHaveClass(/active/);

    const cooldownBar = harpoonBtn.locator(SELECTORS.turretCooldownBadge).first();
    await expect(cooldownBar).toBeVisible({ timeout: 2000 });

    const snapAfterHarpoon = await readDebugSnapshot(gamePage);
    expect(snapAfterHarpoon?.sandwalker.activeTurret).toBe('HARPOON');

    await expect
      .poll(async () => (await readDebugSnapshot(gamePage))?.combat.switchCooldownRemaining ?? 1, {
        timeout: 3000,
      })
      .toBe(0);
    await mortarBtn.click();
    await expect(mortarBtn).toHaveClass(/active/);
    const snapAfterMortar = await readDebugSnapshot(gamePage);
    expect(snapAfterMortar?.sandwalker.activeTurret).toBe('MORTAR');
  });

  test('TC-VPORT-15: Zone C 4 Growth Tabs switch cleanly inside right side panel bounds (x:680..960, y:56..540) and list 5 mercenaries + synergy status (F36)', async ({
    gamePage,
  }) => {
    await injectGameState(gamePage, createAct1HubSeed());
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);

    const shellBox = await gamePage.locator(SELECTORS.viewportShell).first().boundingBox();
    expect(shellBox).not.toBeNull();
    const scale = shellBox ? shellBox.width / 960 : 1;

    const tabs: Array<{
      tab: 'mech' | 'mercenaries' | 'trading' | 'codex';
      btnSelector: string;
      expectedText: RegExp;
    }> = [
        { tab: 'mech', btnSelector: SELECTORS.tabBtnMech, expectedText: /기체 개조|Mech/ },
        { tab: 'mercenaries', btnSelector: SELECTORS.tabBtnMercenaries, expectedText: /5인 용병단|Mercenar/ },
        { tab: 'trading', btnSelector: SELECTORS.tabBtnTrading, expectedText: /상단 교역소|Trading/ },
        { tab: 'codex', btnSelector: SELECTORS.tabBtnCodex, expectedText: /유물·비석 도감|Codex/ },
      ];

    const content = gamePage.locator('.zone-c-content').first();
    for (const entry of tabs) {
      await selectDashboardTab(gamePage, entry.tab);
      await expect(gamePage.locator(entry.btnSelector).first()).toHaveClass(/active/);
      await expect(content).toContainText(entry.expectedText);

      const cBox = await content.boundingBox();
      expect(cBox).not.toBeNull();
      if (cBox && shellBox) {
        const logicalLeft = (cBox.x - shellBox.x) / scale;
        const logicalRight = (cBox.x + cBox.width - shellBox.x) / scale;
        const logicalTop = (cBox.y - shellBox.y) / scale;
        const logicalBottom = (cBox.y + cBox.height - shellBox.y) / scale;
        expect(logicalLeft).toBeGreaterThanOrEqual(679);
        expect(logicalRight).toBeLessThanOrEqual(961);
        expect(logicalTop).toBeGreaterThanOrEqual(94);
        expect(logicalBottom).toBeLessThanOrEqual(541);
      }
    }

    await selectDashboardTab(gamePage, 'mercenaries');
    await expect(gamePage.locator(SELECTORS.mercenarySynergyStatus).first()).toBeVisible();
    for (const id of ['harun', 'sera', 'zara', 'tarik', 'lili']) {
      await expect(gamePage.locator(mercCardSelector(id)).first()).toBeVisible();
    }
  });

  test('TC-VPORT-16: Zone C content vertical scroll stays contained without expanding 484px Zone C height (F36)', async ({
    gamePage,
  }) => {
    await injectGameState(gamePage, createAct1HubSeed());
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);

    await selectDashboardTab(gamePage, 'mercenaries');

    const shellBox = await gamePage.locator(SELECTORS.viewportShell).first().boundingBox();
    const zoneC = gamePage.locator(SELECTORS.zoneC).first();
    const content = gamePage.locator('.zone-c-content').first();
    expect(shellBox).not.toBeNull();

    const scrollMetrics = await content.evaluate((el) => {
      const cs = window.getComputedStyle(el);
      el.scrollTop = el.scrollHeight;
      return {
        overflowY: cs.overflowY,
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight,
        scrollTop: el.scrollTop,
      };
    });

    expect(scrollMetrics.overflowY).toBe('auto');
    expect(scrollMetrics.scrollHeight).toBeGreaterThan(scrollMetrics.clientHeight);
    expect(scrollMetrics.scrollTop).toBeGreaterThan(0);

    const boxC = await zoneC.boundingBox();
    expect(boxC).not.toBeNull();
    if (boxC && shellBox) {
      const scale = shellBox.width / 960;
      const logicalHeightC = boxC.height / scale;
      const logicalBottomC = (boxC.y + boxC.height - shellBox.y) / scale;
      expect(logicalHeightC).toBeGreaterThanOrEqual(482);
      expect(logicalHeightC).toBeLessThanOrEqual(486);
      expect(logicalBottomC).toBeLessThanOrEqual(541);
    }
  });

  test('TC-VPORT-17: Offline Reward modal and Ad Simulator modal layer cleanly inside viewport-shell with higher Ad z-index (F36)', async ({
    gamePage,
  }) => {
    const seed = createAct1HubSeed();
    seed.meta.lastSavedTimestamp = Date.now() - 10 * 60_000;
    seed.monetization.adTier = 0;
    await injectGameState(gamePage, seed);
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);

    const shell = gamePage.locator(SELECTORS.viewportShell).first();
    const offlineModal = gamePage.locator(SELECTORS.offlineRewardModal).first();
    await expect(offlineModal).toBeVisible({ timeout: 5000 });

    const zafarBtn = offlineModal.locator(SELECTORS.zafarDoubleBtn).first();
    await zafarBtn.click();

    const adModal = gamePage.locator(SELECTORS.adSimModal).first();
    await expect(adModal).toBeVisible({ timeout: 5000 });
    await expect(offlineModal).toBeVisible();

    const offlineZ = await offlineModal.evaluate((el) =>
      Number(window.getComputedStyle(el).zIndex || '0')
    );
    const adZ = await adModal.evaluate((el) =>
      Number(window.getComputedStyle(el).zIndex || '0')
    );
    expect(adZ).toBeGreaterThan(offlineZ);

    const shellBox = await shell.boundingBox();
    const adBox = await adModal.boundingBox();
    expect(shellBox).not.toBeNull();
    expect(adBox).not.toBeNull();
    if (shellBox && adBox) {
      expect(adBox.x).toBeGreaterThanOrEqual(shellBox.x - 1);
      expect(adBox.y).toBeGreaterThanOrEqual(shellBox.y - 1);
      expect(adBox.x + adBox.width).toBeLessThanOrEqual(shellBox.x + shellBox.width + 1);
      expect(adBox.y + adBox.height).toBeLessThanOrEqual(shellBox.y + shellBox.height + 1);
    }

    const closeBtn = gamePage.locator(SELECTORS.adSimCloseBtn).first();
    await expect(closeBtn).toBeEnabled({ timeout: 6000 });
    await closeBtn.click();
    await expect(adModal).toBeHidden({ timeout: 5000 });
    await expect(offlineModal).toBeHidden({ timeout: 5000 });
  });

  test('TC-VPORT-18: DebugBar pill expands to overlay and collapses without shifting Zone A/B/C geometry (F36)', async ({
    gamePage,
  }) => {
    await injectGameState(gamePage, createAct1HubSeed());
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);

    const zoneA = gamePage.locator(SELECTORS.zoneA).first();
    const zoneB = gamePage.locator(SELECTORS.zoneB).first();
    const zoneC = gamePage.locator(SELECTORS.zoneC).first();

    const beforeA = await zoneA.boundingBox();
    const beforeB = await zoneB.boundingBox();
    const beforeC = await zoneC.boundingBox();

    const toggleBtn = gamePage.locator(SELECTORS.debugToggleBtn).first();
    await expect(toggleBtn).toBeVisible();
    const pillStyle = await toggleBtn.evaluate((el) => {
      const cs = window.getComputedStyle(el);
      return { position: cs.position, zIndex: Number(cs.zIndex || '0') };
    });
    expect(pillStyle.position).toBe('fixed');
    expect(pillStyle.zIndex).toBeGreaterThanOrEqual(999);

    await openDebugBar(gamePage);
    const debugBar = gamePage.locator(SELECTORS.debugBar).first();
    await expect(debugBar).toBeVisible();

    const openA = await zoneA.boundingBox();
    const openB = await zoneB.boundingBox();
    const openC = await zoneC.boundingBox();

    expect(openA).toEqual(beforeA);
    expect(openB).toEqual(beforeB);
    expect(openC).toEqual(beforeC);

    const collapseBtn = debugBar
      .locator('button:has-text("✕"), [data-testid="debug-toggle-btn"]')
      .first();
    await collapseBtn.click();
    await expect(toggleBtn).toBeVisible({ timeout: 3000 });

    const afterA = await zoneA.boundingBox();
    const afterB = await zoneB.boundingBox();
    const afterC = await zoneC.boundingBox();

    expect(afterA).toEqual(beforeA);
    expect(afterB).toEqual(beforeB);
    expect(afterC).toEqual(beforeC);
  });

  test('TC-VPORT-19: Zone B canvas preserves 680x412 logical pointer-coordinate mapping and DPR backing resolution across scaled viewports (F15)', async ({
    gamePage,
  }) => {
    await injectGameState(gamePage, createAct1HubSeed());
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);

    const viewports = [
      { width: 640, height: 360 },
      { width: 1280, height: 800 },
    ];

    const shell = gamePage.locator(SELECTORS.viewportShell).first();
    const canvas = gamePage.locator(SELECTORS.gameCanvas).first();
    const reticle = gamePage.locator(SELECTORS.aimReticle).first();

    for (const vp of viewports) {
      await gamePage.setViewportSize(vp);
      const expectedScale = Math.min(vp.width / 960, vp.height / 540);

      await expect
        .poll(async () => (await shell.boundingBox())?.width ?? 0, { timeout: 5000 })
        .toBeCloseTo(960 * expectedScale, 0);

      const canvasMetrics = await gamePage.evaluate((selector) => {
        const el = document.querySelector(selector) as HTMLCanvasElement | null;
        if (!el) return null;
        return {
          dpr: window.devicePixelRatio || 1,
          width: el.width,
          height: el.height,
        };
      }, SELECTORS.gameCanvas);

      expect(canvasMetrics).not.toBeNull();
      if (canvasMetrics) {
        const cappedDpr = Math.min(canvasMetrics.dpr, 2);
        expect(canvasMetrics.width).toBe(Math.round(680 * cappedDpr));
        expect(canvasMetrics.height).toBe(Math.round(412 * cappedDpr));
      }

      const box = await canvas.boundingBox();
      expect(box).not.toBeNull();
      if (box) {
        const startX = box.x + box.width * (340 / 680);
        const startY = box.y + box.height * (206 / 412);
        const targetLogicalX = 510;
        const targetLogicalY = 103;
        const endX = box.x + box.width * (targetLogicalX / 680);
        const endY = box.y + box.height * (targetLogicalY / 412);

        await gamePage.mouse.move(startX, startY);
        await gamePage.mouse.down();
        await expect(reticle).toBeVisible({ timeout: 3000 });
        await gamePage.mouse.move(endX, endY, { steps: 6 });

        const mapped = await reticle.evaluate((el) => ({
          left: parseFloat((el as HTMLElement).style.left || '0'),
          top: parseFloat((el as HTMLElement).style.top || '0'),
        }));
        expect(Math.abs(mapped.left - targetLogicalX)).toBeLessThanOrEqual(2.5);
        expect(Math.abs(mapped.top - targetLogicalY)).toBeLessThanOrEqual(2.5);

        await gamePage.mouse.up();
        await expect(reticle).toBeHidden({ timeout: 3000 });
      }
    }
  });

  test('TC-VPORT-20: DebugBar hides when ?debug=0 (production default behavior) and renders when ?debug=1 (V1)', async ({
    gamePage,
  }) => {
    await injectGameState(gamePage, createAct1HubSeed());
    await gamePage.goto('/?debug=0');
    await waitForCanvasReady(gamePage, 10000);

    await expect(gamePage.locator('[data-testid="debug-toggle-btn"]')).toHaveCount(0);

    await gamePage.goto('/?debug=1');
    await waitForCanvasReady(gamePage, 10000);

    await expect(gamePage.locator('[data-testid="debug-toggle-btn"]').first()).toBeVisible();
  });

  test('TC-VPORT-21: Korean localization for FSM badge and Mech turret label preserves data-fsm-state contract (V2)', async ({
    gamePage,
  }) => {
    await injectGameState(gamePage, createAct1HubSeed());
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);

    const fsmBadge = gamePage.locator(SELECTORS.hudFsmBadge).first();
    await expect(fsmBadge).toHaveAttribute('data-fsm-state', 'OASIS_HUB');
    await expect(fsmBadge).toContainText('오아시스 정비');

    const mechContent = gamePage.locator(SELECTORS.zoneCContent).first();
    await expect(mechContent).toContainText('주포 [열선]');
  });

  test('TC-VPORT-22: PC keyboard shortcuts switch turrets (1/2/3), trigger skills (Space/E), switch tabs (Q/R), and ignore input typing (V3)', async ({
    gamePage,
  }) => {
    await injectGameState(gamePage, createOpeningHookSeed(), { introSeen: false });
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);

    await gamePage.keyboard.press('2');
    await expect(gamePage.locator(SELECTORS.turretBtnHarpoon).first()).toHaveClass(/active/);

    await expect
      .poll(async () => (await readDebugSnapshot(gamePage))?.combat.switchCooldownRemaining ?? 1, {
        timeout: 3000,
      })
      .toBe(0);
    await gamePage.keyboard.press('3');
    await expect(gamePage.locator(SELECTORS.turretBtnMortar).first()).toHaveClass(/active/);

    await gamePage.keyboard.press('Space');
    await expect(gamePage.locator(SELECTORS.dodgeBoostBtn).first()).toHaveAttribute('data-active', 'true');

    await gamePage.keyboard.press('e');
    const snapShield = await readDebugSnapshot(gamePage);
    expect(snapShield?.sandwalker.solarShieldHp ?? 0).toBeGreaterThan(0);

    // Tab switching via R / Q
    await gamePage.keyboard.press('r');
    await expect(gamePage.locator(SELECTORS.tabBtnMercenaries).first()).toHaveClass(/active/);
    await gamePage.keyboard.press('r');
    await expect(gamePage.locator(SELECTORS.tabBtnTrading).first()).toHaveClass(/active/);

    // Focusing input field should prevent '1' from switching turret
    await gamePage.locator(SELECTORS.tradeCargoQtyInput).first().focus();
    await gamePage.keyboard.press('1');
    await expect(gamePage.locator(SELECTORS.turretBtnMortar).first()).toHaveClass(/active/);

    await gamePage.locator(SELECTORS.tradeCargoQtyInput).first().blur();
    await gamePage.keyboard.press('q');
    await expect(gamePage.locator(SELECTORS.tabBtnMercenaries).first()).toHaveClass(/active/);
  });

  test('TC-VPORT-23: Fullscreen HUD button fits inside Zone A, toggles via click & F key, and ignores input focus', async ({
    gamePage,
    errorTracker,
  }) => {
    await injectGameState(gamePage, createAct1HubSeed());
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);

    const fsBtn = gamePage.locator(SELECTORS.hudFullscreenBtn).first();
    await expect(fsBtn).toBeVisible();
    await expect(fsBtn).toHaveAttribute('data-fullscreen', 'false');

    // Verify button sits strictly inside Zone A (960x56) without overflow
    const shellBox = await gamePage.locator(SELECTORS.viewportShell).first().boundingBox();
    const btnBox = await fsBtn.boundingBox();
    expect(shellBox).not.toBeNull();
    expect(btnBox).not.toBeNull();
    if (shellBox && btnBox) {
      const scale = shellBox.width / 960;
      const logicalLeft = (btnBox.x - shellBox.x) / scale;
      const logicalRight = (btnBox.x + btnBox.width - shellBox.x) / scale;
      const logicalTop = (btnBox.y - shellBox.y) / scale;
      const logicalBottom = (btnBox.y + btnBox.height - shellBox.y) / scale;
      expect(logicalLeft).toBeGreaterThanOrEqual(-1);
      expect(logicalRight).toBeLessThanOrEqual(961);
      expect(logicalTop).toBeGreaterThanOrEqual(-1);
      expect(logicalBottom).toBeLessThanOrEqual(57);
    }

    // Click button to enter fullscreen & verify attribute + active class
    await fsBtn.click();
    await expect(fsBtn).toHaveAttribute('data-fullscreen', 'true');
    await expect(fsBtn).toHaveClass(/active/);
    await expect(fsBtn).toHaveAttribute('aria-label', '전체화면 종료');

    // Focusing an input field prevents 'f' shortcut from exiting fullscreen
    await gamePage.locator(SELECTORS.tabBtnTrading).first().click();
    await gamePage.locator(SELECTORS.tradeCargoQtyInput).first().focus();
    await gamePage.keyboard.press('f');
    await expect(fsBtn).toHaveAttribute('data-fullscreen', 'true');

    // Blurring input and pressing 'f' toggles fullscreen back off
    await gamePage.locator(SELECTORS.tradeCargoQtyInput).first().blur();
    await gamePage.keyboard.press('f');
    await expect(fsBtn).toHaveAttribute('data-fullscreen', 'false');
    await expect(fsBtn).toHaveAttribute('aria-label', '전체화면');

    errorTracker.assertNoErrors();
  });
});
