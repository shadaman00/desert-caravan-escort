import {
  defaultAudioContextFactory,
  type AudioContextFactory,
  type MinimalAudioContext,
} from './SoundEngine';

export type BgmTheme = 'OASIS_HUB' | 'MARCH_NORMAL' | 'HAZARD_ZONE' | 'BOSS_ENCOUNTER';

export interface BgmEngineStatus {
  running: boolean;
  currentTheme: BgmTheme;
  muted: boolean;
  masterVolume: number;
  bgmVolume: number;
  scheduledNotes: number;
}

const THEME_PATTERNS: Record<
  BgmTheme,
  { intervalMs: number; oscType: OscillatorType; notesHz: readonly number[] }
> = {
  OASIS_HUB: {
    intervalMs: 460,
    oscType: 'sine',
    notesHz: [293.66, 369.99, 440.0, 392.0, 311.13, 369.99, 293.66],
  },
  MARCH_NORMAL: {
    intervalMs: 320,
    oscType: 'triangle',
    notesHz: [293.66, 311.13, 369.99, 392.0, 440.0, 392.0, 369.99, 311.13],
  },
  HAZARD_ZONE: {
    intervalMs: 260,
    oscType: 'triangle',
    notesHz: [220.0, 233.08, 277.18, 293.66, 277.18, 233.08],
  },
  BOSS_ENCOUNTER: {
    intervalMs: 200,
    oscType: 'sawtooth',
    notesHz: [146.83, 220.0, 155.56, 233.08, 185.0, 293.66, 155.56],
  },
};

export function resolveBgmThemeForState(fsmStateId: string | null | undefined): BgmTheme {
  switch (fsmStateId) {
    case 'BOSS_ENCOUNTER':
    case 'EMERGENCY_REVIVE':
      return 'BOSS_ENCOUNTER';
    case 'HAZARD_ZONE':
      return 'HAZARD_ZONE';
    case 'MARCH_NORMAL':
    case 'OPENING_HOOK':
      return 'MARCH_NORMAL';
    case 'OASIS_HUB':
    case 'OASIS_SETTLEMENT':
    default:
      return 'OASIS_HUB';
  }
}

function clampUnit(value: number): number {
  if (!Number.isFinite(value)) return 0.55;
  return Math.min(1, Math.max(0, value));
}

/**
 * Lightweight adaptive procedural Web Audio desert soundtrack crossfading per FSM state.
 */
export class BgmEngine {
  private readonly contextFactory: AudioContextFactory;
  private ctx: MinimalAudioContext | null = null;
  private timerId: ReturnType<typeof setInterval> | null = null;
  private currentTheme: BgmTheme = 'OASIS_HUB';
  private noteIndex = 0;
  private running = false;
  private muted = false;
  private masterVolume = 1.0;
  private bgmVolume = 0.55;
  private scheduledNotes = 0;

  constructor(options?: { audioContextFactory?: AudioContextFactory }) {
    this.contextFactory = options?.audioContextFactory ?? defaultAudioContextFactory;
  }

  public unlock(): boolean {
    if (!this.ctx) {
      this.ctx = this.contextFactory();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      try {
        void this.ctx.resume().catch(() => undefined);
      } catch {
        // Ignore headless autoplay restriction
      }
    }
    return this.ctx !== null;
  }

  public setVolumes(opts: { masterVolume?: number; bgmVolume?: number; muted?: boolean }): void {
    if (opts.masterVolume !== undefined) {
      this.masterVolume = clampUnit(opts.masterVolume);
    }
    if (opts.bgmVolume !== undefined) {
      this.bgmVolume = clampUnit(opts.bgmVolume);
    }
    if (opts.muted !== undefined) {
      this.muted = Boolean(opts.muted);
    }
  }

  public setTheme(fsmStateId: string | null | undefined): BgmTheme {
    const next = resolveBgmThemeForState(fsmStateId);
    if (next === this.currentTheme) return next;
    this.currentTheme = next;
    this.noteIndex = 0;
    if (this.running) {
      this.restartScheduler();
    }
    return next;
  }

  public start(fsmStateId?: string | null): boolean {
    if (fsmStateId !== undefined) {
      this.currentTheme = resolveBgmThemeForState(fsmStateId);
    }
    this.running = true;
    this.unlock();
    this.restartScheduler();
    return true;
  }

  public stop(): void {
    this.running = false;
    if (this.timerId !== null) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  private restartScheduler(): void {
    if (this.timerId !== null) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
    if (!this.running || typeof setInterval === 'undefined') return;
    const pattern = THEME_PATTERNS[this.currentTheme];
    this.timerId = setInterval(() => {
      this.stepNote();
    }, pattern.intervalMs);
  }

  public stepNote(): boolean {
    if (!this.running) return false;
    const effectiveGain = this.masterVolume * this.bgmVolume * 0.045;
    if (this.muted || effectiveGain <= 0.0001) return false;
    if (!this.ctx && !this.unlock()) return false;
    const ctx = this.ctx;
    if (!ctx) return false;

    const pattern = THEME_PATTERNS[this.currentTheme];
    const freq = pattern.notesHz[this.noteIndex % pattern.notesHz.length];
    this.noteIndex = (this.noteIndex + 1) % pattern.notesHz.length;

    try {
      const t0 = ctx.currentTime;
      const dur = (pattern.intervalMs / 1000) * 0.85;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = pattern.oscType;
      osc.frequency.setValueAtTime(freq, t0);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.995, t0 + dur);
      gain.gain.setValueAtTime(Math.max(0.001, effectiveGain), t0);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + dur);
      this.scheduledNotes += 1;
      return true;
    } catch {
      return false;
    }
  }

  public getStatus(): BgmEngineStatus {
    return {
      running: this.running,
      currentTheme: this.currentTheme,
      muted: this.muted,
      masterVolume: this.masterVolume,
      bgmVolume: this.bgmVolume,
      scheduledNotes: this.scheduledNotes,
    };
  }
}

export const bgmEngine = new BgmEngine();
