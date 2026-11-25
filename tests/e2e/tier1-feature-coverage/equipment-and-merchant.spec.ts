// ============================================================================
// File: tests/e2e/tier1-feature-coverage/equipment-and-merchant.spec.ts
// Phase 3 Production Feature Coverage: 5-Mercenary Equipment, Wandering Merchant & Expedition Burst
// Adheres strictly to Opaque-Box E2E rule (zero src/ or @/ imports).
// ============================================================================

import { test, expect } from '../fixtures/appFixture';
import {
  SELECTORS,
  waitForCanvasReady,
  selectDashboardTab,
  readDebugSnapshot,
  sortieFromOasis,
  waitForFsmState,
  waitForAndCloseAdModal,
} from '../fixtures/testHelpers';
import {
  injectGameState,
  createEconomyTradeSeed,
  createAdTierSeed,
  createAllMercenariesSeed,
} from '../fixtures/mockStorage';

test.describe('Phase 3 Production: Mercenary Equipment, Wandering Merchant & Expedition Burst', () => {
  test('TC-MERC-EQ-01: Wandering Merchant purchase auto-equips mercenary gear, deducts Sun Gold & shows upgrade toast', async ({
    gamePage,
    errorTracker,
  }) => {
    const seed = createEconomyTradeSeed({
      sunGold: 5000,
      oasisIndex: 2,
      harunUnlocked: true,
    });
    await injectGameState(gamePage, seed);
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);

    await selectDashboardTab(gamePage, 'trading');
    await expect(gamePage.locator(SELECTORS.wanderingMerchantPanel)).toBeVisible();
    await expect(gamePage.locator(SELECTORS.merchantOffer(0))).toBeVisible();
    await expect(gamePage.locator(SELECTORS.merchantOffer(1))).toBeVisible();
    await expect(gamePage.locator(SELECTORS.merchantOffer(2))).toBeVisible();

    const beforeSnap = await readDebugSnapshot(gamePage);
    const goldBefore = beforeSnap?.currencies.sunGold ?? 0;

    // Offer 1 is always dedicated mercenary equipment
    const buyEquipBtn = gamePage.locator(SELECTORS.btnBuyMerchant(1));
    await expect(buyEquipBtn).toBeEnabled();
    await buyEquipBtn.click();

    await expect(buyEquipBtn).toHaveText('구매 완료');
    await expect(gamePage.locator(SELECTORS.autoUpgradeToast)).toBeVisible();

    const afterSnap = await readDebugSnapshot(gamePage);
    expect(afterSnap?.currencies.sunGold ?? goldBefore).toBeLessThan(goldBefore);
    const equippedKeys = Object.keys(afterSnap?.mercEquipment ?? {});
    expect(equippedKeys.length).toBeGreaterThanOrEqual(1);

    await selectDashboardTab(gamePage, 'mercenaries');
    const firstMercId = equippedKeys[0];
    await expect(gamePage.locator(SELECTORS.mercEquipBadge(firstMercId))).not.toContainText(
      '전용장비 미착용'
    );
    await expect(gamePage.locator(SELECTORS.mercEquipBadge(firstMercId))).toContainText('Lv.1');

    errorTracker.assertNoErrors();
  });

  test('TC-MERC-EQ-02: Wandering Merchant IAA Point 4 reroll shows ad modal on Tier 0 and bypasses ad modal on Tier 3', async ({
    gamePage,
    errorTracker,
  }) => {
    // Tier 0: should open Rewarded Ad simulator modal
    const tier0Seed = createAdTierSeed(0, 1200, 1, 2);
    tier0Seed.currencies.sunGold = 2000;
    tier0Seed.monetization.dailySkipTicketsLeft = 0;
    await injectGameState(gamePage, tier0Seed);
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);

    await selectDashboardTab(gamePage, 'trading');
    const offerBeforeText = await gamePage.locator(SELECTORS.merchantOffer(1)).innerText();

    await gamePage.locator(SELECTORS.btnMerchantReroll).click();
    await expect(gamePage.locator(SELECTORS.adSimModal)).toBeVisible({ timeout: 5000 });
    await waitForAndCloseAdModal(gamePage, 25000);

    await expect
      .poll(async () => await gamePage.locator(SELECTORS.merchantOffer(1)).innerText())
      .not.toBe(offerBeforeText);
    const rerolledText = await gamePage.locator(SELECTORS.merchantOffer(1)).innerText();
    expect(rerolledText).toMatch(/\[(희귀|전설|고대)\]/);

    // Tier 3: instant reroll with zero ad simulator popup
    const tier3Seed = createAdTierSeed(3, 1200, 1, 2);
    tier3Seed.currencies.sunGold = 2000;
    tier3Seed.monetization.dailySkipTicketsLeft = 0;
    await injectGameState(gamePage, tier3Seed);
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);

    await selectDashboardTab(gamePage, 'trading');
    const tier3Before = await gamePage.locator(SELECTORS.merchantOffer(1)).innerText();
    await gamePage.locator(SELECTORS.btnMerchantReroll).click();
    await expect(gamePage.locator(SELECTORS.adSimModal)).toHaveCount(0);
    await expect
      .poll(async () => await gamePage.locator(SELECTORS.merchantOffer(1)).innerText())
      .not.toBe(tier3Before);
    const tier3After = await gamePage.locator(SELECTORS.merchantOffer(1)).innerText();
    expect(tier3After).toMatch(/\[(희귀|전설|고대)\]/);

    errorTracker.assertNoErrors();
  });

  test('TC-MERC-EQ-03: 5-Mercenary Expedition Burst skill activates in tactical combat, emits toast & respects cooldown', async ({
    gamePage,
    errorTracker,
  }) => {
    const seed = createAllMercenariesSeed();
    await injectGameState(gamePage, seed);
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);

    await selectDashboardTab(gamePage, 'mercenaries');
    await expect(gamePage.locator(SELECTORS.mercenarySynergyStatus)).toContainText('활성');
    // In OASIS_HUB tactical burst button is disabled until sortie
    await expect(gamePage.locator(SELECTORS.btnExpeditionBurst)).toBeDisabled();

    await sortieFromOasis(gamePage);
    await waitForFsmState(gamePage, 'MARCH_NORMAL', 10000);

    await selectDashboardTab(gamePage, 'mercenaries');
    const burstBtn = gamePage.locator(SELECTORS.btnExpeditionBurst);
    await expect(burstBtn).toBeEnabled();
    await burstBtn.click();

    await expect(gamePage.locator(SELECTORS.autoUpgradeToast)).toBeVisible();
    await expect(gamePage.locator(SELECTORS.autoUpgradeToast)).toContainText('5인 합동 필살기');
    await expect(burstBtn).toBeDisabled();

    const snap = await readDebugSnapshot(gamePage);
    expect(snap?.combat.synergyActive).toBe(true);
    expect(snap?.combat.expeditionBurstCount).toBeGreaterThanOrEqual(1);
    expect(snap?.combat.expeditionBurstReady).toBe(false);

    errorTracker.assertNoErrors();
  });
});
