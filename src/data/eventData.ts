import { MAX_BUBBLE_CHARS } from './masterData';

export type EventSpeakerId = 'kasim' | 'harun' | 'sera' | 'tarek' | 'zara' | 'lili' | 'jafar';

export interface EventChoiceCost {
  readonly gold?: number;
  readonly hpPercent?: number;
  readonly shieldCooldownTrigger?: boolean;
}

export interface EventChoiceReward {
  readonly gold?: number;
  readonly ancientGears?: number;
  readonly mapPieces?: number;
  readonly templeKeys?: number;
  readonly moraleBonusSec?: number;
  readonly overdriveTrigger?: boolean;
  readonly goldMultiplier?: number;
  readonly shieldFullCharge?: boolean;
}

export interface EventChoiceSpec {
  readonly id: string;
  readonly label: string;
  readonly costSummary: string;
  readonly rewardSummary: string;
  readonly isRewardedAd?: boolean;
  readonly cost: EventChoiceCost;
  readonly reward: EventChoiceReward;
  readonly resultLine: string;
}

export interface DesertEventSpec {
  readonly id: string;
  readonly minDistance: number;
  readonly speaker: EventSpeakerId;
  readonly speakerName: string;
  readonly speakerColorHex: string;
  readonly title: string;
  readonly description: string;
  readonly choices: readonly [EventChoiceSpec, EventChoiceSpec];
}

export function clampSpeechBubble(text: string): string {
  return Array.from(text).slice(0, MAX_BUBBLE_CHARS).join('');
}

export const DESERT_EVENTS: readonly DesertEventSpec[] = [
  {
    id: 'EVT_STRANDED_MERCHANT',
    minDistance: 300,
    speaker: 'harun',
    speakerName: '하룬',
    speakerColorHex: '#FB8C00',
    title: '모래폭풍 속 조난 상인',
    description: '모래 구덩이에 빠진 행상이 구원을 요청하고 있다.',
    choices: [
      {
        id: 'rescue',
        label: '보호막을 전개해 구조한다',
        costSummary: '보호막 쿨다운',
        rewardSummary: '태엽 +5 · 사기 30s',
        cost: { shieldCooldownTrigger: true },
        reward: { ancientGears: 5, moraleBonusSec: 30 },
        resultLine: '고맙소! 보답으로 고대 태엽 5개를 드리겠소!',
      },
      {
        id: 'salvage',
        label: '보급품만 수거하고 전진한다',
        costSummary: '비용 없음',
        rewardSummary: '금화 +180G',
        cost: {},
        reward: { gold: 180 },
        resultLine: '떨어진 교역 상자에서 태양의 금화를 확보했다.',
      },
    ],
  },
  {
    id: 'EVT_ANCIENT_OBELISK',
    minDistance: 600,
    speaker: 'zara',
    speakerName: '자라',
    speakerColorHex: '#8E24AA',
    title: '반쯤 묻힌 태양 제국 비석',
    description: '고대 문자가 새겨진 오벨리스크가 모래 위에 솟아 있다.',
    choices: [
      {
        id: 'decipher',
        label: '자라에게 고대 문자 해독 의뢰',
        costSummary: '선체 부하 5%',
        rewardSummary: '지도 +1 · 오버드라이브',
        cost: { hpPercent: 5 },
        reward: { mapPieces: 1, overdriveTrigger: true },
        resultLine: '북쪽 신전 좌표를 해독했어요! 출력이 상승합니다!',
      },
      {
        id: 'harvest',
        label: '비석 주변 태엽만 채집한다',
        costSummary: '비용 없음',
        rewardSummary: '태엽 +4',
        cost: {},
        reward: { ancientGears: 4 },
        resultLine: '안전하게 고대 태엽 4개를 회수했다.',
      },
    ],
  },
  {
    id: 'EVT_MIRAGE_JAFAR',
    minDistance: 900,
    speaker: 'jafar',
    speakerName: '자파르',
    speakerColorHex: '#D4AF37',
    title: '신기루 상인 자파르의 제안',
    description: '황금 망토의 대상인이 다음 오아시스 정산 2배를 제안한다.',
    choices: [
      {
        id: 'accept_jafar',
        label: '자파르의 거래 수락 (보상형 광고 / 즉시)',
        costSummary: '보상형 지원',
        rewardSummary: '다음 정산 2배 · 보호막 완충',
        isRewardedAd: true,
        cost: {},
        reward: { goldMultiplier: 2.0, shieldFullCharge: true },
        resultLine: '황금 낙타의 축복으로 수익이 두 배가 되리라!',
      },
      {
        id: 'decline_jafar',
        label: '정중히 거절하고 행군한다',
        costSummary: '비용 없음',
        rewardSummary: '금화 +120G',
        cost: {},
        reward: { gold: 120 },
        resultLine: '자파르가 작별 선물로 금화를 건네고 사라졌다.',
      },
    ],
  },
  {
    id: 'EVT_CANYON_CARAVAN',
    minDistance: 1200,
    speaker: 'kasim',
    speakerName: '카심',
    speakerColorHex: '#C27D38',
    title: '협곡의 고립된 수송대',
    description: '붉은 협곡 틈새에 갇힌 수송 마차가 호위를 청하고 있다.',
    choices: [
      {
        id: 'escort',
        label: '선두에 서서 협곡을 돌파한다',
        costSummary: '보호막 쿨다운',
        rewardSummary: '금화 +240G · 태엽 +3',
        cost: { shieldCooldownTrigger: true },
        reward: { gold: 240, ancientGears: 3 },
        resultLine: '무사히 돌파했군! 보급 금화와 태엽을 나눴다.',
      },
      {
        id: 'trade_parts',
        label: '예비 부품을 교환하고 지나간다',
        costSummary: '비용 없음',
        rewardSummary: '태엽 +5',
        cost: {},
        reward: { ancientGears: 5 },
        resultLine: '수송대와 여분 태엽 5개를 신속히 교환했다.',
      },
    ],
  },
  {
    id: 'EVT_STORM_RELAY',
    minDistance: 1500,
    speaker: 'sera',
    speakerName: '세라',
    speakerColorHex: '#43A047',
    title: '폭풍 속 태양 중계탑',
    description: '황금 폭풍 너머 고대 태양 중계탑이 잔류 에너지를 뿜고 있다.',
    choices: [
      {
        id: 'boost_relay',
        label: '중계탑 출력으로 엔진을 충전한다',
        costSummary: '비용 없음',
        rewardSummary: '오버드라이브 · 보호막 완충',
        cost: {},
        reward: { overdriveTrigger: true, shieldFullCharge: true },
        resultLine: '태양 중계탑 충전 완료! 보호막과 출력 최대!',
      },
      {
        id: 'collect_relic',
        label: '중계탑 아래 유물 상자를 연다',
        costSummary: '비용 없음',
        rewardSummary: '금화 +320G · 지도 +1',
        cost: {},
        reward: { gold: 320, mapPieces: 1 },
        resultLine: '중계탑 아래에서 금화와 지도 조각을 찾았다!',
      },
    ],
  },
  {
    id: 'EVT_SUN_ALTAR',
    minDistance: 1800,
    speaker: 'lili',
    speakerName: '릴리',
    speakerColorHex: '#FDD835',
    title: '태양 신전 외곽 제단',
    description: '신전 관문 앞 고대 제단이 공명하며 열쇠의 기운을 드러냈다.',
    choices: [
      {
        id: 'pray',
        label: '신전 열쇠 공명을 활성화한다',
        costSummary: '금화 100G',
        rewardSummary: '신전 열쇠 +1 · 사기 45s',
        cost: { gold: 100 },
        reward: { templeKeys: 1, moraleBonusSec: 45 },
        resultLine: '제단이 빛나며 고대 태양 열쇠가 깨어났다!',
      },
      {
        id: 'gather_gold',
        label: '제단 주변 공물을 수거한다',
        costSummary: '비용 없음',
        rewardSummary: '금화 +400G',
        cost: {},
        reward: { gold: 400 },
        resultLine: '제단 주변에서 고대 태양 금화를 수거했다.',
      },
    ],
  },
];

export function getEventForDistance(
  distanceMeters: number,
  seenIds: readonly string[] = []
): DesertEventSpec {
  const unseenEligible = DESERT_EVENTS.filter(
    (ev) => ev.minDistance <= distanceMeters && !seenIds.includes(ev.id)
  );
  if (unseenEligible.length > 0) {
    return unseenEligible[unseenEligible.length - 1];
  }

  const eligible = DESERT_EVENTS.filter((ev) => ev.minDistance <= distanceMeters);
  if (eligible.length > 0) {
    return eligible[eligible.length - 1];
  }

  return DESERT_EVENTS[0];
}
