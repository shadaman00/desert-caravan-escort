import { ObjectPool, type Poolable } from '@/core/ObjectPool';
import {
  BASE_CRIT_CHANCE,
  BASE_CRIT_MULT,
  CAMERA_SHAKE_HEAVY_PX,
  CAMERA_SHAKE_NORMAL_PX,
  ENEMY_BASE_SPECS,
  ENEMY_HIT_FLASH_SEC,
  GOLDEN_COUNTER_MULT,
  GROUND_Y,
  LOGICAL_WIDTH,
  MANUAL_LOCK_DAMAGE_MULT,
  POOL_SIZES,
  SANDWORM_EMERGE_SEC,
  SANDWORM_STUN_SEC,
  SANDWORM_SUBMERGE_SEC,
  SANDWORM_TELEGRAPH_SEC,
  STUNNED_DAMAGE_MULT,
  TOUCH_HIT_RADIUS_PX,
  TURRET_TABLE,
  WALKER_ANCHOR_X,
  WEAKPOINT_CRIT_MULT,
  type EnemyKind,
  type TurretId,
} from '@/data/masterData';

export type SandwormState =
  | 'SUBMERGE'
  | 'TELEGRAPH_WARN'
  | 'EMERGE_STRIKE'
  | 'COUNTERED_STUN';

export interface EnemyEntity extends Poolable {
  id: number;
  kind: EnemyKind;
  isBoss: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  radius: number;
  hp: number;
  maxHp: number;
  defense: number;
  flashTimer: number;
  sandwormState: SandwormState;
  sandwormTimer: number;
  weakPointOffsetX: number;
  weakPointOffsetY: number;
  weakPointExposed: boolean;
  rewardGold: number;
  rewardGears: number;
}

export interface ProjectileEntity extends Poolable {
  turretId: TurretId;
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  isCrit: boolean;
  isManual: boolean;
  splashRadiusPx: number;
  color: string;
}

export interface FloatingTextEntity extends Poolable {
  x: number;
  y: number;
  vy: number;
  text: string;
  color: string;
  isManual: boolean;
  isCrit: boolean;
  remainingSec: number;
}

export interface RelicEntity extends Poolable {
  x: number;
  y: number;
  goldReward: number;
  gearReward: number;
  pulsePhase: number;
}

export interface ShotDamageParams {
  turretId: TurretId;
  turretLevel: number;
  targetTag: string;
  enemyDefense: number;
  isManualLocked: boolean;
  isWeakPointLock: boolean;
  isTargetStunned: boolean;
  critRoll?: number;
}

export interface CombatTickOutput {
  fired: boolean;
  firedTurretId: TurretId | null;
  mortarExploded: boolean;
  enemyHitCrit: boolean;
  sandwormEnteredWarn: boolean;
  sandwormEnteredEmerge: boolean;
  hasActiveBoss: boolean;
  goldEarned: number;
  gearsEarned: number;
  shakePx: number;
  hitstopTriggered: boolean;
  bossTelegraphActive: boolean;
  telegraphX: number;
  sandwormState: SandwormState | null;
  lockedEnemyId: number | null;
  lockedWeakPoint: boolean;
  relicsExcavated: number;
  aimAngleRad: number;
}

export function checkAABB(
  ax: number,
  ay: number,
  aw: number,
  ah: number,
  bx: number,
  by: number,
  bw: number,
  bh: number
): boolean {
  return Math.abs(ax - bx) < (aw + bw) * 0.5 && Math.abs(ay - by) < (ah + bh) * 0.5;
}

export function checkCircle(
  ax: number,
  ay: number,
  ra: number,
  bx: number,
  by: number,
  rb: number
): boolean {
  const dx = ax - bx;
  const dy = ay - by;
  const rSum = ra + rb;
  return dx * dx + dy * dy <= rSum * rSum;
}

/**
 * Pure PRD Section 3.3 damage equation:
 * D_auto = max(1, floor((ATK_base * (1 + 0.15 * (L_turret - 1)) * M_type - DEF_enemy) * C_crit))
 * D_manual = floor(D_auto * 1.5)
 */
export function computeShotDamage(params: ShotDamageParams): {
  damage: number;
  isCrit: boolean;
} {
  const spec = TURRET_TABLE[params.turretId];
  const lvMult = 1 + 0.15 * Math.max(0, params.turretLevel - 1);
  const typeMult = spec.affinityTargets.includes(params.targetTag)
    ? spec.affinityMultiplier
    : 1.0;

  let isCrit = false;
  let critMult = 1.0;
  if (params.isWeakPointLock) {
    isCrit = true;
    critMult = WEAKPOINT_CRIT_MULT;
  } else if ((params.critRoll ?? Math.random()) < BASE_CRIT_CHANCE) {
    isCrit = true;
    critMult = BASE_CRIT_MULT;
  }

  const rawAuto = (spec.baseAtk * lvMult * typeMult - params.enemyDefense) * critMult;
  const dAuto = Math.max(1, Math.floor(rawAuto));
  let finalDamage = params.isManualLocked
    ? Math.floor(dAuto * MANUAL_LOCK_DAMAGE_MULT)
    : dAuto;

  if (params.isTargetStunned) {
    finalDamage = Math.floor(finalDamage * STUNNED_DAMAGE_MULT);
  }

  return { damage: Math.max(1, finalDamage), isCrit };
}

/**
 * Pure deterministic Pooled Combat, Target Lock-On, Relic Excavation & Sandworm 4-Stage FSM.
 * Strictly zero DOM/Canvas references & zero per-frame heap allocation (PRD Sections 2.2 & 8).
 */
export class CombatSystem {
  public readonly enemyPool: ObjectPool<EnemyEntity>;
  public readonly projectilePool: ObjectPool<ProjectileEntity>;
  public readonly floatingTextPool: ObjectPool<FloatingTextEntity>;
  public readonly relicPool: ObjectPool<RelicEntity>;

  private nextEnemyId = 1;
  private fireTimerSec = 0;
  private spawnTimerSec = 1.6;
  private relicSpawnTimerSec = 4.2;
  private lockedEnemyId: number | null = null;
  private lockedWeakPoint = false;
  private aimAngleRad = 0;

  private readonly tickResult: CombatTickOutput = {
    fired: false,
    firedTurretId: null,
    mortarExploded: false,
    enemyHitCrit: false,
    sandwormEnteredWarn: false,
    sandwormEnteredEmerge: false,
    hasActiveBoss: false,
    goldEarned: 0,
    gearsEarned: 0,
    shakePx: 0,
    hitstopTriggered: false,
    bossTelegraphActive: false,
    telegraphX: 640,
    sandwormState: null,
    lockedEnemyId: null,
    lockedWeakPoint: false,
    relicsExcavated: 0,
    aimAngleRad: 0,
  };

  constructor() {
    this.enemyPool = new ObjectPool<EnemyEntity>(
      POOL_SIZES.enemies,
      () => ({
        active: false,
        id: 0,
        kind: 'RAIDER',
        isBoss: false,
        x: 0,
        y: GROUND_Y,
        width: 100,
        height: 82,
        radius: 44,
        hp: 0,
        maxHp: 1,
        defense: 0,
        flashTimer: 0,
        sandwormState: 'EMERGE_STRIKE',
        sandwormTimer: 0,
        weakPointOffsetX: -26,
        weakPointOffsetY: -170,
        weakPointExposed: false,
        rewardGold: 0,
        rewardGears: 0,
      }),
      (e) => {
        e.id = 0;
        e.hp = 0;
        e.flashTimer = 0;
        e.isBoss = false;
        e.weakPointExposed = false;
        e.sandwormTimer = 0;
      }
    );

    this.projectilePool = new ObjectPool<ProjectileEntity>(
      POOL_SIZES.projectiles,
      () => ({
        active: false,
        turretId: 'TUR_01',
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        damage: 0,
        isCrit: false,
        isManual: false,
        splashRadiusPx: 0,
        color: '#FF7043',
      }),
      (p) => {
        p.x = 0;
        p.y = 0;
        p.vx = 0;
        p.vy = 0;
        p.damage = 0;
        p.splashRadiusPx = 0;
      }
    );

    this.floatingTextPool = new ObjectPool<FloatingTextEntity>(
      POOL_SIZES.floatingTexts,
      () => ({
        active: false,
        x: 0,
        y: 0,
        vy: -36,
        text: '',
        color: '#FFFFFF',
        isManual: false,
        isCrit: false,
        remainingSec: 0,
      }),
      (t) => {
        t.text = '';
        t.remainingSec = 0;
        t.isManual = false;
        t.isCrit = false;
      }
    );

    this.relicPool = new ObjectPool<RelicEntity>(
      POOL_SIZES.relics,
      () => ({
        active: false,
        x: 0,
        y: GROUND_Y - 20,
        goldReward: 85,
        gearReward: 1,
        pulsePhase: 0,
      }),
      (r) => {
        r.x = 0;
        r.pulsePhase = 0;
      }
    );
  }

  public releaseAll(): void {
    this.enemyPool.releaseAll();
    this.projectilePool.releaseAll();
    this.floatingTextPool.releaseAll();
    this.relicPool.releaseAll();
    this.lockedEnemyId = null;
    this.lockedWeakPoint = false;
    this.fireTimerSec = 0;
    this.aimAngleRad = 0;
  }

  public spawnEnemy(kind: EnemyKind, x = LOGICAL_WIDTH + 30): EnemyEntity | null {
    const e = this.enemyPool.acquire();
    if (!e) return null;
    const spec = ENEMY_BASE_SPECS[kind];
    e.id = this.nextEnemyId++;
    e.kind = kind;
    e.isBoss = kind !== 'RAIDER';
    e.x = x;
    e.y = GROUND_Y;
    e.width = spec.width;
    e.height = spec.height;
    e.radius = spec.radius;
    e.hp = spec.maxHp;
    e.maxHp = spec.maxHp;
    e.defense = spec.defense;
    e.flashTimer = 0;
    e.rewardGold = spec.rewardGold;
    e.rewardGears = spec.rewardGears;

    if (kind === 'BOSS_SANDWORM') {
      e.sandwormState = 'SUBMERGE';
      e.sandwormTimer = SANDWORM_SUBMERGE_SEC;
      e.weakPointOffsetX = -26;
      e.weakPointOffsetY = -170;
      e.weakPointExposed = false;
    } else {
      e.sandwormState = 'EMERGE_STRIKE';
      e.sandwormTimer = 0;
      e.weakPointOffsetX = 0;
      e.weakPointOffsetY = -Math.round(spec.height * 0.5);
      e.weakPointExposed = false;
    }
    return e;
  }

  public spawnRelic(x = LOGICAL_WIDTH - 40, goldReward = 85, gearReward = 1): RelicEntity | null {
    const r = this.relicPool.acquire();
    if (!r) return null;
    r.x = x;
    r.y = GROUND_Y - 20;
    r.goldReward = goldReward;
    r.gearReward = gearReward;
    r.pulsePhase = 0;
    return r;
  }

  public tryExcavateRelicAt(x: number, y: number): { gold: number; gears: number } | null {
    let found: RelicEntity | null = null;
    this.relicPool.forEachActive((r) => {
      if (!found && checkCircle(x, y, TOUCH_HIT_RADIUS_PX, r.x, r.y, 18)) {
        found = r;
      }
    });
    if (!found) return null;
    const relic = found as RelicEntity;
    const rewards = { gold: relic.goldReward, gears: relic.gearReward };
    this.spawnFloatingText(relic.x, relic.y - 16, `+${rewards.gold}G ⚙️+${rewards.gears}`, '#FDE047', false, false);
    this.relicPool.release(relic);
    return rewards;
  }

  public excavateNearestRelic(): { gold: number; gears: number } | null {
    let nearest: RelicEntity | null = null;
    let bestDist = Number.POSITIVE_INFINITY;
    this.relicPool.forEachActive((r) => {
      const d = Math.abs(r.x - WALKER_ANCHOR_X);
      if (d < bestDist) {
        bestDist = d;
        nearest = r;
      }
    });
    if (!nearest) return null;
    const relic = nearest as RelicEntity;
    const rewards = { gold: relic.goldReward, gears: relic.gearReward };
    this.spawnFloatingText(relic.x, relic.y - 16, `+${rewards.gold}G ⚙️+${rewards.gears}`, '#FDE047', false, false);
    this.relicPool.release(relic);
    return rewards;
  }

  public tryLockOnAt(x: number, y: number): { lockedEnemyId: number | null; weakPoint: boolean } {
    let best: EnemyEntity | null = null;
    let isWeakPoint = false;
    this.enemyPool.forEachActive((e) => {
      if (best) return;
      if (e.kind === 'BOSS_SANDWORM' && e.sandwormState === 'SUBMERGE') return;
      const wpX = e.x + e.weakPointOffsetX;
      const wpY = e.y + e.weakPointOffsetY;
      if (e.weakPointExposed && checkCircle(x, y, TOUCH_HIT_RADIUS_PX, wpX, wpY, 26)) {
        best = e;
        isWeakPoint = true;
        return;
      }
      if (checkCircle(x, y, TOUCH_HIT_RADIUS_PX, e.x, e.y - e.height * 0.5, e.radius)) {
        best = e;
      }
    });

    if (best) {
      const target = best as EnemyEntity;
      this.lockedEnemyId = target.id;
      this.lockedWeakPoint = isWeakPoint;
      return { lockedEnemyId: target.id, weakPoint: isWeakPoint };
    }

    this.lockedEnemyId = null;
    this.lockedWeakPoint = false;
    return { lockedEnemyId: null, weakPoint: false };
  }

  public getBossTelegraphState(): { active: boolean; x: number; sandwormState: SandwormState | null } {
    let active = false;
    let tx = 640;
    let swState: SandwormState | null = null;
    this.enemyPool.forEachActive((e) => {
      if (e.kind === 'BOSS_SANDWORM') {
        swState = e.sandwormState;
        if (e.sandwormState === 'TELEGRAPH_WARN') {
          active = true;
          tx = e.x;
        }
      }
    });
    return { active, x: tx, sandwormState: swState };
  }

  public triggerGoldenCounterBarrage(turretId: TurretId, turretLevel: number): {
    damageDealt: number;
    hitstop: boolean;
    shakePx: number;
  } {
    let damageDealt = 0;
    let hit = false;
    this.enemyPool.forEachActive((e) => {
      if (!e.isBoss && hit) return;
      if (e.kind === 'BOSS_SANDWORM') {
        e.sandwormState = 'COUNTERED_STUN';
        e.sandwormTimer = SANDWORM_STUN_SEC;
        e.weakPointExposed = true;
      }
      const res = computeShotDamage({
        turretId,
        turretLevel,
        targetTag: ENEMY_BASE_SPECS[e.kind].archetypeTag,
        enemyDefense: e.defense,
        isManualLocked: true,
        isWeakPointLock: true,
        isTargetStunned: false,
      });
      const counterDmg = Math.floor(res.damage * GOLDEN_COUNTER_MULT);
      e.hp -= counterDmg;
      e.flashTimer = ENEMY_HIT_FLASH_SEC;
      damageDealt += counterDmg;
      hit = true;
      this.spawnFloatingText(e.x, e.y - e.height - 10, `COUNTER ${counterDmg}!`, '#FDE047', true, true);
    });

    return {
      damageDealt,
      hitstop: hit,
      shakePx: hit ? CAMERA_SHAKE_HEAVY_PX : 0,
    };
  }

  public update(
    dt: number,
    params: {
      equippedTurret: TurretId;
      turretLevel: number;
      fireRateMultiplier: number;
      autoSpawnEnabled?: boolean;
      scrollDeltaPx?: number;
    }
  ): CombatTickOutput {
    const out = this.tickResult;
    out.fired = false;
    out.firedTurretId = null;
    out.mortarExploded = false;
    out.enemyHitCrit = false;
    out.sandwormEnteredWarn = false;
    out.sandwormEnteredEmerge = false;
    out.hasActiveBoss = false;
    out.goldEarned = 0;
    out.gearsEarned = 0;
    out.shakePx = 0;
    out.hitstopTriggered = false;
    out.bossTelegraphActive = false;
    out.sandwormState = null;
    out.relicsExcavated = 0;

    if (params.autoSpawnEnabled !== false) {
      this.spawnTimerSec -= dt;
      if (this.spawnTimerSec <= 0 && this.enemyPool.getActiveCount() < 4) {
        this.spawnTimerSec = 2.6;
        this.spawnEnemy('RAIDER', LOGICAL_WIDTH - 24);
      }
      this.relicSpawnTimerSec -= dt;
      if (this.relicSpawnTimerSec <= 0 && this.relicPool.getActiveCount() < 2) {
        this.relicSpawnTimerSec = 6.5;
        this.spawnRelic(LOGICAL_WIDTH - 50, 75, 1);
      }
    }

    // Update relics scrolling left with terrain
    const relicScroll = params.scrollDeltaPx ?? 45 * dt * 2.2;
    this.relicPool.forEachActive((r) => {
      r.x -= relicScroll;
      r.pulsePhase += dt * 5;
      if (r.x < -30) {
        this.relicPool.release(r);
      }
    });

    // Update enemies & Apophis Sandworm 4-Stage FSM
    let lockedFound: EnemyEntity | null = null;
    let firstTarget: EnemyEntity | null = null;

    this.enemyPool.forEachActive((e) => {
      if (e.flashTimer > 0) {
        e.flashTimer = Math.max(0, e.flashTimer - dt);
      }

      if (e.kind === 'BOSS_SANDWORM') {
        e.sandwormTimer -= dt;
        if (e.sandwormState === 'SUBMERGE') {
          e.x = Math.max(520, e.x - ENEMY_BASE_SPECS.BOSS_SANDWORM.speedPxPerSec * dt);
          e.weakPointExposed = false;
          if (e.sandwormTimer <= 0) {
            e.sandwormState = 'TELEGRAPH_WARN';
            e.sandwormTimer = SANDWORM_TELEGRAPH_SEC;
            out.sandwormEnteredWarn = true;
          }
        } else if (e.sandwormState === 'TELEGRAPH_WARN') {
          e.weakPointExposed = false;
          if (e.sandwormTimer <= 0) {
            e.sandwormState = 'EMERGE_STRIKE';
            e.sandwormTimer = SANDWORM_EMERGE_SEC;
            e.weakPointExposed = true;
            out.sandwormEnteredEmerge = true;
          }
        } else if (e.sandwormState === 'EMERGE_STRIKE') {
          e.weakPointExposed = true;
          if (e.sandwormTimer <= 0) {
            e.sandwormState = 'SUBMERGE';
            e.sandwormTimer = SANDWORM_SUBMERGE_SEC;
            e.weakPointExposed = false;
          }
        } else if (e.sandwormState === 'COUNTERED_STUN') {
          e.weakPointExposed = true;
          if (e.sandwormTimer <= 0) {
            e.sandwormState = 'SUBMERGE';
            e.sandwormTimer = SANDWORM_SUBMERGE_SEC;
            e.weakPointExposed = false;
          }
        }
        out.sandwormState = e.sandwormState;
        if (e.sandwormState === 'TELEGRAPH_WARN') {
          out.bossTelegraphActive = true;
          out.telegraphX = e.x;
        }
      } else {
        const stopX = e.isBoss ? 730 : WALKER_ANCHOR_X + 230;
        if (e.x > stopX) {
          e.x = Math.max(stopX, e.x - ENEMY_BASE_SPECS[e.kind].speedPxPerSec * dt);
        }
      }

      if (e.hp <= 0) {
        out.goldEarned += e.rewardGold;
        out.gearsEarned += e.rewardGears;
        if (this.lockedEnemyId === e.id) {
          this.lockedEnemyId = null;
          this.lockedWeakPoint = false;
        }
        this.enemyPool.release(e);
        return;
      }

      const targetable = !(e.kind === 'BOSS_SANDWORM' && e.sandwormState === 'SUBMERGE');
      if (e.isBoss) {
        out.hasActiveBoss = true;
      }
      if (targetable) {
        if (!firstTarget) firstTarget = e;
        if (this.lockedEnemyId === e.id) lockedFound = e;
      }
    });

    const chosenTarget = (lockedFound ?? firstTarget) as EnemyEntity | null;
    if (!lockedFound && this.lockedEnemyId !== null) {
      this.lockedEnemyId = null;
      this.lockedWeakPoint = false;
    }

    // Turret auto-fire along cooldown / fireRateMultiplier
    const turretSpec = TURRET_TABLE[params.equippedTurret];
    this.fireTimerSec -= dt * Math.max(0.25, params.fireRateMultiplier);
    if (chosenTarget && this.fireTimerSec <= 0) {
      this.fireTimerSec = turretSpec.cooldownSec;
      out.fired = true;
      out.firedTurretId = params.equippedTurret;

      const isManual = lockedFound !== null && chosenTarget.id === this.lockedEnemyId;
      const aimX = isManual && this.lockedWeakPoint
        ? chosenTarget.x + chosenTarget.weakPointOffsetX
        : chosenTarget.x;
      const aimY = isManual && this.lockedWeakPoint
        ? chosenTarget.y + chosenTarget.weakPointOffsetY
        : chosenTarget.y - chosenTarget.height * 0.5;

      const startX = WALKER_ANCHOR_X + 42;
      const startY = GROUND_Y - 114;
      const dx = aimX - startX;
      const dy = aimY - startY;
      this.aimAngleRad = Math.atan2(dy, Math.max(20, dx));

      const p = this.projectilePool.acquire();
      if (p) {
        const speed = params.equippedTurret === 'TUR_02' ? 980 : 620;
        const len = Math.max(1, Math.hypot(dx, dy));
        const shot = computeShotDamage({
          turretId: params.equippedTurret,
          turretLevel: params.turretLevel,
          targetTag: ENEMY_BASE_SPECS[chosenTarget.kind].archetypeTag,
          enemyDefense: chosenTarget.defense,
          isManualLocked: isManual,
          isWeakPointLock: isManual && this.lockedWeakPoint,
          isTargetStunned:
            chosenTarget.kind === 'BOSS_SANDWORM' && chosenTarget.sandwormState === 'COUNTERED_STUN',
        });

        p.turretId = params.equippedTurret;
        p.x = startX;
        p.y = startY;
        p.vx = (dx / len) * speed;
        p.vy = (dy / len) * speed;
        p.damage = shot.damage;
        p.isCrit = shot.isCrit;
        p.isManual = isManual;
        p.splashRadiusPx = turretSpec.splashRadiusPx;
        p.color =
          params.equippedTurret === 'TUR_02'
            ? '#00E5FF'
            : params.equippedTurret === 'TUR_03'
              ? '#FFB300'
              : '#FF7043';
      }
    }

    // Move pooled projectiles & resolve collisions via checkAABB / checkCircle
    this.projectilePool.forEachActive((p) => {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.x > LOGICAL_WIDTH + 40 || p.y > GROUND_Y + 20 || p.y < -20) {
        this.projectilePool.release(p);
        return;
      }

      let hitEnemy: EnemyEntity | null = null;
      this.enemyPool.forEachActive((e) => {
        if (hitEnemy) return;
        if (e.kind === 'BOSS_SANDWORM' && e.sandwormState === 'SUBMERGE') return;
        if (
          checkCircle(p.x, p.y, 8, e.x, e.y - e.height * 0.5, e.radius) ||
          checkAABB(p.x, p.y, 12, 12, e.x, e.y - e.height * 0.5, e.width, e.height)
        ) {
          hitEnemy = e;
        }
      });

      if (hitEnemy) {
        const directTarget = hitEnemy as EnemyEntity;
        this.applyImpact(directTarget, p, out);
        this.projectilePool.release(p);
      }
    });

    // Update floating damage texts
    this.floatingTextPool.forEachActive((t) => {
      t.y += t.vy * dt;
      t.remainingSec -= dt;
      if (t.remainingSec <= 0) {
        this.floatingTextPool.release(t);
      }
    });

    out.lockedEnemyId = this.lockedEnemyId;
    out.lockedWeakPoint = this.lockedWeakPoint;
    out.aimAngleRad = this.aimAngleRad;
    return out;
  }

  private applyImpact(
    primary: EnemyEntity,
    proj: ProjectileEntity,
    out: CombatTickOutput
  ): void {
    const applyToEnemy = (target: EnemyEntity, dmg: number) => {
      target.hp -= dmg;
      target.flashTimer = ENEMY_HIT_FLASH_SEC;
      if (proj.isCrit || proj.isManual) {
        out.enemyHitCrit = true;
      }
      if (proj.turretId === 'TUR_03') {
        out.mortarExploded = true;
      }
      if (target.isBoss && (proj.isManual || proj.isCrit)) {
        out.hitstopTriggered = true;
      }
      out.shakePx = Math.max(
        out.shakePx,
        target.isBoss ? CAMERA_SHAKE_HEAVY_PX : CAMERA_SHAKE_NORMAL_PX
      );
      this.spawnFloatingText(
        target.x,
        Math.max(18, target.y - target.height - 10),
        `${dmg}${proj.isCrit ? '!' : ''}`,
        proj.isManual ? '#FF5252' : proj.isCrit ? '#FDE047' : '#FFFFFF',
        proj.isManual,
        proj.isCrit
      );
    };

    applyToEnemy(primary, proj.damage);

    if (proj.splashRadiusPx > 0) {
      this.enemyPool.forEachActive((other) => {
        if (other.id === primary.id) return;
        if (other.kind === 'BOSS_SANDWORM' && other.sandwormState === 'SUBMERGE') return;
        if (checkCircle(primary.x, primary.y, proj.splashRadiusPx, other.x, other.y, other.radius)) {
          applyToEnemy(other, Math.max(1, Math.floor(proj.damage * 0.65)));
        }
      });
    }
  }

  public spawnFloatingText(
    x: number,
    y: number,
    text: string,
    color: string,
    isManual: boolean,
    isCrit: boolean
  ): void {
    const ft = this.floatingTextPool.acquire();
    if (!ft) return;
    ft.x = x;
    ft.y = y;
    ft.vy = -34;
    ft.text = text;
    ft.color = color;
    ft.isManual = isManual;
    ft.isCrit = isCrit;
    ft.remainingSec = 0.75;
  }
}
