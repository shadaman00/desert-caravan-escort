export type SfxKind =
  | 'HEAT_RAY'
  | 'HARPOON'
  | 'MORTAR_EXPLOSION'
  | 'ARMOR_BREAK'
  | 'TURRET_SWITCH'
  | 'SETTLEMENT_COIN'
  | 'BOSS_WARNING'
  | 'AUTO_UPGRADE_CHIME'
  | 'TIER_UP_FANFARE'
  | 'LOOT_PICKUP'
  | 'QUEST_COMPLETE'
  | 'LEGENDARY_RELIC';

const MUTE_STORAGE_KEY = 'SANDWALKER_MUTED';

export interface MinimalAudioNode {
  connect(dest: unknown): unknown;
}

export interface MinimalOscillator extends MinimalAudioNode {
  type: OscillatorType;
  frequency: {
    setValueAtTime(value: number, startTime: number): void;
    exponentialRampToValueAtTime(value: number, endTime: number): void;
  };
  start(when?: number): void;
  stop(when?: number): void;
}

export interface MinimalGainNode extends MinimalAudioNode {
  gain: {
    setValueAtTime(value: number, startTime: number): void;
    exponentialRampToValueAtTime(value: number, endTime: number): void;
  };
}

export interface MinimalBufferSource extends MinimalAudioNode {
  buffer: unknown;
  start(when?: number): void;
  stop(when?: number): void;
}

export interface MinimalAudioContext {
  readonly currentTime: number;
  readonly state: string;
  readonly sampleRate: number;
  readonly destination: unknown;
  resume(): Promise<void>;
  createOscillator(): MinimalOscillator;
  createGain(): MinimalGainNode;
  createBuffer(channels: number, length: number, sampleRate: number): {
    getChannelData(channel: number): Float32Array;
  };
  createBufferSource(): MinimalBufferSource;
}

export type AudioContextFactory = () => MinimalAudioContext | null;

export function defaultAudioContextFactory(): MinimalAudioContext | null {
  if (typeof window === 'undefined') return null;
  const win = window as unknown as {
    AudioContext?: new () => MinimalAudioContext;
    webkitAudioContext?: new () => MinimalAudioContext;
  };
  const Ctor = win.AudioContext ?? win.webkitAudioContext;
  if (!Ctor) return null;
  try {
    return new Ctor();
  } catch {
    return null;
  }
}

function clampVolume(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(1, Math.max(0, value));
}

export interface SoundEngineStatus {
  initialized: boolean;
  muted: boolean;
  masterVolume: number;
  sfxVolume: number;
  playCount: number;
}

export class SoundEngine {
  private readonly contextFactory: AudioContextFactory;
  private ctx: MinimalAudioContext | null = null;
  private muted: boolean;
  private masterVolume = 1.0;
  private sfxVolume = 0.85;
  private playCount = 0;
  private lastHeatRayMs = 0;
  private lastArmorBreakMs = 0;

  constructor(options?: { audioContextFactory?: AudioContextFactory; initialMuted?: boolean }) {
    this.contextFactory = options?.audioContextFactory ?? defaultAudioContextFactory;
    if (options?.initialMuted !== undefined) {
      this.muted = options.initialMuted;
    } else {
      this.muted = SoundEngine.readMutedStorage();
    }
  }

  private static readMutedStorage(): boolean {
    if (typeof window === 'undefined') return false;
    try {
      return window.localStorage.getItem(MUTE_STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  }

  public unlock(): boolean {
    if (!this.ctx) {
      this.ctx = this.contextFactory();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      try {
        void this.ctx.resume().catch(() => undefined);
      } catch {
        // Ignore headless autoplay policy errors
      }
    }
    return this.ctx !== null;
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public setMuted(nextMuted: boolean): void {
    this.muted = Boolean(nextMuted);
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(MUTE_STORAGE_KEY, this.muted ? '1' : '0');
      } catch {
        // Ignore storage errors
      }
    }
  }

  public toggleMute(): boolean {
    this.unlock();
    this.setMuted(!this.muted);
    return this.muted;
  }

  public setMasterVolume(volume: number): void {
    this.masterVolume = clampVolume(volume);
  }

  public getMasterVolume(): number {
    return this.masterVolume;
  }

  public setSfxVolume(volume: number): void {
    this.sfxVolume = clampVolume(volume);
  }

  public getSfxVolume(): number {
    return this.sfxVolume;
  }

  public getStatus(): SoundEngineStatus {
    return {
      initialized: this.ctx !== null,
      muted: this.muted,
      masterVolume: this.masterVolume,
      sfxVolume: this.sfxVolume,
      playCount: this.playCount,
    };
  }

  public play(kind: SfxKind, nowMs = Date.now()): boolean {
    const effectiveVol = this.masterVolume * this.sfxVolume;
    if (this.muted || effectiveVol <= 0.0001) return false;
    if (!this.ctx) {
      if (!this.unlock()) return false;
    }
    const ctx = this.ctx;
    if (!ctx) return false;

    if (kind === 'HEAT_RAY') {
      if (nowMs - this.lastHeatRayMs < 140) return false;
      this.lastHeatRayMs = nowMs;
    } else if (kind === 'ARMOR_BREAK') {
      if (nowMs - this.lastArmorBreakMs < 180) return false;
      this.lastArmorBreakMs = nowMs;
    }

    try {
      const t0 = ctx.currentTime;
      switch (kind) {
        case 'HEAT_RAY':
          this.playTone(ctx, 'sawtooth', 780, 420, 0.08, 0.055 * effectiveVol, t0);
          break;
        case 'HARPOON':
          this.playTone(ctx, 'square', 520, 140, 0.11, 0.09 * effectiveVol, t0);
          break;
        case 'MORTAR_EXPLOSION':
          this.playTone(ctx, 'triangle', 160, 48, 0.22, 0.12 * effectiveVol, t0);
          this.playNoise(ctx, 0.18, 0.08 * effectiveVol, t0);
          break;
        case 'ARMOR_BREAK':
          this.playTone(ctx, 'square', 920, 260, 0.14, 0.1 * effectiveVol, t0);
          this.playTone(ctx, 'triangle', 1240, 480, 0.1, 0.07 * effectiveVol, t0 + 0.03);
          break;
        case 'TURRET_SWITCH':
          this.playTone(ctx, 'square', 440, 660, 0.06, 0.06 * effectiveVol, t0);
          break;
        case 'SETTLEMENT_COIN':
          this.playTone(ctx, 'square', 988, 988, 0.06, 0.08 * effectiveVol, t0);
          this.playTone(ctx, 'square', 1318, 1318, 0.12, 0.08 * effectiveVol, t0 + 0.06);
          break;
        case 'BOSS_WARNING':
          this.playTone(ctx, 'sawtooth', 220, 140, 0.2, 0.1 * effectiveVol, t0);
          this.playTone(ctx, 'sawtooth', 220, 120, 0.24, 0.1 * effectiveVol, t0 + 0.22);
          break;
        case 'AUTO_UPGRADE_CHIME':
          this.playTone(ctx, 'triangle', 660, 880, 0.08, 0.09 * effectiveVol, t0);
          this.playTone(ctx, 'triangle', 990, 1320, 0.14, 0.09 * effectiveVol, t0 + 0.07);
          break;
        case 'TIER_UP_FANFARE':
          this.playTone(ctx, 'square', 523, 523, 0.08, 0.08 * effectiveVol, t0);
          this.playTone(ctx, 'square', 659, 659, 0.08, 0.08 * effectiveVol, t0 + 0.08);
          this.playTone(ctx, 'triangle', 784, 1046, 0.18, 0.1 * effectiveVol, t0 + 0.16);
          break;
        case 'LOOT_PICKUP':
          this.playTone(ctx, 'triangle', 880, 1320, 0.09, 0.07 * effectiveVol, t0);
          break;
        case 'QUEST_COMPLETE':
          this.playTone(ctx, 'triangle', 587, 880, 0.1, 0.08 * effectiveVol, t0);
          this.playTone(ctx, 'triangle', 1175, 1175, 0.16, 0.09 * effectiveVol, t0 + 0.09);
          break;
        case 'LEGENDARY_RELIC':
          this.playTone(ctx, 'sine', 659, 659, 0.1, 0.08 * effectiveVol, t0);
          this.playTone(ctx, 'triangle', 988, 988, 0.1, 0.08 * effectiveVol, t0 + 0.08);
          this.playTone(ctx, 'triangle', 1318, 1568, 0.2, 0.1 * effectiveVol, t0 + 0.16);
          break;
      }
      this.playCount += 1;
      return true;
    } catch {
      return false;
    }
  }

  private playTone(
    ctx: MinimalAudioContext,
    type: OscillatorType,
    startFreq: number,
    endFreq: number,
    durationSec: number,
    peakGain: number,
    startTime: number
  ): void {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, startFreq), startTime);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), startTime + durationSec);

    gain.gain.setValueAtTime(Math.max(0.001, peakGain), startTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + durationSec);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(startTime);
    osc.stop(startTime + durationSec);
  }

  private playNoise(
    ctx: MinimalAudioContext,
    durationSec: number,
    peakGain: number,
    startTime: number
  ): void {
    const sampleCount = Math.max(64, Math.floor(ctx.sampleRate * durationSec));
    const buffer = ctx.createBuffer(1, sampleCount, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < sampleCount; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / sampleCount);
    }

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(Math.max(0.001, peakGain), startTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + durationSec);

    src.connect(gain);
    gain.connect(ctx.destination);
    src.start(startTime);
    src.stop(startTime + durationSec);
  }
}

export const soundEngine = new SoundEngine();
