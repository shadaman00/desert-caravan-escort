import { describe, it, expect, vi } from 'vitest';
import {
  BAYER_4X4,
  compileSprite,
  drawBresenhamLine,
  drawCompiledSprite,
  PIXEL_BUFFER_HEIGHT,
  PIXEL_BUFFER_WIDTH,
  rasterizeBresenhamLine,
  shouldDitherPixel,
} from '@/engine/render/pixel/PixelCanvas';
import { RELIC_ICON_MATRICES } from '@/engine/render/pixel/sprites/worldSprites';
import { WORLD_PALETTE } from '@/engine/render/pixel/palettes';
import { RELIC_DEFINITIONS } from '@/game/data/relics';
import { SoundEngine, type MinimalAudioContext } from '@/engine/audio/SoundEngine';

function createMockAudioContext(): {
  ctx: MinimalAudioContext;
  oscCount: () => number;
  noiseCount: () => number;
} {
  let oscCreated = 0;
  let noiseCreated = 0;
  const ctx: MinimalAudioContext = {
    currentTime: 0,
    state: 'running',
    sampleRate: 22050,
    destination: {},
    resume: async () => undefined,
    createOscillator: () => {
      oscCreated += 1;
      return {
        type: 'square',
        frequency: {
          setValueAtTime: vi.fn(),
          exponentialRampToValueAtTime: vi.fn(),
        },
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      };
    },
    createGain: () => ({
      gain: {
        setValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
      },
      connect: vi.fn(),
    }),
    createBuffer: (_channels, length) => ({
      getChannelData: () => new Float32Array(length),
    }),
    createBufferSource: () => {
      noiseCreated += 1;
      return {
        buffer: null,
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      };
    },
  };
  return { ctx, oscCount: () => oscCreated, noiseCount: () => noiseCreated };
}

describe('PixelCanvas & SoundEngine Unit Suite', () => {
  it('defines 340x206 offscreen pixel buffer dimensions and 4x4 Bayer matrix', () => {
    expect(PIXEL_BUFFER_WIDTH).toBe(340);
    expect(PIXEL_BUFFER_HEIGHT).toBe(206);
    expect(BAYER_4X4.length).toBe(4);
    expect(shouldDitherPixel(0, 0, 0)).toBe(false);
    expect(shouldDitherPixel(0, 0, 1)).toBe(true);
    expect(shouldDitherPixel(0, 0, 0.5)).toBe(true);
    expect(shouldDitherPixel(3, 3, 0.2)).toBe(false);
  });

  it('compileSprite skips transparent dots, supports flipX and flashWhite, and draws in Node', () => {
    const sprite = compileSprite(['.K', 'G.'], { K: '#111111', G: '#ecc94b' });
    expect(sprite.width).toBe(2);
    expect(sprite.height).toBe(2);
    expect(sprite.pixels).toEqual([
      { x: 1, y: 0, color: '#111111' },
      { x: 0, y: 1, color: '#ecc94b' },
    ]);

    const flipped = compileSprite(['.K', 'G.'], { K: '#111111', G: '#ecc94b' }, { flipX: true });
    expect(flipped.pixels).toEqual([
      { x: 0, y: 0, color: '#111111' },
      { x: 1, y: 1, color: '#ecc94b' },
    ]);

    const flashed = compileSprite(['.K'], { K: '#111111' }, { flashWhite: true });
    expect(flashed.pixels).toEqual([{ x: 1, y: 0, color: '#ffffff' }]);

    const fillRect = vi.fn();
    const fakeCtx = { fillRect, fillStyle: '', imageSmoothingEnabled: true } as unknown as CanvasRenderingContext2D;
    drawCompiledSprite(fakeCtx, sprite, 100, 100, { pixelSize: 2 });
    expect(fakeCtx.imageSmoothingEnabled).toBe(false);
    expect(fillRect).toHaveBeenCalledTimes(2);
  });

  it('rasterizeBresenhamLine and drawBresenhamLine emit connected integer grid points', () => {
    const pts = rasterizeBresenhamLine(0, 0, 4, 2);
    expect(pts.length).toBe(5);
    expect(pts[0]).toEqual({ x: 0, y: 0 });
    expect(pts[4]).toEqual({ x: 4, y: 2 });

    const fillRect = vi.fn();
    const fakeCtx = { fillRect, fillStyle: '' } as unknown as CanvasRenderingContext2D;
    drawBresenhamLine(fakeCtx, 0, 0, 8, 4, 2, '#4a5568', 2);
    expect(fillRect).toHaveBeenCalledTimes(5);
  });

  it('provides valid 10x10 pixel icon matrices for all 6 collectible relics', () => {
    for (const def of RELIC_DEFINITIONS) {
      const mat = RELIC_ICON_MATRICES[def.id];
      expect(mat).toBeDefined();
      const compiled = compileSprite(mat, WORLD_PALETTE);
      expect(compiled.pixels.length).toBeGreaterThan(15);
    }
  });

  it('SoundEngine unlocks, plays all 7 chiptune SFX kinds, throttles HEAT_RAY, and respects mute', () => {
    const mock = createMockAudioContext();
    const sfx = new SoundEngine({ audioContextFactory: () => mock.ctx, initialMuted: false });

    expect(sfx.getStatus().initialized).toBe(false);
    expect(sfx.play('TURRET_SWITCH', 1000)).toBe(true);
    expect(sfx.getStatus().initialized).toBe(true);

    // HEAT_RAY throttled inside 140ms window
    expect(sfx.play('HEAT_RAY', 1000)).toBe(true);
    expect(sfx.play('HEAT_RAY', 1050)).toBe(false);
    expect(sfx.play('HEAT_RAY', 1200)).toBe(true);

    expect(sfx.play('HARPOON', 1300)).toBe(true);
    expect(sfx.play('MORTAR_EXPLOSION', 1400)).toBe(true);
    expect(sfx.play('ARMOR_BREAK', 1500)).toBe(true);
    expect(sfx.play('SETTLEMENT_COIN', 1600)).toBe(true);
    expect(sfx.play('BOSS_WARNING', 1700)).toBe(true);

    expect(mock.oscCount()).toBeGreaterThanOrEqual(9);
    expect(mock.noiseCount()).toBe(1);

    expect(sfx.toggleMute()).toBe(true);
    expect(sfx.play('HARPOON', 2000)).toBe(false);

    // Graceful no-op when AudioContext unavailable
    const silent = new SoundEngine({ audioContextFactory: () => null });
    expect(silent.play('HARPOON', 100)).toBe(false);
  });
});
