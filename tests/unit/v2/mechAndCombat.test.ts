import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { MechControlSystem, computeMarchSpeed } from '@/systems/MechControlSystem';
import {
  CombatSystem,
  checkAABB,
  checkCircle,
  computeShotDamage,
} from '@/systems/CombatSystem';
import {
  ENEMY_BASE_SPECS,
  ENTITY_VISUAL_SPECS,
  GROUND_Y,
  SANDWORM_SUBMERGE_SEC,
  SANDWORM_TELEGRAPH_SEC,
} from '@/data/masterData';

describe('Phase 2 (v2.0): 4 Active Controls, Combat Math, Overheat & Sandworm 4-Stage FSM', () => {
  let mech: MechControlSystem;
  let combat: CombatSystem;

  beforeEach(() => {
    mech = new MechControlSystem();
    combat = new CombatSystem();
  });

  it('computes PRD march speed formula with quicksand resistance and overdrive', () => {
    expect(computeMarchSpeed(1, 0, 1)).toBeCloseTo(48.6, 2);
    expect(computeMarchSpeed(1, 0.45, 1)).toBeCloseTo(26.73, 2);
    // Leg Lv.6 gives 100% quicksand resistance (min(1, 0.2*(6-1)) = 1.0)
    expect(computeMarchSpeed(6, 0.45, 1)).toBeCloseTo(45 * 1.48, 2);
    expect(computeMarchSpeed(1, 0, 1.8)).toBeCloseTo(87.48, 2);
  });

  it('tracks engine heat buildup, [75..95] overdrive vent, and 100 forced cool penalty', () => {
    // Firing builds heat at (12 - 8) = +4 / sec -> 20s reaches 80 (inside sweet spot [75..95])
    let snap = mech.update(20, true);
    expect(snap.heat).toBeCloseTo(80, 1);
    expect(snap.inSweetSpot).toBe(true);

    expect(mech.tryVentOverdrive()).toBe(true);
    snap = mech.getSnapshot();
    expect(snap.fsmState).toBe('OVERDRIVE_VENT');
    expect(snap.heat).toBe(0);
    expect(snap.isOverdrive).toBe(true);
    expect(snap.speedMultiplier).toBe(1.8);
    expect(snap.fireRateMultiplier).toBe(2.0);

    // After 5.0s overdrive ends, returns to MARCH_AUTO
    snap = mech.update(5.1, false);
    expect(snap.fsmState).toBe('MARCH_AUTO');
    expect(snap.isOverdrive).toBe(false);

    // Reaching 100 heat triggers 3.0s forced cooling at 0.5x fire rate
    mech.setHeatForDebug(100);
    snap = mech.update(0.1, true);
    expect(snap.forcedCoolRemainingSec).toBeGreaterThan(2.5);
    expect(snap.fireRateMultiplier).toBe(0.5);
    expect(mech.tryVentOverdrive()).toBe(false);

    snap = mech.update(3.1, false);
    expect(snap.forcedCoolRemainingSec).toBe(0);
    expect(snap.fireRateMultiplier).toBe(1.0);
  });

  it('verifies AABB, circle collision, turret affinity, manual 1.5x lock & weakpoint 1.75x crit', () => {
    expect(checkAABB(100, 100, 40, 40, 110, 110, 20, 20)).toBe(true);
    expect(checkAABB(100, 100, 20, 20, 150, 100, 20, 20)).toBe(false);
    expect(checkCircle(100, 100, 28, 120, 100, 10)).toBe(true);
    expect(checkCircle(100, 100, 10, 150, 100, 10)).toBe(false);

    const auto = computeShotDamage({
      turretId: 'TUR_01',
      turretLevel: 1,
      targetTag: 'RAIDER',
      enemyDefense: 2,
      isManualLocked: false,
      isWeakPointLock: false,
      isTargetStunned: false,
      critRoll: 0.9,
    });
    expect(auto.damage).toBe(26);
    expect(auto.isCrit).toBe(false);

    const manual = computeShotDamage({
      turretId: 'TUR_01',
      turretLevel: 1,
      targetTag: 'RAIDER',
      enemyDefense: 2,
      isManualLocked: true,
      isWeakPointLock: false,
      isTargetStunned: false,
      critRoll: 0.9,
    });
    expect(manual.damage).toBe(39);

    const weakpointSandworm = computeShotDamage({
      turretId: 'TUR_01',
      turretLevel: 1,
      targetTag: 'BOSS_SANDWORM',
      enemyDefense: 10,
      isManualLocked: true,
      isWeakPointLock: true,
      isTargetStunned: true,
    });
    // (28*1.6 - 10)*1.75 = 60.9 -> floor 60 -> *1.5 = 90 -> *1.5 stun = 135
    expect(weakpointSandworm.isCrit).toBe(true);
    expect(weakpointSandworm.damage).toBe(135);
  });

  it('runs Sandworm 4-stage FSM, Golden Counter parry & relic touch excavation within 28px', () => {
    const relic = combat.spawnRelic(400, 120, 2)!;
    // Miss outside 28+12=40px radius
    expect(combat.tryExcavateRelicAt(relic.x + 60, relic.y)).toBeNull();
    // Hit inside 28px touch tolerance
    const reward = combat.tryExcavateRelicAt(relic.x + 20, relic.y);
    expect(reward).toEqual({ gold: 120, gears: 2 });
    expect(combat.relicPool.getActiveCount()).toBe(0);

    const worm = combat.spawnEnemy('BOSS_SANDWORM', 640)!;
    expect(worm.sandwormState).toBe('SUBMERGE');

    // Advance past SUBMERGE (2.5s) -> TELEGRAPH_WARN
    let out = combat.update(SANDWORM_SUBMERGE_SEC + 0.05, {
      equippedTurret: 'TUR_01',
      turretLevel: 1,
      fireRateMultiplier: 1,
      autoSpawnEnabled: false,
    });
    expect(out.sandwormState).toBe('TELEGRAPH_WARN');
    expect(out.bossTelegraphActive).toBe(true);

    // Parry during TELEGRAPH_WARN triggers GOLDEN_COUNTER + boss COUNTERED_STUN
    const parry = mech.tryDodgeOrParry(out.bossTelegraphActive);
    expect(parry).toEqual({ triggered: true, isGoldenCounter: true });
    expect(mech.getSnapshot().fsmState).toBe('GOLDEN_COUNTER');

    const counter = combat.triggerGoldenCounterBarrage('TUR_01', 1);
    expect(counter.hitstop).toBe(true);
    expect(counter.damageDealt).toBeGreaterThan(150);
    expect(worm.sandwormState).toBe('COUNTERED_STUN');
    expect(worm.weakPointExposed).toBe(true);

    // Fresh worm advancing naturally past TELEGRAPH_WARN (1.5s) -> EMERGE_STRIKE
    combat.releaseAll();
    const worm2 = combat.spawnEnemy('BOSS_SANDWORM', 640)!;
    combat.update(SANDWORM_SUBMERGE_SEC + 0.05, {
      equippedTurret: 'TUR_01',
      turretLevel: 1,
      fireRateMultiplier: 1,
      autoSpawnEnabled: false,
    });
    out = combat.update(SANDWORM_TELEGRAPH_SEC + 0.05, {
      equippedTurret: 'TUR_01',
      turretLevel: 1,
      fireRateMultiplier: 1,
      autoSpawnEnabled: false,
    });
    expect(worm2.sandwormState).toBe('EMERGE_STRIKE');
    expect(worm2.weakPointExposed).toBe(true);
  });

  it('enforces resolution-optimized differential visual scale specs within Layer 2 headroom', () => {
    expect(ENTITY_VISUAL_SPECS.mercenaryHeight).toBe(84);
    expect(ENTITY_VISUAL_SPECS.sandwalkerWidth).toBe(176);
    expect(ENTITY_VISUAL_SPECS.sandwalkerHeight).toBe(110);
    expect(ENTITY_VISUAL_SPECS.wagonWidth).toBe(118);
    expect(ENTITY_VISUAL_SPECS.wagonHeight).toBe(88);
    expect(ENEMY_BASE_SPECS.RAIDER.width).toBe(100);
    expect(ENEMY_BASE_SPECS.RAIDER.height).toBe(82);
    expect(ENEMY_BASE_SPECS.BOSS_SANDWORM.width).toBe(198);
    expect(ENEMY_BASE_SPECS.BOSS_SANDWORM.height).toBe(260);
    expect(ENEMY_BASE_SPECS.BOSS_SANDWORM.height).toBeLessThan(GROUND_Y);
  });

  it('enforces SRP: MechControlSystem and CombatSystem contain zero DOM/Canvas references', () => {
    for (const rel of ['src/systems/MechControlSystem.ts', 'src/systems/CombatSystem.ts']) {
      const content = fs.readFileSync(path.resolve(process.cwd(), rel), 'utf8');
      expect(content).not.toMatch(/CanvasRenderingContext2D|document\.|window\./);
    }
  });
});
