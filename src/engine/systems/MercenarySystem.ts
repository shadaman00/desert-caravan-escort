import type { GameStoreState, MercenaryRole } from '@/store/types';
import type { GameStateId } from '@/engine/fsm/GameFSM';
import type { EventBus } from '@/engine/EventBus';
import type { ParticlePool } from '@/engine/render/draw/particles';
import {
  WALKER_ANCHOR_X,
  WALKER_GROUND_Y,
  type SandwalkerRig,
} from '@/engine/render/draw/sandwalker';
import {
  MERCENARY_DEFINITIONS,
  MERCENARY_IDS,
  LILI_PASSIVE_HEAL_RATE_PER_SEC,
  LILI_SKILL_HEAL_FRACTION,
  SERA_CRIT_CHANCE,
  SERA_CRIT_MULTIPLIER,
  SERA_VOLLEY_ARROW_COUNT,
  SERA_VOLLEY_DAMAGE_FACTOR,
  TARIK_INTERCEPT_RADIUS_PX,
  TARIK_KNOCKBACK_PX,
  TARIK_MELEE_DAMAGE_MULTIPLIER,
  TARIK_SHIELD_BASE,
  TARIK_SHIELD_MAX_RATIO,
  ZARA_NOVA_BASE_DAMAGE,
  ZARA_NOVA_RADIUS_PX,
  ZARA_STELE_DECODE_MULTIPLIER,
  type MercenaryId,
  type MercenarySilhouetteKind,
} from '@/game/data/mercenaries';
import {
  calculatePartyAttack,
  isExpeditionSynergyActive,
  statAt,
} from '@/game/formulas';
import type { CombatTarget, DamageSystem } from './DamageSystem';

export interface MercenaryRuntimeState {
  id: MercenaryId;
  name: string;
  role: MercenaryRole;
  silhouette: MercenarySilhouetteKind;
  colorPrimary: string;
  colorAccent: string;
  isActive: boolean;
  level: number;
  x: number;
  y: number;
  attackTimer: number;
  skillTimer: number;
  attackFlashTimer: number;
  skillFlashTimer: number;
  targetId: string | null;
}

export interface MercenaryVisualShot {
  kind: 'ARROW' | 'ORB' | 'SLASH' | 'HEAL_PULSE' | 'COIN_FLING';
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  age: number;
  maxLife: number;
  color: string;
  isCrit?: boolean;
  aoeRadius?: number;
}

export interface MercenaryTickResult {
  damageDealtTotal: number;
  healedHp: number;
  shieldGranted: number;
  bonusGold: number;
  synergyActive: boolean;
}

export interface MercenaryUpdateOptions {
  forcePreviewAll?: boolean;
}

export class MercenarySystem {
  private readonly rng: () => number;
  private readonly damageSystem?: DamageSystem;
  private readonly eventBus?: EventBus;
  private readonly runtimes: Map<MercenaryId, MercenaryRuntimeState> = new Map();
  private readonly visualShots: MercenaryVisualShot[] = [];

  constructor(
    options: { rng?: () => number; damageSystem?: DamageSystem; eventBus?: EventBus } = {}
  ) {
    this.rng = options.rng ?? Math.random;
    this.damageSystem = options.damageSystem;
    this.eventBus = options.eventBus;

    for (const id of MERCENARY_IDS) {
      const def = MERCENARY_DEFINITIONS[id];
      this.runtimes.set(id, {
        id,
        name: def.name,
        role: def.role,
        silhouette: def.silhouette,
        colorPrimary: def.colorPrimary,
        colorAccent: def.colorAccent,
        isActive: false,
        level: 1,
        x: WALKER_ANCHOR_X + def.slotOffset.x,
        y: WALKER_GROUND_Y + def.slotOffset.y,
        attackTimer: 0,
        skillTimer: 0,
        attackFlashTimer: 0,
        skillFlashTimer: 0,
        targetId: null,
      });
    }
  }

  public getIncomingMeleeDamageMultiplier(store: Pick<GameStoreState, 'mercenaries'>): number {
    const tarik = store.mercenaries.find((m) => m.id === 'tarik');
    return tarik?.isUnlocked ? TARIK_MELEE_DAMAGE_MULTIPLIER : 1.0;
  }

  public getSteleDecodeSpeedMultiplier(store: Pick<GameStoreState, 'mercenaries'>): number {
    const zara = store.mercenaries.find((m) => m.id === 'zara');
    return zara?.isUnlocked ? ZARA_STELE_DECODE_MULTIPLIER : 1.0;
  }

  public getRuntimeState(id: MercenaryId): MercenaryRuntimeState | undefined {
    return this.runtimes.get(id);
  }

  public getRuntimeStates(): readonly MercenaryRuntimeState[] {
    return Array.from(this.runtimes.values());
  }

  public getVisualShots(): readonly MercenaryVisualShot[] {
    return this.visualShots;
  }

  public resetVisuals(): void {
    this.visualShots.length = 0;
  }

  public syncRoster(
    store: Pick<GameStoreState, 'mercenaries'>,
    walkerRig?: Pick<SandwalkerRig, 'hullBobY'>,
    options: MercenaryUpdateOptions = {}
  ): void {
    const hullBobY = walkerRig?.hullBobY ?? 0;
    const forceAll = Boolean(options.forcePreviewAll);
    for (const id of MERCENARY_IDS) {
      const def = MERCENARY_DEFINITIONS[id];
      const storeMerc = store.mercenaries.find((m) => m.id === id);
      const rt = this.runtimes.get(id);
      if (!rt) continue;
      rt.isActive = forceAll || Boolean(storeMerc?.isUnlocked);
      rt.level = storeMerc?.level ?? rt.level;
      rt.x = WALKER_ANCHOR_X + def.slotOffset.x;
      rt.y = WALKER_GROUND_Y + def.slotOffset.y + hullBobY;
      if (!rt.isActive) {
        rt.targetId = null;
      }
    }
  }

  public update(
    dt: number,
    fsmStateId: GameStateId | null,
    store: GameStoreState,
    targets: readonly CombatTarget[],
    walkerRig?: Pick<SandwalkerRig, 'hullBobY'>,
    particles?: ParticlePool,
    options: MercenaryUpdateOptions = {}
  ): MercenaryTickResult {
    const safeDt = Number.isFinite(dt) && dt > 0 ? dt : 0;
    const hullBobY = walkerRig?.hullBobY ?? 0;

    // Update visual shots decay even outside combat
    for (let i = this.visualShots.length - 1; i >= 0; i--) {
      const shot = this.visualShots[i];
      shot.age += safeDt;
      if (shot.age >= shot.maxLife) {
        this.visualShots.splice(i, 1);
      }
    }

    const forceAll = Boolean(options.forcePreviewAll);
    const synergyActive = forceAll || isExpeditionSynergyActive(store.mercenaries);

    // Sync slot positions & active status
    for (const id of MERCENARY_IDS) {
      const def = MERCENARY_DEFINITIONS[id];
      const storeMerc = store.mercenaries.find((m) => m.id === id);
      const rt = this.runtimes.get(id)!;
      rt.isActive = forceAll || Boolean(storeMerc?.isUnlocked);
      rt.level = storeMerc?.level ?? 1;
      rt.x = WALKER_ANCHOR_X + def.slotOffset.x;
      rt.y =
        WALKER_GROUND_Y +
        def.slotOffset.y +
        (def.placement === 'DECK_REAR' ||
        def.placement === 'DECK_FRONT' ||
        def.placement === 'DECK_MID'
          ? hullBobY
          : 0);
      if (rt.attackFlashTimer > 0) {
        rt.attackFlashTimer = Math.max(0, rt.attackFlashTimer - safeDt);
      }
      if (rt.skillFlashTimer > 0) {
        rt.skillFlashTimer = Math.max(0, rt.skillFlashTimer - safeDt);
      }
    }

    const isCombatActiveState =
      fsmStateId === 'MARCH_NORMAL' ||
      fsmStateId === 'HAZARD_ZONE' ||
      fsmStateId === 'BOSS_ENCOUNTER' ||
      fsmStateId === 'OPENING_HOOK';

    if (!isCombatActiveState || store.sandwalker.currentHp <= 0 || safeDt <= 0) {
      return {
        damageDealtTotal: 0,
        healedHp: 0,
        shieldGranted: 0,
        bonusGold: 0,
        synergyActive,
      };
    }

    let damageDealtTotal = 0;
    let healedHp = 0;
    let shieldGranted = 0;
    let bonusGold = 0;

    for (const id of MERCENARY_IDS) {
      const rt = this.runtimes.get(id)!;
      if (!rt.isActive) continue;
      const def = MERCENARY_DEFINITIONS[id];

      // Lili: continuous 2% maxHp/s passive + 5s Solar Blessing skill
      if (id === 'lili') {
        const canHeal =
          store.sandwalker.currentHp > 0 && store.sandwalker.currentHp < store.sandwalker.maxHp;
        if (canHeal) {
          healedHp += LILI_PASSIVE_HEAL_RATE_PER_SEC * store.sandwalker.maxHp * safeDt;
        }
        rt.skillTimer += safeDt;
        if (rt.skillTimer >= def.skillCooldownSec) {
          if (canHeal) {
            rt.skillTimer -= def.skillCooldownSec;
            rt.skillFlashTimer = 0.45;
            healedHp += LILI_SKILL_HEAL_FRACTION * store.sandwalker.maxHp;
            this.spawnShot({
              kind: 'HEAL_PULSE',
              fromX: rt.x,
              fromY: rt.y,
              toX: WALKER_ANCHOR_X,
              toY: WALKER_GROUND_Y - 58 + hullBobY,
              maxLife: 0.45,
              color: def.colorAccent,
              aoeRadius: 48,
            });
            this.eventBus?.emit('combat:mercenarySkill', { mercId: id, role: def.role });
          } else {
            rt.skillTimer = def.skillCooldownSec;
          }
        }
        continue;
      }

      // Advance attack & skill timers for offensive mercenaries
      rt.attackTimer += safeDt;
      rt.skillTimer += safeDt;

      // Tarik Solar Buckler skill triggers even when close threats exist
      if (id === 'tarik' && rt.skillTimer >= def.skillCooldownSec) {
        const closeEnemies = targets.filter(
          (t) =>
            t.alive &&
            Math.hypot(t.x - rt.x, t.y - rt.y) <= TARIK_INTERCEPT_RADIUS_PX + t.radius
        );
        const shieldCap = Math.round(store.sandwalker.maxHp * TARIK_SHIELD_MAX_RATIO);
        const needShield = store.sandwalker.solarShieldHp < shieldCap;

        if (closeEnemies.length > 0 || needShield) {
          rt.skillTimer -= def.skillCooldownSec;
          rt.skillFlashTimer = 0.5;
          const shieldAmt = Math.round(statAt(TARIK_SHIELD_BASE, rt.level));
          const allowed = Math.max(0, shieldCap - store.sandwalker.solarShieldHp);
          shieldGranted += Math.min(shieldAmt, allowed);

          for (let i = 0; i < closeEnemies.length; i++) {
            const e = closeEnemies[i];
            if (!e.knockbackImmune) {
              e.x = Math.min(470, e.x + TARIK_KNOCKBACK_PX);
              e.knockbackVx = Math.max(e.knockbackVx ?? 0, 140);
            }
          }
          this.spawnShot({
            kind: 'SLASH',
            fromX: rt.x,
            fromY: rt.y - 12,
            toX: rt.x + 28,
            toY: rt.y - 12,
            maxLife: 0.3,
            color: def.colorAccent,
          });
          this.eventBus?.emit('combat:mercenarySkill', { mercId: id, role: def.role });
        } else {
          rt.skillTimer = def.skillCooldownSec;
        }
      }

      // Basic attacks
      const target = this.pickTarget(rt, def.rangePx, targets);
      if (!target) {
        rt.attackTimer = Math.min(def.attackIntervalSec, rt.attackTimer);
        if (id !== 'tarik') {
          rt.skillTimer = Math.min(def.skillCooldownSec, rt.skillTimer);
        }
        rt.targetId = null;
        continue;
      }

      rt.targetId = target.id;

      // Active skills for Sera, Zara, Harun
      if (id === 'sera' && rt.skillTimer >= def.skillCooldownSec) {
        rt.skillTimer -= def.skillCooldownSec;
        rt.skillFlashTimer = 0.35;
        const volleyTargets = this.pickUpToNTargets(rt, def.rangePx, targets, SERA_VOLLEY_ARROW_COUNT);
        for (let v = 0; v < SERA_VOLLEY_ARROW_COUNT; v++) {
          const vt = volleyTargets[v % volleyTargets.length];
          const dmg = calculatePartyAttack(
            statAt(def.baseAttack, rt.level) * SERA_VOLLEY_DAMAGE_FACTOR * SERA_CRIT_MULTIPLIER,
            synergyActive
          );
          damageDealtTotal += this.dealMercDamage(vt, dmg, {
            isCrit: true,
            color: '#68d391',
          });
          this.spawnShot({
            kind: 'ARROW',
            fromX: rt.x,
            fromY: rt.y - 8,
            toX: vt.x,
            toY: vt.y,
            maxLife: 0.22,
            color: '#9ae6b4',
            isCrit: true,
          });
        }
        this.eventBus?.emit('combat:mercenarySkill', { mercId: id, role: def.role });
      } else if (id === 'zara' && rt.skillTimer >= def.skillCooldownSec) {
        rt.skillTimer -= def.skillCooldownSec;
        rt.skillFlashTimer = 0.45;
        const novaDmg = calculatePartyAttack(
          statAt(ZARA_NOVA_BASE_DAMAGE, rt.level),
          synergyActive
        );
        for (let i = 0; i < targets.length; i++) {
          const e = targets[i];
          if (!e.alive) continue;
          if (Math.hypot(e.x - target.x, e.y - target.y) <= ZARA_NOVA_RADIUS_PX + e.radius) {
            damageDealtTotal += this.dealMercDamage(e, novaDmg, {
              isCrit: false,
              color: '#d6bcfa',
            });
          }
        }
        this.spawnShot({
          kind: 'ORB',
          fromX: rt.x,
          fromY: rt.y - 10,
          toX: target.x,
          toY: target.y,
          maxLife: 0.35,
          color: '#d6bcfa',
          aoeRadius: ZARA_NOVA_RADIUS_PX,
        });
        particles?.spawn({
          kind: 'SPARK',
          x: target.x,
          y: target.y,
          vx: 0,
          vy: -35,
          size: 4,
          endSize: 1,
          maxLife: 0.28,
          startAlpha: 0.9,
          color: '#d6bcfa',
        });
        this.eventBus?.emit('combat:mercenarySkill', { mercId: id, role: def.role });
      } else if (id === 'harun' && rt.skillTimer >= def.skillCooldownSec) {
        rt.skillTimer -= def.skillCooldownSec;
        rt.skillFlashTimer = 0.35;
        const slingDmg = calculatePartyAttack(statAt(def.baseAttack, rt.level), synergyActive);
        damageDealtTotal += this.dealMercDamage(target, slingDmg, {
          isCrit: false,
          color: '#f6ad55',
        });
        bonusGold += 3 + Math.floor(rt.level * 0.5);
        this.spawnShot({
          kind: 'COIN_FLING',
          fromX: rt.x,
          fromY: rt.y - 14,
          toX: target.x,
          toY: target.y,
          maxLife: 0.25,
          color: '#ecc94b',
        });
        this.eventBus?.emit('combat:mercenarySkill', { mercId: id, role: def.role });
      }

      // Standard auto-attack cadence
      while (rt.attackTimer >= def.attackIntervalSec) {
        rt.attackTimer -= def.attackIntervalSec;
        const currentTarget = target.alive
          ? target
          : this.pickTarget(rt, def.rangePx, targets);
        if (!currentTarget) break;

        rt.attackFlashTimer = 0.16;
        const isCrit = id === 'sera' && this.rng() < SERA_CRIT_CHANCE;
        const rawAtk = statAt(def.baseAttack, rt.level) * (isCrit ? SERA_CRIT_MULTIPLIER : 1.0);
        const finalAtk = calculatePartyAttack(rawAtk, synergyActive);

        damageDealtTotal += this.dealMercDamage(currentTarget, finalAtk, {
          isCrit,
          color: def.colorAccent,
        });

        const shotKind: MercenaryVisualShot['kind'] =
          id === 'sera'
            ? 'ARROW'
            : id === 'zara'
              ? 'ORB'
              : id === 'harun'
                ? 'COIN_FLING'
                : 'SLASH';

        this.spawnShot({
          kind: shotKind,
          fromX: rt.x,
          fromY: rt.y - 10,
          toX: currentTarget.x,
          toY: currentTarget.y,
          maxLife: shotKind === 'SLASH' ? 0.16 : 0.2,
          color: def.colorAccent,
          isCrit,
        });
      }
    }

    return {
      damageDealtTotal,
      healedHp,
      shieldGranted,
      bonusGold,
      synergyActive,
    };
  }

  private dealMercDamage(
    target: CombatTarget,
    rawAmount: number,
    options: { isCrit?: boolean; color?: string }
  ): number {
    if (!target.alive || rawAmount <= 0) return 0;
    if (this.damageSystem) {
      const res = this.damageSystem.applyDirectDamage(target, rawAmount, {
        isCrit: options.isCrit,
        color: options.color,
      });
      return res.hpDamage;
    }

    const dmg = Math.max(1, Math.round(rawAmount));
    const dealt = Math.min(target.hp, dmg);
    target.hp = Math.max(0, target.hp - dmg);
    target.hitFlashTimer = 0.12;
    if (target.hp <= 0) {
      target.hp = 0;
      target.alive = false;
    }
    return dealt;
  }

  private pickTarget(
    rt: MercenaryRuntimeState,
    rangePx: number,
    targets: readonly CombatTarget[]
  ): CombatTarget | null {
    let best: CombatTarget | null = null;
    let bestDist = Infinity;
    for (let i = 0; i < targets.length; i++) {
      const t = targets[i];
      if (!t.alive) continue;
      const dist = Math.hypot(t.x - rt.x, t.y - rt.y);
      if (dist <= rangePx + t.radius && dist < bestDist) {
        bestDist = dist;
        best = t;
      }
    }
    return best;
  }

  private pickUpToNTargets(
    rt: MercenaryRuntimeState,
    rangePx: number,
    targets: readonly CombatTarget[],
    count: number
  ): CombatTarget[] {
    const candidates: Array<{ target: CombatTarget; dist: number }> = [];
    for (let i = 0; i < targets.length; i++) {
      const t = targets[i];
      if (!t.alive) continue;
      const dist = Math.hypot(t.x - rt.x, t.y - rt.y);
      if (dist <= rangePx + t.radius) {
        candidates.push({ target: t, dist });
      }
    }
    candidates.sort((a, b) => a.dist - b.dist);
    return candidates.slice(0, count).map((c) => c.target);
  }

  private spawnShot(shot: Omit<MercenaryVisualShot, 'age'>): void {
    if (this.visualShots.length >= 48) {
      this.visualShots.shift();
    }
    this.visualShots.push({ ...shot, age: 0 });
  }
}
