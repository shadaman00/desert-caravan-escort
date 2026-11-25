import type { AutoUpgradeItemKind, GameStoreState } from '@/store/types';

export type QuestKind = 'MAIN' | 'SUB';

export interface QuestDefinition {
  readonly id: string;
  readonly act: 1 | 2 | 3 | 4;
  readonly kind: QuestKind;
  readonly title: string;
  readonly description: string;
  readonly target: number;
  readonly readProgress: (state: GameStoreState) => number;
  readonly rewardGold: number;
  readonly rewardItem?: AutoUpgradeItemKind;
  readonly rewardLabel: string;
}

export const URGENT_DELIVERY_TIME_LIMIT_SEC = 120;
export const URGENT_DELIVERY_REWARD_GOLD = 150;

export const QUEST_DEFINITIONS: readonly QuestDefinition[] = [
  // Act 1: 황혼의 모래언덕과 잃어버린 상단
  {
    id: 'q_main_act1_stele',
    act: 1,
    kind: 'MAIN',
    title: '제1 태양 비석 해독',
    description: '사막 행군 중 고대 비석 1호를 발굴·해독하세요.',
    target: 1,
    readProgress: (s) => s.steles.decoded.length,
    rewardGold: 0,
    rewardItem: 'EXPLORER_TABLET',
    rewardLabel: '태양 제국 서판 (탐험가 패시브 자동 승급)',
  },
  {
    id: 'q_main_act1_boss',
    act: 1,
    kind: 'MAIN',
    title: '약탈왕 바르카 격파',
    description: 'Act 1 보스 바르카의 무장 장갑차를 토벌하세요.',
    target: 1,
    readProgress: (s) => ((s.progression?.counters.bossDefeats ?? 0) >= 1 && s.currencies.mapFragments >= 1 ? 1 : 0),
    rewardGold: 0,
    rewardItem: 'TURRET_PART_HARPOON',
    rewardLabel: '작살포 부품 + 타리크·릴리 합류',
  },
  {
    id: 'q_sub_act1_silk_rescue',
    act: 1,
    kind: 'SUB',
    title: '비단 상인 구출 작전',
    description: '모래 도적 소탕(누적 처치 15기)으로 상인단을 구원하세요.',
    target: 15,
    readProgress: (s) => {
      const k = s.progression?.counters.killsByTurret;
      return k ? k.HEAT_RAY + k.HARPOON + k.MORTAR : 0;
    },
    rewardGold: 120,
    rewardItem: 'MERC_MANUAL',
    rewardLabel: '120G + 전투 교범 (용병 자동 승급)',
  },
  {
    id: 'q_sub_act1_spice_trade',
    act: 1,
    kind: 'SUB',
    title: '제1~3 오아시스 특산품 교역',
    description: '누적 교역 수익 300G를 달성해 상단 신임을 얻으세요.',
    target: 300,
    readProgress: (s) => s.progression?.counters.totalTradeProfit ?? 0,
    rewardGold: 0,
    rewardItem: 'WAGON_FRAME',
    rewardLabel: '마차 프레임 (화물 마차 자동 증설)',
  },
  // Act 2: 흐르는 모래늪과 전갈의 협곡
  {
    id: 'q_main_act2_hydraulic',
    act: 2,
    kind: 'MAIN',
    title: '유압식 다족 파츠 개조',
    description: '유사(모래늪) 지대를 1회 돌파하고 다족 설계를 완성하세요.',
    target: 1,
    readProgress: (s) => s.progression?.counters.quicksandCleared ?? 0,
    rewardGold: 0,
    rewardItem: 'HYDRAULIC_BLUEPRINT',
    rewardLabel: '유압 설계도 (다리 Lv.11 유사 면역 돌파)',
  },
  {
    id: 'q_main_act2_scorpion',
    act: 2,
    kind: 'MAIN',
    title: '사막 전갈 군주 토벌',
    description: 'Act 2 이상에서 2번째 고대 비석을 해독하고 전갈 군주에 맞서세요.',
    target: 2,
    readProgress: (s) => s.steles.decoded.length,
    rewardGold: 0,
    rewardItem: 'TURRET_PART_HARPOON',
    rewardLabel: '고강도 작살 노즐 (작살포 자동 승급)',
  },
  {
    id: 'q_sub_act2_salvage',
    act: 2,
    kind: 'SUB',
    title: '모래늪 수송선 인양',
    description: 'Act 2 교역 수익 누적 900G로 침몰한 상단 화물을 복구하세요.',
    target: 900,
    readProgress: (s) => s.progression?.counters.totalTradeProfit ?? 0,
    rewardGold: 0,
    rewardItem: 'WAGON_FRAME',
    rewardLabel: '마차 프레임 (화물 마차 자동 증설)',
  },
  {
    id: 'q_sub_act2_antidote',
    act: 2,
    kind: 'SUB',
    title: '전갈 독액 해독제 납품',
    description: '고대 유물 2종 이상을 감정해 해독제 재료를 확보하세요.',
    target: 2,
    readProgress: (s) => s.relics.codex.length,
    rewardGold: 200,
    rewardItem: 'EXPLORER_TABLET',
    rewardLabel: '200G + 태양 제국 서판 (탐험가 패시브 승급)',
  },
  // Act 3: 환각의 모래폭풍과 신기루 유적
  {
    id: 'q_main_act3_storm',
    act: 3,
    kind: 'MAIN',
    title: '영구 모래폭풍 결계 돌파',
    description: 'Act 3 모래폭풍 구간에서 15초 이상 생존하며 항로를 여세요.',
    target: 15,
    readProgress: (s) => s.progression?.counters.sandstormSurvivedSec ?? 0,
    rewardGold: 0,
    rewardItem: 'TURRET_PART_HEAT',
    rewardLabel: '열선 집속 코어 (열선 포탑 자동 승급)',
  },
  {
    id: 'q_main_act3_keys',
    act: 3,
    kind: 'MAIN',
    title: '신전의 열쇠 확보',
    description: '신전의 열쇠 2개 이상을 모아 태양 신전 결계에 접근하세요.',
    target: 2,
    readProgress: (s) => s.currencies.templeKeys,
    rewardGold: 0,
    rewardItem: 'EXPLORER_TABLET',
    rewardLabel: '태양 제국 서판 (생존·감정 자동 승급)',
  },
  {
    id: 'q_sub_act3_rescue',
    act: 3,
    kind: 'SUB',
    title: '신기루 탐험대 구조',
    description: '열선 레이저 누적 25기 처치로 환영 분신 떼를 제압하세요.',
    target: 25,
    readProgress: (s) => s.progression?.counters.killsByTurret.HEAT_RAY ?? 0,
    rewardGold: 250,
    rewardItem: 'MERC_MANUAL',
    rewardLabel: '250G + 전투 교범 (용병 자동 승급)',
  },
  {
    id: 'q_sub_act3_sunstone',
    act: 3,
    kind: 'SUB',
    title: '폭풍 태양석 고가 교역',
    description: '누적 교역 수익 2,000G로 상단의 황금 항로를 개척하세요.',
    target: 2000,
    readProgress: (s) => s.progression?.counters.totalTradeProfit ?? 0,
    rewardGold: 0,
    rewardItem: 'LEG_PISTON',
    rewardLabel: '유압 관절 피스톤 (다리 파츠 자동 승급)',
  },
  // Act 4: 거대 괴충의 둥지와 태양 신전
  {
    id: 'q_main_act4_gate',
    act: 4,
    kind: 'MAIN',
    title: '태양 신전 대문 결속',
    description: '지도 조각 5개 이상 및 신전의 열쇠 3개를 완성하세요.',
    target: 3,
    readProgress: (s) => (s.currencies.mapFragments >= 5 ? s.currencies.templeKeys : 0),
    rewardGold: 0,
    rewardItem: 'TURRET_PART_MORTAR',
    rewardLabel: '대구경 포신 모듈 (박격포 자동 승급)',
  },
  {
    id: 'q_main_act4_apophis',
    act: 4,
    kind: 'MAIN',
    title: '아포피스 샌드웜 최후 결전',
    description: '보스 부위 파괴 2회 이상을 기록하며 초거대 괴충을 제압하세요.',
    target: 2,
    readProgress: (s) => s.progression?.counters.bossPartBreaks ?? 0,
    rewardGold: 500,
    rewardItem: 'TURRET_PART_ANY',
    rewardLabel: '500G + 고대 포탑 부품 (자동 승급)',
  },
  {
    id: 'q_sub_act4_arsenal',
    act: 4,
    kind: 'SUB',
    title: '황실 무기고 유물 발굴',
    description: '고대 비석 5개 이상을 해독해 제국 무기고를 개방하세요.',
    target: 5,
    readProgress: (s) => s.steles.decoded.length,
    rewardGold: 0,
    rewardItem: 'MERC_MANUAL',
    rewardLabel: '전투 교범 (용병 자동 승급)',
  },
  {
    id: 'q_sub_act4_alliance',
    act: 4,
    kind: 'SUB',
    title: '전 사막 오아시스 연합 결성',
    description: '유물 도감 6종 이상 수집으로 상단 연합의 영예를 세우세요.',
    target: 6,
    readProgress: (s) => s.relics.codex.length,
    rewardGold: 400,
    rewardItem: 'WAGON_FRAME',
    rewardLabel: '400G + 마차 프레임 (화물 마차 자동 증설)',
  },
];
