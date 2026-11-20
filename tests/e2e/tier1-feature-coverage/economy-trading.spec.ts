// ============================================================================
// File: tests/e2e/tier1-feature-coverage/economy-trading.spec.ts
// Milestone E1-B: Tier 1 Feature Coverage — Features 31..33 (18 Tests)
//   - F31: Oasis Cargo Trading Loop (TC-ECON-01..06)
//   - F32: Double Progression Upgrades & Codex (TC-ECON-07..13)
//   - F33: Visual Tier Evolutions & Pharaoh Skin (TC-ECON-14..18)
// Adheres strictly to Opaque-Box E2E rule (zero src/ or @/ imports).
// ============================================================================

import { Page } from '@playwright/test';
import { test, expect } from '../fixtures/appFixture';
import {
  SELECTORS,
  mercCardSelector,
  waitForCanvasReady,
  waitForSteadyState,
  readZoneAHud,
  waitForFsmState,
  sortieFromOasis,
  readDebugSnapshot,
  sampleCanvasRegionStats,
  measureObservedRouteSpeedPxPerSec,
  setDebugSpeed,
  setDebugProgress,
  selectDashboardTab,
  buyTradeCargo,
  readTradePanelState,
  readSettlementProfit,
  dismissSettlement,
  upgradePart,
  upgradeMercenary,
  appraiseRelic,
  readCodexState,
  waitForAndCloseAdModal,
} from '../fixtures/testHelpers';
import {
  injectGameState,
  readCurrentStoredState,
  createAct1HubSeed,
  createEconomyTradeSeed,
  createUpgradeProgressionSeed,
  createRelicCodexSeed,
} from '../fixtures/mockStorage';

interface LogicalRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const R_TURRET: LogicalRect = { x: 170, y: 295, width: 65, height: 48 };
const R_WALKER_LEGS: LogicalRect = { x: 145, y: 358, width: 105, height: 60 };
const R_REAR_WAGONS: LogicalRect = { x: 3, y: 375, width: 150, height: 48 };
const R_WAGON_1: LogicalRect = { x: 118, y: 385, width: 35, height: 28 };
const R_WAGON_1_CANOPY: LogicalRect = { x: 120, y: 387, width: 16, height: 9 };

type PixelPredicate = 'cyanGlow' | 'wagonDarkBed' | 'pharaohPurple' | 'goldTrim' | 'legArmorMetal';

async function countMatchingCanvasPixels(
  page: Page,
  rect: LogicalRect,
  kind: PixelPredicate
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
        } else if (predicateKind === 'legArmorMetal') {
          if (b >= r - 5 && r < 140) count++;
        }
      }
      return count;
    },
    { selector: SELECTORS.gameCanvas, region: rect, predicateKind: kind }
  );
}

// ============================================================================
// Feature 31: Oasis Cargo Trading Loop (TC-ECON-01..06)
// ============================================================================
test.describe('Tier 1: Feature 31 — Oasis Cargo Trading Loop', () => {
  test('TC-ECON-01: Oasis 1..3 specialty names and buy prices bind correctly (생수 1G, 전갈 해독제 3G, 태양석 8G) (F31)', async ({
    gamePage,
    errorTracker,
  }) => {
    const expectedOases = [
      { oasisIndex: 1, nameMatch: '생수', price: 1 },
      { oasisIndex: 2, nameMatch: '전갈 해독제', price: 3 },
      { oasisIndex: 3, nameMatch: '태양석', price: 8 },
    ];

    for (const entry of expectedOases) {
      await injectGameState(
        gamePage,
        createEconomyTradeSeed({ oasisIndex: entry.oasisIndex, sunGold: 500 })
      );
      await gamePage.goto('/');
      await waitForCanvasReady(gamePage, 10000);
      await waitForFsmState(gamePage, 'OASIS_HUB', 5000);

      const panel = await readTradePanelState(gamePage);
      expect(panel.specialtyName).toContain(entry.nameMatch);
      expect(panel.buyPrice).toBe(entry.price);
    }

    errorTracker.assertNoErrors();
  });

  test('TC-ECON-02: Buying specific quantity and Max button fill up to cargoCapacity (50 * wagonCount) (F31)', async ({
    gamePage,
    errorTracker,
  }) => {
    await injectGameState(
      gamePage,
      createEconomyTradeSeed({ sunGold: 500, oasisIndex: 1, wagonCount: 2 })
    );
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await waitForFsmState(gamePage, 'OASIS_HUB', 5000);

    await buyTradeCargo(gamePage, 30);

    let snap = await readDebugSnapshot(gamePage);
    expect(snap?.trade?.cargo[0]?.qty).toBe(30);
    expect(snap?.currencies.sunGold).toBe(470);

    let panel = await readTradePanelState(gamePage);
    expect(panel.usedCapacity).toBe(30);
    expect(panel.maxCapacity).toBe(100);

    await buyTradeCargo(gamePage, 'max');

    snap = await readDebugSnapshot(gamePage);
    expect(snap?.trade?.cargo.reduce((sum, item) => sum + item.qty, 0)).toBe(100);
    expect(snap?.currencies.sunGold).toBe(400);

    panel = await readTradePanelState(gamePage);
    expect(panel.usedCapacity).toBe(100);
    expect(panel.maxCapacity).toBe(100);

    errorTracker.assertNoErrors();
  });

  test('TC-ECON-03: Rejects cargo purchase exceeding sunGold or cargoCapacity (F31)', async ({
    gamePage,
    errorTracker,
  }) => {
    // Insufficient sunGold (20G trying to buy 10 units of 8G 태양석)
    await injectGameState(
      gamePage,
      createEconomyTradeSeed({ sunGold: 20, oasisIndex: 3, wagonCount: 1 })
    );
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await waitForFsmState(gamePage, 'OASIS_HUB', 5000);

    await selectDashboardTab(gamePage, 'trading');
    const qtyInput1 = gamePage.locator(SELECTORS.tradeCargoQtyInput).first();
    await qtyInput1.waitFor({ state: 'visible', timeout: 5000 });
    await qtyInput1.fill('10');
    const buyBtn1 = gamePage.locator(SELECTORS.btnBuyCargo).first();
    if (await buyBtn1.isEnabled().catch(() => false)) {
      await buyBtn1.click();
    }

    const lowGoldSnap = await readDebugSnapshot(gamePage);
    expect(lowGoldSnap!.currencies.sunGold).toBeGreaterThanOrEqual(0);
    const lowGoldQty = (lowGoldSnap!.trade?.cargo ?? []).reduce((s, c) => s + c.qty, 0);
    expect(lowGoldQty).toBeLessThanOrEqual(2);

    // Exceeds cargoCapacity (500G trying to buy 60 units when capacity is 50)
    await injectGameState(
      gamePage,
      createEconomyTradeSeed({ sunGold: 500, oasisIndex: 1, wagonCount: 1 })
    );
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await waitForFsmState(gamePage, 'OASIS_HUB', 5000);

    await selectDashboardTab(gamePage, 'trading');
    const qtyInput2 = gamePage.locator(SELECTORS.tradeCargoQtyInput).first();
    await qtyInput2.waitFor({ state: 'visible', timeout: 5000 });
    await qtyInput2.fill('60');
    const buyBtn2 = gamePage.locator(SELECTORS.btnBuyCargo).first();
    if (await buyBtn2.isEnabled().catch(() => false)) {
      await buyBtn2.click();
    }

    const capSnap = await readDebugSnapshot(gamePage);
    const totalQty = (capSnap!.trade?.cargo ?? []).reduce((s, c) => s + c.qty, 0);
    expect(totalQty).toBeLessThanOrEqual(capSnap!.sandwalker.cargoCapacity);
    expect(capSnap!.currencies.sunGold).toBeGreaterThanOrEqual(450);

    errorTracker.assertNoErrors();
  });

  test('TC-ECON-04: Arrival Settlement sells cargo with surge rate (2.5x) and Harun (+25%) bonus (F31)', async ({
    gamePage,
    errorTracker,
  }) => {
    const seed = createEconomyTradeSeed({
      sunGold: 100,
      oasisIndex: 1,
      cargo: [{ goodsId: 'WATER', qty: 40, buyPrice: 1 }],
      nextOasisPriceRate: 2.5,
      harunUnlocked: true,
    });
    seed.sandwalker.turretLevels = { HEAT_RAY: 25, HARPOON: 25, MORTAR: 25 };
    seed.sandwalker.turretTiers = { HEAT_RAY: 3, HARPOON: 3, MORTAR: 3 };
    seed.sandwalker.activeTurret = 'HARPOON';
    seed.monetization.adTier = 3;
    seed.monetization.dailySkipTicketsLeft = 9999;

    await injectGameState(gamePage, seed);
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await sortieFromOasis(gamePage);

    await setDebugSpeed(gamePage, 4);
    await setDebugProgress(gamePage, 95);
    await waitForFsmState(gamePage, 'OASIS_SETTLEMENT', 25000);

    await expect(gamePage.locator(SELECTORS.settlementModal).first()).toBeVisible();
    const displayedProfit = await readSettlementProfit(gamePage);
    // floor(40 * 1 * 2.5 * 1.25) = 125
    expect(displayedProfit).toBe(125);

    const settleSnap = await readDebugSnapshot(gamePage);
    expect(settleSnap!.trade?.cargo.length ?? 0).toBe(0);
    expect(settleSnap!.currencies.sunGold).toBeGreaterThanOrEqual(225);

    errorTracker.assertNoErrors();
  });

  test('TC-ECON-05: Settlement Zafar 2x button grants extra +totalProfit once via Rewarded Ad (F31)', async ({
    gamePage,
    errorTracker,
  }) => {
    const seed = createEconomyTradeSeed({
      sunGold: 100,
      oasisIndex: 1,
      cargo: [{ goodsId: 'WATER', qty: 40, buyPrice: 1 }],
      nextOasisPriceRate: 2.5,
      harunUnlocked: true,
    });
    seed.sandwalker.turretLevels = { HEAT_RAY: 25, HARPOON: 25, MORTAR: 25 };
    seed.sandwalker.turretTiers = { HEAT_RAY: 3, HARPOON: 3, MORTAR: 3 };
    seed.sandwalker.activeTurret = 'HARPOON';
    seed.monetization.adTier = 3;
    seed.monetization.dailySkipTicketsLeft = 9999;

    await injectGameState(gamePage, seed);
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await sortieFromOasis(gamePage);

    await setDebugSpeed(gamePage, 4);
    await setDebugProgress(gamePage, 95);
    await waitForFsmState(gamePage, 'OASIS_SETTLEMENT', 25000);

    const modal = gamePage.locator(SELECTORS.settlementModal).first();
    await expect(modal).toBeVisible();

    const preZafarGold = (await readDebugSnapshot(gamePage))!.currencies.sunGold;
    const zafarBtn = modal.locator(SELECTORS.zafarDoubleBtn).first();
    await expect(zafarBtn).toBeEnabled();
    await zafarBtn.click();
    await waitForAndCloseAdModal(gamePage, { optional: true, timeoutMs: 5000 });

    const postZafarGold = (await readDebugSnapshot(gamePage))!.currencies.sunGold;
    expect(postZafarGold).toBe(preZafarGold + 125);

    // Zafar 2x can only be claimed once per settlement
    const stillVisible = await zafarBtn.isVisible().catch(() => false);
    if (stillVisible) {
      await expect(zafarBtn).toBeDisabled();
    }

    await gamePage.locator(SELECTORS.settlementProceedBtn).first().click();
    await waitForAndCloseAdModal(gamePage, { optional: true, timeoutMs: 3000 });
    await waitForFsmState(gamePage, 'OASIS_HUB', 5000);

    errorTracker.assertNoErrors();
  });

  test('TC-ECON-06: Settlement proceed rolls nextOasisPriceRate in [1.5, 3.0], updates surge badge, and advances Act (F31)', async ({
    gamePage,
    errorTracker,
  }) => {
    const seed = createEconomyTradeSeed({
      sunGold: 100,
      oasisIndex: 2,
      cargo: [{ goodsId: 'ANTIDOTE', qty: 10, buyPrice: 3 }],
      nextOasisPriceRate: 2.0,
    });
    seed.sandwalker.turretLevels = { HEAT_RAY: 25, HARPOON: 25, MORTAR: 25 };
    seed.sandwalker.turretTiers = { HEAT_RAY: 3, HARPOON: 3, MORTAR: 3 };
    seed.sandwalker.activeTurret = 'HARPOON';
    seed.monetization.adTier = 3;
    seed.monetization.dailySkipTicketsLeft = 9999;

    await injectGameState(gamePage, seed);
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await sortieFromOasis(gamePage);

    await setDebugSpeed(gamePage, 4);
    await setDebugProgress(gamePage, 95);
    await waitForFsmState(gamePage, 'OASIS_SETTLEMENT', 25000);

    await dismissSettlement(gamePage, { closeAdModal: true, timeoutMs: 10000 });

    const hubSnap = await readDebugSnapshot(gamePage);
    expect(hubSnap!.meta.currentOasisIndex).toBe(3);
    expect(hubSnap!.meta.currentAct).toBe(2);
    const rate = hubSnap!.trade!.nextOasisPriceRate;
    expect(rate).toBeGreaterThanOrEqual(1.5);
    expect(rate).toBeLessThanOrEqual(3.0);

    const hud = await readZoneAHud(gamePage);
    if (hud.surgePercent !== undefined) {
      expect(hud.surgePercent).toBeGreaterThanOrEqual(150);
      expect(hud.surgePercent).toBeLessThanOrEqual(300);
    }

    errorTracker.assertNoErrors();
  });
});

// ============================================================================
// Feature 32: Double Progression Upgrades & Codex (TC-ECON-07..13)
// ============================================================================
test.describe('Tier 1: Feature 32 — Double Progression Upgrades & Codex', () => {
  test('TC-ECON-07: Turret Sun Gold upgrades follow round(50 * 1.18^(n-1)) curve (50, 59, 70 -> next 82) (F32)', async ({
    gamePage,
    errorTracker,
  }) => {
    await injectGameState(gamePage, createUpgradeProgressionSeed({ sunGold: 500 }));
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await waitForFsmState(gamePage, 'OASIS_HUB', 5000);

    await upgradePart(gamePage, 'turret', 3);

    const snap = await readDebugSnapshot(gamePage);
    expect(snap!.sandwalker.turretLevels.HEAT_RAY).toBe(4);
    // 500 - (50 + 59 + 70) = 321
    expect(snap!.currencies.sunGold).toBe(321);

    await expect(gamePage.locator(SELECTORS.turretLevelText).first()).toContainText('4');
    await expect(gamePage.locator(SELECTORS.turretUpgradeCost).first()).toContainText('82');

    errorTracker.assertNoErrors();
  });

  test('TC-ECON-08: Lv10 Tier cap blocks gold upgrade until Tier-Up spends 5 * tier Ancient Gear (F32)', async ({
    gamePage,
    errorTracker,
  }) => {
    await injectGameState(
      gamePage,
      createUpgradeProgressionSeed({
        sunGold: 1000,
        ancientGear: 10,
        turretLevels: { HEAT_RAY: 10, HARPOON: 1, MORTAR: 1 },
        turretTiers: { HEAT_RAY: 1, HARPOON: 1, MORTAR: 1 },
      })
    );
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await waitForFsmState(gamePage, 'OASIS_HUB', 5000);

    await selectDashboardTab(gamePage, 'mech');
    const upgradeBtn = gamePage.locator(SELECTORS.btnUpgradeTurret).first();
    if (await upgradeBtn.isEnabled().catch(() => false)) {
      await upgradeBtn.click();
    }

    let snap = await readDebugSnapshot(gamePage);
    expect(snap!.sandwalker.turretLevels.HEAT_RAY).toBe(10);
    expect(snap!.sandwalker.turretTiers.HEAT_RAY).toBe(1);

    await upgradePart(gamePage, 'turret-tier', 1);

    snap = await readDebugSnapshot(gamePage);
    expect(snap!.sandwalker.turretTiers.HEAT_RAY).toBe(2);
    expect(snap!.currencies.ancientGear).toBe(5);
    await expect(gamePage.locator(SELECTORS.turretTierText).first()).toContainText('2');

    await upgradePart(gamePage, 'turret', 1);
    snap = await readDebugSnapshot(gamePage);
    expect(snap!.sandwalker.turretLevels.HEAT_RAY).toBe(11);

    errorTracker.assertNoErrors();
  });

  test('TC-ECON-09: Leg upgrade increments legPartLevel, deducts Gold, and updates UI text (F32)', async ({
    gamePage,
    errorTracker,
  }) => {
    await injectGameState(
      gamePage,
      createUpgradeProgressionSeed({ sunGold: 300, legPartLevel: 1 })
    );
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await waitForFsmState(gamePage, 'OASIS_HUB', 5000);

    await upgradePart(gamePage, 'legs', 2);

    const snap = await readDebugSnapshot(gamePage);
    expect(snap!.sandwalker.legPartLevel).toBe(3);
    expect(snap!.currencies.sunGold).toBe(191); // 300 - 50 - 59

    await expect(gamePage.locator(SELECTORS.legLevelText).first()).toContainText('3');
    await expect(gamePage.locator(SELECTORS.legUpgradeCost).first()).toContainText('70');

    errorTracker.assertNoErrors();
  });

  test('TC-ECON-10: Add Wagon costs 5 * wagonCount Gears, scales cargoCapacity (+50 each), and caps at 5 (F32)', async ({
    gamePage,
    errorTracker,
  }) => {
    await injectGameState(
      gamePage,
      createUpgradeProgressionSeed({ ancientGear: 60, wagonCount: 1 })
    );
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await waitForFsmState(gamePage, 'OASIS_HUB', 5000);

    await upgradePart(gamePage, 'wagon', 4);

    let snap = await readDebugSnapshot(gamePage);
    expect(snap!.sandwalker.wagonCount).toBe(5);
    expect(snap!.sandwalker.cargoCapacity).toBe(250);
    // 60 - (5 + 10 + 15 + 20) = 10
    expect(snap!.currencies.ancientGear).toBe(10);
    await expect(gamePage.locator(SELECTORS.wagonCountText).first()).toContainText('5');

    // 5th click blocked / disabled at max 5 wagons
    const addWagonBtn = gamePage.locator(SELECTORS.btnAddWagon).first();
    if (await addWagonBtn.isEnabled().catch(() => false)) {
      await addWagonBtn.click();
    }
    snap = await readDebugSnapshot(gamePage);
    expect(snap!.sandwalker.wagonCount).toBe(5);
    expect(snap!.currencies.ancientGear).toBe(10);

    errorTracker.assertNoErrors();
  });

  test('TC-ECON-11: Mercenary upgrade scales level and deducts upgradeCost(n) Gold (F32)', async ({
    gamePage,
    errorTracker,
  }) => {
    await injectGameState(
      gamePage,
      createUpgradeProgressionSeed({ sunGold: 200 })
    );
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await waitForFsmState(gamePage, 'OASIS_HUB', 5000);

    await upgradeMercenary(gamePage, 'sera', 2);

    const snap = await readDebugSnapshot(gamePage);
    const sera = snap!.mercenaries.find((m) => m.id === 'sera');
    expect(sera?.level).toBe(3);
    expect(snap!.currencies.sunGold).toBe(91); // 200 - 50 - 59

    await expect(gamePage.locator(mercCardSelector('sera')).first()).toContainText('3');

    errorTracker.assertNoErrors();
  });

  test('TC-ECON-12: Codex Relic appraisal resolves ready relics and instant ad appraisal resolves pending relics (F32)', async ({
    gamePage,
    errorTracker,
  }) => {
    const now = Date.now();
    await injectGameState(
      gamePage,
      createRelicCodexSeed({
        pending: [
          { id: 'relic_solar_disc', appraiseEndsAt: now + 60_000 },
          { id: 'relic_ankh', appraiseEndsAt: now - 1_000 },
        ],
        codex: [],
        adTier: 3,
        ancientGear: 0,
      })
    );
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await waitForFsmState(gamePage, 'OASIS_HUB', 5000);

    await appraiseRelic(gamePage, false);
    let snap = await readDebugSnapshot(gamePage);
    expect(snap!.relics?.codex).toContain('relic_ankh');
    expect(snap!.currencies.ancientGear).toBeGreaterThan(0);

    const gearAfterFirst = snap!.currencies.ancientGear;
    await appraiseRelic(gamePage, true);

    snap = await readDebugSnapshot(gamePage);
    expect(snap!.relics?.codex).toContain('relic_solar_disc');
    expect(snap!.relics?.pending.length).toBe(0);
    expect(snap!.currencies.ancientGear).toBeGreaterThan(gearAfterFirst);

    const codexState = await readCodexState(gamePage);
    expect(codexState.relicCount).toBe(2);

    errorTracker.assertNoErrors();
  });

  test('TC-ECON-13: Stele Codex displays decoded steles progress in codex-stele-list (F32)', async ({
    gamePage,
    errorTracker,
  }) => {
    await injectGameState(
      gamePage,
      createRelicCodexSeed({
        pending: [],
        decodedSteles: [1, 2],
      })
    );
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await waitForFsmState(gamePage, 'OASIS_HUB', 5000);

    const codexState = await readCodexState(gamePage);
    expect(codexState.decodedCount).toBe(2);
    expect(codexState.decodedTotal).toBe(12);
    await expect(gamePage.locator(SELECTORS.codexSteleList).first()).toContainText('2 / 12');

    errorTracker.assertNoErrors();
  });
});

// ============================================================================
// Feature 33: Visual Tier Evolutions & Pharaoh Skin (TC-ECON-14..18)
// ============================================================================
test.describe('Tier 1: Feature 33 — Visual Tier Evolutions & Pharaoh Skin', () => {
  test('TC-ECON-14: Turret Tier 1 -> 2 -> 3 at Lv10/11/21 visibly evolves Zone B turret barrel rendering (F33)', async ({
    gamePage,
    errorTracker,
  }) => {
    await injectGameState(
      gamePage,
      createUpgradeProgressionSeed({
        sunGold: 80000,
        ancientGear: 30,
        turretLevels: { HEAT_RAY: 10, HARPOON: 1, MORTAR: 1 },
        turretTiers: { HEAT_RAY: 1, HARPOON: 1, MORTAR: 1 },
      })
    );
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await waitForSteadyState(gamePage, 350);

    const t1Stats = await sampleCanvasRegionStats(gamePage, R_TURRET);

    await upgradePart(gamePage, 'turret-tier', 1);
    await upgradePart(gamePage, 'turret', 1);
    await waitForSteadyState(gamePage, 250);
    const t2Stats = await sampleCanvasRegionStats(gamePage, R_TURRET);
    expect(t2Stats.hash).not.toBe(t1Stats.hash);

    await upgradePart(gamePage, 'turret', 9);
    await upgradePart(gamePage, 'turret-tier', 1);
    await upgradePart(gamePage, 'turret', 1);
    await waitForSteadyState(gamePage, 250);
    const t3Stats = await sampleCanvasRegionStats(gamePage, R_TURRET);
    expect(t3Stats.hash).not.toBe(t2Stats.hash);
    expect(t3Stats.hash).not.toBe(t1Stats.hash);

    const snap = await readDebugSnapshot(gamePage);
    expect(snap!.sandwalker.turretLevels.HEAT_RAY).toBe(21);
    expect(snap!.sandwalker.turretTiers.HEAT_RAY).toBe(3);

    errorTracker.assertNoErrors();
  });

  test('TC-ECON-15: Leg Lv1 vs Lv11+ evolves leg armor & cyan glow and grants Act 2 Quicksand immunity (F33)', async ({
    gamePage,
    errorTracker,
  }) => {
    await injectGameState(
      gamePage,
      createUpgradeProgressionSeed({ sunGold: 50000, legPartLevel: 1 })
    );
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await waitForSteadyState(gamePage, 350);

    const lv1LegStats = await sampleCanvasRegionStats(gamePage, R_WALKER_LEGS);
    const lv1Cyan = await countMatchingCanvasPixels(gamePage, R_WALKER_LEGS, 'cyanGlow');

    await upgradePart(gamePage, 'legs', 10);
    await waitForSteadyState(gamePage, 250);

    const lv11LegStats = await sampleCanvasRegionStats(gamePage, R_WALKER_LEGS);
    const lv11Cyan = await countMatchingCanvasPixels(gamePage, R_WALKER_LEGS, 'cyanGlow');

    expect(lv11LegStats.hash).not.toBe(lv1LegStats.hash);
    expect(lv11Cyan).toBeGreaterThan(lv1Cyan);
    expect(lv11Cyan).toBeGreaterThan(20);

    // Mechanical verification in Act 2 Quicksand
    const act2Seed = createAct1HubSeed({ legPartLevel: 11 });
    act2Seed.meta.currentAct = 2;
    await injectGameState(gamePage, act2Seed);
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await sortieFromOasis(gamePage);
    await setDebugProgress(gamePage, 45);
    await waitForFsmState(gamePage, 'HAZARD_ZONE', 5000);

    const speed = await measureObservedRouteSpeedPxPerSec(gamePage, 2000);
    expect(speed).toBeGreaterThanOrEqual(105);
    expect(speed).toBeLessThanOrEqual(135);
    expect((await readDebugSnapshot(gamePage))?.combat.isQuicksandBypassed).toBe(true);

    errorTracker.assertNoErrors();
  });

  test('TC-ECON-16: Wagon count 1 -> 3 -> 5 renders additional trailing wagons in rear Zone B region (F33)', async ({
    gamePage,
    errorTracker,
  }) => {
    await injectGameState(
      gamePage,
      createUpgradeProgressionSeed({ ancientGear: 60, wagonCount: 1 })
    );
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await waitForSteadyState(gamePage, 350);

    const w1Dark = await countMatchingCanvasPixels(gamePage, R_REAR_WAGONS, 'wagonDarkBed');

    await upgradePart(gamePage, 'wagon', 2);
    await waitForSteadyState(gamePage, 250);
    const w3Dark = await countMatchingCanvasPixels(gamePage, R_REAR_WAGONS, 'wagonDarkBed');
    expect(w3Dark).toBeGreaterThan(w1Dark + 80);

    await upgradePart(gamePage, 'wagon', 2);
    await waitForSteadyState(gamePage, 250);
    const w5Dark = await countMatchingCanvasPixels(gamePage, R_REAR_WAGONS, 'wagonDarkBed');
    expect(w5Dark).toBeGreaterThan(w3Dark + 80);

    const snap = await readDebugSnapshot(gamePage);
    expect(snap!.sandwalker.wagonCount).toBe(5);

    errorTracker.assertNoErrors();
  });

  test('TC-ECON-17: Golden Pharaoh Skin equips via UI and immediately shifts walker/wagon canvas palette (F33)', async ({
    gamePage,
    errorTracker,
  }) => {
    await injectGameState(gamePage, createAct1HubSeed());
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await waitForSteadyState(gamePage, 350);

    const beforeStats = await sampleCanvasRegionStats(gamePage, R_WAGON_1);
    const beforePurple = await countMatchingCanvasPixels(gamePage, R_WAGON_1_CANOPY, 'pharaohPurple');
    expect(beforePurple).toBe(0);

    await upgradePart(gamePage, 'skin-pharaoh', 1);
    await waitForSteadyState(gamePage, 250);

    const snap = await readDebugSnapshot(gamePage);
    expect(snap!.monetization?.equippedSkinId).toBe('GOLDEN_PHARAOH');

    const afterStats = await sampleCanvasRegionStats(gamePage, R_WAGON_1);
    const afterPurple = await countMatchingCanvasPixels(gamePage, R_WAGON_1_CANOPY, 'pharaohPurple');
    const afterGold = await countMatchingCanvasPixels(gamePage, R_WAGON_1_CANOPY, 'goldTrim');

    expect(afterStats.hash).not.toBe(beforeStats.hash);
    expect(afterPurple).toBeGreaterThan(20);
    expect(afterGold).toBeGreaterThan(10);

    errorTracker.assertNoErrors();
  });

  test('TC-ECON-18: Visual Tier upgrades and Golden Pharaoh Skin persist across LocalStorage reload (F33)', async ({
    gamePage,
    errorTracker,
  }) => {
    await injectGameState(
      gamePage,
      createUpgradeProgressionSeed({ ancientGear: 30, wagonCount: 1, skinId: 'DEFAULT' })
    );
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await waitForFsmState(gamePage, 'OASIS_HUB', 5000);

    await upgradePart(gamePage, 'wagon', 1);
    await upgradePart(gamePage, 'skin-pharaoh', 1);

    await gamePage.evaluate(() => {
      window.dispatchEvent(new Event('pagehide'));
    });

    const storedBeforeReload = await readCurrentStoredState(gamePage);
    expect(storedBeforeReload?.sandwalker.wagonCount).toBe(2);
    expect(storedBeforeReload?.monetization.equippedSkinId).toBe('GOLDEN_PHARAOH');

    await gamePage.reload();
    await waitForCanvasReady(gamePage, 10000);
    await waitForFsmState(gamePage, 'OASIS_HUB', 5000);

    const snapAfterReload = await readDebugSnapshot(gamePage);
    expect(snapAfterReload!.sandwalker.wagonCount).toBe(2);
    expect(snapAfterReload!.monetization?.equippedSkinId).toBe('GOLDEN_PHARAOH');

    errorTracker.assertNoErrors();
  });
});
