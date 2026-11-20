import type { GameStateId } from './fsm/GameFSM';
import type { EnemyArchetypeTag, MercenaryRole, TurretType } from '@/store/types';

export interface EngineEventMap {
  'state:change': {
    from: GameStateId | null;
    to: GameStateId;
    payload?: unknown;
  };
  'turret:switch': {
    from: TurretType;
    to: TurretType;
  };
  'turret:fire': {
    turret: TurretType;
    targetId: string | null;
    angle: number;
  };
  'damage:dealt': {
    targetId: string;
    amount: number;
    affinityMultiplier: number;
    isCrit: boolean;
    isWeakPoint: boolean;
    x: number;
    y: number;
    source?: string;
    turret?: TurretType;
    tags?: EnemyArchetypeTag[];
  };
  'aim:lock': {
    targetId: string;
    x: number;
    y: number;
  };
  'aim:unlock': {
    previousTargetId: string | null;
  };
  'combat:enemyKilled': {
    enemyId: string;
    archetypeId: string;
    rewardGold: number;
    x: number;
    y: number;
  };
  'combat:walkerHit': {
    damage: number;
    shieldAbsorbed: number;
    hpDamage: number;
  };
  'combat:mercenarySkill': {
    mercId: string;
    role: MercenaryRole;
  };
  'walker:footfall': {
    legIndex: number;
    x: number;
    y: number;
    isQuicksand: boolean;
    isQuicksandBypassed: boolean;
  };
  'camera:shake': {
    intensity: number;
    duration: number;
  };
}

export type EventListener<T = unknown> = (payload: T) => void;

export class EventBus<TEvents extends Record<string, any> = EngineEventMap> {
  private listeners: Map<keyof TEvents, Set<EventListener<any>>> = new Map();

  public on<K extends keyof TEvents>(
    event: K,
    listener: EventListener<TEvents[K]>
  ): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(listener);
    return () => {
      this.off(event, listener);
    };
  }

  public once<K extends keyof TEvents>(
    event: K,
    listener: EventListener<TEvents[K]>
  ): () => void {
    const wrapper: EventListener<TEvents[K]> = (payload) => {
      this.off(event, wrapper);
      listener(payload);
    };
    return this.on(event, wrapper);
  }

  public off<K extends keyof TEvents>(
    event: K,
    listener: EventListener<TEvents[K]>
  ): void {
    const set = this.listeners.get(event);
    if (!set) return;
    set.delete(listener);
    if (set.size === 0) {
      this.listeners.delete(event);
    }
  }

  public emit<K extends keyof TEvents>(event: K, payload: TEvents[K]): void {
    const set = this.listeners.get(event);
    if (!set || set.size === 0) return;
    const snapshot = Array.from(set);
    for (const listener of snapshot) {
      listener(payload);
    }
  }

  public listenerCount<K extends keyof TEvents>(event?: K): number {
    if (event !== undefined) {
      return this.listeners.get(event)?.size ?? 0;
    }
    let total = 0;
    for (const set of this.listeners.values()) {
      total += set.size;
    }
    return total;
  }

  public clear<K extends keyof TEvents>(event?: K): void {
    if (event !== undefined) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }
}
