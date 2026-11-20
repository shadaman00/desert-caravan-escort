export const FIXED_DT = 1 / 60;
export const MAX_SUBSTEPS = 5;
export const MAX_FRAME_DELTA = 0.1;
export const MAX_TIME_SCALE = 10;

export function sanitizeTimeScale(raw: unknown): number {
  if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 0) {
    return Math.min(MAX_TIME_SCALE, raw);
  }
  return 1;
}

export interface GameLoopCallbacks {
  onUpdate: (dt: number) => void;
  onRender: (alpha: number) => void;
}

export interface GameLoopOptions {
  fixedDt?: number;
  maxSubSteps?: number;
  maxFrameDelta?: number;
  getTimeScale?: () => number;
  autoBindVisibility?: boolean;
  raf?: (cb: (timestampMs: number) => void) => number;
  cancelRaf?: (id: number) => void;
}

function defaultGetTimeScale(): number {
  if (typeof window !== 'undefined') {
    const scale = (window as unknown as { __SANDWALKER_TIME_SCALE__?: unknown })
      .__SANDWALKER_TIME_SCALE__;
    return sanitizeTimeScale(scale);
  }
  return 1;
}

export class GameLoop {
  private readonly callbacks: GameLoopCallbacks;
  private readonly fixedDt: number;
  private readonly maxSubSteps: number;
  private readonly maxFrameDelta: number;
  private readonly getTimeScale: () => number;
  private readonly autoBindVisibility: boolean;
  private readonly raf: ((cb: (timestampMs: number) => void) => number) | null;
  private readonly cancelRaf: ((id: number) => void) | null;

  private running = false;
  private paused = false;
  private pausedManually = false;
  private pausedByVisibility = false;
  private rafId: number | null = null;
  private lastTimestampMs: number | null = null;
  private accumulator = 0;
  private fps = 0;
  private visibilityBound = false;

  private readonly handleRaf = (timestampMs: number): void => {
    this.rafId = null;
    if (!this.running || this.paused) {
      return;
    }
    this.step(timestampMs);
    if (this.running && !this.paused && this.rafId === null) {
      this.scheduleNextFrame();
    }
  };

  private readonly handleVisibilityChange = (): void => {
    if (typeof document === 'undefined') return;
    if (document.visibilityState === 'hidden') {
      this.pauseByVisibility();
    } else if (document.visibilityState === 'visible') {
      this.resumeByVisibility();
    }
  };

  constructor(callbacks: GameLoopCallbacks, options: GameLoopOptions = {}) {
    this.callbacks = callbacks;
    this.fixedDt =
      options.fixedDt !== undefined && Number.isFinite(options.fixedDt) && options.fixedDt > 0
        ? options.fixedDt
        : FIXED_DT;
    this.maxSubSteps =
      options.maxSubSteps !== undefined &&
      Number.isFinite(options.maxSubSteps) &&
      options.maxSubSteps >= 1
        ? Math.floor(options.maxSubSteps)
        : MAX_SUBSTEPS;
    this.maxFrameDelta =
      options.maxFrameDelta !== undefined &&
      Number.isFinite(options.maxFrameDelta) &&
      options.maxFrameDelta > 0
        ? options.maxFrameDelta
        : MAX_FRAME_DELTA;
    this.getTimeScale = options.getTimeScale ?? defaultGetTimeScale;
    this.autoBindVisibility = options.autoBindVisibility ?? true;

    if (options.raf) {
      this.raf = options.raf;
    } else if (typeof requestAnimationFrame === 'function') {
      this.raf = (cb) => requestAnimationFrame(cb);
    } else {
      this.raf = null;
    }

    if (options.cancelRaf) {
      this.cancelRaf = options.cancelRaf;
    } else if (typeof cancelAnimationFrame === 'function') {
      this.cancelRaf = (id) => cancelAnimationFrame(id);
    } else {
      this.cancelRaf = null;
    }
  }

  public isRunning(): boolean {
    return this.running;
  }

  public isPaused(): boolean {
    return this.paused;
  }

  public getFps(): number {
    return this.fps;
  }

  public getAccumulator(): number {
    return this.accumulator;
  }

  public start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTimestampMs = null;
    this.accumulator = 0;
    this.pausedManually = false;

    if (this.autoBindVisibility && typeof document !== 'undefined' && !this.visibilityBound) {
      document.addEventListener('visibilitychange', this.handleVisibilityChange);
      this.visibilityBound = true;
      this.pausedByVisibility = document.visibilityState === 'hidden';
    } else {
      this.pausedByVisibility = false;
    }

    this.paused = this.pausedManually || this.pausedByVisibility;
    if (!this.paused) {
      this.scheduleNextFrame();
    }
  }

  public stop(): void {
    if (this.rafId !== null && this.cancelRaf) {
      this.cancelRaf(this.rafId);
    }
    this.rafId = null;
    this.running = false;
    this.paused = false;
    this.pausedManually = false;
    this.pausedByVisibility = false;
    this.lastTimestampMs = null;
    this.accumulator = 0;

    if (this.visibilityBound && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    }
    this.visibilityBound = false;
  }

  public dispose(): void {
    this.stop();
  }

  public pause(): void {
    if (!this.running) return;
    this.pausedManually = true;
    if (this.paused) return;
    this.paused = true;
    if (this.rafId !== null && this.cancelRaf) {
      this.cancelRaf(this.rafId);
    }
    this.rafId = null;
  }

  public resume(): void {
    if (!this.running) return;
    this.pausedManually = false;
    this.resumeIfUnpaused();
  }

  private pauseByVisibility(): void {
    if (!this.running) return;
    this.pausedByVisibility = true;
    if (this.paused) return;
    this.paused = true;
    if (this.rafId !== null && this.cancelRaf) {
      this.cancelRaf(this.rafId);
    }
    this.rafId = null;
  }

  private resumeByVisibility(): void {
    if (!this.running) return;
    this.pausedByVisibility = false;
    this.resumeIfUnpaused();
  }

  private resumeIfUnpaused(): void {
    if (this.pausedManually || this.pausedByVisibility || !this.paused) return;
    this.paused = false;
    this.lastTimestampMs = null;
    this.accumulator = 0;
    this.scheduleNextFrame();
  }

  public step(timestampMs: number): void {
    if (!this.running || this.paused) return;
    if (!Number.isFinite(timestampMs)) return;

    if (this.lastTimestampMs === null) {
      this.lastTimestampMs = timestampMs;
      this.callbacks.onRender(0);
      return;
    }

    const rawDt = Math.max(0, (timestampMs - this.lastTimestampMs) / 1000);
    this.lastTimestampMs = timestampMs;

    if (rawDt > 0) {
      const instantFps = 1 / rawDt;
      this.fps = this.fps === 0 ? instantFps : this.fps * 0.9 + instantFps * 0.1;
    }

    const clampedDt = Math.min(rawDt, this.maxFrameDelta);
    const timeScale = sanitizeTimeScale(this.getTimeScale());
    this.accumulator += clampedDt * timeScale;

    const effectiveMaxSubSteps =
      timeScale > 1
        ? Math.min(24, Math.ceil(this.maxSubSteps * timeScale))
        : this.maxSubSteps;

    let subSteps = 0;
    while (this.accumulator >= this.fixedDt && subSteps < effectiveMaxSubSteps) {
      this.callbacks.onUpdate(this.fixedDt);
      this.accumulator -= this.fixedDt;
      subSteps++;
    }

    if (subSteps >= effectiveMaxSubSteps && this.accumulator >= this.fixedDt) {
      this.accumulator = 0;
    }

    const alpha =
      this.fixedDt > 0 ? Math.min(1, Math.max(0, this.accumulator / this.fixedDt)) : 0;
    this.callbacks.onRender(alpha);
  }

  private scheduleNextFrame(): void {
    if (!this.raf || this.rafId !== null) return;
    this.rafId = this.raf(this.handleRaf);
  }
}
