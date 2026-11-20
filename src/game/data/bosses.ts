import type { EnemyArchetypeTag, TurretType } from '@/store/types';

export type BossId =
  | 'VARKA_ARMORED_CAR'
  | 'SCORPION_REX'
  | 'MIRAGE_SPIRIT_KING'
  | 'GREAT_SANDWORM';

export type BossPatternKind =
  | 'RAM_CANNON'
  | 'STINGER_STRIKE'
  | 'MIRAGE_BOLT'
  | 'WORM_LUNGE'
  | 'SAND_BREATH'
  | 'PARASITE_SWARM';

export interface BossPartBreakRewards {
  ancientGear: number;
  templeKeys: number;
}

export interface BossClearRewards {
  ancientGear: number;
  mapFragments: number;
  templeKeys: number;
  unlockMercenaryIds?: readonly string[];
}

export interface BossP3WaveConfig {
  readonly waveTimesSec: readonly number[];
  readonly parasiteCount: number;
  readonly banditCount: number;
}

export interface BossPhaseDefinition {
  readonly phase: number;
  readonly label: string;
  readonly tags: readonly EnemyArchetypeTag[];
  readonly hp: number;
  readonly armor: number;
  readonly armorAbsorbsHp: boolean;
  readonly recommendedTurret: TurretType;
  readonly weakPointOffset: { readonly x: number; readonly y: number };
  readonly patternKind: BossPatternKind;
  readonly telegraphDurationSec: number;
  readonly attackIntervalSec: number;
  readonly attackDamage: number;
  readonly groggyDurationSec: number;
  readonly partBreakRewards?: BossPartBreakRewards;
  readonly p3Waves?: BossP3WaveConfig;
}

export interface BossCloneConfig {
  readonly maxClones: number;
  readonly cloneHp: number;
  readonly cloneIntervalSec: number;
  readonly cloneDamage: number;
  readonly cloneAttackIntervalSec: number;
}

export interface BossDefinition {
  readonly id: BossId;
  readonly act: number;
  readonly name: string;
  readonly isMultiPhase: boolean;
  readonly maxHp: number;
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly phases: readonly BossPhaseDefinition[];
  readonly cloneConfig?: BossCloneConfig;
  readonly clearRewards: BossClearRewards;
}

export const BOSS_DEFINITIONS: Record<BossId, BossDefinition> = {
  VARKA_ARMORED_CAR: {
    id: 'VARKA_ARMORED_CAR',
    act: 1,
    name: '약탈왕 바르카 장갑차',
    isMultiPhase: false,
    maxHp: 2000,
    x: 345,
    y: 376,
    radius: 40,
    phases: [
      {
        phase: 1,
        label: '철갑 돌격차',
        tags: ['HEAVY_ARMOR'],
        hp: 2000,
        armor: 500,
        armorAbsorbsHp: false,
        recommendedTurret: 'HARPOON',
        weakPointOffset: { x: -16, y: -18 },
        patternKind: 'RAM_CANNON',
        telegraphDurationSec: 1.0,
        attackIntervalSec: 2.0,
        attackDamage: 45,
        groggyDurationSec: 0,
      },
    ],
    clearRewards: {
      ancientGear: 5,
      mapFragments: 1,
      templeKeys: 0,
      unlockMercenaryIds: ['tarik', 'lili'],
    },
  },
  SCORPION_REX: {
    id: 'SCORPION_REX',
    act: 2,
    name: '사막 전갈 군주 스콜피온 렉스',
    isMultiPhase: false,
    maxHp: 3000,
    x: 348,
    y: 378,
    radius: 42,
    phases: [
      {
        phase: 1,
        label: '중장갑 외피',
        tags: ['HEAVY_ARMOR'],
        hp: 3000,
        armor: 1000,
        armorAbsorbsHp: false,
        recommendedTurret: 'HARPOON',
        weakPointOffset: { x: -24, y: -48 },
        patternKind: 'STINGER_STRIKE',
        telegraphDurationSec: 1.2,
        attackIntervalSec: 2.2,
        attackDamage: 70,
        groggyDurationSec: 1.5,
        partBreakRewards: {
          ancientGear: 3,
          templeKeys: 1,
        },
      },
    ],
    clearRewards: {
      ancientGear: 5,
      mapFragments: 1,
      templeKeys: 0,
    },
  },
  MIRAGE_SPIRIT_KING: {
    id: 'MIRAGE_SPIRIT_KING',
    act: 3,
    name: '천년의 파수꾼 신기루 정령왕',
    isMultiPhase: false,
    maxHp: 3500,
    x: 345,
    y: 312,
    radius: 38,
    phases: [
      {
        phase: 1,
        label: '신기루 분신',
        tags: ['MIRAGE'],
        hp: 3500,
        armor: 0,
        armorAbsorbsHp: false,
        recommendedTurret: 'HEAT_RAY',
        weakPointOffset: { x: 0, y: -22 },
        patternKind: 'MIRAGE_BOLT',
        telegraphDurationSec: 0.9,
        attackIntervalSec: 2.4,
        attackDamage: 65,
        groggyDurationSec: 0,
      },
    ],
    cloneConfig: {
      maxClones: 3,
      cloneHp: 140,
      cloneIntervalSec: 4.5,
      cloneDamage: 18,
      cloneAttackIntervalSec: 2.4,
    },
    clearRewards: {
      ancientGear: 5,
      mapFragments: 1,
      templeKeys: 0,
    },
  },
  GREAT_SANDWORM: {
    id: 'GREAT_SANDWORM',
    act: 4,
    name: '초거대 아포피스 샌드웜',
    isMultiPhase: true,
    maxHp: 7000,
    x: 350,
    y: 382,
    radius: 46,
    phases: [
      {
        phase: 1,
        label: '두개골 외피',
        tags: ['WORM_HEAD_SHELL'],
        hp: 2000,
        armor: 2000,
        armorAbsorbsHp: false,
        recommendedTurret: 'HARPOON',
        weakPointOffset: { x: -22, y: -14 },
        patternKind: 'WORM_LUNGE',
        telegraphDurationSec: 1.5,
        attackIntervalSec: 3.0,
        attackDamage: 180,
        groggyDurationSec: 3.0,
        partBreakRewards: {
          ancientGear: 5,
          templeKeys: 1,
        },
      },
      {
        phase: 2,
        label: '노출된 태양 코어',
        tags: ['EXPOSED_CORE'],
        hp: 3000,
        armor: 0,
        armorAbsorbsHp: false,
        recommendedTurret: 'HEAT_RAY',
        weakPointOffset: { x: -26, y: -18 },
        patternKind: 'SAND_BREATH',
        telegraphDurationSec: 1.0,
        attackIntervalSec: 2.8,
        attackDamage: 150,
        groggyDurationSec: 0,
      },
      {
        phase: 3,
        label: '기생충 둥지',
        tags: ['SINGLE_LARGE_BOSS'],
        hp: 2000,
        armor: 0,
        armorAbsorbsHp: false,
        recommendedTurret: 'MORTAR',
        weakPointOffset: { x: -18, y: -12 },
        patternKind: 'PARASITE_SWARM',
        telegraphDurationSec: 1.0,
        attackIntervalSec: 3.2,
        attackDamage: 110,
        groggyDurationSec: 0,
        p3Waves: {
          waveTimesSec: [0, 4.5, 9.0],
          parasiteCount: 3,
          banditCount: 2,
        },
      },
    ],
    clearRewards: {
      ancientGear: 10,
      mapFragments: 1,
      templeKeys: 1,
    },
  },
};

export function getBossDefinitionForAct(act: number): BossDefinition {
  const safeAct = Number.isFinite(act) ? Math.max(1, Math.min(4, Math.floor(act))) : 1;
  switch (safeAct) {
    case 1:
      return BOSS_DEFINITIONS.VARKA_ARMORED_CAR;
    case 2:
      return BOSS_DEFINITIONS.SCORPION_REX;
    case 3:
      return BOSS_DEFINITIONS.MIRAGE_SPIRIT_KING;
    case 4:
    default:
      return BOSS_DEFINITIONS.GREAT_SANDWORM;
  }
}
