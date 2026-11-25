import { describe, it, expect, vi } from 'vitest';
import { drawPixelGroundShadow } from '@/engine/render/pixel/PixelCanvas';
import { drawPixelSandwalkerTurret } from '@/engine/render/pixel/sprites/sandwalkerSprites';
import { SandwalkerRig, type SandwalkerRenderInput } from '@/engine/render/draw/sandwalker';
import {
  drawCrispBossTelegraph,
  drawCrispDamagePopups,
  drawCrispEnemyBars,
  drawCrispSolarShield,
  drawCrispWeakPointReticle,
} from '@/engine/render/draw/overlayDraw';
import type { EnemyInstance } from '@/engine/systems/SpawnSystem';
import type { BossRenderSnapshot } from '@/engine/systems/BossSystem';

function createMockCtx(): {
  ctx: CanvasRenderingContext2D;
  fillRectCalls: () => number;
  fillTextCalls: () => number;
} {
  const fillRect = vi.fn();
  const fillText = vi.fn();
  const ctx = {
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    scale: vi.fn(),
    rotate: vi.fn(),
    beginPath: vi.fn(),
    closePath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    fillRect,
    fillText,
    strokeText: vi.fn(),
    setLineDash: vi.fn(),
    imageSmoothingEnabled: true,
    fillStyle: '#000',
    strokeStyle: '#000',
    lineWidth: 1,
    lineJoin: 'round',
    globalAlpha: 1,
    font: '12px monospace',
    textAlign: 'center',
    textBaseline: 'middle',
  } as unknown as CanvasRenderingContext2D;
  return {
    ctx,
    fillRectCalls: () => fillRect.mock.calls.length,
    fillTextCalls: () => fillText.mock.calls.length,
  };
}

describe('Visual Readability Stage 1–2 Unit Suite', () => {
  it('drawPixelGroundShadow emits 2 integer-snapped shadow rectangles', () => {
    const mock = createMockCtx();
    drawPixelGroundShadow(mock.ctx, 241, 336, 30, 4, 0.3);
    expect(mock.fillRectCalls()).toBe(2);
  });

  it('drawPixelSandwalkerTurret draws all 3 turrets and increases barrel footprint from Tier 1 to Tier 3', () => {
    const rig = new SandwalkerRig();
    const turrets = ['HEAT_RAY', 'HARPOON', 'MORTAR'] as const;

    for (const activeTurret of turrets) {
      const m1 = createMockCtx();
      const m3 = createMockCtx();
      const baseInput: SandwalkerRenderInput = {
        anchorX: 240,
        groundY: 336,
        activeTurret,
        turretLevels: { HEAT_RAY: 1, HARPOON: 1, MORTAR: 1 },
        turretTiers: { HEAT_RAY: 1, HARPOON: 1, MORTAR: 1 },
        legPartLevel: 1,
        equippedSkinId: 'DEFAULT',
        solarShieldHp: 0,
        maxHp: 1000,
      };
      drawPixelSandwalkerTurret(m1.ctx, rig, baseInput);
      drawPixelSandwalkerTurret(m3.ctx, rig, {
        ...baseInput,
        turretLevels: { HEAT_RAY: 25, HARPOON: 25, MORTAR: 25 },
        turretTiers: { HEAT_RAY: 3, HARPOON: 3, MORTAR: 3 },
      });
      expect(m1.fillRectCalls()).toBeGreaterThan(5);
      expect(m3.fillRectCalls()).toBeGreaterThan(m1.fillRectCalls());
    }
  });

  it('Pass 2 overlayDraw helpers execute safely with crisp bars, telegraph, shield, reticle & damage popups', () => {
    const mock = createMockCtx();
    drawCrispSolarShield(mock.ctx, 240, 336, 0, 200, 1000, 1.0);

    const enemy: EnemyInstance = {
      id: 'e1',
      archetypeId: 'DESERT_BANDIT',
      x: 520,
      y: 318,
      baseY: 318,
      radius: 16,
      hp: 80,
      maxHp: 100,
      armor: 20,
      maxArmor: 50,
      vx: 60,
      attackRange: 60,
      attackTimer: 1,
      attackInterval: 1.5,
      attackDamage: 10,
      isRanged: false,
      goldReward: 5,
      alive: true,
      weakPointOffset: { x: 0, y: -6 },
      tags: ['SMALL_SWARM'],
      animPhase: 0,
      hitFlashTimer: 0,
      knockbackVx: 0,
      knockbackImmune: false,
    };
    drawCrispEnemyBars(mock.ctx, [enemy]);

    const boss: BossRenderSnapshot = {
      id: 'GREAT_SANDWORM',
      name: '초거대 아포피스 샌드웜',
      act: 4,
      phase: 1,
      maxPhase: 3,
      phaseLabel: '두개골 외피',
      hp: 7000,
      maxHp: 7000,
      phaseHp: 2000,
      phaseMaxHp: 2000,
      armor: 2000,
      maxArmor: 2000,
      x: 560,
      y: 306,
      radius: 46,
      weakPointOffset: { x: -22, y: -14 },
      targetId: 'boss_great_sandworm',
      isGroggy: false,
      groggyRemainingSec: 0,
      telegraphActive: true,
      telegraphProgress: 0.6,
      patternKind: 'WORM_LUNGE',
      specialKind: null,
      specialLabel: null,
      specialVisualTimer: 0,
      specialTriggerCount: 0,
      breathVisualTimer: 0,
      lungeOffsetX: 0,
      hitFlashTimer: 0,
      recommendedTurret: 'HARPOON',
      adds: [],
    };
    drawCrispBossTelegraph(mock.ctx, boss, 240, 336, 1.0);
    drawCrispWeakPointReticle(
      mock.ctx,
      { isDragging: true, pointerX: 500, pointerY: 300, lockedTargetId: 'e1', lockRemainingSec: 2.5 },
      [enemy],
      1.0
    );
    drawCrispDamagePopups(mock.ctx, [
      { text: '125!', x: 520, y: 290, vy: -20, color: '#fef08a', scale: 1.2, age: 0.1, maxLife: 0.7 },
    ]);

    expect(mock.fillRectCalls()).toBeGreaterThan(5);
    expect(mock.fillTextCalls()).toBe(2); // Boss '!' warning + popup '125!'
  });
});
