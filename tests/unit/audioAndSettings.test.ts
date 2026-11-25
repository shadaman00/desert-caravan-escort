import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BgmEngine, resolveBgmThemeForState } from '@/engine/audio/BgmEngine';
import { SoundEngine, type MinimalAudioContext } from '@/engine/audio/SoundEngine';
import {
  DEFAULT_USER_SETTINGS,
  loadUserSettings,
  normalizeUserSettings,
  saveUserSettings,
} from '@/game/settings';
import { isHapticsEnabled, setHapticsEnabled, triggerHaptic } from '@/game/haptics';
import {
  CARAVAN_PALETTE_ROYAL_SILK,
  SANDWALKER_PALETTE_ROYAL_SILK,
} from '@/engine/render/pixel/palettes';
import { useGameStore } from '@/store/gameStore';

function createMockCtx(): { ctx: MinimalAudioContext; oscCount: () => number } {
  let count = 0;
  const ctx: MinimalAudioContext = {
    currentTime: 0,
    state: 'running',
    sampleRate: 22050,
    destination: {},
    resume: async () => undefined,
    createOscillator: () => {
      count += 1;
      return {
        type: 'sine',
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
    createBuffer: (_c, len) => ({
      getChannelData: () => new Float32Array(len),
    }),
    createBufferSource: () => ({
      buffer: null,
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    }),
  };
  return { ctx, oscCount: () => count };
}

describe('Phase 5: Adaptive BGM, Expanded SFX, Settings UX & Royal Silk Skin', () => {
  beforeEach(() => {
    useGameStore.getState().resetToDefaults();
    setHapticsEnabled(true);
  });

  it('plays all 4 new SFX kinds and respects master/sfx volume gating', () => {
    const mock = createMockCtx();
    const sfx = new SoundEngine({ audioContextFactory: () => mock.ctx, initialMuted: false });

    expect(sfx.play('TIER_UP_FANFARE', 100)).toBe(true);
    expect(sfx.play('LOOT_PICKUP', 200)).toBe(true);
    expect(sfx.play('QUEST_COMPLETE', 300)).toBe(true);
    expect(sfx.play('LEGENDARY_RELIC', 400)).toBe(true);
    expect(mock.oscCount()).toBe(9);

    sfx.setMasterVolume(0);
    expect(sfx.play('LOOT_PICKUP', 500)).toBe(false);
    sfx.setMasterVolume(0.75);
    sfx.setSfxVolume(0.4);
    expect(sfx.getMasterVolume()).toBe(0.75);
    expect(sfx.getSfxVolume()).toBe(0.4);
    expect(sfx.play('LOOT_PICKUP', 600)).toBe(true);
  });

  it('resolves BgmEngine themes, schedules procedural notes cleanly, and gates by mute/volume', () => {
    expect(resolveBgmThemeForState('OASIS_HUB')).toBe('OASIS_HUB');
    expect(resolveBgmThemeForState('OASIS_SETTLEMENT')).toBe('OASIS_HUB');
    expect(resolveBgmThemeForState('MARCH_NORMAL')).toBe('MARCH_NORMAL');
    expect(resolveBgmThemeForState('HAZARD_ZONE')).toBe('HAZARD_ZONE');
    expect(resolveBgmThemeForState('BOSS_ENCOUNTER')).toBe('BOSS_ENCOUNTER');

    const mock = createMockCtx();
    const bgm = new BgmEngine({ audioContextFactory: () => mock.ctx });
    bgm.start('OASIS_HUB');
    expect(bgm.getStatus().running).toBe(true);
    expect(bgm.stepNote()).toBe(true);

    bgm.setTheme('BOSS_ENCOUNTER');
    expect(bgm.getStatus().currentTheme).toBe('BOSS_ENCOUNTER');
    expect(bgm.stepNote()).toBe(true);

    bgm.setVolumes({ bgmVolume: 0 });
    expect(bgm.stepNote()).toBe(false);

    bgm.setVolumes({ bgmVolume: 0.6, muted: false });
    expect(bgm.stepNote()).toBe(true);
    bgm.stop();
    expect(bgm.getStatus().running).toBe(false);
  });

  it('normalizes user settings, persists settings safely, and gates haptics toggle', () => {
    const normalized = normalizeUserSettings({
      masterVolume: 2.5,
      bgmVolume: -1,
      sfxVolume: 0.5,
      muted: true,
      hapticsEnabled: false,
      toastDensity: 'IMPORTANT',
    });
    expect(normalized).toEqual({
      masterVolume: 1,
      bgmVolume: 0,
      sfxVolume: 0.5,
      muted: true,
      hapticsEnabled: false,
      toastDensity: 'IMPORTANT',
    });

    const saved = saveUserSettings(DEFAULT_USER_SETTINGS);
    expect(loadUserSettings()).toEqual(saved);

    setHapticsEnabled(false);
    expect(isHapticsEnabled()).toBe(false);
    expect(() => triggerHaptic(20)).not.toThrow();
    setHapticsEnabled(true);
    expect(isHapticsEnabled()).toBe(true);
  });

  it('equips ROYAL_SILK skin in store and defines distinct royal crimson-gold pixel palettes', () => {
    useGameStore.getState().setSkin('ROYAL_SILK');
    expect(useGameStore.getState().monetization.equippedSkinId).toBe('ROYAL_SILK');
    expect(SANDWALKER_PALETTE_ROYAL_SILK.M).toBe('#9b2c2c');
    expect(CARAVAN_PALETTE_ROYAL_SILK.C).toBe('#c53030');
    expect(CARAVAN_PALETTE_ROYAL_SILK.T).toBe('#f6e05e');
  });
});
