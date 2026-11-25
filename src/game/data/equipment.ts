export type EquipmentRarity = 'COMMON' | 'RARE' | 'LEGENDARY' | 'ANCIENT';

export interface MercenaryEquipmentSlot {
  rarity: EquipmentRarity;
  level: number;
  xp: number;
}

export interface MercenaryEquipmentDef {
  readonly mercId: 'tarik' | 'sera' | 'zara' | 'lili' | 'harun';
  readonly name: string;
  readonly statDesc: string;
}

export const EQUIPMENT_RARITY_LABELS: Record<EquipmentRarity, string> = {
  COMMON: '일반',
  RARE: '희귀',
  LEGENDARY: '전설',
  ANCIENT: '고대',
};

export const EQUIPMENT_RARITY_RANK: Record<EquipmentRarity, number> = {
  COMMON: 1,
  RARE: 2,
  LEGENDARY: 3,
  ANCIENT: 4,
};

export const MERC_EQUIPMENT_CATALOG: Record<
  'tarik' | 'sera' | 'zara' | 'lili' | 'harun',
  MercenaryEquipmentDef
> = {
  tarik: {
    mercId: 'tarik',
    name: '태양 수호 방패',
    statDesc: '공격력·방패 보호막 출력 강화',
  },
  sera: {
    mercId: 'sera',
    name: '사막 매 장궁',
    statDesc: '원거리 저격 및 일제 사격 공격력 강화',
  },
  zara: {
    mercId: 'zara',
    name: '태양 비석 지팡이',
    statDesc: '광역 화염 마법 공격력 강화',
  },
  lili: {
    mercId: 'lili',
    name: '오아시스 성배',
    statDesc: '지속 회복 및 축복 치유량 강화',
  },
  harun: {
    mercId: 'harun',
    name: '황금 대상인 저울',
    statDesc: '전투력 + 교역 매각 시세 추가 보너스',
  },
};

export interface MercEquipmentMultipliers {
  attackMult: number;
  healMult: number;
  shieldMult: number;
  tradeBonusPct: number;
}

const RARITY_POWER_BONUS: Record<EquipmentRarity, number> = {
  COMMON: 0.12,
  RARE: 0.25,
  LEGENDARY: 0.45,
  ANCIENT: 0.7,
};

const HARUN_TRADE_BONUS_BY_RARITY: Record<EquipmentRarity, number> = {
  COMMON: 0.05,
  RARE: 0.1,
  LEGENDARY: 0.16,
  ANCIENT: 0.25,
};

/**
 * Computes effective combat/trade multipliers for a mercenary equipment slot.
 * Returns exact baseline (1.0 / 0) when no slot is equipped.
 */
export function computeMercEquipmentMultipliers(
  mercId: string,
  slot?: MercenaryEquipmentSlot
): MercEquipmentMultipliers {
  if (!slot) {
    return {
      attackMult: 1,
      healMult: 1,
      shieldMult: 1,
      tradeBonusPct: 0,
    };
  }

  const rarityBonus = RARITY_POWER_BONUS[slot.rarity] ?? 0.12;
  const lvBonus = Math.max(0, slot.level - 1) * 0.08;
  const totalPower = rarityBonus + lvBonus;

  if (mercId === 'lili') {
    return {
      attackMult: 1,
      healMult: 1 + totalPower,
      shieldMult: 1,
      tradeBonusPct: 0,
    };
  }

  if (mercId === 'tarik') {
    return {
      attackMult: 1 + totalPower,
      healMult: 1,
      shieldMult: 1 + totalPower * 0.85,
      tradeBonusPct: 0,
    };
  }

  if (mercId === 'harun') {
    const baseTrade = HARUN_TRADE_BONUS_BY_RARITY[slot.rarity] ?? 0.05;
    return {
      attackMult: 1 + totalPower * 0.8,
      healMult: 1,
      shieldMult: 1,
      tradeBonusPct: baseTrade + Math.max(0, slot.level - 1) * 0.01,
    };
  }

  return {
    attackMult: 1 + totalPower,
    healMult: 1,
    shieldMult: 1,
    tradeBonusPct: 0,
  };
}

export type EquipmentAcquireAction =
  | 'EQUIPPED'
  | 'UPGRADED_RARITY'
  | 'DISMANTLED_LEVEL_UP'
  | 'DISMANTLED_XP';

export interface EquipmentAcquireResult {
  nextSlot: MercenaryEquipmentSlot;
  action: EquipmentAcquireAction;
  fromLabel: string;
  toLabel: string;
}

/**
 * Resolves automatic equip, higher-rarity upgrade, or lower/equal-rarity dismantle-for-XP leveling.
 */
export function resolveEquipmentAcquisition(
  currentSlot: MercenaryEquipmentSlot | undefined,
  incomingRarity: EquipmentRarity
): EquipmentAcquireResult {
  const incomingRank = EQUIPMENT_RARITY_RANK[incomingRarity];

  if (!currentSlot) {
    const nextSlot: MercenaryEquipmentSlot = { rarity: incomingRarity, level: 1, xp: 0 };
    return {
      nextSlot,
      action: 'EQUIPPED',
      fromLabel: '미착용',
      toLabel: `${EQUIPMENT_RARITY_LABELS[incomingRarity]} Lv.1`,
    };
  }

  const curRank = EQUIPMENT_RARITY_RANK[currentSlot.rarity];
  const fromLabel = `${EQUIPMENT_RARITY_LABELS[currentSlot.rarity]} Lv.${currentSlot.level}`;

  if (incomingRank > curRank) {
    const nextSlot: MercenaryEquipmentSlot = {
      rarity: incomingRarity,
      level: currentSlot.level,
      xp: currentSlot.xp,
    };
    return {
      nextSlot,
      action: 'UPGRADED_RARITY',
      fromLabel,
      toLabel: `${EQUIPMENT_RARITY_LABELS[incomingRarity]} Lv.${currentSlot.level}`,
    };
  }

  // Equal or lower rarity: dismantle into XP & auto-level up to Lv.20
  let level = Math.max(1, Math.min(20, currentSlot.level));
  let xp = Math.max(0, currentSlot.xp) + incomingRank;

  while (level < 20) {
    const needed = 2 + Math.floor(level / 2);
    if (xp < needed) break;
    xp -= needed;
    level += 1;
  }

  const nextSlot: MercenaryEquipmentSlot = {
    rarity: currentSlot.rarity,
    level,
    xp,
  };
  const leveledUp = level > currentSlot.level;

  return {
    nextSlot,
    action: leveledUp ? 'DISMANTLED_LEVEL_UP' : 'DISMANTLED_XP',
    fromLabel,
    toLabel: leveledUp
      ? `${EQUIPMENT_RARITY_LABELS[currentSlot.rarity]} Lv.${level}`
      : `${EQUIPMENT_RARITY_LABELS[currentSlot.rarity]} Lv.${level} (+${incomingRank} XP)`,
  };
}
