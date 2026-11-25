import { describe, it, expect, beforeEach } from 'vitest';
import { EventBus } from '@/engine/EventBus';
import { AutoUpgradeEngine } from '@/engine/systems/AutoUpgradeEngine';
import { CombatCoordinator } from '@/engine/systems/CombatCoordinator';
import { WanderingMerchantSystem } from '@/engine/systems/WanderingMerchantSystem';
import {
  computeMercEquipmentMultipliers,
  resolveEquipmentAcquisition,
} from '@/game/data/equipment';
import { useGameStore } from '@/store/gameStore';

describe('Phase 3: Mercenary Equipment, Wandering Merchant & Expedition Burst', () => {
  beforeEach(() => {
    useGameStore.getState().resetToDefaults();
    useGameStore.getState().setIntroCompleted(true);
  });

  it('equips initial gear, upgrades rarity, and levels up via duplicate dismantle XP', () => {
    const first = resolveEquipmentAcquisition(undefined, 'COMMON');
    expect(first.action).toBe('EQUIPPED');
    expect(first.nextSlot).toEqual({ rarity: 'COMMON', level: 1, xp: 0 });

    const dupe1 = resolveEquipmentAcquisition(first.nextSlot, 'COMMON');
    expect(dupe1.action).toBe('DISMANTLED_XP');
    expect(dupe1.nextSlot).toEqual({ rarity: 'COMMON', level: 1, xp: 1 });

    // COMMON incomingRank = 1 -> total XP 2 >= needed (2 + floor(1/2) = 2) -> Lv.2
    const dupe2 = resolveEquipmentAcquisition(dupe1.nextSlot, 'COMMON');
    expect(dupe2.action).toBe('DISMANTLED_LEVEL_UP');
    expect(dupe2.nextSlot).toEqual({ rarity: 'COMMON', level: 2, xp: 0 });

    const upgraded = resolveEquipmentAcquisition(dupe2.nextSlot, 'LEGENDARY');
    expect(upgraded.action).toBe('UPGRADED_RARITY');
    expect(upgraded.nextSlot.rarity).toBe('LEGENDARY');
    expect(upgraded.nextSlot.level).toBe(2);

    expect(computeMercEquipmentMultipliers('sera', undefined)).toEqual({
      attackMult: 1,
      healMult: 1,
      shieldMult: 1,
      tradeBonusPct: 0,
    });
    const harunBuff = computeMercEquipmentMultipliers('harun', {
      rarity: 'ANCIENT',
      level: 5,
      xp: 0,
    });
    expect(harunBuff.tradeBonusPct).toBeGreaterThan(0.15);
    const liliBuff = computeMercEquipmentMultipliers('lili', {
      rarity: 'LEGENDARY',
      level: 3,
      xp: 0,
    });
    expect(liliBuff.healMult).toBeGreaterThan(1.3);
  });

  it('generates 3 offers, rerolls rare+ odds for IAA Point 4, and auto-applies purchases', () => {
    const bus = new EventBus();
    const autoEngine = new AutoUpgradeEngine({ eventBus: bus });
    const merchant = new WanderingMerchantSystem({ rng: () => 0.5 });

    const offers = merchant.getOffers(2, 1, false);
    expect(offers).toHaveLength(3);
    expect(offers.some((o) => o.kind === 'EQUIPMENT')).toBe(true);

    const boosted = merchant.rerollOffers(2, 3, true);
    const eqOffer = boosted.find((o) => o.kind === 'EQUIPMENT')!;
    expect(['RARE', 'LEGENDARY', 'ANCIENT']).toContain(eqOffer.equipmentRarity);

    useGameStore.getState().addCurrencies({ sunGold: 2000 });
    const beforeGold = useGameStore.getState().currencies.sunGold;
    const ok = merchant.purchaseOffer(eqOffer.id, useGameStore.getState(), autoEngine);
    expect(ok).toBe(true);
    expect(useGameStore.getState().currencies.sunGold).toBe(beforeGold - eqOffer.costGold);
    expect(useGameStore.getState().mercEquipment?.[eqOffer.mercId!]).toBeDefined();

    const itemOffer = boosted.find((o) => o.kind === 'ITEM')!;
    expect(merchant.purchaseOffer(itemOffer.id, useGameStore.getState(), autoEngine)).toBe(true);
    expect(useGameStore.getState().progression?.recentAutoUpgrades.length).toBeGreaterThanOrEqual(
      2
    );
  });

  it('triggers 5-Mercenary Expedition Burst only when 5/5 mercenaries unlocked in combat', () => {
    const bus = new EventBus();
    const coordinator = new CombatCoordinator({ eventBus: bus });
    const events: Array<{ totalDamage: number; healedHp: number; shieldGranted: number }> = [];
    bus.on('combat:expeditionBurst', (ev) => events.push(ev));

    // Only starter mercs unlocked -> blocked
    expect(
      coordinator.triggerExpeditionBurst(
        useGameStore.getState(),
        useGameStore.getState(),
        'MARCH_NORMAL'
      )
    ).toBe(false);

    // Unlock all 5 mercenaries
    for (const id of ['tarik', 'sera', 'zara', 'lili', 'harun']) {
      useGameStore.getState().unlockMercenary(id);
    }
    useGameStore.getState().applyDamage(30);

    // Blocked in OASIS_HUB
    expect(
      coordinator.triggerExpeditionBurst(
        useGameStore.getState(),
        useGameStore.getState(),
        'OASIS_HUB'
      )
    ).toBe(false);

    // Succeeds in MARCH_NORMAL
    const hpBefore = useGameStore.getState().sandwalker.currentHp;
    const triggered = coordinator.triggerExpeditionBurst(
      useGameStore.getState(),
      useGameStore.getState(),
      'MARCH_NORMAL'
    );
    expect(triggered).toBe(true);
    expect(events).toHaveLength(1);
    expect(useGameStore.getState().sandwalker.currentHp).toBeGreaterThan(hpBefore);
    expect(useGameStore.getState().sandwalker.solarShieldHp).toBeGreaterThan(0);
    expect(coordinator.getExpeditionBurstState().ready).toBe(false);
    expect(coordinator.getExpeditionBurstState().count).toBe(1);

    // On cooldown -> second immediate call returns false
    expect(
      coordinator.triggerExpeditionBurst(
        useGameStore.getState(),
        useGameStore.getState(),
        'MARCH_NORMAL'
      )
    ).toBe(false);
  });
});
