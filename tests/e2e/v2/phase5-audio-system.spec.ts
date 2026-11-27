// ============================================================================
// File: tests/e2e/v2/phase5-audio-system.spec.ts
// Audio System Add-On PRD (v1.0) E2E Verification:
//   - TC-AUD-01: Zero 404/console errors with fallback audio, 6-BGM crossfade triggers & 3-Ambience biome interpolation
//   - TC-AUD-02: Boss TELEGRAPH_WARN & 300m EventChoiceModal BGM Ducking + 6-channel Voice Cap <= 6
//   - TC-AUD-03: visibilitychange background suspend/resume + Pause BGM/SFX mute persistence across reload
// Adheres strictly to Opaque-Box E2E rule (zero src/ or @/ imports).
// ============================================================================

import { test, expect, type Page } from '@playwright/test';

interface AudioDebugSnap {
  unlocked: boolean;
  suspendedByVisibility: boolean;
  activeBgm: string | null;
  ambienceLevels: Record<string, number>;
  duckingActive: boolean;
  activeSfxVoices: number;
  sfxPlayCounts: Record<string, number>;
  settings: {
    bgmMuted: boolean;
    sfxMuted: boolean;
    bgmVolume: number;
    sfxVolume: number;
  };
}

async function readAudio(page: Page): Promise<AudioDebugSnap> {
  return page.evaluate(() => {
    return (
      window as unknown as {
        __SANDWALKER_V2__: { getAudioState: () => AudioDebugSnap };
      }
    ).__SANDWALKER_V2__.getAudioState();
  });
}

async function startAndSkipStoryboard(page: Page) {
  await page.locator('[data-testid="btn-start-expedition"]').click();
  const skipBtn = page.locator('[data-testid="btn-skip-storyboard"]');
  if (await skipBtn.isVisible()) {
    await skipBtn.click();
  }
}

test.describe('Audio System Add-On (v1.0): 3-Bus Mixing, Ducking, Voice Cap & Persistence', () => {
  test('TC-AUD-01: Switches 6 BGMs & 3 Ambiences dynamically with zero HTTP 404 or console errors', async ({
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

    // Title -> bgm_title_opening
    await expect.poll(async () => (await readAudio(page)).activeBgm).toBe('bgm_title_opening');

    await startAndSkipStoryboard(page);
    expect((await readAudio(page)).unlocked).toBe(true);
    await expect.poll(async () => (await readAudio(page)).activeBgm).toBe('bgm_zone1_dunes');

    // Zone 2 (750m) -> bgm_zone2_canyon + quicksand ambience > 0.5
    await page.evaluate(() => {
      (window as unknown as { __SANDWALKER_V2__: { setDistance: (m: number) => void } })
        .__SANDWALKER_V2__.setDistance(750);
    });
    const z2 = await readAudio(page);
    expect(z2.activeBgm).toBe('bgm_zone2_canyon');
    expect(z2.ambienceLevels.amb_quicksand_rumble).toBeGreaterThan(0.5);

    // Zone 3 (1250m) -> bgm_zone3_storm + sandstorm ambience > 0.8
    await page.evaluate(() => {
      (window as unknown as { __SANDWALKER_V2__: { setDistance: (m: number) => void } })
        .__SANDWALKER_V2__.setDistance(1250);
    });
    const z3 = await readAudio(page);
    expect(z3.activeBgm).toBe('bgm_zone3_storm');
    expect(z3.ambienceLevels.amb_sandstorm_howl).toBeGreaterThan(0.8);

    // Oasis Camp -> bgm_oasis_camp
    await page.evaluate(() => {
      (window as unknown as { __SANDWALKER_V2__: { openCampAt: (m: number) => void } })
        .__SANDWALKER_V2__.openCampAt(1500);
    });
    expect((await readAudio(page)).activeBgm).toBe('bgm_oasis_camp');
    await page.locator('[data-testid="btn-camp-depart"]').click();

    // Boss Spawn -> bgm_boss_sandworm
    await page.evaluate(() => {
      (window as unknown as { __SANDWALKER_V2__: { spawnBoss: (k: string, x: number) => void } })
        .__SANDWALKER_V2__.spawnBoss('BOSS_SANDWORM', 680);
    });
    expect((await readAudio(page)).activeBgm).toBe('bgm_boss_sandworm');

    expect(errors).toEqual([]);
    expect(failedResponses).toEqual([]);
  });

  test('TC-AUD-02: Activates BGM ducking on Boss TELEGRAPH_WARN & EventChoiceModal while enforcing Voice Cap <= 6', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.setViewportSize({ width: 960, height: 540 });
    await page.goto('/');
    await startAndSkipStoryboard(page);

    // 300m Event Modal -> sfx_event_popup + BGM ducking ON, then OFF after selection
    await page.evaluate(() => {
      (window as unknown as { __SANDWALKER_V2__: { triggerEventAt: (m: number) => void } })
        .__SANDWALKER_V2__.triggerEventAt(300);
    });
    let aud = await readAudio(page);
    expect(aud.duckingActive).toBe(true);
    expect(aud.sfxPlayCounts.sfx_event_popup).toBeGreaterThanOrEqual(1);

    await page.locator('[data-testid="event-choice-0"]').click();
    aud = await readAudio(page);
    expect(aud.duckingActive).toBe(false);

    // Spawn Sandworm & wait for TELEGRAPH_WARN -> sfx_boss_telegraph + ducking ON
    await page.evaluate(() => {
      (window as unknown as { __SANDWALKER_V2__: { spawnBoss: (k: string, x: number) => void } })
        .__SANDWALKER_V2__.spawnBoss('BOSS_SANDWORM', 660);
    });
    await expect
      .poll(async () => (await readAudio(page)).duckingActive, { timeout: 6000 })
      .toBe(true);
    aud = await readAudio(page);
    expect(aud.sfxPlayCounts.sfx_boss_telegraph).toBeGreaterThanOrEqual(1);
    expect(aud.activeSfxVoices).toBeLessThanOrEqual(6);

    // Golden counter parry releases ducking & triggers counter SFX
    await page.locator('[data-testid="btn-dodge"]').click();
    await expect
      .poll(async () => (await readAudio(page)).duckingActive, { timeout: 3000 })
      .toBe(false);
    expect((await readAudio(page)).sfxPlayCounts.sfx_golden_counter).toBeGreaterThanOrEqual(1);

    expect(errors).toEqual([]);
  });

  test('TC-AUD-03: Suspends on background visibilitychange and persists BGM/SFX mute toggles across reload', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.setViewportSize({ width: 960, height: 540 });
    await page.goto('/');
    await startAndSkipStoryboard(page);

    // Visibility background -> suspend, foreground -> resume
    await page.evaluate(() => {
      (window as unknown as { __SANDWALKER_V2__: { triggerVisibilityForAudio: (h: boolean) => void } })
        .__SANDWALKER_V2__.triggerVisibilityForAudio(true);
    });
    expect((await readAudio(page)).suspendedByVisibility).toBe(true);

    await page.evaluate(() => {
      (window as unknown as { __SANDWALKER_V2__: { triggerVisibilityForAudio: (h: boolean) => void } })
        .__SANDWALKER_V2__.triggerVisibilityForAudio(false);
    });
    expect((await readAudio(page)).suspendedByVisibility).toBe(false);

    // Open Pause modal and toggle both BGM Mute and SFX Mute
    await page.locator('[data-testid="btn-pause"]').click();
    await page.locator('[data-testid="btn-mute-bgm"]').click();
    await page.locator('[data-testid="btn-mute"]').click();

    await expect(page.locator('[data-testid="btn-mute-bgm"]')).toContainText('OFF');
    await expect(page.locator('[data-testid="btn-mute"]')).toContainText('OFF');

    // Reload and verify persisted mute states
    await page.reload();
    const afterReload = await readAudio(page);
    expect(afterReload.settings.bgmMuted).toBe(true);
    expect(afterReload.settings.sfxMuted).toBe(true);

    await startAndSkipStoryboard(page);
    await page.locator('[data-testid="btn-pause"]').click();
    await expect(page.locator('[data-testid="btn-mute-bgm"]')).toContainText('OFF');
    await expect(page.locator('[data-testid="btn-mute"]')).toContainText('OFF');

    expect(errors).toEqual([]);
  });
});
