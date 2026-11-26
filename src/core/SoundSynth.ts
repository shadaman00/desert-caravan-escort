export type SfxKey =
  | 'lockOn'
  | 'steamVent'
  | 'turretCycle'
  | 'goldenParry'
  | 'shieldActivate'
  | 'relicExcavate';

/**
 * Procedural Web Audio API SFX Synthesizer implementing all 6 PRD Section 6.2 effects.
 * Zero external audio assets; safe no-op in headless/Node environments.
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

  private ensureContext(): AudioContext | null {
    if (this.muted || typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtor) return null;
      try {
        this.ctx = new AudioCtor();
        const sampleRate = this.ctx.sampleRate || 44100;
        const length = Math.floor(sampleRate * 0.45);
        const buf = this.ctx.createBuffer(1, length, sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < length; i++) {
          data[i] = Math.random() * 2 - 1;
        }
        this.noiseBuffer = buf;
      } catch {
        this.ctx = null;
      }
    }
    return this.ctx;
  }

  /** Lock-On Beep (1200Hz, 60ms) */
  public playLockOn(): void {
    this.playCounts.lockOn += 1;
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1200, now);
    gain.gain.setValueAtTime(0.14, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.065);
  }

  /** Bandpass-filtered noise Steam Vent (400ms) */
  public playSteamVent(): void {
    this.playCounts.steamVent += 1;
    const ctx = this.ensureContext();
    if (!ctx || !this.noiseBuffer) return;
    const now = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1400, now);
    filter.Q.setValueAtTime(1.8, now);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.22, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    src.start(now);
    src.stop(now + 0.4);
  }

  /** Metallic Turret Cycle Sweep (880Hz -> 440Hz, 120ms) */
  public playTurretCycle(): void {
    this.playCounts.turretCycle += 1;
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.exponentialRampToValueAtTime(440, now + 0.12);
    gain.gain.setValueAtTime(0.16, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.125);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.13);
  }

  /** Golden Parry: Low Thruster + Resonant Chime (260ms) */
  public playGoldenParry(): void {
    this.playCounts.goldenParry += 1;
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const thruster = ctx.createOscillator();
    const tGain = ctx.createGain();
    thruster.type = 'sawtooth';
    thruster.frequency.setValueAtTime(140, now);
    thruster.frequency.exponentialRampToValueAtTime(70, now + 0.18);
    tGain.gain.setValueAtTime(0.18, now);
    tGain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    thruster.connect(tGain);
    tGain.connect(ctx.destination);
    thruster.start(now);
    thruster.stop(now + 0.21);

    const chime = ctx.createOscillator();
    const cGain = ctx.createGain();
    chime.type = 'sine';
    chime.frequency.setValueAtTime(880, now);
    chime.frequency.setValueAtTime(1320, now + 0.08);
    cGain.gain.setValueAtTime(0.14, now);
    cGain.gain.exponentialRampToValueAtTime(0.001, now + 0.26);
    chime.connect(cGain);
    cGain.connect(ctx.destination);
    chime.start(now);
    chime.stop(now + 0.27);
  }

  /** Solar Shield Activation Chord (523Hz + 659Hz, 320ms) */
  public playShieldActivate(): void {
    this.playCounts.shieldActivate += 1;
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const freqs = [523, 659];
    for (let i = 0; i < freqs.length; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freqs[i], now);
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.33);
    }
  }

  /** Clear Relic Excavation Chime (1046Hz -> 1318Hz, 220ms) */
  public playRelicExcavate(): void {
    this.playCounts.relicExcavate += 1;
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1046, now);
    osc.frequency.setValueAtTime(1318, now + 0.08);
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.23);
  }

  public destroy(): void {
    if (this.ctx) {
      void this.ctx.close().catch(() => {});
      this.ctx = null;
    }
    this.noiseBuffer = null;
  }
}
