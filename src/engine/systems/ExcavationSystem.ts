import type { GameStateId } from '@/engine/fsm/GameFSM';
import type { GameStoreActions, GameStoreState } from '@/store/types';
import {
  RELIC_DEFINITIONS,
  STELE_DEFINITIONS,
  DEFAULT_STELE_GEAR_REWARD,
  getRelicDefinition,
} from '@/game/data/relics';
import { WALKER_ANCHOR_X, WALKER_GROUND_Y } from '@/engine/render/draw/sandwalker';

export type ExcavationNodeKind = 'STELE' | 'RELIC_CHEST';

export interface ExcavationNode {
  id: string;
  kind: ExcavationNodeKind;
  steleId?: number;
  relicId?: string;
  x: number;
  y: number;
  progress: number; // 0..1
  durationSec: number;
  completed: boolean;
}

export const BASE_EXCAVATE_SEC = 2.0;
export const ZARA_EXCAVATE_SPEED_MULT = 1.3;
export const EXCAVATION_SPAWN_INTERVAL_SEC = 18.0;

export type ExcavationStore = GameStoreState &
  Pick<
    GameStoreActions,
    'decodeStele' | 'addPendingRelic' | 'resolveRelic' | 'addCurrencies'
  >;

export class ExcavationSystem {
  private nodes: ExcavationNode[] = [];
  private nextNodeId = 1;
  private spawnTimer = 6.0;
  private relicSeq = 0;

  public getActiveNodes(): readonly ExcavationNode[] {
    return this.nodes;
  }

  public reset(): void {
    this.nodes = [];
    this.spawnTimer = 6.0;
  }

  public spawnNode(
    node: Omit<ExcavationNode, 'progress' | 'completed'> &
      Partial<Pick<ExcavationNode, 'progress' | 'completed'>>
  ): ExcavationNode {
    const created: ExcavationNode = {
      id: node.id || `exc_${this.nextNodeId++}`,
      kind: node.kind,
      steleId: node.steleId,
      relicId: node.relicId,
      x: node.x,
      y: node.y,
      durationSec: node.durationSec > 0 ? node.durationSec : BASE_EXCAVATE_SEC,
      progress: node.progress ?? 0,
      completed: node.completed ?? false,
    };
    this.nodes.push(created);
    return created;
  }

  public update(
    dt: number,
    stateId: GameStateId | null,
    actualSpeedPx: number,
    store: ExcavationStore,
    openingElapsedSeconds = 0
  ): void {
    const safeDt = Number.isFinite(dt) && dt > 0 ? dt : 0;
    if (safeDt <= 0) return;

    if (stateId === 'OASIS_HUB' || stateId === 'OASIS_SETTLEMENT') {
      if (this.nodes.length > 0) {
        this.reset();
      }
      return;
    }

    const canExcavate =
      stateId === 'MARCH_NORMAL' ||
      stateId === 'HAZARD_ZONE' ||
      (stateId === 'OPENING_HOOK' &&
        openingElapsedSeconds >= 75 &&
        openingElapsedSeconds < 135);

    if (!canExcavate) return;

    const isZaraUnlocked =
      store.mercenaries.find((m) => m.id === 'zara')?.isUnlocked ?? false;
    const rate = isZaraUnlocked ? ZARA_EXCAVATE_SPEED_MULT : 1.0;

    // Periodic spawning during active normal/hazard march
    if (stateId === 'MARCH_NORMAL' || stateId === 'HAZARD_ZONE') {
      this.spawnTimer += safeDt;
      if (this.spawnTimer >= EXCAVATION_SPAWN_INTERVAL_SEC && this.nodes.length === 0) {
        this.spawnTimer = 0;
        const nextStele = STELE_DEFINITIONS.find(
          (s) => !store.steles.decoded.includes(s.id)
        );
        if (nextStele && this.relicSeq % 2 === 0) {
          this.spawnNode({
            id: `stele_node_${this.nextNodeId++}`,
            kind: 'STELE',
            steleId: nextStele.id,
            x: 420,
            y: WALKER_GROUND_Y,
            durationSec: BASE_EXCAVATE_SEC,
          });
        } else {
          const def =
            RELIC_DEFINITIONS[this.relicSeq % RELIC_DEFINITIONS.length];
          this.spawnNode({
            id: `relic_node_${this.nextNodeId++}`,
            kind: 'RELIC_CHEST',
            relicId: def.id,
            x: 420,
            y: WALKER_GROUND_Y,
            durationSec: BASE_EXCAVATE_SEC,
          });
        }
        this.relicSeq += 1;
      }
    }

    const engageMinX = WALKER_ANCHOR_X - 45;
    const engageMaxX = WALKER_ANCHOR_X + 65;

    for (let i = this.nodes.length - 1; i >= 0; i--) {
      const node = this.nodes[i];
      if (node.completed) {
        this.nodes.splice(i, 1);
        continue;
      }

      if (node.x > engageMaxX) {
        node.x -= Math.max(40, actualSpeedPx * 0.45) * safeDt;
      } else if (node.x >= engageMinX) {
        node.progress = Math.min(
          1,
          node.progress + (safeDt * rate) / node.durationSec
        );
        if (node.progress >= 1) {
          node.completed = true;
          this.completeNode(node, store);
          this.nodes.splice(i, 1);
        }
      } else {
        this.nodes.splice(i, 1);
      }
    }
  }

  private completeNode(node: ExcavationNode, store: ExcavationStore): void {
    if (node.kind === 'STELE') {
      const steleId = node.steleId ?? 1;
      const alreadyDecoded = store.steles.decoded.includes(steleId);
      store.decodeStele(steleId);
      if (!alreadyDecoded) {
        store.addCurrencies({ ancientGear: DEFAULT_STELE_GEAR_REWARD });
      }
    } else {
      const relicId = node.relicId ?? 'relic_solar_disc';
      const def = getRelicDefinition(relicId);
      store.addPendingRelic(relicId, def.appraiseDurationMs);
    }
  }

  /**
   * Resolves the first ready relic in store.relics.pending (appraiseEndsAt <= nowMs).
   * Never auto-resolves inside update() so players explicitly claim in Codex tab (TC-ECON-12).
   */
  public appraiseReadyRelic(
    store: ExcavationStore,
    nowMs = Date.now()
  ): string | null {
    const ready = store.relics.pending.find((r) => r.appraiseEndsAt <= nowMs);
    if (!ready) return null;

    const def = getRelicDefinition(ready.id);
    store.resolveRelic(ready.id);
    store.addCurrencies({ ancientGear: def.gearReward });
    return ready.id;
  }

  /**
   * Resolves a pending relic immediately after Rewarded Ad (RELIC_APPRAISAL).
   */
  public appraisePendingRelicByAd(store: ExcavationStore): string | null {
    if (store.relics.pending.length === 0) return null;
    const now = Date.now();
    const target =
      store.relics.pending.find((r) => r.appraiseEndsAt > now) ??
      store.relics.pending[0];

    const def = getRelicDefinition(target.id);
    store.resolveRelic(target.id);
    store.addCurrencies({ ancientGear: def.gearReward });
    return target.id;
  }

  public render(ctx: CanvasRenderingContext2D): void {
    if (this.nodes.length === 0) return;

    ctx.save();
    for (const node of this.nodes) {
      if (node.completed) continue;

      if (node.kind === 'STELE') {
        // Ancient stone stele protruding from desert floor
        ctx.fillStyle = '#4a5568';
        ctx.fillRect(node.x - 9, node.y - 28, 18, 28);
        ctx.fillStyle = '#ecc94b';
        ctx.fillRect(node.x - 5, node.y - 22, 10, 3);
        ctx.fillRect(node.x - 5, node.y - 15, 10, 3);
      } else {
        // Golden relic excavation chest
        ctx.fillStyle = '#b7791f';
        ctx.fillRect(node.x - 10, node.y - 16, 20, 16);
        ctx.fillStyle = '#fef08a';
        ctx.fillRect(node.x - 10, node.y - 16, 20, 4);
      }

      if (node.progress > 0) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
        ctx.fillRect(node.x - 14, node.y - 36, 28, 4);
        ctx.fillStyle = '#68d391';
        ctx.fillRect(node.x - 14, node.y - 36, 28 * node.progress, 4);
      }
    }
    ctx.restore();
  }
}
