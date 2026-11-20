import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useGameStore } from '@/store/gameStore';
import { EventBus } from '@/engine/EventBus';
import {
  CombatCoordinator,
  DODGE_BOOST_DURATION_SEC,
  DODGE_BOOST_SPEED_MULTIPLIER,
  TACTICAL_SHIELD_COOLDOWN_SEC,
  TACTICAL_SHIELD_FRACTION,
  type CombatStoreSink,
} from '@/engine/systems/CombatCoordinator';
import type { CombatTarget } from '@/engine/systems/DamageSystem';
import { CameraSystem } from '@/engine/systems/CameraSystem';
import { WALKER_FRONT_X } from '@/engine/systems/SpawnSystem';
import { ParticlePool } from '@/engine/render/draw/particles';
import { evasionCooldown, upgradeCost } from '@/game/formulas';
import type { TurretType } from '@/store/types';

function makeBossWeakPoint(overrides: Partial<CombatTarget> = {}): CombatTarget {
  return {
    id: overrides.id ?? 'boss_wp',
    x: overrides.x ?? 350,
    y: overrides.y ?? 320,
    radius: overrides.radius ?? 18,
    hp: overrides.hp ?? 1000,
    maxHp: overrides.maxHp ?? 1000,
    armor: overrides.armor ?? 0,
    maxArmor: overrides.maxArmor ?? 0,
    weakPointOffset: overrides.weakPointOffset ?? { x: 10, y: -12 },
    tags: overrides.tags ?? ['EXPOSED_CORE'],
    isWeakPoint: overrides.isWeakPoint ?? true,
    knockbackImmune: true,
    alive: overrides.alive ?? true,
    hitFlashTimer: 0,
    knockbackVx: 0,
  };
}

interface SpySink extends CombatStoreSink {
  applyDamage: ReturnType<typeof vi.fn>;
  repairHp: ReturnType<typeof vi.fn>;
  setSolarShield: ReturnType<typeof vi.fn>;
  addCurrencies: ReturnType<typeof vi.fn>;
  switchTurret: ReturnType<typeof vi.fn>;
  setManualAimTarget: ReturnType<typeof vi.fn>;
}

function createSpySink(overrides: Partial<CombatStoreSink> = {}): SpySink {
  return {
    applyDamage: vi.fn(
      overrides.applyDamage ??
        ((amount: number) => ({
          shieldAbsorbed: 0,
          hpDamage: amount,
          isDestroyed: false,
        }))
    ),
    repairHp: vi.fn(overrides.repairHp ?? (() => {})),
    setSolarShield: vi.fn(overrides.setSolarShield ?? (() => {})),
    addCurrencies: vi.fn(overrides.addCurrencies ?? (() => {})),
    switchTurret: vi.fn(overrides.switchTurret ?? (() => {})),
    setManualAimTarget: vi.fn(overrides.setManualAimTarget ?? (() => {})),
  };
}

describe('M3 Integration: CombatCoordinator, Tactical Controls & GameStore Actions', () => {
  beforeEach(() => {
    useGameStore.getState().resetToDefaults();
  });

  describe('CombatCoordinator Pointer Aim & Reticle Overlay', () => {
    it('tracks idle, drag, weak-point snap priority, post-release 2s lock, and target death unlock', () => {
      const bus = new EventBus();
      const lockEvents: Array<{ targetId: string; x: number; y: number }> = [];
      const unlockEvents: Array<{ previousTargetId: string | null }> = [];
      bus.on('aim:lock', (p) => lockEvents.push(p));
      bus.on('aim:unlock', (p) => unlockEvents.push(p));

      const coordinator = new CombatCoordinator({ eventBus: bus });
      const sink = createSpySink();

      // Idle reticle hidden
      expect(coordinator.getAimReticleOverlay()).toEqual({
        visible: false,
        x: 0,
        y: 0,
        locked: false,
        lockRemainingSec: 0,
      });

      // Move without prior pointer down does nothing
      expect(coordinator.onAimPointerMove(350, 320, sink.setManualAimTarget)).toBeNull();
      expect(coordinator.getAimReticleOverlay().visible).toBe(false);

      // Regular enemy closer to (355, 310), boss weak point at (360, 308) within 40px
      const regular = coordinator.spawnSystem.addEnemy('DESERT_BANDIT', 1, { x: 355, y: 310, hp: 500 });
      const wp = makeBossWeakPoint({
        id: 'worm_core',
        x: 350,
        y: 320,
        weakPointOffset: { x: 10, y: -12 }, // weak point at (360, 308)
      });
      coordinator.setExtraTargets([wp]);

      // Down on empty space (>40px away) -> returns null, shows unlocked reticle at pointer
      expect(coordinator.onAimPointerDown(100, 100, sink.setManualAimTarget)).toBeNull();
      expect(coordinator.getAimReticleOverlay()).toEqual({
        visible: true,
        x: 100,
        y: 100,
        locked: false,
        lockRemainingSec: 0,
      });

      // Drag into snap range -> prioritizes isWeakPoint over closer regular enemy
      const snapped = coordinator.onAimPointerMove(354, 310, sink.setManualAimTarget);
      expect(snapped?.id).toBe('worm_core');
      expect(snapped?.id !== regular.id).toBe(true);
      expect(sink.setManualAimTarget.mock.calls.at(-1)).toEqual(['worm_core']);
      expect(lockEvents).toEqual([{ targetId: 'worm_core', x: 360, y: 308 }]);
      expect(coordinator.getAimReticleOverlay()).toEqual({
        visible: true,
        x: 360,
        y: 308,
        locked: true,
        lockRemainingSec: 2.0,
      });

      // While dragging, lock timer stays at 2.0s across updates
      coordinator.update(1.5, 'BOSS_ENCOUNTER', useGameStore.getState(), sink);
      expect(coordinator.getAimReticleOverlay().lockRemainingSec).toBeCloseTo(2.0);

      // Release pointer -> counts down 2.0s
      coordinator.onAimPointerUp();
      coordinator.update(1.5, 'BOSS_ENCOUNTER', useGameStore.getState(), sink);
      const halfOverlay = coordinator.getAimReticleOverlay();
      expect(halfOverlay.visible).toBe(true);
      expect(halfOverlay.x).toBe(360);
      expect(halfOverlay.y).toBe(308);
      expect(halfOverlay.locked).toBe(true);
      expect(halfOverlay.lockRemainingSec).toBeCloseTo(0.5, 5);

      // Expiry unlocks and hides overlay
      coordinator.update(0.6, 'BOSS_ENCOUNTER', useGameStore.getState(), sink);
      expect(sink.setManualAimTarget.mock.calls.at(-1)).toEqual([null]);
      expect(unlockEvents).toEqual([{ previousTargetId: 'worm_core' }]);
      expect(coordinator.getAimReticleOverlay()).toEqual({
        visible: false,
        x: 0,
        y: 0,
        locked: false,
        lockRemainingSec: 0,
      });

      // Re-lock and kill target -> clears lock immediately on next update
      coordinator.onAimPointerDown(360, 308, sink.setManualAimTarget);
      coordinator.onAimPointerUp();
      expect(coordinator.getAimReticleOverlay().locked).toBe(true);
      wp.alive = false;
      wp.hp = 0;
      coordinator.update(0.05, 'BOSS_ENCOUNTER', useGameStore.getState(), sink);
      expect(coordinator.getAimReticleOverlay().visible).toBe(false);
      expect(unlockEvents.length).toBe(2);

      coordinator.dispose();
    });
  });

  describe('10Hz Gold/Heal Batching, Fractional Carry-Over & Transitions', () => {
    it('batches gold and heals at 0.1s cadence and preserves fractional heal across ticks', () => {
      const store = useGameStore.getState();
      store.unlockMercenary('lili');
      store.setHp(500); // maxHp = 1000 -> Lili heals 20 HP/s = 1 HP per 0.05s
      store.switchTurret('HARPOON');

      const sink = createSpySink();
      const coordinator = new CombatCoordinator({ rng: () => 0.5 });

      const bandit = coordinator.spawnSystem.addEnemy('DESERT_BANDIT', 1, { x: 400, hp: 30 });
      coordinator.damageSystem.applyDirectDamage(bandit, 50); // killed -> +5 gold pending

      // 0.05s < 0.1s -> NOT flushed yet
      coordinator.update(0.05, 'MARCH_NORMAL', useGameStore.getState(), sink);
      expect(sink.addCurrencies).not.toHaveBeenCalled();
      expect(sink.repairHp).not.toHaveBeenCalled();

      // +0.05s = 0.10s -> flushes 5 gold & 2 HP
      coordinator.update(0.05, 'MARCH_NORMAL', useGameStore.getState(), sink);
      expect(sink.addCurrencies.mock.calls.length).toBe(1);
      expect(sink.addCurrencies.mock.calls[0]).toEqual([{ sunGold: 5 }]);
      expect(sink.repairHp.mock.calls.length).toBe(1);
      expect(sink.repairHp.mock.calls[0]).toEqual([2]);

      // Fractional carry-over: maxHp=100, currentHp=50 -> 2 HP/s = 0.2 HP per 0.1s
      const fracCoordinator = new CombatCoordinator({ rng: () => 0.5 });
      const fracSink = createSpySink();
      useGameStore.setState((s) => ({
        sandwalker: { ...s.sandwalker, maxHp: 100, currentHp: 50 },
      }));

      for (let i = 0; i < 4; i++) {
        fracCoordinator.update(0.1, 'MARCH_NORMAL', useGameStore.getState(), fracSink);
      }
      expect(fracSink.repairHp).not.toHaveBeenCalled(); // 0.8 HP accumulated < 1

      fracCoordinator.update(0.1, 'MARCH_NORMAL', useGameStore.getState(), fracSink);
      expect(fracSink.repairHp.mock.calls.length).toBe(1);
      expect(fracSink.repairHp.mock.calls[0]).toEqual([1]);

      coordinator.dispose();
      fracCoordinator.dispose();
    });

    it('flushes pendingGold on OASIS_SETTLEMENT while suppressing heal/hullDamage, and pauses in EMERGENCY_REVIVE', () => {
      const bus = new EventBus();
      const coordinator = new CombatCoordinator({ eventBus: bus, rng: () => 0.5 });
      const sink = createSpySink();

      useGameStore.getState().unlockMercenary('lili');
      useGameStore.getState().setHp(500);
      useGameStore.getState().switchTurret('HARPOON');

      const bandit = coordinator.spawnSystem.addEnemy('DESERT_BANDIT', 1, {
        x: WALKER_FRONT_X + 10,
        hp: 30,
      });
      bandit.attackTimer = 0.01;

      // EMERGENCY_REVIVE pauses completely
      coordinator.update(0.2, 'EMERGENCY_REVIVE', useGameStore.getState(), sink);
      expect(sink.applyDamage).not.toHaveBeenCalled();
      expect(sink.repairHp).not.toHaveBeenCalled();
      expect(sink.addCurrencies).not.toHaveBeenCalled();

      // Kill bandit during sub-0.1s tick (accumulates gold, heal, hullDamage)
      coordinator.damageSystem.applyDirectDamage(bandit, 50);
      coordinator.update(0.05, 'MARCH_NORMAL', useGameStore.getState(), sink);
      expect(sink.addCurrencies).not.toHaveBeenCalled();

      // Transition to OASIS_SETTLEMENT clears heal & hullDamage, then update flushes gold immediately
      bus.emit('state:change', { from: 'BOSS_ENCOUNTER', to: 'OASIS_SETTLEMENT' });
      coordinator.update(0.016, 'OASIS_SETTLEMENT', useGameStore.getState(), sink);

      expect(sink.addCurrencies.mock.calls[0]).toEqual([{ sunGold: 5 }]);
      expect(sink.repairHp).not.toHaveBeenCalled();
      expect(sink.applyDamage).not.toHaveBeenCalled();

      coordinator.dispose();
    });
  });

  describe('Solar Shield Clamping, Multi-Grant Accumulation & Lethal/Heal Guard', () => {
    it('clamps solar shield grants to maxHp and accumulates multiple grants in a single tick', () => {
      const coordinator = new CombatCoordinator({ rng: () => 0.5 });
      const sink = createSpySink();

      // Single grant exceeding maxHp (980 + 50 -> 1000)
      useGameStore.getState().setSolarShield(980);
      coordinator.grantSolarShield(50);
      coordinator.update(0.05, 'MARCH_NORMAL', useGameStore.getState(), sink);
      expect(sink.setSolarShield.mock.calls[0]).toEqual([1000]);

      // Multi-grant accumulation in a single tick: 100 + 30 + 25 + Tarik (+40) = 195
      const multiSink = createSpySink();
      const multiCoord = new CombatCoordinator({ rng: () => 0.5 });
      useGameStore.getState().setSolarShield(100);
      useGameStore.getState().unlockMercenary('tarik');

      // Advance Tarik skill timer to just before 8.0s without enemies
      for (let i = 0; i < 7; i++) {
        multiCoord.update(1.0, 'MARCH_NORMAL', useGameStore.getState(), multiSink);
      }
      multiSink.setSolarShield.mock.calls.length = 0;

      multiCoord.grantSolarShield(30);
      multiCoord.grantSolarShield(25);
      multiCoord.update(1.0, 'MARCH_NORMAL', useGameStore.getState(), multiSink);

      expect(multiSink.setSolarShield.mock.calls.length).toBe(1);
      expect(multiSink.setSolarShield.mock.calls[0]).toEqual([195]);

      coordinator.dispose();
      multiCoord.dispose();
    });

    it('uses updated solar shield in immediate lethal check and prevents same-tick repairHp resurrection', () => {
      // Case 1: same-tick shield prevents false-positive immediate lethal flush
      const coordinator = new CombatCoordinator({ rng: () => 0.5 });
      const sink = createSpySink();
      useGameStore.getState().setHp(50);
      useGameStore.getState().setSolarShield(0);
      useGameStore.getState().switchTurret('HARPOON');

      const bandit = coordinator.spawnSystem.addEnemy('SCORPION', 1, {
        x: WALKER_FRONT_X + 10,
        hp: 500,
      });
      bandit.attackDamage = 55;
      bandit.attackTimer = 0.01;

      coordinator.grantSolarShield(40);
      coordinator.update(0.02, 'MARCH_NORMAL', useGameStore.getState(), sink);
      // 55 < 50 + 40 -> NOT immediately flushed before 0.1s batch
      expect(sink.setSolarShield.mock.calls[0]).toEqual([40]);
      expect(sink.applyDamage).not.toHaveBeenCalled();

      // Case 2: same-tick lethal damage suppresses same-tick repairHp resurrection
      const lethalCoord = new CombatCoordinator({ rng: () => 0.5 });
      const lethalSink = createSpySink({
        applyDamage: (amount: number) => ({
          shieldAbsorbed: 0,
          hpDamage: amount,
          isDestroyed: true,
        }),
      });
      useGameStore.getState().resetToDefaults();
      useGameStore.getState().unlockMercenary('lili');
      useGameStore.getState().setHp(5); // Lili heals 20 HP/s = 4 HP on dt=0.2
      useGameStore.getState().switchTurret('HARPOON');

      const killer = lethalCoord.spawnSystem.addEnemy('DESERT_BANDIT', 1, {
        x: WALKER_FRONT_X + 10,
        hp: 500,
      });
      killer.attackTimer = 0.01;

      lethalCoord.update(0.2, 'MARCH_NORMAL', useGameStore.getState(), lethalSink);
      expect(lethalSink.applyDamage.mock.calls.length).toBe(1);
      expect(lethalSink.repairHp).not.toHaveBeenCalled();

      coordinator.dispose();
      lethalCoord.dispose();
    });
  });

  describe('getDebugSnapshot & Tactical Dodge Boost / Solar Shield Controls', () => {
    it('exposes accurate CombatDebugSnapshot including switch CD, aim lock, synergy, and projectiles', () => {
      const coordinator = new CombatCoordinator({ rng: () => 0.5 });
      const enemy = coordinator.spawnSystem.addEnemy('DESERT_BANDIT', 1, {
        x: 312.34,
        y: 399.06,
        hp: 200,
      });

      coordinator.requestTurretSwitch('HARPOON', useGameStore.getState());
      coordinator.onAimPointerDown(312, 399, useGameStore.getState().setManualAimTarget);
      coordinator.onAimPointerUp();

      useGameStore.getState().unlockMercenary('harun');
      useGameStore.getState().unlockMercenary('sera');
      coordinator.update(0.05, 'MARCH_NORMAL', useGameStore.getState(), useGameStore.getState());

      const snap4 = coordinator.getDebugSnapshot('MARCH_NORMAL', useGameStore.getState());
      expect(snap4.fsmStateId).toBe('MARCH_NORMAL');
      expect(snap4.activeTurret).toBe('HARPOON');
      expect(snap4.switchCooldownRemaining > 0).toBe(true);
      expect(snap4.lockedTargetId).toBe(enemy.id);
      expect(snap4.lockRemainingSec).toBeCloseTo(1.95, 2);
      expect(snap4.synergyActive).toBe(false);
      expect(snap4.activeMercenaries).toEqual(['harun', 'sera']);
      expect(snap4.enemyCount).toBe(1);
      expect(snap4.enemies[0].x).toBe(Math.round(enemy.x * 10) / 10);
      expect(snap4.enemies[0].y).toBe(Math.round(enemy.y * 10) / 10);

      // Unlock remaining 3 mercs -> synergyActive === true
      useGameStore.getState().unlockMercenary('zara');
      useGameStore.getState().unlockMercenary('tarik');
      useGameStore.getState().unlockMercenary('lili');
      coordinator.update(0.016, 'MARCH_NORMAL', useGameStore.getState(), useGameStore.getState());
      const snap5 = coordinator.getDebugSnapshot('MARCH_NORMAL', useGameStore.getState());
      expect(snap5.synergyActive).toBe(true);
      expect(snap5.activeMercenaries.length).toBe(5);

      coordinator.dispose();
    });

    it('activates Dodge Boost (1.5s invulnerability, 1.6x speed, evasionCooldown, thruster particles) & resets on Hub', () => {
      const bus = new EventBus();
      const coordinator = new CombatCoordinator({ eventBus: bus, rng: () => 0.5 });
      const camera = new CameraSystem();
      const particles = new ParticlePool(100);
      useGameStore.getState().switchTurret('HARPOON');

      // Upgrade legs to Lv11 -> evasionCooldown(11) === 6.0s
      useGameStore.setState((s) => ({
        sandwalker: { ...s.sandwalker, legPartLevel: 11 },
      }));

      // Rejects in non-combat states
      expect(coordinator.activateDodgeBoost(useGameStore.getState(), 'OASIS_HUB')).toBe(false);
      expect(coordinator.activateDodgeBoost(useGameStore.getState(), 'EMERGENCY_REVIVE')).toBe(false);

      const attacker = coordinator.spawnSystem.addEnemy('DESERT_BANDIT', 1, {
        x: WALKER_FRONT_X + 10,
        hp: 500,
      });
      attacker.attackTimer = 0.01;

      expect(coordinator.activateDodgeBoost(useGameStore.getState(), 'MARCH_NORMAL')).toBe(true);
      expect(coordinator.isDodgeActive()).toBe(true);
      expect(coordinator.getRouteSpeedMultiplier()).toBe(DODGE_BOOST_SPEED_MULTIPLIER);
      expect(coordinator.getDodgeState().cooldownTotalSec).toBeCloseTo(evasionCooldown(11));

      // Cannot re-activate during active/cooldown
      expect(coordinator.activateDodgeBoost(useGameStore.getState(), 'MARCH_NORMAL')).toBe(false);

      // Step 0.5s: hull damage & camera shake suppressed, thruster particles emitted
      const hpBefore = useGameStore.getState().sandwalker.currentHp;
      coordinator.update(0.5, 'MARCH_NORMAL', useGameStore.getState(), useGameStore.getState(), {
        cameraSystem: camera,
        particlePool: particles,
      });
      expect(useGameStore.getState().sandwalker.currentHp).toBe(hpBefore);
      expect(camera.getShakeIntensity()).toBe(0);
      expect(particles.getActiveCount() >= 6).toBe(true);

      // Complete 1.5s active window -> invulnerability ends, cooldown still remaining (4.5s)
      coordinator.update(1.0, 'MARCH_NORMAL', useGameStore.getState(), useGameStore.getState(), {
        cameraSystem: camera,
      });
      expect(coordinator.isDodgeActive()).toBe(false);
      expect(coordinator.getRouteSpeedMultiplier()).toBe(1.0);
      expect(coordinator.getDodgeState().cooldownRemainingSec).toBeCloseTo(4.5, 4);

      // Next enemy hit now deals real damage & triggers camera shake
      attacker.attackTimer = 0.01;
      coordinator.update(0.2, 'MARCH_NORMAL', useGameStore.getState(), useGameStore.getState(), {
        cameraSystem: camera,
      });
      expect(useGameStore.getState().sandwalker.currentHp).toBe(hpBefore - 10);
      expect(camera.getShakeIntensity() > 0).toBe(true);

      // Remaining cooldown finishes at 6.0s total
      coordinator.update(4.3, 'MARCH_NORMAL', useGameStore.getState(), useGameStore.getState());
      expect(coordinator.getDodgeState().cooldownRemainingSec).toBe(0);
      expect(coordinator.activateDodgeBoost(useGameStore.getState(), 'MARCH_NORMAL')).toBe(true);
      expect(DODGE_BOOST_DURATION_SEC).toBe(1.5);

      // Transition to OASIS_HUB resets tactical cooldowns
      bus.emit('state:change', { from: 'MARCH_NORMAL', to: 'OASIS_HUB' });
      expect(coordinator.isDodgeActive()).toBe(false);
      expect(coordinator.getDodgeState().cooldownRemainingSec).toBe(0);

      coordinator.dispose();
    });

    it('activates Tactical Solar Shield (20% maxHp clamped, 12s CD) & resets on Hub', () => {
      const bus = new EventBus();
      const coordinator = new CombatCoordinator({ eventBus: bus });

      expect(
        coordinator.activateSolarShield(
          useGameStore.getState(),
          useGameStore.getState(),
          'OASIS_HUB'
        )
      ).toBe(false);

      expect(
        coordinator.activateSolarShield(
          useGameStore.getState(),
          useGameStore.getState(),
          'MARCH_NORMAL'
        )
      ).toBe(true);

      const expectedGain = Math.round(1000 * TACTICAL_SHIELD_FRACTION);
      expect(useGameStore.getState().sandwalker.solarShieldHp).toBe(expectedGain);
      expect(coordinator.getSolarShieldCooldownState().cooldownRemainingSec).toBe(
        TACTICAL_SHIELD_COOLDOWN_SEC
      );

      // Rejected during cooldown
      expect(
        coordinator.activateSolarShield(
          useGameStore.getState(),
          useGameStore.getState(),
          'MARCH_NORMAL'
        )
      ).toBe(false);

      // Clamps at maxHp when already near full
      bus.emit('state:change', { from: 'MARCH_NORMAL', to: 'OASIS_HUB' });
      expect(coordinator.getSolarShieldCooldownState().cooldownRemainingSec).toBe(0);

      useGameStore.getState().setSolarShield(950);
      expect(
        coordinator.activateSolarShield(
          useGameStore.getState(),
          useGameStore.getState(),
          'MARCH_NORMAL'
        )
      ).toBe(true);
      expect(useGameStore.getState().sandwalker.solarShieldHp).toBe(1000);

      coordinator.dispose();
    });
  });

  describe('useGameStore M3+ Actions & Guards', () => {
    it('handles switchTurret, upgradeTurret, tierUpTurret, and guards against invalid turret keys', () => {
      const store = useGameStore.getState();
      store.addCurrencies({ sunGold: 500000, ancientGear: 100 });

      // switchTurret
      store.switchTurret('HARPOON');
      expect(useGameStore.getState().sandwalker.activeTurret).toBe('HARPOON');
      const prevSandwalker = useGameStore.getState().sandwalker;
      store.switchTurret('HARPOON');
      expect(useGameStore.getState().sandwalker).toBe(prevSandwalker);

      // upgradeTurret up to Tier 1 cap (Lv10)
      for (let lvl = 1; lvl < 10; lvl++) {
        const goldBefore = useGameStore.getState().currencies.sunGold;
        expect(useGameStore.getState().upgradeTurret('HEAT_RAY')).toBe(true);
        expect(useGameStore.getState().currencies.sunGold).toBe(goldBefore - upgradeCost(lvl));
      }
      expect(useGameStore.getState().sandwalker.turretLevels.HEAT_RAY).toBe(10);
      // Blocked at Lv10 until tierUpTurret
      expect(useGameStore.getState().upgradeTurret('HEAT_RAY')).toBe(false);

      // tierUpTurret 1 -> 2 costs 5 gears
      const gearsBeforeT2 = useGameStore.getState().currencies.ancientGear;
      expect(useGameStore.getState().tierUpTurret('HEAT_RAY')).toBe(true);
      expect(useGameStore.getState().sandwalker.turretTiers.HEAT_RAY).toBe(2);
      expect(useGameStore.getState().currencies.ancientGear).toBe(gearsBeforeT2 - 5);

      // Upgrade Lv10 -> Lv20, blocked until tier 3 (10 gears)
      for (let lvl = 10; lvl < 20; lvl++) {
        expect(useGameStore.getState().upgradeTurret('HEAT_RAY')).toBe(true);
      }
      expect(useGameStore.getState().upgradeTurret('HEAT_RAY')).toBe(false);
      expect(useGameStore.getState().tierUpTurret('HEAT_RAY')).toBe(true);
      expect(useGameStore.getState().sandwalker.turretTiers.HEAT_RAY).toBe(3);
      expect(useGameStore.getState().currencies.ancientGear).toBe(gearsBeforeT2 - 15);

      // Upgrade Lv20 -> Lv30, then blocked at Lv30 & Tier 3 max
      for (let lvl = 20; lvl < 30; lvl++) {
        expect(useGameStore.getState().upgradeTurret('HEAT_RAY')).toBe(true);
      }
      expect(useGameStore.getState().upgradeTurret('HEAT_RAY')).toBe(false);
      expect(useGameStore.getState().tierUpTurret('HEAT_RAY')).toBe(false);

      // Invalid runtime turret key never corrupts currencies to NaN
      const goldBeforeInvalid = useGameStore.getState().currencies.sunGold;
      const gearBeforeInvalid = useGameStore.getState().currencies.ancientGear;
      expect(useGameStore.getState().upgradeTurret('INVALID' as TurretType)).toBe(false);
      expect(useGameStore.getState().tierUpTurret('INVALID' as TurretType)).toBe(false);
      expect(Number.isFinite(useGameStore.getState().currencies.sunGold)).toBe(true);
      expect(Number.isFinite(useGameStore.getState().currencies.ancientGear)).toBe(true);
      expect(useGameStore.getState().currencies.sunGold).toBe(goldBeforeInvalid);
      expect(useGameStore.getState().currencies.ancientGear).toBe(gearBeforeInvalid);

      // Insufficient currencies rejected
      useGameStore.getState().resetToDefaults();
      expect(useGameStore.getState().upgradeTurret('HARPOON')).toBe(false);
      expect(useGameStore.getState().tierUpTurret('HARPOON')).toBe(false);
    });

    it('handles upgradeLeg, addWagon, upgradeMercenary, setSkin, and clamped setSolarShield', () => {
      const store = useGameStore.getState();

      // Insufficient currency fails
      expect(store.upgradeLeg()).toBe(false);
      expect(store.addWagon()).toBe(false);

      store.addCurrencies({ sunGold: 100000, ancientGear: 60 });

      // upgradeLeg Lv1 -> Lv20, then capped at Lv20
      for (let lvl = 1; lvl < 20; lvl++) {
        expect(useGameStore.getState().upgradeLeg()).toBe(true);
      }
      expect(useGameStore.getState().sandwalker.legPartLevel).toBe(20);
      expect(useGameStore.getState().upgradeLeg()).toBe(false);

      // addWagon 1 -> 5 (5 + 10 + 15 + 20 = 50 gears), cargoCapacity = 250, capped at 5
      expect(useGameStore.getState().sandwalker.wagonCount).toBe(1);
      expect(useGameStore.getState().sandwalker.cargoCapacity).toBe(50);
      for (let w = 1; w < 5; w++) {
        const g = useGameStore.getState().currencies.ancientGear;
        expect(useGameStore.getState().addWagon()).toBe(true);
        expect(useGameStore.getState().currencies.ancientGear).toBe(g - 5 * w);
        expect(useGameStore.getState().sandwalker.wagonCount).toBe(w + 1);
        expect(useGameStore.getState().sandwalker.cargoCapacity).toBe((w + 1) * 50);
      }
      expect(useGameStore.getState().addWagon()).toBe(false);

      // upgradeMercenary rejects locked/unknown, succeeds unlocked, caps at Lv30
      expect(useGameStore.getState().upgradeMercenary('sera')).toBe(false);
      expect(useGameStore.getState().upgradeMercenary('unknown')).toBe(false);
      useGameStore.getState().unlockMercenary('sera');
      for (let lvl = 1; lvl < 30; lvl++) {
        expect(useGameStore.getState().upgradeMercenary('sera')).toBe(true);
      }
      expect(useGameStore.getState().mercenaries.find((m) => m.id === 'sera')?.level).toBe(30);
      expect(useGameStore.getState().upgradeMercenary('sera')).toBe(false);

      // setSkin
      useGameStore.getState().setSkin('GOLDEN_PHARAOH');
      expect(useGameStore.getState().monetization.equippedSkinId).toBe('GOLDEN_PHARAOH');
      useGameStore.getState().setSkin('DEFAULT');
      expect(useGameStore.getState().monetization.equippedSkinId).toBe('DEFAULT');

      // setSolarShield clamps [0, maxHp] and ignores NaN / Infinity
      useGameStore.getState().setSolarShield(500);
      expect(useGameStore.getState().sandwalker.solarShieldHp).toBe(500);
      useGameStore.getState().setSolarShield(5000);
      expect(useGameStore.getState().sandwalker.solarShieldHp).toBe(1000);
      useGameStore.getState().setSolarShield(-50);
      expect(useGameStore.getState().sandwalker.solarShieldHp).toBe(0);
      useGameStore.getState().setSolarShield(250);
      useGameStore.getState().setSolarShield(Number.NaN);
      useGameStore.getState().setSolarShield(Number.POSITIVE_INFINITY);
      expect(useGameStore.getState().sandwalker.solarShieldHp).toBe(250);
    });
  });

  describe('M3 Iteration 2 Regression Guards', () => {
    it('clears pendingHeal on lethal damage and EMERGENCY_REVIVE so post-revive HP stays exact', () => {
      for (const dt of [0.05, 0.1]) {
        useGameStore.getState().resetToDefaults();
        const bus = new EventBus();
        const coordinator = new CombatCoordinator({ eventBus: bus, rng: () => 0.5 });

        useGameStore.getState().unlockMercenary('lili');
        useGameStore.getState().switchTurret('HARPOON');
        useGameStore.getState().setHp(20);
        // Advance Lili skill timer near 5.0s activation threshold (Lili heals 5% maxHp = 50 + 20*dt)
        for (const m of coordinator.mercenarySystem.getRuntimeStates()) {
          if (m.id === 'lili') m.skillTimer = 4.96;
        }

        const killer = coordinator.spawnSystem.addEnemy('DESERT_BANDIT', 1, {
          x: WALKER_FRONT_X + 10,
          hp: 500,
        });
        killer.attackDamage = 30;
        killer.attackTimer = 0.01;

        // Tick triggers Lili heal AND lethal enemy attack
        coordinator.update(dt, 'MARCH_NORMAL', useGameStore.getState(), useGameStore.getState());
        expect(useGameStore.getState().sandwalker.currentHp).toBe(0);

        // Simulate EMERGENCY_REVIVE acceptRevive -> 500 HP -> MARCH_NORMAL
        bus.emit('state:change', { from: 'MARCH_NORMAL', to: 'EMERGENCY_REVIVE' });
        useGameStore.getState().setHp(500);
        bus.emit('state:change', { from: 'EMERGENCY_REVIVE', to: 'MARCH_NORMAL' });

        // Lock lili & remove enemies, then tick past 0.1s batch flush
        useGameStore.setState((s) => ({
          mercenaries: s.mercenaries.map((m) =>
            m.id === 'lili' ? { ...m, isUnlocked: false } : m
          ),
        }));
        coordinator.spawnSystem.clear();
        coordinator.update(0.15, 'MARCH_NORMAL', useGameStore.getState(), useGameStore.getState());

        expect(useGameStore.getState().sandwalker.currentHp).toBe(500);
        coordinator.dispose();
      }
    });

    it('clears stale store.sandwalker.manualAimTargetId on OASIS_HUB, OASIS_SETTLEMENT, and EMERGENCY_REVIVE transitions', () => {
      for (const nextState of ['OASIS_HUB', 'OASIS_SETTLEMENT', 'EMERGENCY_REVIVE'] as const) {
        useGameStore.getState().resetToDefaults();
        const bus = new EventBus();
        const coordinator = new CombatCoordinator({ eventBus: bus });

        const wp = makeBossWeakPoint({ id: 'boss_wp', x: 350, y: 320, weakPointOffset: { x: 0, y: 0 } });
        coordinator.setExtraTargets([wp]);
        coordinator.onAimPointerDown(350, 320, useGameStore.getState().setManualAimTarget);
        expect(useGameStore.getState().sandwalker.manualAimTargetId).toBe('boss_wp');

        bus.emit('state:change', { from: 'BOSS_ENCOUNTER', to: nextState });
        coordinator.update(0.016, nextState, useGameStore.getState(), useGameStore.getState());
        expect(useGameStore.getState().sandwalker.manualAimTargetId).toBeNull();

        // Subsequent sortie with reused target id does NOT auto-lock
        const closer = makeBossWeakPoint({ id: 'closer', x: 250, y: 320, isWeakPoint: false });
        const reused = makeBossWeakPoint({ id: 'boss_wp', x: 400, y: 320, isWeakPoint: false });
        const sel = coordinator.turretSystem.selectTarget(
          [closer, reused],
          useGameStore.getState().sandwalker.manualAimTargetId
        );
        expect(sel.target?.id).toBe('closer');
        expect(sel.isManualLocked).toBe(false);

        coordinator.dispose();
      }
    });

    it('guards activateSolarShield against non-finite/non-positive maxHp and rejects null/undefined fsmStateId without consuming cooldown', () => {
      const coordinator = new CombatCoordinator();

      expect(coordinator.activateDodgeBoost(useGameStore.getState(), null)).toBe(false);
      expect(coordinator.activateDodgeBoost(useGameStore.getState(), undefined)).toBe(false);
      expect(coordinator.getDodgeState().cooldownRemainingSec).toBe(0);

      expect(
        coordinator.activateSolarShield(useGameStore.getState(), useGameStore.getState(), null)
      ).toBe(false);
      expect(
        coordinator.activateSolarShield(useGameStore.getState(), useGameStore.getState(), undefined)
      ).toBe(false);
      expect(coordinator.getSolarShieldCooldownState().cooldownRemainingSec).toBe(0);

      for (const badMaxHp of [Number.NaN, Number.POSITIVE_INFINITY, 0, -100]) {
        useGameStore.setState((s) => ({
          sandwalker: { ...s.sandwalker, maxHp: badMaxHp },
        }));
        expect(
          coordinator.activateSolarShield(
            useGameStore.getState(),
            useGameStore.getState(),
            'MARCH_NORMAL'
          )
        ).toBe(false);
        expect(coordinator.getSolarShieldCooldownState().cooldownRemainingSec).toBe(0);
      }

      coordinator.dispose();
    });

    it('hardens useGameStore switchTurret, setSkin, addCurrencies, spendCurrencies, applyDamage, and setHp against invalid/non-finite inputs', () => {
      const store = useGameStore.getState();

      // 1. switchTurret & setSkin reject invalid and prototype-key strings
      const badKeys = ['INVALID', '__proto__', 'constructor', 'toString', 'valueOf', ''];
      for (const bad of badKeys) {
        store.switchTurret(bad as TurretType);
        expect(useGameStore.getState().sandwalker.activeTurret).toBe('HEAT_RAY');
        store.setSkin(bad as never);
        expect(useGameStore.getState().monetization.equippedSkinId).toBe('DEFAULT');
      }

      // 2. addCurrencies (object & positional) ignores NaN/Infinity/negative while clamping valid caps
      store.addCurrencies({
        sunGold: Number.NaN,
        ancientGear: Number.POSITIVE_INFINITY,
        mapFragments: -5,
        templeKeys: 99,
      });
      expect(useGameStore.getState().currencies).toEqual({
        sunGold: 0,
        ancientGear: 0,
        mapFragments: 0,
        templeKeys: 3,
      });
      store.addCurrencies(-500, -10);
      store.addCurrencies(Number.NaN, Number.POSITIVE_INFINITY);
      expect(useGameStore.getState().currencies.sunGold).toBe(0);
      expect(useGameStore.getState().currencies.ancientGear).toBe(0);

      // 3. spendCurrencies rejects NaN/Infinity/negative without mutating state
      store.addCurrencies({ sunGold: 100, ancientGear: 10 });
      expect(store.spendCurrencies({ sunGold: Number.NaN })).toBe(false);
      expect(store.spendCurrencies({ sunGold: Number.POSITIVE_INFINITY })).toBe(false);
      expect(store.spendCurrencies({ sunGold: -1000 })).toBe(false);
      expect(store.spendCurrencies({ ancientGear: -1 })).toBe(false);
      expect(useGameStore.getState().currencies.sunGold).toBe(100);
      expect(useGameStore.getState().currencies.ancientGear).toBe(10);

      // 4. applyDamage rejects <= 0 / NaN / Infinity without altering shield or hp
      store.setSolarShield(50);
      store.setHp(500);
      expect(store.applyDamage(-200)).toEqual({
        shieldAbsorbed: 0,
        hpDamage: 0,
        isDestroyed: false,
      });
      expect(store.applyDamage(0)).toEqual({
        shieldAbsorbed: 0,
        hpDamage: 0,
        isDestroyed: false,
      });
      expect(store.applyDamage(Number.NaN)).toEqual({
        shieldAbsorbed: 0,
        hpDamage: 0,
        isDestroyed: false,
      });
      expect(store.applyDamage(Number.POSITIVE_INFINITY)).toEqual({
        shieldAbsorbed: 0,
        hpDamage: 0,
        isDestroyed: false,
      });
      expect(useGameStore.getState().sandwalker.solarShieldHp).toBe(50);
      expect(useGameStore.getState().sandwalker.currentHp).toBe(500);

      // 5. setHp ignores NaN / Infinity
      store.setHp(Number.NaN);
      store.setHp(Number.POSITIVE_INFINITY);
      expect(useGameStore.getState().sandwalker.currentHp).toBe(500);
    });
  });
});
