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

export const SURGE_JACKPOT_THRESHOLD = 2.6;

export function isSurgeJackpot(rate: number): boolean {
  return Number.isFinite(rate) && rate >= SURGE_JACKPOT_THRESHOLD;
}

export const OASIS_DEFINITIONS: readonly OasisDefinition[] = [
  // Act 1: 황혼의 모래언덕과 잃어버린 상단 (1~3)
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
    act: 1,
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
  // Act 2: 흐르는 모래늪과 전갈의 협곡 (4~6)
  {
    index: 4,
    act: 2,
    name: '고대 광산 야영지',
    specialty: {
      id: 'REFINED_BRASS',
      name: '고대 황동 주괴',
      buyPrice: 10,
      description: '샌드워커 관절 수리에 쓰이는 고밀도 태양 제국 합금.',
    },
    secondaryGoods: [
      {
        id: 'MINERAL_SALT',
        name: '암염 결정',
        buyPrice: 14,
        description: '유사 지대의 탈수를 막아주는 필수 미네랄.',
      },
      {
        id: 'HYDRAULIC_OIL',
        name: '정제 유압유',
        buyPrice: 20,
        description: '다족 보행기의 마찰을 줄여주는 특수 윤활유.',
      },
    ],
  },
  {
    index: 5,
    act: 2,
    name: '백사의 망루',
    specialty: {
      id: 'QUICKSAND_ANCHOR',
      name: '부력 닻',
      buyPrice: 14,
      description: '모래늪에 빠진 수송 마차를 끌어올리는 특수 견인 장치.',
    },
    secondaryGoods: [
      {
        id: 'DRIED_HERBS',
        name: '사막 약초 묶음',
        buyPrice: 18,
        description: '전염병 긴급 구호에 쓰이는 귀한 약초.',
      },
      {
        id: 'CARVED_IVORY',
        name: '세공 갑각 장식',
        buyPrice: 24,
        description: '거대 전갈 껍질로 만든 상단 길드의 공예품.',
      },
    ],
  },
  {
    index: 6,
    act: 2,
    name: '전갈 협곡 요새',
    specialty: {
      id: 'VENOM_EXTRACTS',
      name: '전갈 맹독 추출액',
      buyPrice: 18,
      description: '해독제 정제와 특수 연금술에 필수적인 고순도 독액.',
    },
    secondaryGoods: [
      {
        id: 'CHITIN_PLATE',
        name: '전갈 키틴 장갑판',
        buyPrice: 24,
        description: '산과 충격에 강한 천연 외골격 방어재.',
      },
      {
        id: 'FIRE_FLINT',
        name: '적열 화약석',
        buyPrice: 30,
        description: '열선과 박격포 탄두의 위력을 높이는 촉매 광물.',
      },
    ],
  },
  // Act 3: 환각의 모래폭풍과 신기루 유적 (7~9)
  {
    index: 7,
    act: 3,
    name: '신기루 관문',
    specialty: {
      id: 'MIRAGE_PRISM',
      name: '신기루 프리즘',
      buyPrice: 24,
      description: '모래폭풍 속에서 빛을 굴절시켜 항로를 비추는 결정 렌즈.',
    },
    secondaryGoods: [
      {
        id: 'SILENT_INCENSE',
        name: '진정 향료',
        buyPrice: 28,
        description: '정령의 환각 현혹을 막아주는 사제들의 향료.',
      },
      {
        id: 'GOLD_THREAD',
        name: '태양 금사',
        buyPrice: 36,
        description: '폭풍 결계의 모래를 튕겨내는 황금 실타래.',
      },
    ],
  },
  {
    index: 8,
    act: 3,
    name: '침묵의 태양광 탑',
    specialty: {
      id: 'SOLAR_CAPACITOR',
      name: '태양광 축전기',
      buyPrice: 30,
      description: '고대 중계탑의 잔류 광자 에너지를 저장한 배터리 셀.',
    },
    secondaryGoods: [
      {
        id: 'STORM_COMPASS',
        name: '폭풍 자기 나침반',
        buyPrice: 35,
        description: '모래바람 속에서도 북쪽 신전을 가리키는 항해 기기.',
      },
      {
        id: 'SAPPHIRE_LENS',
        name: '청옥 관측 렌즈',
        buyPrice: 44,
        description: '천문대와 포탑 조준경에 쓰이는 초정밀 렌즈.',
      },
    ],
  },
  {
    index: 9,
    act: 3,
    name: '별빛 폐허 정착지',
    specialty: {
      id: 'ASTRAL_PARCHMENT',
      name: '성좌 해독 두루마리',
      buyPrice: 36,
      description: '태양 신전 결계 해제 주문이 적힌 천년 전 양피지.',
    },
    secondaryGoods: [
      {
        id: 'MOON_SILK',
        name: '월광 비단옷',
        buyPrice: 42,
        description: '심야 유적에서만 직조되는 냉감 고급 직물.',
      },
      {
        id: 'RELIC_SHARD',
        name: '빛나는 유물 파편',
        buyPrice: 52,
        description: '고대 비석과 공명하는 미확인 유적의 조각.',
      },
    ],
  },
  // Act 4: 거대 괴충의 둥지와 태양 신전 (10~12)
  {
    index: 10,
    act: 4,
    name: '황금 피라미드 전초기지',
    specialty: {
      id: 'PHARAOH_SPICE',
      name: '황실 금박 향료',
      buyPrice: 45,
      description: '태양 제국 황실 의례에만 바쳐지던 최고급 향신료.',
    },
    secondaryGoods: [
      {
        id: 'OBSIDIAN_CORE',
        name: '흑요석 열핵',
        buyPrice: 52,
        description: '싱크홀 심층에서 캔 고에너지 열원 광석.',
      },
      {
        id: 'EMPIRE_SEAL',
        name: '제국 교역 인장',
        buyPrice: 60,
        description: '전 사막 오아시스 연합 상단에서 통용되는 황금 어음.',
      },
    ],
  },
  {
    index: 11,
    act: 4,
    name: '싱크홀 감시초소',
    specialty: {
      id: 'WORM_CHITIN_OIL',
      name: '심연 괴충 정수',
      buyPrice: 55,
      description: '샌드웜이 지난 모래층에서 정제된 희귀 고열 연료.',
    },
    secondaryGoods: [
      {
        id: 'SUN_AMULET',
        name: '태양 수호 부적',
        buyPrice: 62,
        description: '상단원들의 사기를 높여주는 순금 성물.',
      },
      {
        id: 'PLATINUM_COG',
        name: '백금 태엽 모듈',
        buyPrice: 72,
        description: '황실 무기고에서 발굴된 초정밀 시계태엽.',
      },
    ],
  },
  {
    index: 12,
    act: 4,
    name: '태양 신전 입구',
    specialty: {
      id: 'SOLAR_CROWN_ELIXIR',
      name: '태양 신전 영약',
      buyPrice: 65,
      description: '영원한 오아시스의 생명수가 담긴 전설의 교역 비보.',
    },
    secondaryGoods: [
      {
        id: 'ROYAL_TAPESTRY',
        name: '태양 제국 태피스트리',
        buyPrice: 75,
        description: '천년 전 태양 도시의 번영이 수놓아진 보물.',
      },
      {
        id: 'ETERNAL_GOLD_BAR',
        name: '신전 순금 괴',
        buyPrice: 90,
        description: '대륙 횡단 황금 교역 루트 최고가 교역품.',
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
 * Resolves the oasis definition for a given 0/1-based oasisIndex across all 12 canonical hubs.
 * Preserves 1..3 backward compatibility:
 * - index 0 or 1 -> 여명의 샘 (생수, 1G)
 * - index 2 -> 모래 바람의 쉼터 (전갈 해독제, 3G)
 * - index 3 -> 붉은 협곡 오아시스 (태양석, 8G)
 * - index 4..12 -> unique Act 2..4 hubs
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
