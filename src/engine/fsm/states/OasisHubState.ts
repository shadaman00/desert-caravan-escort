import { GameFSM, IGameState } from '../GameFSM';
import { useGameStore } from '@/store/gameStore';

export class OasisHubState implements IGameState {
  public readonly id = 'OASIS_HUB' as const;

  public enter(_fsm: GameFSM): void {
    const store = useGameStore.getState();
    // Reset route progress when back in Hub
    store.setRouteProgress(0);
    store.setHazardConsumed(false);
    // Oasis sanctuary restores Sandwalker to full HP
    if (store.sandwalker.currentHp < store.sandwalker.maxHp) {
      store.repairHp(store.sandwalker.maxHp);
    }
    store.setSolarShield(0);
  }

  public update(_fsm: GameFSM, _dt: number): void {
    // Idle hub awaiting player sortie action
  }

  public exit(_fsm: GameFSM): void {
    // Preparing for march
  }

  public sortie(fsm: GameFSM): void {
    fsm.transitionTo('MARCH_NORMAL');
  }
}
