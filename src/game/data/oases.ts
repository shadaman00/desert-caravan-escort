export interface SpecialtyGood {
  readonly id: string;
  readonly name: string;
  readonly buyPrice: number;
  readonly description: string;
}

export interface OasisDefinition {
  readonly index: number;
  readonly act: 1 | 2 | 3 | 4;
  readonly name: string;
  readonly specialty: SpecialtyGood;
}

export const OASIS_DEFINITIONS: readonly OasisDefinition[] = [
  {
    index: 1,
    act: 1,
    name: '여명의 샘',
    specialty: {
      id: 'WATER',
      name: '오아시스 생수',
      buyPrice: 1,
      description: '사막 횡단의 필수 식수. 어느 오아시스에서나 수요가 높습니다.',
    },
  },
  {
    index: 2,
    act: 1,
    name: '모래 바람의 쉼터',
    specialty: {
      id: 'ANTIDOTE',
      name: '전갈 해독제',
      buyPrice: 3,
      description: '유사 지대 전갈 맹독을 중화하는 고농축 혈청.',
    },
  },
  {
    index: 3,
    act: 2,
    name: '붉은 협곡 오아시스',
    specialty: {
      id: 'SUNSTONE',
      name: '태양석',
      buyPrice: 8,
      description: '고대 태양광 에너지를 머금은 희귀 결정석.',
    },
  },
];

/**
 * Resolves the oasis definition for a given 0/1-based oasisIndex.
 * Mapping guarantees:
 * - index 0 or 1 -> 여명의 샘 (생수, 1G)
 * - index 2 -> 모래 바람의 쉼터 (전갈 해독제, 3G)
 * - index 3 -> 붉은 협곡 오아시스 (태양석, 8G)
 * - index >= 4 -> cycles through 1..3 specialties consistently
 */
export function getOasisDefinition(oasisIndex: number): OasisDefinition {
  const safeIndex = Number.isFinite(oasisIndex) ? Math.max(0, Math.floor(oasisIndex)) : 0;
  if (safeIndex <= 1) {
    return OASIS_DEFINITIONS[0];
  }
  const slot = (safeIndex - 1) % OASIS_DEFINITIONS.length;
  const base = OASIS_DEFINITIONS[slot];
  const act = Math.min(4, Math.max(1, Math.floor((safeIndex - 1) / 3) + 1)) as 1 | 2 | 3 | 4;
  return {
    ...base,
    index: safeIndex,
    act,
  };
}

/**
 * Rolls the next oasis surge price multiplier in [1.5, 3.0] rounded to 2 decimal places.
 */
export function rollNextOasisPriceRate(rng: () => number = Math.random): number {
  const rawRoll = rng();
  const safeRoll = Number.isFinite(rawRoll) ? Math.min(1, Math.max(0, rawRoll)) : 0.5;
  return Math.round((1.5 + safeRoll * 1.5) * 100) / 100;
}
