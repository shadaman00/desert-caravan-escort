// ============================================================================
// File: tests/e2e/tier1-feature-coverage/audio-skins-and-settings.spec.ts
// Phase 5 Production Feature Coverage: Adaptive Audio, Royal Silk Skin & Unified Settings UX
// Adheres strictly to Opaque-Box E2E rule (zero src/ or @/ imports).
// ============================================================================

import { test, expect } from '../fixtures/appFixture';
import {
  SELECTORS,
  waitForCanvasReady,
  waitForSteadyState,
  sampleCanvasRegionStats,
  readDebugSnapshot,
  sortieFromOasis,
  setDebugProgress,
  waitForFsmState,
} from '../fixtures/testHelpers';
import { injectGameState, createAct1HubSeed } from '../fixtures/mockStorage';

const WAGON_SAMPLE_RECT = { x: 80, y: 300, width: 90, height: 42 };

test.describe('Phase 5 Production: Adaptive Audio, Royal Silk Skin & Unified Settings UX', () => {
  test('TC-POLISH-01: Unified Settings modal updates audio, haptics, toast density & auto-invest policy and persists across reload', async ({
    gamePage,
    errorTracker,
  }) => {
    await injectGameState(gamePage, createAct1HubSeed({ adTier: 3 }));
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);

    await gamePage.locator(SELECTORS.hudSettingsBtn).click();
    await expect(gamePage.locator(SELECTORS.settingsModal)).toBeVisible();

    await gamePage.locator(SELECTORS.sliderMasterVolume).fill('60');
    await gamePage.locator(SELECTORS.sliderBgmVolume).fill('40');
    await gamePage.locator(SELECTORS.sliderSfxVolume).fill('70');
    await gamePage.locator(SELECTORS.toggleSettingsHaptics).uncheck();
    await gamePage.locator(SELECTORS.selectToastDensity).selectOption('IMPORTANT');
    await gamePage.locator(SELECTORS.settingsAutoInvestSelect).selectOption('COMBAT');

    await gamePage.locator(SELECTORS.btnCloseSettings).click();
    await expect(gamePage.locator(SELECTORS.settingsModal)).toHaveCount(0);

    // Reload page and confirm persistence in both store and window.__SANDWALKER_AUDIO__
    await gamePage.reload();
    await waitForCanvasReady(gamePage, 10000);

    const audioInfo = await gamePage.evaluate(() => {
      const api = (
        window as unknown as {
          __SANDWALKER_AUDIO__?: {
            getStatus: () => { masterVolume: number; sfxVolume: number; muted: boolean };
            getBgmStatus: () => { masterVolume: number; bgmVolume: number; currentTheme: string };
          };
        }
      ).__SANDWALKER_AUDIO__;
      const savedRaw = window.localStorage.getItem('SANDWALKER_SETTINGS_V1');
      return {
        sfx: api?.getStatus(),
        bgm: api?.getBgmStatus(),
        saved: savedRaw ? JSON.parse(savedRaw) : null,
      };
    });

    expect(audioInfo.sfx?.masterVolume).toBeCloseTo(0.6, 2);
    expect(audioInfo.sfx?.sfxVolume).toBeCloseTo(0.7, 2);
    expect(audioInfo.bgm?.bgmVolume).toBeCloseTo(0.4, 2);
    expect(audioInfo.saved?.hapticsEnabled).toBe(false);
    expect(audioInfo.saved?.toastDensity).toBe('IMPORTANT');

    const snap = await readDebugSnapshot(gamePage);
    expect(snap?.progression?.autoInvestPolicy).toBe('COMBAT');

    errorTracker.assertNoErrors();
  });

  test('TC-POLISH-02: Royal Silk Caravan skin shifts Zone B canvas palette, toggles cleanly and persists across reload', async ({
    gamePage,
    errorTracker,
  }) => {
    await injectGameState(gamePage, createAct1HubSeed());
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await waitForSteadyState(gamePage, 300);

    const defaultWagonStats = await sampleCanvasRegionStats(gamePage, WAGON_SAMPLE_RECT);

    const silkBtn = gamePage.locator(SELECTORS.btnEquipRoyalSilkSkin);
    await expect(silkBtn).toBeVisible();
    await silkBtn.click();
    await waitForSteadyState(gamePage, 250);

    const afterEquipSnap = await readDebugSnapshot(gamePage);
    expect(afterEquipSnap?.monetization?.equippedSkinId).toBe('ROYAL_SILK');

    const silkWagonStats = await sampleCanvasRegionStats(gamePage, WAGON_SAMPLE_RECT);
    expect(silkWagonStats.hash).not.toBe(defaultWagonStats.hash);

    // Reload and verify persistence
    await gamePage.reload();
    await waitForCanvasReady(gamePage, 10000);
    const reloadedSnap = await readDebugSnapshot(gamePage);
    expect(reloadedSnap?.monetization?.equippedSkinId).toBe('ROYAL_SILK');

    // Toggle back to DEFAULT
    await gamePage.locator(SELECTORS.btnEquipRoyalSilkSkin).click();
    const unequippedSnap = await readDebugSnapshot(gamePage);
    expect(unequippedSnap?.monetization?.equippedSkinId).toBe('DEFAULT');

    errorTracker.assertNoErrors();
  });

  test('TC-POLISH-03: Adaptive BGM shifts theme across Oasis -> March -> Boss and Save JSON export/import works inside Settings', async ({
    gamePage,
    errorTracker,
  }) => {
    await injectGameState(gamePage, createAct1HubSeed({ sunGold: 777 }));
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);

    // Verify Save export inside Settings modal
    await gamePage.locator(SELECTORS.hudSettingsBtn).click();
    await gamePage.locator('[data-testid="settings-btn-export-save"]').click();
    const exportedJson = await gamePage.locator('[data-testid="settings-save-textarea"]').inputValue();
    expect(exportedJson).toContain('777');
    await gamePage.locator('[data-testid="settings-btn-import-save"]').click();
    await expect(gamePage.locator('[data-testid="settings-save-status"]')).toContainText('완료');
    await gamePage.locator(SELECTORS.btnCloseSettings).click();

    const getBgmTheme = async () =>
      await gamePage.evaluate(
        () =>
          (
            window as unknown as {
              __SANDWALKER_AUDIO__?: {
                getBgmStatus: () => { currentTheme: string; running: boolean };
              };
            }
          ).__SANDWALKER_AUDIO__?.getBgmStatus()
      );

    expect((await getBgmTheme())?.currentTheme).toBe('OASIS_HUB');

    await sortieFromOasis(gamePage);
    await waitForFsmState(gamePage, 'MARCH_NORMAL', 10000);
    expect((await getBgmTheme())?.currentTheme).toBe('MARCH_NORMAL');
    expect((await getBgmTheme())?.running).toBe(true);

    await setDebugProgress(gamePage, 95);
    await waitForFsmState(gamePage, 'BOSS_ENCOUNTER', 10000);
    expect((await getBgmTheme())?.currentTheme).toBe('BOSS_ENCOUNTER');

    errorTracker.assertNoErrors();
  });
});
