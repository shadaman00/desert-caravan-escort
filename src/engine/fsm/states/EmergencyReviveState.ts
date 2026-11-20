import { GameFSM, IGameState } from '../GameFSM';
import { useGameStore } from '@/store/gameStore';

export class EmergencyReviveState implements IGameState {
  public readonly id = 'EMERGENCY_REVIVE' as const;
  public remainingSeconds = 5;
  public isAdPending = false;

  public enter(fsm: GameFSM): void {
    this.remainingSeconds = 5;
    this.isAdPending = false;

    // Start 5-second countdown timer registered under this state group
    fsm.timerService.setInterval(
      this.id,
      () => {
        if (this.isAdPending) return;
        this.remainingSeconds -= 1;
        if (this.remainingSeconds <= 0) {
          this.retreat(fsm);
        }
      },
      1000
    );
  }

  public update(_fsm: GameFSM, _dt: number): void {
    // Modal is waiting for user action
  }

  /**
   * Pauses and cancels the 5s auto-retreat timer when the user clicks Accept
   * so Tier 0/1 3s or Tier 2 1s rewarded ad modals cannot race with auto-retreat.
   */
  public pauseCountdown(fsm: GameFSM): void {
    this.isAdPending = true;
    fsm.timerService.cancelGroup(this.id);
  }

  public acceptRevive(fsm: GameFSM): void {
    this.isAdPending = false;
    const store = useGameStore.getState();
    // Restore 50% HP
    store.setHp(Math.floor(store.sandwalker.maxHp * 0.5));

    const targetStateId = fsm.resumeContext?.stateId ?? 'MARCH_NORMAL';
    fsm.transitionTo(targetStateId);
  }

  public retreat(fsm: GameFSM): void {
    this.isAdPending = false;
    const store = useGameStore.getState();
    // 50% cargo loss penalty (floored)
    store.halveCargo();
    // Restore Sandwalker HP and clear solar shield on retreat to oasis sanctuary
    store.repairHp(store.sandwalker.maxHp);
    store.setSolarShield(0);
    // Route progress reset to 0
    store.setRouteProgress(0);
    // Clear resume context
    fsm.resumeContext = null;
    // Strictly ZERO forced ads!
    fsm.transitionTo('OASIS_HUB');
  }

  public exit(_fsm: GameFSM): void {
    this.isAdPending = false;
    // TimerService will automatically cancel group timers
  }
}
