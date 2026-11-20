import { describe, it, expect, vi } from 'vitest';
import {
  LEG_LOWER_LEN,
  LEG_UPPER_LEN,
  SandwalkerRig,
  getLegArmorVisualTier,
  getTurretVisualTier,
  solveTwoBoneIK,
} from '@/engine/render/draw/sandwalker';
import { computeWagonTrain } from '@/engine/render/draw/wagon';
import { SpriteSlot, SpriteSlotRegistry } from '@/engine/render/SpriteSlot';
import { ParticlePool, emitAmbientWind } from '@/engine/render/draw/particles';
import { computeCanvasBackingSize } from '@/engine/render/Renderer';

describe('Sandwalker IK, Wagons, SpriteSlot & ParticlePool Unit Suite', () => {
  it('solveTwoBoneIK is NaN-safe and satisfies bone lengths across edge targets', () => {
    const targets: Array<[number, number, boolean]> = [
      [1000, 1000, false], // unreachable far
      [196, 360, true], // collapsed onto hip
      [196, 412, false], // normal stance
      [180, 390, true], // close flexed
      [Number.NaN, Number.POSITIVE_INFINITY, false], // non-finite guard
    ];

    for (const [tx, ty, flip] of targets) {
      const ik = solveTwoBoneIK(196, 360, tx, ty, LEG_UPPER_LEN, LEG_LOWER_LEN, flip);
      for (const val of Object.values(ik)) {
        expect(Number.isFinite(val)).toBe(true);
      }
      const d1 = Math.hypot(ik.kneeX - ik.hipX, ik.kneeY - ik.hipY);
      const d2 = Math.hypot(ik.footX - ik.kneeX, ik.footY - ik.kneeY);
      expect(d1).toBeCloseTo(LEG_UPPER_LEN, 4);
      expect(d2).toBeCloseTo(LEG_LOWER_LEN, 3);
    }
  });

  it('SandwalkerRig enforces 3+3 tripod gait, touchdown events, and speed coupling', () => {
    const rig = new SandwalkerRig();
    let touchDownCount = 0;

    for (let i = 0; i < 120; i++) {
      rig.update(1 / 60, 120);
      const groupALifted = [0, 2, 4].some((idx) => rig.legs[idx].liftY > 0.01);
      const groupBLifted = [1, 3, 5].some((idx) => rig.legs[idx].liftY > 0.01);
      // Tripod invariant: both groups cannot be airborne at the same time
      expect(groupALifted && groupBLifted).toBe(false);

      for (const leg of rig.legs) {
        if (leg.didTouchDown) touchDownCount++;
      }
    }
    expect(touchDownCount > 0).toBe(true);

    // Speed coupling: 72 px/s advances phase at 0.6x rate of 120 px/s
    const fastRig = new SandwalkerRig();
    const slowRig = new SandwalkerRig();
    fastRig.update(0.1, 120);
    slowRig.update(0.1, 72);
    expect(slowRig.gaitPhase / fastRig.gaitPhase).toBeCloseTo(0.6, 5);

    // Stopping settles all legs to ground
    fastRig.update(1.0, 0);
    for (const leg of fastRig.legs) {
      expect(leg.liftY).toBe(0);
    }

    // Turret switch 0.15s animation timer
    fastRig.triggerTurretSwitch('HARPOON');
    expect(fastRig.switchAnimTimer).toBeCloseTo(0.15, 5);
    fastRig.update(0.1, 0);
    expect(fastRig.switchAnimTimer).toBeCloseTo(0.05, 5);
    fastRig.update(0.1, 0);
    expect(fastRig.switchAnimTimer).toBe(0);
  });

  it('maps turret barrel tiers (1/2/3) and leg armor tiers (Lv11 quicksand glow)', () => {
    expect(getTurretVisualTier(1, 1)).toBe(1);
    expect(getTurretVisualTier(10, 1)).toBe(1);
    expect(getTurretVisualTier(11, 2)).toBe(2);
    expect(getTurretVisualTier(20, 2)).toBe(2);
    expect(getTurretVisualTier(21, 3)).toBe(3);

    const lv1 = getLegArmorVisualTier(1);
    expect(lv1.tier).toBe(1);
    expect(lv1.boltCount).toBe(1);
    expect(lv1.hasQuicksandGlow).toBe(false);

    const lv11 = getLegArmorVisualTier(11);
    expect(lv11.tier).toBe(2);
    expect(lv11.boltCount).toBe(2);
    expect(lv11.hasQuicksandGlow).toBe(true);
    expect(lv11.armorScale > lv1.armorScale).toBe(true);

    const lv20 = getLegArmorVisualTier(20);
    expect(lv20.tier).toBe(3);
    expect(lv20.boltCount).toBe(3);
  });

  it('computeWagonTrain positions 1-5 trailing wagons strictly inside [0, 430] with phase bobbing', () => {
    const poses = computeWagonTrain(
      {
        wagonCount: 5,
        equippedSkinId: 'DEFAULT',
        walkerRearHitchX: 158,
        walkerRearHitchY: 356,
        speed: 120,
      },
      240,
      0.7
    );

    expect(poses.length).toBe(5);
    for (const p of poses) {
      expect(p.wagonX - 8.5 >= 0).toBe(true);
      expect(p.camelX + 6 <= 158).toBe(true);
    }
    expect(poses[0].bobOffsetY).not.toBe(poses[1].bobOffsetY);

    const idlePoses = computeWagonTrain(
      {
        wagonCount: 3,
        equippedSkinId: 'GOLDEN_PHARAOH',
        walkerRearHitchX: 158,
        walkerRearHitchY: 356,
        speed: 0,
      },
      0,
      1.0
    );
    expect(idlePoses.length).toBe(3);
    for (const p of idlePoses) {
      expect(p.bobOffsetY).toBe(0);
    }
  });

  it('SpriteSlot delegates to procedural default or override hook cleanly', () => {
    const procedural = vi.fn();
    const slot = new SpriteSlot<{ hp: number }>('sandwalker.hull', procedural);
    const registry = new SpriteSlotRegistry();
    registry.register(slot);

    expect(registry.listSlotIds()).toEqual(['sandwalker.hull']);
    const fakeCtx = {} as CanvasRenderingContext2D;

    slot.render(fakeCtx, { x: 10, y: 20 }, { hp: 100 });
    expect(procedural.mock.calls.length).toBe(1);

    const overrideDraw = vi.fn(() => true);
    slot.setOverride({ id: 'custom', draw: overrideDraw });
    expect(slot.hasOverride()).toBe(true);
    slot.render(fakeCtx, { x: 10, y: 20 }, { hp: 100 });
    expect(overrideDraw.mock.calls.length).toBe(1);
    expect(procedural.mock.calls.length).toBe(1);

    // Override returning false falls back to procedural
    slot.setOverride({ id: 'fallback', draw: () => false });
    slot.render(fakeCtx, { x: 10, y: 20 }, { hp: 100 });
    expect(procedural.mock.calls.length).toBe(2);
  });

  it('ParticlePool enforces fixed capacity 300, recycles via swap-remove, and scales 3x in STORM', () => {
    const pool = new ParticlePool(300);
    for (let i = 0; i < 350; i++) {
      pool.spawn({
        kind: 'SAND_DUST',
        x: 100,
        y: 300,
        vx: -10,
        vy: -5,
        size: 2,
        maxLife: 1.0,
        color: '#e2a96a',
      });
    }
    expect(pool.getActiveCount()).toBe(300);

    pool.update(1.5, 0);
    expect(pool.getActiveCount()).toBe(0);

    // Reuse slots back up to 300
    for (let i = 0; i < 300; i++) {
      expect(
        pool.spawn({
          kind: 'SPARK',
          x: 50,
          y: 200,
          vx: 0,
          vy: 0,
          size: 2,
          maxLife: 0.5,
          color: '#fef08a',
        })
      ).toBe(true);
    }
    expect(pool.getActiveCount()).toBe(300);

    // Verify 3x emission rate in STORM vs DAY
    const dayPool = new ParticlePool(300);
    const stormPool = new ParticlePool(300);
    const dayCount = emitAmbientWind(dayPool, 1.0, false, 'DAY', 430, 412, () => 0.5);
    const stormCount = emitAmbientWind(stormPool, 1.0, true, 'STORM', 430, 412, () => 0.5);
    expect(stormCount).toBe(dayCount * 3);
  });

  it('computeCanvasBackingSize caps DPR at 2 for Zone B 430x512', () => {
    expect(computeCanvasBackingSize(1)).toEqual({ dpr: 1, width: 430, height: 512 });
    expect(computeCanvasBackingSize(2)).toEqual({ dpr: 2, width: 860, height: 1024 });
    expect(computeCanvasBackingSize(3)).toEqual({ dpr: 2, width: 860, height: 1024 });
    expect(computeCanvasBackingSize(Number.NaN)).toEqual({ dpr: 1, width: 430, height: 512 });
  });
});
