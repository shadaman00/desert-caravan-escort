import type { ExplorerPassivesState } from '@/store/types';

export type RelicRarity = 'COMMON' | 'RARE' | 'LEGENDARY' | 'ANCIENT';

export interface RelicPassiveBonus {
  readonly turretDamagePct?: number;
  readonly critChancePct?: number;
  readonly tradeGoldPct?: number;
  readonly stormResistPct?: number;
  readonly excavateSpeedPct?: number;
}

export interface RelicDefinition {
  readonly id: string;
  readonly name: string;
  readonly rarity: RelicRarity;
  readonly description: string;
  readonly gearReward: number;
  readonly appraiseDurationMs: number;
  readonly passiveBonus: RelicPassiveBonus;
  readonly bonusSummary: string;
}

export interface SteleDefinition {
  readonly id: number;
  readonly title: string;
  readonly inscription: string;
  readonly gearReward: number;
}

export interface ComputedCodexBonuses {
  turretDamagePct: number;
  critChancePct: number;
  tradeGoldPct: number;
  stormResistPct: number;
  excavateSpeedPct: number;
}

export const RELIC_RARITY_LABELS: Record<RelicRarity, string> = {
  COMMON: '일반',
  RARE: '희귀',
  LEGENDARY: '전설',
  ANCIENT: '고대',
};

export const DEFAULT_RELIC_APPRAISE_MS = 60_000;
export const DEFAULT_RELIC_GEAR_REWARD = 5;
export const DEFAULT_STELE_GEAR_REWARD = 5;

export const RELIC_DEFINITIONS: readonly RelicDefinition[] = [
  // Original 6 Canonical Relics (IDs preserved for save/test compatibility)
  {
    id: 'relic_solar_disc',
    name: '태양의 황금 원반',
    rarity: 'LEGENDARY',
    description: '고대 태양 사제가 제의에 사용하던 순금 원반.',
    gearReward: DEFAULT_RELIC_GEAR_REWARD,
    appraiseDurationMs: DEFAULT_RELIC_APPRAISE_MS,
    passiveBonus: { turretDamagePct: 0.05 },
    bonusSummary: '포탑 공격력 +5%',
  },
  {
    id: 'relic_ankh',
    name: '생명의 앙크',
    rarity: 'RARE',
    description: '모래폭풍 속에서도 꺼지지 않는 고대 왕조의 부적.',
    gearReward: DEFAULT_RELIC_GEAR_REWARD,
    appraiseDurationMs: DEFAULT_RELIC_APPRAISE_MS,
    passiveBonus: { stormResistPct: 0.06 },
    bonusSummary: '폭풍 피해 -6%',
  },
  {
    id: 'relic_scarab',
    name: '황금 스카라베',
    rarity: 'RARE',
    description: '샌드워커의 동력로와 공명하는 기계 갑충석.',
    gearReward: DEFAULT_RELIC_GEAR_REWARD,
    appraiseDurationMs: DEFAULT_RELIC_APPRAISE_MS,
    passiveBonus: { turretDamagePct: 0.03, excavateSpeedPct: 0.05 },
    bonusSummary: '포탑 +3%, 발굴 +5%',
  },
  {
    id: 'relic_crown',
    name: '파라오의 보관',
    rarity: 'ANCIENT',
    description: '잃어버린 황금 신전의 통치자가 썼던 왕관의 파편.',
    gearReward: DEFAULT_RELIC_GEAR_REWARD,
    appraiseDurationMs: DEFAULT_RELIC_APPRAISE_MS,
    passiveBonus: { turretDamagePct: 0.06, tradeGoldPct: 0.05 },
    bonusSummary: '포탑 +6%, 교역 +5%',
  },
  {
    id: 'relic_sun_compass',
    name: '태양의 나침반',
    rarity: 'COMMON',
    description: '신기루를 꿰뚫고 오아시스의 방위를 가리키는 의기.',
    gearReward: DEFAULT_RELIC_GEAR_REWARD,
    appraiseDurationMs: DEFAULT_RELIC_APPRAISE_MS,
    passiveBonus: { tradeGoldPct: 0.03 },
    bonusSummary: '교역 수익 +3%',
  },
  {
    id: 'relic_astral_astrolabe',
    name: '성좌의 아스트롤라베',
    rarity: 'LEGENDARY',
    description: '밤사막의 별자리를 기록한 황동 천문 관측기.',
    gearReward: DEFAULT_RELIC_GEAR_REWARD,
    appraiseDurationMs: DEFAULT_RELIC_APPRAISE_MS,
    passiveBonus: { excavateSpeedPct: 0.08, critChancePct: 0.02 },
    bonusSummary: '발굴 +8%, 치명타 +2%',
  },
  // Extended 14 Relics across 4 Rarities (20 total)
  {
    id: 'relic_clay_seal',
    name: '상단 길드 점토 인장',
    rarity: 'COMMON',
    description: '고대 캐러밴 조합원들이 거래 증표로 쓰던 점토 도장.',
    gearReward: 4,
    appraiseDurationMs: DEFAULT_RELIC_APPRAISE_MS,
    passiveBonus: { tradeGoldPct: 0.02 },
    bonusSummary: '교역 수익 +2%',
  },
  {
    id: 'relic_bronze_cog',
    name: '녹슨 청동 태엽',
    rarity: 'COMMON',
    description: '보행기 보조 동력축에 맞춰지는 고대 규격 기어.',
    gearReward: 4,
    appraiseDurationMs: DEFAULT_RELIC_APPRAISE_MS,
    passiveBonus: { turretDamagePct: 0.02 },
    bonusSummary: '포탑 공격력 +2%',
  },
  {
    id: 'relic_sandglass',
    name: '검은 모래시계',
    rarity: 'COMMON',
    description: '유사의 흐름을 측정하던 사막 측량사의 도구.',
    gearReward: 4,
    appraiseDurationMs: DEFAULT_RELIC_APPRAISE_MS,
    passiveBonus: { excavateSpeedPct: 0.04 },
    bonusSummary: '발굴 속도 +4%',
  },
  {
    id: 'relic_nomad_cloak',
    name: '유목민의 방진 망토 핀',
    rarity: 'COMMON',
    description: '모래바람을 버티던 옛 유목 부족의 은제 장식.',
    gearReward: 4,
    appraiseDurationMs: DEFAULT_RELIC_APPRAISE_MS,
    passiveBonus: { stormResistPct: 0.04 },
    bonusSummary: '폭풍 피해 -4%',
  },
  {
    id: 'relic_falcon_plumage',
    name: '황금 매 깃털 브로치',
    rarity: 'RARE',
    description: '정밀 사격수들이 바람을 읽기 위해 착용하던 휘장.',
    gearReward: 5,
    appraiseDurationMs: DEFAULT_RELIC_APPRAISE_MS,
    passiveBonus: { critChancePct: 0.03 },
    bonusSummary: '치명타 +3%',
  },
  {
    id: 'relic_scorpion_stinger',
    name: '화석화 된 전갈 독침',
    rarity: 'RARE',
    description: '작살포 탄두 코팅에 쓰이는 단단한 광물질 독침.',
    gearReward: 5,
    appraiseDurationMs: DEFAULT_RELIC_APPRAISE_MS,
    passiveBonus: { turretDamagePct: 0.04 },
    bonusSummary: '포탑 공격력 +4%',
  },
  {
    id: 'relic_mirage_mirror',
    name: '신기루 반사경',
    rarity: 'RARE',
    description: '태양광을 한 점으로 모으는 고대 오목 반사 거울.',
    gearReward: 5,
    appraiseDurationMs: DEFAULT_RELIC_APPRAISE_MS,
    passiveBonus: { turretDamagePct: 0.03, stormResistPct: 0.03 },
    bonusSummary: '포탑 +3%, 폭풍 -3%',
  },
  {
    id: 'relic_merchant_ledger',
    name: '오아시스 황금 장부',
    rarity: 'RARE',
    description: '각 거점의 특산품 시세 파동이 기록된 양가죽 장부.',
    gearReward: 5,
    appraiseDurationMs: DEFAULT_RELIC_APPRAISE_MS,
    passiveBonus: { tradeGoldPct: 0.04 },
    bonusSummary: '교역 수익 +4%',
  },
  {
    id: 'relic_obsidian_prism',
    name: '흑요석 광선 프리즘',
    rarity: 'LEGENDARY',
    description: '열선 레이저의 파장을 증폭시키는 제국 병기 코어.',
    gearReward: 7,
    appraiseDurationMs: DEFAULT_RELIC_APPRAISE_MS,
    passiveBonus: { turretDamagePct: 0.06, critChancePct: 0.02 },
    bonusSummary: '포탑 +6%, 치명타 +2%',
  },
  {
    id: 'relic_wind_bell',
    name: '풍신(風神)의 청동 방울',
    rarity: 'LEGENDARY',
    description: '영구 모래폭풍 결계의 소용돌이를 잦아들게 하는 성물.',
    gearReward: 7,
    appraiseDurationMs: DEFAULT_RELIC_APPRAISE_MS,
    passiveBonus: { stormResistPct: 0.10, excavateSpeedPct: 0.05 },
    bonusSummary: '폭풍 -10%, 발굴 +5%',
  },
  {
    id: 'relic_royal_carat',
    name: '태양왕의 황금 저울추',
    rarity: 'LEGENDARY',
    description: '제국 국고의 황금을 계량하던 절대 기준의 저울추.',
    gearReward: 7,
    appraiseDurationMs: DEFAULT_RELIC_APPRAISE_MS,
    passiveBonus: { tradeGoldPct: 0.07 },
    bonusSummary: '교역 수익 +7%',
  },
  {
    id: 'relic_sun_heart',
    name: '태양 코어의 파편',
    rarity: 'ANCIENT',
    description: '식지 않는 태양 제국의 원초 동력핵에서 떨어져 나온 결정.',
    gearReward: 10,
    appraiseDurationMs: DEFAULT_RELIC_APPRAISE_MS,
    passiveBonus: { turretDamagePct: 0.08, stormResistPct: 0.08 },
    bonusSummary: '포탑 +8%, 폭풍 -8%',
  },
  {
    id: 'relic_apophis_scale',
    name: '아포피스 샌드웜의 역린',
    rarity: 'ANCIENT',
    description: '고대 괴충의 두개골을 꿰뚫고 수습한 초경질 갑각 편린.',
    gearReward: 10,
    appraiseDurationMs: DEFAULT_RELIC_APPRAISE_MS,
    passiveBonus: { turretDamagePct: 0.07, critChancePct: 0.04 },
    bonusSummary: '포탑 +7%, 치명타 +4%',
  },
  {
    id: 'relic_eternal_key',
    name: '최초의 오아시스 성배',
    rarity: 'ANCIENT',
    description: '마르지 않는 영원의 샘물이 맺히는 태양 신전의 최상위 유물.',
    gearReward: 10,
    appraiseDurationMs: DEFAULT_RELIC_APPRAISE_MS,
    passiveBonus: { tradeGoldPct: 0.08, excavateSpeedPct: 0.10 },
    bonusSummary: '교역 +8%, 발굴 +10%',
  },
];

export function getRelicDefinition(id: string): RelicDefinition {
  const found = RELIC_DEFINITIONS.find((r) => r.id === id);
  if (found) return found;
  return {
    id,
    name: `고대 유물 (${id})`,
    rarity: 'COMMON',
    description: '사막 모래 아래에서 발굴된 미지의 유물.',
    gearReward: DEFAULT_RELIC_GEAR_REWARD,
    appraiseDurationMs: DEFAULT_RELIC_APPRAISE_MS,
    passiveBonus: { turretDamagePct: 0.01 },
    bonusSummary: '포탑 공격력 +1%',
  };
}

/**
 * Sums permanent passive bonuses from unlocked codex relics and explorer passives above Lv.1.
 * Returns all zeros when codex is empty and passives are Lv.1 (preserving baseline tests).
 */
export function computeRelicCodexBonuses(
  codexIds: readonly string[],
  explorerPassives?: ExplorerPassivesState
): ComputedCodexBonuses {
  let turretDamagePct = 0;
  let critChancePct = 0;
  let tradeGoldPct = 0;
  let stormResistPct = 0;
  let excavateSpeedPct = 0;

  for (let i = 0; i < codexIds.length; i++) {
    const def = RELIC_DEFINITIONS.find((r) => r.id === codexIds[i]);
    if (!def) continue;
    turretDamagePct += def.passiveBonus.turretDamagePct ?? 0;
    critChancePct += def.passiveBonus.critChancePct ?? 0;
    tradeGoldPct += def.passiveBonus.tradeGoldPct ?? 0;
    stormResistPct += def.passiveBonus.stormResistPct ?? 0;
    excavateSpeedPct += def.passiveBonus.excavateSpeedPct ?? 0;
  }

  if (explorerPassives) {
    const appraisalBonusLv = Math.max(0, explorerPassives.appraisalLv - 1);
    const survivalBonusLv = Math.max(0, explorerPassives.survivalLv - 1);
    const linguisticsBonusLv = Math.max(0, explorerPassives.linguisticsLv - 1);
    tradeGoldPct += appraisalBonusLv * 0.02;
    stormResistPct += survivalBonusLv * 0.03;
    excavateSpeedPct += linguisticsBonusLv * 0.05;
  }

  return {
    turretDamagePct: Math.round(turretDamagePct * 1000) / 1000,
    critChancePct: Math.round(critChancePct * 1000) / 1000,
    tradeGoldPct: Math.round(tradeGoldPct * 1000) / 1000,
    stormResistPct: Math.min(0.7, Math.round(stormResistPct * 1000) / 1000),
    excavateSpeedPct: Math.round(excavateSpeedPct * 1000) / 1000,
  };
}

const RARITY_WEIGHTS: Record<RelicRarity, number> = {
  COMMON: 40,
  RARE: 30,
  LEGENDARY: 18,
  ANCIENT: 8,
};

/**
 * Selects a relic ID weighted toward uncollected and higher-rarity relics as appraisalLv rises.
 */
export function pickWeightedRelicId(
  codexIds: readonly string[],
  appraisalLv = 1,
  seq = 0,
  rng: () => number = Math.random
): string {
  const highTierMult = 1 + Math.max(0, appraisalLv - 1) * 0.2;
  const uncollected = RELIC_DEFINITIONS.filter((r) => !codexIds.includes(r.id));
  const pool = uncollected.length > 0 ? uncollected : RELIC_DEFINITIONS;

  if (appraisalLv <= 1 && seq < 6 && pool === RELIC_DEFINITIONS) {
    return pool[seq % pool.length].id;
  }

  const weights = pool.map((def) => {
    const base = RARITY_WEIGHTS[def.rarity];
    return def.rarity === 'LEGENDARY' || def.rarity === 'ANCIENT' ? base * highTierMult : base;
  });
  const total = weights.reduce((a, b) => a + b, 0);
  const roll = Math.min(0.999999, Math.max(0, rng())) * total;

  let acc = 0;
  for (let i = 0; i < pool.length; i++) {
    acc += weights[i];
    if (roll < acc) return pool[i].id;
  }
  return pool[0].id;
}

export const STELE_DEFINITIONS: readonly SteleDefinition[] = [
  { id: 1, title: '비석 I: 여명의 서약', inscription: '태양의 수레바퀴가 다시 사막을 가른다.', gearReward: 5 },
  { id: 2, title: '비석 II: 상단의 규율', inscription: '생수와 신의를 저울에 달지 마라.', gearReward: 5 },
  { id: 3, title: '비석 III: 유사 횡단기', inscription: '강철 다리가 가라앉을 때 열기를 불어넣어라.', gearReward: 5 },
  { id: 4, title: '비석 IV: 중계탑의 빛', inscription: '어둠이 짙을수록 태양의 탑은 멀리 빛난다.', gearReward: 5 },
  { id: 5, title: '비석 V: 작살수의 계명', inscription: '단단한 껍질일수록 깊은 쐐기가 필요하다.', gearReward: 5 },
  { id: 6, title: '비석 VI: 아지랑이의 춤', inscription: '허상을 태우는 것은 한 줄기 직선의 빛.', gearReward: 5 },
  { id: 7, title: '비석 VII: 곡사포의 노래', inscription: '하늘에서 떨어지는 불꽃은 군집을 흩는다.', gearReward: 5 },
  { id: 8, title: '비석 VIII: 다섯 별의 결속', inscription: '다섯의 손이 맞닿을 때 상단은 무적이 된다.', gearReward: 5 },
  { id: 9, title: '비석 IX: 자파르의 저울', inscription: '사막의 거상은 두 배의 가치를 알아본다.', gearReward: 5 },
  { id: 10, title: '비석 X: 심연의 경고', inscription: '땅이 울릴 때는 머리의 갑각부터 부수어라.', gearReward: 5 },
  { id: 11, title: '비석 XI: 세 개의 열쇠', inscription: '세 관문을 지난 자만이 신전의 문을 연다.', gearReward: 5 },
  { id: 12, title: '비석 XII: 황금 신전의 약속', inscription: '여정의 끝에 영원한 오아시스가 기다린다.', gearReward: 5 },
];

export function getSteleDefinition(id: number): SteleDefinition | undefined {
  return STELE_DEFINITIONS.find((s) => s.id === id);
}
