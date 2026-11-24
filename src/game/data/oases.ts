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
  readonly secondaryGoods: readonly SpecialtyGood[];
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
    secondaryGoods: [
      {
        id: 'DATE_PALM',
        name: '대추야자',
        buyPrice: 2,
        description: '장거리 사막 행군의 고열량 비상 식량.',
      },
      {
        id: 'SILK_BOLT',
        name: '사막 비단',
        buyPrice: 5,
        description: '모래바람을 막아주는 고가 직물 교역품.',
      },
    ],
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
    secondaryGoods: [
      {
        id: 'SPICE_JAR',
        name: '황금 향신료',
        buyPrice: 6,
        description: '오아시스 귀족들이 선호하는 희귀 향신료 항아리.',
      },
      {
        id: 'AMBER_RESIN',
        name: '호박 송진',
        buyPrice: 10,
        description: '고대 수목의 수액이 굳은 고가 공예 재료.',
      },
    ],
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
    secondaryGoods: [
      {
        id: 'ANCIENT_GLASS',
        name: '고대 유리 세공품',
        buyPrice: 12,
        description: '태양열에 벼려진 붉은 협곡의 장인 공예품.',
      },
      {
        id: 'STAR_SAND',
        name: '별모래 수정',
        buyPrice: 18,
        description: '밤사막에서 채집한 발광 수정 가루.',
      },
    ],
  },
];

/**
 * Returns all goods traded at the given oasis (primary specialty + 2 secondary rotation items).
 */
export function getOasisTradeGoods(oasisIndex: number): readonly SpecialtyGood[] {
  const oasis = getOasisDefinition(oasisIndex);
  return [oasis.specialty, ...oasis.secondaryGoods];
}

export function getGoodsDisplayName(goodsId: string): string {
  for (let i = 0; i < OASIS_DEFINITIONS.length; i++) {
    const def = OASIS_DEFINITIONS[i];
    if (def.specialty.id === goodsId) return def.specialty.name;
    const sec = def.secondaryGoods.find((g) => g.id === goodsId);
    if (sec) return sec.name;
  }
  return goodsId;
}

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
