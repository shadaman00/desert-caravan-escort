export type AudioBusType = 'BGM' | 'AMBIENCE' | 'SFX';

export type BgmId =
  | 'bgm_title_opening'
  | 'bgm_zone1_dunes'
  | 'bgm_zone2_canyon'
  | 'bgm_zone3_storm'
  | 'bgm_boss_sandworm'
  | 'bgm_oasis_camp';

export type AmbienceId =
  | 'amb_desert_wind'
  | 'amb_quicksand_rumble'
  | 'amb_sandstorm_howl';

export type SfxId =
  | 'sfx_turret_harpoon'
  | 'sfx_turret_laser'
  | 'sfx_turret_mortar'
  | 'sfx_turret_switch'
  | 'sfx_manual_lockon'
  | 'sfx_overheat_vent'
  | 'sfx_golden_counter'
  | 'sfx_solar_shield'
  | 'sfx_relic_collect'
  | 'sfx_enemy_hit_crit'
  | 'sfx_boss_telegraph'
  | 'sfx_sandworm_emerge'
  | 'sfx_event_popup'
  | 'sfx_trade_coins'
  | 'sfx_upgrade_mech'
  | 'sfx_jafar_mirage';

export type AudioAssetId = BgmId | AmbienceId | SfxId;
export type SfxPriority = 'HIGH' | 'NORMAL';

export interface AudioSettingsState {
  bgmMuted: boolean;
  sfxMuted: boolean;
  bgmVolume: number;
  sfxVolume: number;
}

export interface IAudioManager {
  unlockOnUserGesture(): Promise<void>;
  preloadCategory(bus: AudioBusType): Promise<void>;
  playBgm(id: BgmId, crossfadeSec?: number): void;
  setAmbience(id: AmbienceId, intensity: number): void;
  playSfx(id: SfxId, options?: { pitchJitter?: number; gain?: number }): void;
  setDucking(active: boolean, durationSec?: number): void;
  applySettings(settings: AudioSettingsState): void;
}

export interface AudioManifestEntry {
  readonly id: AudioAssetId;
  readonly bus: AudioBusType;
  readonly path: string;
  readonly defaultGain: number;
  readonly loop: boolean;
  readonly priority: SfxPriority;
  readonly throttleMs: number;
}

export const AUDIO_BUS_DEFAULTS = {
  BGM: 0.55,
  AMBIENCE: 0.35,
  SFX: 0.9,
} as const;

export const DEFAULT_AUDIO_SETTINGS: AudioSettingsState = {
  bgmMuted: false,
  sfxMuted: false,
  bgmVolume: AUDIO_BUS_DEFAULTS.BGM,
  sfxVolume: AUDIO_BUS_DEFAULTS.SFX,
};

export const BGM_DUCK_FACTOR = 0.35;
export const BGM_DUCK_ATTACK_SEC = 0.3;
export const BGM_DUCK_RELEASE_SEC = 0.5;
export const BGM_CROSSFADE_DEFAULT_SEC = 1.5;

export const SFX_VOICE_CAP = 6;
export const SFX_THROTTLE_MS = 60;
export const SFX_PITCH_JITTER_RANGE = 0.04;
export const AUDIO_TOTAL_BUDGET_BYTES = Math.floor(4.1 * 1024 * 1024);

export const AUDIO_MANIFEST: readonly AudioManifestEntry[] = [
  // 6 BGM tracks
  { id: 'bgm_title_opening', bus: 'BGM', path: 'assets/audio/bgm/bgm_title_opening.mp3', defaultGain: AUDIO_BUS_DEFAULTS.BGM, loop: true, priority: 'NORMAL', throttleMs: 0 },
  { id: 'bgm_zone1_dunes', bus: 'BGM', path: 'assets/audio/bgm/bgm_zone1_dunes.mp3', defaultGain: AUDIO_BUS_DEFAULTS.BGM, loop: true, priority: 'NORMAL', throttleMs: 0 },
  { id: 'bgm_zone2_canyon', bus: 'BGM', path: 'assets/audio/bgm/bgm_zone2_canyon.mp3', defaultGain: AUDIO_BUS_DEFAULTS.BGM, loop: true, priority: 'NORMAL', throttleMs: 0 },
  { id: 'bgm_zone3_storm', bus: 'BGM', path: 'assets/audio/bgm/bgm_zone3_storm.mp3', defaultGain: AUDIO_BUS_DEFAULTS.BGM, loop: true, priority: 'NORMAL', throttleMs: 0 },
  { id: 'bgm_boss_sandworm', bus: 'BGM', path: 'assets/audio/bgm/bgm_boss_sandworm.mp3', defaultGain: AUDIO_BUS_DEFAULTS.BGM, loop: true, priority: 'HIGH', throttleMs: 0 },
  { id: 'bgm_oasis_camp', bus: 'BGM', path: 'assets/audio/bgm/bgm_oasis_camp.mp3', defaultGain: AUDIO_BUS_DEFAULTS.BGM, loop: true, priority: 'NORMAL', throttleMs: 0 },

  // 3 Ambience loops
  { id: 'amb_desert_wind', bus: 'AMBIENCE', path: 'assets/audio/ambience/amb_desert_wind.mp3', defaultGain: AUDIO_BUS_DEFAULTS.AMBIENCE, loop: true, priority: 'NORMAL', throttleMs: 0 },
  { id: 'amb_quicksand_rumble', bus: 'AMBIENCE', path: 'assets/audio/ambience/amb_quicksand_rumble.mp3', defaultGain: AUDIO_BUS_DEFAULTS.AMBIENCE, loop: true, priority: 'NORMAL', throttleMs: 0 },
  { id: 'amb_sandstorm_howl', bus: 'AMBIENCE', path: 'assets/audio/ambience/amb_sandstorm_howl.mp3', defaultGain: AUDIO_BUS_DEFAULTS.AMBIENCE, loop: true, priority: 'NORMAL', throttleMs: 0 },

  // 16 SFX entries
  { id: 'sfx_turret_harpoon', bus: 'SFX', path: 'assets/audio/sfx/sfx_turret_harpoon.mp3', defaultGain: 0.72, loop: false, priority: 'NORMAL', throttleMs: SFX_THROTTLE_MS },
  { id: 'sfx_turret_laser', bus: 'SFX', path: 'assets/audio/sfx/sfx_turret_laser.mp3', defaultGain: 0.65, loop: false, priority: 'NORMAL', throttleMs: SFX_THROTTLE_MS },
  { id: 'sfx_turret_mortar', bus: 'SFX', path: 'assets/audio/sfx/sfx_turret_mortar.mp3', defaultGain: 0.85, loop: false, priority: 'NORMAL', throttleMs: SFX_THROTTLE_MS },
  { id: 'sfx_turret_switch', bus: 'SFX', path: 'assets/audio/sfx/sfx_turret_switch.mp3', defaultGain: 0.8, loop: false, priority: 'HIGH', throttleMs: SFX_THROTTLE_MS },
  { id: 'sfx_manual_lockon', bus: 'SFX', path: 'assets/audio/sfx/sfx_manual_lockon.mp3', defaultGain: 0.85, loop: false, priority: 'HIGH', throttleMs: SFX_THROTTLE_MS },
  { id: 'sfx_overheat_vent', bus: 'SFX', path: 'assets/audio/sfx/sfx_overheat_vent.mp3', defaultGain: 0.9, loop: false, priority: 'HIGH', throttleMs: SFX_THROTTLE_MS },
  { id: 'sfx_golden_counter', bus: 'SFX', path: 'assets/audio/sfx/sfx_golden_counter.mp3', defaultGain: 0.95, loop: false, priority: 'HIGH', throttleMs: SFX_THROTTLE_MS },
  { id: 'sfx_solar_shield', bus: 'SFX', path: 'assets/audio/sfx/sfx_solar_shield.mp3', defaultGain: 0.88, loop: false, priority: 'HIGH', throttleMs: SFX_THROTTLE_MS },
  { id: 'sfx_relic_collect', bus: 'SFX', path: 'assets/audio/sfx/sfx_relic_collect.mp3', defaultGain: 0.85, loop: false, priority: 'HIGH', throttleMs: SFX_THROTTLE_MS },
  { id: 'sfx_enemy_hit_crit', bus: 'SFX', path: 'assets/audio/sfx/sfx_enemy_hit_crit.mp3', defaultGain: 0.72, loop: false, priority: 'NORMAL', throttleMs: SFX_THROTTLE_MS },
  { id: 'sfx_boss_telegraph', bus: 'SFX', path: 'assets/audio/sfx/sfx_boss_telegraph.mp3', defaultGain: 0.95, loop: false, priority: 'HIGH', throttleMs: SFX_THROTTLE_MS },
  { id: 'sfx_sandworm_emerge', bus: 'SFX', path: 'assets/audio/sfx/sfx_sandworm_emerge.mp3', defaultGain: 0.95, loop: false, priority: 'HIGH', throttleMs: SFX_THROTTLE_MS },
  { id: 'sfx_event_popup', bus: 'SFX', path: 'assets/audio/sfx/sfx_event_popup.mp3', defaultGain: 0.82, loop: false, priority: 'HIGH', throttleMs: SFX_THROTTLE_MS },
  { id: 'sfx_trade_coins', bus: 'SFX', path: 'assets/audio/sfx/sfx_trade_coins.mp3', defaultGain: 0.88, loop: false, priority: 'HIGH', throttleMs: SFX_THROTTLE_MS },
  { id: 'sfx_upgrade_mech', bus: 'SFX', path: 'assets/audio/sfx/sfx_upgrade_mech.mp3', defaultGain: 0.86, loop: false, priority: 'HIGH', throttleMs: SFX_THROTTLE_MS },
  { id: 'sfx_jafar_mirage', bus: 'SFX', path: 'assets/audio/sfx/sfx_jafar_mirage.mp3', defaultGain: 0.88, loop: false, priority: 'HIGH', throttleMs: SFX_THROTTLE_MS },
];

export const AUDIO_MANIFEST_BY_ID: Record<AudioAssetId, AudioManifestEntry> =
  AUDIO_MANIFEST.reduce((acc, item) => {
    acc[item.id] = item;
    return acc;
  }, {} as Record<AudioAssetId, AudioManifestEntry>);
