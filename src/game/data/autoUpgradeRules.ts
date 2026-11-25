import type {
  AutoUpgradeCategory,
  AutoUpgradeItemKind,
  GameStoreState,
  ProgressionCounters,
  TurretType,
} from '@/store/types';

export interface LootItemMeta {
  readonly kind: AutoUpgradeItemKind;
  readonly label: string;
  readonly shortLabel: string;
  readonly colorPrimary: string;
  readonly colorHighlight: string;
}

export const LOOT_ITEM_CATALOG: Record<AutoUpgradeItemKind, LootItemMeta> = {
  TURRET_PART_HEAT: {
    kind: 'TURRET_PART_HEAT',
    label: '열선 집속 코어',
    shortLabel: '열선부품',
    colorPrimary: '#dd6b20',
    colorHighlight: '#fef08a',
  },
  TURRET_PART_HARPOON: {
    kind: 'TURRET_PART_HARPOON',
    label: '고강도 작살 노즐',
    shortLabel: '작살부품',
    colorPrimary: '#3182ce',
    colorHighlight: '#90cdf4',
  },
  TURRET_PART_MORTAR: {
    kind: 'TURRET_PART_MORTAR',
    label: '대구경 포신 모듈',
    shortLabel: '박격부품',
    colorPrimary: '#805ad5',
    colorHighlight: '#d6bcfa',
  },
  TURRET_PART_ANY: {
    kind: 'TURRET_PART_ANY',
    label: '고대 포탑 부품',
    shortLabel: '포탑부품',
    colorPrimary: '#d69e2e',
    colorHighlight: '#fef08a',
  },
  LEG_PISTON: {
    kind: 'LEG_PISTON',
    label: '유압 관절 피스톤',
    shortLabel: '다리부품',
    colorPrimary: '#38a169',
    colorHighlight: '#9ae6b4',
  },
  HYDRAULIC_BLUEPRINT: {
    kind: 'HYDRAULIC_BLUEPRINT',
    label: '유압식 다족 설계도',
    shortLabel: '유압설계도',
    colorPrimary: '#2b6cb0',
    colorHighlight: '#63b3ed',
  },
  WAGON_FRAME: {
    kind: 'WAGON_FRAME',
    label: '강화 마차 프레임',
    shortLabel: '마차자재',
    colorPrimary: '#b7791f',
    colorHighlight: '#f6e05e',
  },
  MERC_MANUAL: {
    kind: 'MERC_MANUAL',
    label: '전투 교범',
    shortLabel: '훈련서',
    colorPrimary: '#c53030',
    colorHighlight: '#feb2b2',
  },
  EXPLORER_TABLET: {
    kind: 'EXPLORER_TABLET',
    label: '태양 제국 서판',
    shortLabel: '고대서판',
    colorPrimary: '#319795',
    colorHighlight: '#81e6d9',
  },
  EQUIP_CRATE: {
    kind: 'EQUIP_CRATE',
    label: '용병 전용 장비 상자',
    shortLabel: '장비상자',
    colorPrimary: '#9f7aea',
    colorHighlight: '#e9d8fd',
  },
};

export interface AutoUpgradeMilestoneDef {
  readonly id: string;
  readonly category: AutoUpgradeCategory;
  readonly title: string;
  readonly counterLabel: string;
  readonly targetCount: number;
  readonly readProgress: (counters: ProgressionCounters) => number;
  readonly reward:
    | { type: 'TURRET_LV'; turret: TurretType | 'ACTIVE' }
    | { type: 'LEG_LV'; minTargetLevel?: number }
    | { type: 'WAGON' }
    | { type: 'MERC_LV' }
    | { type: 'PASSIVE_LV'; key: 'appraisalLv' | 'survivalLv' | 'linguisticsLv' };
}

export const AUTO_UPGRADE_MILESTONES: readonly AutoUpgradeMilestoneDef[] = [
  {
    id: 'ms_heat_kills_5',
    category: 'TURRET_LV',
    title: '열선 포탑 숙련 I',
    counterLabel: '열선 처치',
    targetCount: 5,
    readProgress: (c) => c.killsByTurret.HEAT_RAY,
    reward: { type: 'TURRET_LV', turret: 'HEAT_RAY' },
  },
  {
    id: 'ms_heat_kills_20',
    category: 'TURRET_LV',
    title: '열선 포탑 숙련 II',
    counterLabel: '열선 처치',
    targetCount: 20,
    readProgress: (c) => c.killsByTurret.HEAT_RAY,
    reward: { type: 'TURRET_LV', turret: 'HEAT_RAY' },
  },
  {
    id: 'ms_heat_kills_50',
    category: 'TURRET_LV',
    title: '열선 포탑 숙련 III',
    counterLabel: '열선 처치',
    targetCount: 50,
    readProgress: (c) => c.killsByTurret.HEAT_RAY,
    reward: { type: 'TURRET_LV', turret: 'HEAT_RAY' },
  },
  {
    id: 'ms_harpoon_kills_5',
    category: 'TURRET_LV',
    title: '작살포 숙련 I',
    counterLabel: '작살 처치',
    targetCount: 5,
    readProgress: (c) => c.killsByTurret.HARPOON,
    reward: { type: 'TURRET_LV', turret: 'HARPOON' },
  },
  {
    id: 'ms_harpoon_kills_20',
    category: 'TURRET_LV',
    title: '작살포 숙련 II',
    counterLabel: '작살 처치',
    targetCount: 20,
    readProgress: (c) => c.killsByTurret.HARPOON,
    reward: { type: 'TURRET_LV', turret: 'HARPOON' },
  },
  {
    id: 'ms_mortar_kills_5',
    category: 'TURRET_LV',
    title: '박격포 숙련 I',
    counterLabel: '박격 처치',
    targetCount: 5,
    readProgress: (c) => c.killsByTurret.MORTAR,
    reward: { type: 'TURRET_LV', turret: 'MORTAR' },
  },
  {
    id: 'ms_mortar_kills_20',
    category: 'TURRET_LV',
    title: '박격포 숙련 II',
    counterLabel: '박격 처치',
    targetCount: 20,
    readProgress: (c) => c.killsByTurret.MORTAR,
    reward: { type: 'TURRET_LV', turret: 'MORTAR' },
  },
  {
    id: 'ms_stele_1',
    category: 'PASSIVE',
    title: '고대 비석 입문',
    counterLabel: '비석 해독',
    targetCount: 1,
    readProgress: (c) => c.stelesDecoded,
    reward: { type: 'PASSIVE_LV', key: 'linguisticsLv' },
  },
  {
    id: 'ms_stele_3',
    category: 'LEG',
    title: '사막 횡단 설계 해석',
    counterLabel: '비석 해독',
    targetCount: 3,
    readProgress: (c) => c.stelesDecoded,
    reward: { type: 'LEG_LV' },
  },
  {
    id: 'ms_relic_1',
    category: 'PASSIVE',
    title: '유물 감정의 눈',
    counterLabel: '유물 감정',
    targetCount: 1,
    readProgress: (c) => c.relicsAppraised,
    reward: { type: 'PASSIVE_LV', key: 'appraisalLv' },
  },
  {
    id: 'ms_relic_3',
    category: 'TURRET_LV',
    title: '고대 코어 공명',
    counterLabel: '유물 감정',
    targetCount: 3,
    readProgress: (c) => c.relicsAppraised,
    reward: { type: 'TURRET_LV', turret: 'ACTIVE' },
  },
  {
    id: 'ms_quicksand_1',
    category: 'LEG',
    title: '유사 지대 돌파 데이터',
    counterLabel: '유사 돌파',
    targetCount: 1,
    readProgress: (c) => c.quicksandCleared,
    reward: { type: 'LEG_LV', minTargetLevel: 11 },
  },
  {
    id: 'ms_sandstorm_15',
    category: 'PASSIVE',
    title: '모래폭풍 적응',
    counterLabel: '폭풍 생존(초)',
    targetCount: 15,
    readProgress: (c) => c.sandstormSurvivedSec,
    reward: { type: 'PASSIVE_LV', key: 'survivalLv' },
  },
  {
    id: 'ms_boss_part_1',
    category: 'TURRET_LV',
    title: '약점 파쇄 노하우',
    counterLabel: '부위 파괴',
    targetCount: 1,
    readProgress: (c) => c.bossPartBreaks,
    reward: { type: 'TURRET_LV', turret: 'HARPOON' },
  },
  {
    id: 'ms_boss_defeat_1',
    category: 'MERC',
    title: '승리의 원정 기록',
    counterLabel: '보스 토벌',
    targetCount: 1,
    readProgress: (c) => c.bossDefeats,
    reward: { type: 'MERC_LV' },
  },
  {
    id: 'ms_trade_800',
    category: 'WAGON',
    title: '상단 번영 I',
    counterLabel: '누적 교역',
    targetCount: 800,
    readProgress: (c) => c.totalTradeProfit,
    reward: { type: 'WAGON' },
  },
  {
    id: 'ms_trade_3000',
    category: 'WAGON',
    title: '상단 번영 II',
    counterLabel: '누적 교역',
    targetCount: 3000,
    readProgress: (c) => c.totalTradeProfit,
    reward: { type: 'WAGON' },
  },
];

export interface NextMilestoneSummary {
  title: string;
  counterLabel: string;
  current: number;
  target: number;
  ratio: number;
}

export function getNextMilestoneSummary(
  state: GameStoreState,
  filter: 'TURRET' | 'LEG' | 'WAGON',
  activeTurret?: TurretType
): NextMilestoneSummary | null {
  const prog = state.progression;
  if (!prog) return null;

  const completed = new Set(prog.completedMilestones);
  const candidates = AUTO_UPGRADE_MILESTONES.filter((ms) => {
    if (completed.has(ms.id)) return false;
    if (filter === 'TURRET') {
      if (ms.reward.type !== 'TURRET_LV') return false;
      return ms.reward.turret === 'ACTIVE' || !activeTurret || ms.reward.turret === activeTurret;
    }
    if (filter === 'LEG') return ms.reward.type === 'LEG_LV';
    return ms.reward.type === 'WAGON';
  });

  if (candidates.length === 0) return null;

  let best: NextMilestoneSummary | null = null;
  let bestRemainingRatio = Infinity;

  for (const ms of candidates) {
    const current = Math.min(ms.targetCount, ms.readProgress(prog.counters));
    const ratio = ms.targetCount > 0 ? Math.min(1, current / ms.targetCount) : 1;
    const remainingRatio = 1 - ratio;
    if (remainingRatio < bestRemainingRatio) {
      bestRemainingRatio = remainingRatio;
      best = {
        title: ms.title,
        counterLabel: ms.counterLabel,
        current,
        target: ms.targetCount,
        ratio,
      };
    }
  }

  return best;
}
