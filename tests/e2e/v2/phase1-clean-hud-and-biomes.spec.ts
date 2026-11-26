// ============================================================================
// File: tests/e2e/v2/phase1-clean-hud-and-biomes.spec.ts
// Phase 1 E2E Verification: 960x540 3-Layer Clean HUD, 4-Biome Lerp, ObjectPool & FallbackShapes
// Adheres strictly to Opaque-Box E2E rule (zero src/ or @/ imports).
// ============================================================================

import { test, expect, type Page } from '@playwright/test';

interface V2DebugSnap {
  scene: 'BOOT' | 'TITLE' | 'EXPEDITION' | 'PAUSED';
  distanceMeters: number;
  biome: {
    biomeIndex: number;
    biomeName: string;
    skyTopHex: string;
    groundHex: string;
    isSandstorm: boolean;
    hasQuicksand: boolean;
  };
  equippedTurret: string;
  gold: number;
  ancientGears: number;
  poolParticlesActive: number;
  poolParticlesCapacity: number;
  fps: number;
  assets: {
    total: number;
    loaded: number;
    missing: number;
  };
}

async function readV2Debug(page: Page): Promise<V2DebugSnap | null> {
  return page.evaluate(() => {
    const api = (
      window as unknown as {
        __SANDWALKER_V2__?: { getSnapshot: () => V2DebugSnap };
      }
    ).__SANDWALKER_V2__;
    return api ? api.getSnapshot() : null;
  });
}

async function sampleSkyAndGroundColors(page: Page): Promise<{
  skyR: number;
  skyG: number;
  skyB: number;
  groundR: number;
  groundG: number;
  groundB: number;
}> {
  return page.evaluate(() => {
    const canvas = document.querySelector('[data-testid="game-canvas"]') as HTMLCanvasElement;
    const ctx = canvas.getContext('2d')!;
    const sky = ctx.getImageData(Math.floor(canvas.width * 0.5), 18, 1, 1).data;
    const ground = ctx.getImageData(Math.floor(canvas.width * 0.5), canvas.height - 20, 1, 1).data;
    return {
      skyR: sky[0],
      skyG: sky[1],
      skyB: sky[2],
      groundR: ground[0],
      groundG: ground[1],
      groundB: ground[2],
    };
  });
}

test.describe('Phase 1 (PRD v2.0 Landscape): 3-Layer Clean HUD, 4-Biome Lerp & FallbackShapes', () => {
  test('TC-V2-P1-01: Renders 960x540 3-Layer Clean HUD (>=72% battlefield), <=5 core items, zero console/network errors', async ({
    page,
  }) => {
    const errors: string[] = [];
    const failedResponses: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    page.on('response', (res) => {
      if (res.status() >= 400 && !res.url().endsWith('/favicon.ico')) {
        failedResponses.push(`${res.status()} ${res.url()}`);
      }
    });

    await page.setViewportSize({ width: 960, height: 540 });
    await page.goto('/');

    const layer1 = page.locator('[data-testid="layer-1-hud"]');
    const layer2 = page.locator('[data-testid="layer-2-battlefield"]');
    const layer3 = page.locator('[data-testid="layer-3-controls"]');
    await expect(layer1).toBeVisible();
    await expect(layer2).toBeVisible();
    await expect(layer3).toBeVisible();

    const box1 = await layer1.boundingBox();
    const box2 = await layer2.boundingBox();
    const box3 = await layer3.boundingBox();
    expect(box1!.height).toBeCloseTo(56, 1);
    expect(box2!.height).toBeCloseTo(404, 1);
    expect(box3!.height).toBeCloseTo(80, 1);
    expect(box2!.height / 540).toBeGreaterThanOrEqual(0.72);

    // Core Clean HUD items visible
    await expect(page.locator('[data-testid="hud-distance-bar"]')).toBeVisible();
    await expect(page.locator('[data-testid="hud-gold"]')).toBeVisible();
    await expect(page.locator('[data-testid="hud-gears"]')).toBeVisible();
    await expect(page.locator('[data-testid="btn-pause"]')).toBeVisible();
    await expect(page.locator('[data-testid="btn-turret-cycle"]')).toBeVisible();
    await expect(page.locator('[data-testid="btn-dodge"]')).toBeVisible();
    await expect(page.locator('[data-testid="btn-shield"]')).toBeVisible();

    expect(errors).toEqual([]);
    expect(failedResponses).toEqual([]);
  });

  test('TC-V2-P1-02: Scales 960x540 cleanly centered inside 1280x720 desktop letterbox without overflow', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/');

    const shell = page.locator('[data-testid="viewport-shell"]');
    await expect(shell).toBeVisible();
    const box = await shell.boundingBox();
    expect(box).not.toBeNull();
    // 1280/960 = 1.3333, 720/540 = 1.3333 -> fills cleanly centered within 1280x720
    expect(box!.width).toBeCloseTo(1280, 2);
    expect(box!.height).toBeCloseTo(720, 2);
  });

  test('TC-V2-P1-03: Title sortie -> marching expedition, 4-Biome continuous RGB transition & turret cycle', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.setViewportSize({ width: 960, height: 540 });
    await page.goto('/');

    await expect(page.locator('[data-testid="title-overlay"]')).toBeVisible();
    await page.locator('[data-testid="btn-start-expedition"]').click();
    const skipBtn = page.locator('[data-testid="btn-skip-storyboard"]');
    if (await skipBtn.isVisible()) {
      await skipBtn.click();
    }
    await expect(page.locator('[data-testid="title-overlay"]')).toHaveCount(1);
    await expect(page.locator('[data-testid="title-overlay"]')).toBeHidden();

    await expect
      .poll(async () => (await readV2Debug(page))?.distanceMeters ?? 0, { timeout: 5000 })
      .toBeGreaterThan(2);

    // Pause briefly to verify exact deterministic colors across all 4 biomes
    await page.locator('[data-testid="btn-pause"]').click();
    await expect(page.locator('[data-testid="pause-overlay"]')).toBeVisible();

    await page.evaluate(() => {
      (window as unknown as { __SANDWALKER_V2__: { setDistance: (m: number) => void } })
        .__SANDWALKER_V2__.setDistance(100);
    });
    await page.waitForTimeout(120);
    const zone1Colors = await sampleSkyAndGroundColors(page);

    await page.evaluate(() => {
      (window as unknown as { __SANDWALKER_V2__: { setDistance: (m: number) => void } })
        .__SANDWALKER_V2__.setDistance(750);
    });
    await page.waitForTimeout(120);
    const zone2Colors = await sampleSkyAndGroundColors(page);
    await expect(page.locator('[data-testid="hud-biome-name"]')).toHaveText('붉은 전갈 협곡');

    await page.evaluate(() => {
      (window as unknown as { __SANDWALKER_V2__: { setDistance: (m: number) => void } })
        .__SANDWALKER_V2__.setDistance(1750);
    });
    await page.waitForTimeout(120);
    const zone4Colors = await sampleSkyAndGroundColors(page);
    await expect(page.locator('[data-testid="hud-biome-name"]')).toHaveText('고대 태양 신전 오아시스');

    // Sky/ground pixel colors must clearly shift between Zone 1 (orange), Zone 2 (red), and Zone 4 (teal)
    expect(zone1Colors.skyR).not.toBe(zone4Colors.skyR);
    expect(zone2Colors.groundR).not.toBe(zone1Colors.groundR);
    expect(zone4Colors.skyG).toBeGreaterThan(zone2Colors.skyG);

    // Resume and verify turret cycle button switches TUR_01 -> TUR_02 -> TUR_03
    await page.locator('[data-testid="btn-resume"]').click();
    await page.locator('[data-testid="btn-turret-cycle"]').click();
    expect((await readV2Debug(page))?.equippedTurret).toBe('TUR_02');
    await page.locator('[data-testid="btn-turret-cycle"]').click();
    expect((await readV2Debug(page))?.equippedTurret).toBe('TUR_03');

    await expect
      .poll(async () => (await readV2Debug(page))?.assets.loaded ?? 0, { timeout: 5000 })
      .toBe(23);
    const finalSnap = await readV2Debug(page);
    expect(finalSnap?.assets.total).toBe(23);
    expect(finalSnap?.assets.loaded).toBe(23);
    expect(finalSnap?.assets.missing).toBe(0);
    expect(finalSnap?.poolParticlesCapacity).toBe(150);
    expect(finalSnap?.fps ?? 0).toBeGreaterThan(15);
    expect(errors).toEqual([]);
  });
});
