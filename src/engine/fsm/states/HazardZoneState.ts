import { GameFSM, IGameState } from '../GameFSM';
import { useGameStore } from '@/store/gameStore';
import { quicksandSpeed, stormDps } from '@/game/formulas';
import { getRouteDefinition, resolveActHazardKind } from '@/game/data/routes';
import type { HazardSystem } from '@/engine/systems/HazardSystem';

export interface HazardZoneStateOptions {
  getSpeedMultiplier?: () => number;
  hazardSystem?: HazardSystem;
}

export class HazardZoneState implements IGameState {
  public readonly id = 'HAZARD_ZONE' as const;
  private readonly getSpeedMultiplier: () => number;
  private readonly hazardSystem?: HazardSystem;

  constructor(options: HazardZoneStateOptions = {}) {
    this.getSpeedMultiplier = options.getSpeedMultiplier ?? (() => 1);
    this.hazardSystem = options.hazardSystem;
  }

  public enter(fsm: GameFSM): void {
    if (fsm.resumeContext?.stateId === this.id) {
      fsm.resumeContext = null;
    }
  }

  public update(fsm: GameFSM, dt: number): void {
    const store = useGameStore.getState();

    // Check defeat
    if (store.sandwalker.currentHp <= 0) {
      fsm.resumeContext = {
        stateId: this.id,
        routeProgress: store.meta.routeProgress,
      };
      fsm.transitionTo('EMERGENCY_REVIVE');
      return;
    }

    const act = store.meta.currentAct;
    const oasisIndex = store.meta.currentOasisIndex;
    const hazardKind = resolveActHazardKind(act, oasisIndex, this.id);
    const isSandstorm = hazardKind === 'SANDSTORM';

    // Apply Sandstorm DoT if in sandstorm, then immediately check for defeat
    if (isSandstorm) {
      const dmg = this.hazardSystem
        ? this.hazardSystem.computeSandstormDamage(store.sandwalker.maxHp, dt)
        : stormDps(store.sandwalker.maxHp) * dt;
      const dmgResult = store.applyDamage(dmg);
      if (dmgResult.isDestroyed || useGameStore.getState().sandwalker.currentHp <= 0) {
        fsm.resumeContext = {
          stateId: this.id,
          routeProgress: useGameStore.getState().meta.routeProgress,
        };
        fsm.transitionTo('EMERGENCY_REVIVE');
        return;
      }
    }

    const latestStore = useGameStore.getState();
    const routeDef = getRouteDefinition(act, oasisIndex, this.id);
    const rawMult = this.getSpeedMultiplier();
    const speedMult = Number.isFinite(rawMult) && rawMult >= 0 ? rawMult : 1;

    // Determine march speed based on quicksand if not sandstorm
    const actualSpeed = this.hazardSystem
      ? this.hazardSystem.computeActualSpeed(this.id, latestStore, speedMult)
      : (isSandstorm
          ? routeDef.baseSpeedPxPerSec
          : quicksandSpeed(routeDef.baseSpeedPxPerSec, latestStore.sandwalker.legPartLevel, act)) *
        speedMult;

    // Progress route
    const deltaProgress = ((actualSpeed * dt) / routeDef.routeLengthPx) * 100;
    const nextProgress = Math.min(100, latestStore.meta.routeProgress + deltaProgress);
    latestStore.setRouteProgress(nextProgress);

    // Escape hazard zone at >= 70%
    if (nextProgress >= 70) {
      latestStore.setHazardConsumed(true);
      fsm.transitionTo('MARCH_NORMAL');
      return;
    }
  }

  public exit(_fsm: GameFSM): void {
    // Exited hazard zone
  }
}
