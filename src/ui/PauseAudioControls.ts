import { DEFAULT_AUDIO_SETTINGS, type AudioSettingsState } from '@/data/audioManifest';

export interface PauseAudioControlsCallbacks {
  onChange: (next: AudioSettingsState) => void;
}

/**
 * Pause Modal Audio Controls Panel (BGM / SFX separate mute toggles & volume sliders).
 * Kept inside the Pause Modal per Layer 1 Clean HUD <= 5 items isolation rule.
 */
export class PauseAudioControls {
  private readonly bgmMuteBtn: HTMLButtonElement;
  private readonly sfxMuteBtn: HTMLButtonElement;
  private readonly bgmSlider: HTMLInputElement;
  private readonly sfxSlider: HTMLInputElement;

  private settings: AudioSettingsState = { ...DEFAULT_AUDIO_SETTINGS };
  private readonly onChange: (next: AudioSettingsState) => void;

  constructor(containerEl: HTMLElement, callbacks: PauseAudioControlsCallbacks) {
    this.onChange = callbacks.onChange;

    const panel = document.createElement('div');
    panel.className = 'pause-audio-panel';
    panel.setAttribute('data-testid', 'pause-audio-panel');

    // Row 1: BGM Mute + Volume
    const bgmRow = document.createElement('div');
    bgmRow.className = 'pause-audio-row';

    const bgmMuteBtn = document.createElement('button');
    bgmMuteBtn.type = 'button';
    bgmMuteBtn.className = 'secondary-btn audio-toggle-btn';
    bgmMuteBtn.setAttribute('data-testid', 'btn-mute-bgm');
    bgmMuteBtn.addEventListener('click', () => {
      this.settings = { ...this.settings, bgmMuted: !this.settings.bgmMuted };
      this.render();
      this.onChange({ ...this.settings });
    });
    this.bgmMuteBtn = bgmMuteBtn;

    const bgmSlider = document.createElement('input');
    bgmSlider.type = 'range';
    bgmSlider.min = '0';
    bgmSlider.max = '100';
    bgmSlider.step = '5';
    bgmSlider.className = 'audio-volume-slider';
    bgmSlider.setAttribute('data-testid', 'slider-bgm-volume');
    bgmSlider.setAttribute('aria-label', 'BGM 음량');
    bgmSlider.addEventListener('input', () => {
      const val = Number(bgmSlider.value) / 100;
      this.settings = {
        ...this.settings,
        bgmVolume: Math.min(1, Math.max(0, val)),
        bgmMuted: val <= 0,
      };
      this.render();
      this.onChange({ ...this.settings });
    });
    this.bgmSlider = bgmSlider;
    bgmRow.append(bgmMuteBtn, bgmSlider);

    // Row 2: SFX/Ambience Mute + Volume (keeps btn-mute testid for backward compatibility)
    const sfxRow = document.createElement('div');
    sfxRow.className = 'pause-audio-row';

    const sfxMuteBtn = document.createElement('button');
    sfxMuteBtn.type = 'button';
    sfxMuteBtn.className = 'secondary-btn audio-toggle-btn';
    sfxMuteBtn.setAttribute('data-testid', 'btn-mute');
    sfxMuteBtn.setAttribute('data-audio-control', 'sfx-mute');
    sfxMuteBtn.addEventListener('click', () => {
      this.settings = { ...this.settings, sfxMuted: !this.settings.sfxMuted };
      this.render();
      this.onChange({ ...this.settings });
    });
    this.sfxMuteBtn = sfxMuteBtn;

    const sfxSlider = document.createElement('input');
    sfxSlider.type = 'range';
    sfxSlider.min = '0';
    sfxSlider.max = '100';
    sfxSlider.step = '5';
    sfxSlider.className = 'audio-volume-slider';
    sfxSlider.setAttribute('data-testid', 'slider-sfx-volume');
    sfxSlider.setAttribute('aria-label', '효과음 음량');
    sfxSlider.addEventListener('input', () => {
      const val = Number(sfxSlider.value) / 100;
      this.settings = {
        ...this.settings,
        sfxVolume: Math.min(1, Math.max(0, val)),
        sfxMuted: val <= 0,
      };
      this.render();
      this.onChange({ ...this.settings });
    });
    this.sfxSlider = sfxSlider;
    sfxRow.append(sfxMuteBtn, sfxSlider);

    panel.append(bgmRow, sfxRow);
    containerEl.appendChild(panel);
    this.render();
  }

  public syncSettings(next: AudioSettingsState): void {
    this.settings = { ...next };
    this.render();
  }

  private render(): void {
    this.bgmMuteBtn.textContent = this.settings.bgmMuted ? '🔇 BGM OFF' : '🎵 BGM ON';
    this.bgmMuteBtn.classList.toggle('muted', this.settings.bgmMuted);
    this.bgmSlider.value = String(Math.round(this.settings.bgmVolume * 100));

    this.sfxMuteBtn.textContent = this.settings.sfxMuted ? '🔇 효과음 OFF' : '🔊 효과음 ON';
    this.sfxMuteBtn.classList.toggle('muted', this.settings.sfxMuted);
    this.sfxSlider.value = String(Math.round(this.settings.sfxVolume * 100));
  }
}
