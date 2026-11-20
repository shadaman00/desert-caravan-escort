import { GameFSM, IGameState } from '../GameFSM';
import { useGameStore } from '@/store/gameStore';
import { getRouteDefinition } from '@/game/data/routes';

export interface MarchNormalStateOptions {
  getSpeedMultiplier?: () => number;
}

export class MarchNormalState implements IGameState {
  public readonly id = 'MARCH_NORMAL' as const;
  private readonly getSpeedMultiplier: () => number;

  constructor(options: MarchNormalStateOptions = {}) {
    this.getSpeedMultiplier = options.getSpeedMultiplier ?? (() => 1);
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

    const routeDef = getRouteDefinition(
      store.meta.currentAct,
      store.meta.currentOasisIndex,
      this.id
    );
    const rawMult = this.getSpeedMultiplier();
    const speedMult = Number.isFinite(rawMult) && rawMult >= 0 ? rawMult : 1;
    const actualSpeed = routeDef.baseSpeedPxPerSec * speedMult;

    // Progress route
    const deltaProgress = ((actualSpeed * dt) / routeDef.routeLengthPx) * 100;
    const nextProgress = Math.min(100, store.meta.routeProgress + deltaProgress);
    store.setRouteProgress(nextProgress);

    // Hazard trigger between 40% and 70% if not yet consumed
    if (nextProgress >= 40 && nextProgress < 70 && !store.meta.hazardConsumed) {
      fsm.transitionTo('HAZARD_ZONE');
      return;
    }

    // Boss encounter trigger at >= 95%
    if (nextProgress >= 95) {
      fsm.transitionTo('BOSS_ENCOUNTER');
      return;
    }
  }

  public exit(_fsm: GameFSM): void {
    // Exit normal march
  }
}
