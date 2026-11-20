import type { EnemyArchetypeTag } from '@/store/types';

export type EnemyArchetypeId = 'DESERT_BANDIT' | 'SCORPION' | 'MIRAGE_SPIRIT';

export interface EnemyArchetypeDefinition {
  readonly id: EnemyArchetypeId;
  readonly name: string;
  readonly tags: readonly EnemyArchetypeTag[];
  readonly baseHp: number;
  readonly baseArmor: number;
  readonly baseSpeed: number;
  readonly baseDamage: number;
  readonly attackIntervalSec: number;
  readonly attackRangePx: number;
  readonly radius: number;
  readonly yOffsetFromGround: number;
  readonly weakPointOffset: { readonly x: number; readonly y: number };
  readonly goldReward: number;
  readonly isRanged: boolean;
}

export const ENEMY_ARCHETYPES: Record<EnemyArchetypeId, EnemyArchetypeDefinition> = {
  DESERT_BANDIT: {
    id: 'DESERT_BANDIT',
    name: '사막 도적',
    tags: ['SMALL_SWARM'],
    baseHp: 30,
    baseArmor: 0,
    baseSpeed: 68,
    baseDamage: 10,
    attackIntervalSec: 1.2,
    attackRangePx: 28,
    radius: 13,
    yOffsetFromGround: -13,
    weakPointOffset: { x: 0, y: -4 },
    goldReward: 5,
    isRanged: false,
  },
  SCORPION: {
    id: 'SCORPION',
    name: '거대 전갈',
    tags: ['HEAVY_ARMOR'],
    baseHp: 120,
    baseArmor: 40,
    baseSpeed: 42,
    baseDamage: 20,
    attackIntervalSec: 1.6,
    attackRangePx: 34,
    radius: 18,
    yOffsetFromGround: -16,
    weakPointOffset: { x: -6, y: -14 },
    goldReward: 14,
    isRanged: false,
  },
  MIRAGE_SPIRIT: {
    id: 'MIRAGE_SPIRIT',
    name: '신기루 정령',
    tags: ['MIRAGE'],
    baseHp: 60,
    baseArmor: 0,
    baseSpeed: 52,
    baseDamage: 14,
    attackIntervalSec: 1.8,
    attackRangePx: 135,
    radius: 15,
    yOffsetFromGround: -68,
    weakPointOffset: { x: 0, y: -2 },
    goldReward: 10,
    isRanged: true,
  },
};

/**
 * Scales enemy HP by Act while preserving exact Act 1 baseline (30 / 120 / 60).
 */
export function scaleEnemyHpForAct(baseHp: number, act: number): number {
  const safeAct = Number.isFinite(act) ? Math.max(1, Math.floor(act)) : 1;
  if (safeAct <= 1) return baseHp;
  return Math.round(baseHp * (1 + (safeAct - 1) * 0.45));
}

/**
 * Quicksand Scorpion spawn rate multiplier (Plan §6.6, Decision D3):
 * Act 1 = 1.5x, Act 2+ = 2.0x, non-quicksand = 1.0x.
 */
export function getQuicksandScorpionMultiplier(isQuicksand: boolean, act: number): number {
  if (!isQuicksand) return 1.0;
  const safeAct = Number.isFinite(act) ? Math.max(1, Math.floor(act)) : 1;
  return safeAct <= 1 ? 1.5 : 2.0;
}
