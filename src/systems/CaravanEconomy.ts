import {
  BIOME_TABLE,
  TURRET_ORDER,
  type MercenaryId,
  type TurretId,
} from '@/data/masterData';
import { clampSpeechBubble, type EventChoiceSpec } from '@/data/eventData';

export const BASE_CARGO_VALUE = 200;
export const WAGON_CARGO_BONUS = 60;
export const MAX_WAGON_COUNT = 5;

export interface EconomySaveView {
  player: {
    gold: number;
    cargoValue: number;
    wagonCount: number;
  };
  sandwalker: {
    unlockedTurrets: readonly TurretId[];
    turretLevels: Record<TurretId, number>;
    legLevel: number;
    shieldLevel: number;
  };
}

export interface TradeProfitBreakdown {
  baseCargo: number;
  biomeRate: number;
  merchantBonus: number;
  tradeMultiplier: number;
  totalProfit: number;
}

export interface EventChoiceResolution {
  affordable: boolean;
  goldDelta: number;
  gearsDelta: number;
  mapPiecesDelta: number;
  templeKeysDelta: number;
  triggerShieldCooldown: boolean;
  triggerShieldFullCharge: boolean;
  triggerOverdrive: boolean;
  moraleBonusSec: number;
  nextTradeMultiplier: number | null;
  speechBubble: string;
}

export type AutoUpgradeTarget = TurretId | 'LEG_01' | 'SHD_01';

export interface AutoUpgradePick {
  target: AutoUpgradeTarget;
  cost: number;
}

export function computeUpgradeCost(level: number): number {
  const safeLv = Math.max(1, Math.floor(level));
  return Math.floor(100 * Math.pow(1.28, safeLv - 1));
}

export function computeWagonPurchaseCost(currentWagonCount: number): number {
  const safeCount = Math.max(1, Math.floor(currentWagonCount));
  return computeUpgradeCost(safeCount + 1);
}

export function computeMercenaryUnlockCost(mercId: MercenaryId): number {
  if (mercId === 'tarek') return 220;
  if (mercId === 'zara') return 300;
  if (mercId === 'lili') return 380;
  return 250;
}

export function computeCargoCapacityValue(wagonCount: number): number {
  const safeCount = Math.min(MAX_WAGON_COUNT, Math.max(1, Math.floor(wagonCount)));
  return BASE_CARGO_VALUE + (safeCount - 1) * WAGON_CARGO_BONUS;
}

export function computeTradeProfit(
  cargoValue: number,
  biomeIndex: number,
  merchantLevel: number,
  tradeMultiplier = 1.0
): TradeProfitBreakdown {
  const clampedIdx = Math.min(3, Math.max(0, Math.floor(biomeIndex)));
  const biomeRate = BIOME_TABLE[clampedIdx].tradeProfitRate;
  const safeMerchantLv = Math.max(1, Math.floor(merchantLevel));
  const merchantBonus = 0.05 * safeMerchantLv;
  const safeCargo = Math.max(0, cargoValue);
  const safeMult = Math.max(1, tradeMultiplier);
  const totalProfit = Math.floor(safeCargo * (1 + biomeRate + merchantBonus) * safeMult);
  return {
    baseCargo: safeCargo,
    biomeRate,
    merchantBonus,
    tradeMultiplier: safeMult,
    totalProfit,
  };
}

export function computeOfflineGoldReward(
  elapsedSec: number,
  maxDistanceMeters: number,
  merchantLevel: number
): number {
  if (!Number.isFinite(elapsedSec) || elapsedSec < 60) {
    return 0;
  }
  const clampedSec = Math.min(8 * 3600, Math.max(0, elapsedSec));
  const tierBonus = Math.floor(Math.max(0, maxDistanceMeters) / 250) * 6;
  const perMinute = 12 + tierBonus + Math.max(1, Math.floor(merchantLevel)) * 3;
  return Math.floor((clampedSec / 60) * perMinute);
}

export function resolveEventChoice(
  choice: EventChoiceSpec,
  currentGold: number
): EventChoiceResolution {
  const goldCost = Math.max(0, choice.cost.gold ?? 0);
  if (currentGold < goldCost) {
    return {
      affordable: false,
      goldDelta: 0,
      gearsDelta: 0,
      mapPiecesDelta: 0,
      templeKeysDelta: 0,
      triggerShieldCooldown: false,
      triggerShieldFullCharge: false,
      triggerOverdrive: false,
      moraleBonusSec: 0,
      nextTradeMultiplier: null,
      speechBubble: clampSpeechBubble('태양의 금화가 부족해 선택할 수 없다.'),
    };
  }

  return {
    affordable: true,
    goldDelta: (choice.reward.gold ?? 0) - goldCost,
    gearsDelta: choice.reward.ancientGears ?? 0,
    mapPiecesDelta: choice.reward.mapPieces ?? 0,
    templeKeysDelta: choice.reward.templeKeys ?? 0,
    triggerShieldCooldown: Boolean(choice.cost.shieldCooldownTrigger),
    triggerShieldFullCharge: Boolean(choice.reward.shieldFullCharge),
    triggerOverdrive: Boolean(choice.reward.overdriveTrigger),
    moraleBonusSec: Math.max(0, choice.reward.moraleBonusSec ?? 0),
    nextTradeMultiplier:
      typeof choice.reward.goldMultiplier === 'number' && choice.reward.goldMultiplier > 1
        ? choice.reward.goldMultiplier
        : null,
    speechBubble: clampSpeechBubble(choice.resultLine),
  };
}

export function selectCheapestAutoUpgrade(state: EconomySaveView): AutoUpgradePick | null {
  let best: AutoUpgradePick | null = null;
  const gold = state.player.gold;

  for (let i = 0; i < TURRET_ORDER.length; i++) {
    const id = TURRET_ORDER[i];
    if (!state.sandwalker.unlockedTurrets.includes(id)) continue;
    const cost = computeUpgradeCost(state.sandwalker.turretLevels[id] ?? 1);
    if (cost <= gold && (!best || cost < best.cost)) {
      best = { target: id, cost };
    }
  }

  const legCost = computeUpgradeCost(state.sandwalker.legLevel);
  if (legCost <= gold && (!best || legCost < best.cost)) {
    best = { target: 'LEG_01', cost: legCost };
  }

  const shieldCost = computeUpgradeCost(state.sandwalker.shieldLevel);
  if (shieldCost <= gold && (!best || shieldCost < best.cost)) {
    best = { target: 'SHD_01', cost: shieldCost };
  }

  return best;
}
