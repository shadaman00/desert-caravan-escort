import { describe, it, expect, beforeEach } from 'vitest';
import {
  DESERT_LAYER_SPECS,
  PARALLAX_TILE_WIDTH,
  drawSkyBackdrop,
  periodicWave,
  renderLayer0FarDunes,
  renderLayer1MidDunesRuins,
  renderLayer2NearRidges,
  renderLayer3ForegroundSand,
} from '@/engine/render/draw/desertLayers';
import { PALETTES, lerpPalette } from '@/engine/render/palette';
import { ParallaxSystem, type CanvasFactory } from '@/engine/systems/ParallaxSystem';
import { RouteSystem } from '@/engine/systems/RouteSystem';
import { CameraSystem } from '@/engine/systems/CameraSystem';
import { EventBus } from '@/engine/EventBus';
import { GameFSM } from '@/engine/fsm/GameFSM';
import { TimerService } from '@/engine/TimerService';
import { useGameStore } from '@/store/gameStore';

function createMockCanvasFactory(): {
  factory: CanvasFactory;
  created: Array<{ width: number; height: number }>;
} {
  const created: Array<{ width: number; height: number }> = [];
  const noop = () => {};
  const gradStub = { addColorStop: noop };
  const ctxStub = {
    save: noop,
    restore: noop,
    clearRect: noop,
    fillRect: noop,
    beginPath: noop,
    closePath: noop,
    moveTo: noop,
    lineTo: noop,
    arc: noop,
    fill: noop,
    stroke: noop,
    translate: noop,
    drawImage: noop,
    createLinearGradient: () => gradStub,
    createRadialGradient: () => gradStub,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    globalAlpha: 1,
  };

  // Provide lightweight Path2D stub for Node if absent
  if (typeof globalThis.Path2D === 'undefined') {
    (globalThis as unknown as { Path2D: unknown }).Path2D = class {
      moveTo() {}
      lineTo() {}
      rect() {}
      quadraticCurveTo() {}
      closePath() {}
    };
  }

  const factory: CanvasFactory = (width, height) => {
    const entry = { width, height };
    created.push(entry);
    return {
      width,
      height,
      getContext: () => ctxStub,
    } as unknown as HTMLCanvasElement;
  };

  return { factory, created };
}

describe('Parallax, Route, Camera & EventBus Unit Suite', () => {
  beforeEach(() => {
    useGameStore.getState().resetToDefaults();
  });

  it('periodicWave produces identical boundary values at x = 0 and x = tileWidth (0-seam)', () => {
    const harmonics = [
      { freq: 1, amp: 14, phase: 0.4 },
      { freq: 3, amp: 7, phase: 1.9 },
      { freq: 5, amp: 3, phase: 2.7 },
    ];
    const start = periodicWave(0, PARALLAX_TILE_WIDTH, harmonics);
    const end = periodicWave(PARALLAX_TILE_WIDTH, PARALLAX_TILE_WIDTH, harmonics);
    expect(start).toBeCloseTo(end, 10);
  });

  it('ParallaxSystem scrolls k=[0.1, 0.3, 0.6, 1.0] and caches offscreen layers with 0 per-frame rebuilds', () => {
    const { factory, created } = createMockCanvasFactory();
    const parallax = new ParallaxSystem({ canvasFactory: factory });

    // 600 frames at 1/60s = 10s at 120 px/s -> raw displacement = 1200 * k
    for (let i = 0; i < 600; i++) {
      parallax.update(1 / 60, 120, 'DAY');
    }

    const offsets = parallax.getOffsets();
    expect(offsets[0]).toBeCloseTo(120 % 860, 3);
    expect(offsets[1]).toBeCloseTo(360 % 860, 3);
    expect(offsets[2]).toBeCloseTo(720 % 860, 3);
    expect(offsets[3]).toBeCloseTo(1200 % 860, 3);

    const mockMainCtx = factory(430, 512).getContext('2d')!;
    for (let f = 0; f < 30; f++) {
      parallax.render(mockMainCtx, 430, 512);
    }
    expect(parallax.getRebuildCount()).toBe(1);
    expect(created.length).toBe(5); // 4 cached layers + 1 test main canvas

    // Transition to STORM builds STORM layer set once across entire 2s crossfade
    parallax.update(0.5, 120, 'STORM');
    for (let f = 0; f < 60; f++) {
      parallax.update(1 / 60, 120, 'STORM');
      parallax.render(mockMainCtx, 430, 512);
    }
    expect(parallax.getRebuildCount()).toBe(2);
  });

  it('RouteSystem computes speeds, quicksand bypass (Lv11+), sandstorm mask, and never mutates routeProgress', () => {
    const route = new RouteSystem();
    const store = useGameStore.getState();

    // Stationary in OASIS_HUB
    const hubSnap = route.update(1 / 60, 'OASIS_HUB', useGameStore.getState());
    expect(hubSnap.actualSpeed).toBe(0);
    expect(hubSnap.isMoving).toBe(false);

    // Normal march -> 120 px/s
    store.setRouteProgress(25);
    const marchSnap = route.update(1 / 60, 'MARCH_NORMAL', useGameStore.getState());
    expect(marchSnap.actualSpeed).toBe(120);
    expect(marchSnap.isMoving).toBe(true);
    expect(useGameStore.getState().meta.routeProgress).toBe(25);

    // Act 1 Quicksand Lv1 -> 96 px/s
    store.setAct(1);
    const qsAct1 = route.update(1 / 60, 'HAZARD_ZONE', useGameStore.getState());
    expect(qsAct1.hazardKind).toBe('QUICKSAND');
    expect(qsAct1.actualSpeed).toBeCloseTo(96, 5);
    expect(qsAct1.isQuicksandSlowed).toBe(true);
    expect(qsAct1.isQuicksandBypassed).toBe(false);

    // Act 2 Quicksand Lv1 -> 72 px/s; Lv11 -> 120 px/s bypass
    store.setAct(2);
    const qsAct2 = route.update(1 / 60, 'HAZARD_ZONE', useGameStore.getState());
    expect(qsAct2.actualSpeed).toBeCloseTo(72, 5);

    store.addCurrencies({ sunGold: 10000 });
    for (let i = 0; i < 10; i++) store.upgradeLeg();
    expect(useGameStore.getState().sandwalker.legPartLevel).toBe(11);
    const qsBypass = route.update(1 / 60, 'HAZARD_ZONE', useGameStore.getState());
    expect(qsBypass.actualSpeed).toBe(120);
    expect(qsBypass.isQuicksandSlowed).toBe(false);
    expect(qsBypass.isQuicksandBypassed).toBe(true);

    // Act 3 Sandstorm vision mask cleared by Solar Shield
    store.setAct(3);
    const stormNoShield = route.update(1 / 60, 'HAZARD_ZONE', useGameStore.getState());
    expect(stormNoShield.isSandstorm).toBe(true);
    expect(stormNoShield.isSandstormVisionMasked).toBe(true);
    expect(stormNoShield.targetTimeOfDay).toBe('STORM');

    store.setSolarShield(500);
    const stormWithShield = route.update(1 / 60, 'HAZARD_ZONE', useGameStore.getState());
    expect(stormWithShield.isSandstormVisionMasked).toBe(false);

    // Stationary in BOSS_ENCOUNTER
    const bossSnap = route.update(1 / 60, 'BOSS_ENCOUNTER', useGameStore.getState());
    expect(bossSnap.actualSpeed).toBe(0);
  });

  it('CameraSystem applies non-downgrading quadratic shake decay and sandstorm mask lerp', () => {
    const cam = new CameraSystem({ rng: () => 1 }); // rng=1 => +1 direction
    cam.shake(12, 0.5);
    cam.shake(4, 0.2); // must not downgrade active 12px shake

    cam.update(0.1, { isSandstormVisionMasked: true, hpRatio: 1 });
    expect(cam.getOffset().x > 0).toBe(true);
    expect(cam.getOffset().x <= 12).toBe(true);
    expect(cam.getSandstormMaskAlpha()).toBeCloseTo(0.25, 4);

    // Advance past 0.5s -> shake settles to exact 0
    for (let i = 0; i < 10; i++) {
      cam.update(0.05, { isSandstormVisionMasked: true, hpRatio: 1 });
    }
    expect(cam.getOffset()).toEqual({ x: 0, y: 0 });
    expect(cam.getShakeIntensity()).toBe(0);
    expect(cam.getSandstormMaskAlpha()).toBe(1);

    // Shield activates -> mask clears smoothly
    for (let i = 0; i < 10; i++) {
      cam.update(0.05, { isSandstormVisionMasked: false, hpRatio: 0.2 });
    }
    expect(cam.getSandstormMaskAlpha()).toBe(0);
    expect(cam.getAlertVignetteAlpha() > 0).toBe(true);
  });

  it('EventBus integrates optionally with GameFSM without breaking 1-arg constructor', () => {
    const bus = new EventBus();
    const timer = new TimerService();
    const fsm = new GameFSM(timer, bus);
    const changes: Array<{ from: string | null; to: string }> = [];

    const off = bus.on('state:change', (ev) => {
      changes.push({ from: ev.from, to: ev.to });
    });

    fsm.registerState({ id: 'OASIS_HUB', enter() {}, update() {}, exit() {} });
    fsm.registerState({ id: 'MARCH_NORMAL', enter() {}, update() {}, exit() {} });

    fsm.transitionTo('OASIS_HUB');
    fsm.transitionTo('MARCH_NORMAL');
    expect(changes).toEqual([
      { from: null, to: 'OASIS_HUB' },
      { from: 'OASIS_HUB', to: 'MARCH_NORMAL' },
    ]);

    off();
    expect(bus.listenerCount('state:change')).toBe(0);
  });

  it('produces zero-seam periodic polylines (|y(0) - y(860)| < 1e-9) across all 4 desert layers', () => {
    interface Point {
      x: number;
      y: number;
    }
    class RecordingPath2D {
      public readonly points: Point[] = [];
      moveTo(x: number, y: number) {
        this.points.push({ x, y });
      }
      lineTo(x: number, y: number) {
        this.points.push({ x, y });
      }
      rect() {}
      quadraticCurveTo() {}
      closePath() {}
    }

    const prevPath2D = (globalThis as unknown as { Path2D?: unknown }).Path2D;
    (globalThis as unknown as { Path2D: unknown }).Path2D = RecordingPath2D;

    const evalPolylineY = (pts: Point[], targetX: number): number => {
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i];
        const b = pts[i + 1];
        if (b.x > a.x && targetX >= a.x - 1e-9 && targetX <= b.x + 1e-9) {
          const t = (targetX - a.x) / (b.x - a.x);
          return a.y + (b.y - a.y) * t;
        }
      }
      throw new Error(`targetX=${targetX} not covered by polyline`);
    };

    try {
      const makeRecordingCtx = () => {
        const filled: RecordingPath2D[] = [];
        const stroked: RecordingPath2D[] = [];
        const noop = () => {};
        const gradStub = { addColorStop: noop };
        const ctx = {
          save: noop,
          restore: noop,
          clearRect: noop,
          fillRect: noop,
          beginPath: noop,
          closePath: noop,
          moveTo: noop,
          lineTo: noop,
          arc: noop,
          fill: (p?: RecordingPath2D) => {
            if (p instanceof RecordingPath2D) filled.push(p);
          },
          stroke: (p?: RecordingPath2D) => {
            if (p instanceof RecordingPath2D) stroked.push(p);
          },
          createLinearGradient: () => gradStub,
          createRadialGradient: () => gradStub,
          fillStyle: '',
          strokeStyle: '',
          lineWidth: 1,
          globalAlpha: 1,
        } as unknown as CanvasRenderingContext2D;
        return { ctx, filled, stroked };
      };

      // Layer 0: far dune silhouette
      const rec0 = makeRecordingCtx();
      renderLayer0FarDunes(rec0.ctx, PALETTES.DAY, PARALLAX_TILE_WIDTH, DESERT_LAYER_SPECS[0].height);
      const l0Wave = rec0.filled.filter((p) => p.points.length > 20);
      expect(l0Wave.length).toBe(1);
      expect(Math.abs(evalPolylineY(l0Wave[0].points, 0) - evalPolylineY(l0Wave[0].points, 860)) < 1e-9).toBe(true);

      // Layer 1: back and front dune silhouettes
      const rec1 = makeRecordingCtx();
      renderLayer1MidDunesRuins(rec1.ctx, PALETTES.DAY, PARALLAX_TILE_WIDTH, DESERT_LAYER_SPECS[1].height);
      const l1Waves = rec1.filled.filter((p) => p.points.length > 20);
      expect(l1Waves.length).toBe(2);
      for (const p of l1Waves) {
        expect(Math.abs(evalPolylineY(p.points, 0) - evalPolylineY(p.points, 860)) < 1e-9).toBe(true);
      }

      // Layer 2: near sandstone ridge silhouette
      const rec2 = makeRecordingCtx();
      renderLayer2NearRidges(rec2.ctx, PALETTES.DAY, PARALLAX_TILE_WIDTH, DESERT_LAYER_SPECS[2].height);
      const l2Wave = rec2.filled.filter((p) => p.points.length > 20);
      expect(l2Wave.length).toBe(1);
      expect(Math.abs(evalPolylineY(l2Wave[0].points, 0) - evalPolylineY(l2Wave[0].points, 860)) < 1e-9).toBe(true);

      // Layer 3: 3 foreground sand ripple strokes
      const rec3 = makeRecordingCtx();
      renderLayer3ForegroundSand(rec3.ctx, PALETTES.DAY, PARALLAX_TILE_WIDTH, DESERT_LAYER_SPECS[3].height);
      const l3Ripples = rec3.stroked.filter((p) => p.points.length > 20);
      expect(l3Ripples.length).toBe(3);
      for (const p of l3Ripples) {
        expect(Math.abs(evalPolylineY(p.points, 0) - evalPolylineY(p.points, 860)) < 1e-9).toBe(true);
      }
    } finally {
      (globalThis as unknown as { Path2D: unknown }).Path2D = prevPath2D;
    }
  });

  it('drawSkyBackdrop fades night stars smoothly via starsAlpha instead of snapping at t=0.5', () => {
    const captureArcAlphas = (t: number): number[] => {
      const alphas: number[] = [];
      const gradStub = { addColorStop: () => {} };
      let currentAlpha = 1;
      const ctx = {
        save: () => {},
        restore: () => {},
        fillRect: () => {},
        beginPath: () => {},
        arc: () => {
          alphas.push(currentAlpha);
        },
        fill: () => {},
        createLinearGradient: () => gradStub,
        createRadialGradient: () => gradStub,
        fillStyle: '',
        set globalAlpha(v: number) {
          currentAlpha = v;
        },
        get globalAlpha() {
          return currentAlpha;
        },
      } as unknown as CanvasRenderingContext2D;

      drawSkyBackdrop(ctx, lerpPalette(PALETTES.DAY, PALETTES.NIGHT, t));
      return alphas;
    };

    const dayArcs = captureArcAlphas(0);
    const quarterArcs = captureArcAlphas(0.25);
    const nightArcs = captureArcAlphas(1.0);

    // 2 celestial arcs (glow + disc) at DAY, plus 14 star arcs when starsAlpha > 0.01
    expect(dayArcs.length).toBe(2);
    expect(quarterArcs.length).toBe(16);
    expect(nightArcs.length).toBe(16);
    // Star alpha scales smoothly between 0.25 and 1.0
    expect(quarterArcs[0] < nightArcs[0]).toBe(true);
  });

  it('ParallaxSystem remains finite with extreme speed (1e308) and invalid tileWidth (Infinity)', () => {
    const { factory } = createMockCanvasFactory();
    const badTileParallax = new ParallaxSystem({
      tileWidth: Number.POSITIVE_INFINITY,
      canvasFactory: factory,
    });
    expect(badTileParallax.tileWidth).toBe(PARALLAX_TILE_WIDTH);

    badTileParallax.update(10, 1e308, 'DAY');
    for (const offset of badTileParallax.getOffsets()) {
      expect(Number.isFinite(offset)).toBe(true);
      expect(offset >= 0 && offset < PARALLAX_TILE_WIDTH).toBe(true);
    }

    // Subsequent normal update stays clean (never poisoned by NaN)
    badTileParallax.update(1 / 60, 120, 'DAY');
    for (const offset of badTileParallax.getOffsets()) {
      expect(Number.isFinite(offset)).toBe(true);
    }
  });

  it('CameraSystem prevents tiny-shake duration leaks and rejects NaN/Infinity vignette & hitFlash', () => {
    const cam = new CameraSystem({ rng: () => 1 });

    // Tiny sub-threshold shake with long duration must reset cleanly on update
    cam.shake(0.01, 10.0);
    cam.update(0.016, { isSandstormVisionMasked: false, hpRatio: 1 });
    expect(cam.getShakeIntensity()).toBe(0);

    // Subsequent short 0.2s shake must NOT inherit the 10s duration
    cam.shake(10, 0.2);
    cam.update(0.5, { isSandstormVisionMasked: false, hpRatio: 1 });
    expect(cam.getShakeIntensity()).toBe(0);
    expect(cam.getOffset()).toEqual({ x: 0, y: 0 });

    // NaN / Infinity guards on vignette and hit flash
    cam.triggerAlertVignette(1.0, Number.NaN);
    expect(cam.getAlertVignetteAlpha()).toBe(0);
    cam.triggerAlertVignette(1.0, Number.POSITIVE_INFINITY);
    expect(cam.getAlertVignetteAlpha()).toBe(0);
    cam.triggerHitFlash(Number.NaN);
    cam.triggerHitFlash(Number.POSITIVE_INFINITY);
    cam.update(0.016, { isSandstormVisionMasked: false, hpRatio: 1 });
    expect(Number.isFinite(cam.getAlertVignetteAlpha())).toBe(true);
  });

  it('RouteSystem sanitizes NaN store fields without propagating NaN to snapshot outputs', () => {
    const route = new RouteSystem();
    const state = useGameStore.getState();
    const poisoned = {
      ...state,
      meta: {
        ...state.meta,
        currentAct: Number.NaN,
        currentOasisIndex: Number.NaN,
        routeProgress: Number.NaN,
      },
      sandwalker: {
        ...state.sandwalker,
        legPartLevel: Number.NaN,
        solarShieldHp: Number.NaN,
      },
    };

    const snap = route.update(1 / 60, 'HAZARD_ZONE', poisoned);
    expect(Number.isFinite(snap.actualSpeed)).toBe(true);
    expect(Number.isFinite(snap.deltaX)).toBe(true);
    expect(Number.isFinite(snap.distanceTraveledPx)).toBe(true);
    expect(Number.isFinite(snap.remainingMeters)).toBe(true);
    expect(snap.distanceTraveledPx).toBe(0);
    expect(snap.isQuicksandBypassed).toBe(false);
    expect(snap.isQuicksandSlowed).toBe(true);
  });

  it('ParallaxSystem preserves interrupted DUSK layer alpha when interrupted toward STORM', () => {
    const prevPath2D = (globalThis as unknown as { Path2D?: unknown }).Path2D;
    if (typeof prevPath2D === 'undefined') {
      (globalThis as unknown as { Path2D: unknown }).Path2D = class {
        moveTo() {}
        lineTo() {}
        rect() {}
        quadraticCurveTo() {}
        closePath() {}
      };
    }

    try {
      const { factory } = createMockCanvasFactory();
      const parallax = new ParallaxSystem({
        initialTimeOfDay: 'DAY',
        paletteLerpDuration: 2.0,
        canvasFactory: factory,
      });

      const drawCalls: Array<{ alpha: number; layer: HTMLCanvasElement }> = [];
      let alpha = 1;
      const noop = () => {};
      const gradStub = { addColorStop: noop };
      const ctx = {
        save: noop,
        restore: noop,
        fillRect: noop,
        beginPath: noop,
        arc: noop,
        fill: noop,
        translate: noop,
        drawImage: (img: HTMLCanvasElement) => {
          drawCalls.push({ alpha, layer: img });
        },
        createLinearGradient: () => gradStub,
        createRadialGradient: () => gradStub,
        fillStyle: '',
        set globalAlpha(v: number) {
          alpha = v;
        },
        get globalAlpha() {
          return alpha;
        },
      } as unknown as CanvasRenderingContext2D;

      // Advance DAY -> DUSK to t = 0.3
      parallax.update(0.6, 0, 'DUSK');
      drawCalls.length = 0;
      parallax.render(ctx, 430, 512);
      const preInterruptDuskAlphas = drawCalls
        .filter((d) => Math.abs(d.alpha - 0.3) < 1e-6)
        .map((d) => d.layer);
      expect(preInterruptDuskAlphas.length).toBe(4);

      // Interrupt toward STORM (dt = 0 -> newP = 0): DUSK@0.3 layers must still render
      parallax.update(0, 0, 'STORM');
      drawCalls.length = 0;
      parallax.render(ctx, 430, 512);
      const atInterruptDuskAlphas = drawCalls
        .filter((d) => Math.abs(d.alpha - 0.3) < 1e-6)
        .map((d) => d.layer);
      expect(atInterruptDuskAlphas).toEqual(preInterruptDuskAlphas);
    } finally {
      (globalThis as unknown as { Path2D: unknown }).Path2D = prevPath2D;
    }
  });
});
