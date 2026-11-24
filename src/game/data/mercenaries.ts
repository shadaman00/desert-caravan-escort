import type { MercenaryRole } from '@/store/types';

export type MercenaryId = 'harun' | 'sera' | 'zara' | 'tarik' | 'lili';
export type MercenarySilhouetteKind = 'SHIELD' | 'BOW' | 'STAFF' | 'CROSS' | 'PACK';
export type MercenaryPlacement =
  | 'GROUND_FRONT'
  | 'DECK_REAR'
  | 'DECK_FRONT'
  | 'DECK_MID'
  | 'CARAVAN';

export interface MercenaryDefinition {
  readonly id: MercenaryId;
  readonly name: string;
  readonly role: MercenaryRole;
  readonly roleLabel: string;
  readonly silhouette: MercenarySilhouetteKind;
  readonly colorPrimary: string;
  readonly colorAccent: string;
  readonly placement: MercenaryPlacement;
  readonly slotOffset: { readonly x: number; readonly y: number };
  readonly baseAttack: number;
  readonly attackIntervalSec: number;
  readonly skillCooldownSec: number;
  readonly rangePx: number;
  readonly effectSummary: string;
  readonly unlockHint: string;
}

export const SYNERGY_PARTY_ATTACK_BONUS = 0.25;
export const SYNERGY_TRADE_GOLD_BONUS = 0.20;
export const TARIK_MELEE_DAMAGE_MULTIPLIER = 0.75;
export const TARIK_SHIELD_BASE = 40;
export const TARIK_SHIELD_MAX_RATIO = 0.35;
export const TARIK_INTERCEPT_RADIUS_PX = 75;
export const TARIK_KNOCKBACK_PX = 35;

export const SERA_CRIT_CHANCE = 0.25;
export const SERA_CRIT_MULTIPLIER = 1.75;
export const SERA_VOLLEY_ARROW_COUNT = 3;
export const SERA_VOLLEY_DAMAGE_FACTOR = 0.85;

export const ZARA_STELE_DECODE_MULTIPLIER = 1.30;
export const ZARA_NOVA_BASE_DAMAGE = 52;
export const ZARA_NOVA_RADIUS_PX = 75;

export const LILI_PASSIVE_HEAL_RATE_PER_SEC = 0.02;
export const LILI_SKILL_HEAL_FRACTION = 0.05;

export const HARUN_TRADE_BONUS = 0.25;

export const MERCENARY_IDS: readonly MercenaryId[] = [
  'harun',
  'sera',
  'zara',
  'tarik',
  'lili',
];

export const MERCENARY_DEFINITIONS: Record<MercenaryId, MercenaryDefinition> = {
  tarik: {
    id: 'tarik',
    name: '타리크',
    role: 'WARRIOR',
    roleLabel: '전사',
    silhouette: 'SHIELD',
    colorPrimary: '#2b6cb0',
    colorAccent: '#90cdf4',
    placement: 'GROUND_FRONT',
    slotOffset: { x: 42, y: 0 },
    baseAttack: 18,
    attackIntervalSec: 1.1,
    skillCooldownSec: 8.0,
    rangePx: 95,
    effectSummary: '마차 근접 피격 -25%, 주기적 태양 방패·밀쳐내기',
    unlockHint: 'Act 1 보스(바르카 장갑차) 처치 시 합류',
  },
  sera: {
    id: 'sera',
    name: '세라',
    role: 'ARCHER',
    roleLabel: '궁수',
    silhouette: 'BOW',
    colorPrimary: '#2f855a',
    colorAccent: '#68d391',
    placement: 'DECK_REAR',
    slotOffset: { x: -20, y: -86 },
    baseAttack: 24,
    attackIntervalSec: 0.65,
    skillCooldownSec: 6.0,
    rangePx: 380,
    effectSummary: '원거리 연사 & 치명타 25% (1.75x), 관통 일제 사격',
    unlockHint: '오프닝 제1오아시스 루트에서 합류',
  },
  zara: {
    id: 'zara',
    name: '자라',
    role: 'MAGE',
    roleLabel: '마법사',
    silhouette: 'STAFF',
    colorPrimary: '#6b46c1',
    colorAccent: '#d6bcfa',
    placement: 'DECK_FRONT',
    slotOffset: { x: 18, y: -86 },
    baseAttack: 28,
    attackIntervalSec: 1.4,
    skillCooldownSec: 7.0,
    rangePx: 370,
    effectSummary: '비석 해독 속도 +30%, 태양 폭발 광역 마법',
    unlockHint: 'Act 1 제2오아시스 도착 시 합류',
  },
  lili: {
    id: 'lili',
    name: '릴리',
    role: 'HEALER',
    roleLabel: '치유사',
    silhouette: 'CROSS',
    colorPrimary: '#319795',
    colorAccent: '#81e6d9',
    placement: 'DECK_MID',
    slotOffset: { x: -4, y: -90 },
    baseAttack: 0,
    attackIntervalSec: 1.0,
    skillCooldownSec: 5.0,
    rangePx: 0,
    effectSummary: '초당 최대 HP 2% 지속 회복 & 태양 축복 버스트 치유',
    unlockHint: 'Act 1 보스(바르카 장갑차) 처치 시 합류',
  },
  harun: {
    id: 'harun',
    name: '하룬',
    role: 'MERCHANT',
    roleLabel: '상인',
    silhouette: 'PACK',
    colorPrimary: '#c05621',
    colorAccent: '#f6ad55',
    placement: 'CARAVAN',
    slotOffset: { x: -56, y: 0 },
    baseAttack: 10,
    attackIntervalSec: 1.8,
    skillCooldownSec: 8.0,
    rangePx: 360,
    effectSummary: '교역 매각가 +25%, 전리품 금화 회수 투척',
    unlockHint: '오프닝 제1오아시스 루트에서 합류',
  },
};
