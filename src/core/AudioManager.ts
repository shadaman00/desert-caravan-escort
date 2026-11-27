import {
  AUDIO_BUS_DEFAULTS,
  AUDIO_MANIFEST,
  AUDIO_MANIFEST_BY_ID,
  BGM_CROSSFADE_DEFAULT_SEC,
  BGM_DUCK_ATTACK_SEC,
  BGM_DUCK_FACTOR,
  BGM_DUCK_RELEASE_SEC,
  DEFAULT_AUDIO_SETTINGS,
  SFX_PITCH_JITTER_RANGE,
  SFX_VOICE_CAP,
  type AmbienceId,
  type AudioAssetId,
  type AudioBusType,
  type AudioSettingsState,
  type BgmId,
  type IAudioManager,
  type SfxId,
  type SfxPriority,
} from '@/data/audioManifest';
import { SoundSynth, type SfxKey } from './SoundSynth';

export function computeEqualPowerGains(
  progress01: number,
  baseGain: number
): { outGain: number; inGain: number } {
  const p = Math.min(1, Math.max(0, Number.isFinite(progress01) ? progress01 : 0));
  const safeBase = Math.max(0, baseGain);
  return {
    outGain: safeBase * Math.cos(p * Math.PI * 0.5),
    inGain: safeBase * Math.sin(p * Math.PI * 0.5),
  };
}

export function computeDuckedGain(baseGain: number, duckActive: boolean): number {
  return duckActive ? Math.max(0, baseGain) * BGM_DUCK_FACTOR : Math.max(0, baseGain);
}

interface ActiveLoopChannel {
  id: AudioAssetId;
  source: AudioBufferSourceNode;
  gainNode: GainNode;
}

interface ActiveSfxVoice {
  id: SfxId;
  priority: SfxPriority;
  startedAtMs: number;
  expiresAtMs: number;
  stop: () => void;
}

export interface AudioDebugSnapshot {
  unlocked: boolean;
  suspendedByVisibility: boolean;
  activeBgm: BgmId | null;
  ambienceLevels: Record<AmbienceId, number>;
  duckingActive: boolean;
  activeSfxVoices: number;
  throttledCount: number;
  stolenVoiceCount: number;
  droppedVoiceCount: number;
  legacyPlayCounts: Readonly<Record<SfxKey, number>>;
  sfxPlayCounts: Readonly<Record<SfxId, number>>;
  settings: AudioSettingsState;
}

const SFX_TO_LEGACY_KEY: Partial<Record<SfxId, SfxKey>> = {
  sfx_manual_lockon: 'lockOn',
  sfx_overheat_vent: 'steamVent',
  sfx_turret_switch: 'turretCycle',
  sfx_golden_counter: 'goldenParry',
  sfx_solar_shield: 'shieldActivate',
  sfx_relic_collect: 'relicExcavate',
};

/**
 * 3-Bus Hybrid Audio Manager (BGM / Ambience / SFX + Compressor Limiter)
 * implementing Equal-Power crossfade, dynamic ducking, 6-channel Voice Cap,
 * 60ms throttling, ±4% pitch jitter, zero-404 manifest probing, and SoundSynth fallback.
 */
export class AudioManager implements IAudioManager {
  private readonly synth = new SoundSynth();
  private ctx: AudioContext | null = null;
  private bgmBusGain: GainNode | null = null;
  private bgmDuckGain: GainNode | null = null;
  private ambienceBusGain: GainNode | null = null;
  private sfxBusGain: GainNode | null = null;
  private masterGain: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;

  private settings: AudioSettingsState = { ...DEFAULT_AUDIO_SETTINGS };
  private availablePaths: Set<string> | null = null;
  private readonly bufferCache = new Map<AudioAssetId, AudioBuffer>();

  private unlocked = false;
  private suspendedByVisibility = false;
  private duckingActive = false;
  private activeBgm: BgmId | null = null;
  private bgmChannels: ActiveLoopChannel[] = [];
  private crossfadeStopTimer: ReturnType<typeof setTimeout> | null = null;

  private readonly ambienceLevels: Record<AmbienceId, number> = {
    amb_desert_wind: 0,
    amb_quicksand_rumble: 0,
    amb_sandstorm_howl: 0,
  };
  private readonly ambienceChannels = new Map<AmbienceId, ActiveLoopChannel>();

  private activeSfxVoices: ActiveSfxVoice[] = [];
  private readonly lastSfxTimeMs = new Map<SfxId, number>();
  private readonly sfxPlayCounts: Record<SfxId, number> = {
    sfx_turret_harpoon: 0,
    sfx_turret_laser: 0,
    sfx_turret_mortar: 0,
    sfx_turret_switch: 0,
    sfx_manual_lockon: 0,
    sfx_overheat_vent: 0,
    sfx_golden_counter: 0,
    sfx_solar_shield: 0,
    sfx_relic_collect: 0,
    sfx_enemy_hit_crit: 0,
    sfx_boss_telegraph: 0,
    sfx_sandworm_emerge: 0,
    sfx_event_popup: 0,
    sfx_trade_coins: 0,
    sfx_upgrade_mech: 0,
    sfx_jafar_mirage: 0,
  };
  private readonly legacyPlayCounts: Record<SfxKey, number> = {
    lockOn: 0,
    steamVent: 0,
    turretCycle: 0,
    goldenParry: 0,
    shieldActivate: 0,
    relicExcavate: 0,
  };

  private throttledCount = 0;
  private stolenVoiceCount = 0;
  private droppedVoiceCount = 0;
  private clockNowMs: () => number;

  constructor(nowProvider?: () => number) {
    this.clockNowMs = nowProvider ?? (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()));
  }

  private ensureGraph(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtor) return null;
      try {
        const ctx = new AudioCtor();
        this.ctx = ctx;
        this.bgmBusGain = ctx.createGain();
        this.bgmDuckGain = ctx.createGain();
        this.ambienceBusGain = ctx.createGain();
        this.sfxBusGain = ctx.createGain();
        this.masterGain = ctx.createGain();
        this.compressor = ctx.createDynamicsCompressor();

        this.compressor.threshold.setValueAtTime(-12, ctx.currentTime);
        this.compressor.knee.setValueAtTime(12, ctx.currentTime);
        this.compressor.ratio.setValueAtTime(12, ctx.currentTime);
        this.compressor.attack.setValueAtTime(0.003, ctx.currentTime);
        this.compressor.release.setValueAtTime(0.15, ctx.currentTime);

        this.bgmBusGain.connect(this.bgmDuckGain);
        this.bgmDuckGain.connect(this.masterGain);
        this.ambienceBusGain.connect(this.masterGain);
        this.sfxBusGain.connect(this.masterGain);
        this.masterGain.connect(this.compressor);
        this.compressor.connect(ctx.destination);

        this.syncBusGainsImmediate();
      } catch {
        this.ctx = null;
      }
    }
    return this.ctx;
  }

  private syncBusGainsImmediate(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    const bgmVal = this.settings.bgmMuted ? 0 : this.settings.bgmVolume;
    const ambVal = this.settings.sfxMuted
      ? 0
      : (this.settings.sfxVolume / AUDIO_BUS_DEFAULTS.SFX) * AUDIO_BUS_DEFAULTS.AMBIENCE;
    const sfxVal = this.settings.sfxMuted ? 0 : this.settings.sfxVolume;

    this.bgmBusGain?.gain.setValueAtTime(bgmVal, now);
    this.bgmDuckGain?.gain.setValueAtTime(this.duckingActive ? BGM_DUCK_FACTOR : 1.0, now);
    this.ambienceBusGain?.gain.setValueAtTime(ambVal, now);
    this.sfxBusGain?.gain.setValueAtTime(sfxVal, now);
    this.masterGain?.gain.setValueAtTime(1.0, now);
  }

  public async unlockOnUserGesture(): Promise<void> {
    const ctx = this.ensureGraph();
    this.unlocked = true;
    if (!ctx) return;
    if (ctx.state === 'suspended' && !this.suspendedByVisibility) {
      try {
        await ctx.resume();
      } catch {
        // ignore headless gesture warnings
      }
    }
    try {
      const silent = ctx.createBuffer(1, 1, ctx.sampleRate || 44100);
      const src = ctx.createBufferSource();
      src.buffer = silent;
      src.connect(ctx.destination);
      src.start(0);
    } catch {
      // ignore if restricted
    }
  }

  public handleVisibilityChange(hidden: boolean): void {
    this.suspendedByVisibility = hidden;
    const ctx = this.ctx;
    if (!ctx) return;
    if (hidden) {
      if (ctx.state === 'running') {
        void ctx.suspend().catch(() => {});
      }
    } else if (this.unlocked && ctx.state === 'suspended') {
      void ctx.resume().catch(() => {});
    }
  }

  public async preloadCategory(bus: AudioBusType): Promise<void> {
    if (this.availablePaths === null) {
      this.availablePaths = await this.probeAudioManifest();
    }
    const ctx = this.ensureGraph();
    if (!ctx) return;

    const entries = AUDIO_MANIFEST.filter(
      (e) => e.bus === bus && this.availablePaths!.has(e.path) && !this.bufferCache.has(e.id)
    );
    if (entries.length === 0) return;

    const baseUrl =
      typeof import.meta !== 'undefined' &&
      (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL
        ? (import.meta as unknown as { env: { BASE_URL: string } }).env.BASE_URL
        : './';
    const cleanBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;

    await Promise.all(
      entries.map(async (entry) => {
        try {
          const res = await fetch(`${cleanBase}${entry.path}`);
          if (!res.ok) return;
          const arr = await res.arrayBuffer();
          const decoded = await ctx.decodeAudioData(arr);
          this.bufferCache.set(entry.id, decoded);
        } catch {
          // Non-blocking fallback to SoundSynth
        }
      })
    );
  }

  private async probeAudioManifest(): Promise<Set<string>> {
    if (typeof fetch !== 'function') return new Set<string>();
    const baseUrl =
      typeof import.meta !== 'undefined' &&
      (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL
        ? (import.meta as unknown as { env: { BASE_URL: string } }).env.BASE_URL
        : './';
    const cleanBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
    try {
      const res = await fetch(`${cleanBase}assets/audio/manifest.json`);
      if (!res.ok) return new Set<string>();
      const json = (await res.json()) as { available?: unknown };
      if (!Array.isArray(json.available)) return new Set<string>();
      return new Set(json.available.filter((p): p is string => typeof p === 'string'));
    } catch {
      return new Set<string>();
    }
  }

  public playBgm(id: BgmId, crossfadeSec = BGM_CROSSFADE_DEFAULT_SEC): void {
    if (this.activeBgm === id) return;
    this.activeBgm = id;

    const ctx = this.ensureGraph();
    if (!ctx || !this.bgmBusGain) return;

    const fadeDur = Math.max(0.05, crossfadeSec);
    const now = ctx.currentTime;
    const buffer =
      this.bufferCache.get(id) ?? this.synth.getProceduralBgmBuffer(id, ctx);

    // Stop excess older channels keeping max 1 outgoing during crossfade
    while (this.bgmChannels.length > 1) {
      const oldest = this.bgmChannels.shift();
      try {
        oldest?.source.stop();
        oldest?.source.disconnect();
        oldest?.gainNode.disconnect();
      } catch {
        // already stopped
      }
    }

    const outgoing = this.bgmChannels[0] ?? null;
    if (outgoing) {
      const curveSteps = 8;
      const outCurve = new Float32Array(curveSteps);
      for (let i = 0; i < curveSteps; i++) {
        const p = i / (curveSteps - 1);
        outCurve[i] = computeEqualPowerGains(p, 1.0).outGain;
      }
      outgoing.gainNode.gain.cancelScheduledValues(now);
      try {
        outgoing.gainNode.gain.setValueCurveAtTime(outCurve, now, fadeDur);
      } catch {
        outgoing.gainNode.gain.setValueAtTime(1.0, now);
        outgoing.gainNode.gain.linearRampToValueAtTime(0, now + fadeDur);
      }
      if (this.crossfadeStopTimer !== null) {
        clearTimeout(this.crossfadeStopTimer);
      }
      this.crossfadeStopTimer = setTimeout(() => {
        try {
          outgoing.source.stop();
          outgoing.source.disconnect();
          outgoing.gainNode.disconnect();
        } catch {
          // already stopped
        }
        const idx = this.bgmChannels.indexOf(outgoing);
        if (idx >= 0) this.bgmChannels.splice(idx, 1);
        this.crossfadeStopTimer = null;
      }, Math.ceil(fadeDur * 1000) + 40);
    }

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const gainNode = ctx.createGain();
    if (outgoing) {
      const curveSteps = 8;
      const inCurve = new Float32Array(curveSteps);
      for (let i = 0; i < curveSteps; i++) {
        const p = i / (curveSteps - 1);
        inCurve[i] = computeEqualPowerGains(p, 1.0).inGain;
      }
      try {
        gainNode.gain.setValueCurveAtTime(inCurve, now, fadeDur);
      } catch {
        gainNode.gain.setValueAtTime(0.01, now);
        gainNode.gain.linearRampToValueAtTime(1.0, now + fadeDur);
      }
    } else {
      gainNode.gain.setValueAtTime(1.0, now);
    }
    src.connect(gainNode);
    gainNode.connect(this.bgmBusGain);
    src.start(now);

    this.bgmChannels.push({ id, source: src, gainNode });
  }

  public setAmbience(id: AmbienceId, intensity: number): void {
    const clamped = Math.min(1, Math.max(0, Number.isFinite(intensity) ? intensity : 0));
    this.ambienceLevels[id] = Math.round(clamped * 1000) / 1000;

    const ctx = this.ensureGraph();
    if (!ctx || !this.ambienceBusGain) return;
    const now = ctx.currentTime;
    const existing = this.ambienceChannels.get(id);

    if (clamped <= 0.01) {
      if (existing) {
        try {
          existing.gainNode.gain.setTargetAtTime(0.0001, now, 0.08);
          existing.source.stop(now + 0.25);
        } catch {
          // already stopped
        }
        this.ambienceChannels.delete(id);
      }
      return;
    }

    if (existing) {
      existing.gainNode.gain.setTargetAtTime(clamped, now, 0.12);
      return;
    }

    // Respect max 2 active ambience layers
    if (this.ambienceChannels.size >= 2) {
      const firstKey = this.ambienceChannels.keys().next().value as AmbienceId | undefined;
      if (firstKey && firstKey !== id) {
        const drop = this.ambienceChannels.get(firstKey);
        try {
          drop?.source.stop();
          drop?.source.disconnect();
          drop?.gainNode.disconnect();
        } catch {
          // ignore
        }
        this.ambienceChannels.delete(firstKey);
        this.ambienceLevels[firstKey] = 0;
      }
    }

    const buffer =
      this.bufferCache.get(id) ?? this.synth.getProceduralAmbienceBuffer(id, ctx);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const gainNode = ctx.createGain();
    gainNode.gain.setValueAtTime(clamped, now);
    src.connect(gainNode);
    gainNode.connect(this.ambienceBusGain);
    src.start(now);

    this.ambienceChannels.set(id, { id, source: src, gainNode });
  }

  public pruneExpiredVoices(nowMs = this.clockNowMs()): void {
    if (this.activeSfxVoices.length === 0) return;
    this.activeSfxVoices = this.activeSfxVoices.filter((v) => v.expiresAtMs > nowMs);
  }

  public playSfx(
    id: SfxId,
    options?: { pitchJitter?: number; gain?: number }
  ): void {
    const nowMs = this.clockNowMs();
    const entry = AUDIO_MANIFEST_BY_ID[id];
    const lastMs = this.lastSfxTimeMs.get(id);
    if (lastMs !== undefined && nowMs - lastMs < entry.throttleMs) {
      this.throttledCount += 1;
      return;
    }

    this.pruneExpiredVoices(nowMs);

    // 6-Channel Voice Cap & Priority Voice Stealing
    if (this.activeSfxVoices.length >= SFX_VOICE_CAP) {
      if (entry.priority === 'HIGH') {
        let stealIdx = this.activeSfxVoices.findIndex((v) => v.priority === 'NORMAL');
        if (stealIdx < 0) stealIdx = 0;
        const stolen = this.activeSfxVoices.splice(stealIdx, 1)[0];
        stolen?.stop();
        this.stolenVoiceCount += 1;
      } else {
        this.droppedVoiceCount += 1;
        return;
      }
    }

    this.lastSfxTimeMs.set(id, nowMs);
    this.sfxPlayCounts[id] += 1;
    const legacyKey = SFX_TO_LEGACY_KEY[id];
    if (legacyKey) {
      this.legacyPlayCounts[legacyKey] += 1;
    }

    const jitterAmp = options?.pitchJitter ?? SFX_PITCH_JITTER_RANGE;
    const pitchMult = 1 + (Math.random() * 2 - 1) * jitterAmp;
    const gainScale = (options?.gain ?? 1.0) * entry.defaultGain;

    let durationMs = 180;
    let stopFn = () => {};

    const ctx = !this.settings.sfxMuted ? this.ensureGraph() : null;
    if (ctx && this.sfxBusGain) {
      const cachedBuf = this.bufferCache.get(id);
      if (cachedBuf) {
        const src = ctx.createBufferSource();
        src.buffer = cachedBuf;
        src.playbackRate.setValueAtTime(pitchMult, ctx.currentTime);
        const gNode = ctx.createGain();
        gNode.gain.setValueAtTime(gainScale, ctx.currentTime);
        src.connect(gNode);
        gNode.connect(this.sfxBusGain);
        src.start(ctx.currentTime);
        durationMs = Math.max(60, Math.round(cachedBuf.duration * 1000));
        stopFn = () => {
          try {
            src.stop();
            src.disconnect();
            gNode.disconnect();
          } catch {
            // already ended
          }
        };
      } else {
        const handle = this.synth.playFallbackSfx(id, ctx, this.sfxBusGain, {
          pitchMult,
          gain: gainScale,
        });
        durationMs = handle.durationMs;
        stopFn = handle.stop;
      }
    }

    this.activeSfxVoices.push({
      id,
      priority: entry.priority,
      startedAtMs: nowMs,
      expiresAtMs: nowMs + durationMs,
      stop: stopFn,
    });
  }

  public setDucking(active: boolean, durationSec?: number): void {
    if (this.duckingActive === active && durationSec === undefined) return;
    this.duckingActive = active;
    const ctx = this.ctx;
    if (!ctx || !this.bgmDuckGain) return;
    const now = ctx.currentTime;
    const target = active ? BGM_DUCK_FACTOR : 1.0;
    const ramp = durationSec ?? (active ? BGM_DUCK_ATTACK_SEC : BGM_DUCK_RELEASE_SEC);
    this.bgmDuckGain.gain.cancelScheduledValues(now);
    this.bgmDuckGain.gain.setTargetAtTime(target, now, Math.max(0.05, ramp * 0.45));
  }

  public applySettings(settings: AudioSettingsState): void {
    this.settings = {
      bgmMuted: Boolean(settings.bgmMuted),
      sfxMuted: Boolean(settings.sfxMuted),
      bgmVolume: Math.min(1, Math.max(0, settings.bgmVolume)),
      sfxVolume: Math.min(1, Math.max(0, settings.sfxVolume)),
    };
    this.synth.setMuted(this.settings.sfxMuted);
    this.syncBusGainsImmediate();
  }

  public getDebugSnapshot(): AudioDebugSnapshot {
    this.pruneExpiredVoices();
    return {
      unlocked: this.unlocked,
      suspendedByVisibility: this.suspendedByVisibility,
      activeBgm: this.activeBgm,
      ambienceLevels: { ...this.ambienceLevels },
      duckingActive: this.duckingActive,
      activeSfxVoices: this.activeSfxVoices.length,
      throttledCount: this.throttledCount,
      stolenVoiceCount: this.stolenVoiceCount,
      droppedVoiceCount: this.droppedVoiceCount,
      legacyPlayCounts: { ...this.legacyPlayCounts },
      sfxPlayCounts: { ...this.sfxPlayCounts },
      settings: { ...this.settings },
    };
  }

  public destroy(): void {
    if (this.crossfadeStopTimer !== null) {
      clearTimeout(this.crossfadeStopTimer);
      this.crossfadeStopTimer = null;
    }
    for (let i = 0; i < this.bgmChannels.length; i++) {
      try {
        this.bgmChannels[i].source.stop();
      } catch {
        // ignore
      }
    }
    this.bgmChannels = [];
    for (const ch of this.ambienceChannels.values()) {
      try {
        ch.source.stop();
      } catch {
        // ignore
      }
    }
    this.ambienceChannels.clear();
    for (let i = 0; i < this.activeSfxVoices.length; i++) {
      this.activeSfxVoices[i].stop();
    }
    this.activeSfxVoices = [];
    this.bufferCache.clear();
    this.synth.destroy();
    if (this.ctx) {
      void this.ctx.close().catch(() => {});
      this.ctx = null;
    }
  }
}
