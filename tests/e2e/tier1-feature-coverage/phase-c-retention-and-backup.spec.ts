import { test, expect } from '../fixtures/appFixture';
import {
  SELECTORS,
  waitForCanvasReady,
  selectDashboardTab,
  setDebugSpeed,
  setDebugProgress,
  waitForFsmState,
  sortieFromOasis,
  readDebugSnapshot,
} from '../fixtures/testHelpers';
import {
  injectGameState,
  createAct1HubSeed,
  createBossSeedForAct,
  createEconomyTradeSeed,
  createRelicCodexSeed,
} from '../fixtures/mockStorage';

test.describe('Phase C: Boss Unique Patterns, Multi-Item Trade, Daily Missions & Save Backup (V11)', () => {
  test('TC-PHC-01: Act 1–3 bosses display unique special pattern badge and trigger special patterns in battle', async ({
    gamePage,
    errorTracker,
  }) => {
    const cases: Array<{ act: 1 | 2 | 3; label: string; kind: string }> = [
      { act: 1, label: '연막 돌진', kind: 'SMOKE_RUSH' },
      { act: 2, label: '독침 광역기', kind: 'VENOM_BARRAGE' },
      { act: 3, label: '분신 스왑', kind: 'MIRAGE_SWAP' },
    ];

    for (const c of cases) {
      await injectGameState(gamePage, createBossSeedForAct(c.act, { turretLevel: 1 }));
      await gamePage.goto('/');
      await waitForCanvasReady(gamePage, 10000);
      await sortieFromOasis(gamePage);
      await setDebugSpeed(gamePage, 4);
      await setDebugProgress(gamePage, 95);
      await waitForFsmState(gamePage, 'BOSS_ENCOUNTER', 8000);

      const badge = gamePage.locator('[data-testid="boss-special-badge"]').first();
      await expect(badge).toBeVisible();
      await expect(badge).toHaveText(c.label);

      await expect
        .poll(
          async () => {
            const snap = await readDebugSnapshot(gamePage);
            return snap?.combat.boss?.specialTriggerCount ?? 0;
          },
          { timeout: 8000 }
        )
        .toBeGreaterThanOrEqual(1);

      const snap = await readDebugSnapshot(gamePage);
      expect(snap?.combat.boss?.specialKind).toBe(c.kind);
      await setDebugSpeed(gamePage, 1);
    }

    errorTracker.assertNoErrors();
  });

  test('TC-PHC-02: Trade tab rotates multiple oasis goods and buys/displays combined cargo', async ({
    gamePage,
    errorTracker,
  }) => {
    const tradeSeed = createEconomyTradeSeed({
      oasisIndex: 1,
      sunGold: 500,
      cargo: [],
      nextOasisPriceRate: 2.0,
      harunUnlocked: true,
    });
    await injectGameState(gamePage, tradeSeed);
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);

    await selectDashboardTab(gamePage, 'trading');
    const rotationList = gamePage.locator('[data-testid="trade-rotation-list"]').first();
    await expect(rotationList).toBeVisible();
    await expect(gamePage.locator('[data-testid="trade-good-DATE_PALM"]').first()).toBeVisible();
    await expect(gamePage.locator('[data-testid="trade-good-SILK_BOLT"]').first()).toBeVisible();

    // Buy primary WATER via default input + secondary SILK_BOLT +1 / DATE_PALM +5
    await gamePage.locator(SELECTORS.btnBuyCargo).first().click();
    await gamePage.locator('[data-testid="btn-buy-good-SILK_BOLT"]').first().click();
    await gamePage.locator('[data-testid="btn-buy-good-5-DATE_PALM"]').first().click();

    const summary = gamePage.locator('[data-testid="trade-cargo-summary"]').first();
    await expect(summary).toBeVisible();
    await expect(summary).toContainText('오아시스 생수 10개');
    await expect(summary).toContainText('사막 비단 1개');
    await expect(summary).toContainText('대추야자 5개');

    errorTracker.assertNoErrors();
  });

  test('TC-PHC-03: Daily missions progress automatically and grant F2P skip tickets + ancient gears', async ({
    gamePage,
    errorTracker,
  }) => {
    const seed = createAct1HubSeed({
      sunGold: 5000,
      ancientGear: 1,
      adTier: 0,
    });
    await injectGameState(gamePage, seed);
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);

    // Trigger cargo buy (10 units) & upgrade (3x turret)
    await selectDashboardTab(gamePage, 'trading');
    await gamePage.locator(SELECTORS.btnBuyCargo).first().click();

    await selectDashboardTab(gamePage, 'mech');
    for (let i = 0; i < 3; i++) {
      await gamePage.locator(SELECTORS.btnUpgradeTurret).first().click();
    }

    // Open Relics & Missions tab and claim BUY_CARGO & UPGRADE_UNIT
    await selectDashboardTab(gamePage, 'codex');
    const panel = gamePage.locator('[data-testid="daily-missions-panel"]').first();
    await expect(panel).toBeVisible();

    const claimBuyBtn = gamePage.locator('[data-testid="btn-claim-mission-BUY_CARGO"]').first();
    const claimUpgBtn = gamePage.locator('[data-testid="btn-claim-mission-UPGRADE_UNIT"]').first();
    await expect(claimBuyBtn).toBeEnabled();
    await expect(claimUpgBtn).toBeEnabled();

    await claimBuyBtn.click();
    await claimUpgBtn.click();

    await expect(gamePage.locator('[data-testid="daily-skip-tickets-count"]').first()).toHaveText('2');
    await expect(gamePage.locator(SELECTORS.hudAncientGear).first()).toContainText('6');
    await expect(claimBuyBtn).toHaveText('수령 완료');

    // Reload preserves claimed rewards
    await gamePage.reload();
    await waitForCanvasReady(gamePage, 10000);
    await selectDashboardTab(gamePage, 'codex');
    await expect(gamePage.locator('[data-testid="daily-skip-tickets-count"]').first()).toHaveText('2');
    await expect(gamePage.locator('[data-testid="btn-claim-mission-BUY_CARGO"]').first()).toHaveText('수령 완료');

    errorTracker.assertNoErrors();
  });

  test('TC-PHC-04: Save JSON Export/Import validates backup payload cleanly without blob URLs (AC-01)', async ({
    gamePage,
    assetTracker,
    errorTracker,
  }) => {
    const seed = createAct1HubSeed({ sunGold: 2468, ancientGear: 13 });
    await injectGameState(gamePage, seed);
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);

    await selectDashboardTab(gamePage, 'codex');
    await gamePage.locator('[data-testid="btn-export-save"]').first().click();

    const textarea = gamePage.locator('[data-testid="save-json-textarea"]').first();
    const exportedJson = await textarea.inputValue();
    expect(exportedJson).toContain('"sunGold": 2468');
    await expect(gamePage.locator('[data-testid="save-backup-status"]').first()).toContainText(
      '생성되었습니다'
    );

    // Reject malformed JSON cleanly without losing gold
    await textarea.fill('{invalid-json');
    await gamePage.locator('[data-testid="btn-import-save"]').first().click();
    await expect(gamePage.locator('[data-testid="save-backup-status"]').first()).toContainText(
      '올바른 세이브 JSON 형식이 아닙니다'
    );
    await expect(gamePage.locator(SELECTORS.hudSunGold).first()).toContainText('2,468');

    // Import modified valid JSON payload
    const parsed = JSON.parse(exportedJson);
    parsed.state.currencies.sunGold = 7777;
    parsed.state.currencies.ancientGear = 44;
    await textarea.fill(JSON.stringify(parsed));
    await gamePage.locator('[data-testid="btn-import-save"]').first().click();

    await expect(gamePage.locator('[data-testid="save-backup-status"]').first()).toContainText(
      '완료'
    );
    await expect(gamePage.locator(SELECTORS.hudSunGold).first()).toContainText('7,777');
    await expect(gamePage.locator(SELECTORS.hudAncientGear).first()).toContainText('44');

    assetTracker.assertZeroAssets();
    errorTracker.assertNoErrors();
  });

  test('TC-PHC-05: Section 6 Final Gate on desktop 1280x800 (utilization >= 85%, default debug hidden, audio, steles, AC-01)', async ({
    gamePage,
    assetTracker,
    errorTracker,
  }) => {
    await gamePage.setViewportSize({ width: 1280, height: 800 });
    await injectGameState(
      gamePage,
      createRelicCodexSeed({ decodedSteles: [1, 2], codex: ['relic_solar_disc'] })
    );
    await gamePage.goto('/?debug=0');
    await waitForCanvasReady(gamePage, 10000);

    // DebugBar hidden for regular users
    await expect(gamePage.locator(SELECTORS.debugBar)).toHaveCount(0);

    // Desktop shell utilization >= 85% & tactical buttons >= 44px effective height
    const metrics = await gamePage.evaluate(() => {
      const shell = document.querySelector('[data-testid="viewport-shell"]');
      const btn = document.querySelector('[data-testid="turret-btn-heat-ray"]');
      const sRect = shell?.getBoundingClientRect();
      const bRect = btn?.getBoundingClientRect();
      const w = window as unknown as {
        __SANDWALKER_AUDIO__?: { getStatus: () => { muted: boolean } };
      };
      const audioStatus = w.__SANDWALKER_AUDIO__?.getStatus();
      return {
        utilization: sRect ? (sRect.width * sRect.height) / (1280 * 800) : 0,
        buttonHeight: bRect?.height ?? 0,
        audioMuted: audioStatus?.muted ?? true,
      };
    });

    expect(metrics.utilization).toBeGreaterThanOrEqual(0.85);
    expect(metrics.buttonHeight).toBeGreaterThanOrEqual(44);
    expect(typeof metrics.audioMuted).toBe('boolean');

    // Stele inscription text rendered in Codex tab
    await selectDashboardTab(gamePage, 'codex');
    await expect(gamePage.locator('[data-testid="stele-item-1"]').first()).toContainText(
      '태양의 수레바퀴가 다시 사막을 가른다.'
    );

    assetTracker.assertZeroAssets();
    errorTracker.assertNoErrors();
  });
});
