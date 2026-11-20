import type { EnemyArchetypeTag, TurretType } from '@/store/types';
import type { EventBus } from '@/engine/EventBus';
import {
  calculateAffinityMultiplier,
  calculatePartyAttackMultiplier,
  statAt,
} from '@/game/formulas';
import { WEAK_POINT_DAMAGE_MULTIPLIER } from '@/game/data/turrets';

export interface CombatTarget {
  id: string;
  x: number;
  y: number;
  radius: number;
  hp: number;
  maxHp: number;
  armor?: number;
  maxArmor?: number;
  armorAbsorbsHp?: boolean;
  weakPointOffset?: { x: number; y: number };
  tags: EnemyArchetypeTag[];
  isWeakPoint?: boolean;
  snapPriority?: boolean;
  knockbackImmune?: boolean;
  alive: boolean;
  hitFlashTimer?: number;
  knockbackVx?: number;
}

export interface WeaponProfile {
  turret: TurretType;
  level: number;
  baseDamage: number;
  synergyActive?: boolean;
  isWeakPointHit?: boolean;
  isCrit?: boolean;
  critMultiplier?: number;
  armorCrushFactor?: number;
}

export interface DamageBreakdown {
  finalDamage: number;
  affinityMultiplier: number;
  synergyMultiplier: number;
  weakPointMultiplier: number;
  critMultiplier: number;
  isEffective: boolean;
  isResisted: boolean;
}

export interface DamageHitResult extends DamageBreakdown {
  hpDamage: number;
  armorDamage: number;
  killed: boolean;
}

export interface DamagePopup {
  x: number;
  y: number;
  vy: number;
  text: string;
  age: number;
  maxLife: number;
  color: string;
  scale: number;
}

/**
 * Pure damage breakdown applying:
 * - statAt(baseDamage, level)
 * - Decision D8 single highest tag affinity multiplier (calculateAffinityMultiplier)
 * - 5-Mercenary Expedition Synergy (+25%)
 * - Manual Weak-Point bonus (1.5x)
 * - Critical hit multiplier
 */
export function resolveDamageBreakdown(
  attacker: WeaponProfile,
  targetTags: EnemyArchetypeTag[]
): DamageBreakdown {
  if (!Number.isFinite(attacker.baseDamage) || attacker.baseDamage <= 0) {
    return {
      finalDamage: 0,
      affinityMultiplier: 1.0,
      synergyMultiplier: 1.0,
      weakPointMultiplier: 1.0,
      critMultiplier: 1.0,
      isEffective: false,
      isResisted: false,
    };
  }

  const scaledBase = statAt(attacker.baseDamage, attacker.level);
  const affinityMultiplier = calculateAffinityMultiplier(attacker.turret, targetTags);
  const synergyMultiplier = calculatePartyAttackMultiplier(Boolean(attacker.synergyActive));
  const weakPointMultiplier = attacker.isWeakPointHit ? WEAK_POINT_DAMAGE_MULTIPLIER : 1.0;
  const critMultiplier = attacker.isCrit ? (attacker.critMultiplier ?? 1.5) : 1.0;

  const raw =
    scaledBase * affinityMultiplier * synergyMultiplier * weakPointMultiplier * critMultiplier;
  const finalDamage = raw > 0 ? Math.max(1, Math.round(raw)) : 0;

  return {
    finalDamage,
    affinityMultiplier,
    synergyMultiplier,
    weakPointMultiplier,
    critMultiplier,
    isEffective: affinityMultiplier >= 1.8,
    isResisted: affinityMultiplier < 1.0,
  };
}

/**
 * Canonical DamageSystem contract (PROJECT.md § Interface Contracts):
 * calculateDamage(attacker: WeaponProfile, targetTags: EnemyArchetypeTag[]): number
 */
export function calculateDamage(
  attacker: WeaponProfile,
  targetTags: EnemyArchetypeTag[]
): number {
  return resolveDamageBreakdown(attacker, targetTags).finalDamage;
}

export class DamagePopupPool {
  public readonly capacity: number;
  private readonly popups: DamagePopup[] = [];

  constructor(capacity = 64) {
    this.capacity = Math.max(1, Math.floor(capacity));
  }

  public spawn(params: {
    x: number;
    y: number;
    amount: number;
    color?: string;
    scale?: number;
    isCrit?: boolean;
  }): void {
    if (!Number.isFinite(params.amount) || params.amount <= 0) return;

    if (this.popups.length >= this.capacity) {
      this.popups.shift();
    }

    this.popups.push({
      x: params.x,
      y: params.y,
      vy: params.isCrit ? -44 : -34,
      text: `${Math.round(params.amount)}${params.isCrit ? '!' : ''}`,
      age: 0,
      maxLife: 0.65,
      color: params.color ?? '#ffffff',
      scale: params.scale ?? (params.isCrit ? 1.2 : 1.0),
    });
  }

  public update(dt: number): void {
    if (!Number.isFinite(dt) || dt <= 0) return;
    for (let i = this.popups.length - 1; i >= 0; i--) {
      const p = this.popups[i];
      p.age += dt;
      if (p.age >= p.maxLife) {
        const last = this.popups.length - 1;
        if (i !== last) {
          this.popups[i] = this.popups[last];
        }
        this.popups.pop();
        continue;
      }
      p.y += p.vy * dt;
      p.vy *= 0.94;
    }
  }

  public getPopups(): readonly DamagePopup[] {
    return this.popups;
  }

  public clear(): void {
    this.popups.length = 0;
  }
}

export class DamageSystem {
  public readonly popupPool: DamagePopupPool;
  private readonly eventBus?: EventBus;

  constructor(options: { eventBus?: EventBus; popupCapacity?: number } = {}) {
    this.eventBus = options.eventBus;
    this.popupPool = new DamagePopupPool(options.popupCapacity ?? 64);
  }

  public applyTurretHit(
    target: CombatTarget,
    attacker: WeaponProfile,
    options: { hitX?: number; hitY?: number } = {}
  ): DamageHitResult {
    if (!target.alive) {
      return {
        finalDamage: 0,
        affinityMultiplier: 1.0,
        synergyMultiplier: 1.0,
        weakPointMultiplier: 1.0,
        critMultiplier: 1.0,
        isEffective: false,
        isResisted: false,
        hpDamage: 0,
        armorDamage: 0,
        killed: false,
      };
    }

    const breakdown = resolveDamageBreakdown(attacker, target.tags);
    const { finalDamage, affinityMultiplier, isEffective, isResisted } = breakdown;

    let armorDamage = 0;
    let remainingHpDamage = finalDamage;

    if (target.armor !== undefined && target.armor > 0 && finalDamage > 0) {
      const crush = attacker.armorCrushFactor ?? 1.0;
      const rawArmorDmg = Math.max(1, Math.round(finalDamage * crush));
      armorDamage = Math.min(target.armor, rawArmorDmg);
      target.armor = Math.max(0, target.armor - rawArmorDmg);

      if (target.armorAbsorbsHp) {
        const overflow = Math.max(0, rawArmorDmg - armorDamage);
        remainingHpDamage = target.armor <= 0 ? Math.min(finalDamage, overflow) : 0;
      }
    }

    let hpDamage = 0;
    if (remainingHpDamage > 0) {
      hpDamage = Math.min(target.hp, remainingHpDamage);
      target.hp = Math.max(0, target.hp - remainingHpDamage);
    }

    const killed = target.hp <= 0;
    if (killed) {
      target.hp = 0;
      target.alive = false;
    }

    target.hitFlashTimer = 0.12;

    const popupX = options.hitX ?? target.x;
    const popupY = (options.hitY ?? target.y) - target.radius - 4;
    const color =
      isEffective || attacker.isWeakPointHit || attacker.isCrit
        ? '#ecc94b'
        : isResisted
          ? '#94a3b8'
          : '#ffffff';

    this.popupPool.spawn({
      x: popupX,
      y: popupY,
      amount: Math.max(hpDamage, armorDamage > 0 ? armorDamage : finalDamage),
      color,
      scale: isEffective || attacker.isWeakPointHit ? 1.18 : 1.0,
      isCrit: Boolean(attacker.isCrit || attacker.isWeakPointHit),
    });

    this.eventBus?.emit('damage:dealt', {
      targetId: target.id,
      amount: finalDamage,
      affinityMultiplier,
      isCrit: Boolean(attacker.isCrit),
      isWeakPoint: Boolean(attacker.isWeakPointHit),
      x: popupX,
      y: popupY,
      source: 'TURRET',
      turret: attacker.turret,
      tags: [...target.tags],
    });

    return {
      ...breakdown,
      hpDamage,
      armorDamage,
      killed,
    };
  }

  public applyDirectDamage(
    target: CombatTarget,
    rawDamage: number,
    options: {
      isCrit?: boolean;
      isWeakPoint?: boolean;
      color?: string;
      hitX?: number;
      hitY?: number;
    } = {}
  ): DamageHitResult {
    if (!target.alive || !Number.isFinite(rawDamage) || rawDamage <= 0) {
      return {
        finalDamage: 0,
        affinityMultiplier: 1.0,
        synergyMultiplier: 1.0,
        weakPointMultiplier: 1.0,
        critMultiplier: 1.0,
        isEffective: false,
        isResisted: false,
        hpDamage: 0,
        armorDamage: 0,
        killed: false,
      };
    }

    const finalDamage = Math.max(1, Math.round(rawDamage));
    const hpDamage = Math.min(target.hp, finalDamage);
    target.hp = Math.max(0, target.hp - finalDamage);
    const killed = target.hp <= 0;
    if (killed) {
      target.hp = 0;
      target.alive = false;
    }

    target.hitFlashTimer = 0.12;

    const popupX = options.hitX ?? target.x;
    const popupY = (options.hitY ?? target.y) - target.radius - 4;
    this.popupPool.spawn({
      x: popupX,
      y: popupY,
      amount: finalDamage,
      color: options.color ?? (options.isCrit ? '#f6ad55' : '#e2e8f0'),
      scale: options.isCrit ? 1.15 : 0.92,
      isCrit: Boolean(options.isCrit),
    });

    this.eventBus?.emit('damage:dealt', {
      targetId: target.id,
      amount: finalDamage,
      affinityMultiplier: 1.0,
      isCrit: Boolean(options.isCrit),
      isWeakPoint: Boolean(options.isWeakPoint),
      x: popupX,
      y: popupY,
      source: 'MERCENARY',
      tags: [...target.tags],
    });

    return {
      finalDamage,
      affinityMultiplier: 1.0,
      synergyMultiplier: 1.0,
      weakPointMultiplier: 1.0,
      critMultiplier: 1.0,
      isEffective: false,
      isResisted: false,
      hpDamage,
      armorDamage: 0,
      killed,
    };
  }

  public update(dt: number): void {
    this.popupPool.update(dt);
  }

  public getPopups(): readonly DamagePopup[] {
    return this.popupPool.getPopups();
  }

  public clearPopups(): void {
    this.popupPool.clear();
  }
}
