export interface RelicDefinition {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly gearReward: number;
  readonly appraiseDurationMs: number;
}

export interface SteleDefinition {
  readonly id: number;
  readonly title: string;
  readonly inscription: string;
  readonly gearReward: number;
}

export const DEFAULT_RELIC_APPRAISE_MS = 60_000;
export const DEFAULT_RELIC_GEAR_REWARD = 5;
export const DEFAULT_STELE_GEAR_REWARD = 5;

export const RELIC_DEFINITIONS: readonly RelicDefinition[] = [
  {
    id: 'relic_solar_disc',
    name: '태양의 황금 원반',
    description: '고대 태양 사제가 제의에 사용하던 순금 원반.',
    gearReward: DEFAULT_RELIC_GEAR_REWARD,
    appraiseDurationMs: DEFAULT_RELIC_APPRAISE_MS,
  },
  {
    id: 'relic_ankh',
    name: '생명의 앙크',
    description: '모래폭풍 속에서도 꺼지지 않는 고대 왕조의 부적.',
    gearReward: DEFAULT_RELIC_GEAR_REWARD,
    appraiseDurationMs: DEFAULT_RELIC_APPRAISE_MS,
  },
  {
    id: 'relic_scarab',
    name: '황금 스카라베',
    description: '샌드워커의 동력로와 공명하는 기계 갑충석.',
    gearReward: DEFAULT_RELIC_GEAR_REWARD,
    appraiseDurationMs: DEFAULT_RELIC_APPRAISE_MS,
  },
  {
    id: 'relic_crown',
    name: '파라오의 보관',
    description: '잃어버린 황금 신전의 통치자가 썼던 왕관의 파편.',
    gearReward: DEFAULT_RELIC_GEAR_REWARD,
    appraiseDurationMs: DEFAULT_RELIC_APPRAISE_MS,
  },
  {
    id: 'relic_sun_compass',
    name: '태양의 나침반',
    description: '신기루를 꿰뚫고 오아시스의 방위를 가리키는 의기.',
    gearReward: DEFAULT_RELIC_GEAR_REWARD,
    appraiseDurationMs: DEFAULT_RELIC_APPRAISE_MS,
  },
  {
    id: 'relic_astral_astrolabe',
    name: '성좌의 아스트롤라베',
    description: '밤사막의 별자리를 기록한 황동 천문 관측기.',
    gearReward: DEFAULT_RELIC_GEAR_REWARD,
    appraiseDurationMs: DEFAULT_RELIC_APPRAISE_MS,
  },
];

export function getRelicDefinition(id: string): RelicDefinition {
  const found = RELIC_DEFINITIONS.find((r) => r.id === id);
  if (found) return found;
  return {
    id,
    name: `고대 유물 (${id})`,
    description: '사막 모래 아래에서 발굴된 미지의 유물.',
    gearReward: DEFAULT_RELIC_GEAR_REWARD,
    appraiseDurationMs: DEFAULT_RELIC_APPRAISE_MS,
  };
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
