import type { GameStoreState, TurretType } from '@/store/types';
import type { GameStateId } from '@/engine/fsm/GameFSM';
import type { EventBus } from '@/engine/EventBus';
import type { ParticlePool } from '@/engine/render/draw/particles';
import type { CameraSystem } from './CameraSystem';
import {
  MANUAL_AIM_LOCK_DURATION_SEC,
  MORTAR_AOE_RADIUS_PX,
  MORTAR_GRAVITY_PX_S2,
  TURRET_CONFIGS,
  TURRET_SWITCH_COOLDOWN_SEC,
  WEAK_POINT_SNAP_RADIUS_PX,
} from '@/game/data/turrets';
import { isExpeditionSynergyActive } from '@/game/formulas';
import { computeRelicCodexBonuses } from '@/game/data/relics';
import {
  WALKER_ANCHOR_X,
  WALKER_GROUND_Y,
  computeTurretMuzzleWorldPos,
  getTurretVisualTier,
} from '@/engine/render/draw/sandwalker';
import type { CombatTarget, DamageSystem } from './DamageSystem';

export interface HeatRayBeamState {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  tier: 1 | 2 | 3;
  barrelCount: 1 | 2 | 3;
  alpha: number;
}

export interface HarpoonProjectile {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  originX: number;
  originY: number;
  targetId?: string;
  tier: 1 | 2 | 3;
  level: number;
  synergyActive: boolean;
  isWeakPointHit: boolean;
  damageBonusMult?: number;
  state: 'FLYING' | 'RETRACTING';
  retractTimer: number;
  retractStartX: number;
  retractStartY: number;
}

export interface MortarShell {
  id: number;
  x0: number;
  y0: number;
  vx: number;
  vy0: number;
  g: number;
  elapsed: number;
  flightDuration: number;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  targetId?: string;
  tier: 1 | 2 | 3;
  level: number;
  synergyActive: boolean;
  isWeakPointHit: boolean;
  damageBonusMult?: number;
}

export interface MortarExplosionEffect {
  x: number;
  y: number;
  radius: number;
  age: number;
  maxLife: number;
  tier: 1 | 2 | 3;
}

export interface ManualAimState {
  isDragging: boolean;
  pointerX: number;
  pointerY: number;
  lockedTargetId: string | null;
  lockRemainingSec: number;
}

export interface TurretRenderSnapshot {
  activeBeam: HeatRayBeamState | null;
  harpoons: readonly HarpoonProjectile[];
  mortars: readonly MortarShell[];
  explosions: readonly MortarExplosionEffect[];
  aimState: ManualAimState;
}

export const OPENING_PREVIEW_TURRET_LEVEL = 30;
export const OPENING_PREVIEW_TURRET_TIER = 3 as const;
export const OPENING_PREVIEW_DURATION_SEC = 30;

export function resolveEffectiveTurretStats(
  turret: TurretType,
  storeState: Pick<GameStoreState, 'sandwalker'>,
  forcePreview: boolean
): { level: number; tier: 1 | 2 | 3; barrelCount: 1 | 2 | 3 } {
  if (forcePreview) {
    return {
      level: OPENING_PREVIEW_TURRET_LEVEL,
      tier: OPENING_PREVIEW_TURRET_TIER,
      barrelCount: OPENING_PREVIEW_TURRET_TIER,
    };
  }
  const level = storeState.sandwalker.turretLevels[turret] ?? 1;
  const explicitTier = storeState.sandwalker.turretTiers[turret] ?? 1;
  const barrelCount = getTurretVisualTier(level, explicitTier);
  return { level, tier: barrelCount, barrelCount };
}

export interface TurretUpdateContext {
  fsmStateId: GameStateId | null;
  storeState: GameStoreState;
  setManualAimTarget?: (targetId: string | null) => void;
  targets: readonly CombatTarget[];
  hullBobY: number;
  forcePreviewAll?: boolean;
  openingElapsedSeconds?: number;
  particlePool?: ParticlePool;
  cameraSystem?: CameraSystem;
}

/**
 * Shortest distance from point (px, py) to line segment (x1, y1)-(x2, y2).
 */
export function pointToSegmentDistance(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq <= 1e-9) {
    return Math.hypot(px - x1, py - y1);
  }
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
  const projX = x1 + t * dx;
  const projY = y1 + t * dy;
  return Math.hypot(px - projX, py - projY);
}

/**
 * Resolves the world-space weak-point coordinates for a combat target.
 */
export function getTargetWeakPointPos(
  target: Pick<CombatTarget, 'x' | 'y' | 'weakPointOffset'>
): { x: number; y: number } {
  return {
    x: target.x + (target.weakPointOffset?.x ?? 0),
    y: target.y + (target.weakPointOffset?.y ?? 0),
  };
}

/**
 * Finds the best alive target whose weak point lies within `snapRadiusPx` (default 40px).
 * Boss/explicit weak points (`isWeakPoint === true || snapPriority === true`) take priority over regular bodies.
 */
export function findSnapTarget(
  pointerX: number,
  pointerY: number,
  targets: readonly CombatTarget[],
  snapRadiusPx = WEAK_POINT_SNAP_RADIUS_PX
): CombatTarget | null {
  if (!Number.isFinite(pointerX) || !Number.isFinite(pointerY)) return null;

  let bestWeakPoint: CombatTarget | null = null;
  let bestWeakDist = Infinity;
  let bestRegular: CombatTarget | null = null;
  let bestRegularDist = Infinity;

  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    if (!t.alive) continue;
    const wp = getTargetWeakPointPos(t);
    const dist = Math.hypot(wp.x - pointerX, wp.y - pointerY);
    if (dist > snapRadiusPx) continue;

    if (t.isWeakPoint || t.snapPriority) {
      if (dist < bestWeakDist) {
        bestWeakDist = dist;
        bestWeakPoint = t;
      }
    } else if (dist < bestRegularDist) {
      bestRegularDist = dist;
      bestRegular = t;
    }
  }

  return bestWeakPoint ?? bestRegular;
}

/**
 * Evaluates parabolic trajectory y(t) = y0 + vy0*t + 0.5*g*t^2 at time t.
 */
export function computeParabolicShellPosition(
  shell: Pick<MortarShell, 'x0' | 'y0' | 'vx' | 'vy0' | 'g'>,
  t: number
): { x: number; y: number } {
  return {
    x: shell.x0 + shell.vx * t,
    y: shell.y0 + shell.vy0 * t + 0.5 * shell.g * t * t,
  };
}

export class TurretSystem {
  private readonly damageSystem: DamageSystem;
  private readonly eventBus?: EventBus;

  private switchCooldownRemaining = 0;
  private fireTimer = 0;
  private aimAngle = 0;
  private recoilPx = 0;
  private nextProjectileId = 1;

  private activeBeam: HeatRayBeamState | null = null;
  private beamFadeTimer = 0;
  private harpoons: HarpoonProjectile[] = [];
  private mortars: MortarShell[] = [];
  private explosions: MortarExplosionEffect[] = [];

  private isDragging = false;
  private pointerX = 0;
  private pointerY = 0;
  private lockedTargetId: string | null = null;
  private lockRemainingSec = 0;

  constructor(damageSystem: DamageSystem, eventBus?: EventBus) {
    this.damageSystem = damageSystem;
    this.eventBus = eventBus;
  }

  public getSwitchCooldownRemaining(): number {
    return this.switchCooldownRemaining;
  }

  public getSwitchCooldownRatio(): number {
    return Math.min(1, Math.max(0, this.switchCooldownRemaining / TURRET_SWITCH_COOLDOWN_SEC));
  }

  public getAimAngle(): number {
    return this.aimAngle;
  }

  public getRecoilPx(): number {
    return this.recoilPx;
  }

  public getManualAimTargetId(): string | null {
    return this.lockedTargetId;
  }

  public getLockRemainingSec(): number {
    return this.lockRemainingSec;
  }

  public getRenderState(): TurretRenderSnapshot {
    return {
      activeBeam: this.activeBeam,
      harpoons: this.harpoons,
      mortars: this.mortars,
      explosions: this.explosions,
      aimState: {
        isDragging: this.isDragging,
        pointerX: this.pointerX,
        pointerY: this.pointerY,
        lockedTargetId: this.lockedTargetId,
        lockRemainingSec: this.lockRemainingSec,
      },
    };
  }

  /**
   * Requests an immediate turret switch if 0.3s switch cooldown has elapsed.
   */
  public requestSwitch(
    nextTurret: TurretType,
    store: {
      sandwalker: { activeTurret: TurretType };
      switchTurret: (turret: TurretType) => void;
    }
  ): boolean {
    if (nextTurret !== 'HEAT_RAY' && nextTurret !== 'HARPOON' && nextTurret !== 'MORTAR') {
      return false;
    }
    if (nextTurret === store.sandwalker.activeTurret) {
      return false;
    }
    if (this.switchCooldownRemaining > 0) {
      return false;
    }

    store.switchTurret(nextTurret);
    this.switchCooldownRemaining = TURRET_SWITCH_COOLDOWN_SEC;
    this.activeBeam = null;
    this.beamFadeTimer = 0;
    this.fireTimer = 0;
    this.aimAngle = nextTurret === 'MORTAR' ? -0.52 : 0;
    return true;
  }

  public clearManualLock(
    setManualAimTarget?: (targetId: string | null) => void
  ): void {
    this.isDragging = false;
    if (this.lockedTargetId !== null) {
      const prev = this.lockedTargetId;
      this.lockedTargetId = null;
      this.lockRemainingSec = 0;
      setManualAimTarget?.(null);
      this.eventBus?.emit('aim:unlock', { previousTargetId: prev });
    }
  }

  public clearProjectilesAndLock(
    setManualAimTarget?: (targetId: string | null) => void
  ): void {
    this.activeBeam = null;
    this.beamFadeTimer = 0;
    this.harpoons.length = 0;
    this.mortars.length = 0;
    this.explosions.length = 0;
    this.fireTimer = 0;
    this.clearManualLock(setManualAimTarget);
  }

  public onBossEncounterStart(): void {
    this.activeBeam = null;
    this.beamFadeTimer = 0;
    this.harpoons.length = 0;
    this.mortars.length = 0;
    this.explosions.length = 0;
    this.fireTimer = -0.45;
  }

  public onPointerDown(
    x: number,
    y: number,
    targets: readonly CombatTarget[],
    setManualAimTarget?: (targetId: string | null) => void
  ): CombatTarget | null {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    this.isDragging = true;
    this.pointerX = x;
    this.pointerY = y;
    return this.trySnapAt(x, y, targets, setManualAimTarget);
  }

  public onPointerMove(
    x: number,
    y: number,
    targets: readonly CombatTarget[],
    setManualAimTarget?: (targetId: string | null) => void
  ): CombatTarget | null {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    if (!this.isDragging) return null;
    this.pointerX = x;
    this.pointerY = y;
    return this.trySnapAt(x, y, targets, setManualAimTarget);
  }

  public onPointerUp(): void {
    this.isDragging = false;
    if (this.lockedTargetId !== null) {
      this.lockRemainingSec = MANUAL_AIM_LOCK_DURATION_SEC;
    }
  }

  private trySnapAt(
    x: number,
    y: number,
    targets: readonly CombatTarget[],
    setManualAimTarget?: (targetId: string | null) => void
  ): CombatTarget | null {
    const snapped = findSnapTarget(x, y, targets, WEAK_POINT_SNAP_RADIUS_PX);
    if (!snapped) return null;

    const changed = this.lockedTargetId !== snapped.id;
    this.lockedTargetId = snapped.id;
    this.lockRemainingSec = MANUAL_AIM_LOCK_DURATION_SEC;
    if (changed) {
      setManualAimTarget?.(snapped.id);
    }
    const wp = getTargetWeakPointPos(snapped);
    this.eventBus?.emit('aim:lock', { targetId: snapped.id, x: wp.x, y: wp.y });
    return snapped;
  }

  public selectTarget(
    targets: readonly CombatTarget[],
    storeManualTargetId: string | null
  ): { target: CombatTarget | null; isManualLocked: boolean } {
    const manualId = this.lockedTargetId ?? storeManualTargetId;
    if (manualId) {
      const locked = targets.find((t) => t.id === manualId && t.alive);
      if (locked) {
        return { target: locked, isManualLocked: true };
      }
    }

    let nearest: CombatTarget | null = null;
    let nearestScore = Infinity;

    for (let i = 0; i < targets.length; i++) {
      const t = targets[i];
      if (!t.alive) continue;
      if (!t.snapPriority && t.x > 670) continue;
      // Prefer targets ahead of the walker; fallback to any target if behind
      const forwardPenalty = t.x < WALKER_ANCHOR_X - 24 ? 1000 : 0;
      const dist = Math.hypot(t.x - (WALKER_ANCHOR_X + 4), t.y - (WALKER_GROUND_Y - 88));
      const score = forwardPenalty + dist;
      if (score < nearestScore) {
        nearestScore = score;
        nearest = t;
      }
    }

    return { target: nearest, isManualLocked: false };
  }

  public update(dt: number, ctx: TurretUpdateContext): void {
    const safeDt = Number.isFinite(dt) && dt > 0 ? dt : 0;
    if (safeDt <= 0) return;

    // 1. Decay timers & recoil
    if (this.switchCooldownRemaining > 0) {
      this.switchCooldownRemaining = Math.max(0, this.switchCooldownRemaining - safeDt);
    }
    if (this.recoilPx > 0) {
      this.recoilPx = Math.max(0, this.recoilPx - 30 * safeDt);
    }
    if (this.beamFadeTimer > 0) {
      this.beamFadeTimer = Math.max(0, this.beamFadeTimer - safeDt);
      if (this.activeBeam) {
        this.activeBeam.alpha = Math.min(1, this.beamFadeTimer / 0.12);
      }
      if (this.beamFadeTimer <= 0) {
        this.activeBeam = null;
      }
    }

    // Update explosion shockwave rings
    for (let i = this.explosions.length - 1; i >= 0; i--) {
      const exp = this.explosions[i];
      exp.age += safeDt;
      if (exp.age >= exp.maxLife) {
        this.explosions.splice(i, 1);
      }
    }

    // 2. Manual lock validity & 2.0s post-release countdown
    if (this.lockedTargetId !== null) {
      const lockedAlive = ctx.targets.some(
        (t) => t.id === this.lockedTargetId && t.alive
      );
      if (!lockedAlive) {
        const prev = this.lockedTargetId;
        this.lockedTargetId = null;
        this.lockRemainingSec = 0;
        ctx.setManualAimTarget?.(null);
        this.eventBus?.emit('aim:unlock', { previousTargetId: prev });
      } else if (!this.isDragging) {
        this.lockRemainingSec = Math.max(0, this.lockRemainingSec - safeDt);
        if (this.lockRemainingSec <= 0) {
          const prev = this.lockedTargetId;
          this.lockedTargetId = null;
          ctx.setManualAimTarget?.(null);
          this.eventBus?.emit('aim:unlock', { previousTargetId: prev });
        }
      }
    }

    const activeTurret = ctx.storeState.sandwalker.activeTurret;
    const config = TURRET_CONFIGS[activeTurret];
    const previewActive =
      Boolean(ctx.forcePreviewAll) ||
      (ctx.fsmStateId === 'OPENING_HOOK' &&
        ctx.openingElapsedSeconds !== undefined &&
        Number.isFinite(ctx.openingElapsedSeconds) &&
        ctx.openingElapsedSeconds >= 0 &&
        ctx.openingElapsedSeconds < OPENING_PREVIEW_DURATION_SEC);
    const { level, barrelCount } = resolveEffectiveTurretStats(
      activeTurret,
      ctx.storeState,
      previewActive
    );

    const isCombatAllowed =
      ctx.fsmStateId === 'MARCH_NORMAL' ||
      ctx.fsmStateId === 'HAZARD_ZONE' ||
      ctx.fsmStateId === 'BOSS_ENCOUNTER' ||
      ctx.fsmStateId === 'OPENING_HOOK';

    // Always advance already in-flight harpoons & mortar shells unless EMERGENCY_REVIVE paused
    const isPaused = ctx.fsmStateId === 'EMERGENCY_REVIVE';
    if (!isPaused) {
      const preMuzzle = computeTurretMuzzleWorldPos({
        hullBobY: ctx.hullBobY,
        turret: activeTurret,
        barrelCount,
        aimAngle: this.aimAngle,
        recoilPx: this.recoilPx,
      });
      this.updateHarpoons(safeDt, preMuzzle.x, preMuzzle.y, ctx);
      this.updateMortars(safeDt, ctx);
    }

    if (!isCombatAllowed || ctx.storeState.sandwalker.currentHp <= 0) {
      return;
    }

    // 3. Target acquisition & turret aiming
    const { target, isManualLocked } = this.selectTarget(
      ctx.targets,
      ctx.storeState.sandwalker.manualAimTargetId
    );

    if (!target) {
      // Pre-charge up to ready interval while idle so turret fires cleanly on enemy entry
      this.fireTimer = Math.min(config.fireIntervalSec, this.fireTimer + safeDt);
      const restAngle = activeTurret === 'MORTAR' ? -0.52 : 0;
      this.aimAngle += (restAngle - this.aimAngle) * Math.min(1, safeDt * 10);
      return;
    }

    const aimTargetPos = isManualLocked
      ? getTargetWeakPointPos(target)
      : { x: target.x, y: target.y };

    const pivotX = WALKER_ANCHOR_X + 4;
    const tierScale = 1 + (barrelCount - 1) * 0.1;
    const pivotY = WALKER_GROUND_Y - 88 + ctx.hullBobY - 8 * tierScale;

    if (activeTurret === 'MORTAR') {
      this.aimAngle = -0.52 + Math.atan2(aimTargetPos.y - pivotY, Math.max(40, aimTargetPos.x - pivotX)) * 0.25;
    } else {
      this.aimAngle = Math.atan2(aimTargetPos.y - pivotY, aimTargetPos.x - pivotX);
    }

    // 4. Fire cycle accumulation
    const synergyActive = previewActive || isExpeditionSynergyActive(ctx.storeState.mercenaries);
    this.fireTimer += safeDt;

    while (this.fireTimer >= config.fireIntervalSec) {
      this.fireTimer -= config.fireIntervalSec;

      const currentSelection = this.selectTarget(
        ctx.targets,
        ctx.storeState.sandwalker.manualAimTargetId
      );
      if (!currentSelection.target) break;

      const muzzle = computeTurretMuzzleWorldPos({
        hullBobY: ctx.hullBobY,
        turret: activeTurret,
        barrelCount,
        aimAngle: this.aimAngle,
        recoilPx: this.recoilPx,
      });

      this.fireTurret(
        activeTurret,
        level,
        barrelCount,
        synergyActive,
        muzzle.x,
        muzzle.y,
        currentSelection.target,
        currentSelection.isManualLocked,
        ctx
      );
    }
  }

  private fireTurret(
    turret: TurretType,
    level: number,
    barrelCount: 1 | 2 | 3,
    synergyActive: boolean,
    muzzleX: number,
    muzzleY: number,
    target: CombatTarget,
    isManualLocked: boolean,
    ctx: TurretUpdateContext
  ): void {
    const config = TURRET_CONFIGS[turret];
    this.recoilPx = config.recoilKickPx;
    const codexBonuses = computeRelicCodexBonuses(
      ctx.storeState.relics.codex,
      ctx.storeState.explorerPassives
    );
    const damageBonusMult = 1 + codexBonuses.turretDamagePct;

    const aimPos = isManualLocked
      ? getTargetWeakPointPos(target)
      : { x: target.x, y: target.y };
    const isWeakPointHit = isManualLocked;

    this.eventBus?.emit('turret:fire', {
      turret,
      targetId: target.id,
      angle: this.aimAngle,
    });

    if (turret === 'HEAT_RAY') {
      const rayAngle = Math.atan2(aimPos.y - muzzleY, aimPos.x - muzzleX);
      const x2 = muzzleX + Math.cos(rayAngle) * config.rangePx;
      const y2 = muzzleY + Math.sin(rayAngle) * config.rangePx;

      this.activeBeam = {
        x1: muzzleX,
        y1: muzzleY,
        x2,
        y2,
        tier: barrelCount,
        barrelCount,
        alpha: 1.0,
      };
      this.beamFadeTimer = 0.14;

      const beamHalfWidth = 4 + (barrelCount - 1) * 2;
      for (let i = 0; i < ctx.targets.length; i++) {
        const t = ctx.targets[i];
        if (!t.alive) continue;
        const bodyDist = pointToSegmentDistance(t.x, t.y, muzzleX, muzzleY, x2, y2);
        let hits = bodyDist <= t.radius + beamHalfWidth;
        if (!hits && isManualLocked && t.id === target.id) {
          const wp = getTargetWeakPointPos(t);
          const wpDist = pointToSegmentDistance(wp.x, wp.y, muzzleX, muzzleY, x2, y2);
          hits = wpDist <= t.radius + beamHalfWidth;
        }
        if (hits) {
          const tWeak = isManualLocked && t.id === target.id;
          this.damageSystem.applyTurretHit(t, {
            turret: 'HEAT_RAY',
            level,
            baseDamage: config.baseDamagePerHit * damageBonusMult,
            synergyActive,
            isWeakPointHit: tWeak,
            armorCrushFactor: config.armorCrushFactor,
          });
          ctx.particlePool?.spawn({
            kind: 'SPARK',
            x: t.x,
            y: t.y,
            vx: -40 + (Math.random() - 0.5) * 40,
            vy: -30 + (Math.random() - 0.5) * 30,
            gravity: 60,
            size: 2.2,
            endSize: 0.6,
            maxLife: 0.2,
            startAlpha: 0.9,
            color: '#fb923c',
          });
        }
      }
      return;
    }

    if (turret === 'HARPOON') {
      const dx = aimPos.x - muzzleX;
      const dy = aimPos.y - muzzleY;
      const len = Math.max(1e-3, Math.hypot(dx, dy));
      const speed = config.projectileSpeedPx;
      this.harpoons.push({
        id: this.nextProjectileId++,
        x: muzzleX,
        y: muzzleY,
        vx: (dx / len) * speed,
        vy: (dy / len) * speed,
        originX: muzzleX,
        originY: muzzleY,
        targetId: isManualLocked ? target.id : undefined,
        tier: barrelCount,
        level,
        synergyActive,
        isWeakPointHit,
        damageBonusMult,
        state: 'FLYING',
        retractTimer: 0,
        retractStartX: muzzleX,
        retractStartY: muzzleY,
      });
      return;
    }

    // MORTAR parabolic shell: y = y0 + vy0*t + 0.5*g*t^2
    const targetX = aimPos.x;
    const targetY = aimPos.y;
    const dist = Math.hypot(targetX - muzzleX, targetY - muzzleY);
    const flightDuration = Math.min(0.9, Math.max(0.55, 0.55 + dist / 450));
    const g = MORTAR_GRAVITY_PX_S2;
    const vx = (targetX - muzzleX) / flightDuration;
    const vy0 =
      (targetY - muzzleY - 0.5 * g * flightDuration * flightDuration) / flightDuration;

    this.mortars.push({
      id: this.nextProjectileId++,
      x0: muzzleX,
      y0: muzzleY,
      vx,
      vy0,
      g,
      elapsed: 0,
      flightDuration,
      x: muzzleX,
      y: muzzleY,
      targetX,
      targetY,
      targetId: isManualLocked ? target.id : undefined,
      tier: barrelCount,
      level,
      synergyActive,
      isWeakPointHit,
      damageBonusMult,
    });
  }

  private updateHarpoons(
    dt: number,
    muzzleX: number,
    muzzleY: number,
    ctx: TurretUpdateContext
  ): void {
    const config = TURRET_CONFIGS.HARPOON;

    for (let i = this.harpoons.length - 1; i >= 0; i--) {
      const h = this.harpoons[i];
      h.originX = muzzleX;
      h.originY = muzzleY;

      if (h.state === 'RETRACTING') {
        h.retractTimer -= dt;
        const progress = 1 - Math.max(0, h.retractTimer) / 0.12;
        h.x = h.retractStartX + (muzzleX - h.retractStartX) * progress;
        h.y = h.retractStartY + (muzzleY - h.retractStartY) * progress;
        if (h.retractTimer <= 0) {
          this.harpoons.splice(i, 1);
        }
        continue;
      }

      const prevX = h.x;
      const prevY = h.y;
      const nextX = prevX + h.vx * dt;
      const nextY = prevY + h.vy * dt;

      let hitTarget: CombatTarget | null = null;
      let hitProjDist = Infinity;

      for (let j = 0; j < ctx.targets.length; j++) {
        const t = ctx.targets[j];
        if (!t.alive) continue;
        const bodyDist = pointToSegmentDistance(t.x, t.y, prevX, prevY, nextX, nextY);
        let hits = bodyDist <= t.radius + 4;
        if (!hits && h.targetId !== undefined && t.id === h.targetId) {
          const wp = getTargetWeakPointPos(t);
          const wpDist = pointToSegmentDistance(wp.x, wp.y, prevX, prevY, nextX, nextY);
          hits = wpDist <= t.radius + 4;
        }
        if (hits) {
          const along = Math.hypot(t.x - prevX, t.y - prevY);
          if (along < hitProjDist) {
            hitProjDist = along;
            hitTarget = t;
          }
        }
      }

      if (hitTarget) {
        this.damageSystem.applyTurretHit(hitTarget, {
          turret: 'HARPOON',
          level: h.level,
          baseDamage: config.baseDamagePerHit * (h.damageBonusMult ?? 1),
          synergyActive: h.synergyActive,
          isWeakPointHit: h.isWeakPointHit && hitTarget.id === h.targetId,
          armorCrushFactor: config.armorCrushFactor,
        });

        if (!hitTarget.knockbackImmune) {
          hitTarget.x = Math.min(715, hitTarget.x + 12);
          hitTarget.knockbackVx = Math.max(hitTarget.knockbackVx ?? 0, 220);
        }

        for (let s = 0; s < 5; s++) {
          ctx.particlePool?.spawn({
            kind: 'SPARK',
            x: hitTarget.x,
            y: hitTarget.y,
            vx: 50 + (Math.random() - 0.5) * 90,
            vy: -45 + (Math.random() - 0.5) * 70,
            gravity: 140,
            size: 2.5,
            endSize: 0.8,
            maxLife: 0.25,
            startAlpha: 0.95,
            color: '#90cdf4',
          });
        }

        h.state = 'RETRACTING';
        h.retractTimer = 0.12;
        h.retractStartX = hitTarget.x;
        h.retractStartY = hitTarget.y;
        h.x = hitTarget.x;
        h.y = hitTarget.y;
        continue;
      }

      h.x = nextX;
      h.y = nextY;

      if (h.x > 730 || h.x < -40 || h.y < -40 || h.y > 450) {
        this.harpoons.splice(i, 1);
      }
    }
  }

  private updateMortars(dt: number, ctx: TurretUpdateContext): void {
    const config = TURRET_CONFIGS.MORTAR;

    for (let i = this.mortars.length - 1; i >= 0; i--) {
      const m = this.mortars[i];
      m.elapsed += dt;

      if (m.elapsed < m.flightDuration) {
        const pos = computeParabolicShellPosition(m, m.elapsed);
        m.x = pos.x;
        m.y = pos.y;
        continue;
      }

      // Impact at (targetX, targetY)
      const impactX = m.targetX;
      const impactY = m.targetY;
      const aoeRadius = MORTAR_AOE_RADIUS_PX;

      for (let j = 0; j < ctx.targets.length; j++) {
        const t = ctx.targets[j];
        if (!t.alive) continue;
        const dist = Math.hypot(t.x - impactX, t.y - impactY);
        if (dist <= aoeRadius + t.radius) {
          this.damageSystem.applyTurretHit(t, {
            turret: 'MORTAR',
            level: m.level,
            baseDamage: config.baseDamagePerHit * (m.damageBonusMult ?? 1),
            synergyActive: m.synergyActive,
            isWeakPointHit: m.isWeakPointHit && t.id === m.targetId,
            armorCrushFactor: config.armorCrushFactor,
          });
        }
      }

      this.explosions.push({
        x: impactX,
        y: impactY,
        radius: aoeRadius * (1 + (m.tier - 1) * 0.12),
        age: 0,
        maxLife: 0.35,
        tier: m.tier,
      });

      if (ctx.particlePool) {
        for (let s = 0; s < 8; s++) {
          const angle = (s / 8) * Math.PI * 2;
          ctx.particlePool.spawn({
            kind: 'SPARK',
            x: impactX,
            y: impactY,
            vx: Math.cos(angle) * (85 + Math.random() * 60),
            vy: Math.sin(angle) * (70 + Math.random() * 50) - 35,
            gravity: 220,
            size: 2.8,
            endSize: 0.9,
            maxLife: 0.3,
            startAlpha: 0.95,
            color: s % 2 === 0 ? '#f97316' : '#fef08a',
          });
        }
        for (let d = 0; d < 6; d++) {
          ctx.particlePool.spawn({
            kind: 'SAND_DUST',
            x: impactX + (Math.random() - 0.5) * 26,
            y: impactY + (Math.random() - 0.5) * 12,
            vx: (Math.random() - 0.5) * 60,
            vy: -25 - Math.random() * 35,
            gravity: 35,
            size: 5,
            endSize: 12,
            maxLife: 0.45,
            startAlpha: 0.65,
            color: '#d69e66',
          });
        }
      }

      ctx.cameraSystem?.shake(2.5, 0.16);
      this.mortars.splice(i, 1);
    }
  }
}
