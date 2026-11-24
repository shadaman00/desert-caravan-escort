import type { GameStoreState, TurretType } from '@/store/types';
import type { EventBus } from '@/engine/EventBus';
import type { ParticlePool } from '@/engine/render/draw/particles';
import type { CameraSystem } from './CameraSystem';
import type { CombatTarget } from './DamageSystem';
import { WALKER_ANCHOR_X, WALKER_GROUND_Y } from '@/engine/render/draw/sandwalker';
import { WALKER_FRONT_X } from './SpawnSystem';
import {
  getBossDefinitionForAct,
  type BossDefinition,
  type BossId,
  type BossPatternKind,
  type BossPhaseDefinition,
  type BossSpecialKind,
} from '@/game/data/bosses';

export type BossAddKind = 'MIRAGE_CLONE' | 'PARASITE' | 'SMALL_SWARM';

export interface BossAddInstance extends CombatTarget {
  kind: BossAddKind;
  vx: number;
  baseY: number;
  animPhase: number;
  attackTimer: number;
  attackInterval: number;
  attackDamage: number;
  explodeOnContact: boolean;
}

export interface BossRenderSnapshot {
  id: BossId;
  name: string;
  act: number;
  phase: number;
  maxPhase: number;
  phaseLabel: string;
  hp: number;
  maxHp: number;
  phaseHp: number;
  phaseMaxHp: number;
  armor: number;
  maxArmor: number;
  x: number;
  y: number;
  radius: number;
  weakPointOffset: { x: number; y: number };
  targetId: string;
  isGroggy: boolean;
  groggyRemainingSec: number;
  telegraphActive: boolean;
  telegraphProgress: number;
  patternKind: BossPatternKind;
  specialKind?: BossSpecialKind | null;
  specialLabel?: string | null;
  specialVisualTimer?: number;
  specialTriggerCount?: number;
  breathVisualTimer: number;
  lungeOffsetX: number;
  hitFlashTimer: number;
  recommendedTurret: TurretType;
  adds: readonly BossAddInstance[];
}

export interface BossDebugSnapshot {
  id: BossId;
  name: string;
  phase: number;
  maxPhase: number;
  hp: number;
  maxHp: number;
  armor: number;
  maxArmor: number;
  isGroggy: boolean;
  telegraphActive: boolean;
  specialKind: BossSpecialKind | null;
  specialTriggerCount: number;
  recommendedTurret: TurretType;
  wavesSpawned: number;
}

export interface BossResumeOptions {
  bossHp?: number;
  bossPhase?: number;
  bossArmor?: number;
  bossIsGroggy?: boolean;
  bossGroggyRemainingSec?: number;
  bossPartBreakTriggered?: boolean;
  bossWavesSpawned?: number;
}

export interface BossTickResult {
  hullDamage: number;
  dodgedAttack: boolean;
  partBreakRewards: { ancientGear: number; templeKeys: number };
}

export class BossSystem {
  private readonly eventBus?: EventBus;

  private activeDef: BossDefinition | null = null;
  private phaseIndex = 0;
  private bossTarget: CombatTarget | null = null;
  private adds: BossAddInstance[] = [];
  private nextAddId = 1;

  private elapsedSec = 0;
  private phaseElapsedSec = 0;
  private isGroggy = false;
  private groggyRemainingSec = 0;
  private partBreakTriggered = false;
  private telegraphActive = false;
  private telegraphRemainingSec = 0;
  private telegraphTotalSec = 0;
  private attackTimer = 0;
  private cloneSpawnTimer = 0;
  private wavesSpawned = 0;
  private breathVisualTimer = 0;
  private lungeOffsetX = 0;
  private specialVisualTimer = 0;
  private specialTriggerCount = 0;
  private defeated = false;
  private pendingPartBreakGear = 0;
  private pendingPartBreakKeys = 0;

  constructor(options: { eventBus?: EventBus } = {}) {
    this.eventBus = options.eventBus;
  }

  public isActive(): boolean {
    return this.activeDef !== null && !this.defeated;
  }

  public isDefeated(): boolean {
    return this.defeated;
  }

  public getWavesSpawned(): number {
    return this.wavesSpawned;
  }

  public getIsGroggy(): boolean {
    return this.isGroggy;
  }

  public getGroggyRemainingSec(): number {
    return this.groggyRemainingSec;
  }

  public isPartBreakTriggered(): boolean {
    return this.partBreakTriggered;
  }

  public getTotalHp(): number {
    if (!this.activeDef || !this.bossTarget) return 0;
    if (this.defeated) return 0;

    if (!this.activeDef.isMultiPhase) {
      return Math.max(0, Math.round(this.bossTarget.hp));
    }

    let futureHp = 0;
    for (let i = this.phaseIndex + 1; i < this.activeDef.phases.length; i++) {
      futureHp += this.activeDef.phases[i].hp;
    }
    return Math.max(0, Math.round(this.bossTarget.hp + futureHp));
  }

  public getPhase(): number {
    return this.phaseIndex + 1;
  }

  public getMaxHp(): number {
    return this.activeDef?.maxHp ?? 0;
  }

  public getArmor(): number {
    return Math.max(0, Math.round(this.bossTarget?.armor ?? 0));
  }

  public getMaxArmor(): number {
    return this.bossTarget?.maxArmor ?? 0;
  }

  public getAdds(): readonly BossAddInstance[] {
    return this.adds;
  }

  public startEncounter(act: number, resume?: BossResumeOptions): void {
    const def = getBossDefinitionForAct(act);
    this.activeDef = def;
    this.defeated = false;
    this.adds = [];
    this.elapsedSec = 0;
    this.phaseElapsedSec = 0;
    this.isGroggy = false;
    this.groggyRemainingSec = 0;
    this.partBreakTriggered = false;
    this.telegraphActive = false;
    this.telegraphRemainingSec = 0;
    this.telegraphTotalSec = 0;
    this.breathVisualTimer = 0;
    this.lungeOffsetX = 0;
    this.specialVisualTimer = 0;
    this.specialTriggerCount = 0;
    this.wavesSpawned = 0;
    this.pendingPartBreakGear = 0;
    this.pendingPartBreakKeys = 0;
    this.cloneSpawnTimer = def.cloneConfig ? 1.5 : 0;

    const requestedPhase =
      resume?.bossPhase !== undefined && Number.isFinite(resume.bossPhase)
        ? resume.bossPhase
        : 1;
    const clampedPhaseIndex = Math.max(
      0,
      Math.min(def.phases.length - 1, Math.floor(requestedPhase) - 1)
    );
    this.initPhase(clampedPhaseIndex);

    let phaseAdvanced = false;
    if (resume?.bossHp !== undefined && Number.isFinite(resume.bossHp) && this.bossTarget) {
      const phaseDef = this.getCurrentPhaseDef();
      if (def.isMultiPhase) {
        let futureHp = 0;
        for (let i = clampedPhaseIndex + 1; i < def.phases.length; i++) {
          futureHp += def.phases[i].hp;
        }
        const phaseHp = Math.max(0, Math.min(phaseDef.hp, resume.bossHp - futureHp));
        this.bossTarget.hp = phaseHp;
        if (phaseHp <= 0) {
          if (clampedPhaseIndex === def.phases.length - 1) {
            this.bossTarget.alive = false;
            this.defeated = true;
          } else if (phaseDef.groggyDurationSec > 0 && resume.bossIsGroggy !== false) {
            const remaining =
              resume.bossGroggyRemainingSec !== undefined &&
              Number.isFinite(resume.bossGroggyRemainingSec)
                ? Math.max(0, Math.min(phaseDef.groggyDurationSec, resume.bossGroggyRemainingSec))
                : phaseDef.groggyDurationSec;
            if (remaining > 0) {
              this.bossTarget.alive = false;
              this.isGroggy = true;
              this.groggyRemainingSec = remaining;
              this.partBreakTriggered = true;
              this.bossTarget.armor = 0;
              this.telegraphActive = false;
              this.telegraphRemainingSec = 0;
              this.syncWeakPointOffset();
            } else {
              this.initPhase(clampedPhaseIndex + 1);
              phaseAdvanced = true;
            }
          } else {
            this.initPhase(clampedPhaseIndex + 1);
            phaseAdvanced = true;
          }

          if (phaseAdvanced && this.bossTarget && resume.bossHp < futureHp) {
            const nextPhaseDef = this.getCurrentPhaseDef();
            let nextFutureHp = 0;
            for (let i = this.phaseIndex + 1; i < def.phases.length; i++) {
              nextFutureHp += def.phases[i].hp;
            }
            const nextPhaseHp = Math.max(
              0,
              Math.min(nextPhaseDef.hp, resume.bossHp - nextFutureHp)
            );
            this.bossTarget.hp = nextPhaseHp;
            if (nextPhaseHp <= 0 && this.phaseIndex === def.phases.length - 1) {
              this.bossTarget.alive = false;
              this.defeated = true;
            }
          }
        }
      } else {
        this.bossTarget.hp = Math.max(0, Math.min(phaseDef.hp, resume.bossHp));
        if (this.bossTarget.hp <= 0) {
          this.bossTarget.alive = false;
          this.defeated = true;
        }
      }
    }

    if (!phaseAdvanced && !this.defeated && this.bossTarget) {
      if (resume?.bossArmor !== undefined && Number.isFinite(resume.bossArmor)) {
        this.bossTarget.armor = Math.max(
          0,
          Math.min(this.bossTarget.maxArmor ?? 0, resume.bossArmor)
        );
        if ((this.bossTarget.maxArmor ?? 0) > 0 && this.bossTarget.armor <= 0) {
          this.partBreakTriggered = true;
        }
      }

      if (resume?.bossPartBreakTriggered) {
        this.partBreakTriggered = true;
      }

      const currentPhaseDef = this.getCurrentPhaseDef();
      if (resume?.bossIsGroggy && currentPhaseDef.groggyDurationSec > 0) {
        const remaining =
          resume.bossGroggyRemainingSec !== undefined &&
          Number.isFinite(resume.bossGroggyRemainingSec)
            ? Math.max(0, Math.min(currentPhaseDef.groggyDurationSec, resume.bossGroggyRemainingSec))
            : currentPhaseDef.groggyDurationSec;
        if (remaining > 0) {
          this.isGroggy = true;
          this.groggyRemainingSec = remaining;
          this.telegraphActive = false;
          this.telegraphRemainingSec = 0;
          this.syncWeakPointOffset();
        } else {
          this.isGroggy = false;
          this.groggyRemainingSec = 0;
          if (def.isMultiPhase && this.phaseIndex < def.phases.length - 1) {
            this.initPhase(this.phaseIndex + 1);
            phaseAdvanced = true;
          }
        }
      }

      if (
        !phaseAdvanced &&
        currentPhaseDef.p3Waves &&
        resume?.bossWavesSpawned !== undefined &&
        Number.isFinite(resume.bossWavesSpawned)
      ) {
        this.wavesSpawned = Math.max(
          0,
          Math.min(currentPhaseDef.p3Waves.waveTimesSec.length, Math.floor(resume.bossWavesSpawned))
        );
      }
    }
  }

  public clear(): void {
    this.activeDef = null;
    this.bossTarget = null;
    this.adds = [];
    this.phaseIndex = 0;
    this.isGroggy = false;
    this.groggyRemainingSec = 0;
    this.telegraphActive = false;
    this.telegraphRemainingSec = 0;
    this.specialVisualTimer = 0;
    this.specialTriggerCount = 0;
    this.defeated = false;
    this.wavesSpawned = 0;
    this.pendingPartBreakGear = 0;
    this.pendingPartBreakKeys = 0;
  }

  private getCurrentPhaseDef(): BossPhaseDefinition {
    return this.activeDef!.phases[this.phaseIndex];
  }

  private syncWeakPointOffset(): void {
    if (!this.activeDef || !this.bossTarget) return;
    const phaseDef = this.getCurrentPhaseDef();
    const slumpY = this.activeDef.id === 'GREAT_SANDWORM' && this.isGroggy ? 18 : 0;
    this.bossTarget.weakPointOffset = {
      x: phaseDef.weakPointOffset.x,
      y: phaseDef.weakPointOffset.y + slumpY,
    };
  }

  private initPhase(index: number): void {
    const def = this.activeDef!;
    this.phaseIndex = index;
    const phaseDef = def.phases[index];

    this.phaseElapsedSec = 0;
    this.isGroggy = false;
    this.groggyRemainingSec = 0;
    this.partBreakTriggered = false;
    this.telegraphActive = false;
    this.telegraphRemainingSec = 0;
    this.telegraphTotalSec = phaseDef.telegraphDurationSec;
    this.attackTimer = phaseDef.attackIntervalSec * 0.75;
    this.wavesSpawned = 0;
    this.breathVisualTimer = 0;
    this.lungeOffsetX = 0;
    this.specialVisualTimer = 0;
    this.specialTriggerCount = 0;

    this.bossTarget = {
      id: `boss_${def.id.toLowerCase()}`,
      x: def.x,
      y: def.y,
      radius: def.radius,
      hp: phaseDef.hp,
      maxHp: phaseDef.hp,
      armor: phaseDef.armor,
      maxArmor: phaseDef.armor,
      armorAbsorbsHp: phaseDef.armorAbsorbsHp,
      weakPointOffset: { ...phaseDef.weakPointOffset },
      tags: [...phaseDef.tags],
      isWeakPoint: false,
      snapPriority: true,
      knockbackImmune: true,
      alive: true,
      hitFlashTimer: 0,
      knockbackVx: 0,
    };
  }

  public getCombatTargets(): CombatTarget[] {
    if (!this.activeDef || !this.bossTarget || this.defeated) {
      return [];
    }
    const targets: CombatTarget[] = [];
    if (this.bossTarget.alive) {
      targets.push(this.bossTarget);
    }
    for (let i = 0; i < this.adds.length; i++) {
      if (this.adds[i].alive) {
        targets.push(this.adds[i]);
      }
    }
    return targets;
  }

  public applyManualDamage(amount: number): void {
    if (!this.bossTarget || !Number.isFinite(amount) || amount <= 0) return;
    this.bossTarget.hp = Math.max(0, this.bossTarget.hp - amount);
    if (this.bossTarget.hp <= 0) {
      this.bossTarget.alive = false;
    }
    this.syncPostCombat();
  }

  public update(
    dt: number,
    _storeState: GameStoreState,
    options: {
      isInvulnerable?: boolean;
      particlePool?: ParticlePool;
      cameraSystem?: CameraSystem;
    } = {}
  ): BossTickResult {
    const safeDt = Number.isFinite(dt) && dt > 0 ? dt : 0;
    if (!this.activeDef || !this.bossTarget || this.defeated || safeDt <= 0) {
      return {
        hullDamage: 0,
        dodgedAttack: false,
        partBreakRewards: { ancientGear: 0, templeKeys: 0 },
      };
    }

    this.elapsedSec += safeDt;
    this.phaseElapsedSec += safeDt;

    if (this.bossTarget.hitFlashTimer && this.bossTarget.hitFlashTimer > 0) {
      this.bossTarget.hitFlashTimer = Math.max(0, this.bossTarget.hitFlashTimer - safeDt);
    }
    if (this.breathVisualTimer > 0) {
      this.breathVisualTimer = Math.max(0, this.breathVisualTimer - safeDt);
    }
    if (this.specialVisualTimer > 0) {
      this.specialVisualTimer = Math.max(0, this.specialVisualTimer - safeDt);
    }
    if (this.lungeOffsetX < 0) {
      this.lungeOffsetX = Math.min(0, this.lungeOffsetX + 260 * safeDt);
    }

    let hullDamage = 0;
    let dodgedAttack = false;
    const def = this.activeDef;
    const phaseDef = this.getCurrentPhaseDef();

    // Groggy countdown (Sandworm P1 -> P2 or Scorpion Rex stun)
    if (this.isGroggy) {
      this.groggyRemainingSec = Math.max(0, this.groggyRemainingSec - safeDt);
      if (this.groggyRemainingSec <= 0) {
        this.isGroggy = false;
        this.syncWeakPointOffset();
        if (def.isMultiPhase && this.phaseIndex === 0) {
          this.initPhase(1);
        }
      }
    } else {
      // Boss telegraph and attack cycle
      if (this.telegraphActive) {
        this.telegraphRemainingSec -= safeDt;
        if (this.telegraphRemainingSec <= 0) {
          this.telegraphActive = false;
          this.telegraphRemainingSec = 0;
          this.attackTimer = phaseDef.attackIntervalSec;

          if (phaseDef.patternKind === 'WORM_LUNGE') {
            this.lungeOffsetX = -68;
          } else if (phaseDef.patternKind === 'SAND_BREATH') {
            this.breathVisualTimer = 0.65;
          }

          if (phaseDef.specialKind) {
            this.triggerBossSpecialPattern(phaseDef.specialKind, options.particlePool);
          }

          if (options.isInvulnerable) {
            dodgedAttack = true;
            this.spawnDodgeSparks(options.particlePool);
          } else {
            hullDamage += phaseDef.attackDamage;
            if (options.cameraSystem) {
              options.cameraSystem.shake(10, 0.35);
            } else {
              this.eventBus?.emit('camera:shake', { intensity: 10, duration: 0.35 });
            }
          }
        }
      } else {
        this.attackTimer -= safeDt;
        if (this.attackTimer <= 0) {
          this.telegraphActive = true;
          this.telegraphTotalSec = phaseDef.telegraphDurationSec;
          this.telegraphRemainingSec = phaseDef.telegraphDurationSec;
        }
      }

      // Act 3 Mirage Spirit King illusory clones
      if (def.cloneConfig) {
        const aliveClones = this.adds.filter((a) => a.alive && a.kind === 'MIRAGE_CLONE').length;
        this.cloneSpawnTimer -= safeDt;
        if (this.cloneSpawnTimer <= 0 && aliveClones < def.cloneConfig.maxClones) {
          this.cloneSpawnTimer = def.cloneConfig.cloneIntervalSec;
          this.spawnMirageClone(def.cloneConfig, aliveClones);
        }
      }

      // Act 4 Sandworm Phase 3: 3 waves of PARASITE + SMALL_SWARM
      if (phaseDef.p3Waves) {
        const { waveTimesSec, parasiteCount, banditCount } = phaseDef.p3Waves;
        while (
          this.wavesSpawned < waveTimesSec.length &&
          this.phaseElapsedSec >= waveTimesSec[this.wavesSpawned]
        ) {
          this.spawnSandwormP3Wave(this.wavesSpawned, parasiteCount, banditCount);
          this.wavesSpawned += 1;
        }
      }
    }

    // Update active boss adds (clones, parasites, raiders)
    for (let i = 0; i < this.adds.length; i++) {
      const add = this.adds[i];
      if (!add.alive) continue;

      add.animPhase += safeDt * 6;
      if (add.hitFlashTimer && add.hitFlashTimer > 0) {
        add.hitFlashTimer = Math.max(0, add.hitFlashTimer - safeDt);
      }

      if (add.kind === 'MIRAGE_CLONE') {
        add.y = add.baseY + Math.sin(add.animPhase * 0.7) * 7;
        add.attackTimer -= safeDt;
        if (add.attackTimer <= 0) {
          add.attackTimer = add.attackInterval;
          if (!options.isInvulnerable) {
            hullDamage += add.attackDamage;
          } else {
            dodgedAttack = true;
          }
        }
      } else {
        if (add.knockbackVx && add.knockbackVx > 0) {
          add.x = Math.min(715, add.x + add.knockbackVx * safeDt);
          add.knockbackVx = Math.max(0, add.knockbackVx - 460 * safeDt);
        } else {
          const stopX = add.explodeOnContact ? WALKER_FRONT_X + 16 : WALKER_FRONT_X + 24;
          if (add.x > stopX) {
            add.x = Math.max(stopX, add.x - add.vx * safeDt);
          } else if (add.explodeOnContact) {
            // Self-destructing Parasite
            add.alive = false;
            add.hp = 0;
            if (!options.isInvulnerable) {
              hullDamage += add.attackDamage;
              options.cameraSystem?.shake(5, 0.2);
            } else {
              dodgedAttack = true;
              this.spawnDodgeSparks(options.particlePool);
            }
          } else {
            add.attackTimer -= safeDt;
            if (add.attackTimer <= 0) {
              add.attackTimer = add.attackInterval;
              if (!options.isInvulnerable) {
                hullDamage += add.attackDamage;
              } else {
                dodgedAttack = true;
              }
            }
          }
        }
      }
    }

    // Prune dead adds
    this.adds = this.adds.filter((a) => a.alive);

    return {
      hullDamage,
      dodgedAttack,
      partBreakRewards: { ancientGear: 0, templeKeys: 0 },
    };
  }

  public syncPostCombat(): { ancientGear: number; templeKeys: number } {
    if (!this.activeDef || !this.bossTarget || this.defeated) {
      return { ancientGear: 0, templeKeys: 0 };
    }

    const def = this.activeDef;
    const phaseDef = this.getCurrentPhaseDef();

    // Check Part Break (armor reaching 0, or P1 shell HP reaching 0)
    if (!this.partBreakTriggered && phaseDef.partBreakRewards) {
      const armorBroken = (this.bossTarget.maxArmor ?? 0) > 0 && (this.bossTarget.armor ?? 0) <= 0;
      const p1HpBroken = def.isMultiPhase && this.phaseIndex === 0 && this.bossTarget.hp <= 0;
      if (armorBroken || p1HpBroken) {
        this.partBreakTriggered = true;
        this.bossTarget.armor = 0;
        this.pendingPartBreakGear += phaseDef.partBreakRewards.ancientGear;
        this.pendingPartBreakKeys += phaseDef.partBreakRewards.templeKeys;

        if (phaseDef.groggyDurationSec > 0) {
          this.isGroggy = true;
          this.groggyRemainingSec = phaseDef.groggyDurationSec;
          this.telegraphActive = false;
          this.telegraphRemainingSec = 0;
          this.syncWeakPointOffset();
        }
      }
    }

    // Phase defeat / advancement
    if (this.bossTarget.hp <= 0) {
      if (def.isMultiPhase && this.phaseIndex === 0) {
        // If P1 HP reached 0 before Groggy elapsed, enter Groggy (waiting 3s before P2)
        if (!this.isGroggy && phaseDef.groggyDurationSec > 0) {
          this.isGroggy = true;
          this.groggyRemainingSec = phaseDef.groggyDurationSec;
          this.telegraphActive = false;
          this.telegraphRemainingSec = 0;
          this.syncWeakPointOffset();
        }
      } else if (def.isMultiPhase && this.phaseIndex < def.phases.length - 1) {
        this.initPhase(this.phaseIndex + 1);
      } else {
        this.defeated = true;
        this.adds = [];
      }
    }

    const gear = this.pendingPartBreakGear;
    const keys = this.pendingPartBreakKeys;
    this.pendingPartBreakGear = 0;
    this.pendingPartBreakKeys = 0;
    return { ancientGear: gear, templeKeys: keys };
  }

  private triggerBossSpecialPattern(
    specialKind: BossSpecialKind,
    particlePool?: ParticlePool
  ): void {
    if (!this.bossTarget) return;
    this.specialTriggerCount += 1;

    if (specialKind === 'SMOKE_RUSH') {
      // Visual rush offset only so bossTarget.x remains immune to knockback invariants
      this.lungeOffsetX = -56;
      this.specialVisualTimer = 0.85;
      if (particlePool) {
        for (let i = 0; i < 8; i++) {
          particlePool.spawn({
            kind: 'SAND_DUST',
            x: this.bossTarget.x - 10 + (i % 4) * 10,
            y: this.bossTarget.y - 6 - Math.floor(i / 4) * 8,
            vx: 50 + i * 12,
            vy: -18 - (i % 3) * 12,
            gravity: 10,
            size: 5,
            endSize: 2,
            maxLife: 0.55,
            startAlpha: 0.85,
            color: '#718096',
          });
        }
      }
      return;
    }

    if (specialKind === 'VENOM_BARRAGE') {
      this.specialVisualTimer = 0.9;
      if (particlePool) {
        for (let i = 0; i < 10; i++) {
          particlePool.spawn({
            kind: 'SPARK',
            x: this.bossTarget.x - 24,
            y: this.bossTarget.y - 36,
            vx: -(120 + i * 16),
            vy: -40 + (i % 5) * 18,
            gravity: 120,
            size: 3.5,
            endSize: 1,
            maxLife: 0.5,
            startAlpha: 0.95,
            color: '#48bb78',
          });
        }
      }
      return;
    }

    if (specialKind === 'MIRAGE_SWAP') {
      this.specialVisualTimer = 0.8;
      const clone = this.adds.find((a) => a.alive && a.kind === 'MIRAGE_CLONE');
      const oldBossX = this.bossTarget.x;
      const oldBossY = this.bossTarget.y;
      if (clone) {
        this.bossTarget.x = Math.max(430, Math.min(570, clone.x));
        this.bossTarget.y = Math.max(175, Math.min(295, clone.y));
        clone.x = oldBossX;
        clone.y = oldBossY;
        clone.baseY = oldBossY;
      }
      if (particlePool) {
        for (let i = 0; i < 8; i++) {
          const atClone = i >= 4 && clone;
          particlePool.spawn({
            kind: 'SPARK',
            x: atClone ? clone.x : this.bossTarget.x,
            y: atClone ? clone.y : this.bossTarget.y,
            vx: Math.cos(i * 1.4) * 55,
            vy: Math.sin(i * 1.4) * 55,
            gravity: 0,
            size: 3.2,
            endSize: 0.8,
            maxLife: 0.45,
            startAlpha: 0.9,
            color: '#7dd3fc',
          });
        }
      }
    }
  }

  private spawnDodgeSparks(particlePool?: ParticlePool): void {
    if (!particlePool) return;
    for (let i = 0; i < 6; i++) {
      particlePool.spawn({
        kind: 'SPARK',
        x: WALKER_ANCHOR_X + 26,
        y: WALKER_GROUND_Y - 38 + (i - 2.5) * 6,
        vx: 75 + i * 18,
        vy: (i - 2.5) * 28,
        gravity: 90,
        size: 3.4,
        endSize: 0.7,
        maxLife: 0.35,
        startAlpha: 0.95,
        color: '#81e6d9',
      });
    }
  }

  private spawnMirageClone(
    cfg: NonNullable<BossDefinition['cloneConfig']>,
    slotIndex: number
  ): void {
    const offsets = [
      { x: -64, y: -38 },
      { x: -78, y: 24 },
      { x: -42, y: 46 },
    ];
    const off = offsets[slotIndex % offsets.length];
    const bx = this.activeDef!.x + off.x;
    const by = this.activeDef!.y + off.y;
    this.adds.push({
      id: `boss_add_${this.nextAddId++}`,
      kind: 'MIRAGE_CLONE',
      x: bx,
      y: by,
      baseY: by,
      vx: 0,
      radius: 16,
      hp: cfg.cloneHp,
      maxHp: cfg.cloneHp,
      armor: 0,
      maxArmor: 0,
      weakPointOffset: { x: 0, y: -6 },
      tags: ['MIRAGE'],
      knockbackImmune: true,
      alive: true,
      hitFlashTimer: 0,
      knockbackVx: 0,
      animPhase: slotIndex * 1.3,
      attackTimer: cfg.cloneAttackIntervalSec,
      attackInterval: cfg.cloneAttackIntervalSec,
      attackDamage: cfg.cloneDamage,
      explodeOnContact: false,
    });
  }

  private spawnSandwormP3Wave(
    waveIdx: number,
    parasiteCount: number,
    banditCount: number
  ): void {
    for (let i = 0; i < parasiteCount; i++) {
      const startX = 520 + i * 18 + waveIdx * 6;
      const startY = WALKER_GROUND_Y - 12 - (i % 2) * 8;
      this.adds.push({
        id: `boss_add_${this.nextAddId++}`,
        kind: 'PARASITE',
        x: startX,
        y: startY,
        baseY: startY,
        vx: 85,
        radius: 14,
        hp: 50,
        maxHp: 50,
        armor: 0,
        maxArmor: 0,
        weakPointOffset: { x: 0, y: -4 },
        tags: ['PARASITE'],
        knockbackImmune: false,
        alive: true,
        hitFlashTimer: 0,
        knockbackVx: 0,
        animPhase: i * 1.1,
        attackTimer: 1.0,
        attackInterval: 1.0,
        attackDamage: 80,
        explodeOnContact: true,
      });
    }

    for (let i = 0; i < banditCount; i++) {
      const startX = 640 + i * 20;
      const startY = WALKER_GROUND_Y - 10;
      this.adds.push({
        id: `boss_add_${this.nextAddId++}`,
        kind: 'SMALL_SWARM',
        x: startX,
        y: startY,
        baseY: startY,
        vx: 68,
        radius: 13,
        hp: 40,
        maxHp: 40,
        armor: 0,
        maxArmor: 0,
        weakPointOffset: { x: 0, y: -6 },
        tags: ['SMALL_SWARM'],
        knockbackImmune: false,
        alive: true,
        hitFlashTimer: 0,
        knockbackVx: 0,
        animPhase: i * 0.9,
        attackTimer: 1.4,
        attackInterval: 1.5,
        attackDamage: 18,
        explodeOnContact: false,
      });
    }
  }

  public getRenderSnapshot(): BossRenderSnapshot | null {
    if (!this.activeDef || !this.bossTarget || this.defeated) {
      return null;
    }
    const phaseDef = this.getCurrentPhaseDef();
    const telegraphProgress =
      this.telegraphActive && this.telegraphTotalSec > 0
        ? Math.max(0, Math.min(1, 1 - this.telegraphRemainingSec / this.telegraphTotalSec))
        : 0;

    return {
      id: this.activeDef.id,
      name: this.activeDef.name,
      act: this.activeDef.act,
      phase: this.getPhase(),
      maxPhase: this.activeDef.phases.length,
      phaseLabel: phaseDef.label,
      hp: this.getTotalHp(),
      maxHp: this.activeDef.maxHp,
      phaseHp: Math.max(0, Math.round(this.bossTarget.hp)),
      phaseMaxHp: phaseDef.hp,
      armor: this.getArmor(),
      maxArmor: this.getMaxArmor(),
      x: this.bossTarget.x + this.lungeOffsetX,
      y: this.bossTarget.y,
      radius: this.bossTarget.radius,
      weakPointOffset: { ...phaseDef.weakPointOffset },
      targetId: this.bossTarget.id,
      isGroggy: this.isGroggy,
      groggyRemainingSec: this.groggyRemainingSec,
      telegraphActive: this.telegraphActive,
      telegraphProgress,
      patternKind: phaseDef.patternKind,
      specialKind: phaseDef.specialKind ?? null,
      specialLabel: phaseDef.specialLabel ?? null,
      specialVisualTimer: this.specialVisualTimer,
      specialTriggerCount: this.specialTriggerCount,
      breathVisualTimer: this.breathVisualTimer,
      lungeOffsetX: this.lungeOffsetX,
      hitFlashTimer: this.bossTarget.hitFlashTimer ?? 0,
      recommendedTurret: phaseDef.recommendedTurret,
      adds: this.adds,
    };
  }

  public getDebugSnapshot(): BossDebugSnapshot | null {
    if (!this.activeDef || !this.bossTarget || this.defeated) {
      return null;
    }
    const phaseDef = this.getCurrentPhaseDef();
    return {
      id: this.activeDef.id,
      name: this.activeDef.name,
      phase: this.getPhase(),
      maxPhase: this.activeDef.phases.length,
      hp: this.getTotalHp(),
      maxHp: this.activeDef.maxHp,
      armor: this.getArmor(),
      maxArmor: this.getMaxArmor(),
      isGroggy: this.isGroggy,
      telegraphActive: this.telegraphActive,
      specialKind: phaseDef.specialKind ?? null,
      specialTriggerCount: this.specialTriggerCount,
      recommendedTurret: phaseDef.recommendedTurret,
      wavesSpawned: this.wavesSpawned,
    };
  }
}
