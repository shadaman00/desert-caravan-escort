import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  FIXED_DT,
  GameLoop,
  MAX_SUBSTEPS,
  MAX_TIME_SCALE,
  sanitizeTimeScale,
} from '@/engine/GameLoop';

describe('GameLoop Unit Suite', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('steps at exact fixed 1/60s increments and passes interpolation alpha', () => {
    const updates: number[] = [];
    const renders: number[] = [];
    const loop = new GameLoop(
      {
        onUpdate: (dt) => updates.push(dt),
        onRender: (alpha) => renders.push(alpha),
      },
      { autoBindVisibility: false }
    );

    loop.start();
    // Anchor frame: renders immediately with alpha 0, 0 updates
    loop.step(0);
    expect(updates.length).toBe(0);
    expect(renders).toEqual([0]);

    // +16.667ms -> 1 fixed update
    loop.step(16.67);
    expect(updates.length).toBe(1);
    expect(updates[0]).toBeCloseTo(FIXED_DT, 8);
    expect(renders.length).toBe(2);

    // +16.67ms again -> 2 updates total
    loop.step(33.34);
    expect(updates.length).toBe(2);
    expect(renders.length).toBe(3);
  });

  it('clamps huge frame spikes and caps catch-up to MAX_SUBSTEPS (5)', () => {
    const updates: number[] = [];
    const loop = new GameLoop(
      {
        onUpdate: (dt) => updates.push(dt),
        onRender: () => {},
      },
      { autoBindVisibility: false }
    );

    loop.start();
    loop.step(0);

    // 500ms spike gets clamped to 0.1s (= 6 * 1/60s), capped at 5 substeps, debt cleared
    loop.step(500);
    expect(updates.length).toBe(MAX_SUBSTEPS);
    expect(loop.getAccumulator()).toBe(0);

    // Next normal 16.67ms frame runs exactly 1 update (no leftover debt)
    loop.step(516.67);
    expect(updates.length).toBe(MAX_SUBSTEPS + 1);
  });

  it('supports 1x and 4x simulation time scale via __SANDWALKER_TIME_SCALE__ or injector', () => {
    let timeScale = 1;
    const updates: number[] = [];
    const loop = new GameLoop(
      {
        onUpdate: (dt) => updates.push(dt),
        onRender: () => {},
      },
      {
        autoBindVisibility: false,
        getTimeScale: () => timeScale,
      }
    );

    loop.start();
    loop.step(0);

    // 1x: 16.67ms -> 1 substep
    loop.step(16.67);
    expect(updates.length).toBe(1);

    // 4x: 16.67ms -> 4 substeps
    timeScale = 4;
    loop.step(33.34);
    expect(updates.length).toBe(5);
    expect(updates.every((dt) => Math.abs(dt - FIXED_DT) < 1e-8)).toBe(true);
  });

  it('reads window.__SANDWALKER_TIME_SCALE__ by default when window exists', () => {
    vi.stubGlobal('window', { __SANDWALKER_TIME_SCALE__: 4 });
    const updates: number[] = [];
    const loop = new GameLoop(
      {
        onUpdate: (dt) => updates.push(dt),
        onRender: () => {},
      },
      { autoBindVisibility: false }
    );

    loop.start();
    loop.step(0);
    loop.step(16.67);
    expect(updates.length).toBe(4);
  });

  it('pauses and resumes cleanly without catch-up spikes across visibilitychange', () => {
    const listeners: Record<string, () => void> = {};
    const docMock = {
      visibilityState: 'visible' as DocumentVisibilityState,
      addEventListener: vi.fn((ev: string, cb: () => void) => {
        listeners[ev] = cb;
      }),
      removeEventListener: vi.fn((ev: string, cb: () => void) => {
        if (listeners[ev] === cb) delete listeners[ev];
      }),
    };
    vi.stubGlobal('document', docMock);

    const cancelRaf = vi.fn();
    let nextId = 1;
    const raf = vi.fn(() => nextId++);

    const updates: number[] = [];
    const renders: number[] = [];
    const loop = new GameLoop(
      {
        onUpdate: (dt) => updates.push(dt),
        onRender: (a) => renders.push(a),
      },
      { raf, cancelRaf }
    );

    loop.start();
    expect(loop.isRunning()).toBe(true);
    expect(loop.isPaused()).toBe(false);
    expect(docMock.addEventListener).toHaveBeenCalledOnce();
    expect(docMock.addEventListener.mock.calls[0][0]).toBe('visibilitychange');

    loop.step(0);
    loop.step(16.67);
    expect(updates.length).toBe(1);
    expect(renders.length).toBe(2);

    // Tab hidden
    docMock.visibilityState = 'hidden';
    listeners['visibilitychange']();
    expect(loop.isPaused()).toBe(true);
    expect(cancelRaf).toHaveBeenCalled();

    // Stepping while paused must do nothing
    loop.step(60000);
    expect(updates.length).toBe(1);
    expect(renders.length).toBe(2);

    // Tab visible again after 60s
    docMock.visibilityState = 'visible';
    listeners['visibilitychange']();
    expect(loop.isPaused()).toBe(false);

    // First frame after resume re-anchors timestamp without catch-up updates
    loop.step(60000);
    expect(updates.length).toBe(1);
    expect(renders.length).toBe(3);

    loop.step(60016.67);
    expect(updates.length).toBe(2);

    loop.dispose();
    expect(loop.isRunning()).toBe(false);
    expect(docMock.removeEventListener).toHaveBeenCalledOnce();
    expect(docMock.removeEventListener.mock.calls[0][0]).toBe('visibilitychange');
  });

  it('preserves manual pause across visibilitychange hidden -> visible until explicit resume', () => {
    const listeners: Record<string, () => void> = {};
    const docMock = {
      visibilityState: 'visible' as DocumentVisibilityState,
      addEventListener: vi.fn((ev: string, cb: () => void) => {
        listeners[ev] = cb;
      }),
      removeEventListener: vi.fn((ev: string, cb: () => void) => {
        if (listeners[ev] === cb) delete listeners[ev];
      }),
    };
    vi.stubGlobal('document', docMock);

    const updates: number[] = [];
    const loop = new GameLoop(
      {
        onUpdate: (dt) => updates.push(dt),
        onRender: () => {},
      },
      { raf: () => 1, cancelRaf: () => {} }
    );

    loop.start();
    loop.step(0);
    loop.step(16.67);
    expect(updates.length).toBe(1);

    // Explicitly pause before tab hide
    loop.pause();
    expect(loop.isPaused()).toBe(true);

    docMock.visibilityState = 'hidden';
    listeners['visibilitychange']();
    expect(loop.isPaused()).toBe(true);

    // Returning to visible must NOT override manual pause
    docMock.visibilityState = 'visible';
    listeners['visibilitychange']();
    expect(loop.isPaused()).toBe(true);

    loop.step(500);
    expect(updates.length).toBe(1);

    // Explicit resume restores execution cleanly
    loop.resume();
    expect(loop.isPaused()).toBe(false);
    loop.step(500);
    loop.step(516.67);
    expect(updates.length).toBe(2);

    loop.dispose();
  });

  it('clamps __SANDWALKER_TIME_SCALE__ to [0, MAX_TIME_SCALE] and rejects NaN/Infinity/negative', () => {
    expect(MAX_TIME_SCALE).toBe(10);
    expect(sanitizeTimeScale(0)).toBe(0);
    expect(sanitizeTimeScale(4)).toBe(4);
    expect(sanitizeTimeScale(10)).toBe(10);
    expect(sanitizeTimeScale(999)).toBe(10);
    expect(sanitizeTimeScale(-1)).toBe(1);
    expect(sanitizeTimeScale(Number.NaN)).toBe(1);
    expect(sanitizeTimeScale(Number.POSITIVE_INFINITY)).toBe(1);
    expect(sanitizeTimeScale(Number.NEGATIVE_INFINITY)).toBe(1);
    expect(sanitizeTimeScale('4')).toBe(1);

    // Pause at timeScale = 0
    vi.stubGlobal('window', { __SANDWALKER_TIME_SCALE__: 0 });
    const pausedUpdates: number[] = [];
    const pausedLoop = new GameLoop(
      { onUpdate: (dt) => pausedUpdates.push(dt), onRender: () => {} },
      { autoBindVisibility: false }
    );
    pausedLoop.start();
    pausedLoop.step(0);
    pausedLoop.step(16.67);
    expect(pausedUpdates.length).toBe(0);

    // Excessive scale clamped to MAX_TIME_SCALE (10)
    vi.stubGlobal('window', { __SANDWALKER_TIME_SCALE__: 999 });
    const clampedUpdates: number[] = [];
    const clampedLoop = new GameLoop(
      { onUpdate: (dt) => clampedUpdates.push(dt), onRender: () => {} },
      { autoBindVisibility: false }
    );
    clampedLoop.start();
    clampedLoop.step(0);
    clampedLoop.step(16.67); // 0.01667 * 10 = 0.1667s -> 10 substeps (0.16667s)
    expect(clampedUpdates.length).toBe(10);

    // Invalid NaN scale falls back to 1x
    vi.stubGlobal('window', { __SANDWALKER_TIME_SCALE__: Number.NaN });
    const fallbackUpdates: number[] = [];
    const fallbackLoop = new GameLoop(
      { onUpdate: (dt) => fallbackUpdates.push(dt), onRender: () => {} },
      { autoBindVisibility: false }
    );
    fallbackLoop.start();
    fallbackLoop.step(0);
    fallbackLoop.step(16.67);
    expect(fallbackUpdates.length).toBe(1);
  });

  it('scales sub-step budget proportionally at 4x on 30fps (33.34ms) frames without dropping steps', () => {
    vi.stubGlobal('window', { __SANDWALKER_TIME_SCALE__: 4 });
    const updates: number[] = [];
    const loop = new GameLoop(
      {
        onUpdate: (dt) => updates.push(dt),
        onRender: () => {},
      },
      { autoBindVisibility: false }
    );

    loop.start();
    loop.step(0);
    // 33.34ms * 4 = 133.36ms -> 8 exact 1/60s sub-steps (exceeds 1x MAX_SUBSTEPS=5)
    loop.step(33.34);
    expect(updates.length).toBe(8);
  });
});
