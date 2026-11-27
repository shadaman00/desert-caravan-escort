// ============================================================================
// File: tests/e2e/v2/phase4-bm-audio-and-assets.spec.ts
// Phase 4 E2E Verification: 23/23 PNG Asset Loading (0 404s), AdTierManager
// Customer-Friendly Rules (15m / Defeat No-Ad / Tier 0~3 / Jafar Rewarded),
// & Web Audio SoundSynth 6 SFX Integration + Mute Toggle.
// Adheres strictly to Opaque-Box E2E rule (zero src/ or @/ imports).
// ============================================================================

import { test, expect, type Page } from '@playwright/test';

async function readPhase4(page: Page) {
  return page.evaluate(() => {
    const api = (
      window as unknown as {
        __SANDWALKER_V2__: {
          getSnapshot: () => {
            scene: string;
            gold: number;
            fps: number;
            assets: { total: number; loaded: number; missing: number };
          };
          getMonetizationState: () => {
            adTier: number;
            playTimeSecWithoutAd: number;
            oasisVisitsSinceLastInterstitial: number;
            zone1FirstOasisSettled: boolean;
            totalInterstitialsShown: number;
            totalRewardedWatched: number;
          };
          getAudioState: () => {
            muted: boolean;
            playCounts: Record<string, number>;
          };
          evaluateDefeatAd: () => { allowed: boolean; reason: string };
        };
      }
    ).__SANDWALKER_V2__;
    return {
      snap: api.getSnapshot(),
      mon: api.getMonetizationState(),
      audio: api.getAudioState(),
      defeatAd: api.evaluateDefeatAd(),
    };
  });
}

test.describe('Phase 4 (PRD v2.0 Landscape): 23 PNG Assets, AdTierManager & Web Audio SFX', () => {
  test('TC-V2-P4-01: Loads all 23/23 PNG assets with zero 404/console errors and displays storyboard art', async ({
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

    await expect
      .poll(async () => (await readPhase4(page)).snap.assets.loaded, { timeout: 6000 })
      .toBe(23);
    const loadedSnap = await readPhase4(page);
    expect(loadedSnap.snap.assets.total).toBe(23);
    expect(loadedSnap.snap.assets.missing).toBe(0);

    // Open Storyboard -> verify STORY_CUT1 background image rendered
    await page.locator('[data-testid="btn-start-expedition"]').click();
    await expect(page.locator('[data-testid="opening-storyboard"]')).toBeVisible();
    const bgImg = await page
      .locator('.storyboard-stage')
      .evaluate((el) => getComputedStyle(el).backgroundImage);
    expect(bgImg).toContain('cut1_legend.png');

    await page.locator('[data-testid="btn-skip-storyboard"]').click();
    await expect
      .poll(async () => (await readPhase4(page)).snap.fps, { timeout: 3000 })
      .toBeGreaterThan(15);

    expect(errors).toEqual([]);
    expect(failedResponses).toEqual([]);
  });

  test('TC-V2-P4-02: Enforces 15m/Zone1/defeat no-ad guards and Tier 0~3 & Jafar 2x rewarded simulation', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.setViewportSize({ width: 960, height: 540 });
    await page.goto('/');
    await page.locator('[data-testid="btn-start-expedition"]').click();
    await page.locator('[data-testid="btn-skip-storyboard"]').click();

    // Defeat is permanently no-ad
    expect((await readPhase4(page)).defeatAd.allowed).toBe(false);

    // Zone 1 first oasis under 900s -> 0 interstitials, Jafar rewarded 2x grants 2x profit
    await page.evaluate(() => {
      (window as unknown as { __SANDWALKER_V2__: { openCampAt: (m: number) => void } })
        .__SANDWALKER_V2__.openCampAt(500);
    });
    const goldBefore = (await readPhase4(page)).snap.gold;
    await page.locator('[data-testid="btn-camp-jafar-double"]').click();
    const afterZone1 = await readPhase4(page);
    expect(afterZone1.snap.gold).toBe(goldBefore + 620); // 200 * (1 + 0.50 + 0.05) * 2 = 620
    expect(afterZone1.mon.totalInterstitialsShown).toBe(0);
    expect(afterZone1.mon.totalRewardedWatched).toBe(1);
    await page.locator('[data-testid="btn-camp-depart"]').click();

    // Advance playtime past 900s, simulate 3 more Tier 0 oasis visits -> triggers 1 interstitial
    await page.evaluate(() => {
      (
        window as unknown as {
          __SANDWALKER_V2__: { addPlayTimeForAd: (s: number) => void; openCampAt: (m: number) => void };
        }
      ).__SANDWALKER_V2__.addPlayTimeForAd(950);
    });

    for (let visit = 0; visit < 3; visit++) {
      await page.evaluate(() => {
        (window as unknown as { __SANDWALKER_V2__: { openCampAt: (m: number) => void } })
          .__SANDWALKER_V2__.openCampAt(500);
      });
      await page.locator('[data-testid="btn-camp-settle"]').click();
      await page.locator('[data-testid="btn-camp-depart"]').click();
    }

    expect((await readPhase4(page)).mon.totalInterstitialsShown).toBe(1);

    // Switch to Tier 3 -> subsequent oasis visits never add interstitials
    await page.evaluate(() => {
      (window as unknown as { __SANDWALKER_V2__: { setAdTier: (t: 0 | 1 | 2 | 3) => void } })
        .__SANDWALKER_V2__.setAdTier(3);
    });
    for (let visit = 0; visit < 3; visit++) {
      await page.evaluate(() => {
        (window as unknown as { __SANDWALKER_V2__: { openCampAt: (m: number) => void } })
          .__SANDWALKER_V2__.openCampAt(500);
      });
      await page.locator('[data-testid="btn-camp-settle"]').click();
      await page.locator('[data-testid="btn-camp-depart"]').click();
    }
    expect((await readPhase4(page)).mon.totalInterstitialsShown).toBe(1);

    expect(errors).toEqual([]);
  });

  test('TC-V2-P4-03: Triggers all 6 Web Audio SFX pathways and toggles mute inside Pause modal', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.setViewportSize({ width: 960, height: 540 });
    await page.goto('/');
    await page.locator('[data-testid="btn-start-expedition"]').click();
    await page.locator('[data-testid="btn-skip-storyboard"]').click();

    // 1. Turret Cycle SFX
    await page.locator('[data-testid="btn-turret-cycle"]').click();

    // 2. Lock-On SFX
    await page.evaluate(() => {
      (window as unknown as { __SANDWALKER_V2__: { spawnRaider: (x: number) => void } })
        .__SANDWALKER_V2__.spawnRaider(640);
    });
    await page.locator('[data-testid="game-canvas"]').click({ position: { x: 640, y: 307 } });

    // 3. Relic Excavate SFX
    await page.evaluate(() => {
      (window as unknown as { __SANDWALKER_V2__: { spawnRelic: (x: number, g: number, gear: number) => void } })
        .__SANDWALKER_V2__.spawnRelic(430, 80, 1);
    });
    await page.keyboard.press('f');

    // 4. Steam Vent Overdrive SFX
    await page.evaluate(() => {
      (window as unknown as { __SANDWALKER_V2__: { setHeat: (h: number) => void } })
        .__SANDWALKER_V2__.setHeat(85);
    });
    await page.keyboard.press('w');

    // 5. Golden Parry / Dodge SFX
    await page.locator('[data-testid="btn-dodge"]').click();

    // 6. Solar Shield SFX
    await page.keyboard.press('e');

    await expect
      .poll(
        async () => {
          const c = (await readPhase4(page)).audio.playCounts;
          return (
            c.turretCycle >= 1 &&
            c.lockOn >= 1 &&
            c.relicExcavate >= 1 &&
            c.steamVent >= 1 &&
            c.goldenParry >= 1 &&
            c.shieldActivate >= 1
          );
        },
        { timeout: 4000 }
      )
      .toBe(true);

    // Pause -> Toggle Mute
    await page.locator('[data-testid="btn-pause"]').click();
    await expect(page.locator('[data-testid="btn-mute"]')).toBeVisible();
    await page.locator('[data-testid="btn-mute"]').click();
    expect((await readPhase4(page)).audio.muted).toBe(true);
    await expect(page.locator('[data-testid="btn-mute"]')).toContainText('OFF');

    expect(errors).toEqual([]);
  });
});
