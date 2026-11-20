import type { GameStateId } from '@/engine/fsm/GameFSM';
import type { GameStoreState, TimeOfDay } from '@/store/types';
import { quicksandSpeed } from '@/game/formulas';
import { resolveTargetPalette } from '@/engine/render/palette';
import {
  BASE_ROUTE_SPEED_PX,
  OASIS_NAMES,
  OPENING_ROUTE_LENGTH_PX,
  getRouteDefinition as getRouteDefinitionFromData,
  resolveActHazardKind,
  type RouteDefinition,
  type RouteHazardKind,
} from '@/game/data/routes';

export type HazardKind = RouteHazardKind;
export type { RouteDefinition };
export { OASIS_NAMES };

export const DEFAULT_BASE_SPEED = BASE_ROUTE_SPEED_PX;
export const DEFAULT_ROUTE_LENGTH_PX = OPENING_ROUTE_LENGTH_PX;

export interface RouteUpdateOptions {
  openingElapsedSeconds?: number;
  boostMultiplier?: number;
  overrideTimeOfDay?: TimeOfDay | null;
}

export interface RouteSnapshot {
  fsmStateId: GameStateId | null;
  isMoving: boolean;
  baseSpeed: number;
  actualSpeed: number;
  deltaX: number;
  routeLengthPx: number;
  distanceTraveledPx: number;
  remainingMeters: number;
  hazardKind: HazardKind;
  isQuicksandSlowed: boolean;
  isQuicksandBypassed: boolean;
  isSandstorm: boolean;
  isSandstormVisionMasked: boolean;
  targetTimeOfDay: TimeOfDay;
  routeDef: RouteDefinition;
}

export function resolveHazardKind(
  fsmStateId: GameStateId | null,
  act: number,
  oasisIndex: number
): HazardKind {
  if (fsmStateId !== 'HAZARD_ZONE') {
    return 'NONE';
  }
  return resolveActHazardKind(act, oasisIndex, fsmStateId);
}

export function getDefaultRouteDefinition(
  act: number,
  oasisIndex: number,
  fsmStateId?: GameStateId | null
): RouteDefinition {
  return getRouteDefinitionFromData(act, oasisIndex, fsmStateId);
}

export function computeActualSpeed(
  fsmStateId: GameStateId | null,
  storeState: GameStoreState,
  options: RouteUpdateOptions = {}
): number {
  const baseSpeed = DEFAULT_BASE_SPEED;
  const boost =
    options.boostMultiplier !== undefined &&
    Number.isFinite(options.boostMultiplier) &&
    options.boostMultiplier >= 0
      ? options.boostMultiplier
      : 1;
  const safeAct = Number.isFinite(storeState.meta.currentAct)
    ? Math.max(1, Math.floor(storeState.meta.currentAct))
    : 1;
  const safeOasisIndex = Number.isFinite(storeState.meta.currentOasisIndex)
    ? Math.max(0, Math.floor(storeState.meta.currentOasisIndex))
    : 0;
  const safeLegLevel = Number.isFinite(storeState.sandwalker.legPartLevel)
    ? Math.max(1, storeState.sandwalker.legPartLevel)
    : 1;

  switch (fsmStateId) {
    case 'MARCH_NORMAL':
      return baseSpeed * boost;

    case 'HAZARD_ZONE': {
      const hazard = resolveHazardKind(fsmStateId, safeAct, safeOasisIndex);
      if (hazard === 'QUICKSAND') {
        return quicksandSpeed(baseSpeed, safeLegLevel, safeAct) * boost;
      }
      return baseSpeed * boost;
    }

    case 'OPENING_HOOK': {
      const t = Number.isFinite(options.openingElapsedSeconds)
        ? options.openingElapsedSeconds!
        : 0;
      const previewMoving = t < 30 || (t >= 75 && t < 135);
      return previewMoving ? baseSpeed * boost : 0;
    }

    case 'OASIS_HUB':
    case 'BOSS_ENCOUNTER':
    case 'EMERGENCY_REVIVE':
    case 'OASIS_SETTLEMENT':
    case null:
    default:
      return 0;
  }
}

export class RouteSystem {
  private lastSnapshot: RouteSnapshot | null = null;

  public getRouteDefinition(
    act: number,
    oasisIndex: number,
    fsmStateId?: GameStateId | null
  ): RouteDefinition {
    return getDefaultRouteDefinition(act, oasisIndex, fsmStateId);
  }

  public update(
    dt: number,
    fsmStateId: GameStateId | null,
    storeState: GameStoreState,
    options: RouteUpdateOptions = {}
  ): RouteSnapshot {
    const safeDt = Number.isFinite(dt) && dt > 0 ? dt : 0;
    const rawAct = storeState.meta.currentAct;
    const rawOasisIndex = storeState.meta.currentOasisIndex;
    const rawProgress = storeState.meta.routeProgress;
    const rawLegLevel = storeState.sandwalker.legPartLevel;
    const rawShieldHp = storeState.sandwalker.solarShieldHp;

    const currentAct = Number.isFinite(rawAct) ? Math.max(1, Math.floor(rawAct)) : 1;
    const currentOasisIndex = Number.isFinite(rawOasisIndex)
      ? Math.max(0, Math.floor(rawOasisIndex))
      : 0;
    const legLevel = Number.isFinite(rawLegLevel) ? Math.max(1, rawLegLevel) : 1;
    const clampedProgress = Number.isFinite(rawProgress)
      ? Math.min(100, Math.max(0, rawProgress))
      : 0;
    const solarShieldHp = Number.isFinite(rawShieldHp) ? rawShieldHp : 0;

    const routeDef = this.getRouteDefinition(currentAct, currentOasisIndex, fsmStateId);
    const hazardKind = resolveHazardKind(fsmStateId, currentAct, currentOasisIndex);
    const actualSpeed = computeActualSpeed(fsmStateId, storeState, options);
    const isMoving = actualSpeed > 0.5;

    const isQuicksand = hazardKind === 'QUICKSAND';
    const isQuicksandBypassed = isQuicksand && legLevel >= 11;
    const isQuicksandSlowed = isQuicksand && legLevel < 11;
    const isSandstorm = hazardKind === 'SANDSTORM';
    const isSandstormVisionMasked = isSandstorm && solarShieldHp <= 0;

    const distanceTraveledPx = (clampedProgress / 100) * routeDef.routeLengthPx;
    const remainingMeters = Math.max(
      0,
      Math.round(routeDef.routeLengthPx - distanceTraveledPx)
    );

    const targetTimeOfDay = resolveTargetPalette({
      fsmStateId,
      currentAct,
      currentOasisIndex,
      routeProgress: clampedProgress,
      isSandstormActive: isSandstorm,
      openingElapsedSeconds: options.openingElapsedSeconds,
      overrideTimeOfDay: options.overrideTimeOfDay,
    });

    const snapshot: RouteSnapshot = {
      fsmStateId,
      isMoving,
      baseSpeed: routeDef.baseSpeedPxPerSec,
      actualSpeed,
      deltaX: actualSpeed * safeDt,
      routeLengthPx: routeDef.routeLengthPx,
      distanceTraveledPx,
      remainingMeters,
      hazardKind,
      isQuicksandSlowed,
      isQuicksandBypassed,
      isSandstorm,
      isSandstormVisionMasked,
      targetTimeOfDay,
      routeDef,
    };

    this.lastSnapshot = snapshot;
    return snapshot;
  }

  public getSnapshot(): RouteSnapshot | null {
    return this.lastSnapshot;
  }
}
