import type { DailyMissionId, DailyMissionProgress, DailyMissionsState } from '@/store/types';

export interface DailyMissionReward {
  readonly skipTickets: number;
  readonly ancientGear: number;
  readonly sunGold: number;
}

export interface DailyMissionDefinition {
  readonly id: DailyMissionId;
  readonly title: string;
  readonly description: string;
  readonly target: number;
  readonly reward: DailyMissionReward;
}

export const DAILY_MISSION_DEFINITIONS: readonly DailyMissionDefinition[] = [
  {
    id: 'BUY_CARGO',
    title: '교역 화물 매입',
    description: '교역 화물 10개 이상 매입',
    target: 10,
    reward: { skipTickets: 1, ancientGear: 2, sunGold: 50 },
  },
  {
    id: 'UPGRADE_UNIT',
    title: '상단 전력 강화',
    description: '포탑·다리·용병 3회 이상 강화',
    target: 3,
    reward: { skipTickets: 1, ancientGear: 3, sunGold: 100 },
  },
  {
    id: 'CLEAR_ROUTE',
    title: '오아시스 교역 정산',
    description: '오아시스 도착 정산 1회 완료',
    target: 1,
    reward: { skipTickets: 2, ancientGear: 5, sunGold: 200 },
  },
];

export function getDailyMissionDefinition(id: DailyMissionId): DailyMissionDefinition {
  const found = DAILY_MISSION_DEFINITIONS.find((m) => m.id === id);
  return found ?? DAILY_MISSION_DEFINITIONS[0];
}

export function createInitialDailyMissions(todayStr: string): DailyMissionsState {
  const items: DailyMissionProgress[] = DAILY_MISSION_DEFINITIONS.map((def) => ({
    id: def.id,
    progress: 0,
    claimed: false,
  }));
  return {
    resetDate: todayStr,
    items,
  };
}
