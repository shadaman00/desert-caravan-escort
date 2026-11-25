import type { CurrenciesState } from '@/store/types';

export const TEMPLE_GATE_MAP_FRAGMENTS = 10;
export const TEMPLE_GATE_KEYS = 3;
export const TEMPLE_COMMEMORATIVE_RELIC_ID = 'relic_sun_heart';

export const TEMPLE_ENDING_EPILOGUE_LINES: ReadonlyArray<{
  speaker: '세라' | '하룬' | '자라';
  text: string;
}> = [
  { speaker: '세라', text: '태양 신전의 대문이 마침내 열렸어요!' },
  { speaker: '하룬', text: '황금 교역로가 전 대륙과 다시 이어졌네!' },
  { speaker: '자라', text: '이제 심층 사막의 끝없는 유적이 기다립니다.' },
];

export interface TempleGateEvaluation {
  canUnlock: boolean;
  mapFragments: number;
  requiredMapFragments: number;
  templeKeys: number;
  requiredTempleKeys: number;
  missingGuides: string[];
}

export function evaluateTempleGate(
  currencies: Pick<CurrenciesState, 'mapFragments' | 'templeKeys'>
): TempleGateEvaluation {
  const mapFragments = Math.max(0, Math.floor(currencies.mapFragments ?? 0));
  const templeKeys = Math.max(0, Math.floor(currencies.templeKeys ?? 0));
  const missingGuides: string[] = [];

  if (mapFragments < TEMPLE_GATE_MAP_FRAGMENTS) {
    missingGuides.push('고대 지도 조각 부족: 사막 발굴·챕터 보스·메인 퀘스트로 수집');
  }
  if (templeKeys < TEMPLE_GATE_KEYS) {
    missingGuides.push('신전의 열쇠 부족: Act 3~4 보스 부위 파괴 및 격파로 수집');
  }

  return {
    canUnlock: mapFragments >= TEMPLE_GATE_MAP_FRAGMENTS && templeKeys >= TEMPLE_GATE_KEYS,
    mapFragments,
    requiredMapFragments: TEMPLE_GATE_MAP_FRAGMENTS,
    templeKeys,
    requiredTempleKeys: TEMPLE_GATE_KEYS,
    missingGuides,
  };
}

export type EndlessMutationKind =
  | 'QUICKSAND_SURGE'
  | 'SOLAR_TEMPEST'
  | 'DUAL_STORM_QUICKSAND';

export interface EndlessDepthModifiers {
  depth: number;
  bossRotationAct: 1 | 2 | 3 | 4;
  hpMultiplier: number;
  damageMultiplier: number;
  goldRewardMultiplier: number;
  stormDotMultiplier: number;
  mutationKind: EndlessMutationKind;
  mutationLabel: string;
  hasQuicksand: boolean;
  hasSandstorm: boolean;
}

export function getDepthModifiers(depth: number): EndlessDepthModifiers {
  const safeDepth = Math.max(1, Math.floor(Number.isFinite(depth) ? depth : 1));
  const bossRotationAct = (((safeDepth - 1) % 4) + 1) as 1 | 2 | 3 | 4;
  const hpMultiplier = Math.round((1 + safeDepth * 0.35) * 100) / 100;
  const damageMultiplier = Math.round((1 + safeDepth * 0.18) * 100) / 100;
  const goldRewardMultiplier = Math.round((1 + safeDepth * 0.25) * 100) / 100;

  const mod = safeDepth % 3;
  const mutationKind: EndlessMutationKind =
    mod === 0 ? 'DUAL_STORM_QUICKSAND' : mod === 1 ? 'QUICKSAND_SURGE' : 'SOLAR_TEMPEST';
  const mutationLabel =
    mutationKind === 'DUAL_STORM_QUICKSAND'
      ? '이중 변이: 유사+모래폭풍'
      : mutationKind === 'QUICKSAND_SURGE'
        ? '심층 유사 지대'
        : '태양 폭풍 격화';

  return {
    depth: safeDepth,
    bossRotationAct,
    hpMultiplier,
    damageMultiplier,
    goldRewardMultiplier,
    stormDotMultiplier: mutationKind === 'SOLAR_TEMPEST' ? 1.25 : 1.0,
    mutationKind,
    mutationLabel,
    hasQuicksand: mutationKind === 'QUICKSAND_SURGE' || mutationKind === 'DUAL_STORM_QUICKSAND',
    hasSandstorm: mutationKind === 'SOLAR_TEMPEST' || mutationKind === 'DUAL_STORM_QUICKSAND',
  };
}

/**
 * Rolls Continental Golden Trade Route surge rate in [2.0, 4.0] (up to 400%).
 */
export function rollGoldenTradePriceRate(rng: () => number = Math.random): number {
  const raw = rng();
  const safeRoll = Number.isFinite(raw) ? Math.min(1, Math.max(0, raw)) : 0.5;
  return Math.round((2.0 + safeRoll * 2.0) * 100) / 100;
}

export function computeDepthClearBonusGold(depth: number): number {
  const safeDepth = Math.max(1, Math.floor(Number.isFinite(depth) ? depth : 1));
  return Math.round(350 * (1 + safeDepth * 0.35));
}

export class EndlessExpeditionSystem {
  public evaluateTempleGate(
    currencies: Pick<CurrenciesState, 'mapFragments' | 'templeKeys'>
  ): TempleGateEvaluation {
    return evaluateTempleGate(currencies);
  }

  public getDepthModifiers(depth: number): EndlessDepthModifiers {
    return getDepthModifiers(depth);
  }

  public computeDepthClearBonusGold(depth: number): number {
    return computeDepthClearBonusGold(depth);
  }
}
