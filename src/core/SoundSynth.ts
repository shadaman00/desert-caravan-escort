import type { AmbienceId, BgmId, SfxId } from '@/data/audioManifest';

export type SfxKey =
  | 'lockOn'
  | 'steamVent'
  | 'turretCycle'
  | 'goldenParry'
  | 'shieldActivate'
  | 'relicExcavate';

export interface ActiveSynthHandle {
  stop: () => void;
  durationMs: number;
}

const BGM_SCALES: Record<BgmId, readonly number[]> = {
  bgm_title_opening: [146.83, 220.0, 293.66, 311.13, 369.99, 440.0], // D Hijaz / Phrygian Dominant
  bgm_zone1_dunes: [196.0, 293.66, 311.13, 369.99, 392.0, 466.16],   // G upbeat caravan
  bgm_zone2_canyon: [130.81, 196.0, 261.63, 277.18, 329.63, 392.0],  // C low tension
  bgm_zone3_storm: [164.81, 246.94, 329.63, 349.23, 415.3, 493.88],  // E urgent storm
  bgm_boss_sandworm: [110.0, 164.81, 220.0, 233.08, 277.18, 329.63], // A heavy war theme
  bgm_oasis_camp: [220.0, 329.63, 440.0, 493.88, 554.37, 659.25],    // A major warm bazaar
};

/**
 * Procedural Web Audio API SFX/BGM/Ambience Synthesizer (Zero external file fallback).
 * Supports standalone legacy methods AND 3-bus AudioManager routing for all 25 PRD specs.
 */
export class SoundSynth {
  private ctx: AudioContext | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private muted = false;
  private readonly playCounts: Record<SfxKey, number> = {
    lockOn: 0,
    steamVent: 0,
    turretCycle: 0,
    goldenParry: 0,
    shieldActivate: 0,
    relicExcavate: 0,
  };

  private readonly bgmBufferCache = new Map<BgmId, AudioBuffer>();
  private readonly ambBufferCache = new Map<AmbienceId, AudioBuffer>();

  public isMuted(): boolean {
    return this.muted;
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
  }

  public toggleMute(): boolean {
    this.muted = !this.muted;
    return this.muted;
  }

  public getPlayCounts(): Readonly<Record<SfxKey, number>> {
    return { ...this.playCounts };
  }

  public unlock(): void {
    const ctx = this.ensureContext();
    if (ctx && ctx.state === 'suspended') {
      void ctx.resume().catch(() => {});
    }
  }

  public ensureNoiseBuffer(ctx: AudioContext): AudioBuffer {
    if (this.noiseBuffer && this.ctx === ctx) return this.noiseBuffer;
    const sampleRate = ctx.sampleRate || 44100;
    const length = Math.floor(sampleRate * 0.6);
    const buf = ctx.createBuffer(1, length, sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    this.noiseBuffer = buf;
    return buf;
  }

  private ensureContext(): AudioContext | null {
    if (this.muted || typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtor) return null;
      try {
        this.ctx = new AudioCtor();
        this.ensureNoiseBuffer(this.ctx);
      } catch {
        this.ctx = null;
      }
    }
    return this.ctx;
  }

  /** Creates a cached seamless 4s desert scale loop buffer with 0.02s edge fades (zero click/pop). */
  public getProceduralBgmBuffer(id: BgmId, ctx: AudioContext): AudioBuffer {
    const existing = this.bgmBufferCache.get(id);
    if (existing) return existing;

    const sampleRate = ctx.sampleRate || 44100;
    const durSec = 4.0;
    const length = Math.floor(sampleRate * durSec);
    const buf = ctx.createBuffer(1, length, sampleRate);
    const out = buf.getChannelData(0);
    const notes = BGM_SCALES[id];
    const stepCount = 8;
    const stepSec = durSec / stepCount;
    const fadeSamples = Math.floor(sampleRate * 0.02);

    for (let i = 0; i < length; i++) {
      const t = i / sampleRate;
      const stepIdx = Math.min(stepCount - 1, Math.floor(t / stepSec));
      const localT = t - stepIdx * stepSec;
      const droneFreq = notes[0];
      const leadFreq = notes[1 + (stepIdx % (notes.length - 1))];
      const drone = Math.sin(2 * Math.PI * droneFreq * t) * 0.14;
      const env = Math.exp(-localT * 4.5);
      const pluck = Math.sin(2 * Math.PI * leadFreq * t) * 0.18 * env;
      let s = drone + pluck;
      if (i < fadeSamples) s *= i / fadeSamples;
      else if (i > length - fadeSamples) s *= (length - i) / fadeSamples;
      out[i] = s;
    }

    this.bgmBufferCache.set(id, buf);
    return buf;
  }

  /** Creates a cached seamless 3s ambient desert texture buffer with 0.02s edge fades. */
  public getProceduralAmbienceBuffer(id: AmbienceId, ctx: AudioContext): AudioBuffer {
    const existing = this.ambBufferCache.get(id);
    if (existing) return existing;

    const sampleRate = ctx.sampleRate || 44100;
    const durSec = 3.0;
    const length = Math.floor(sampleRate * durSec);
    const buf = ctx.createBuffer(1, length, sampleRate);
    const out = buf.getChannelData(0);
    const fadeSamples = Math.floor(sampleRate * 0.02);
    const alpha = id === 'amb_quicksand_rumble' ? 0.03 : id === 'amb_sandstorm_howl' ? 0.22 : 0.09;
    let lp = 0;

    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      lp += alpha * (white - lp);
      const t = i / sampleRate;
      const mod = 0.72 + 0.28 * Math.sin((2 * Math.PI * t) / durSec);
      let s = lp * mod * 0.45;
      if (i < fadeSamples) s *= i / fadeSamples;
      else if (i > length - fadeSamples) s *= (length - i) / fadeSamples;
      out[i] = s;
    }

    this.ambBufferCache.set(id, buf);
    return buf;
  }

  /**
   * Plays any of the 16 PRD Section 4.2 fallback SFX into `dest`, returning a stop handle for Voice Stealing.
   */
  public playFallbackSfx(
    id: SfxId,
    ctx: AudioContext,
    dest: AudioNode,
    opts?: { pitchMult?: number; gain?: number }
  ): ActiveSynthHandle {
    const pitch = opts?.pitchMult ?? 1.0;
    const gScale = opts?.gain ?? 1.0;
    const now = ctx.currentTime;
    const stopCallbacks: Array<() => void> = [];

    const addTone = (
      type: OscillatorType,
      fStart: number,
      fEnd: number | null,
      delaySec: number,
      durSec: number,
      amp: number
    ) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      const t0 = now + delaySec;
      osc.frequency.setValueAtTime(fStart * pitch, t0);
      if (fEnd !== null) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(20, fEnd * pitch), t0 + durSec);
      }
      gain.gain.setValueAtTime(Math.max(0.001, amp * gScale), t0);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + durSec);
      osc.connect(gain);
      gain.connect(dest);
      osc.start(t0);
      osc.stop(t0 + durSec + 0.01);
      stopCallbacks.push(() => {
        try {
          osc.stop();
          osc.disconnect();
          gain.disconnect();
        } catch {
          // already ended
        }
      });
    };

    const addNoise = (
      filterType: BiquadFilterType,
      freq: number,
      q: number,
      delaySec: number,
      durSec: number,
      amp: number
    ) => {
      const src = ctx.createBufferSource();
      src.buffer = this.ensureNoiseBuffer(ctx);
      src.playbackRate.setValueAtTime(pitch, now);
      const filter = ctx.createBiquadFilter();
      filter.type = filterType;
      filter.frequency.setValueAtTime(freq, now + delaySec);
      filter.Q.setValueAtTime(q, now + delaySec);
      const gain = ctx.createGain();
      const t0 = now + delaySec;
      gain.gain.setValueAtTime(Math.max(0.001, amp * gScale), t0);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + durSec);
      src.connect(filter);
      filter.connect(gain);
      gain.connect(dest);
      src.start(t0);
      src.stop(t0 + durSec + 0.01);
      stopCallbacks.push(() => {
        try {
          src.stop();
          src.disconnect();
          gain.disconnect();
        } catch {
          // already ended
        }
      });
    };

    let durationMs = 150;
    if (id === 'sfx_turret_harpoon') {
      durationMs = 180;
      addTone('sawtooth', 220, 90, 0, 0.16, 0.16);
      addNoise('bandpass', 1800, 1.2, 0, 0.1, 0.12);
    } else if (id === 'sfx_turret_laser') {
      durationMs = 85;
      addTone('sine', 920, 680, 0, 0.08, 0.12);
    } else if (id === 'sfx_turret_mortar') {
      durationMs = 340;
      addTone('sine', 110, 38, 0, 0.32, 0.24);
      addNoise('lowpass', 650, 0.8, 0.02, 0.28, 0.22);
    } else if (id === 'sfx_turret_switch') {
      durationMs = 130;
      addTone('triangle', 880, 440, 0, 0.12, 0.16);
    } else if (id === 'sfx_manual_lockon') {
      durationMs = 120;
      addTone('square', 1200, null, 0, 0.045, 0.11);
      addTone('square', 1200, null, 0.055, 0.05, 0.11);
    } else if (id === 'sfx_overheat_vent') {
      durationMs = 400;
      addNoise('bandpass', 1400, 1.8, 0, 0.4, 0.22);
    } else if (id === 'sfx_golden_counter') {
      durationMs = 300;
      addNoise('bandpass', 1100, 1.4, 0, 0.14, 0.16);
      addTone('sine', 587.33, null, 0, 0.26, 0.15);
      addTone('sine', 880, null, 0.05, 0.25, 0.15);
    } else if (id === 'sfx_solar_shield') {
      durationMs = 340;
      addTone('sine', 523.25, null, 0, 0.32, 0.13);
      addTone('sine', 659.25, null, 0, 0.32, 0.13);
    } else if (id === 'sfx_relic_collect') {
      durationMs = 230;
      addTone('sine', 1046.5, null, 0, 0.1, 0.14);
      addTone('sine', 1318.5, null, 0.08, 0.14, 0.15);
    } else if (id === 'sfx_enemy_hit_crit') {
      durationMs = 110;
      addTone('triangle', 320, 120, 0, 0.1, 0.15);
    } else if (id === 'sfx_boss_telegraph') {
      durationMs = 480;
      addTone('sawtooth', 75, 60, 0, 0.45, 0.18);
      addTone('sawtooth', 440, null, 0.04, 0.14, 0.13);
      addTone('sawtooth', 440, null, 0.24, 0.16, 0.14);
    } else if (id === 'sfx_sandworm_emerge') {
      durationMs = 520;
      addTone('sine', 65, 30, 0, 0.5, 0.26);
      addNoise('lowpass', 480, 1.0, 0, 0.48, 0.24);
    } else if (id === 'sfx_event_popup') {
      durationMs = 280;
      addTone('sine', 587.33, null, 0, 0.1, 0.12);
      addTone('sine', 698.46, null, 0.07, 0.1, 0.12);
      addTone('sine', 880.0, null, 0.14, 0.13, 0.14);
    } else if (id === 'sfx_trade_coins') {
      durationMs = 260;
      addTone('sine', 1567.98, null, 0, 0.09, 0.14);
      addTone('sine', 2093.0, null, 0.08, 0.16, 0.15);
    } else if (id === 'sfx_upgrade_mech') {
      durationMs = 300;
      addTone('triangle', 523.25, null, 0, 0.09, 0.14);
      addTone('triangle', 659.25, null, 0.08, 0.09, 0.14);
      addTone('triangle', 783.99, null, 0.16, 0.13, 0.16);
    } else if (id === 'sfx_jafar_mirage') {
      durationMs = 360;
      addTone('sine', 783.99, null, 0, 0.3, 0.13);
      addTone('sine', 1174.66, null, 0.06, 0.28, 0.13);
    }

    return {
      durationMs,
      stop: () => {
        for (let i = 0; i < stopCallbacks.length; i++) {
          stopCallbacks[i]();
        }
      },
    };
  }

  public playLockOn(): void {
    this.playCounts.lockOn += 1;
    const ctx = this.ensureContext();
    if (!ctx) return;
    this.playFallbackSfx('sfx_manual_lockon', ctx, ctx.destination);
  }

  public playSteamVent(): void {
    this.playCounts.steamVent += 1;
    const ctx = this.ensureContext();
    if (!ctx) return;
    this.playFallbackSfx('sfx_overheat_vent', ctx, ctx.destination);
  }

  public playTurretCycle(): void {
    this.playCounts.turretCycle += 1;
    const ctx = this.ensureContext();
    if (!ctx) return;
    this.playFallbackSfx('sfx_turret_switch', ctx, ctx.destination);
  }

  public playGoldenParry(): void {
    this.playCounts.goldenParry += 1;
    const ctx = this.ensureContext();
    if (!ctx) return;
    this.playFallbackSfx('sfx_golden_counter', ctx, ctx.destination);
  }

  public playShieldActivate(): void {
    this.playCounts.shieldActivate += 1;
    const ctx = this.ensureContext();
    if (!ctx) return;
    this.playFallbackSfx('sfx_solar_shield', ctx, ctx.destination);
  }

  public playRelicExcavate(): void {
    this.playCounts.relicExcavate += 1;
    const ctx = this.ensureContext();
    if (!ctx) return;
    this.playFallbackSfx('sfx_relic_collect', ctx, ctx.destination);
  }

  public destroy(): void {
    this.bgmBufferCache.clear();
    this.ambBufferCache.clear();
    if (this.ctx) {
      void this.ctx.close().catch(() => {});
      this.ctx = null;
    }
    this.noiseBuffer = null;
  }
}
