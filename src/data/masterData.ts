/**
 * Static Master Data & Single Source of Truth for PRD v2.0 Redesign (Landscape 960x540).
 * Zero DOM/Canvas dependencies — purely deterministic definitions and constants.
 */

export const LOGICAL_WIDTH = 960;
export const LOGICAL_HEIGHT = 540;

export const LAYER1_HEIGHT = 56; // Top HUD (10.4%): Y in [0, 56)
export const LAYER2_HEIGHT = 404; // Battlefield Canvas (74.8%): Y in [56, 460)
export const LAYER3_HEIGHT = 80; // Bottom 3-Button Zone (14.8%): Y in [460, 540]

export const WALKER_ANCHOR_X = 268; // 28% of 960px landscape width
export const GROUND_Y = 330; // Ground baseline inside 960x404 Layer 2 canvas
export const WAGON_SPACING_PX = 44; // Space between trailing camel wagons

export const MAX_DT_SEC = 0.05;
export const HITSTOP_DURATION_SEC = 0.05;
export const CAMERA_LERP_LAMBDA = 8;

export const BASE_MARCH_SPEED = 45; // m/s baseline speed
export const VISUAL_SCROLL_SCALE = 2.6; // px per logical meter for smooth landscape scrolling
export const QUICKSAND_PENALTY = 0.45;
export const QUICKSAND_RESIST_PER_LV = 0.2;
export const SPEED_GROWTH_PER_LEG_LV = 0.08;

export const OVERDRIVE_SPEED_MULT = 1.8;
export const OVERDRIVE_FIRE_MULT = 2.0;
export const OVERDRIVE_DURATION_SEC = 5.0;
export const FORCED_COOL_DURATION_SEC = 3.0;
export const FORCED_COOL_FIRE_MULT = 0.5;

export const HEAT_GAIN_PER_SEC = 12;
export const HEAT_COOL_PER_SEC = 8;
export const HEAT_SWEET_MIN = 75;
export const HEAT_SWEET_MAX = 95;
export const HEAT_MAX = 100;

export const TOUCH_HIT_RADIUS_PX = 28; // 56x56px mobile touch tolerance
export const EXPEDITION_TOTAL_DISTANCE_M = 2000;
export const BIOME_FADE_DISTANCE_M = 80;
export const EVENT_INTERVAL_M = 300;
export const OASIS_INTERVAL_M = 500;

export const CAMERA_SHAKE_NORMAL_PX = 4;
export const CAMERA_SHAKE_HEAVY_PX = 10;
export const CAMERA_SHAKE_DURATION_SEC = 0.2;

export const MAX_BUBBLE_CHARS = 35;

export const POOL_SIZES = {
  projectiles: 120,
  enemies: 40,
  particles: 150,
  floatingTexts: 30,
  relics: 16,
} as const;

export type TurretId = 'TUR_01' | 'TUR_02' | 'TUR_03';

export interface TurretSpec {
  readonly id: TurretId;
  readonly name: string;
  readonly weaponType: string;
  readonly baseAtk: number;
  readonly isTickBased: boolean;
  readonly splashRadiusPx: number;
  readonly cooldownSec: number;
  readonly affinityMultiplier: number;
  readonly affinityTargets: readonly string[];
  readonly affinityDesc: string;
  readonly unlockedByDefault: boolean;
}

export const TURRET_TABLE: Record<TurretId, TurretSpec> = {
  TUR_01: {
    id: 'TUR_01',
    name: '고대 작살포',
    weaponType: '장갑 관통',
    baseAtk: 28,
    isTickBased: false,
    splashRadiusPx: 0,
    cooldownSec: 1.1,
    affinityMultiplier: 1.6,
    affinityTargets: ['SCORPION', 'BOSS_SCORPION', 'BOSS_SANDWORM'],
    affinityDesc: '전갈·샌드웜 1.60x',
    unlockedByDefault: true,
  },
  TUR_02: {
    id: 'TUR_02',
    name: '열선 레이저',
    weaponType: '연속 광학',
    baseAtk: 14,
    isTickBased: true,
    splashRadiusPx: 0,
    cooldownSec: 0.25,
    affinityMultiplier: 1.5,
    affinityTargets: ['RAIDER', 'SPIRIT', 'BOSS_MIRAGE'],
    affinityDesc: '정령·도적 1.50x',
    unlockedByDefault: false,
  },
  TUR_03: {
    id: 'TUR_03',
    name: '화염 박격포',
    weaponType: '광역 폭발',
    baseAtk: 45,
    isTickBased: false,
    splashRadiusPx: 65,
    cooldownSec: 2.2,
    affinityMultiplier: 1.4,
    affinityTargets: ['SWARM', 'OBSTACLE'],
    affinityDesc: '군집·장애물 1.40x',
    unlockedByDefault: false,
  },
};

export const TURRET_ORDER: readonly TurretId[] = ['TUR_01', 'TUR_02', 'TUR_03'];

export const PARTS_MASTER = {
  LEG_01: {
    id: 'LEG_01',
    name: '유압 다족 파츠',
    quicksandResistPerLv: 0.2,
    speedPctPerLv: 0.08,
  },
  SHD_01: {
    id: 'SHD_01',
    name: '태양광 보호막',
    baseDurationSec: 5.0,
    durationBonusPerLv: 0.5,
    cooldownSec: 18.0,
  },
} as const;

export type MercenaryId = 'kasim' | 'harun' | 'sera' | 'tarek' | 'zara' | 'lili';

export interface MercenarySpec {
  readonly id: MercenaryId;
  readonly name: string;
  readonly role: string;
  readonly colorHex: string;
  readonly unlockedByDefault: boolean;
}

export const MERCENARY_TABLE: readonly MercenarySpec[] = [
  { id: 'kasim', name: '카심', role: '호위대장', colorHex: '#C27D38', unlockedByDefault: true },
  { id: 'harun', name: '하룬', role: '상인', colorHex: '#FB8C00', unlockedByDefault: true },
  { id: 'sera', name: '세라', role: '궁수', colorHex: '#43A047', unlockedByDefault: true },
  { id: 'tarek', name: '타리크', role: '전사', colorHex: '#E53935', unlockedByDefault: false },
  { id: 'zara', name: '자라', role: '마법사', colorHex: '#8E24AA', unlockedByDefault: false },
  { id: 'lili', name: '릴리', role: '치유사', colorHex: '#FDD835', unlockedByDefault: false },
];

export interface BiomeDefinition {
  readonly index: 0 | 1 | 2 | 3;
  readonly id: string;
  readonly name: string;
  readonly startMeters: number;
  readonly endMeters: number;
  readonly skyTopHex: string;
  readonly skyBottomHex: string;
  readonly groundHex: string;
  readonly accentGroundHex: string;
  readonly hasQuicksand: boolean;
  readonly isSandstorm: boolean;
  readonly vignetteAlpha: number;
  readonly stormParticleTarget: number;
  readonly isSinkholeZone: boolean;
  readonly tradeProfitRate: number;
}

export const BIOME_TABLE: readonly BiomeDefinition[] = [
  {
    index: 0,
    id: 'BIOME_DUNES',
    name: '황혼의 모래언덕',
    startMeters: 0,
    endMeters: 500,
    skyTopHex: '#E67E22',
    skyBottomHex: '#FDEBD0',
    groundHex: '#E0A96D',
    accentGroundHex: '#C98A4B',
    hasQuicksand: false,
    isSandstorm: false,
    vignetteAlpha: 0,
    stormParticleTarget: 16,
    isSinkholeZone: false,
    tradeProfitRate: 0.35,
  },
  {
    index: 1,
    id: 'BIOME_CANYON',
    name: '붉은 전갈 협곡',
    startMeters: 500,
    endMeters: 1000,
    skyTopHex: '#7B241C',
    skyBottomHex: '#D35400',
    groundHex: '#A04000',
    accentGroundHex: '#5C3317',
    hasQuicksand: true,
    isSandstorm: false,
    vignetteAlpha: 0,
    stormParticleTarget: 24,
    isSinkholeZone: false,
    tradeProfitRate: 0.5,
  },
  {
    index: 2,
    id: 'BIOME_STORM',
    name: '환각의 모래폭풍',
    startMeters: 1000,
    endMeters: 1500,
    skyTopHex: '#5D4E2B',
    skyBottomHex: '#B7950B',
    groundHex: '#8C6D32',
    accentGroundHex: '#4F3E1C',
    hasQuicksand: false,
    isSandstorm: true,
    vignetteAlpha: 0.42,
    stormParticleTarget: 80,
    isSinkholeZone: false,
    tradeProfitRate: 0.7,
  },
  {
    index: 3,
    id: 'BIOME_TEMPLE',
    name: '고대 태양 신전 오아시스',
    startMeters: 1500,
    endMeters: 2000,
    skyTopHex: '#1ABC9C',
    skyBottomHex: '#F7DC6F',
    groundHex: '#D9B664',
    accentGroundHex: '#17A589',
    hasQuicksand: false,
    isSandstorm: false,
    vignetteAlpha: 0,
    stormParticleTarget: 22,
    isSinkholeZone: true,
    tradeProfitRate: 1.0,
  },
];

export const Z_ORDER = {
  SKY_BACKDROP: 0,
  PARALLAX_FAR: 10,
  PARALLAX_MID: 20,
  GROUND_TILE: 30,
  CARAVAN_CONVOY: 40,
  PLAYER_MECH: 50,
  ENEMY_BOSS: 60,
  PROJECTILE_VFX: 70,
  WEATHER_FILTER: 80,
  WORLD_UI_TEXT: 90,
} as const;

export const PARALLAX_FACTORS = {
  SKY_BACKDROP: 0.0,
  PARALLAX_FAR: 0.15,
  PARALLAX_MID: 0.45,
  GROUND_TILE: 1.0,
} as const;

export type AssetKey =
  | 'CHAR_KASIM'
  | 'CHAR_HARUN'
  | 'CHAR_TAREK'
  | 'CHAR_SERA'
  | 'CHAR_ZARA'
  | 'CHAR_LILI'
  | 'CHAR_JAFAR'
  | 'SANDWALKER_BODY'
  | 'TURRET_HARPOON'
  | 'TURRET_LASER'
  | 'TURRET_MORTAR'
  | 'CAMEL_WAGON'
  | 'ENEMY_RAIDER'
  | 'BOSS_SCORPION'
  | 'BOSS_MIRAGE'
  | 'BOSS_SANDWORM'
  | 'BIOME_ZONE1'
  | 'BIOME_ZONE2'
  | 'BIOME_ZONE3'
  | 'BIOME_ZONE4'
  | 'STORY_CUT1'
  | 'STORY_CUT2'
  | 'STORY_CUT3';

export interface AssetManifestEntry {
  readonly key: AssetKey;
  readonly path: string;
  readonly width: number;
  readonly height: number;
  readonly pivotX: number;
  readonly pivotY: number;
}

export const ASSET_MANIFEST: readonly AssetManifestEntry[] = [
  { key: 'CHAR_KASIM', path: 'assets/characters/kasim.png', width: 24, height: 32, pivotX: 0.5, pivotY: 1.0 },
  { key: 'CHAR_HARUN', path: 'assets/characters/harun.png', width: 24, height: 32, pivotX: 0.5, pivotY: 1.0 },
  { key: 'CHAR_TAREK', path: 'assets/characters/tarek.png', width: 24, height: 32, pivotX: 0.5, pivotY: 1.0 },
  { key: 'CHAR_SERA', path: 'assets/characters/sera.png', width: 24, height: 32, pivotX: 0.5, pivotY: 1.0 },
  { key: 'CHAR_ZARA', path: 'assets/characters/zara.png', width: 24, height: 32, pivotX: 0.5, pivotY: 1.0 },
  { key: 'CHAR_LILI', path: 'assets/characters/lili.png', width: 24, height: 32, pivotX: 0.5, pivotY: 1.0 },
  { key: 'CHAR_JAFAR', path: 'assets/characters/jafar.png', width: 28, height: 36, pivotX: 0.5, pivotY: 1.0 },
  { key: 'SANDWALKER_BODY', path: 'assets/mech/sandwalker_body.png', width: 72, height: 48, pivotX: 0.5, pivotY: 1.0 },
  { key: 'TURRET_HARPOON', path: 'assets/mech/turret_harpoon.png', width: 32, height: 12, pivotX: 0.3, pivotY: 0.5 },
  { key: 'TURRET_LASER', path: 'assets/mech/turret_laser.png', width: 28, height: 14, pivotX: 0.3, pivotY: 0.5 },
  { key: 'TURRET_MORTAR', path: 'assets/mech/turret_mortar.png', width: 26, height: 18, pivotX: 0.3, pivotY: 0.5 },
  { key: 'CAMEL_WAGON', path: 'assets/mech/camel_wagon.png', width: 44, height: 32, pivotX: 0.5, pivotY: 1.0 },
  { key: 'ENEMY_RAIDER', path: 'assets/enemies/sand_raider.png', width: 28, height: 34, pivotX: 0.5, pivotY: 1.0 },
  { key: 'BOSS_SCORPION', path: 'assets/enemies/scorpion_rex.png', width: 84, height: 64, pivotX: 0.5, pivotY: 1.0 },
  { key: 'BOSS_MIRAGE', path: 'assets/enemies/mirage_king.png', width: 76, height: 92, pivotX: 0.5, pivotY: 1.0 },
  { key: 'BOSS_SANDWORM', path: 'assets/enemies/apophis_sandworm.png', width: 110, height: 140, pivotX: 0.5, pivotY: 1.0 },
  { key: 'BIOME_ZONE1', path: 'assets/biomes/zone1_dunes.png', width: 960, height: 404, pivotX: 0, pivotY: 0 },
  { key: 'BIOME_ZONE2', path: 'assets/biomes/zone2_canyon.png', width: 960, height: 404, pivotX: 0, pivotY: 0 },
  { key: 'BIOME_ZONE3', path: 'assets/biomes/zone3_storm.png', width: 960, height: 404, pivotX: 0, pivotY: 0 },
  { key: 'BIOME_ZONE4', path: 'assets/biomes/zone4_temple.png', width: 960, height: 404, pivotX: 0, pivotY: 0 },
  { key: 'STORY_CUT1', path: 'assets/storyboard/cut1_legend.png', width: 960, height: 540, pivotX: 0, pivotY: 0 },
  { key: 'STORY_CUT2', path: 'assets/storyboard/cut2_ambush.png', width: 960, height: 540, pivotX: 0, pivotY: 0 },
  { key: 'STORY_CUT3', path: 'assets/storyboard/cut3_departure.png', width: 960, height: 540, pivotX: 0, pivotY: 0 },
];

export const FALLBACK_HEX_COLORS = {
  SANDWALKER_HULL: '#C27D38',
  SANDWALKER_LEGS: '#3E2723',
  TURRET_HARPOON: '#FF7043',
  TURRET_LASER: '#00E5FF',
  TURRET_MORTAR: '#FFB300',
  WAGON_CANOPY: '#D7CCC8',
  WAGON_BODY: '#8D6E63',
  ENEMY_RAIDER_CLOAK: '#6D4C41',
  ENEMY_RAIDER_SCARF: '#C62828',
  BOSS_SCORPION_BODY: '#880E4F',
  BOSS_SCORPION_STING: '#76FF03',
  BOSS_MIRAGE_BODY: '#00ACC1',
  BOSS_MIRAGE_CROWN: '#FFD600',
  BOSS_SANDWORM_SHELL: '#5D4037',
  BOSS_SANDWORM_CRACK: '#FF3D00',
  BOSS_SANDWORM_WEAKSPOT: '#FFEA00',
} as const;

export const DODGE_IFRAME_SEC = 0.6;
export const DODGE_COOLDOWN_SEC = 4.0;
export const GOLDEN_COUNTER_MULT = 2.5;
export const STUNNED_DAMAGE_MULT = 1.5;

export const BASE_CRIT_CHANCE = 0.15;
export const BASE_CRIT_MULT = 1.5;
export const WEAKPOINT_CRIT_MULT = 1.75;
export const MANUAL_LOCK_DAMAGE_MULT = 1.5;

export const ENEMY_HIT_FLASH_SEC = 0.08;
export const INPUT_BUFFER_STANDARD_SEC = 0.12;
export const INPUT_BUFFER_DODGE_SEC = 0.15;

export const SANDWORM_SUBMERGE_SEC = 2.5;
export const SANDWORM_TELEGRAPH_SEC = 1.5;
export const SANDWORM_EMERGE_SEC = 4.0;
export const SANDWORM_STUN_SEC = 2.5;

export type EnemyKind = 'RAIDER' | 'BOSS_SCORPION' | 'BOSS_MIRAGE' | 'BOSS_SANDWORM';

export interface EnemyBaseSpec {
  readonly kind: EnemyKind;
  readonly name: string;
  readonly archetypeTag: string;
  readonly maxHp: number;
  readonly defense: number;
  readonly width: number;
  readonly height: number;
  readonly radius: number;
  readonly speedPxPerSec: number;
  readonly rewardGold: number;
  readonly rewardGears: number;
}

export const ENEMY_BASE_SPECS: Record<EnemyKind, EnemyBaseSpec> = {
  RAIDER: {
    kind: 'RAIDER',
    name: '모래 도적단',
    archetypeTag: 'RAIDER',
    maxHp: 110,
    defense: 2,
    width: 28,
    height: 34,
    radius: 20,
    speedPxPerSec: 46,
    rewardGold: 28,
    rewardGears: 0,
  },
  BOSS_SCORPION: {
    kind: 'BOSS_SCORPION',
    name: '전갈 군주',
    archetypeTag: 'BOSS_SCORPION',
    maxHp: 950,
    defense: 8,
    width: 84,
    height: 64,
    radius: 44,
    speedPxPerSec: 18,
    rewardGold: 180,
    rewardGears: 3,
  },
  BOSS_MIRAGE: {
    kind: 'BOSS_MIRAGE',
    name: '신기루 정령왕',
    archetypeTag: 'BOSS_MIRAGE',
    maxHp: 1350,
    defense: 6,
    width: 76,
    height: 92,
    radius: 46,
    speedPxPerSec: 14,
    rewardGold: 260,
    rewardGears: 4,
  },
  BOSS_SANDWORM: {
    kind: 'BOSS_SANDWORM',
    name: '아포피스 샌드웜',
    archetypeTag: 'BOSS_SANDWORM',
    maxHp: 2200,
    defense: 10,
    width: 110,
    height: 140,
    radius: 58,
    speedPxPerSec: 36,
    rewardGold: 500,
    rewardGears: 8,
  },
};
