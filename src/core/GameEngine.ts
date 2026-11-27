import {
  CAMERA_SHAKE_DURATION_SEC,
  EVENT_INTERVAL_M,
  EXPEDITION_TOTAL_DISTANCE_M,
  GROUND_Y,
  HITSTOP_DURATION_SEC,
  INPUT_BUFFER_DODGE_SEC,
  INPUT_BUFFER_STANDARD_SEC,
  LAYER2_HEIGHT,
  LOGICAL_WIDTH,
  MAX_DT_SEC,
  OASIS_INTERVAL_M,
  POOL_SIZES,
  TURRET_ORDER,
  VISUAL_SCROLL_SCALE,
  WALKER_ANCHOR_X,
  type EnemyKind,
  type MercenaryId,
  type TurretId,
} from '@/data/masterData';
import { getEventForDistance, type DesertEventSpec } from '@/data/eventData';
import {
  gameStore,
  loadSaveStateV2,
  persistSaveStateV2,
} from '@/data/saveStore';
import { AssetLoader, type AssetLoadSummary } from './AssetLoader';
import { InputManager } from './InputManager';
import { ObjectPool } from './ObjectPool';
import { SoundSynth, type SfxKey } from './SoundSynth';
import { toggleFullscreen } from './fullscreen';
import { BiomeSystem, type BiomeRenderState } from '@/systems/BiomeSystem';
import { MechControlSystem, computeMarchSpeed, type MechFsmState } from '@/systems/MechControlSystem';
import { CombatSystem, type SandwormState } from '@/systems/CombatSystem';
import {
  computeOfflineGoldReward,
  resolveEventChoice,
  selectCheapestAutoUpgrade,
} from '@/systems/CaravanEconomy';
import {
  shouldShowInterstitialOnDefeat,
  type AdMonetizationState,
  type AdTier,
  type InterstitialDecision,
} from '@/systems/AdTierManager';
import { CanvasRenderer, type AmbientParticle } from '@/render/CanvasRenderer';
import { CleanHudOverlay } from '@/ui/CleanHudOverlay';
import { OpeningStoryboard } from '@/ui/OpeningStoryboard';
import { EventChoiceModal } from '@/ui/EventChoiceModal';
import { OasisCampModal } from '@/ui/OasisCampModal';

export type GameSceneId =
  | 'BOOT'
  | 'TITLE'
  | 'OPENING_STORYBOARD'
  | 'EXPEDITION'
  | 'EVENT_CHOICE'
  | 'OASIS_CAMP'
  | 'PAUSED';

export interface ActiveSpeechBubble {
  text: string;
  speakerName: string;
  colorHex: string;
  remainingSec: number;
}

export interface SandwalkerV2DebugHandle {
  getSnapshot: () => {
    scene: GameSceneId;
    distanceMeters: number;
    biome: BiomeRenderState;
    equippedTurret: string;
    gold: number;
    ancientGears: number;
    poolParticlesActive: number;
    poolParticlesCapacity: number;
    fps: number;
    assets: AssetLoadSummary;
  };
  getCombatState: () => {
    mechFsmState: MechFsmState;
    heat: number;
    inSweetSpot: boolean;
    isOverdrive: boolean;
    forcedCoolRemainingSec: number;
    isShieldActive: boolean;
    dodgeCooldownSec: number;
    enemyCount: number;
    relicCount: number;
    lockedEnemyId: number | null;
    lockedWeakPoint: boolean;
    sandwormState: SandwormState | null;
    bossTelegraphActive: boolean;
  };
  getEconomyState: () => {
    hasSeenOpeningStoryboard: boolean;
    autoUpgradeEnabled: boolean;
    cargoValue: number;
    wagonCount: number;
    mapPieces: number;
    templeKeys: number;
    turretLevels: Record<TurretId, number>;
    unlockedTurrets: readonly TurretId[];
    legLevel: number;
    shieldLevel: number;
    nextEventDistance: number;
    nextOasisDistance: number;
    activeSpeechBubble: string | null;
    activeEventId: string | null;
    campOpen: boolean;
    tradeSettledThisStop: boolean;
  };
  setDistance: (meters: number) => void;
  setScene: (scene: GameSceneId) => void;
  setHeat: (value: number) => void;
  spawnRaider: (x?: number) => void;
  spawnBoss: (kind: Exclude<EnemyKind, 'RAIDER'>, x?: number) => void;
  spawnRelic: (x?: number, gold?: number, gears?: number) => void;
  triggerEventAt: (distanceMeters?: number) => void;
  openCampAt: (distanceMeters?: number) => void;
  advanceStoryboard: (dtSec: number) => void;
  getMonetizationState: () => AdMonetizationState;
  setAdTier: (tier: AdTier) => void;
  addPlayTimeForAd: (sec: number) => void;
  evaluateDefeatAd: () => InterstitialDecision;
  getAudioState: () => { muted: boolean; playCounts: Readonly<Record<SfxKey, number>> };
  getFps: () => number;
}

declare global {
  interface Window {
    __SANDWALKER_V2__?: SandwalkerV2DebugHandle;
  }
}

/**
 * Core Fixed-Clamped Loop, Scene State Machine & Pooled Simulation Orchestrator (PRD Section 2-3).
 */
export class GameEngine {
  private readonly assetLoader = new AssetLoader();
  private readonly biomeSystem = new BiomeSystem();
  private readonly mechControl = new MechControlSystem();
  private readonly combatSystem = new CombatSystem();
  private readonly soundSynth = new SoundSynth();
  private readonly renderer: CanvasRenderer;
  private readonly overlay: CleanHudOverlay;
  private readonly inputManager: InputManager;
  private readonly openingStoryboard: OpeningStoryboard;
  private readonly eventChoiceModal: EventChoiceModal;
  private readonly oasisCampModal: OasisCampModal;

  private readonly particlePool: ObjectPool<AmbientParticle>;
  private readonly unlockedMercIdsBuf: string[] = [];
  private scene: GameSceneId = 'BOOT';
  private rafId: number | null = null;
  private lastTimestampMs = 0;
  private hitstopTimer = 0;
  private shakePx = 0;
  private shakeTimerSec = 0;
  private scrollPx = 0;
  private walkPhase = 0;
  private currentBiome: BiomeRenderState;
  private assetSummary: AssetLoadSummary = { total: 23, loaded: 0, missing: 23 };

  private lastAimAngleRad = 0;
  private bossTelegraphActive = false;
  private telegraphX = 640;
  private sandwormState: SandwormState | null = null;
  private lockedEnemyId: number | null = null;
  private lockedWeakPoint = false;

  private activeSpeechBubble: ActiveSpeechBubble | null = null;
  private activeOasisStopMeters = OASIS_INTERVAL_M;
  private tradeSettledThisStop = false;
  private lastSettledProfit = 0;

  private fpsCounterFrames = 0;
  private fpsAccumSec = 0;
  private currentFps = 60;
  private saveTimerSec = 0;
  private adTimerAccumSec = 0;
  private readonly cleanups: Array<() => void> = [];

  constructor(root: HTMLElement) {
    this.renderer = new CanvasRenderer(this.assetLoader);
    this.currentBiome = this.biomeSystem.evaluate(0);

    this.particlePool = new ObjectPool<AmbientParticle>(
      POOL_SIZES.particles,
      () => ({
        active: false,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        size: 2,
        alpha: 0.7,
        color: '#FDEBD0',
      }),
      (p) => {
        p.x = 0;
        p.y = 0;
        p.vx = 0;
        p.vy = 0;
        p.size = 2;
        p.alpha = 0.7;
      }
    );

    this.overlay = new CleanHudOverlay(root, {
      onStartExpedition: () => this.startExpedition(),
      onTogglePause: () => this.togglePause(),
      onResetToTitle: () => this.transitionScene('TITLE'),
      onCycleTurret: () => {
        this.soundSynth.unlock();
        if (this.scene === 'EXPEDITION') {
          gameStore.getState().cycleTurret();
          this.soundSynth.playTurretCycle();
          this.syncHud();
        } else {
          this.inputManager.bufferAction('TURRET_CYCLE', INPUT_BUFFER_STANDARD_SEC);
        }
      },
      onDodgeOrParry: () => {
        this.soundSynth.unlock();
        this.inputManager.bufferAction('DODGE_PARRY', INPUT_BUFFER_DODGE_SEC);
      },
      onActivateShield: () => {
        this.soundSynth.unlock();
        this.inputManager.bufferAction('SHIELD_ACTIVE', INPUT_BUFFER_STANDARD_SEC);
      },
      onVentOverdrive: () => {
        this.soundSynth.unlock();
        this.inputManager.bufferAction('VENT_OVERDRIVE', INPUT_BUFFER_STANDARD_SEC);
      },
      onToggleMute: () => this.soundSynth.toggleMute(),
    });

    this.openingStoryboard = new OpeningStoryboard(
      this.overlay.shellEl,
      this.assetLoader,
      () => this.completeOpeningStoryboard()
    );

    this.eventChoiceModal = new EventChoiceModal(
      this.overlay.layer2El,
      (event, choiceIdx) => this.handleEventChoice(event, choiceIdx)
    );

    this.oasisCampModal = new OasisCampModal(this.overlay.shellEl, {
      onSettleTrade: (useJafar) => this.handleCampSettleTrade(useJafar),
      onUpgradeTurret: (id) => this.handleCampUpgrade(() => gameStore.getState().upgradeTurret(id)),
      onUpgradeLeg: () => this.handleCampUpgrade(() => gameStore.getState().upgradeLeg()),
      onUpgradeShield: () => this.handleCampUpgrade(() => gameStore.getState().upgradeShield()),
      onBuyWagon: () => this.handleCampUpgrade(() => gameStore.getState().buyWagon()),
      onUpgradeMercenary: (id: MercenaryId) =>
        this.handleCampUpgrade(() => gameStore.getState().upgradeOrUnlockMercenary(id)),
      onToggleAutoUpgrade: (enabled) => this.handleToggleAutoUpgrade(enabled),
      onDepart: () => this.handleCampDepart(),
    });

    this.inputManager = new InputManager(this.overlay.canvas, {
      onPauseToggle: () => this.togglePause(),
      onFullscreenToggle: () => {
        void toggleFullscreen();
      },
    });

    this.exposeDebugHandle();
  }

  public async boot(): Promise<void> {
    const loaded = loadSaveStateV2();
    const nowMs = Date.now();
    gameStore.setState(loaded.state);

    // Offline trade reward when returning after >= 60s
    if (loaded.state.meta.hasSeenOpeningStoryboard) {
      const elapsedSec = Math.max(0, (nowMs - loaded.state.meta.lastOfflineTimestamp) / 1000);
      const harun = loaded.state.mercenaries.find((m) => m.id === 'harun');
      const offlineGold = computeOfflineGoldReward(
        elapsedSec,
        loaded.state.progression.maxDistanceMeters,
        harun?.unlocked ? harun.level : 1
      );
      if (offlineGold > 0) {
        gameStore.getState().addPlayerResources({ gold: offlineGold });
      }
    }
    gameStore.getState().touchOfflineTimestamp(nowMs);
    persistSaveStateV2(gameStore.getState());

    this.currentBiome = this.biomeSystem.evaluate(
      gameStore.getState().progression.currentDistanceMeters
    );
    this.transitionScene('TITLE');
    this.startLoop();
    this.assetSummary = await this.assetLoader.preloadAll({ probeAssets: true });
    this.openingStoryboard.refreshVisual();
  }

  public transitionScene(nextScene: GameSceneId): void {
    if (nextScene === this.scene) return;
    if (nextScene === 'TITLE' || nextScene === 'BOOT') {
      this.particlePool.releaseAll();
      this.combatSystem.releaseAll();
      this.mechControl.reset();
      this.renderer.resetCamera();
      this.openingStoryboard.close();
      this.eventChoiceModal.close();
      this.oasisCampModal.close();
      this.activeSpeechBubble = null;
    }
    this.scene = nextScene;
    this.syncHud();
  }

  public startExpedition(): void {
    this.soundSynth.unlock();
    const s = gameStore.getState();
    if (!s.meta.hasSeenOpeningStoryboard) {
      this.mechControl.setEventPause(true);
      this.transitionScene('OPENING_STORYBOARD');
      this.openingStoryboard.open();
      return;
    }
    this.mechControl.setEventPause(false);
    this.transitionScene('EXPEDITION');
  }

  private completeOpeningStoryboard(): void {
    gameStore.getState().markOpeningSeen();
    persistSaveStateV2(gameStore.getState());
    this.mechControl.setEventPause(false);
    this.transitionScene('EXPEDITION');
  }

  public togglePause(): void {
    if (this.scene === 'EXPEDITION') {
      this.transitionScene('PAUSED');
    } else if (this.scene === 'PAUSED') {
      this.transitionScene('EXPEDITION');
    }
  }

  public triggerHitstop(durationSec = HITSTOP_DURATION_SEC): void {
    this.hitstopTimer = Math.max(this.hitstopTimer, durationSec);
  }

  private triggerShake(px: number): void {
    if (px <= 0) return;
    this.shakePx = Math.max(this.shakePx, px);
    this.shakeTimerSec = CAMERA_SHAKE_DURATION_SEC;
  }

  private openChoiceEventAt(distanceMeters: number): void {
    const s = gameStore.getState();
    const ev = getEventForDistance(distanceMeters, s.meta.seenEventIds);
    this.mechControl.setEventPause(true);
    this.eventChoiceModal.open(ev, s.player.gold);
    this.transitionScene('EVENT_CHOICE');
  }

  private handleEventChoice(event: DesertEventSpec, choiceIdx: 0 | 1): void {
    const s = gameStore.getState();
    const choice = event.choices[choiceIdx];
    const resolution = resolveEventChoice(choice, s.player.gold);
    if (!resolution.affordable) return;

    s.addPlayerResources({
      gold: resolution.goldDelta,
      ancientGears: resolution.gearsDelta,
      mapPieces: resolution.mapPiecesDelta,
      templeKeys: resolution.templeKeysDelta,
    });

    if (resolution.triggerShieldCooldown) {
      this.mechControl.triggerShieldCooldownFromEvent();
    }
    if (resolution.triggerShieldFullCharge) {
      this.mechControl.fullChargeShield();
      this.soundSynth.playShieldActivate();
    }
    if (resolution.triggerOverdrive) {
      this.mechControl.triggerEventOverdrive();
      this.soundSynth.playSteamVent();
    }
    if (resolution.moraleBonusSec > 0) {
      this.mechControl.applyMoraleBonus(resolution.moraleBonusSec);
    }
    if (resolution.nextTradeMultiplier !== null) {
      s.setPendingTradeMultiplier(resolution.nextTradeMultiplier);
    }
    if (choice.isRewardedAd) {
      const rw = s.recordRewardedAd('JAFAR_EVENT_DEAL');
      this.overlay.showAdToast(
        rw.instantPass
          ? '🐪 자파르 보상형 패스 적용 — 다음 교역 2배'
          : '🐪 자파르 보상형 시청 완료 — 다음 교역 2배'
      );
    }

    this.activeSpeechBubble = {
      text: resolution.speechBubble,
      speakerName: event.speakerName,
      colorHex: event.speakerColorHex,
      remainingSec: 4.5,
    };

    s.advanceNextEventDistance(event.id);
    this.runAutoUpgradeIfEnabled();
    persistSaveStateV2(gameStore.getState());

    this.eventChoiceModal.close();
    this.mechControl.setEventPause(false);
    this.transitionScene('EXPEDITION');
  }

  private openOasisCampAt(oasisMeters: number): void {
    const s = gameStore.getState();
    if (oasisMeters >= 500) s.unlockTurret('TUR_02');
    if (oasisMeters >= 1000) s.unlockTurret('TUR_03');

    this.activeOasisStopMeters = oasisMeters;
    this.tradeSettledThisStop = false;
    this.lastSettledProfit = 0;

    this.mechControl.setEventPause(true);
    this.transitionScene('OASIS_CAMP');
    this.refreshCampModal();
  }

  private refreshCampModal(): void {
    const s = gameStore.getState();
    this.oasisCampModal.open({
      save: s,
      oasisDistanceMeters: this.activeOasisStopMeters,
      biomeIndex: this.currentBiome.biomeIndex,
      tradeSettledThisStop: this.tradeSettledThisStop,
      lastSettledProfit: this.lastSettledProfit,
    });
  }

  private handleCampSettleTrade(useJafarDouble: boolean): void {
    if (this.tradeSettledThisStop) return;
    const s = gameStore.getState();
    if (useJafarDouble) {
      const rw = s.recordRewardedAd('JAFAR_DOUBLE_TRADE');
      this.overlay.showAdToast(
        rw.instantPass
          ? '🐪 자파르 2배 정산 즉시 패스 적용!'
          : '🐪 자파르 보상형 광고 완료 — 2배 정산!'
      );
    }
    const res = s.settleOasisTrade(this.currentBiome.biomeIndex, useJafarDouble);
    this.tradeSettledThisStop = true;
    this.lastSettledProfit = res.totalProfit;
    this.soundSynth.playRelicExcavate();

    const interDecision = s.recordOasisSettlementForAd({
      isChapterBossCleared: this.activeOasisStopMeters >= 2000,
    });
    if (interDecision.allowed) {
      this.overlay.showAdToast(`📺 [Tier ${s.monetization.adTier}] 오아시스 전면 광고 (${interDecision.reason})`);
    }

    this.runAutoUpgradeIfEnabled();
    persistSaveStateV2(gameStore.getState());
    this.refreshCampModal();
    this.syncHud();
  }

  private handleCampUpgrade(action: () => boolean): void {
    if (!action()) return;
    persistSaveStateV2(gameStore.getState());
    this.refreshCampModal();
    this.syncHud();
  }

  private handleToggleAutoUpgrade(enabled: boolean): void {
    gameStore.getState().setAutoUpgradeEnabled(enabled);
    if (enabled) {
      this.runAutoUpgradeIfEnabled();
    }
    persistSaveStateV2(gameStore.getState());
    this.refreshCampModal();
    this.syncHud();
  }

  private handleCampDepart(): void {
    const s = gameStore.getState();
    if (!this.tradeSettledThisStop) {
      const res = s.settleOasisTrade(this.currentBiome.biomeIndex, false);
      this.tradeSettledThisStop = true;
      this.lastSettledProfit = res.totalProfit;
      const interDecision = s.recordOasisSettlementForAd({
        isChapterBossCleared: this.activeOasisStopMeters >= 2000,
      });
      if (interDecision.allowed) {
        this.overlay.showAdToast(`📺 [Tier ${s.monetization.adTier}] 오아시스 전면 광고 (${interDecision.reason})`);
      }
    }

    if (s.progression.currentDistanceMeters >= EXPEDITION_TOTAL_DISTANCE_M) {
      // Loop expedition route after clearing Zone 4 temple while preserving all progression & upgrades
      s.setDistanceMeters(0, 0);
      s.syncMilestonesAfterJump(0);
      this.currentBiome = this.biomeSystem.evaluate(0);
    } else {
      s.advanceNextOasisDistance();
    }

    this.runAutoUpgradeIfEnabled();
    persistSaveStateV2(gameStore.getState());
    this.oasisCampModal.close();
    this.mechControl.setEventPause(false);
    this.transitionScene('EXPEDITION');
  }

  private runAutoUpgradeIfEnabled(): void {
    const s = gameStore.getState();
    if (!s.meta.autoUpgradeEnabled) return;
    for (let step = 0; step < 5; step++) {
      const pick = selectCheapestAutoUpgrade(gameStore.getState());
      if (!pick) break;
      const cur = gameStore.getState();
      let applied = false;
      if (pick.target === 'LEG_01') {
        applied = cur.upgradeLeg();
      } else if (pick.target === 'SHD_01') {
        applied = cur.upgradeShield();
      } else {
        applied = cur.upgradeTurret(pick.target);
      }
      if (!applied) break;
    }
  }

  private exposeDebugHandle(): void {
    if (typeof window === 'undefined') return;
    window.__SANDWALKER_V2__ = {
      getSnapshot: () => {
        const s = gameStore.getState();
        return {
          scene: this.scene,
          distanceMeters: s.progression.currentDistanceMeters,
          biome: this.currentBiome,
          equippedTurret: s.sandwalker.equippedTurret,
          gold: s.player.gold,
          ancientGears: s.player.ancientGears,
          poolParticlesActive: this.particlePool.getActiveCount(),
          poolParticlesCapacity: this.particlePool.getCapacity(),
          fps: this.currentFps,
          assets: this.assetSummary,
        };
      },
      getCombatState: () => {
        const mech = this.mechControl.getSnapshot();
        return {
          mechFsmState: mech.fsmState,
          heat: mech.heat,
          inSweetSpot: mech.inSweetSpot,
          isOverdrive: mech.isOverdrive,
          forcedCoolRemainingSec: mech.forcedCoolRemainingSec,
          isShieldActive: mech.isShieldActive,
          dodgeCooldownSec: mech.dodgeCooldownSec,
          enemyCount: this.combatSystem.enemyPool.getActiveCount(),
          relicCount: this.combatSystem.relicPool.getActiveCount(),
          lockedEnemyId: this.lockedEnemyId,
          lockedWeakPoint: this.lockedWeakPoint,
          sandwormState: this.sandwormState,
          bossTelegraphActive: this.bossTelegraphActive,
        };
      },
      getEconomyState: () => {
        const s = gameStore.getState();
        return {
          hasSeenOpeningStoryboard: s.meta.hasSeenOpeningStoryboard,
          autoUpgradeEnabled: s.meta.autoUpgradeEnabled,
          cargoValue: s.player.cargoValue,
          wagonCount: s.player.wagonCount,
          mapPieces: s.player.mapPieces,
          templeKeys: s.player.templeKeys,
          turretLevels: { ...s.sandwalker.turretLevels },
          unlockedTurrets: [...s.sandwalker.unlockedTurrets],
          legLevel: s.sandwalker.legLevel,
          shieldLevel: s.sandwalker.shieldLevel,
          nextEventDistance: s.progression.nextEventDistance,
          nextOasisDistance: s.progression.nextOasisDistance,
          activeSpeechBubble: this.activeSpeechBubble?.text ?? null,
          activeEventId: this.eventChoiceModal.getActiveEventId(),
          campOpen: this.oasisCampModal.isOpen(),
          tradeSettledThisStop: this.tradeSettledThisStop,
        };
      },
      setDistance: (meters: number) => {
        gameStore.getState().setDistanceMeters(meters);
        gameStore.getState().syncMilestonesAfterJump(meters);
        this.currentBiome = this.biomeSystem.evaluate(
          gameStore.getState().progression.currentDistanceMeters
        );
        this.syncHud();
      },
      setScene: (nextScene: GameSceneId) => {
        this.transitionScene(nextScene);
      },
      setHeat: (value: number) => {
        this.mechControl.setHeatForDebug(value);
        this.syncHud();
      },
      spawnRaider: (x = LOGICAL_WIDTH - 60) => {
        this.combatSystem.spawnEnemy('RAIDER', x);
      },
      spawnBoss: (kind: Exclude<EnemyKind, 'RAIDER'>, x = 660) => {
        const e = this.combatSystem.spawnEnemy(kind, x);
        if (e && kind === 'BOSS_SANDWORM') {
          this.sandwormState = e.sandwormState;
        }
      },
      spawnRelic: (x = 460, gold = 85, gears = 1) => {
        this.combatSystem.spawnRelic(x, gold, gears);
      },
      triggerEventAt: (distanceMeters = EVENT_INTERVAL_M) => {
        this.openChoiceEventAt(distanceMeters);
      },
      openCampAt: (distanceMeters = OASIS_INTERVAL_M) => {
        gameStore.getState().setDistanceMeters(distanceMeters);
        gameStore.getState().syncMilestonesAfterJump(distanceMeters);
        this.currentBiome = this.biomeSystem.evaluate(distanceMeters);
        this.openOasisCampAt(distanceMeters);
      },
      advanceStoryboard: (dtSec: number) => {
        this.openingStoryboard.tick(dtSec);
      },
      getMonetizationState: () => ({ ...gameStore.getState().monetization }),
      setAdTier: (tier: AdTier) => {
        gameStore.getState().setAdTier(tier);
      },
      addPlayTimeForAd: (sec: number) => {
        gameStore.getState().addPlayTimeForAd(sec);
      },
      evaluateDefeatAd: () => shouldShowInterstitialOnDefeat(),
      getAudioState: () => ({
        muted: this.soundSynth.isMuted(),
        playCounts: this.soundSynth.getPlayCounts(),
      }),
      getFps: () => this.currentFps,
    };
  }

  private startLoop(): void {
    if (typeof requestAnimationFrame === 'undefined') return;
    this.lastTimestampMs = performance.now();

    const tick = (nowMs: number) => {
      const dt = Math.min((nowMs - this.lastTimestampMs) / 1000, MAX_DT_SEC);
      this.lastTimestampMs = nowMs;

      if (dt > 0) {
        this.fpsCounterFrames += 1;
        this.fpsAccumSec += dt;
        if (this.fpsAccumSec >= 0.5) {
          this.currentFps = Math.round(this.fpsCounterFrames / this.fpsAccumSec);
          this.fpsCounterFrames = 0;
          this.fpsAccumSec = 0;
        }
        this.update(dt);
      }

      this.renderFrame(dt > 0 ? dt : 0);
      this.rafId = requestAnimationFrame(tick);
    };

    this.rafId = requestAnimationFrame(tick);
  }

  private processInputs(): void {
    const s = gameStore.getState();

    if (this.inputManager.consumeAction('TURRET_0')) {
      this.soundSynth.unlock();
      s.cycleTurret(TURRET_ORDER[0]);
      this.soundSynth.playTurretCycle();
    } else if (this.inputManager.consumeAction('TURRET_1')) {
      this.soundSynth.unlock();
      s.cycleTurret(TURRET_ORDER[1]);
      this.soundSynth.playTurretCycle();
    } else if (this.inputManager.consumeAction('TURRET_2')) {
      this.soundSynth.unlock();
      s.cycleTurret(TURRET_ORDER[2]);
      this.soundSynth.playTurretCycle();
    } else if (this.inputManager.consumeAction('TURRET_CYCLE')) {
      this.soundSynth.unlock();
      s.cycleTurret();
      this.soundSynth.playTurretCycle();
    }

    if (this.inputManager.consumeAction('VENT_OVERDRIVE')) {
      this.soundSynth.unlock();
      if (this.mechControl.tryVentOverdrive()) {
        this.soundSynth.playSteamVent();
        this.combatSystem.spawnFloatingText(
          WALKER_ANCHOR_X,
          GROUND_Y - 142,
          'OVERDRIVE!',
          '#00E5FF',
          true,
          false
        );
      }
    }

    if (this.inputManager.consumeAction('SHIELD_ACTIVE')) {
      this.soundSynth.unlock();
      if (this.mechControl.tryActivateShield(s.sandwalker.shieldLevel)) {
        this.soundSynth.playShieldActivate();
      }
    }

    if (this.inputManager.consumeAction('EXCAVATE_NEAREST')) {
      this.soundSynth.unlock();
      const exc = this.combatSystem.excavateNearestRelic();
      if (exc) {
        this.soundSynth.playRelicExcavate();
        s.addPlayerResources({ gold: exc.gold, ancientGears: exc.gears });
        if (s.progression.currentDistanceMeters >= 500) {
          s.unlockTurret('TUR_03');
        }
        this.runAutoUpgradeIfEnabled();
      }
    }

    if (this.inputManager.consumeAction('DODGE_PARRY')) {
      this.soundSynth.unlock();
      const tele = this.combatSystem.getBossTelegraphState();
      const parryRes = this.mechControl.tryDodgeOrParry(tele.active || this.bossTelegraphActive);
      if (parryRes.triggered) {
        this.soundSynth.playGoldenParry();
        if (parryRes.isGoldenCounter) {
          const activeTurret = gameStore.getState().sandwalker.equippedTurret;
          const lv = gameStore.getState().sandwalker.turretLevels[activeTurret] ?? 1;
          const counter = this.combatSystem.triggerGoldenCounterBarrage(activeTurret, lv);
          if (counter.hitstop) {
            this.triggerHitstop(HITSTOP_DURATION_SEC);
          }
          this.triggerShake(counter.shakePx);
        }
      }
    }

    const tap = this.inputManager.consumeTap();
    if (tap) {
      this.soundSynth.unlock();
      // 1. Touch Relic Excavation (28px hit tolerance)
      const relicHit = this.combatSystem.tryExcavateRelicAt(tap.x, tap.y);
      if (relicHit) {
        this.soundSynth.playRelicExcavate();
        s.addPlayerResources({ gold: relicHit.gold, ancientGears: relicHit.gears });
        if (s.progression.currentDistanceMeters >= 500) {
          s.unlockTurret('TUR_03');
        }
        this.runAutoUpgradeIfEnabled();
        return;
      }

      // 2. Touch Sandwalker Hull -> Overheat Vent Overdrive (75 <= H <= 95)
      if (
        Math.abs(tap.x - WALKER_ANCHOR_X) <= 92 &&
        tap.y >= GROUND_Y - 128 &&
        tap.y <= GROUND_Y + 10
      ) {
        if (this.mechControl.tryVentOverdrive()) {
          this.soundSynth.playSteamVent();
          this.combatSystem.spawnFloatingText(
            WALKER_ANCHOR_X,
            GROUND_Y - 142,
            'STEAM VENT!',
            '#00E5FF',
            true,
            false
          );
          return;
        }
      }

      // 3. Touch Enemy / Exposed Boss Weakpoint -> Manual Lock-On (1.5x Damage)
      const lock = this.combatSystem.tryLockOnAt(tap.x, tap.y);
      this.lockedEnemyId = lock.lockedEnemyId;
      this.lockedWeakPoint = lock.weakPoint;
      if (lock.lockedEnemyId !== null) {
        this.soundSynth.playLockOn();
      }
    }
  }

  private update(dt: number): void {
    this.inputManager.tick(dt);
    const state = gameStore.getState();
    this.currentBiome = this.biomeSystem.evaluate(state.progression.currentDistanceMeters);

    if (this.activeSpeechBubble) {
      this.activeSpeechBubble.remainingSec -= dt;
      if (this.activeSpeechBubble.remainingSec <= 0) {
        this.activeSpeechBubble = null;
      }
    }

    if (this.shakeTimerSec > 0) {
      this.shakeTimerSec = Math.max(0, this.shakeTimerSec - dt);
      if (this.shakeTimerSec <= 0) this.shakePx = 0;
    }

    if (this.scene === 'OPENING_STORYBOARD') {
      this.openingStoryboard.tick(dt);
      return;
    }

    if (this.scene !== 'EXPEDITION') {
      return;
    }

    // Allow buffered inputs even during brief hitstop frames
    this.processInputs();

    if (this.hitstopTimer > 0) {
      this.hitstopTimer = Math.max(0, this.hitstopTimer - dt);
      this.syncHud();
      return;
    }

    const latest = gameStore.getState();
    const mechSnap = this.mechControl.update(dt, this.combatSystem.enemyPool.getActiveCount() > 0);
    const speedMetersPerSec = computeMarchSpeed(
      latest.sandwalker.legLevel,
      this.currentBiome.quicksandPenalty,
      mechSnap.speedMultiplier
    );

    const distanceDelta = speedMetersPerSec * dt * 0.22;
    const nextDist = Math.min(
      EXPEDITION_TOTAL_DISTANCE_M,
      latest.progression.currentDistanceMeters + distanceDelta
    );
    latest.setDistanceMeters(nextDist, this.currentBiome.biomeIndex);

    const scrollDeltaPx = speedMetersPerSec * dt * VISUAL_SCROLL_SCALE;
    this.scrollPx += scrollDeltaPx;
    this.walkPhase += dt * (7.5 * mechSnap.speedMultiplier);

    const activeTurret = latest.sandwalker.equippedTurret;
    const turretLv = latest.sandwalker.turretLevels[activeTurret] ?? 1;
    const combatOut = this.combatSystem.update(dt, {
      equippedTurret: activeTurret,
      turretLevel: turretLv,
      fireRateMultiplier: mechSnap.fireRateMultiplier,
      autoSpawnEnabled: true,
      scrollDeltaPx,
    });

    if (combatOut.goldEarned > 0 || combatOut.gearsEarned > 0) {
      latest.addPlayerResources({
        gold: combatOut.goldEarned,
        ancientGears: combatOut.gearsEarned,
      });
      this.runAutoUpgradeIfEnabled();
    }
    if (combatOut.hitstopTriggered) {
      this.triggerHitstop(HITSTOP_DURATION_SEC);
    }
    if (combatOut.shakePx > 0) {
      this.triggerShake(combatOut.shakePx);
    }

    this.bossTelegraphActive = combatOut.bossTelegraphActive;
    this.telegraphX = combatOut.telegraphX;
    this.sandwormState = combatOut.sandwormState;
    this.lockedEnemyId = combatOut.lockedEnemyId;
    this.lockedWeakPoint = combatOut.lockedWeakPoint;
    this.lastAimAngleRad = combatOut.aimAngleRad;

    // Pooled weather particles (zero heap allocation)
    const targetCount = this.currentBiome.stormParticleTarget;
    while (this.particlePool.getActiveCount() < targetCount) {
      const p = this.particlePool.acquire();
      if (!p) break;
      p.x = LOGICAL_WIDTH + Math.random() * 60;
      p.y = 14 + Math.random() * (GROUND_Y - 10);
      p.vx = this.currentBiome.isSandstorm ? -(210 + Math.random() * 140) : -(85 + Math.random() * 55);
      p.vy = 10 + Math.random() * 24;
      p.size = this.currentBiome.isSandstorm ? 4 : 2.5;
      p.alpha = this.currentBiome.isSandstorm ? 0.72 : 0.45;
      p.color = this.currentBiome.biomeIndex === 3 ? '#FDE68A' : '#FDEBD0';
    }

    this.particlePool.forEachActive((p) => {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.x < -20 || p.y > LAYER2_HEIGHT) {
        this.particlePool.release(p);
      }
    });

    // Check 300m Choice Event or 500m Oasis Camp milestone triggers
    const postProg = gameStore.getState().progression;
    if (
      postProg.currentDistanceMeters >= postProg.nextEventDistance &&
      postProg.nextEventDistance < EXPEDITION_TOTAL_DISTANCE_M
    ) {
      this.openChoiceEventAt(postProg.nextEventDistance);
      return;
    }

    if (
      postProg.currentDistanceMeters >= postProg.nextOasisDistance &&
      postProg.nextOasisDistance <= EXPEDITION_TOTAL_DISTANCE_M
    ) {
      this.openOasisCampAt(postProg.nextOasisDistance);
      return;
    }

    this.adTimerAccumSec += dt;
    if (this.adTimerAccumSec >= 1.0) {
      gameStore.getState().addPlayTimeForAd(this.adTimerAccumSec);
      this.adTimerAccumSec = 0;
    }

    this.saveTimerSec += dt;
    if (this.saveTimerSec >= 2.0) {
      this.saveTimerSec = 0;
      gameStore.getState().touchOfflineTimestamp();
      persistSaveStateV2(gameStore.getState());
    }

    this.syncHud();
  }

  private renderFrame(dt: number): void {
    const s = gameStore.getState();
    const mech = this.mechControl.getSnapshot();
    this.unlockedMercIdsBuf.length = 0;
    for (let i = 0; i < s.mercenaries.length; i++) {
      if (s.mercenaries[i].unlocked) {
        this.unlockedMercIdsBuf.push(s.mercenaries[i].id);
      }
    }

    this.renderer.render(this.overlay.ctx, {
      dt,
      scrollPx: this.scrollPx,
      walkPhase: this.walkPhase,
      biome: this.currentBiome,
      equippedTurret: s.sandwalker.equippedTurret,
      wagonCount: s.player.wagonCount,
      unlockedMercIds: this.unlockedMercIdsBuf,
      heatValue: mech.heat,
      isOverdrive: mech.isOverdrive,
      isShieldActive: mech.isShieldActive,
      aimAngleRad: this.lastAimAngleRad,
      cameraTargetOffsetX: this.sandwormState !== null ? 36 : 0,
      shakePx: this.shakePx,
      particlePool: this.particlePool,
      enemyPool: this.combatSystem.enemyPool,
      projectilePool: this.combatSystem.projectilePool,
      floatingTextPool: this.combatSystem.floatingTextPool,
      relicPool: this.combatSystem.relicPool,
      lockedEnemyId: this.lockedEnemyId,
      lockedWeakPoint: this.lockedWeakPoint,
      bossTelegraphActive: this.bossTelegraphActive,
      telegraphX: this.telegraphX,
      speechBubble: this.activeSpeechBubble,
    });
  }

  private syncHud(): void {
    const s = gameStore.getState();
    const mech = this.mechControl.getSnapshot();
    this.overlay.syncState({
      scene: this.scene,
      distanceMeters: s.progression.currentDistanceMeters,
      gold: s.player.gold,
      ancientGears: s.player.ancientGears,
      biome: this.currentBiome,
      equippedTurret: s.sandwalker.equippedTurret,
      heatValue: mech.heat,
      inSweetSpot: mech.inSweetSpot,
      isOverdrive: mech.isOverdrive,
      forcedCoolRemainingSec: mech.forcedCoolRemainingSec,
      dodgeCooldownSec: mech.dodgeCooldownSec,
      shieldCooldownSec: mech.shieldCooldownSec,
      isShieldActive: mech.isShieldActive,
      bossTelegraphActive: this.bossTelegraphActive,
    });
  }

  public destroy(): void {
    if (this.rafId !== null && typeof cancelAnimationFrame !== 'undefined') {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.inputManager.destroy();
    this.soundSynth.destroy();
    this.particlePool.releaseAll();
    this.combatSystem.releaseAll();
    while (this.cleanups.length > 0) {
      const fn = this.cleanups.pop();
      fn?.();
    }
    if (typeof window !== 'undefined' && window.__SANDWALKER_V2__) {
      delete window.__SANDWALKER_V2__;
    }
    this.overlay.destroy();
  }
}
