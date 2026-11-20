import type { EnemyArchetypeTag, GameStoreState } from '@/store/types';
import type { GameStateId } from '@/engine/fsm/GameFSM';
import type { EventBus } from '@/engine/EventBus';
import type { ParticlePool } from '@/engine/render/draw/particles';
import type { RouteSnapshot } from './RouteSystem';
import type { CameraSystem } from './CameraSystem';
import {
  ENEMY_ARCHETYPES,
  getQuicksandScorpionMultiplier,
  scaleEnemyHpForAct,
  type EnemyArchetypeId,
} from '@/game/data/enemies';
import { WALKER_ANCHOR_X, WALKER_GROUND_Y } from '@/engine/render/draw/sandwalker';
import type { CombatTarget } from './DamageSystem';

export const MAX_ACTIVE_ENEMIES = 28;
export const WAVE_SPAWN_INTERVAL_SEC = 2.2;
export const WALKER_FRONT_X = WALKER_ANCHOR_X + 36; // 232px

export interface EnemyInstance extends CombatTarget {
  archetypeId: EnemyArchetypeId;
  tags: EnemyArchetypeTag[];
  baseY: number;
  vx: number;
  knockbackVx: number;
  armor: number;
  maxArmor: number;
  weakPointOffset: { x: number; y: number };
  hitFlashTimer: number;
  attackTimer: number;
  attackInterval: number;
  attackDamage: number;
  attackRange: number;
  isRanged: boolean;
  goldReward: number;
  animPhase: number;
}

export interface EnemyProjectile {
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  color: string;
  alive: boolean;
}

export interface SpawnUpdateContext {
  fsmStateId: GameStateId | null;
  storeState: GameStoreState;
  routeSnap?: Pick<RouteSnapshot, 'hazardKind'>;
  openingElapsedSeconds?: number;
  meleeDamageMultiplier?: number;
  isInvulnerable?: boolean;
  particlePool?: ParticlePool;
  cameraSystem?: CameraSystem;
}

export interface SpawnTickResult {
  hullDamage: number;
  goldDropped: number;
  spawnedCount: number;
  killedCount: number;
}

export class SpawnSystem {
  private readonly rng: () => number;
  private readonly eventBus?: EventBus;
  private readonly enemies: EnemyInstance[] = [];
  private readonly projectiles: EnemyProjectile[] = [];

  private nextEnemyId = 1;
  private spawnTimer = 0.8; // First wave spawns shortly after march starts
  private waveCounter = 0;

  constructor(options: { rng?: () => number; eventBus?: EventBus } = {}) {
    this.rng = options.rng ?? Math.random;
    this.eventBus = options.eventBus;
  }

  public getEnemies(): readonly EnemyInstance[] {
    return this.enemies;
  }

  public getProjectiles(): readonly EnemyProjectile[] {
    return this.projectiles;
  }

  public addEnemy(
    archetypeId: EnemyArchetypeId,
    act = 1,
    overrides: Partial<Pick<EnemyInstance, 'x' | 'y' | 'hp' | 'armor'>> = {}
  ): EnemyInstance {
    const def = ENEMY_ARCHETYPES[archetypeId];
    const scaledHp = scaleEnemyHpForAct(def.baseHp, act);
    const baseY = overrides.y ?? WALKER_GROUND_Y + def.yOffsetFromGround;
    const enemy: EnemyInstance = {
      id: `enemy_${this.nextEnemyId++}`,
      archetypeId,
      tags: [...def.tags],
      x: overrides.x ?? 454,
      y: baseY,
      baseY,
      vx: def.baseSpeed,
      knockbackVx: 0,
      radius: def.radius,
      hp: overrides.hp ?? scaledHp,
      maxHp: overrides.hp ?? scaledHp,
      armor: overrides.armor ?? def.baseArmor,
      maxArmor: overrides.armor ?? def.baseArmor,
      weakPointOffset: { ...def.weakPointOffset },
      hitFlashTimer: 0,
      attackTimer: def.attackIntervalSec * 0.4,
      attackInterval: def.attackIntervalSec,
      attackDamage: def.baseDamage,
      attackRange: def.attackRangePx,
      isRanged: def.isRanged,
      goldReward: def.goldReward,
      animPhase: this.rng() * Math.PI * 2,
      alive: true,
    };
    this.enemies.push(enemy);
    return enemy;
  }

  public clear(): void {
    this.enemies.length = 0;
    this.projectiles.length = 0;
    this.spawnTimer = 0.8;
  }

  /**
   * Retreats/clears regular wave enemies when entering a Boss encounter (Plan §4.2).
   */
  public retreatAll(): void {
    this.enemies.length = 0;
    this.projectiles.length = 0;
  }

  public chooseWaveArchetype(isQuicksand: boolean, act: number): EnemyArchetypeId {
    const scorpionMult = getQuicksandScorpionMultiplier(isQuicksand, act);
    const banditWeight = 45;
    const scorpionWeight = 30 * scorpionMult;
    const mirageWeight = 25;
    const total = banditWeight + scorpionWeight + mirageWeight;
    const roll = this.rng() * total;

    if (roll < banditWeight) return 'DESERT_BANDIT';
    if (roll < banditWeight + scorpionWeight) return 'SCORPION';
    return 'MIRAGE_SPIRIT';
  }

  public spawnWave(act: number, isQuicksand: boolean): number {
    if (this.enemies.length >= MAX_ACTIVE_ENEMIES) return 0;

    this.waveCounter += 1;
    let archetype = this.chooseWaveArchetype(isQuicksand, act);
    if (!isQuicksand) {
      if (this.waveCounter % 2 === 1) {
        archetype = 'DESERT_BANDIT';
      } else if (this.waveCounter === 2) {
        archetype = 'SCORPION';
      } else if (this.waveCounter === 4) {
        archetype = 'MIRAGE_SPIRIT';
      }
    }
    let count = 1;
    if (archetype === 'DESERT_BANDIT') {
      count = 2 + (this.waveCounter % 2);
    } else if (archetype === 'MIRAGE_SPIRIT') {
      count = this.rng() < 0.4 ? 2 : 1;
    }

    let spawned = 0;
    for (let i = 0; i < count; i++) {
      if (this.enemies.length >= MAX_ACTIVE_ENEMIES) break;
      const offsetX = 418 + i * 18 + this.rng() * 6;
      const offsetY =
        archetype === 'MIRAGE_SPIRIT'
          ? WALKER_GROUND_Y + ENEMY_ARCHETYPES.MIRAGE_SPIRIT.yOffsetFromGround + (this.rng() - 0.5) * 26
          : undefined;
      this.addEnemy(archetype, act, { x: offsetX, y: offsetY });
      spawned += 1;
    }
    return spawned;
  }

  public update(dt: number, ctx: SpawnUpdateContext): SpawnTickResult {
    const safeDt = Number.isFinite(dt) && dt > 0 ? dt : 0;
    if (safeDt <= 0 || ctx.fsmStateId === 'EMERGENCY_REVIVE') {
      return { hullDamage: 0, goldDropped: 0, spawnedCount: 0, killedCount: 0 };
    }

    if (ctx.fsmStateId === 'OASIS_HUB' || ctx.fsmStateId === 'OASIS_SETTLEMENT') {
      return { hullDamage: 0, goldDropped: 0, spawnedCount: 0, killedCount: 0 };
    }

    let spawnedCount = 0;
    let hullDamage = 0;

    const inOpeningActiveWave =
      ctx.fsmStateId === 'OPENING_HOOK' &&
      ctx.openingElapsedSeconds !== undefined &&
      ((ctx.openingElapsedSeconds >= 0 && ctx.openingElapsedSeconds < 30) ||
        (ctx.openingElapsedSeconds >= 75 && ctx.openingElapsedSeconds < 135));
    const canSpawnWaves =
      ctx.fsmStateId === 'MARCH_NORMAL' ||
      ctx.fsmStateId === 'HAZARD_ZONE' ||
      inOpeningActiveWave;
    const isQuicksand =
      ctx.fsmStateId === 'HAZARD_ZONE' && ctx.routeSnap?.hazardKind === 'QUICKSAND';
    const act = ctx.storeState.meta.currentAct;

    if (canSpawnWaves) {
      const scorpionMult = getQuicksandScorpionMultiplier(isQuicksand, act);
      const effectiveInterval = inOpeningActiveWave
        ? 1.0
        : WAVE_SPAWN_INTERVAL_SEC /
          (isQuicksand ? Math.min(1.4, 0.9 + scorpionMult * 0.15) : 1.0);
      this.spawnTimer += safeDt;
      if (this.spawnTimer >= effectiveInterval) {
        this.spawnTimer -= effectiveInterval;
        const beforeLen = this.enemies.length;
        spawnedCount += this.spawnWave(act, isQuicksand);
        if (
          inOpeningActiveWave &&
          (ctx.openingElapsedSeconds ?? 0) < 30 &&
          spawnedCount > 0
        ) {
          // Give opening preview enemies higher HP so Lv30 weapons showcase damage & overload cleanly
          for (let idx = beforeLen; idx < this.enemies.length; idx++) {
            const spawned = this.enemies[idx];
            spawned.hp *= 6;
            spawned.maxHp *= 6;
          }
        }
      }
    }

    const meleeMult = ctx.meleeDamageMultiplier ?? 1.0;

    // Update enemy movement, knockback, and attacks
    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i];
      if (!e.alive) continue;

      e.animPhase += safeDt * 6;
      if (e.hitFlashTimer > 0) {
        e.hitFlashTimer = Math.max(0, e.hitFlashTimer - safeDt);
      }

      if (e.archetypeId === 'MIRAGE_SPIRIT') {
        e.y = e.baseY + Math.sin(e.animPhase * 0.7) * 6;
      }

      if (e.knockbackVx > 0) {
        e.x = Math.min(470, e.x + e.knockbackVx * safeDt);
        e.knockbackVx = Math.max(0, e.knockbackVx - 460 * safeDt);
      } else {
        const stopX = WALKER_FRONT_X + e.attackRange;
        if (e.x > stopX) {
          e.x = Math.max(stopX, e.x - e.vx * safeDt);
        } else {
          e.attackTimer -= safeDt;
          if (e.attackTimer <= 0) {
            e.attackTimer = e.attackInterval;
            if (e.isRanged) {
              const targetX = WALKER_ANCHOR_X + 18;
              const targetY = WALKER_GROUND_Y - 62;
              const dx = targetX - e.x;
              const dy = targetY - e.y;
              const dist = Math.max(1, Math.hypot(dx, dy));
              const speed = 220;
              this.projectiles.push({
                x: e.x,
                y: e.y,
                vx: (dx / dist) * speed,
                vy: (dy / dist) * speed,
                damage: e.attackDamage,
                color: '#38bdf8',
                alive: true,
              });
            } else {
              const dmg = Math.max(1, Math.round(e.attackDamage * meleeMult));
              hullDamage += dmg;
            }
          }
        }
      }
    }

    // Update ranged enemy projectiles
    const walkerHitX = WALKER_ANCHOR_X + 26;
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      if (!p.alive) {
        this.projectiles.splice(i, 1);
        continue;
      }
      p.x += p.vx * safeDt;
      p.y += p.vy * safeDt;

      if (p.x <= walkerHitX) {
        hullDamage += p.damage;
        p.alive = false;
        this.projectiles.splice(i, 1);
        ctx.particlePool?.spawn({
          kind: 'SPARK',
          x: walkerHitX,
          y: p.y,
          vx: -30,
          vy: -20,
          size: 2.2,
          endSize: 0.5,
          maxLife: 0.18,
          startAlpha: 0.9,
          color: p.color,
        });
      } else if (p.x < -30 || p.x > 480 || p.y < -30 || p.y > 550) {
        this.projectiles.splice(i, 1);
      }
    }

    if (ctx.isInvulnerable || ctx.fsmStateId === 'OPENING_HOOK') {
      hullDamage = 0;
    } else if (hullDamage > 0 && ctx.cameraSystem) {
      ctx.cameraSystem.triggerHitFlash(0.18);
      ctx.cameraSystem.shake(2.8, 0.15);
    }

    const { goldDropped, killedCount } = this.pruneDeadEnemies(ctx.particlePool);

    return {
      hullDamage,
      goldDropped,
      spawnedCount,
      killedCount,
    };
  }

  public pruneDeadEnemies(particlePool?: ParticlePool): {
    goldDropped: number;
    killedCount: number;
  } {
    let goldDropped = 0;
    let killedCount = 0;

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (e.alive && e.hp > 0) continue;

      goldDropped += e.goldReward;
      killedCount += 1;

      if (particlePool) {
        for (let k = 0; k < 6; k++) {
          const angle = (k / 6) * Math.PI * 2;
          particlePool.spawn({
            kind: k % 2 === 0 ? 'SAND_DUST' : 'SPARK',
            x: e.x,
            y: e.y,
            vx: Math.cos(angle) * (40 + this.rng() * 50),
            vy: Math.sin(angle) * (35 + this.rng() * 40) - 20,
            gravity: 90,
            size: 3.0,
            endSize: 0.8,
            maxLife: 0.35,
            startAlpha: 0.85,
            color: e.archetypeId === 'MIRAGE_SPIRIT' ? '#7dd3fc' : '#f6ad55',
          });
        }
      }

      this.eventBus?.emit('combat:enemyKilled', {
        enemyId: e.id,
        archetypeId: e.archetypeId,
        rewardGold: e.goldReward,
        x: e.x,
        y: e.y,
      });

      this.enemies.splice(i, 1);
    }

    return { goldDropped, killedCount };
  }
}
