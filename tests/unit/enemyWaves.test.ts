import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useGameStore } from '@/store/gameStore';
import { GameFSM } from '@/engine/fsm/GameFSM';
import { TimerService } from '@/engine/TimerService';
import { EventBus } from '@/engine/EventBus';
import { MarchNormalState } from '@/engine/fsm/states/MarchNormalState';
import { EmergencyReviveState } from '@/engine/fsm/states/EmergencyReviveState';
import {
  ENEMY_ARCHETYPES,
  getQuicksandScorpionMultiplier,
  scaleEnemyHpForAct,
} from '@/game/data/enemies';
import { SpawnSystem, WALKER_FRONT_X } from '@/engine/systems/SpawnSystem';
import { CombatCoordinator } from '@/engine/systems/CombatCoordinator';
import { ParticlePool } from '@/engine/render/draw/particles';
import { CameraSystem } from '@/engine/systems/CameraSystem';
import { drawEnemies } from '@/engine/render/draw/enemies';

class MockPath2D {
  moveTo = vi.fn();
  lineTo = vi.fn();
  closePath = vi.fn();
}

function createMockCtx(): CanvasRenderingContext2D {
  const grad = { addColorStop: vi.fn() };
  return {
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    beginPath: vi.fn(),
    closePath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    fillRect: vi.fn(),
    createRadialGradient: vi.fn(() => grad),
    globalAlpha: 1,
    fillStyle: '#000',
    strokeStyle: '#000',
    lineWidth: 1,
  } as unknown as CanvasRenderingContext2D;
}

describe('Basic Enemy Waves (#24) & Combat Integration', () => {
  beforeEach(() => {
    useGameStore.getState().resetToDefaults();
  });

  it('defines exact Act 1 enemy archetypes, tags, and Act scaling', () => {
    expect(ENEMY_ARCHETYPES.DESERT_BANDIT.baseHp).toBe(30);
    expect(ENEMY_ARCHETYPES.DESERT_BANDIT.tags).toEqual(['SMALL_SWARM']);

    expect(ENEMY_ARCHETYPES.SCORPION.baseHp).toBe(120);
    expect(ENEMY_ARCHETYPES.SCORPION.baseArmor).toBe(40);
    expect(ENEMY_ARCHETYPES.SCORPION.tags).toEqual(['HEAVY_ARMOR']);

    expect(ENEMY_ARCHETYPES.MIRAGE_SPIRIT.baseHp).toBe(60);
    expect(ENEMY_ARCHETYPES.MIRAGE_SPIRIT.tags).toEqual(['MIRAGE']);
    expect(ENEMY_ARCHETYPES.MIRAGE_SPIRIT.isRanged).toBe(true);

    expect(scaleEnemyHpForAct(30, 1)).toBe(30);
    expect(scaleEnemyHpForAct(120, 2) > 120).toBe(true);
  });

  it('gates spawning by FSM state and clears waves on BOSS_ENCOUNTER / OASIS_HUB', () => {
    const bus = new EventBus();
    const coordinator = new CombatCoordinator({ eventBus: bus, rng: () => 0.2 });

    // No spawns in OASIS_HUB or EMERGENCY_REVIVE
    coordinator.update(3.0, 'OASIS_HUB', useGameStore.getState(), useGameStore.getState());
    expect(coordinator.spawnSystem.getEnemies().length).toBe(0);

    coordinator.update(3.0, 'EMERGENCY_REVIVE', useGameStore.getState(), useGameStore.getState());
    expect(coordinator.spawnSystem.getEnemies().length).toBe(0);

    // Spawns during MARCH_NORMAL across two steps so wave 1 spawns without a single massive beam tick wiping all 3
    coordinator.update(1.3, 'MARCH_NORMAL', useGameStore.getState(), useGameStore.getState());
    coordinator.update(0.15, 'MARCH_NORMAL', useGameStore.getState(), useGameStore.getState());
    expect(coordinator.spawnSystem.getEnemies().length > 0).toBe(true);

    // Clearing on BOSS_ENCOUNTER entry via EventBus
    bus.emit('state:change', { from: 'MARCH_NORMAL', to: 'BOSS_ENCOUNTER' });
    expect(coordinator.spawnSystem.getEnemies().length).toBe(0);

    // Re-spawn during MARCH_NORMAL and clear on OASIS_HUB entry via EventBus
    useGameStore.getState().switchTurret('HARPOON');
    coordinator.update(2.2, 'MARCH_NORMAL', useGameStore.getState(), useGameStore.getState());
    expect(coordinator.spawnSystem.getEnemies().length > 0).toBe(true);
    bus.emit('state:change', { from: 'MARCH_NORMAL', to: 'OASIS_HUB' });
    expect(coordinator.spawnSystem.getEnemies().length).toBe(0);
    coordinator.dispose();
  });

  it('boosts scorpion spawn rate in Quicksand (1.5x Act 1, 2.0x Act 2+)', () => {
    expect(getQuicksandScorpionMultiplier(false, 1)).toBe(1.0);
    expect(getQuicksandScorpionMultiplier(true, 1)).toBe(1.5);
    expect(getQuicksandScorpionMultiplier(true, 2)).toBe(2.0);

    const spawner = new SpawnSystem({ rng: () => 0.55 });
    // At roll = 0.55:
    // Normal: bandit=45, scorpion=30, mirage=25 (total=100) -> 55 is between 45 and 75 -> SCORPION
    // Let's test boundary roll = 0.65:
    // Normal: 0.65 * 100 = 65 -> < 75 (SCORPION), vs 0.78 -> MIRAGE_SPIRIT
    const spawnerBoundary = new SpawnSystem({ rng: () => 0.76 });
    expect(spawnerBoundary.chooseWaveArchetype(false, 1)).toBe('MIRAGE_SPIRIT');
    // Quicksand Act 2: scorpionWeight = 60, total = 130 -> 0.76 * 130 = 98.8 < 105 -> SCORPION!
    expect(spawnerBoundary.chooseWaveArchetype(true, 2)).toBe('SCORPION');
    expect(spawner.chooseWaveArchetype(true, 1)).toBe('SCORPION');
  });

  it('advances enemies, applies Tarik -25% mitigation, triggers hit flash & EMERGENCY_REVIVE on lethal damage', () => {
    const bus = new EventBus();
    const timers = new TimerService();
    const fsm = new GameFSM(timers, bus);
    fsm.registerState(new MarchNormalState());
    fsm.registerState(new EmergencyReviveState());
    fsm.transitionTo('MARCH_NORMAL');

    const camera = new CameraSystem();
    const coordinator = new CombatCoordinator({ eventBus: bus, rng: () => 0.5 });

    // Spawn bandit right at engagement range with enough HP to survive turret ticks across phases
    const bandit = coordinator.spawnSystem.addEnemy('DESERT_BANDIT', 1, {
      x: WALKER_FRONT_X + 20,
      hp: 500,
    });

    // Without Tarik: bandit attackDamage=10
    const initialHp = useGameStore.getState().sandwalker.currentHp;
    coordinator.update(1.5, 'MARCH_NORMAL', useGameStore.getState(), useGameStore.getState(), {
      cameraSystem: camera,
    });
    expect(useGameStore.getState().sandwalker.currentHp).toBe(initialHp - 10);

    // With Tarik unlocked: melee damage mitigated by 25% -> 8 dmg (round(10 * 0.75))
    useGameStore.getState().unlockMercenary('tarik');
    const hpBeforeTarik = useGameStore.getState().sandwalker.currentHp;
    bandit.attackTimer = 0.05;
    coordinator.update(0.2, 'MARCH_NORMAL', useGameStore.getState(), useGameStore.getState(), {
      cameraSystem: camera,
    });
    expect(useGameStore.getState().sandwalker.currentHp).toBe(hpBeforeTarik - 8);

    // Lethal hull damage flushes immediately and transitions FSM to EMERGENCY_REVIVE
    useGameStore.getState().setHp(5);
    bandit.attackTimer = 0.05;
    coordinator.update(0.2, 'MARCH_NORMAL', useGameStore.getState(), useGameStore.getState(), {
      cameraSystem: camera,
    });
    expect(useGameStore.getState().sandwalker.currentHp).toBe(0);
    fsm.update(0.016);
    expect(fsm.getCurrentStateId()).toBe('EMERGENCY_REVIVE');
    coordinator.dispose();
  });

  it('triggers hitFlashTimer decay, death particles, and batched gold rewards', () => {
    const particles = new ParticlePool(300);
    const coordinator = new CombatCoordinator({ rng: () => 0.5 });
    useGameStore.getState().switchTurret('HARPOON');

    const bandit = coordinator.spawnSystem.addEnemy('DESERT_BANDIT', 1, {
      x: 340,
      hp: 30,
    });

    // Hit flash set on damage and decays over time
    coordinator.damageSystem.applyDirectDamage(bandit, 10);
    expect(bandit.hitFlashTimer).toBeCloseTo(0.12);

    coordinator.update(0.2, 'MARCH_NORMAL', useGameStore.getState(), useGameStore.getState(), {
      particlePool: particles,
    });
    expect(bandit.hitFlashTimer).toBe(0);

    // Kill bandit -> death particles spawned and goldReward (5) batched into store
    const goldBefore = useGameStore.getState().currencies.sunGold;
    coordinator.damageSystem.applyDirectDamage(bandit, 50);
    coordinator.update(0.15, 'MARCH_NORMAL', useGameStore.getState(), useGameStore.getState(), {
      particlePool: particles,
    });

    expect(coordinator.spawnSystem.getEnemies().find((e) => e.id === bandit.id)).toBe(undefined);
    expect(particles.getActiveCount() > 0).toBe(true);
    expect(useGameStore.getState().currencies.sunGold >= goldBefore + 5).toBe(true);
    coordinator.dispose();
  });

  it('renders all 3 enemy archetypes, bars, flash, and projectiles cleanly in Node', () => {
    vi.stubGlobal('Path2D', MockPath2D);
    const ctx = createMockCtx();
    const spawner = new SpawnSystem({ rng: () => 0.5 });

    const b = spawner.addEnemy('DESERT_BANDIT', 1, { x: 280 });
    b.hitFlashTimer = 0.08;
    spawner.addEnemy('SCORPION', 1, { x: 340 });
    spawner.addEnemy('MIRAGE_SPIRIT', 1, { x: 390 });

    drawEnemies(
      ctx,
      spawner.getEnemies(),
      [{ x: 300, y: 340, vx: -200, vy: 0, damage: 14, color: '#38bdf8', alive: true }],
      b.id,
      1.0
    );
    expect(ctx.fillRect).toHaveBeenCalled();

    vi.unstubAllGlobals();
  });
});
