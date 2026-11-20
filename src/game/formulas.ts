import { TurretType, EnemyArchetypeTag, type MercenaryState } from '../store/types';

/**
 * Upgrade Cost Formula: Cost(n) = round(50 * 1.18^(n - 1)) Sun Gold
 * Expected values:
 * n=1: 50, n=2: 59, n=5: 97, n=10: 222, n=11: 262, n=20: 1161, n=30: 6075
 */
export function upgradeCost(level: number): number {
  const safeLevel = Math.max(1, Math.floor(level));
  return Math.round(50 * Math.pow(1.18, safeLevel - 1));
}

/**
 * Stat Scaling Formula: Stat(n) = Stat0 * (1 + 0.22 * (n - 1))
 */
export function statAt(baseStat: number, level: number): number {
  const safeLevel = Math.max(1, Math.floor(level));
  return baseStat * (1 + 0.22 * (safeLevel - 1));
}

/**
 * Tier-Up Promotion Cost: 5 * Tier Ancient Gears
 */
export function tierUpGearCost(currentTier: number): number {
  const safeTier = Math.max(1, Math.floor(currentTier));
  return 5 * safeTier;
}

/**
 * Quicksand Ignore Rate: R_ignore = min(1.0, max(0, (legLevel - 1) * 0.1))
 * At legLevel 1: 0.0
 * At legLevel 6: 0.5
 * At legLevel 11+: 1.0 (completely neutralizes slowdown)
 */
export function quicksandIgnore(legLevel: number): number {
  const safeLevel = Math.max(1, Math.floor(legLevel));
  return Math.min(1.0, Math.max(0.0, (safeLevel - 1) * 0.1));
}

/**
 * Quicksand Actual Speed: v_actual = v_base * (1 - c * (1 - R_ignore))
 * c = 0.2 for Act 1 (weakened quicksand, Decision D3)
 * c = 0.4 for Act 2+ (standard quicksand)
 */
export function quicksandSpeed(baseSpeed: number, legLevel: number, act: number): number {
  const c = act === 1 ? 0.2 : 0.4;
  const ignore = quicksandIgnore(legLevel);
  return baseSpeed * (1 - c * (1 - ignore));
}

/**
 * Sandstorm Damage-over-Time: 0.015 * maxHp per second
 */
export function stormDps(maxHp: number): number {
  return 0.015 * maxHp;
}

/**
 * Ancient Solar Relay Tower Shield: maxHp * 0.5 (Decision D4)
 */
export function relayShield(maxHp: number): number {
  return maxHp * 0.5;
}

/**
 * Parallax Background Displacement: k_i * v_actual * dt
 */
export function parallaxDx(k: number, actualSpeed: number, dt: number): number {
  return k * actualSpeed * dt;
}

/**
 * Leg Evasion Boost Cooldown: max(4.0, 8.0 - 0.2 * (legLevel - 1)) seconds
 */
export function evasionCooldown(legLevel: number): number {
  const safeLevel = Number.isFinite(legLevel) ? Math.max(1, Math.floor(legLevel)) : 1;
  return Math.max(4.0, 8.0 - 0.2 * (safeLevel - 1));
}

/**
 * Oasis Trade Sale Payout:
 * Sell Price = Math.floor(quantity * buyPrice * rateMultiplier * (1 + harun) * (1 + synergy))
 */
export function tradeSellPayout(
  buyPrice: number,
  quantity: number,
  rateMultiplier: number,
  harunBonus: boolean,
  synergyBonus: boolean
): number {
  const harun = harunBonus ? 0.25 : 0.0;
  const synergy = synergyBonus ? 0.20 : 0.0;
  return Math.floor(quantity * buyPrice * rateMultiplier * (1 + harun) * (1 + synergy));
}

/**
 * Single unit trade sell price alias
 */
export function calculateTradeSellPrice(
  unitBuyPrice: number,
  rateMultiplier: number,
  harunBonus: boolean,
  synergyBonus: boolean
): number {
  return tradeSellPayout(unitBuyPrice, 1, rateMultiplier, harunBonus, synergyBonus);
}

/**
 * Weapon Affinity Matrix
 */
export const WEAPON_AFFINITY_TABLE: Record<EnemyArchetypeTag, Record<TurretType, number>> = {
  MIRAGE: {
    HEAT_RAY: 2.0,
    HARPOON: 1.0,
    MORTAR: 1.0,
  },
  EXPOSED_CORE: {
    HEAT_RAY: 1.8,
    HARPOON: 1.0,
    MORTAR: 1.0,
  },
  HEAVY_ARMOR: {
    HEAT_RAY: 0.6,
    HARPOON: 2.2,
    MORTAR: 1.0,
  },
  WORM_HEAD_SHELL: {
    HEAT_RAY: 0.6,
    HARPOON: 2.0,
    MORTAR: 1.0,
  },
  SMALL_SWARM: {
    HEAT_RAY: 1.0,
    HARPOON: 0.7,
    MORTAR: 2.0,
  },
  PARASITE: {
    HEAT_RAY: 1.0,
    HARPOON: 1.0,
    MORTAR: 2.2,
  },
  SINGLE_LARGE_BOSS: {
    HEAT_RAY: 1.0,
    HARPOON: 1.0,
    MORTAR: 0.8,
  },
};

/**
 * Weapon Affinity Multiplier Calculation with Multi-Tag Single Highest Rule (Decision D8)
 * If entity has multiple tags, take Math.max(...multipliers), never multiply them.
 */
export function calculateAffinityMultiplier(
  turret: TurretType,
  targetTags: EnemyArchetypeTag[]
): number {
  if (!targetTags || targetTags.length === 0) {
    return 1.0;
  }

  const multipliers = targetTags.map((tag) => {
    const row = WEAPON_AFFINITY_TABLE[tag];
    return row ? row[turret] ?? 1.0 : 1.0;
  });

  return multipliers.length === 0 ? 1.0 : Math.max(...multipliers);
}

/** Alias for calculateAffinityMultiplier */
export const calculateDamageMultiplier = calculateAffinityMultiplier;

/**
 * Expedition Synergy Buff (Feature #23):
 * Active only when all 5 canonical mercenaries are unlocked.
 * Grants +25% Party Attack and +20% Trade Gold income.
 */
export function isExpeditionSynergyActive(
  mercenaries: readonly Pick<MercenaryState, 'isUnlocked'>[]
): boolean {
  return mercenaries.length === 5 && mercenaries.every((m) => m.isUnlocked);
}

/**
 * Party Attack multiplier from 5-Mercenary Expedition Synergy (+25%).
 */
export function calculatePartyAttackMultiplier(synergyActive: boolean): number {
  return synergyActive ? 1.25 : 1.0;
}

/**
 * Applies Expedition Synergy (+25%) to a base attack value.
 */
export function calculatePartyAttack(baseAttack: number, synergyActive: boolean): number {
  if (!Number.isFinite(baseAttack) || baseAttack <= 0) {
    return 0;
  }
  return baseAttack * calculatePartyAttackMultiplier(synergyActive);
}
