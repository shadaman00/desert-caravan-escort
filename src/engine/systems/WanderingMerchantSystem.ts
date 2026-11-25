import {
  EQUIPMENT_RARITY_LABELS,
  MERC_EQUIPMENT_CATALOG,
  type EquipmentRarity,
} from '@/game/data/equipment';
import { LOOT_ITEM_CATALOG } from '@/game/data/autoUpgradeRules';
import type { AutoUpgradeItemKind } from '@/store/types';
import type { AutoUpgradeEngine, AutoUpgradeStore } from './AutoUpgradeEngine';

export interface MerchantOffer {
  id: string;
  kind: 'ITEM' | 'EQUIPMENT';
  title: string;
  subtitle: string;
  costGold: number;
  itemKind?: AutoUpgradeItemKind;
  mercId?: 'tarik' | 'sera' | 'zara' | 'lili' | 'harun';
  equipmentRarity?: EquipmentRarity;
  purchased: boolean;
}

const MERC_IDS: ReadonlyArray<'tarik' | 'sera' | 'zara' | 'lili' | 'harun'> = [
  'harun',
  'sera',
  'zara',
  'tarik',
  'lili',
];

const PART_ITEMS: readonly AutoUpgradeItemKind[] = [
  'TURRET_PART_HEAT',
  'TURRET_PART_HARPOON',
  'TURRET_PART_MORTAR',
  'LEG_PISTON',
];

const UTILITY_ITEMS: readonly AutoUpgradeItemKind[] = [
  'MERC_MANUAL',
  'EXPLORER_TABLET',
  'WAGON_FRAME',
];

function rollRarity(act: number, boosted: boolean, rng: () => number): EquipmentRarity {
  const r = rng();
  if (boosted) {
    if (r < 0.22 + (act >= 4 ? 0.15 : 0)) return 'ANCIENT';
    if (r < 0.72) return 'LEGENDARY';
    return 'RARE';
  }
  if (act >= 4 && r < 0.2) return 'LEGENDARY';
  if (act >= 2 && r < 0.45) return 'RARE';
  return r < 0.2 ? 'RARE' : 'COMMON';
}

/**
 * Generates Wandering Merchant offers per oasis hub with IAA Point 4 rare-list reroll
 * and immediate auto-application through AutoUpgradeEngine upon purchase.
 */
export class WanderingMerchantSystem {
  private readonly rng: () => number;
  private offers: MerchantOffer[] = [];
  private stockKey = '';
  private stockSeq = 1;

  constructor(options: { rng?: () => number } = {}) {
    this.rng = options.rng ?? Math.random;
  }

  public getOffers(oasisIndex: number, act: number, boosted = false): readonly MerchantOffer[] {
    const key = `${act}:${oasisIndex}`;
    if (this.offers.length === 0 || this.stockKey !== key) {
      this.stockKey = key;
      this.offers = this.buildOffers(act, boosted);
    }
    return this.offers;
  }

  public rerollOffers(oasisIndex: number, act: number, boostedLegendOdds = true): readonly MerchantOffer[] {
    this.stockKey = `${act}:${oasisIndex}`;
    this.offers = this.buildOffers(act, boostedLegendOdds);
    return this.offers;
  }

  private buildOffers(act: number, boosted: boolean): MerchantOffer[] {
    const safeAct = Math.max(1, Math.min(4, Math.floor(act)));
    const seq = this.stockSeq++;

    const partKind = PART_ITEMS[(seq + safeAct) % PART_ITEMS.length];
    const partMeta = LOOT_ITEM_CATALOG[partKind];
    const partCost = 90 + safeAct * 45;

    const mercId = MERC_IDS[(seq + safeAct) % MERC_IDS.length];
    const gearDef = MERC_EQUIPMENT_CATALOG[mercId];
    const rarity = rollRarity(safeAct, boosted, this.rng);
    const rarityRankCost =
      rarity === 'ANCIENT' ? 380 : rarity === 'LEGENDARY' ? 240 : rarity === 'RARE' ? 140 : 80;
    const equipCost = rarityRankCost + (safeAct - 1) * 40;

    const utilKind = UTILITY_ITEMS[(seq + 1) % UTILITY_ITEMS.length];
    const utilMeta = LOOT_ITEM_CATALOG[utilKind];
    const utilCost = utilKind === 'WAGON_FRAME' ? 260 + safeAct * 50 : 110 + safeAct * 35;

    return [
      {
        id: `mo_part_${seq}`,
        kind: 'ITEM',
        title: partMeta.label,
        subtitle: '구매 즉시 포탑/다리 자동 강화',
        costGold: partCost,
        itemKind: partKind,
        purchased: false,
      },
      {
        id: `mo_equip_${seq}`,
        kind: 'EQUIPMENT',
        title: `[${EQUIPMENT_RARITY_LABELS[rarity]}] ${gearDef.name}`,
        subtitle: `${gearDef.statDesc} · 자동 장착/분해 강화`,
        costGold: equipCost,
        mercId,
        equipmentRarity: rarity,
        purchased: false,
      },
      {
        id: `mo_util_${seq}`,
        kind: 'ITEM',
        title: utilMeta.label,
        subtitle: '구매 즉시 상단 전력 자동 반영',
        costGold: utilCost,
        itemKind: utilKind,
        purchased: false,
      },
    ];
  }

  public purchaseOffer(
    offerId: string,
    store: AutoUpgradeStore,
    autoUpgradeEngine?: AutoUpgradeEngine
  ): boolean {
    const offer = this.offers.find((o) => o.id === offerId);
    if (!offer || offer.purchased) return false;
    if (store.currencies.sunGold < offer.costGold) return false;
    if (!store.spendCurrencies({ sunGold: offer.costGold })) return false;

    offer.purchased = true;

    if (offer.kind === 'EQUIPMENT' && offer.mercId && offer.equipmentRarity) {
      if (autoUpgradeEngine) {
        autoUpgradeEngine.applyEquipmentReward(
          offer.mercId,
          offer.equipmentRarity,
          '떠돌이 상인 구매',
          store
        );
      } else {
        store.acquireMercenaryEquipment(offer.mercId, offer.equipmentRarity);
      }
      return true;
    }

    if (offer.kind === 'ITEM' && offer.itemKind) {
      autoUpgradeEngine?.applyItemPickup(offer.itemKind, store);
      return true;
    }

    return true;
  }
}
