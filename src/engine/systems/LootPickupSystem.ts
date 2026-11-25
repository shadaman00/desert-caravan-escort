import type { EventBus } from '@/engine/EventBus';
import type { GameStateId } from '@/engine/fsm/GameFSM';
import type { AutoUpgradeItemKind, TurretType } from '@/store/types';
import { LOOT_ITEM_CATALOG } from '@/game/data/autoUpgradeRules';
import { WALKER_ANCHOR_X, WALKER_GROUND_Y } from '@/engine/render/draw/sandwalker';

export interface LootPickupEntity {
  id: string;
  itemKind: AutoUpgradeItemKind;
  label: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  groundY: number;
  ageSec: number;
  magnetized: boolean;
}

const LOOT_MAGNET_DELAY_SEC = 0.45;
const LOOT_MAGNET_SPEED_PX = 420;
const LOOT_GRAVITY_PX = 520;

const TURRET_PART_BY_TYPE: Record<TurretType, AutoUpgradeItemKind> = {
  HEAT_RAY: 'TURRET_PART_HEAT',
  HARPOON: 'TURRET_PART_HARPOON',
  MORTAR: 'TURRET_PART_MORTAR',
};

/**
 * Selects an enemy battlefield loot item deterministically every 5th kill or randomly on heavy/mirage foes.
 */
export function pickEnemyDropItem(
  archetypeId: string,
  totalKills: number,
  activeTurret: TurretType,
  rng: () => number = Math.random
): AutoUpgradeItemKind | null {
  const safeKills = Math.max(1, Math.floor(totalKills));
  if (safeKills % 5 === 0) {
    return TURRET_PART_BY_TYPE[activeTurret] ?? 'TURRET_PART_ANY';
  }
  const roll = rng();
  if (archetypeId === 'SCORPION' && roll < 0.25) {
    return 'LEG_PISTON';
  }
  if (archetypeId === 'MIRAGE_SPIRIT' && roll < 0.25) {
    return 'EXPLORER_TABLET';
  }
  if (roll < 0.14) {
    return 'MERC_MANUAL';
  }
  return null;
}

/**
 * Manages dropped battlefield upgrade items with bounce physics and automatic magnetization.
 */
export class LootPickupSystem {
  private readonly eventBus?: EventBus;
  private items: LootPickupEntity[] = [];
  private nextId = 1;
  private elapsedSec = 0;

  constructor(options: { eventBus?: EventBus } = {}) {
    this.eventBus = options.eventBus;
  }

  public getActivePickups(): readonly LootPickupEntity[] {
    return this.items;
  }

  public reset(): void {
    this.items = [];
  }

  public spawnLoot(itemKind: AutoUpgradeItemKind, x: number, y: number): LootPickupEntity {
    const meta = LOOT_ITEM_CATALOG[itemKind];
    const entity: LootPickupEntity = {
      id: `loot_${this.nextId++}`,
      itemKind,
      label: meta.label,
      x,
      y: Math.min(WALKER_GROUND_Y - 4, y),
      vx: -30,
      vy: -135,
      groundY: WALKER_GROUND_Y - 6,
      ageSec: 0,
      magnetized: false,
    };
    this.items.push(entity);
    return entity;
  }

  public update(dt: number, stateId: GameStateId | null): number {
    const safeDt = Number.isFinite(dt) && dt > 0 ? dt : 0;
    if (safeDt <= 0) return 0;
    this.elapsedSec += safeDt;

    if (stateId === 'OASIS_HUB' || stateId === 'OASIS_SETTLEMENT') {
      this.items = [];
      return 0;
    }

    const targetX = WALKER_ANCHOR_X;
    const targetY = WALKER_GROUND_Y - 36;
    let collectedCount = 0;

    for (let i = this.items.length - 1; i >= 0; i--) {
      const item = this.items[i];
      item.ageSec += safeDt;

      if (!item.magnetized && item.ageSec >= LOOT_MAGNET_DELAY_SEC) {
        item.magnetized = true;
      }

      if (!item.magnetized) {
        item.vy += LOOT_GRAVITY_PX * safeDt;
        item.x += item.vx * safeDt;
        item.y += item.vy * safeDt;
        if (item.y >= item.groundY) {
          item.y = item.groundY;
          item.vy = -Math.abs(item.vy) * 0.35;
          item.vx *= 0.6;
        }
      } else {
        const dx = targetX - item.x;
        const dy = targetY - item.y;
        const dist = Math.hypot(dx, dy);
        const step = LOOT_MAGNET_SPEED_PX * safeDt;
        if (dist <= Math.max(14, step)) {
          this.items.splice(i, 1);
          collectedCount += 1;
          this.eventBus?.emit('loot:collected', {
            itemKind: item.itemKind,
            label: item.label,
            x: targetX,
            y: targetY,
          });
          continue;
        }
        item.x += (dx / dist) * step;
        item.y += (dy / dist) * step;
      }
    }

    return collectedCount;
  }

  public render(ctx: CanvasRenderingContext2D): void {
    if (this.items.length === 0) return;

    ctx.save();
    for (const item of this.items) {
      const meta = LOOT_ITEM_CATALOG[item.itemKind];
      const bobY = Math.sin(this.elapsedSec * 9 + item.x * 0.05) * 1.5;
      const px = Math.round(item.x);
      const py = Math.round(item.y + bobY);

      // Dark crisp outline backing
      ctx.fillStyle = '#0f1219';
      ctx.fillRect(px - 6, py - 6, 12, 12);

      // Core item body
      ctx.fillStyle = meta.colorPrimary;
      ctx.fillRect(px - 5, py - 5, 10, 10);

      // Top-left rim highlight
      ctx.fillStyle = meta.colorHighlight;
      ctx.fillRect(px - 4, py - 4, 8, 3);
      ctx.fillRect(px - 4, py - 4, 2, 6);
    }
    ctx.restore();
  }
}
