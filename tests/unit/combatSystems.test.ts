import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useGameStore } from '@/store/gameStore';
import type { EnemyArchetypeTag } from '@/store/types';
import {
  DamageSystem,
  calculateDamage,
  resolveDamageBreakdown,
  type CombatTarget,
} from '@/engine/systems/DamageSystem';
import {
  TurretSystem,
  computeParabolicShellPosition,
  findSnapTarget,
  pointToSegmentDistance,
  resolveEffectiveTurretStats,
} from '@/engine/systems/TurretSystem';
import { CombatCoordinator } from '@/engine/systems/CombatCoordinator';
import { Renderer } from '@/engine/render/Renderer';
import { ParallaxSystem } from '@/engine/systems/ParallaxSystem';
import { CameraSystem } from '@/engine/systems/CameraSystem';
import {
  SandwalkerRig,
  TURRET_SWITCH_DURATION,
  computeTurretMuzzleWorldPos,
  drawSandwalkerTurret,
} from '@/engine/render/draw/sandwalker';
import { ParticlePool } from '@/engine/render/draw/particles';
import {
  MORTAR_AOE_RADIUS_PX,
  TURRET_CONFIGS,
  TURRET_SWITCH_COOLDOWN_SEC,
} from '@/game/data/turrets';
import { statAt } from '@/game/formulas';
import { clientToZoneB } from '@/app/scale';
import {
  drawDamagePopups,
  drawHarpoons,
  drawHeatRayBeam,
  drawMortarsAndExplosions,
  drawWeakPointReticle,
} from '@/engine/render/draw/projectiles';

function makeTarget(overrides: Partial<CombatTarget> = {}): CombatTarget {
  return {
    id: overrides.id ?? 'target_1',
    x: overrides.x ?? 320,
    y: overrides.y ?? 398,
    radius: overrides.radius ?? 14,
    hp: overrides.hp ?? 200,
    maxHp: overrides.maxHp ?? 200,
    armor: overrides.armor ?? 0,
    maxArmor: overrides.maxArmor ?? 0,
    weakPointOffset: overrides.weakPointOffset ?? { x: 0, y: 0 },
    tags: overrides.tags ?? [],
    isWeakPoint: overrides.isWeakPoint ?? false,
    knockbackImmune: overrides.knockbackImmune ?? false,
    alive: overrides.alive ?? true,
    hitFlashTimer: 0,
    knockbackVx: 0,
  };
}

function createMockCtx(): CanvasRenderingContext2D {
  const grad = { addColorStop: vi.fn() };
  return {
    save: vi.fn(),
    restore: vi.fn(),
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    closePath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    bezierCurveTo: vi.fn(),
    arc: vi.fn(),
    ellipse: vi.fn(),
    rect: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    scale: vi.fn(),
    setLineDash: vi.fn(),
    strokeText: vi.fn(),
    fillText: vi.fn(),
    createRadialGradient: vi.fn(() => grad),
    createLinearGradient: vi.fn(() => grad),
    globalAlpha: 1,
    fillStyle: '#000',
    strokeStyle: '#000',
    lineWidth: 1,
    lineCap: 'butt',
    font: '12px sans-serif',
    textAlign: 'center',
    textBaseline: 'middle',
  } as unknown as CanvasRenderingContext2D;
}

class MockPath2D {
  moveTo = vi.fn();
  lineTo = vi.fn();
  closePath = vi.fn();
  ellipse = vi.fn();
  rect = vi.fn();
  arc = vi.fn();
  quadraticCurveTo = vi.fn();
}

describe('Combat Systems (#16–#21, #23 Turret Synergy)', () => {
  beforeEach(() => {
    useGameStore.getState().resetToDefaults();
  });

  describe('#16 Real-Time 3-Turret Switching & Muzzle Geometry', () => {
    it('enforces 0.3s switch cooldown and clears active beam on swap', () => {
      const damageSystem = new DamageSystem();
      const turretSystem = new TurretSystem(damageSystem);
      const store = useGameStore.getState();

      expect(store.sandwalker.activeTurret).toBe('HEAT_RAY');
      expect(turretSystem.requestSwitch('HARPOON', useGameStore.getState())).toBe(true);
      expect(useGameStore.getState().sandwalker.activeTurret).toBe('HARPOON');
      expect(turretSystem.getSwitchCooldownRemaining()).toBeCloseTo(TURRET_SWITCH_COOLDOWN_SEC);

      // Rejected while cooldown remaining (0.15s < 0.3s)
      turretSystem.update(0.15, {
        fsmStateId: 'MARCH_NORMAL',
        storeState: useGameStore.getState(),
        targets: [],
        hullBobY: 0,
      });
      expect(turretSystem.requestSwitch('MORTAR', useGameStore.getState())).toBe(false);
      expect(useGameStore.getState().sandwalker.activeTurret).toBe('HARPOON');

      // Succeeds after remaining 0.15s elapses
      turretSystem.update(0.16, {
        fsmStateId: 'MARCH_NORMAL',
        storeState: useGameStore.getState(),
        targets: [],
        hullBobY: 0,
      });
      expect(turretSystem.getSwitchCooldownRemaining()).toBe(0);
      expect(turretSystem.requestSwitch('MORTAR', useGameStore.getState())).toBe(true);
      expect(useGameStore.getState().sandwalker.activeTurret).toBe('MORTAR');
    });

    it('runs 0.15s barrel swap animation on SandwalkerRig', () => {
      const rig = new SandwalkerRig();
      rig.triggerTurretSwitch('HARPOON');
      expect(rig.lastTurret).toBe('HARPOON');
      expect(rig.switchAnimTimer).toBeCloseTo(TURRET_SWITCH_DURATION);

      rig.update(0.08, 120);
      expect(rig.switchAnimTimer).toBeCloseTo(0.07);

      rig.update(0.08, 120);
      expect(rig.switchAnimTimer).toBe(0);
    });

    it('computes exact turret muzzle world position across tiers 1..3', () => {
      const t1 = computeTurretMuzzleWorldPos({
        hullBobY: 0,
        turret: 'HEAT_RAY',
        barrelCount: 1,
        aimAngle: 0,
      });
      const t2 = computeTurretMuzzleWorldPos({
        hullBobY: 0,
        turret: 'HEAT_RAY',
        barrelCount: 2,
        aimAngle: 0,
      });
      const t3 = computeTurretMuzzleWorldPos({
        hullBobY: 0,
        turret: 'HEAT_RAY',
        barrelCount: 3,
        aimAngle: 0,
      });

      expect(t1.tierScale).toBeCloseTo(1.0);
      expect(t2.tierScale).toBeCloseTo(1.1);
      expect(t3.tierScale).toBeCloseTo(1.2);
      expect(t1.x).toBeCloseTo(200 + 30);
      expect(t2.x).toBeCloseTo(200 + 30 * 1.1);
      expect(t3.x).toBeCloseTo(200 + 30 * 1.2);
    });
  });

  describe('#17 Heat Ray Piercing Beam', () => {
    it('ticks every 0.1s at 40 Lv1 DPS (4 damage per tick)', () => {
      const damageSystem = new DamageSystem();
      const turretSystem = new TurretSystem(damageSystem);
      const target = makeTarget({ x: 320, y: 316, hp: 100, maxHp: 100 });

      // 0.05s -> 0 ticks
      turretSystem.update(0.05, {
        fsmStateId: 'MARCH_NORMAL',
        storeState: useGameStore.getState(),
        targets: [target],
        hullBobY: 0,
      });
      expect(target.hp).toBe(100);

      // +0.05s = 0.10s -> 1 tick (4 dmg)
      turretSystem.update(0.05, {
        fsmStateId: 'MARCH_NORMAL',
        storeState: useGameStore.getState(),
        targets: [target],
        hullBobY: 0,
      });
      expect(target.hp).toBe(96);

      // +0.20s = 0.30s -> 2 more ticks (total 3 ticks = 12 dmg)
      turretSystem.update(0.2, {
        fsmStateId: 'MARCH_NORMAL',
        storeState: useGameStore.getState(),
        targets: [target],
        hullBobY: 0,
      });
      expect(target.hp).toBe(88);
    });

    it('pierces all aligned targets along the beam segment and misses off-axis targets', () => {
      const damageSystem = new DamageSystem();
      const turretSystem = new TurretSystem(damageSystem);
      const t1 = makeTarget({ id: 't1', x: 270, y: 316, hp: 100 });
      const t2 = makeTarget({ id: 't2', x: 330, y: 316, hp: 100 });
      const t3 = makeTarget({ id: 't3', x: 390, y: 316, hp: 100 });
      const offAxis = makeTarget({ id: 'off', x: 330, y: 180, hp: 100 });

      turretSystem.update(0.1, {
        fsmStateId: 'MARCH_NORMAL',
        storeState: useGameStore.getState(),
        targets: [t1, t2, t3, offAxis],
        hullBobY: 0,
      });

      expect(t1.hp).toBe(96);
      expect(t2.hp).toBe(96);
      expect(t3.hp).toBe(96);
      expect(offAxis.hp).toBe(100);
      expect(pointToSegmentDistance(330, 316, 230, 316, 730, 316)).toBe(0);
    });
  });

  describe('#18 Harpoon Armor Piercing & Knockback', () => {
    it('fires on 1.0s interval, hits first target only, crushes armor, and knocks back +X', () => {
      const damageSystem = new DamageSystem();
      const turretSystem = new TurretSystem(damageSystem);
      useGameStore.getState().switchTurret('HARPOON');

      const front = makeTarget({
        id: 'front',
        x: 290,
        y: 316,
        hp: 200,
        maxHp: 200,
        armor: 150,
        maxArmor: 150,
        tags: ['HEAVY_ARMOR'],
      });
      const back = makeTarget({
        id: 'back',
        x: 370,
        y: 316,
        hp: 200,
        maxHp: 200,
        tags: ['HEAVY_ARMOR'],
      });

      // Step 1.0s to fire, then advance 0.15s for 760px/s harpoon flight (~114px)
      turretSystem.update(1.0, {
        fsmStateId: 'MARCH_NORMAL',
        storeState: useGameStore.getState(),
        targets: [front, back],
        hullBobY: 0,
      });
      for (let i = 0; i < 10; i++) {
        turretSystem.update(0.016, {
          fsmStateId: 'MARCH_NORMAL',
          storeState: useGameStore.getState(),
          targets: [front, back],
          hullBobY: 0,
        });
      }

      // 55 * 2.2 (HEAVY_ARMOR) = 121 HP dmg, 121 * 2.0 (armorCrushFactor) = 242 armor dmg
      expect(front.hp).toBe(79);
      expect(front.armor).toBe(0);
      expect(front.x > 290).toBe(true);
      expect((front.knockbackVx ?? 0) > 0).toBe(true);

      // Second enemy behind is NOT pierced
      expect(back.hp).toBe(200);
    });

    it('skips knockback when target is knockbackImmune', () => {
      const damageSystem = new DamageSystem();
      const turretSystem = new TurretSystem(damageSystem);
      useGameStore.getState().switchTurret('HARPOON');

      const boss = makeTarget({
        id: 'boss_shell',
        x: 310,
        y: 316,
        hp: 500,
        maxHp: 500,
        tags: ['WORM_HEAD_SHELL'],
        knockbackImmune: true,
      });

      turretSystem.update(1.0, {
        fsmStateId: 'BOSS_ENCOUNTER',
        storeState: useGameStore.getState(),
        targets: [boss],
        hullBobY: 0,
      });
      for (let i = 0; i < 12; i++) {
        turretSystem.update(0.016, {
          fsmStateId: 'BOSS_ENCOUNTER',
          storeState: useGameStore.getState(),
          targets: [boss],
          hullBobY: 0,
        });
      }

      expect(boss.hp).toBe(500 - 110); // 55 * 2.0 = 110
      expect(boss.x).toBe(310);
      expect(boss.knockbackVx).toBe(0);
    });
  });

  describe('#19 Mortar Parabolic AOE', () => {
    it('follows y = y0 + vy0*t + 0.5*g*t^2 and damages all enemies inside 90px radius', () => {
      const damageSystem = new DamageSystem();
      const turretSystem = new TurretSystem(damageSystem);
      const particles = new ParticlePool(300);
      useGameStore.getState().switchTurret('MORTAR');

      const center = makeTarget({ id: 'c', x: 330, y: 398, radius: 13, hp: 150, tags: ['SMALL_SWARM'] });
      const edgeIn = makeTarget({ id: 'in', x: 330 + 85, y: 398, radius: 13, hp: 150, tags: ['SMALL_SWARM'] });
      const farOut = makeTarget({ id: 'out', x: 330 + 115, y: 398, radius: 13, hp: 150 });

      // Fire at 1.5s
      turretSystem.update(1.5, {
        fsmStateId: 'MARCH_NORMAL',
        storeState: useGameStore.getState(),
        targets: [center, edgeIn, farOut],
        hullBobY: 0,
        particlePool: particles,
      });

      const snapMid = turretSystem.getRenderState();
      expect(snapMid.mortars.length).toBe(1);
      const shell = snapMid.mortars[0];
      const posHalf = computeParabolicShellPosition(shell, shell.flightDuration * 0.5);
      expect(posHalf.y).toBeCloseTo(
        shell.y0 + shell.vy0 * (shell.flightDuration * 0.5) + 0.5 * shell.g * Math.pow(shell.flightDuration * 0.5, 2)
      );

      // Step through remaining flight
      for (let i = 0; i < 65; i++) {
        turretSystem.update(0.016, {
          fsmStateId: 'MARCH_NORMAL',
          storeState: useGameStore.getState(),
          targets: [center, edgeIn, farOut],
          hullBobY: 0,
          particlePool: particles,
        });
      }

      // 52.5 * 2.0 (SMALL_SWARM) = 105
      expect(MORTAR_AOE_RADIUS_PX).toBe(90);
      expect(center.hp).toBe(45);
      expect(edgeIn.hp).toBe(45);
      expect(farOut.hp).toBe(150);
      expect(particles.getActiveCount() > 0).toBe(true);
      expect(turretSystem.getRenderState().explosions.length > 0).toBe(true);
    });
  });

  describe('#20 Weapon Affinity Engine (Decision D8) & #23 Turret Synergy', () => {
    it('enforces single highest multiplier on multi-tag enemies (never multiplicative stacking)', () => {
      const multiParasite: EnemyArchetypeTag[] = ['SINGLE_LARGE_BOSS', 'PARASITE'];
      const dmgMortar = calculateDamage(
        { turret: 'MORTAR', level: 1, baseDamage: 100 },
        multiParasite
      );
      expect(dmgMortar).toBe(220);
      // Explicitly prove NOT 0.8 * 2.2 = 1.76 -> 176
      expect(dmgMortar).not.toBe(Math.round(100 * 0.8 * 2.2));

      const multiArmor: EnemyArchetypeTag[] = ['HEAVY_ARMOR', 'SMALL_SWARM'];
      const dmgHarpoon = calculateDamage(
        { turret: 'HARPOON', level: 1, baseDamage: 100 },
        multiArmor
      );
      expect(dmgHarpoon).toBe(220);

      const multiMirage: EnemyArchetypeTag[] = ['MIRAGE', 'HEAVY_ARMOR'];
      const dmgLaser = calculateDamage(
        { turret: 'HEAT_RAY', level: 1, baseDamage: 100 },
        multiMirage
      );
      expect(dmgLaser).toBe(200);
    });

    it('applies statAt scaling and +25% party attack when all 5 mercenaries are unlocked', () => {
      const store = useGameStore.getState();
      // Unlock 4/5 mercenaries -> no synergy yet
      store.unlockMercenary('harun');
      store.unlockMercenary('sera');
      store.unlockMercenary('zara');
      store.unlockMercenary('tarik');

      const baseProfile = {
        turret: 'HARPOON' as const,
        level: 5,
        baseDamage: TURRET_CONFIGS.HARPOON.baseDamagePerHit,
        synergyActive: false,
      };
      const dmgNoSynergy = calculateDamage(baseProfile, ['MIRAGE']);
      expect(dmgNoSynergy).toBe(Math.round(statAt(55, 5)));

      // Unlock 5th mercenary -> +25% synergy active
      store.unlockMercenary('lili');
      const dmgWithSynergy = calculateDamage(
        { ...baseProfile, synergyActive: true },
        ['MIRAGE']
      );
      expect(dmgWithSynergy).toBe(Math.round(statAt(55, 5) * 1.25));

      const breakdown = resolveDamageBreakdown(
        { turret: 'HEAT_RAY', level: 1, baseDamage: 40, synergyActive: true },
        ['MIRAGE']
      );
      expect(breakdown.affinityMultiplier).toBe(2.0);
      expect(breakdown.synergyMultiplier).toBe(1.25);
      expect(breakdown.finalDamage).toBe(100);
    });
  });

  describe('#21 Manual Weak-Point Drag Aim', () => {
    it('maps Zone B coordinates via clientToZoneB and snaps within 40px radius', () => {
      const rect = { left: 100, top: 200, width: 860, height: 1024 } as DOMRect;
      const pt = clientToZoneB(100 + 430, 200 + 512, rect);
      expect(pt.x).toBeCloseTo(215);
      expect(pt.y).toBeCloseTo(256);

      const t1 = makeTarget({
        id: 't_reg',
        x: 300,
        y: 350,
        weakPointOffset: { x: 0, y: 0 },
      });
      const tWeak = makeTarget({
        id: 't_wp',
        x: 315,
        y: 355,
        weakPointOffset: { x: -5, y: -5 }, // weak point at (310, 350)
        isWeakPoint: true,
      });

      // 39px from t_reg -> snaps
      expect(findSnapTarget(339, 350, [t1])?.id).toBe('t_reg');
      // 41px from t_reg -> misses
      expect(findSnapTarget(341, 350, [t1])).toBeNull();
      // Both in range -> prefers isWeakPoint
      expect(findSnapTarget(305, 350, [t1, tWeak])?.id).toBe('t_wp');
    });

    it('holds manualAimTargetId for 2.0s after release and clears on expiry or death', () => {
      const damageSystem = new DamageSystem();
      const turretSystem = new TurretSystem(damageSystem);
      const tClose = makeTarget({ id: 'close', x: 250, y: 316, hp: 500 });
      const tBack = makeTarget({
        id: 'back_wp',
        x: 380,
        y: 316,
        hp: 500,
        weakPointOffset: { x: -6, y: -14 }, // weak point at (374, 302)
      });

      const snapped = turretSystem.onPointerDown(
        374,
        302,
        [tClose, tBack],
        useGameStore.getState().setManualAimTarget
      );
      expect(snapped?.id).toBe('back_wp');
      expect(useGameStore.getState().sandwalker.manualAimTargetId).toBe('back_wp');

      turretSystem.onPointerUp();
      expect(turretSystem.getLockRemainingSec()).toBeCloseTo(2.0);

      // Turret prioritizes manually locked target over closer enemy
      const sel = turretSystem.selectTarget(
        [tClose, tBack],
        useGameStore.getState().sandwalker.manualAimTargetId
      );
      expect(sel.target?.id).toBe('back_wp');
      expect(sel.isManualLocked).toBe(true);

      // Still locked at 1.9s
      turretSystem.update(1.9, {
        fsmStateId: 'MARCH_NORMAL',
        storeState: useGameStore.getState(),
        setManualAimTarget: useGameStore.getState().setManualAimTarget,
        targets: [tClose, tBack],
        hullBobY: 0,
      });
      expect(useGameStore.getState().sandwalker.manualAimTargetId).toBe('back_wp');

      // Cleared at >= 2.0s
      turretSystem.update(0.15, {
        fsmStateId: 'MARCH_NORMAL',
        storeState: useGameStore.getState(),
        setManualAimTarget: useGameStore.getState().setManualAimTarget,
        targets: [tClose, tBack],
        hullBobY: 0,
      });
      expect(useGameStore.getState().sandwalker.manualAimTargetId).toBeNull();

      // Re-lock and verify immediate clear on target death
      turretSystem.onPointerDown(
        374,
        302,
        [tClose, tBack],
        useGameStore.getState().setManualAimTarget
      );
      turretSystem.onPointerUp();
      tBack.alive = false;
      tBack.hp = 0;

      turretSystem.update(0.05, {
        fsmStateId: 'MARCH_NORMAL',
        storeState: useGameStore.getState(),
        setManualAimTarget: useGameStore.getState().setManualAimTarget,
        targets: [tClose, tBack],
        hullBobY: 0,
      });
      expect(useGameStore.getState().sandwalker.manualAimTargetId).toBeNull();
    });
  });

  describe('Procedural Projectile & Reticle Render Smoke (Node)', () => {
    it('draws beam, harpoons, mortars, explosions, reticle, and popups without DOM', () => {
      vi.stubGlobal('Path2D', MockPath2D);
      const ctx = createMockCtx();
      const target = makeTarget({ id: 't_smoke', x: 320, y: 360 });

      drawHeatRayBeam(ctx, {
        x1: 230,
        y1: 316,
        x2: 430,
        y2: 316,
        tier: 3,
        barrelCount: 3,
        alpha: 0.9,
      });
      drawHarpoons(ctx, [
        {
          id: 1,
          x: 310,
          y: 320,
          vx: 760,
          vy: 0,
          originX: 237,
          originY: 316,
          tier: 2,
          level: 1,
          synergyActive: true,
          isWeakPointHit: false,
          state: 'FLYING',
          retractTimer: 0,
          retractStartX: 0,
          retractStartY: 0,
        },
      ]);
      drawMortarsAndExplosions(
        ctx,
        [
          {
            id: 2,
            x0: 226,
            y0: 316,
            vx: 150,
            vy0: -120,
            g: 520,
            elapsed: 0.25,
            flightDuration: 0.7,
            x: 263,
            y: 302,
            targetX: 330,
            targetY: 398,
            tier: 1,
            level: 1,
            synergyActive: false,
            isWeakPointHit: false,
          },
        ],
        [{ x: 330, y: 398, radius: 90, age: 0.1, maxLife: 0.35, tier: 2 }]
      );
      drawWeakPointReticle(
        ctx,
        {
          isDragging: true,
          pointerX: 320,
          pointerY: 360,
          lockedTargetId: 't_smoke',
          lockRemainingSec: 1.5,
        },
        [target],
        1.2
      );
      drawDamagePopups(ctx, [
        {
          x: 320,
          y: 340,
          vy: -30,
          text: '121!',
          age: 0.1,
          maxLife: 0.65,
          color: '#ecc94b',
          scale: 1.2,
        },
      ]);

      expect(ctx.stroke).toHaveBeenCalled();
      vi.unstubAllGlobals();
    });
  });

  describe('Opening 0-30s Lv30 / Tier 3 Turret Preview & Weak-Point Precision', () => {
    it('resolves Lv30 / Tier 3 stats for HEAT_RAY, HARPOON, and MORTAR during preview without mutating store', () => {
      const store = useGameStore.getState();
      expect(store.sandwalker.turretLevels.HEAT_RAY).toBe(1);
      expect(store.sandwalker.turretTiers.HEAT_RAY).toBe(1);

      expect(resolveEffectiveTurretStats('HEAT_RAY', store, true)).toEqual({
        level: 30,
        tier: 3,
        barrelCount: 3,
      });
      expect(resolveEffectiveTurretStats('HEAT_RAY', store, false)).toEqual({
        level: 1,
        tier: 1,
        barrelCount: 1,
      });

      // HEAT_RAY preview tick
      const dmgSys = new DamageSystem();
      const turretSys = new TurretSystem(dmgSys);
      const target = makeTarget({ id: 'open_t1', x: 320, y: 316, hp: 1000, maxHp: 1000, tags: [] });
      turretSys.update(0.1, {
        fsmStateId: 'OPENING_HOOK',
        openingElapsedSeconds: 5,
        storeState: useGameStore.getState(),
        targets: [target],
        hullBobY: 0,
      });

      const expectedPreviewDmg = Math.round(statAt(4.0, 30) * 1.25); // 37
      expect(target.hp).toBe(1000 - expectedPreviewDmg);
      expect(turretSys.getRenderState().activeBeam?.tier).toBe(3);
      expect(turretSys.getRenderState().activeBeam?.barrelCount).toBe(3);

      // HARPOON & MORTAR preview projectiles
      useGameStore.getState().switchTurret('HARPOON');
      turretSys.update(1.0, {
        fsmStateId: 'OPENING_HOOK',
        forcePreviewAll: true,
        storeState: useGameStore.getState(),
        targets: [target],
        hullBobY: 0,
      });
      expect(turretSys.getRenderState().harpoons.length).toBe(1);
      expect(turretSys.getRenderState().harpoons[0].tier).toBe(3);
      expect(turretSys.getRenderState().harpoons[0].level).toBe(30);

      useGameStore.getState().switchTurret('MORTAR');
      turretSys.update(1.5, {
        fsmStateId: 'OPENING_HOOK',
        forcePreviewAll: true,
        storeState: useGameStore.getState(),
        targets: [target],
        hullBobY: 0,
      });
      expect(turretSys.getRenderState().mortars.length).toBe(1);
      expect(turretSys.getRenderState().mortars[0].tier).toBe(3);
      expect(turretSys.getRenderState().mortars[0].level).toBe(30);

      // Persistent store remains Lv1 / Tier 1
      const finalStore = useGameStore.getState();
      expect(finalStore.sandwalker.turretLevels).toEqual({ HEAT_RAY: 1, HARPOON: 1, MORTAR: 1 });
      expect(finalStore.sandwalker.turretTiers).toEqual({ HEAT_RAY: 1, HARPOON: 1, MORTAR: 1 });
    });

    it('enforces CombatCoordinator 30.0s cutoff and state gating for turret preview', () => {
      const coordinator = new CombatCoordinator();
      const targetAt29 = coordinator.spawnSystem.addEnemy('DESERT_BANDIT', 1, {
        x: 320,
        y: 316,
        hp: 1000,
      });
      targetAt29.tags = [];

      // 29.9s in OPENING_HOOK -> preview active (Lv30 + 1.25x synergy = 37 dmg)
      coordinator.update(0.1, 'OPENING_HOOK', useGameStore.getState(), useGameStore.getState(), {
        openingElapsedSeconds: 29.9,
      });
      expect(targetAt29.hp).toBe(1000 - 37);
      expect(coordinator.turretSystem.getRenderState().activeBeam?.tier).toBe(3);

      // 30.0s in OPENING_HOOK -> preview inactive (Lv1 non-synergy = 4 dmg)
      const hpBefore30 = targetAt29.hp;
      coordinator.update(0.1, 'OPENING_HOOK', useGameStore.getState(), useGameStore.getState(), {
        openingElapsedSeconds: 30.0,
      });
      expect(targetAt29.hp).toBe(hpBefore30 - 4);
      expect(coordinator.turretSystem.getRenderState().activeBeam?.tier).toBe(1);

      // MARCH_NORMAL with elapsed=10 -> inactive
      const hpBeforeMarch = targetAt29.hp;
      coordinator.update(0.1, 'MARCH_NORMAL', useGameStore.getState(), useGameStore.getState(), {
        openingElapsedSeconds: 10,
      });
      expect(targetAt29.hp).toBe(hpBeforeMarch - 4);
      expect(coordinator.turretSystem.getRenderState().activeBeam?.tier).toBe(1);

      // OPENING_HOOK with undefined elapsed -> inactive
      const hpBeforeUndef = targetAt29.hp;
      coordinator.update(0.1, 'OPENING_HOOK', useGameStore.getState(), useGameStore.getState());
      expect(targetAt29.hp).toBe(hpBeforeUndef - 4);
      expect(coordinator.turretSystem.getRenderState().activeBeam?.tier).toBe(1);
      coordinator.dispose();
    });

    it('renders 3 barrels at 1.2x scale in Renderer when forceTurretPreview is true without mutating store', () => {
      vi.stubGlobal('Path2D', MockPath2D);
      const ctx = createMockCtx();
      const canvas = {
        width: 430,
        height: 512,
        style: {} as CSSStyleDeclaration,
        getContext: vi.fn(() => ctx),
      } as unknown as HTMLCanvasElement;

      const renderer = new Renderer(canvas, { getDevicePixelRatio: () => 1 });
      const camera = new CameraSystem();
      const parallax = new ParallaxSystem({ initialTimeOfDay: 'DAY' });

      // Prevent offscreen canvas dependency in Node by stubbing parallax.render
      parallax.render = vi.fn();

      const store = useGameStore.getState();
      expect(store.sandwalker.turretLevels.HEAT_RAY).toBe(1);
      expect(store.sandwalker.turretTiers.HEAT_RAY).toBe(1);

      renderer.render(0, camera, parallax, store, { forceTurretPreview: true });
      const scaleCalls = (ctx.scale as ReturnType<typeof vi.fn>).mock.calls;
      expect(scaleCalls.some(([sx, sy]: number[]) => Math.abs(sx - 1.2) < 1e-5 && Math.abs(sy - 1.2) < 1e-5)).toBe(true);

      // Also verify direct drawSandwalkerTurret 3-barrel fillRect calls (3 barrels * 2 rects = 6 + 1 cooling fin = 7)
      const directCtx = createMockCtx();
      const rig = new SandwalkerRig();
      drawSandwalkerTurret(directCtx, rig, {
        anchorX: 200,
        groundY: 412,
        activeTurret: 'HEAT_RAY',
        turretLevels: { HEAT_RAY: 30, HARPOON: 30, MORTAR: 30 },
        turretTiers: { HEAT_RAY: 3, HARPOON: 3, MORTAR: 3 },
        legPartLevel: 1,
        equippedSkinId: 'DEFAULT',
        solarShieldHp: 0,
        maxHp: 1000,
      });
      expect((directCtx.scale as ReturnType<typeof vi.fn>).mock.calls[0]).toEqual([1.2, 1.2]);
      expect((directCtx.fillRect as ReturnType<typeof vi.fn>).mock.calls.length).toBe(7);

      expect(useGameStore.getState().sandwalker.turretLevels.HEAT_RAY).toBe(1);
      expect(useGameStore.getState().sandwalker.turretTiers.HEAT_RAY).toBe(1);
      renderer.dispose();
      vi.unstubAllGlobals();
    });

    it('applies manual weak-point bonus only to locked target on Heat Ray pierce and Mortar AOE', () => {
      const dmgSys = new DamageSystem();
      const turretSys = new TurretSystem(dmgSys);

      // Heat Ray: tLocked is manually locked; tOther is aligned behind it (not weak point)
      const tLocked = makeTarget({ id: 'locked', x: 290, y: 316, hp: 200, isWeakPoint: false });
      const tOther = makeTarget({ id: 'other', x: 350, y: 316, hp: 200, isWeakPoint: false });
      turretSys.onPointerDown(290, 316, [tLocked, tOther]);

      turretSys.update(0.1, {
        fsmStateId: 'MARCH_NORMAL',
        storeState: useGameStore.getState(),
        targets: [tLocked, tOther],
        hullBobY: 0,
      });
      expect(tLocked.hp).toBe(200 - 6); // 4 * 1.5 = 6
      expect(tOther.hp).toBe(200 - 4); // regular 4 dmg (no weak-point spillover)

      // Mortar: manual lock on regular target gives 1.5x to locked target only
      const dmgSysM = new DamageSystem();
      const mortarSys = new TurretSystem(dmgSysM);
      useGameStore.getState().switchTurret('MORTAR');
      const mLocked = makeTarget({ id: 'm_locked', x: 330, y: 398, hp: 200, isWeakPoint: false });
      const mBystander = makeTarget({ id: 'm_other', x: 355, y: 398, hp: 200, isWeakPoint: false });
      mortarSys.onPointerDown(330, 398, [mLocked, mBystander]);
      mortarSys.update(1.5, {
        fsmStateId: 'MARCH_NORMAL',
        storeState: useGameStore.getState(),
        targets: [mLocked, mBystander],
        hullBobY: 0,
      });
      for (let i = 0; i < 65; i++) {
        mortarSys.update(0.016, {
          fsmStateId: 'MARCH_NORMAL',
          storeState: useGameStore.getState(),
          targets: [mLocked, mBystander],
          hullBobY: 0,
        });
      }
      expect(mLocked.hp).toBe(200 - Math.round(52.5 * 1.5)); // 79
      expect(mBystander.hp).toBe(200 - Math.round(52.5)); // 53
    });

    it('hits manually locked target with large weakPointOffset on Heat Ray & Harpoon and isolates Harpoon 1.5x from front interceptors', () => {
      // 1. HEAT_RAY with large weakPointOffset { x: 0, y: -30 }
      const dmgRay = new DamageSystem();
      const raySys = new TurretSystem(dmgRay);
      const offsetBoss = makeTarget({
        id: 'boss_body_offset',
        x: 350,
        y: 320,
        radius: 15,
        hp: 1000,
        maxHp: 1000,
        weakPointOffset: { x: 0, y: -30 }, // weak point at (350, 290)
      });
      const snappedRay = raySys.onPointerDown(350, 290, [offsetBoss]);
      expect(snappedRay?.id).toBe('boss_body_offset');
      raySys.update(0.11, {
        fsmStateId: 'MARCH_NORMAL',
        storeState: useGameStore.getState(),
        targets: [offsetBoss],
        hullBobY: 0,
      });
      // Lv1 HEAT_RAY 4 * 1.5 = 6
      expect(offsetBoss.hp).toBe(994);

      // 2. HARPOON locked onto rear target: intercepting unlocked front enemy takes 1.0x (no 1.5x leak)
      const dmgHarp = new DamageSystem();
      const harpSys = new TurretSystem(dmgHarp);
      useGameStore.getState().switchTurret('HARPOON');
      const blocker = makeTarget({
        id: 'front_blocker',
        x: 280,
        y: 316,
        hp: 1000,
        maxHp: 1000,
        tags: ['SMALL_SWARM'], // 0.7x affinity for HARPOON -> 55 * 0.7 = 38.5 -> 39
        isWeakPoint: false,
      });
      const lockedBack = makeTarget({
        id: 'locked_back',
        x: 380,
        y: 316,
        hp: 1000,
        maxHp: 1000,
        tags: ['HEAVY_ARMOR'],
        isWeakPoint: false,
      });
      harpSys.onPointerDown(380, 316, [blocker, lockedBack]);
      harpSys.update(1.0, {
        fsmStateId: 'MARCH_NORMAL',
        storeState: useGameStore.getState(),
        targets: [blocker, lockedBack],
        hullBobY: 0,
      });
      for (let i = 0; i < 10; i++) {
        harpSys.update(0.016, {
          fsmStateId: 'MARCH_NORMAL',
          storeState: useGameStore.getState(),
          targets: [blocker, lockedBack],
          hullBobY: 0,
        });
      }
      expect(1000 - blocker.hp).toBe(39);
      expect(lockedBack.hp).toBe(1000);
    });

    it('guards TurretSystem pointer coords against NaN/Infinity, rejects negative openingElapsedSeconds, and blocks invalid switchTurret', () => {
      const dmgSys = new DamageSystem();
      const turretSys = new TurretSystem(dmgSys);
      const target = makeTarget({ id: 't_guard', x: 320, y: 316, hp: 500, maxHp: 500 });

      expect(turretSys.onPointerDown(Number.NaN, Number.NaN, [target])).toBeNull();
      expect(turretSys.onPointerDown(Number.POSITIVE_INFINITY, 316, [target])).toBeNull();
      expect(turretSys.getRenderState().aimState.isDragging).toBe(false);
      expect(Number.isFinite(turretSys.getRenderState().aimState.pointerX)).toBe(true);
      expect(Number.isFinite(turretSys.getRenderState().aimState.pointerY)).toBe(true);

      // Valid down followed by NaN move keeps valid pointer state
      turretSys.onPointerDown(100, 100, [target]);
      expect(turretSys.onPointerMove(Number.NaN, 120, [target])).toBeNull();
      expect(turretSys.getRenderState().aimState.pointerX).toBe(100);
      expect(turretSys.getRenderState().aimState.pointerY).toBe(100);
      turretSys.onPointerUp();

      // Negative openingElapsedSeconds must NOT trigger Lv30 preview
      turretSys.update(0.1, {
        fsmStateId: 'OPENING_HOOK',
        openingElapsedSeconds: -5,
        storeState: useGameStore.getState(),
        targets: [target],
        hullBobY: 0,
      });
      expect(target.hp).toBe(500 - 4);
      expect(turretSys.getRenderState().activeBeam?.tier).toBe(1);

      // Invalid turret switch rejected without consuming cooldown
      expect(turretSys.requestSwitch('INVALID' as never, useGameStore.getState())).toBe(false);
      expect(turretSys.getSwitchCooldownRemaining()).toBe(0);
    });
  });
});
