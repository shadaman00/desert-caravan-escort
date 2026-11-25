import type { GameFSM, GameStateId } from '@/engine/fsm/GameFSM';
import type { GameStoreActions, GameStoreState } from '@/store/types';
import {
  BASE_ROUTE_SPEED_PX,
  resolveActHazardKind,
  type RouteHazardKind,
} from '@/game/data/routes';
import { quicksandIgnore, quicksandSpeed, relayShield, stormDps } from '@/game/formulas';
import { getDepthModifiers } from './EndlessExpeditionSystem';

export interface SolarRelayActivationResult {
  shieldGranted: number;
  totalShieldHp: number;
  nextProgress: number;
  exitedHazardZone: boolean;
}

export type HazardRelayStore = Pick<
  GameStoreState,
  'meta' | 'sandwalker'
> &
  Pick<GameStoreActions, 'setSolarShield' | 'setRouteProgress' | 'setHazardConsumed'>;

export class HazardSystem {
  private relayActivated = false;

  public isRelayActivated(): boolean {
    return this.relayActivated;
  }

  public resetForNewRoute(): void {
    this.relayActivated = false;
  }

  public resolveHazardKind(
    fsmStateId: GameStateId | null,
    act: number,
    oasisIndex: number
  ): RouteHazardKind {
    if (fsmStateId !== 'HAZARD_ZONE') {
      return 'NONE';
    }
    return resolveActHazardKind(act, oasisIndex, fsmStateId);
  }

  public isRelayTowerAvailable(
    fsmStateId: GameStateId | null,
    act: number,
    oasisIndex: number,
    endlessActive = false,
    currentDepth = 1
  ): boolean {
    if (fsmStateId !== 'HAZARD_ZONE' || this.relayActivated) {
      return false;
    }
    if (endlessActive) {
      return getDepthModifiers(currentDepth).hasSandstorm;
    }
    return resolveActHazardKind(act, oasisIndex, fsmStateId) === 'SANDSTORM';
  }

  public computeActualSpeed(
    fsmStateId: GameStateId | null,
    storeState: Pick<GameStoreState, 'meta' | 'sandwalker' | 'endgame'>,
    boostMultiplier = 1,
    openingElapsedSeconds = 0
  ): number {
    const boost =
      Number.isFinite(boostMultiplier) && boostMultiplier >= 0 ? boostMultiplier : 1;
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
        return BASE_ROUTE_SPEED_PX * boost;

      case 'HAZARD_ZONE': {
        if (storeState.endgame?.endlessActive) {
          const mods = getDepthModifiers(storeState.endgame.currentDepth);
          if (mods.hasQuicksand) {
            return quicksandSpeed(BASE_ROUTE_SPEED_PX, safeLegLevel, 4) * boost;
          }
          return BASE_ROUTE_SPEED_PX * boost;
        }
        const hazard = resolveActHazardKind(safeAct, safeOasisIndex, fsmStateId);
        if (hazard === 'QUICKSAND') {
          return quicksandSpeed(BASE_ROUTE_SPEED_PX, safeLegLevel, safeAct) * boost;
        }
        return BASE_ROUTE_SPEED_PX * boost;
      }

      case 'OPENING_HOOK': {
        const t = Number.isFinite(openingElapsedSeconds) ? openingElapsedSeconds : 0;
        const previewMoving = t < 30 || (t >= 75 && t < 135);
        return previewMoving ? BASE_ROUTE_SPEED_PX * boost : 0;
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

  public computeSandstormDamage(maxHp: number, dt: number): number {
    if (!Number.isFinite(maxHp) || maxHp <= 0 || !Number.isFinite(dt) || dt <= 0) {
      return 0;
    }
    return stormDps(maxHp) * dt;
  }

  public isSandstormVisionMasked(
    fsmStateId: GameStateId | null,
    storeState: Pick<GameStoreState, 'meta' | 'sandwalker' | 'endgame'>
  ): boolean {
    if (fsmStateId !== 'HAZARD_ZONE') {
      return false;
    }
    const shield = Number.isFinite(storeState.sandwalker.solarShieldHp)
      ? storeState.sandwalker.solarShieldHp
      : 0;
    if (storeState.endgame?.endlessActive) {
      return getDepthModifiers(storeState.endgame.currentDepth).hasSandstorm && shield <= 0;
    }
    const kind = resolveActHazardKind(
      storeState.meta.currentAct,
      storeState.meta.currentOasisIndex,
      fsmStateId
    );
    return kind === 'SANDSTORM' && shield <= 0;
  }

  public getQuicksandIgnoreRate(legLevel: number): number {
    return quicksandIgnore(legLevel);
  }

  /**
   * Activates the Ancient Solar Relay Tower (Decision D4):
   * - Grants +50% maxHp Solar Shield (clamped to maxHp)
   * - Advances routeProgress by +30% (clamped to 100)
   * - If resulting routeProgress >= 70%, sets hazardConsumed = true and exits HAZARD_ZONE -> MARCH_NORMAL
   */
  public activateSolarRelay(
    store: HazardRelayStore,
    fsm?: GameFSM | null
  ): SolarRelayActivationResult {
    const currentShield = Number.isFinite(store.sandwalker.solarShieldHp)
      ? Math.max(0, store.sandwalker.solarShieldHp)
      : 0;
    const currentProgress = Number.isFinite(store.meta.routeProgress)
      ? Math.max(0, store.meta.routeProgress)
      : 0;

    if (this.relayActivated || (fsm && fsm.getCurrentStateId() !== 'HAZARD_ZONE')) {
      return {
        shieldGranted: 0,
        totalShieldHp: currentShield,
        nextProgress: currentProgress,
        exitedHazardZone: false,
      };
    }

    const maxHp = Math.max(0, store.sandwalker.maxHp);
    const shieldGranted = Math.round(relayShield(maxHp));
    const totalShieldHp = Math.min(maxHp, currentShield + shieldGranted);
    store.setSolarShield(totalShieldHp);

    const nextProgress = Math.min(100, currentProgress + 30);
    store.setRouteProgress(nextProgress);

    this.relayActivated = true;

    const exitedHazardZone = nextProgress >= 70;
    if (exitedHazardZone) {
      store.setHazardConsumed(true);
      if (fsm && fsm.getCurrentStateId() === 'HAZARD_ZONE') {
        fsm.transitionTo('MARCH_NORMAL');
      }
    }

    return {
      shieldGranted,
      totalShieldHp,
      nextProgress,
      exitedHazardZone,
    };
  }
}
