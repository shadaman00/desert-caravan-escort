import { TimerService } from '../TimerService';
import type { EventBus } from '../EventBus';

export type GameStateId =
  | 'OPENING_HOOK'
  | 'OASIS_HUB'
  | 'MARCH_NORMAL'
  | 'HAZARD_ZONE'
  | 'BOSS_ENCOUNTER'
  | 'EMERGENCY_REVIVE'
  | 'OASIS_SETTLEMENT';

export interface IGameState {
  readonly id: GameStateId;
  enter(fsm: GameFSM, payload?: unknown): void;
  update(fsm: GameFSM, dt: number): void;
  exit(fsm: GameFSM): void;
}
export const IGameState = {};

export interface TransitionPayload {
  [key: string]: unknown;
}

export interface ResumeStateContext {
  stateId: GameStateId;
  bossHp?: number;
  bossPhase?: number;
  bossArmor?: number;
  bossIsGroggy?: boolean;
  bossGroggyRemainingSec?: number;
  bossPartBreakTriggered?: boolean;
  bossWavesSpawned?: number;
  routeProgress?: number;
}

export class GameFSM {
  private states: Map<GameStateId, IGameState> = new Map();
  private currentState: IGameState | null = null;
  private pendingTransition: { targetStateId: GameStateId; payload?: unknown } | null = null;
  private isProcessingTransition: boolean = false;
  public timerService: TimerService;
  public readonly eventBus?: EventBus;

  // Preserved state context for EmergencyRevive resume
  public resumeContext: ResumeStateContext | null = null;

  constructor(timerService: TimerService, eventBus?: EventBus) {
    this.timerService = timerService;
    this.eventBus = eventBus;
  }

  public registerState(state: IGameState): void {
    this.states.set(state.id, state);
  }

  public getCurrentState(): IGameState | null {
    return this.currentState;
  }

  public getState(stateId: GameStateId): IGameState | undefined {
    return this.states.get(stateId);
  }

  public getCurrentStateId(): GameStateId | null {
    return this.currentState ? this.currentState.id : null;
  }

  /**
   * Initiates a state transition.
   * Enforces single pending transition per tick (re-entrancy protection).
   */
  public transitionTo(targetStateId: GameStateId, payload?: unknown): boolean {
    if (this.pendingTransition !== null || this.isProcessingTransition) {
      // Re-entrancy guard: drop duplicate transition request within same tick
      return false;
    }

    const nextState = this.states.get(targetStateId);
    if (!nextState) {
      throw new Error(`[GameFSM] Target state '${targetStateId}' not registered`);
    }

    this.pendingTransition = { targetStateId, payload };
    this.processPendingTransition();
    return true;
  }

  private processPendingTransition(): void {
    if (!this.pendingTransition) return;

    this.isProcessingTransition = true;
    const { targetStateId, payload } = this.pendingTransition;
    const nextState = this.states.get(targetStateId)!;
    const prevStateId = this.currentState ? this.currentState.id : null;

    try {
      if (this.currentState) {
        try {
          // 1. Invoke current state exit hook
          this.currentState.exit(this);
        } finally {
          // 2. Unconditionally cancel all timers associated with the exiting state
          this.timerService.cancelGroup(this.currentState.id);
        }
      }

      // 3. Switch state
      this.currentState = nextState;

      // 4. Invoke target state enter hook
      this.currentState.enter(this, payload);

      // 5. Notify listeners of completed state switch
      this.eventBus?.emit('state:change', {
        from: prevStateId,
        to: targetStateId,
        payload,
      });
    } finally {
      this.pendingTransition = null;
      this.isProcessingTransition = false;
    }
  }

  /**
   * Ticks the current state's update loop.
   */
  public update(dt: number): void {
    if (this.currentState && !this.isProcessingTransition) {
      this.currentState.update(this, dt);
    }
  }
}
