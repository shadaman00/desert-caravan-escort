import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  AUDIO_BUS_DEFAULTS,
  AUDIO_MANIFEST,
  BGM_DUCK_FACTOR,
  DEFAULT_AUDIO_SETTINGS,
  SFX_VOICE_CAP,
} from '@/data/audioManifest';
import {
  AudioManager,
  computeDuckedGain,
  computeEqualPowerGains,
} from '@/core/AudioManager';
import {
  SAVE_STORAGE_KEY_V2,
  createInitialSaveStateV2,
  gameStore,
  loadSaveStateV2,
  persistSaveStateV2,
} from '@/data/saveStore';

class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  public get length(): number {
    return this.map.size;
  }
  public clear(): void {
    this.map.clear();
  }
  public getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  public key(index: number): string | null {
    return Array.from(this.map.keys())[index] ?? null;
  }
  public removeItem(key: string): void {
    this.map.delete(key);
  }
  public setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
}

describe('Audio System Add-On (v1.0): 25 Assets, 3-Bus Mix, Crossfade, Ducking, Voice Cap & Persistence', () => {
  beforeEach(() => {
    gameStore.getState().resetAll();
  });

  it('defines all 25 audio entries (6 BGM, 3 Ambience, 16 SFX) and PRD bus gain defaults', () => {
    expect(AUDIO_MANIFEST.length).toBe(25);
    expect(AUDIO_MANIFEST.filter((e) => e.bus === 'BGM').length).toBe(6);
    expect(AUDIO_MANIFEST.filter((e) => e.bus === 'AMBIENCE').length).toBe(3);
    expect(AUDIO_MANIFEST.filter((e) => e.bus === 'SFX').length).toBe(16);

    expect(AUDIO_BUS_DEFAULTS.BGM).toBe(0.55);
    expect(AUDIO_BUS_DEFAULTS.AMBIENCE).toBe(0.35);
    expect(AUDIO_BUS_DEFAULTS.SFX).toBe(0.9);
  });

  it('computes Equal-Power crossfade invariant and 35% BGM ducking accurately', () => {
    for (const p of [0, 0.25, 0.5, 0.75, 1.0]) {
      const { outGain, inGain } = computeEqualPowerGains(p, AUDIO_BUS_DEFAULTS.BGM);
      const powerSum = outGain * outGain + inGain * inGain;
      expect(powerSum).toBeCloseTo(AUDIO_BUS_DEFAULTS.BGM * AUDIO_BUS_DEFAULTS.BGM, 5);
    }

    expect(computeDuckedGain(AUDIO_BUS_DEFAULTS.BGM, true)).toBeCloseTo(
      AUDIO_BUS_DEFAULTS.BGM * BGM_DUCK_FACTOR,
      5
    );
    expect(computeDuckedGain(AUDIO_BUS_DEFAULTS.BGM, false)).toBeCloseTo(AUDIO_BUS_DEFAULTS.BGM, 5);
  });

  it('enforces 60ms duplicate SFX throttling and 6-channel Voice Cap with priority Voice Stealing', () => {
    let clock = 1000;
    const mgr = new AudioManager(() => clock);

    // Same SFX within 60ms is throttled
    mgr.playSfx('sfx_turret_laser');
    mgr.playSfx('sfx_turret_laser');
    let snap = mgr.getDebugSnapshot();
    expect(snap.sfxPlayCounts.sfx_turret_laser).toBe(1);
    expect(snap.throttledCount).toBe(1);

    // Fill remaining 5 slots with NORMAL voices (total = 6 active voices)
    clock += 70;
    mgr.playSfx('sfx_turret_harpoon');
    mgr.playSfx('sfx_turret_mortar');
    mgr.playSfx('sfx_enemy_hit_crit');
    clock += 70;
    mgr.playSfx('sfx_turret_laser');
    mgr.playSfx('sfx_enemy_hit_crit');

    snap = mgr.getDebugSnapshot();
    expect(snap.activeSfxVoices).toBe(SFX_VOICE_CAP);

    // Request HIGH priority SFX while at cap -> steals a NORMAL slot instead of dropping
    mgr.playSfx('sfx_golden_counter');
    snap = mgr.getDebugSnapshot();
    expect(snap.activeSfxVoices).toBe(SFX_VOICE_CAP);
    expect(snap.stolenVoiceCount).toBe(1);
    expect(snap.sfxPlayCounts.sfx_golden_counter).toBe(1);

    // Request NORMAL priority SFX while at cap -> dropped cleanly
    clock += 70;
    mgr.playSfx('sfx_enemy_hit_crit');
    snap = mgr.getDebugSnapshot();
    expect(snap.droppedVoiceCount).toBe(1);

    mgr.destroy();
  });

  it('tracks BGM, Ambience, Ducking, and visibility suspend/resume state cleanly', () => {
    const mgr = new AudioManager(() => 5000);
    mgr.playBgm('bgm_title_opening');
    mgr.setAmbience('amb_quicksand_rumble', 0.85);
    mgr.setDucking(true);
    mgr.handleVisibilityChange(true);

    let snap = mgr.getDebugSnapshot();
    expect(snap.activeBgm).toBe('bgm_title_opening');
    expect(snap.ambienceLevels.amb_quicksand_rumble).toBe(0.85);
    expect(snap.duckingActive).toBe(true);
    expect(snap.suspendedByVisibility).toBe(true);

    mgr.handleVisibilityChange(false);
    mgr.setDucking(false);
    snap = mgr.getDebugSnapshot();
    expect(snap.suspendedByVisibility).toBe(false);
    expect(snap.duckingActive).toBe(false);
    mgr.destroy();
  });

  it('persists audioSettings in sandwalker_save_v2 across reload and enforces SRP in systems/', () => {
    const storage = new MemoryStorage();
    const initial = createInitialSaveStateV2(1000);
    expect(initial.audioSettings).toEqual(DEFAULT_AUDIO_SETTINGS);

    const updated = gameStore.getState().setAudioSettings({
      bgmMuted: true,
      sfxMuted: false,
      bgmVolume: 0.25,
      sfxVolume: 0.75,
    });
    expect(updated.bgmMuted).toBe(true);
    persistSaveStateV2(gameStore.getState(), storage);

    const raw = JSON.parse(storage.getItem(SAVE_STORAGE_KEY_V2)!);
    expect(raw.audioSettings.bgmMuted).toBe(true);
    expect(raw.audioSettings.bgmVolume).toBe(0.25);

    const reloaded = loadSaveStateV2(storage);
    expect(reloaded.state.audioSettings).toEqual({
      bgmMuted: true,
      sfxMuted: false,
      bgmVolume: 0.25,
      sfxVolume: 0.75,
    });

    for (const rel of ['src/systems/CombatSystem.ts', 'src/systems/BiomeSystem.ts']) {
      const src = readFileSync(resolve(process.cwd(), rel), 'utf8');
      expect(src).not.toMatch(/AudioContext|CanvasRenderingContext2D|document\.|window\./);
    }
  });
});
