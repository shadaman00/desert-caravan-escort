import type { GameStateId } from '@/engine/fsm/GameFSM';

export const OPENING_ROUTE_LENGTH_PX = 7200;
export const NORMAL_ROUTE_LENGTH_PX = 10800;
export const BASE_ROUTE_SPEED_PX = 120;

export type RouteHazardKind = 'NONE' | 'QUICKSAND' | 'SANDSTORM';

export const OASIS_NAMES: readonly string[] = [
  '여명의 샘',
  '모래 바람의 쉼터',
  '붉은 협곡 오아시스',
  '신기루 관문',
  '전갈 협곡 요새',
  '태양 신전 입구',
];

export interface RouteDefinition {
  act: number;
  oasisIndex: number;
  fromOasisName: string;
  toOasisName: string;
  routeLengthPx: number;
  baseSpeedPxPerSec: number;
  hazardKind: RouteHazardKind;
  quicksandPenaltyCoeff: number;
  scorpionSpawnMultiplier: number;
}

/**
 * Opening route is 7,200px (60s at 120px/s) for OPENING_HOOK and Act 1 initial oasis (act <= 1 && oasisIndex === 0).
 * Normal routes (act >= 2 || oasisIndex >= 1) are 10,800px (90s at 120px/s).
 */
export function isOpeningRoute(
  act: number,
  oasisIndex: number,
  fsmStateId?: GameStateId | null
): boolean {
  if (fsmStateId === 'OPENING_HOOK') {
    return true;
  }
  const safeAct = Number.isFinite(act) ? Math.max(1, Math.floor(act)) : 1;
  const safeIndex = Number.isFinite(oasisIndex) ? Math.max(0, Math.floor(oasisIndex)) : 0;
  return safeAct <= 1 && safeIndex === 0;
}

/**
 * Resolves the Act-based environmental hazard for a route.
 *
 * Parity convention (0-based `oasisIndex` vs 1-based route ordinal in Plan §6.6):
 * - Opening (`OPENING_HOOK`): `'NONE'`
 * - Act 1: Weakened Quicksand (`c = 0.2`, `1.5x` scorpions)
 * - Act 2: Standard Quicksand (`c = 0.4`, `2.0x` scorpions)
 * - Act 3: Sandstorm (`1.5%/s` DoT, 50% dark vision mask, Solar Relay Tower)
 * - Act 4: Alternates per route matching `RouteSystem.ts` & `HazardZoneState.ts` 0-based parity:
 *   - 1st/3rd odd-ordinal routes (`oasisIndex` 0, 2, 4 -> `oasisIndex % 2 === 0`): `'QUICKSAND'`
 *   - 2nd/4th even-ordinal routes (`oasisIndex` 1, 3, 5 -> `oasisIndex % 2 === 1`): `'SANDSTORM'`
 */
export function resolveActHazardKind(
  act: number,
  oasisIndex: number,
  fsmStateId?: GameStateId | null
): RouteHazardKind {
  if (fsmStateId === 'OPENING_HOOK') {
    return 'NONE';
  }
  const safeAct = Number.isFinite(act) ? Math.max(1, Math.floor(act)) : 1;
  const safeIndex = Number.isFinite(oasisIndex) ? Math.max(0, Math.floor(oasisIndex)) : 0;

  if (safeAct <= 2) {
    return 'QUICKSAND';
  }
  if (safeAct === 3) {
    return 'SANDSTORM';
  }
  return safeIndex % 2 === 1 ? 'SANDSTORM' : 'QUICKSAND';
}

export function getRouteDefinition(
  act: number,
  oasisIndex: number,
  fsmStateId?: GameStateId | null
): RouteDefinition {
  const safeAct = Number.isFinite(act) ? Math.max(1, Math.floor(act)) : 1;
  const safeIndex = Number.isFinite(oasisIndex) ? Math.max(0, Math.floor(oasisIndex)) : 0;
  const fromIdx = safeIndex % OASIS_NAMES.length;
  const toIdx = (safeIndex + 1) % OASIS_NAMES.length;

  const opening = isOpeningRoute(safeAct, safeIndex, fsmStateId);
  const hazardKind = resolveActHazardKind(safeAct, safeIndex, fsmStateId);
  const quicksandPenaltyCoeff =
    hazardKind === 'QUICKSAND' ? (safeAct === 1 ? 0.2 : 0.4) : 0;
  const scorpionSpawnMultiplier =
    hazardKind === 'QUICKSAND' ? (safeAct === 1 ? 1.5 : 2.0) : 1.0;

  return {
    act: safeAct,
    oasisIndex: safeIndex,
    fromOasisName: OASIS_NAMES[fromIdx],
    toOasisName: OASIS_NAMES[toIdx],
    routeLengthPx: opening ? OPENING_ROUTE_LENGTH_PX : NORMAL_ROUTE_LENGTH_PX,
    baseSpeedPxPerSec: BASE_ROUTE_SPEED_PX,
    hazardKind,
    quicksandPenaltyCoeff,
    scorpionSpawnMultiplier,
  };
}
