import { test, expect } from '../fixtures/appFixture';
import {
  SELECTORS,
  waitForCanvasReady,
  selectDashboardTab,
  setDebugSpeed,
  setDebugProgress,
  waitForFsmState,
  sortieFromOasis,
} from '../fixtures/testHelpers';
import {
  injectGameState,
  createAct1HubSeed,
  createEconomyTradeSeed,
  createOpeningHookSeed,
  createRelicCodexSeed,
} from '../fixtures/mockStorage';

test.describe('Phase B: Pixel-Art Canvas, Web Audio SFX, Relic/Stele Codex & UX Polish', () => {
  test('TC-PHB-01: Zone B canvas enforces imageSmoothingEnabled=false & CSS pixelated with 0 external assets (R2, AC-01)', async ({
    gamePage,
    assetTracker,
    errorTracker,
  }) => {
    await injectGameState(gamePage, createAct1HubSeed());
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);

    const renderFlags = await gamePage.evaluate((sel) => {
      const canvas = document.querySelector(sel) as HTMLCanvasElement | null;
      if (!canvas) return null;
      const ctx = canvas.getContext('2d');
      const cs = window.getComputedStyle(canvas);
      return {
        smoothing: ctx?.imageSmoothingEnabled ?? true,
        imageRendering: cs.imageRendering,
      };
    }, SELECTORS.gameCanvas);

    expect(renderFlags).not.toBeNull();
    expect(renderFlags?.smoothing).toBe(false);
    expect(renderFlags?.imageRendering).toMatch(/pixelated|crisp-edges/i);

    assetTracker.assertZeroAssets();
    errorTracker.assertNoErrors();
  });

  test('TC-PHB-02: Zone A mute toggle persists and chiptune SoundEngine initializes safely without errors (V6)', async ({
    gamePage,
    errorTracker,
  }) => {
    await injectGameState(gamePage, createAct1HubSeed());
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);

    const muteBtn = gamePage.locator('[data-testid="hud-mute-btn"]').first();
    await expect(muteBtn).toBeVisible();
    await expect(muteBtn).toContainText('🔊');

    await muteBtn.click();
    await expect(muteBtn).toContainText('🔇');

    await gamePage.reload();
    await waitForCanvasReady(gamePage, 10000);
    await expect(muteBtn).toContainText('🔇');

    await muteBtn.click();
    await expect(muteBtn).toContainText('🔊');

    // Trigger turret switch sound
    await gamePage.keyboard.press('2');
    const audioStatus = await gamePage.evaluate(() => {
      const api = (window as unknown as {
        __SANDWALKER_AUDIO__?: {
          getStatus: () => { initialized: boolean; muted: boolean; playCount: number };
        };
      }).__SANDWALKER_AUDIO__;
      return api?.getStatus() ?? null;
    });

    expect(audioStatus).not.toBeNull();
    expect(audioStatus?.muted).toBe(false);
    errorTracker.assertNoErrors();
  });

  test('TC-PHB-03: Codex tab displays 12 stele inscriptions, 6 relic pixel cards, live countdown & ready dot (V7)', async ({
    gamePage,
    errorTracker,
  }) => {
    const seed = createRelicCodexSeed({
      pending: [{ id: 'relic_ankh', appraiseEndsAt: Date.now() + 45_000 }],
      decodedSteles: [1],
      codex: ['relic_solar_disc'],
    });
    await injectGameState(gamePage, seed);
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);

    await selectDashboardTab(gamePage, 'codex');

    await expect(gamePage.locator('[data-testid="stele-item-1"]')).toContainText(
      '태양의 수레바퀴가 다시 사막을 가른다'
    );
    await expect(gamePage.locator('[data-testid="stele-item-2"]')).toContainText('???');
    await expect(gamePage.locator('[data-testid="relic-card-relic_solar_disc"]')).toContainText(
      '태양의 황금 원반'
    );
    await expect(gamePage.locator('[data-testid="relic-card-relic_ankh"]')).toContainText('???');
    await expect(gamePage.locator('[data-testid="relic-countdown"]').first()).toBeVisible();
    await expect(gamePage.locator('[data-testid="codex-ready-dot"]')).toHaveCount(0);

    // Ready appraisal shows notification dot on Codex tab
    const readySeed = createRelicCodexSeed({
      pending: [{ id: 'relic_ankh', appraiseEndsAt: Date.now() - 10_000 }],
    });
    await injectGameState(gamePage, readySeed);
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);

    await expect(gamePage.locator('[data-testid="codex-ready-dot"]')).toBeVisible();
    errorTracker.assertNoErrors();
  });

  test('TC-PHB-04: Opening Phase 2 shows emergency escape button & Settlement displays profit breakdown receipt (V9, V10)', async ({
    gamePage,
    errorTracker,
  }) => {
    await injectGameState(gamePage, createOpeningHookSeed(), { introSeen: false });
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await waitForFsmState(gamePage, 'OPENING_HOOK', 5000);

    // Fast-forward Phase 1 (30s) at 4x -> Phase 2 (~7.5s real time)
    await setDebugSpeed(gamePage, 4);
    const escapeBtn = gamePage.locator('[data-testid="emergency-escape-btn"]').first();
    await expect(escapeBtn).toBeVisible({ timeout: 15000 });
    await setDebugSpeed(gamePage, 1);

    await escapeBtn.click();
    await expect(gamePage.locator('[data-testid="intro-phase-badge"]').first()).toContainText(
      'Phase 3/4',
      { timeout: 5000 }
    );

    // Verify Settlement profit receipt
    const tradeSeed = createEconomyTradeSeed({
      oasisIndex: 1,
      sunGold: 500,
      cargo: [{ goodsId: 'WATER', qty: 10, buyPrice: 1 }],
      nextOasisPriceRate: 1.8,
      harunUnlocked: true,
    });
    tradeSeed.sandwalker.turretLevels = { HEAT_RAY: 25, HARPOON: 25, MORTAR: 25 };
    tradeSeed.sandwalker.turretTiers = { HEAT_RAY: 3, HARPOON: 3, MORTAR: 3 };
    tradeSeed.sandwalker.activeTurret = 'HARPOON';

    await injectGameState(gamePage, tradeSeed);
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await sortieFromOasis(gamePage);
    await setDebugSpeed(gamePage, 4);
    await setDebugProgress(gamePage, 95);
    await waitForFsmState(gamePage, 'OASIS_SETTLEMENT', 25000);
    await setDebugSpeed(gamePage, 1);

    const receipt = gamePage.locator('[data-testid="settlement-receipt"]').first();
    await expect(receipt).toBeVisible();
    await expect(receipt).toContainText('10개');
    await expect(receipt).toContainText('180%');
    await expect(receipt).toContainText('+25%');

    errorTracker.assertNoErrors();
  });
});
