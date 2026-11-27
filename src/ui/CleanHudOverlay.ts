import {
  EXPEDITION_TOTAL_DISTANCE_M,
  LAYER2_HEIGHT,
  LOGICAL_HEIGHT,
  LOGICAL_WIDTH,
  OASIS_INTERVAL_M,
  TURRET_TABLE,
  type TurretId,
} from '@/data/masterData';
import {
  isFullscreenActive,
  isFullscreenSupported,
  subscribeFullscreenChange,
  toggleFullscreen,
} from '@/core/fullscreen';
import type { BiomeRenderState } from '@/systems/BiomeSystem';
import type { AudioSettingsState } from '@/data/audioManifest';
import { PauseAudioControls } from './PauseAudioControls';

export interface CleanHudSnapshot {
  scene:
    | 'BOOT'
    | 'TITLE'
    | 'OPENING_STORYBOARD'
    | 'EXPEDITION'
    | 'EVENT_CHOICE'
    | 'OASIS_CAMP'
    | 'PAUSED';
  distanceMeters: number;
  gold: number;
  ancientGears: number;
  biome: BiomeRenderState;
  equippedTurret: TurretId;
  heatValue: number;
  inSweetSpot: boolean;
  isOverdrive: boolean;
  forcedCoolRemainingSec: number;
  dodgeCooldownSec: number;
  shieldCooldownSec: number;
  isShieldActive: boolean;
  bossTelegraphActive: boolean;
}

export interface CleanHudCallbacks {
  onStartExpedition: () => void;
  onTogglePause: () => void;
  onResetToTitle: () => void;
  onCycleTurret: () => void;
  onDodgeOrParry: () => void;
  onActivateShield: () => void;
  onVentOverdrive: () => void;
  onAudioSettingsChange: (next: AudioSettingsState) => void;
}

/**
 * 3-Layer Clean HUD for Landscape 960x540 (Layer 1: 56px, Layer 2: 404px / 74.8%, Layer 3: 80px).
 * Limits always-visible HUD elements to <= 5 items per PRD Section 1.2.
 */
export class CleanHudOverlay {
  private readonly root: HTMLElement;
  public readonly shellEl: HTMLDivElement;
  public readonly layer2El: HTMLElement;
  public readonly canvas: HTMLCanvasElement;
  public readonly ctx: CanvasRenderingContext2D;

  private readonly distanceBarFill: HTMLDivElement;
  private readonly distanceTextEl: HTMLSpanElement;
  private readonly biomeBadgeEl: HTMLSpanElement;
  private readonly goldEl: HTMLSpanElement;
  private readonly gearsEl: HTMLSpanElement;
  private readonly pauseBtn: HTMLButtonElement;
  public readonly fullscreenBtn: HTMLButtonElement | null;

  private readonly titleOverlay: HTMLDivElement;
  private readonly pauseOverlay: HTMLDivElement;
  public readonly pauseAudioControls: PauseAudioControls;
  private readonly adToastEl: HTMLDivElement;
  private adToastTimer: ReturnType<typeof setTimeout> | null = null;

  public readonly turretCycleBtn: HTMLButtonElement;
  private readonly turretLabelEl: HTMLSpanElement;
  public readonly dodgeBtn: HTMLButtonElement;
  public readonly shieldBtn: HTMLButtonElement;
  private readonly heatHintEl: HTMLSpanElement;

  private readonly cleanups: Array<() => void> = [];

  constructor(root: HTMLElement, callbacks: CleanHudCallbacks) {
    this.root = root;
    this.root.innerHTML = '';

    const letterbox = document.createElement('div');
    letterbox.className = 'viewport-letterbox';
    letterbox.setAttribute('data-testid', 'viewport-letterbox');

    const shell = document.createElement('div');
    shell.className = 'viewport-shell';
    shell.setAttribute('data-testid', 'viewport-shell');
    this.shellEl = shell;

    // Layer 1: Top Journey HUD (960 x 56px, 10.4%)
    const layer1 = document.createElement('header');
    layer1.className = 'layer-1-hud';
    layer1.setAttribute('data-testid', 'layer-1-hud');

    const routeWrap = document.createElement('div');
    routeWrap.className = 'hud-route-group';

    const biomeBadge = document.createElement('span');
    biomeBadge.className = 'hud-biome-badge';
    biomeBadge.setAttribute('data-testid', 'hud-biome-name');
    biomeBadge.textContent = '황혼의 모래언덕';
    this.biomeBadgeEl = biomeBadge;

    const progressOuter = document.createElement('div');
    progressOuter.className = 'hud-distance-bar';
    progressOuter.setAttribute('data-testid', 'hud-distance-bar');

    const progressFill = document.createElement('div');
    progressFill.className = 'hud-distance-fill';
    this.distanceBarFill = progressFill;
    progressOuter.appendChild(progressFill);

    const distanceText = document.createElement('span');
    distanceText.className = 'hud-distance-text';
    distanceText.setAttribute('data-testid', 'hud-distance-text');
    distanceText.textContent = '0m / 2,000m (거점 500m)';
    this.distanceTextEl = distanceText;

    routeWrap.append(biomeBadge, progressOuter, distanceText);

    const currencyWrap = document.createElement('div');
    currencyWrap.className = 'hud-currency-group';

    const goldSpan = document.createElement('span');
    goldSpan.className = 'hud-currency-pill';
    goldSpan.setAttribute('data-testid', 'hud-gold');
    goldSpan.textContent = '🪙 300';
    this.goldEl = goldSpan;

    const gearSpan = document.createElement('span');
    gearSpan.className = 'hud-currency-pill';
    gearSpan.setAttribute('data-testid', 'hud-gears');
    gearSpan.textContent = '⚙️ 5';
    this.gearsEl = gearSpan;

    const pauseBtn = document.createElement('button');
    pauseBtn.type = 'button';
    pauseBtn.className = 'hud-icon-btn';
    pauseBtn.setAttribute('data-testid', 'btn-pause');
    pauseBtn.setAttribute('aria-label', '일시정지');
    pauseBtn.textContent = '⏸';
    pauseBtn.addEventListener('click', callbacks.onTogglePause);
    this.pauseBtn = pauseBtn;

    currencyWrap.append(goldSpan, gearSpan, pauseBtn);

    if (isFullscreenSupported()) {
      const fsBtn = document.createElement('button');
      fsBtn.type = 'button';
      fsBtn.className = 'hud-icon-btn';
      fsBtn.setAttribute('data-testid', 'btn-fullscreen');
      fsBtn.setAttribute('aria-label', '전체화면');
      fsBtn.setAttribute('data-fullscreen', isFullscreenActive() ? 'true' : 'false');
      fsBtn.textContent = isFullscreenActive() ? '❐' : '⛶';
      fsBtn.addEventListener('click', () => {
        void toggleFullscreen().then((active) => {
          fsBtn.setAttribute('data-fullscreen', active ? 'true' : 'false');
          fsBtn.textContent = active ? '❐' : '⛶';
        });
      });
      this.fullscreenBtn = fsBtn;
      currencyWrap.appendChild(fsBtn);

      const unsubFs = subscribeFullscreenChange((active) => {
        fsBtn.setAttribute('data-fullscreen', active ? 'true' : 'false');
        fsBtn.textContent = active ? '❐' : '⛶';
      });
      this.cleanups.push(unsubFs);
    } else {
      this.fullscreenBtn = null;
    }

    layer1.append(routeWrap, currencyWrap);

    // Layer 2: Full-Width Battlefield Canvas (960 x 404px, 74.8%)
    const layer2 = document.createElement('main');
    layer2.className = 'layer-2-battlefield';
    layer2.setAttribute('data-testid', 'layer-2-battlefield');
    this.layer2El = layer2;

    const canvas = document.createElement('canvas');
    canvas.className = 'battlefield-canvas';
    canvas.setAttribute('data-testid', 'game-canvas');
    const dpr =
      typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1;
    canvas.width = Math.round(LOGICAL_WIDTH * dpr);
    canvas.height = Math.round(LAYER2_HEIGHT * dpr);
    this.canvas = canvas;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to acquire 2D CanvasRenderingContext2D');
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.ctx = ctx;

    // Title one-touch overlay inside Layer 2
    const titleOverlay = document.createElement('div');
    titleOverlay.className = 'scene-overlay title-overlay';
    titleOverlay.setAttribute('data-testid', 'title-overlay');
    titleOverlay.innerHTML = `
      <div class="title-card">
        <div class="title-eyebrow">SANDWALKER CARAVAN EXPEDITION</div>
        <h1 class="title-heading">사막 캐러밴 호위대: 샌드워커 원정대</h1>
        <p class="title-sub">0m 황혼의 모래언덕 ➔ 2,000m 고대 태양 신전 오아시스 돌파</p>
      </div>
    `;
    const startBtn = document.createElement('button');
    startBtn.type = 'button';
    startBtn.className = 'cta-sortie-btn';
    startBtn.setAttribute('data-testid', 'btn-start-expedition');
    startBtn.textContent = '🚩 원터치 출격하기';
    startBtn.addEventListener('click', callbacks.onStartExpedition);
    titleOverlay.querySelector('.title-card')?.appendChild(startBtn);
    this.titleOverlay = titleOverlay;

    // Pause modal overlay
    const pauseOverlay = document.createElement('div');
    pauseOverlay.className = 'scene-overlay pause-overlay hidden';
    pauseOverlay.setAttribute('data-testid', 'pause-overlay');
    const pauseCard = document.createElement('div');
    pauseCard.className = 'pause-card';
    pauseCard.innerHTML = `<div class="pause-title">원정 일시정지</div>`;
    const pauseActions = document.createElement('div');
    pauseActions.className = 'pause-actions';
    const resumeBtn = document.createElement('button');
    resumeBtn.type = 'button';
    resumeBtn.className = 'cta-sortie-btn';
    resumeBtn.setAttribute('data-testid', 'btn-resume');
    resumeBtn.textContent = '▶ 원정 재개';
    resumeBtn.addEventListener('click', callbacks.onTogglePause);

    const titleBtn = document.createElement('button');
    titleBtn.type = 'button';
    titleBtn.className = 'secondary-btn';
    titleBtn.setAttribute('data-testid', 'btn-reset-run');
    titleBtn.textContent = '↺ 타이틀로';
    titleBtn.addEventListener('click', callbacks.onResetToTitle);
    pauseActions.append(resumeBtn, titleBtn);
    this.pauseAudioControls = new PauseAudioControls(pauseCard, {
      onChange: (next) => callbacks.onAudioSettingsChange(next),
    });
    pauseCard.appendChild(pauseActions);
    pauseOverlay.appendChild(pauseCard);
    this.pauseOverlay = pauseOverlay;

    const adToastEl = document.createElement('div');
    adToastEl.className = 'ad-sim-toast hidden';
    adToastEl.setAttribute('data-testid', 'ad-sim-toast');
    this.adToastEl = adToastEl;

    layer2.append(canvas, titleOverlay, pauseOverlay, adToastEl);

    // Layer 3: Bottom 3 Circular Control Buttons (960 x 80px, 14.8%)
    const layer3 = document.createElement('footer');
    layer3.className = 'layer-3-controls';
    layer3.setAttribute('data-testid', 'layer-3-controls');

    const turretBtn = document.createElement('button');
    turretBtn.type = 'button';
    turretBtn.className = 'control-circle-btn turret';
    turretBtn.setAttribute('data-testid', 'btn-turret-cycle');
    const turretMain = document.createElement('strong');
    turretMain.textContent = '포탑 순환 [Q]';
    const turretSub = document.createElement('span');
    turretSub.className = 'control-sub';
    turretSub.textContent = TURRET_TABLE.TUR_01.name;
    this.turretLabelEl = turretSub;
    turretBtn.append(turretMain, turretSub);
    turretBtn.addEventListener('click', callbacks.onCycleTurret);
    this.turretCycleBtn = turretBtn;

    const dodgeBtn = document.createElement('button');
    dodgeBtn.type = 'button';
    dodgeBtn.className = 'control-circle-btn dodge';
    dodgeBtn.setAttribute('data-testid', 'btn-dodge');
    dodgeBtn.innerHTML = '<strong>부스트/회피</strong><span class="control-sub">[Space] 패링</span>';
    dodgeBtn.addEventListener('click', callbacks.onDodgeOrParry);
    this.dodgeBtn = dodgeBtn;

    const shieldBtn = document.createElement('button');
    shieldBtn.type = 'button';
    shieldBtn.className = 'control-circle-btn shield';
    shieldBtn.setAttribute('data-testid', 'btn-shield');
    shieldBtn.innerHTML = '<strong>태양광 보호막</strong><span class="control-sub">[E] 5초 차단</span>';
    shieldBtn.addEventListener('click', callbacks.onActivateShield);
    this.shieldBtn = shieldBtn;

    const heatHint = document.createElement('span');
    heatHint.className = 'hud-heat-hint';
    heatHint.setAttribute('data-testid', 'hud-heat-hint');
    heatHint.textContent = '열기 0%';
    heatHint.addEventListener('click', callbacks.onVentOverdrive);
    this.heatHintEl = heatHint;

    layer3.append(turretBtn, dodgeBtn, shieldBtn, heatHint);

    shell.append(layer1, layer2, layer3);
    letterbox.appendChild(shell);
    this.root.appendChild(letterbox);

    this.updateScale();
    if (typeof window !== 'undefined') {
      const onResize = () => this.updateScale();
      window.addEventListener('resize', onResize);
      this.cleanups.push(() => window.removeEventListener('resize', onResize));
    }
  }

  public updateScale(): void {
    if (typeof window === 'undefined') return;
    const scale = Math.min(
      window.innerWidth / LOGICAL_WIDTH,
      window.innerHeight / LOGICAL_HEIGHT
    );
    this.shellEl.style.transform = `translate(-50%, -50%) scale(${Math.max(0.2, scale)})`;
  }

  public syncState(snap: CleanHudSnapshot): void {
    const pct = Math.min(100, Math.max(0, (snap.distanceMeters / EXPEDITION_TOTAL_DISTANCE_M) * 100));
    this.distanceBarFill.style.width = `${pct.toFixed(1)}%`;

    const nextCampDist =
      Math.min(
        EXPEDITION_TOTAL_DISTANCE_M,
        (Math.floor(snap.distanceMeters / OASIS_INTERVAL_M) + 1) * OASIS_INTERVAL_M
      );
    this.distanceTextEl.textContent = `${Math.floor(snap.distanceMeters)}m / 2,000m (다음 거점 ${nextCampDist}m)`;
    this.biomeBadgeEl.textContent = snap.biome.biomeName;
    this.goldEl.textContent = `🪙 ${snap.gold.toLocaleString()}`;
    this.gearsEl.textContent = `⚙️ ${snap.ancientGears}`;
    this.turretLabelEl.textContent = TURRET_TABLE[snap.equippedTurret].name;

    this.dodgeBtn.classList.toggle('golden-ready', snap.bossTelegraphActive && snap.dodgeCooldownSec <= 0);
    this.dodgeBtn.disabled = snap.dodgeCooldownSec > 0;
    const dodgeSub = this.dodgeBtn.querySelector('.control-sub');
    if (dodgeSub) {
      dodgeSub.textContent = snap.bossTelegraphActive
        ? '⚡ 지금 회피/패링!'
        : snap.dodgeCooldownSec > 0
          ? `${snap.dodgeCooldownSec.toFixed(1)}s 대기`
          : '[Space] 패링';
    }

    this.shieldBtn.classList.toggle('shield-active', snap.isShieldActive);
    this.shieldBtn.disabled = snap.shieldCooldownSec > 0 && !snap.isShieldActive;
    const shieldSub = this.shieldBtn.querySelector('.control-sub');
    if (shieldSub) {
      shieldSub.textContent = snap.isShieldActive
        ? '🛡️ 차단 활성 중'
        : snap.shieldCooldownSec > 0
          ? `${Math.ceil(snap.shieldCooldownSec)}s 대기`
          : '[E] 5초 차단';
    }

    this.heatHintEl.classList.toggle('sweet-spot', snap.inSweetSpot);
    this.heatHintEl.classList.toggle('forced-cool', snap.forcedCoolRemainingSec > 0);
    this.heatHintEl.textContent = snap.isOverdrive
      ? '🔥 오버드라이브!'
      : snap.forcedCoolRemainingSec > 0
        ? `❄️ 강제냉각 ${snap.forcedCoolRemainingSec.toFixed(1)}s`
        : snap.inSweetSpot
          ? `⚡ 과열 ${Math.round(snap.heatValue)}% [W/기체탭]`
          : `열기 ${Math.round(snap.heatValue)}%`;

    this.titleOverlay.classList.toggle('hidden', snap.scene !== 'TITLE');
    this.pauseOverlay.classList.toggle('hidden', snap.scene !== 'PAUSED');
    this.pauseBtn.textContent = snap.scene === 'PAUSED' ? '▶' : '⏸';
  }

  public syncAudioSettings(settings: AudioSettingsState): void {
    this.pauseAudioControls.syncSettings(settings);
  }

  public showAdToast(message: string): void {
    this.adToastEl.textContent = message;
    this.adToastEl.classList.remove('hidden');
    if (this.adToastTimer !== null) {
      clearTimeout(this.adToastTimer);
    }
    this.adToastTimer = setTimeout(() => {
      this.adToastEl.classList.add('hidden');
      this.adToastTimer = null;
    }, 3200);
  }

  public destroy(): void {
    if (this.adToastTimer !== null) {
      clearTimeout(this.adToastTimer);
      this.adToastTimer = null;
    }
    while (this.cleanups.length > 0) {
      const fn = this.cleanups.pop();
      fn?.();
    }
    this.root.innerHTML = '';
  }
}
