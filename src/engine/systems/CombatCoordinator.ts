import type { EnemyArchetypeTag, GameStoreState, TurretType } from '@/store/types';
import type { GameStateId } from '@/engine/fsm/GameFSM';
import type { EventBus } from '@/engine/EventBus';
import type { ParticlePool } from '@/engine/render/draw/particles';
import {
  WALKER_ANCHOR_X,
  WALKER_GROUND_Y,
  type SandwalkerRig,
} from '@/engine/render/draw/sandwalker';
import type { RouteSnapshot } from './RouteSystem';
import type { CameraSystem } from './CameraSystem';
import { DamageSystem, type CombatTarget } from './DamageSystem';
import { TurretSystem } from './TurretSystem';
import { MercenarySystem } from './MercenarySystem';
import { SpawnSystem } from './SpawnSystem';
import { BossSystem, type BossDebugSnapshot } from './BossSystem';
import { evasionCooldown, isExpeditionSynergyActive } from '@/game/formulas';
import {
  drawPixelDamagePopups,
  drawPixelHarpoons,
  drawPixelHeatRayBeam,
  drawPixelMortarsAndExplosions,
  drawPixelWeakPointReticle,
} from '@/engine/render/pixel/sprites/worldSprites';
import { drawPixelMercenaries } from '@/engine/render/pixel/sprites/caravanSprites';
import { drawPixelEnemies } from '@/engine/render/pixel/sprites/enemySprites';
import { drawPixelBoss } from '@/engine/render/pixel/sprites/bossSprites';

export const DODGE_BOOST_DURATION_SEC = 1.5;
export const DODGE_BOOST_SPEED_MULTIPLIER = 1.6;
export const TACTICAL_SHIELD_FRACTION = 0.2;
export const TACTICAL_SHIELD_COOLDOWN_SEC = 12.0;

export interface CombatStoreSink {
  applyDamage: (amount: number) => { shieldAbsorbed: number; hpDamage: number; isDestroyed: boolean };
  repairHp: (amount: number) => void;
  setSolarShield: (amount: number) => void;
  addCurrencies: (delta: { sunGold?: number; ancientGear?: number; templeKeys?: number }) => void;
  switchTurret: (turret: TurretType) => void;
  setManualAimTarget: (targetId: string | null) => void;
}

export interface AimReticleOverlayState {
  visible: boolean;
  x: number;
  y: number;
  locked: boolean;
  lockRemainingSec: number;
}

export interface CombatDamageEventSnapshot {
  source: string;
  turret?: TurretType;
  tags: EnemyArchetypeTag[];
  multiplier: number;
  damage: number;
  timestamp: number;
}

export interface CombatDebugSnapshot {
  fsmStateId: GameStateId | null;
  activeTurret: TurretType;
  switchCooldownRemaining: number;
  lockedTargetId: string | null;
  lockRemainingSec: number;
  synergyActive: boolean;
  activeMercenaries: string[];
  enemyCount: number;
  enemies: Array<{
    id: string;
    archetypeId: string;
    tags: string[];
    x: number;
    y: number;
    hp: number;
    maxHp: number;
    armor: number;
    weakPointOffset: { x: number; y: number };
  }>;
  activeProjectiles: {
    hasBeam: boolean;
    harpoons: number;
    mortars: number;
    explosions: number;
  };
  actualSpeed: number;
  isQuicksandSlowed: boolean;
  isQuicksandBypassed: boolean;
  isSandstorm: boolean;
  isSandstormVisionMasked: boolean;
  relayTowerVisible: boolean;
  boss: BossDebugSnapshot | null;
  particleCount: number;
  recentDamageEvents: CombatDamageEventSnapshot[];
}

export class CombatCoordinator {
  public readonly damageSystem: DamageSystem;
  public readonly turretSystem: TurretSystem;
  public readonly mercenarySystem: MercenarySystem;
  public readonly spawnSystem: SpawnSystem;
  public readonly bossSystem: BossSystem;

  private readonly eventBus?: EventBus;
  private readonly unsubStateChange?: () => void;
  private readonly unsubDamageDealt?: () => void;

  private elapsedSec = 0;
  private storeBatchTimer = 0;
  private pendingGold = 0;
  private pendingHeal = 0;
  private pendingHullDamage = 0;
  private pendingShieldGrants = 0;
  private pendingClearManualAim = false;
  private lastForcePreviewAll = false;
  private dodgeActiveRemaining = 0;
  private dodgeCooldownRemaining = 0;
  private dodgeCooldownTotal = 0;
  private dodgeBurstPending = false;
  private solarShieldCooldownRemaining = 0;
  private readonly solarShieldCooldownTotal = TACTICAL_SHIELD_COOLDOWN_SEC;
  private extraTargets: readonly CombatTarget[] = [];
  private lastParticleCount = 0;
  private recentDamageEvents: CombatDamageEventSnapshot[] = [];

  constructor(options: { eventBus?: EventBus; rng?: () => number; bossSystem?: BossSystem } = {}) {
    this.eventBus = options.eventBus;
    this.damageSystem = new DamageSystem({ eventBus: options.eventBus });
    this.turretSystem = new TurretSystem(this.damageSystem, options.eventBus);
    this.mercenarySystem = new MercenarySystem({
      rng: options.rng,
      damageSystem: this.damageSystem,
      eventBus: options.eventBus,
    });
    this.spawnSystem = new SpawnSystem({
      rng: options.rng,
      eventBus: options.eventBus,
    });
    this.bossSystem = options.bossSystem ?? new BossSystem({ eventBus: options.eventBus });

    if (this.eventBus) {
      this.unsubStateChange = this.eventBus.on('state:change', ({ to }) => {
        if (to === 'BOSS_ENCOUNTER') {
          this.spawnSystem.retreatAll();
          this.turretSystem.onBossEncounterStart();
          this.mercenarySystem.resetVisuals();
          if (this.bossSystem.isActive()) {
            this.setExtraTargets(this.bossSystem.getCombatTargets());
          }
        } else if (to === 'EMERGENCY_REVIVE') {
          this.turretSystem.clearManualLock();
          this.pendingHeal = 0;
          this.pendingHullDamage = 0;
          this.pendingShieldGrants = 0;
          this.pendingClearManualAim = true;
        } else if (to === 'OASIS_HUB' || to === 'OASIS_SETTLEMENT') {
          this.spawnSystem.clear();
          this.bossSystem.clear();
          this.extraTargets = [];
          this.turretSystem.clearProjectilesAndLock();
          this.mercenarySystem.resetVisuals();
          this.damageSystem.clearPopups();
          if (to === 'OASIS_HUB') {
            this.pendingGold = 0;
          }
          this.pendingHeal = 0;
          this.pendingHullDamage = 0;
          this.pendingShieldGrants = 0;
          this.pendingClearManualAim = true;
          this.lastForcePreviewAll = false;
          this.dodgeActiveRemaining = 0;
          this.dodgeCooldownRemaining = 0;
          this.dodgeCooldownTotal = 0;
          this.dodgeBurstPending = false;
          this.solarShieldCooldownRemaining = 0;
        }
      });

      this.unsubDamageDealt = this.eventBus.on('damage:dealt', (ev) => {
        this.recentDamageEvents.push({
          source: ev.source ?? 'TURRET',
          turret: ev.turret,
          tags: ev.tags ? [...ev.tags] : [],
          multiplier: ev.affinityMultiplier,
          damage: ev.amount,
          timestamp: this.elapsedSec,
        });
        if (this.recentDamageEvents.length > 60) {
          this.recentDamageEvents.shift();
        }
      });
    }
  }

  public dispose(): void {
    this.unsubStateChange?.();
    this.unsubDamageDealt?.();
  }

  public setExtraTargets(targets: readonly CombatTarget[]): void {
    this.extraTargets = targets;
  }

  public getAllTargets(): readonly CombatTarget[] {
    const waveEnemies = this.spawnSystem.getEnemies();
    if (this.extraTargets.length === 0) {
      return waveEnemies;
    }
    return [...waveEnemies, ...this.extraTargets];
  }

  public requestTurretSwitch(
    nextTurret: TurretType,
    store: Pick<GameStoreState, 'sandwalker'> & Pick<CombatStoreSink, 'switchTurret'>
  ): boolean {
    return this.turretSystem.requestSwitch(nextTurret, store);
  }

  public onAimPointerDown(
    x: number,
    y: number,
    setManualAimTarget?: (targetId: string | null) => void
  ): CombatTarget | null {
    const snapped = this.turretSystem.onPointerDown(x, y, this.getAllTargets(), setManualAimTarget);
    if (snapped) {
      this.pendingClearManualAim = false;
    }
    return snapped;
  }

  public onAimPointerMove(
    x: number,
    y: number,
    setManualAimTarget?: (targetId: string | null) => void
  ): CombatTarget | null {
    const snapped = this.turretSystem.onPointerMove(x, y, this.getAllTargets(), setManualAimTarget);
    if (snapped) {
      this.pendingClearManualAim = false;
    }
    return snapped;
  }

  public onAimPointerUp(): void {
    this.turretSystem.onPointerUp();
  }

  public getTurretAimAngle(): number {
    return this.turretSystem.getAimAngle();
  }

  public getTurretRecoilPx(): number {
    return this.turretSystem.getRecoilPx();
  }

  public getSwitchCooldownRemaining(): number {
    return this.turretSystem.getSwitchCooldownRemaining();
  }

  public getSwitchCooldownRatio(): number {
    return this.turretSystem.getSwitchCooldownRatio();
  }

  public grantSolarShield(amount: number): void {
    if (!Number.isFinite(amount) || amount <= 0) return;
    this.pendingShieldGrants += amount;
  }

  public isDodgeActive(): boolean {
    return this.dodgeActiveRemaining > 0;
  }

  public getRouteSpeedMultiplier(): number {
    return this.isDodgeActive() ? DODGE_BOOST_SPEED_MULTIPLIER : 1.0;
  }

  public getDodgeState(): {
    active: boolean;
    activeRemainingSec: number;
    cooldownRemainingSec: number;
    cooldownTotalSec: number;
    cooldownRatio: number;
  } {
    const cooldownRatio =
      this.dodgeCooldownTotal > 0
        ? Math.min(1, Math.max(0, this.dodgeCooldownRemaining / this.dodgeCooldownTotal))
        : 0;
    return {
      active: this.dodgeActiveRemaining > 0,
      activeRemainingSec: this.dodgeActiveRemaining,
      cooldownRemainingSec: this.dodgeCooldownRemaining,
      cooldownTotalSec: this.dodgeCooldownTotal,
      cooldownRatio,
    };
  }

  public getSolarShieldCooldownState(): {
    cooldownRemainingSec: number;
    cooldownTotalSec: number;
    cooldownRatio: number;
  } {
    const cooldownRatio =
      this.solarShieldCooldownTotal > 0
        ? Math.min(
            1,
            Math.max(0, this.solarShieldCooldownRemaining / this.solarShieldCooldownTotal)
          )
        : 0;
    return {
      cooldownRemainingSec: this.solarShieldCooldownRemaining,
      cooldownTotalSec: this.solarShieldCooldownTotal,
      cooldownRatio,
    };
  }

  /**
   * Opening Hook Phase 1 Overload AOE skill: deals massive Lv30 solar burst to active enemies
   * and emits explosion particles on Zone B canvas.
   */
  public triggerOverloadSkill(
    particlePool?: ParticlePool,
    cameraSystem?: CameraSystem
  ): number {
    const targets = this.getAllTargets().filter((t) => t.alive);
    let hitCount = 0;

    for (const target of targets) {
      const res = this.damageSystem.applyDirectDamage(target, 280);
      if (res.finalDamage > 0) {
        hitCount += 1;
      }
      if (particlePool) {
        for (let k = 0; k < 5; k++) {
          const angle = (k / 5) * Math.PI * 2;
          particlePool.spawn({
            kind: 'SPARK',
            x: target.x,
            y: target.y,
            vx: Math.cos(angle) * 110,
            vy: Math.sin(angle) * 90 - 25,
            gravity: 110,
            size: 3.4,
            endSize: 0.8,
            maxLife: 0.45,
            startAlpha: 1.0,
            color: k % 2 === 0 ? '#fef08a' : '#f56565',
          });
        }
      }
    }

    if (particlePool) {
      for (let i = 0; i < 14; i++) {
        const angle = (i / 14) * Math.PI * 2;
        particlePool.spawn({
          kind: i % 3 === 0 ? 'SAND_DUST' : 'SPARK',
          x: 340,
          y: 268,
          vx: Math.cos(angle) * (80 + i * 8),
          vy: Math.sin(angle) * (70 + i * 6) - 20,
          gravity: 80,
          size: 4.0,
          endSize: 1.0,
          maxLife: 0.55,
          startAlpha: 0.95,
          color: i % 2 === 0 ? '#f6ad55' : '#fef08a',
        });
      }
      this.lastParticleCount = particlePool.getActiveCount();
    }

    cameraSystem?.shake(7, 0.35);

    this.eventBus?.emit('damage:dealt', {
      source: 'TURRET',
      turret: 'HEAT_RAY',
      targetId: targets[0]?.id ?? 'overload_aoe',
      amount: 280,
      tags: ['SMALL_SWARM'],
      affinityMultiplier: 1.0,
      isCrit: true,
      isWeakPoint: false,
      x: targets[0]?.x ?? 340,
      y: targets[0]?.y ?? 268,
    });

    return hitCount;
  }

  public activateDodgeBoost(
    storeState: Pick<GameStoreState, 'sandwalker'>,
    fsmStateId?: GameStateId | null
  ): boolean {
    if (
      this.dodgeActiveRemaining > 0 ||
      this.dodgeCooldownRemaining > 0 ||
      !Number.isFinite(storeState.sandwalker.currentHp) ||
      storeState.sandwalker.currentHp <= 0 ||
      !fsmStateId ||
      fsmStateId === 'OASIS_HUB' ||
      fsmStateId === 'OASIS_SETTLEMENT' ||
      fsmStateId === 'EMERGENCY_REVIVE'
    ) {
      return false;
    }

    const cooldown = evasionCooldown(storeState.sandwalker.legPartLevel);
    this.dodgeActiveRemaining = DODGE_BOOST_DURATION_SEC;
    this.dodgeCooldownTotal = cooldown;
    this.dodgeCooldownRemaining = cooldown;
    this.dodgeBurstPending = true;
    return true;
  }

  public activateSolarShield(
    storeState: Pick<GameStoreState, 'sandwalker'>,
    sink: Pick<CombatStoreSink, 'setSolarShield'>,
    fsmStateId?: GameStateId | null
  ): boolean {
    if (
      this.solarShieldCooldownRemaining > 0 ||
      !Number.isFinite(storeState.sandwalker.maxHp) ||
      storeState.sandwalker.maxHp <= 0 ||
      !Number.isFinite(storeState.sandwalker.currentHp) ||
      storeState.sandwalker.currentHp <= 0 ||
      !fsmStateId ||
      fsmStateId === 'OASIS_HUB' ||
      fsmStateId === 'OASIS_SETTLEMENT' ||
      fsmStateId === 'EMERGENCY_REVIVE'
    ) {
      return false;
    }

    const maxHp = storeState.sandwalker.maxHp;
    const currentShield = Number.isFinite(storeState.sandwalker.solarShieldHp)
      ? Math.max(0, storeState.sandwalker.solarShieldHp)
      : 0;
    const gain = Math.round(maxHp * TACTICAL_SHIELD_FRACTION);
    const clamped = Math.min(maxHp, currentShield + gain);
    sink.setSolarShield(clamped);
    this.solarShieldCooldownRemaining = TACTICAL_SHIELD_COOLDOWN_SEC;
    return true;
  }

  public getAimReticleOverlay(): AimReticleOverlayState {
    const snap = this.turretSystem.getRenderState();
    const { aimState } = snap;
    const allTargets = this.getAllTargets();
    const lockedTarget = aimState.lockedTargetId
      ? allTargets.find((t) => t.id === aimState.lockedTargetId && t.alive)
      : undefined;

    if (lockedTarget) {
      const wpX = lockedTarget.x + (lockedTarget.weakPointOffset?.x ?? 0);
      const wpY = lockedTarget.y + (lockedTarget.weakPointOffset?.y ?? 0);
      return {
        visible: true,
        x: wpX,
        y: wpY,
        locked: true,
        lockRemainingSec: aimState.lockRemainingSec,
      };
    }

    if (aimState.isDragging) {
      return {
        visible: true,
        x: aimState.pointerX,
        y: aimState.pointerY,
        locked: false,
        lockRemainingSec: 0,
      };
    }

    return {
      visible: false,
      x: 0,
      y: 0,
      locked: false,
      lockRemainingSec: 0,
    };
  }

  public update(
    dt: number,
    fsmStateId: GameStateId | null,
    storeState: GameStoreState,
    sink: CombatStoreSink,
    options: {
      routeSnap?: RouteSnapshot;
      walkerRig?: SandwalkerRig;
      particlePool?: ParticlePool;
      cameraSystem?: CameraSystem;
      openingElapsedSeconds?: number;
    } = {}
  ): void {
    const safeDt = Number.isFinite(dt) && dt > 0 ? dt : 0;
    if (safeDt <= 0) return;

    this.elapsedSec += safeDt;

    if (this.pendingClearManualAim) {
      this.pendingClearManualAim = false;
      if (storeState.sandwalker.manualAimTargetId !== null) {
        sink.setManualAimTarget(null);
      }
    }

    if (fsmStateId === 'EMERGENCY_REVIVE') {
      return;
    }

    if (fsmStateId === 'OASIS_HUB' || fsmStateId === 'OASIS_SETTLEMENT') {
      this.lastForcePreviewAll = false;
      this.mercenarySystem.syncRoster(storeState, options.walkerRig, { forcePreviewAll: false });
      this.flushStoreBatch(sink, storeState);
      return;
    }

    const dodgeActiveThisTick = this.dodgeActiveRemaining > 0;
    if (this.dodgeActiveRemaining > 0) {
      this.dodgeActiveRemaining = Math.max(0, this.dodgeActiveRemaining - safeDt);
    }
    if (this.dodgeCooldownRemaining > 0) {
      this.dodgeCooldownRemaining = Math.max(0, this.dodgeCooldownRemaining - safeDt);
    }
    if (this.solarShieldCooldownRemaining > 0) {
      this.solarShieldCooldownRemaining = Math.max(0, this.solarShieldCooldownRemaining - safeDt);
    }

    if (this.dodgeBurstPending) {
      this.dodgeBurstPending = false;
      if (options.particlePool) {
        for (let i = 0; i < 6; i++) {
          options.particlePool.spawn({
            kind: i % 2 === 0 ? 'SPARK' : 'SAND_DUST',
            x: WALKER_ANCHOR_X - 24,
            y: WALKER_GROUND_Y - 20 + (i - 2.5) * 3,
            vx: -90 - i * 15,
            vy: (i - 2.5) * 12,
            gravity: 40,
            size: 3.2,
            endSize: 0.8,
            maxLife: 0.3,
            startAlpha: 0.9,
            color: i % 2 === 0 ? '#38b2ac' : '#f6ad55',
          });
        }
      }
    }

    const meleeMult = this.mercenarySystem.getIncomingMeleeDamageMultiplier(storeState);
    const spawnRes = this.spawnSystem.update(safeDt, {
      fsmStateId,
      storeState,
      routeSnap: options.routeSnap,
      openingElapsedSeconds: options.openingElapsedSeconds,
      meleeDamageMultiplier: meleeMult,
      isInvulnerable: dodgeActiveThisTick || fsmStateId === 'OPENING_HOOK',
      particlePool: options.particlePool,
      cameraSystem: options.cameraSystem,
    });

    let bossHullDamage = 0;
    if (fsmStateId === 'BOSS_ENCOUNTER') {
      if (!this.bossSystem.isActive() && !this.bossSystem.isDefeated() && this.extraTargets.length === 0) {
        this.bossSystem.startEncounter(storeState.meta.currentAct);
      }
      if (this.bossSystem.isActive()) {
        const bossRes = this.bossSystem.update(safeDt, storeState, {
          isInvulnerable: dodgeActiveThisTick,
          particlePool: options.particlePool,
          cameraSystem: options.cameraSystem,
        });
        bossHullDamage = bossRes.hullDamage;
        this.setExtraTargets(this.bossSystem.getCombatTargets());
      }
    }

    const allTargets = this.getAllTargets();

    const forcePreviewAll =
      fsmStateId === 'OPENING_HOOK' &&
      options.openingElapsedSeconds !== undefined &&
      Number.isFinite(options.openingElapsedSeconds) &&
      options.openingElapsedSeconds >= 0 &&
      options.openingElapsedSeconds < 30;
    this.lastForcePreviewAll = forcePreviewAll;

    this.turretSystem.update(safeDt, {
      fsmStateId,
      storeState,
      setManualAimTarget: sink.setManualAimTarget,
      targets: allTargets,
      hullBobY: options.walkerRig?.hullBobY ?? 0,
      forcePreviewAll,
      openingElapsedSeconds: options.openingElapsedSeconds,
      particlePool: options.particlePool,
      cameraSystem: options.cameraSystem,
    });

    const mercRes = this.mercenarySystem.update(
      safeDt,
      fsmStateId,
      storeState,
      allTargets,
      options.walkerRig,
      options.particlePool,
      { forcePreviewAll }
    );

    if (fsmStateId === 'BOSS_ENCOUNTER' && this.bossSystem.isActive()) {
      const partRewards = this.bossSystem.syncPostCombat();
      if (partRewards.ancientGear > 0 || partRewards.templeKeys > 0) {
        sink.addCurrencies({
          ancientGear: partRewards.ancientGear,
          templeKeys: partRewards.templeKeys,
        });
      }
      this.setExtraTargets(this.bossSystem.getCombatTargets());
    }

    const postPrune = this.spawnSystem.pruneDeadEnemies(options.particlePool);

    this.damageSystem.update(safeDt);

    if (options.particlePool) {
      this.lastParticleCount = options.particlePool.getActiveCount();
    }

    if (fsmStateId !== 'OPENING_HOOK') {
      this.pendingGold += spawnRes.goldDropped + postPrune.goldDropped + mercRes.bonusGold;
    } else {
      this.pendingGold = 0;
    }
    this.pendingHeal += mercRes.healedHp;
    if (!dodgeActiveThisTick && fsmStateId !== 'OPENING_HOOK') {
      this.pendingHullDamage += spawnRes.hullDamage + bossHullDamage;
    }

    const maxHp = Math.max(0, storeState.sandwalker.maxHp);
    let currentShieldHp = Number.isFinite(storeState.sandwalker.solarShieldHp)
      ? Math.min(maxHp, Math.max(0, storeState.sandwalker.solarShieldHp))
      : 0;
    const totalShieldGranted = this.pendingShieldGrants + mercRes.shieldGranted;
    this.pendingShieldGrants = 0;

    if (totalShieldGranted > 0 && storeState.sandwalker.currentHp > 0) {
      currentShieldHp = Math.min(maxHp, currentShieldHp + totalShieldGranted);
      sink.setSolarShield(currentShieldHp);
    }

    let walkerAlive = storeState.sandwalker.currentHp > 0;

    // Immediate lethal flush so FSM transitions to EMERGENCY_REVIVE on same/next tick
    if (
      this.pendingHullDamage > 0 &&
      this.pendingHullDamage >= storeState.sandwalker.currentHp + currentShieldHp
    ) {
      const dmg = this.pendingHullDamage;
      this.pendingHullDamage = 0;
      const dmgResult = sink.applyDamage(dmg);
      if (dmgResult.isDestroyed) {
        walkerAlive = false;
        this.pendingHeal = 0;
        this.pendingHullDamage = 0;
        this.pendingShieldGrants = 0;
      }
      this.eventBus?.emit('combat:walkerHit', {
        damage: dmg,
        shieldAbsorbed: dmgResult.shieldAbsorbed,
        hpDamage: dmgResult.hpDamage,
      });
    }

    // 10Hz store batch commit (0.1s cadence)
    this.storeBatchTimer += safeDt;
    if (this.storeBatchTimer >= 0.1) {
      this.storeBatchTimer %= 0.1;
      this.flushStoreBatch(sink, storeState, walkerAlive);
    }
  }

  public flushStoreBatch(
    sink: CombatStoreSink,
    storeState: GameStoreState,
    walkerAlive = storeState.sandwalker.currentHp > 0
  ): void {
    let alive = walkerAlive;
    if (this.pendingHullDamage > 0) {
      const dmg = this.pendingHullDamage;
      this.pendingHullDamage = 0;
      const dmgResult = sink.applyDamage(dmg);
      if (dmgResult.isDestroyed) {
        alive = false;
        this.pendingHeal = 0;
        this.pendingHullDamage = 0;
        this.pendingShieldGrants = 0;
      }
      this.eventBus?.emit('combat:walkerHit', {
        damage: dmg,
        shieldAbsorbed: dmgResult.shieldAbsorbed,
        hpDamage: dmgResult.hpDamage,
      });
    }

    if (!alive) {
      this.pendingHeal = 0;
      this.pendingHullDamage = 0;
      this.pendingShieldGrants = 0;
    } else if (this.pendingHeal >= 1) {
      const wholeHeal = Math.floor(this.pendingHeal);
      this.pendingHeal -= wholeHeal;
      sink.repairHp(wholeHeal);
    }

    if (this.pendingGold > 0) {
      const gold = this.pendingGold;
      this.pendingGold = 0;
      sink.addCurrencies({ sunGold: gold });
    }
  }

  public render(ctx: CanvasRenderingContext2D, storeState: GameStoreState): void {
    const synergyActive =
      this.lastForcePreviewAll || isExpeditionSynergyActive(storeState.mercenaries);
    const allTargets = this.getAllTargets();
    const turretSnap = this.turretSystem.getRenderState();

    drawPixelMercenaries(
      ctx,
      this.mercenarySystem.getRuntimeStates(),
      this.mercenarySystem.getVisualShots(),
      synergyActive,
      this.elapsedSec
    );

    drawPixelEnemies(
      ctx,
      this.spawnSystem.getEnemies(),
      this.spawnSystem.getProjectiles(),
      turretSnap.aimState.lockedTargetId ?? storeState.sandwalker.manualAimTargetId,
      this.elapsedSec
    );

    drawPixelBoss(
      ctx,
      this.bossSystem.getRenderSnapshot(),
      turretSnap.aimState.lockedTargetId ?? storeState.sandwalker.manualAimTargetId,
      this.elapsedSec
    );

    drawPixelHeatRayBeam(ctx, turretSnap.activeBeam);
    drawPixelHarpoons(ctx, turretSnap.harpoons);
    drawPixelMortarsAndExplosions(ctx, turretSnap.mortars, turretSnap.explosions);
    drawPixelWeakPointReticle(ctx, turretSnap.aimState, allTargets, this.elapsedSec);
    drawPixelDamagePopups(ctx, this.damageSystem.getPopups());
  }

  public getDebugSnapshot(
    fsmStateId: GameStateId | null,
    storeState: GameStoreState,
    extra: {
      routeSnap?: RouteSnapshot | null;
      relayTowerVisible?: boolean;
      particleCount?: number;
    } = {}
  ): CombatDebugSnapshot {
    const turretSnap = this.turretSystem.getRenderState();
    const waveEnemies = this.spawnSystem.getEnemies();
    const bossTargets = this.bossSystem.isActive() ? this.extraTargets : [];
    const synergyActive =
      (fsmStateId === 'OPENING_HOOK' && this.lastForcePreviewAll) ||
      isExpeditionSynergyActive(storeState.mercenaries);

    const mappedEnemies = [
      ...waveEnemies.map((e) => ({
        id: e.id,
        archetypeId: e.archetypeId,
        tags: [...e.tags],
        x: Math.round(e.x * 10) / 10,
        y: Math.round(e.y * 10) / 10,
        hp: e.hp,
        maxHp: e.maxHp,
        armor: e.armor,
        weakPointOffset: { ...e.weakPointOffset },
      })),
      ...bossTargets.map((b) => ({
        id: b.id,
        archetypeId: b.id,
        tags: [...b.tags],
        x: Math.round(b.x * 10) / 10,
        y: Math.round(b.y * 10) / 10,
        hp: b.hp,
        maxHp: b.maxHp,
        armor: b.armor ?? 0,
        weakPointOffset: { ...(b.weakPointOffset ?? { x: 0, y: 0 }) },
      })),
    ];

    return {
      fsmStateId,
      activeTurret: storeState.sandwalker.activeTurret,
      switchCooldownRemaining: this.turretSystem.getSwitchCooldownRemaining(),
      lockedTargetId:
        turretSnap.aimState.lockedTargetId ?? storeState.sandwalker.manualAimTargetId,
      lockRemainingSec: turretSnap.aimState.lockRemainingSec,
      synergyActive,
      activeMercenaries:
        fsmStateId === 'OASIS_HUB' || fsmStateId === 'OASIS_SETTLEMENT'
          ? storeState.mercenaries.filter((m) => m.isUnlocked).map((m) => m.id)
          : this.mercenarySystem
              .getRuntimeStates()
              .filter((m) => m.isActive)
              .map((m) => m.id),
      enemyCount: mappedEnemies.length,
      enemies: mappedEnemies,
      activeProjectiles: {
        hasBeam: Boolean(turretSnap.activeBeam),
        harpoons: turretSnap.harpoons.length,
        mortars: turretSnap.mortars.length,
        explosions: turretSnap.explosions.length,
      },
      actualSpeed: extra.routeSnap?.actualSpeed ?? 0,
      isQuicksandSlowed: extra.routeSnap?.isQuicksandSlowed ?? false,
      isQuicksandBypassed: extra.routeSnap?.isQuicksandBypassed ?? false,
      isSandstorm: extra.routeSnap?.isSandstorm ?? false,
      isSandstormVisionMasked:
        (extra.routeSnap?.isSandstormVisionMasked ?? false) &&
        storeState.sandwalker.solarShieldHp <= 0,
      relayTowerVisible: extra.relayTowerVisible ?? false,
      boss: this.bossSystem.getDebugSnapshot(),
      particleCount: extra.particleCount ?? this.lastParticleCount,
      recentDamageEvents: [...this.recentDamageEvents],
    };
  }
}
