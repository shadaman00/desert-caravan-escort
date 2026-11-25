import {
  useRef,
  useEffect,
  useState,
  useMemo,
  type PointerEvent,
  type ReactElement,
} from 'react';
import { clientToZoneB, useViewportScale } from './scale';
import {
  isFullscreenActive,
  isFullscreenSupported,
  subscribeFullscreenChange,
  toggleFullscreen,
} from './fullscreen';
import { useGameStore } from '../store/gameStore';
import {
  useActiveTurret,
  useAdTier,
  useAncientGear,
  useCargo,
  useCargoCapacity,
  useCurrentAct,
  useCurrentOasisIndex,
  useDecodedSteleCount,
  useEquippedSkin,
  useHpStatus,
  useIsExpeditionSynergyActive,
  useLegLevel,
  useMapFragments,
  useMercenaries,
  useMercEquipment,
  useEndgame,
  useNextOasisPriceRate,
  usePendingRelicCount,
  useRelicCodexCount,
  useRouteProgress,
  useSunGold,
  useTempleKeys,
  useTurretLevels,
  useTurretTiers,
  useWagonCount,
} from '../store/selectors';
import type { AdTierLevel, DailyMissionId, TurretType } from '../store/types';
import { DebugBar } from '../ui/debug/DebugBar';
import { SettingsModal } from '../ui/SettingsModal';
import { adSimulator, AdSimulatorState } from '../game/monetization/AdSimulator';
import { processRewardedAdRequest } from '../game/monetization/rewardedAds';
import { SaveManager } from '../persistence/saveManager';
import {
  calculateOfflineReward,
  OfflineRewardResult,
} from '../persistence/offlineReward';
import { timerService } from '../engine/TimerService';
import { EventBus } from '../engine/EventBus';
import { GameLoop } from '../engine/GameLoop';
import { GameFSM, type GameStateId } from '../engine/fsm/GameFSM';
import { OpeningHookState } from '../engine/fsm/states/OpeningHookState';
import { OasisHubState } from '../engine/fsm/states/OasisHubState';
import { MarchNormalState } from '../engine/fsm/states/MarchNormalState';
import { HazardZoneState } from '../engine/fsm/states/HazardZoneState';
import { BossEncounterState } from '../engine/fsm/states/BossEncounterState';
import { EmergencyReviveState } from '../engine/fsm/states/EmergencyReviveState';
import { OasisSettlementState, type SettlementBreakdown } from '../engine/fsm/states/OasisSettlementState';
import { ParallaxSystem } from '../engine/systems/ParallaxSystem';
import { RouteSystem, getDefaultRouteDefinition } from '../engine/systems/RouteSystem';
import { CameraSystem } from '../engine/systems/CameraSystem';
import { HazardSystem } from '../engine/systems/HazardSystem';
import { BossSystem, type BossDebugSnapshot } from '../engine/systems/BossSystem';
import {
  CombatCoordinator,
  type AimReticleOverlayState,
  type CombatDebugSnapshot,
} from '../engine/systems/CombatCoordinator';
import {
  DialogueSystem,
  type DialogueDebugSnapshot,
} from '../engine/systems/DialogueSystem';
import { ExcavationSystem } from '../engine/systems/ExcavationSystem';
import {
  LootPickupSystem,
  pickEnemyDropItem,
} from '../engine/systems/LootPickupSystem';
import { AutoUpgradeEngine } from '../engine/systems/AutoUpgradeEngine';
import { QuestSystem } from '../engine/systems/QuestSystem';
import { WanderingMerchantSystem } from '../engine/systems/WanderingMerchantSystem';
import {
  TEMPLE_COMMEMORATIVE_RELIC_ID,
  TEMPLE_ENDING_EPILOGUE_LINES,
  evaluateTempleGate,
  getDepthModifiers,
} from '../engine/systems/EndlessExpeditionSystem';
import { Renderer } from '../engine/render/Renderer';
import { compileSprite } from '../engine/render/pixel/PixelCanvas';
import { WORLD_PALETTE } from '../engine/render/pixel/palettes';
import { RELIC_ICON_MATRICES } from '../engine/render/pixel/sprites/worldSprites';
import { soundEngine } from '../engine/audio/SoundEngine';
import { bgmEngine } from '../engine/audio/BgmEngine';
import type { ParticlePool } from '../engine/render/draw/particles';
import { WALKER_ANCHOR_X, WALKER_GROUND_Y } from '../engine/render/draw/sandwalker';
import { MERCENARY_DEFINITIONS, type MercenaryId } from '../game/data/mercenaries';
import {
  EQUIPMENT_RARITY_LABELS,
  MERC_EQUIPMENT_CATALOG,
} from '../game/data/equipment';
import { getGoodsDisplayName, getOasisDefinition, isSurgeJackpot } from '../game/data/oases';
import {
  createInitialDailyMissions,
  DAILY_MISSION_DEFINITIONS,
} from '../game/data/dailyMissions';
import { getTodayDateString } from '../store/defaults';
import {
  computeRelicCodexBonuses,
  getRelicDefinition,
  RELIC_DEFINITIONS,
  RELIC_RARITY_LABELS,
  STELE_DEFINITIONS,
} from '../game/data/relics';
import { QUEST_DEFINITIONS, URGENT_DELIVERY_REWARD_GOLD } from '../game/data/quests';
import { getOpeningPhaseInfo, type OpeningPhaseInfo } from '../game/data/openingScript';
import { getNextMilestoneSummary } from '../game/data/autoUpgradeRules';
import { quicksandIgnore, tierUpGearCost, upgradeCost } from '../game/formulas';
import { setHapticsEnabled, triggerHaptic } from '../game/haptics';
import {
  SETTINGS_STORAGE_KEY,
  loadUserSettings,
  saveUserSettings,
  type ToastDensity,
  type UserSettings,
} from '../game/settings';
import type {
  AutoInvestPolicy,
  AutoUpgradeEventRecord,
  AutoUpgradeItemKind,
} from '../store/types';

type GrowthTab = 'MECH' | 'MERCENARIES' | 'TRADE' | 'RELICS';

const GROWTH_TABS: readonly GrowthTab[] = ['MECH', 'MERCENARIES', 'TRADE', 'RELICS'];
const WEAKPOINT_HINT_STORAGE_KEY = 'SANDWALKER_WEAKPOINT_HINT_SEEN';

const FSM_STATE_LABELS: Record<GameStateId, string> = {
  OPENING_HOOK: '오프닝',
  OASIS_HUB: '오아시스 정비',
  MARCH_NORMAL: '사막 행군',
  HAZARD_ZONE: '위험 지대',
  BOSS_ENCOUNTER: '보스 교전',
  OASIS_SETTLEMENT: '교역 정산',
  EMERGENCY_REVIVE: '긴급 수리',
};

const TURRET_LABELS: Record<TurretType, string> = {
  HEAT_RAY: '열선',
  HARPOON: '작살',
  MORTAR: '박격포',
};

export interface SandwalkerDebugTelemetry {
  getSnapshot: () => {
    combat: CombatDebugSnapshot;
    meta: ReturnType<typeof useGameStore.getState>['meta'];
    currencies: ReturnType<typeof useGameStore.getState>['currencies'];
    sandwalker: ReturnType<typeof useGameStore.getState>['sandwalker'];
    mercenaries: ReturnType<typeof useGameStore.getState>['mercenaries'];
    trade: ReturnType<typeof useGameStore.getState>['trade'];
    relics: ReturnType<typeof useGameStore.getState>['relics'];
    steles: ReturnType<typeof useGameStore.getState>['steles'];
    monetization: ReturnType<typeof useGameStore.getState>['monetization'];
    dailyMissions?: ReturnType<typeof useGameStore.getState>['dailyMissions'];
    progression?: ReturnType<typeof useGameStore.getState>['progression'];
    explorerPassives?: ReturnType<typeof useGameStore.getState>['explorerPassives'];
    quests?: ReturnType<typeof useGameStore.getState>['quests'];
    mercEquipment?: ReturnType<typeof useGameStore.getState>['mercEquipment'];
    endgame?: ReturnType<typeof useGameStore.getState>['endgame'];
    codexBonuses?: ReturnType<typeof computeRelicCodexBonuses>;
    lootCount?: number;
    dialogue: DialogueDebugSnapshot;
  };
  spawnLoot?: (itemKind: AutoUpgradeItemKind, x?: number, y?: number) => void;
}

declare global {
  interface Window {
    __SANDWALKER_DEBUG__?: SandwalkerDebugTelemetry;
    __SANDWALKER_AUDIO__?: {
      getStatus: () => ReturnType<typeof soundEngine.getStatus>;
      getBgmStatus: () => ReturnType<typeof bgmEngine.getStatus>;
    };
  }
}

function formatCountdown(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

const RELIC_SPRITE_CACHE = new Map<string, ReturnType<typeof compileSprite>>();

function PixelIconCanvas({
  relicId,
  size = 22,
}: {
  relicId: string;
  size?: number;
}): ReactElement {
  const iconRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = iconRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const matrix = RELIC_ICON_MATRICES[relicId] ?? RELIC_ICON_MATRICES.relic_solar_disc;
    let compiled = RELIC_SPRITE_CACHE.get(relicId);
    if (!compiled) {
      compiled = compileSprite(matrix, WORLD_PALETTE);
      RELIC_SPRITE_CACHE.set(relicId, compiled);
    }

    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const scaleX = canvas.width / Math.max(1, compiled.width);
    const scaleY = canvas.height / Math.max(1, compiled.height);
    for (let i = 0; i < compiled.pixels.length; i++) {
      const p = compiled.pixels[i];
      ctx.fillStyle = p.color;
      ctx.fillRect(
        Math.floor(p.x * scaleX),
        Math.floor(p.y * scaleY),
        Math.ceil(scaleX),
        Math.ceil(scaleY)
      );
    }
  }, [relicId]);

  return (
    <canvas
      ref={iconRef}
      width={20}
      height={20}
      className="codex-pixel-thumb"
      style={{ width: `${size}px`, height: `${size}px` }}
    />
  );
}

interface UiBubbleItem {
  id: string;
  speaker: string;
  text: string;
  y: number;
  alpha: number;
}

const EMPTY_RETICLE: AimReticleOverlayState = {
  visible: false,
  x: 0,
  y: 0,
  locked: false,
  lockRemainingSec: 0,
};

const INITIAL_PHASE_INFO: OpeningPhaseInfo = getOpeningPhaseInfo(0);

function formatCooldownSec(cd: number): string {
  if (!Number.isFinite(cd) || cd <= 0) return '0.0';
  return (Math.ceil(cd * 10) / 10).toFixed(1);
}

export default function App(): ReactElement {
  const { scale } = useViewportScale();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const combatCoordinatorRef = useRef<CombatCoordinator | null>(null);
  const particlePoolRef = useRef<ParticlePool | null>(null);
  const cameraSystemRef = useRef<CameraSystem | null>(null);
  const routeSystemRef = useRef<RouteSystem | null>(null);

  const [activeTab, setActiveTab] = useState<GrowthTab>('MECH');
  const [tradeQtyInput, setTradeQtyInput] = useState<string>('10');
  const [adSimState, setAdSimState] = useState<AdSimulatorState>({
    isOpen: false,
    type: 'INTERSTITIAL',
    title: '',
    durationSeconds: 0,
    remainingSeconds: 0,
    canClose: false,
  });
  const [offlineReward, setOfflineReward] = useState<OfflineRewardResult | null>(null);
  const [turretSwitchCdRatio, setTurretSwitchCdRatio] = useState<number>(0);
  const [aimReticle, setAimReticle] = useState<AimReticleOverlayState>(EMPTY_RETICLE);
  const [dodgeUi, setDodgeUi] = useState<{
    active: boolean;
    cooldownRemainingSec: number;
    cooldownRatio: number;
  }>({ active: false, cooldownRemainingSec: 0, cooldownRatio: 0 });
  const [shieldUi, setShieldUi] = useState<{
    cooldownRemainingSec: number;
    cooldownRatio: number;
  }>({ cooldownRemainingSec: 0, cooldownRatio: 0 });
  const [expeditionBurstUi, setExpeditionBurstUi] = useState<{
    ready: boolean;
    cooldownRemainingSec: number;
    cooldownRatio: number;
    count: number;
  }>({ ready: true, cooldownRemainingSec: 0, cooldownRatio: 0, count: 0 });
  const [merchantRerollPending, setMerchantRerollPending] = useState<boolean>(false);
  const [merchantRefreshTick, setMerchantRefreshTick] = useState<number>(0);
  const [actualSpeedPx, setActualSpeedPx] = useState<number>(0);
  const [relayBannerVisible, setRelayBannerVisible] = useState<boolean>(false);
  const [bossHud, setBossHud] = useState<BossDebugSnapshot | null>(null);
  const [reviveRemainingSec, setReviveRemainingSec] = useState<number>(5);
  const [reviveAdPending, setReviveAdPending] = useState<boolean>(false);
  const [relayAdPending, setRelayAdPending] = useState<boolean>(false);
  const [openingPhaseInfo, setOpeningPhaseInfo] =
    useState<OpeningPhaseInfo>(INITIAL_PHASE_INFO);
  const [introSeenState, setIntroSeenState] = useState<boolean>(() =>
    SaveManager.isIntroSeen()
  );
  const [uiBalloons, setUiBalloons] = useState<UiBubbleItem[]>([]);
  const [settlementProfit, setSettlementProfit] = useState<number>(0);
  const [settlementBreakdown, setSettlementBreakdown] = useState<SettlementBreakdown | null>(
    null
  );
  const [zafar2xClaimed, setZafar2xClaimed] = useState<boolean>(false);
  const [relicAdPending, setRelicAdPending] = useState<boolean>(false);
  const [userSettings, setUserSettings] = useState<UserSettings>(() => {
    const loaded = loadUserSettings();
    const hasSavedSettings =
      typeof window !== 'undefined' &&
      Boolean(window.localStorage?.getItem(SETTINGS_STORAGE_KEY));
    const effectiveMuted = hasSavedSettings ? loaded.muted : soundEngine.isMuted();
    const initial = { ...loaded, muted: effectiveMuted };
    soundEngine.setMasterVolume(initial.masterVolume);
    soundEngine.setSfxVolume(initial.sfxVolume);
    soundEngine.setMuted(initial.muted);
    bgmEngine.setVolumes({
      masterVolume: initial.masterVolume,
      bgmVolume: initial.bgmVolume,
      muted: initial.muted,
    });
    setHapticsEnabled(initial.hapticsEnabled);
    return initial;
  });
  const [isMuted, setIsMuted] = useState<boolean>(() => soundEngine.isMuted());
  const [settingsOpen, setSettingsOpen] = useState<boolean>(false);
  const toastDensityRef = useRef<ToastDensity>(userSettings.toastDensity);
  toastDensityRef.current = userSettings.toastDensity;
  const [fullscreenSupported] = useState<boolean>(() => isFullscreenSupported());
  const [isFullscreen, setIsFullscreen] = useState<boolean>(() => isFullscreenActive());
  const [autoUpgradeToast, setAutoUpgradeToast] = useState<AutoUpgradeEventRecord | null>(null);
  const autoToastTimerRef = useRef<number | null>(null);
  const [codexNowMs, setCodexNowMs] = useState<number>(() => Date.now());
  const [saveJsonInput, setSaveJsonInput] = useState<string>('');
  const [saveBackupStatus, setSaveBackupStatus] = useState<string | null>(null);
  const [hasUsedWeakPointAim, setHasUsedWeakPointAim] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      return window.localStorage.getItem(WEAKPOINT_HINT_STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  });

  const relayAdPendingRef = useRef<boolean>(false);
  const adSimOpenRef = useRef<boolean>(false);
  const pointerDragStartRef = useRef<{ x: number; y: number } | null>(null);

  // Granular Zustand selectors
  const currentAct = useCurrentAct();
  const currentOasisIndex = useCurrentOasisIndex();
  const routeProgress = useRouteProgress();
  const sunGold = useSunGold();
  const ancientGear = useAncientGear();
  const mapFragments = useMapFragments();
  const templeKeys = useTempleKeys();
  const adTier = useAdTier();
  const equippedSkinId = useEquippedSkin();
  const nextOasisPriceRate = useNextOasisPriceRate();
  const cargo = useCargo();

  const hpStatus = useHpStatus();
  const activeTurret = useActiveTurret();
  const turretLevels = useTurretLevels();
  const turretTiers = useTurretTiers();
  const legPartLevel = useLegLevel();
  const wagonCount = useWagonCount();
  const cargoCapacity = useCargoCapacity();

  const mercenaries = useMercenaries();
  const mercEquipment = useMercEquipment();
  const endgame = useEndgame();
  const synergyActive = useIsExpeditionSynergyActive();
  const decodedSteleCount = useDecodedSteleCount();
  const relicCodexCount = useRelicCodexCount();
  const pendingRelicCount = usePendingRelicCount();
  const pendingRelics = useGameStore((s) => s.relics.pending);
  const decodedSteles = useGameStore((s) => s.steles.decoded);
  const relicCodex = useGameStore((s) => s.relics.codex);
  const dailyMissions = useGameStore((s) => s.dailyMissions);
  const dailySkipTicketsLeft = useGameStore((s) => s.monetization.dailySkipTicketsLeft);
  const progression = useGameStore((s) => s.progression);
  const explorerPassives = useGameStore((s) => s.explorerPassives);
  const questsState = useGameStore((s) => s.quests);
  const totalPlaySeconds = useGameStore((s) => s.meta.totalPlaySeconds);
  const fullGameState = useGameStore((s) => s);

  const switchTurretAction = useGameStore((s) => s.switchTurret);
  const addCurrencies = useGameStore((s) => s.addCurrencies);

  // Initialize EventBus, Systems, and GameFSM
  const {
    eventBus,
    fsm,
    openingHookState,
    oasisHubState,
    oasisSettlementState,
    hazardSystem,
    bossSystem,
    emergencyReviveState,
    dialogueSystem,
    excavationSystem,
    lootPickupSystem,
    autoUpgradeEngine,
    questSystem,
    wanderingMerchantSystem,
  } = useMemo(() => {
    const bus = new EventBus();
    const machine = new GameFSM(timerService, bus);
    const hazard = new HazardSystem();
    const boss = new BossSystem({ eventBus: bus });
    const dialogue = new DialogueSystem();
    const excavation = new ExcavationSystem({ eventBus: bus });
    const lootPickup = new LootPickupSystem({ eventBus: bus });
    const autoUpgrade = new AutoUpgradeEngine({ eventBus: bus });
    const quests = new QuestSystem({ eventBus: bus, autoUpgradeEngine: autoUpgrade });
    const wanderingMerchant = new WanderingMerchantSystem();
    const opening = new OpeningHookState({
      dialogueSystem: dialogue,
      excavationSystem: excavation,
    });
    const hub = new OasisHubState();
    const revive = new EmergencyReviveState();
    const settlement = new OasisSettlementState({ eventBus: bus });

    const getBoostMult = () =>
      combatCoordinatorRef.current?.getRouteSpeedMultiplier() ?? 1;

    machine.registerState(opening);
    machine.registerState(hub);
    machine.registerState(new MarchNormalState({ getSpeedMultiplier: getBoostMult }));
    machine.registerState(
      new HazardZoneState({ getSpeedMultiplier: getBoostMult, hazardSystem: hazard, eventBus: bus })
    );
    machine.registerState(new BossEncounterState({ bossSystem: boss, eventBus: bus }));
    machine.registerState(revive);
    machine.registerState(settlement);

    return {
      eventBus: bus,
      fsm: machine,
      openingHookState: opening,
      oasisHubState: hub,
      oasisSettlementState: settlement,
      hazardSystem: hazard,
      bossSystem: boss,
      emergencyReviveState: revive,
      dialogueSystem: dialogue,
      excavationSystem: excavation,
      lootPickupSystem: lootPickup,
      autoUpgradeEngine: autoUpgrade,
      questSystem: quests,
      wanderingMerchantSystem: wanderingMerchant,
    };
  }, []);

  const [currentFsmState, setCurrentFsmState] = useState<string>('OASIS_HUB');
  const currentFsmStateRef = useRef<string>('OASIS_HUB');
  const routeDef = getDefaultRouteDefinition(
    currentAct,
    currentOasisIndex,
    currentFsmState as GameStateId
  );

  useEffect(() => {
    currentFsmStateRef.current = currentFsmState;
  }, [currentFsmState]);

  // App initialization: load save & offline rewards
  useEffect(() => {
    SaveManager.init();
    const loadResult = SaveManager.load();
    useGameStore.getState().resetDailyMissionsIfNeeded();

    if (loadResult && loadResult.meta && loadResult.meta.lastSavedTimestamp) {
      const reward = calculateOfflineReward(
        loadResult.meta.lastSavedTimestamp,
        loadResult.sandwalker?.wagonCount ?? 1
      );
      if (reward.eligible && reward.gold > 0) {
        setOfflineReward(reward);
      }
    }

    setIntroSeenState(SaveManager.isIntroSeen());

    // Decision D10: Start in OPENING_HOOK whenever intro has not completed;
    // UI renders skip-intro-btn only if SaveManager.isIntroSeen() is true.
    if (!loadResult?.meta?.isIntroCompleted) {
      fsm.transitionTo('OPENING_HOOK');
    } else {
      fsm.transitionTo('OASIS_HUB');
    }

    const initialStateId = fsm.getCurrentStateId() ?? 'OASIS_HUB';
    currentFsmStateRef.current = initialStateId;
    setCurrentFsmState(initialStateId);

    const unsubscribe = adSimulator.subscribe((state) => {
      adSimOpenRef.current = state.isOpen;
      if (!state.isOpen && relayAdPendingRef.current) {
        relayAdPendingRef.current = false;
        setRelayAdPending(false);
      }
      setAdSimState(state);
    });

    return () => {
      unsubscribe();
      SaveManager.stopAutoSave();
      timerService.cancelAll();
    };
  }, [fsm]);

  // Unified Fixed-dt GameLoop + Zone B Canvas 2D Renderer + CombatCoordinator
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const initialState = useGameStore.getState();
    const routeSystem = new RouteSystem();
    const parallaxSystem = new ParallaxSystem({
      initialTimeOfDay: initialState.meta.timeOfDay,
    });
    const cameraSystem = new CameraSystem();
    const renderer = new Renderer(canvas, { eventBus });
    const combatCoordinator = new CombatCoordinator({ eventBus, bossSystem });

    combatCoordinatorRef.current = combatCoordinator;
    particlePoolRef.current = renderer.particlePool;
    cameraSystemRef.current = cameraSystem;
    routeSystemRef.current = routeSystem;

    if (typeof window !== 'undefined') {
      window.__SANDWALKER_AUDIO__ = {
        getStatus: () => soundEngine.getStatus(),
        getBgmStatus: () => bgmEngine.getStatus(),
      };
      window.__SANDWALKER_DEBUG__ = {
        getSnapshot: () => {
          const latest = useGameStore.getState();
          const stateId = fsm.getCurrentStateId();
          const routeSnap = routeSystem.getSnapshot();
          const relayVisible = hazardSystem.isRelayTowerAvailable(
            stateId,
            latest.meta.currentAct,
            latest.meta.currentOasisIndex,
            Boolean(latest.endgame?.endlessActive),
            latest.endgame?.currentDepth ?? 1
          );
          return {
            combat: combatCoordinator.getDebugSnapshot(stateId, latest, {
              routeSnap,
              relayTowerVisible: relayVisible,
              particleCount: renderer.particlePool.getActiveCount(),
            }),
            meta: { ...latest.meta },
            currencies: { ...latest.currencies },
            sandwalker: { ...latest.sandwalker },
            mercenaries: latest.mercenaries.map((m) => ({ ...m })),
            trade: {
              ...latest.trade,
              cargo: latest.trade.cargo.map((c) => ({ ...c })),
            },
            relics: {
              pending: latest.relics.pending.map((r) => ({ ...r })),
              codex: [...latest.relics.codex],
            },
            steles: {
              decoded: [...latest.steles.decoded],
            },
            monetization: { ...latest.monetization },
            dailyMissions: latest.dailyMissions
              ? {
                  ...latest.dailyMissions,
                  items: latest.dailyMissions.items.map((m) => ({ ...m })),
                }
              : undefined,
            progression: latest.progression
              ? {
                  ...latest.progression,
                  counters: {
                    ...latest.progression.counters,
                    killsByTurret: { ...latest.progression.counters.killsByTurret },
                  },
                  completedMilestones: [...latest.progression.completedMilestones],
                  recentAutoUpgrades: [...latest.progression.recentAutoUpgrades],
                }
              : undefined,
            explorerPassives: latest.explorerPassives ? { ...latest.explorerPassives } : undefined,
            quests: latest.quests
              ? {
                  completedIds: [...latest.quests.completedIds],
                  urgentDelivery: { ...latest.quests.urgentDelivery },
                }
              : undefined,
            mercEquipment: latest.mercEquipment ? { ...latest.mercEquipment } : undefined,
            endgame: latest.endgame ? { ...latest.endgame } : undefined,
            codexBonuses: computeRelicCodexBonuses(latest.relics.codex, latest.explorerPassives),
            lootCount: lootPickupSystem.getActivePickups().length,
            dialogue: dialogueSystem.getDebugSnapshot(),
          };
        },
        spawnLoot: (itemKind, x = 420, y = WALKER_GROUND_Y - 12) => {
          lootPickupSystem.spawnLoot(itemKind, x, y);
        },
      };
    }

    let playTimeAccum = 0;
    let sandstormSecAccum = 0;
    let killDropCounter = 0;
    let lastSwitchCdRatio = 0;
    let lastReticleKey = '0';
    let lastDodgeKey = '0:0';
    let lastShieldKey = '0';
    let lastBurstKey = '1:0:0';
    let lastActualSpeed = -1;
    let lastRelayVisible = false;
    let lastBossHudKey = 'none';
    let lastReviveSec = -1;
    let lastPhaseNum = 1;
    let lastBalloonsKey = '';

    const unsubShake = eventBus.on('camera:shake', ({ intensity, duration }) => {
      cameraSystem.shake(intensity, duration);
    });

    const unsubAudioSwitch = eventBus.on('turret:switch', () => {
      soundEngine.play('TURRET_SWITCH');
    });

    const unsubAudioFire = eventBus.on('turret:fire', ({ turret }) => {
      if (turret === 'HEAT_RAY') {
        soundEngine.play('HEAT_RAY');
      } else if (turret === 'HARPOON') {
        soundEngine.play('HARPOON');
      } else {
        soundEngine.play('MORTAR_EXPLOSION');
      }
    });

    const unsubAudioDamage = eventBus.on('damage:dealt', (ev) => {
      if (ev.isWeakPoint || ev.affinityMultiplier >= 2.0) {
        soundEngine.play('ARMOR_BREAK');
      }
    });

    const unsubEnemyKillLoot = eventBus.on('combat:enemyKilled', ({ archetypeId, x, y }) => {
      const store = useGameStore.getState();
      if (!store.meta.isIntroCompleted) return;
      killDropCounter += 1;
      const dropKind = pickEnemyDropItem(archetypeId, killDropCounter, store.sandwalker.activeTurret);
      if (dropKind) {
        lootPickupSystem.spawnLoot(dropKind, x, y);
      }
    });

    const unsubBossBreakLoot = eventBus.on('boss:partBreak', ({ act, x, y }) => {
      const store = useGameStore.getState();
      if (!store.meta.isIntroCompleted) return;
      lootPickupSystem.spawnLoot(act >= 2 ? 'HYDRAULIC_BLUEPRINT' : 'TURRET_PART_HARPOON', x, y);
    });

    const showBannerToast = (
      record: AutoUpgradeEventRecord,
      durationMs: number,
      important = false
    ) => {
      const density = toastDensityRef.current;
      if (density === 'OFF') return;
      if (
        density === 'IMPORTANT' &&
        !important &&
        record.category !== 'TURRET_TIER' &&
        record.category !== 'WAGON' &&
        record.category !== 'EQUIP'
      ) {
        return;
      }
      setAutoUpgradeToast(record);
      if (autoToastTimerRef.current !== null) {
        window.clearTimeout(autoToastTimerRef.current);
      }
      autoToastTimerRef.current = window.setTimeout(() => {
        setAutoUpgradeToast(null);
      }, durationMs);
    };

    const unsubAutoUpgradeToast = eventBus.on('progression:autoUpgrade', (record) => {
      const isMajor =
        record.category === 'TURRET_TIER' ||
        record.category === 'WAGON' ||
        record.category === 'EQUIP';
      soundEngine.play(isMajor ? 'TIER_UP_FANFARE' : 'AUTO_UPGRADE_CHIME');
      triggerHaptic(18);
      showBannerToast(record, 2600, isMajor);
      const pool = particlePoolRef.current;
      if (pool) {
        for (let k = 0; k < 8; k++) {
          const angle = -Math.PI + (k / 7) * Math.PI;
          pool.spawn({
            kind: 'SPARK',
            x: WALKER_ANCHOR_X + (Math.random() - 0.5) * 28,
            y: WALKER_GROUND_Y - 46,
            vx: Math.cos(angle) * 65,
            vy: Math.sin(angle) * 75 - 20,
            gravity: 110,
            size: 3.5,
            endSize: 0.8,
            maxLife: 0.55,
            startAlpha: 0.95,
            color: '#fef08a',
          });
        }
      }
    });

    const unsubLootSfx = eventBus.on('loot:collected', () => {
      soundEngine.play('LOOT_PICKUP');
    });

    const unsubRelicAppraisedSfx = eventBus.on('excavation:relicAppraised', ({ relicId }) => {
      const relicDef = getRelicDefinition(relicId);
      const isLegendaryOrAncient =
        relicDef?.rarity === 'LEGENDARY' || relicDef?.rarity === 'ANCIENT';
      soundEngine.play(isLegendaryOrAncient ? 'LEGENDARY_RELIC' : 'AUTO_UPGRADE_CHIME');
    });

    const unsubQuestToast = eventBus.on('quest:completed', ({ title, kind }) => {
      soundEngine.play('QUEST_COMPLETE');
      triggerHaptic(22);
      showBannerToast(
        {
          id: `qtoast_${Date.now()}`,
          timestamp: Date.now(),
          category: 'TURRET_LV',
          targetLabel: kind === 'URGENT' ? '긴급 운송 완료' : '퀘스트 완료',
          fromValue: title,
          toValue: '보상 자동 지급',
          triggerReason: '서사 임무 달성',
        },
        2800,
        true
      );
    });

    const unsubBurstToast = eventBus.on(
      'combat:expeditionBurst',
      ({ totalDamage, healedHp, shieldGranted }) => {
        soundEngine.play('TIER_UP_FANFARE');
        triggerHaptic([24, 30, 36]);
        showBannerToast(
          {
            id: `burst_${Date.now()}`,
            timestamp: Date.now(),
            category: 'MERC',
            targetLabel: '5인 합동 필살기',
            fromValue: `피해 ${Math.round(totalDamage)}`,
            toValue: `회복 +${healedHp} / 보호막 +${shieldGranted}`,
            triggerReason: '원정대 결속 발동',
          },
          2800,
          true
        );
      }
    );

    const unsubEndingTriggered = eventBus.on('endgame:endingTriggered', () => {
      soundEngine.play('LEGENDARY_RELIC');
      triggerHaptic([28, 40, 50]);
      TEMPLE_ENDING_EPILOGUE_LINES.forEach((line, idx) => {
        dialogueSystem.enqueue(line.speaker, line.text, `temple_epilogue_${idx}`);
      });
    });

    const unsubDepthCleared = eventBus.on(
      'endgame:depthCleared',
      ({ clearedDepth, nextDepth, bonusGold }) => {
        soundEngine.play('TIER_UP_FANFARE');
        triggerHaptic([20, 30, 20]);
        showBannerToast(
          {
            id: `depth_${Date.now()}`,
            timestamp: Date.now(),
            category: 'TURRET_LV',
            targetLabel: `심층 사막 Depth ${clearedDepth} 돌파!`,
            fromValue: `Depth ${clearedDepth}`,
            toValue: `Depth ${nextDepth} (+${bonusGold}G)`,
            triggerReason: '무한 심층 원정 보상',
          },
          3000,
          true
        );
      }
    );

    const unsubStateResetAim = eventBus.on('state:change', ({ from, to }) => {
      setIntroSeenState(SaveManager.isIntroSeen());
      bgmEngine.setTheme(to);
      if (to === 'BOSS_ENCOUNTER') {
        soundEngine.play('BOSS_WARNING');
      } else if (to === 'OASIS_SETTLEMENT') {
        soundEngine.play('SETTLEMENT_COIN');
      }
      if (to === 'OASIS_HUB' || to === 'OASIS_SETTLEMENT' || to === 'EMERGENCY_REVIVE') {
        useGameStore.getState().setManualAimTarget(null);
      }
      if (
        to === 'OASIS_HUB' ||
        to === 'OASIS_SETTLEMENT' ||
        (to === 'MARCH_NORMAL' && from === 'OASIS_HUB')
      ) {
        hazardSystem.resetForNewRoute();
      }
      if (to === 'OASIS_SETTLEMENT') {
        setSettlementProfit(oasisSettlementState.totalProfit);
        setSettlementBreakdown({ ...oasisSettlementState.breakdown });
        setZafar2xClaimed(false);
      }
      if (to !== 'EMERGENCY_REVIVE') {
        setReviveAdPending(false);
      }
      if (to !== 'HAZARD_ZONE') {
        relayAdPendingRef.current = false;
        setRelayAdPending(false);
        setRelayBannerVisible(false);
      }
    });

    const gameLoop = new GameLoop({
      onUpdate: (dt) => {
        if (adSimOpenRef.current) {
          return;
        }
        fsm.update(dt);

        const storeState = useGameStore.getState();
        const stateId = fsm.getCurrentStateId();
        const openingElapsedSeconds = openingHookState.getElapsedSeconds();

        dialogueSystem.update(dt);

        if (stateId !== 'EMERGENCY_REVIVE') {
          playTimeAccum += dt;
          if (playTimeAccum >= 1.0) {
            const wholeSec = Math.floor(playTimeAccum);
            playTimeAccum -= wholeSec;
            storeState.addPlayTime(wholeSec);
          }
        }

        const routeSnap = routeSystem.update(dt, stateId, storeState, {
          openingElapsedSeconds,
          boostMultiplier: combatCoordinator.getRouteSpeedMultiplier(),
        });

        if (routeSnap.targetTimeOfDay !== storeState.meta.timeOfDay) {
          storeState.setTimeOfDay(routeSnap.targetTimeOfDay);
        }

        parallaxSystem.update(dt, routeSnap.actualSpeed, routeSnap.targetTimeOfDay);

        const hpRatio =
          storeState.sandwalker.maxHp > 0
            ? storeState.sandwalker.currentHp / storeState.sandwalker.maxHp
            : 1;
        cameraSystem.update(dt, {
          isSandstormVisionMasked: routeSnap.isSandstormVisionMasked,
          hpRatio,
        });

        renderer.update(dt, routeSnap, storeState);

        const freshStore = useGameStore.getState();
        if (stateId === 'HAZARD_ZONE' && routeSnap.isSandstorm) {
          sandstormSecAccum += dt;
          if (sandstormSecAccum >= 1.0) {
            sandstormSecAccum -= 1.0;
            autoUpgradeEngine.recordSandstormSecond(freshStore);
          }
        } else {
          sandstormSecAccum = 0;
        }
        excavationSystem.update(
          dt,
          stateId,
          routeSnap.actualSpeed,
          freshStore,
          openingElapsedSeconds
        );
        lootPickupSystem.update(dt, stateId);
        combatCoordinator.update(dt, stateId, freshStore, freshStore, {
          routeSnap,
          walkerRig: renderer.walkerRig,
          particlePool: renderer.particlePool,
          cameraSystem,
          openingElapsedSeconds,
        });
      },
      onRender: (alpha) => {
        if (typeof window !== 'undefined') {
          (window as unknown as { __SANDWALKER_FPS__?: number }).__SANDWALKER_FPS__ =
            gameLoop.getFps();
        }

        const stateId = fsm.getCurrentStateId();
        if (stateId && stateId !== currentFsmStateRef.current) {
          currentFsmStateRef.current = stateId;
          setCurrentFsmState(stateId);
          setIntroSeenState(SaveManager.isIntroSeen());
        }

        const openingElapsed = openingHookState.getElapsedSeconds();
        if (stateId === 'OPENING_HOOK') {
          const info = getOpeningPhaseInfo(openingElapsed);
          if (info.phase !== lastPhaseNum) {
            lastPhaseNum = info.phase;
            setOpeningPhaseInfo(info);
          }
        } else if (lastPhaseNum !== 1) {
          lastPhaseNum = 1;
          setOpeningPhaseInfo(INITIAL_PHASE_INFO);
        }

        const activeBubbles = dialogueSystem.getActiveBubbles();
        const balloonsKey = activeBubbles
          .map((b) => `${b.id}:${Math.round(b.alpha * 10)}`)
          .join('|');
        if (balloonsKey !== lastBalloonsKey) {
          lastBalloonsKey = balloonsKey;
          setUiBalloons(
            activeBubbles.map((b) => ({
              id: b.id,
              speaker: b.speaker,
              text: b.text,
              y: b.y,
              alpha: b.alpha,
            }))
          );
        }

        const nextCdRatio =
          Math.round(combatCoordinator.getSwitchCooldownRatio() * 20) / 20;
        if (nextCdRatio !== lastSwitchCdRatio) {
          lastSwitchCdRatio = nextCdRatio;
          setTurretSwitchCdRatio(nextCdRatio);
        }

        const reticle = combatCoordinator.getAimReticleOverlay();
        const reticleKey = reticle.visible
          ? `1:${Math.round(reticle.x)}:${Math.round(reticle.y)}:${reticle.locked ? 1 : 0}`
          : '0';
        if (reticleKey !== lastReticleKey) {
          lastReticleKey = reticleKey;
          setAimReticle(reticle);
        }

        const dodgeState = combatCoordinator.getDodgeState();
        const dodgeKey = `${dodgeState.active ? 1 : 0}:${Math.ceil(dodgeState.cooldownRemainingSec * 10)}`;
        if (dodgeKey !== lastDodgeKey) {
          lastDodgeKey = dodgeKey;
          setDodgeUi({
            active: dodgeState.active,
            cooldownRemainingSec: dodgeState.cooldownRemainingSec,
            cooldownRatio: dodgeState.cooldownRatio,
          });
        }

        const shieldState = combatCoordinator.getSolarShieldCooldownState();
        const shieldKey = `${Math.ceil(shieldState.cooldownRemainingSec * 10)}`;
        if (shieldKey !== lastShieldKey) {
          lastShieldKey = shieldKey;
          setShieldUi({
            cooldownRemainingSec: shieldState.cooldownRemainingSec,
            cooldownRatio: shieldState.cooldownRatio,
          });
        }

        const burstState = combatCoordinator.getExpeditionBurstState();
        const burstKey = `${burstState.ready ? 1 : 0}:${Math.ceil(burstState.cooldownRemainingSec * 10)}:${burstState.count}`;
        if (burstKey !== lastBurstKey) {
          lastBurstKey = burstKey;
          setExpeditionBurstUi({
            ready: burstState.ready,
            cooldownRemainingSec: burstState.cooldownRemainingSec,
            cooldownRatio: burstState.cooldownRatio,
            count: burstState.count,
          });
        }

        const latestStore = useGameStore.getState();

        const routeSnap = routeSystem.getSnapshot();
        const nextSpeed = routeSnap ? Math.round(routeSnap.actualSpeed) : 0;
        if (nextSpeed !== lastActualSpeed) {
          lastActualSpeed = nextSpeed;
          setActualSpeedPx(nextSpeed);
        }

        const nextRelayVisible = hazardSystem.isRelayTowerAvailable(
          stateId,
          latestStore.meta.currentAct,
          latestStore.meta.currentOasisIndex,
          Boolean(latestStore.endgame?.endlessActive),
          latestStore.endgame?.currentDepth ?? 1
        );
        if (nextRelayVisible !== lastRelayVisible) {
          lastRelayVisible = nextRelayVisible;
          setRelayBannerVisible(nextRelayVisible);
        }

        const bossSnap =
          stateId === 'BOSS_ENCOUNTER' ? bossSystem.getDebugSnapshot() : null;
        const bossKey = bossSnap
          ? `${bossSnap.id}:${bossSnap.phase}:${bossSnap.hp}:${bossSnap.armor}:${bossSnap.isGroggy ? 1 : 0}:${bossSnap.telegraphActive ? 1 : 0}`
          : 'none';
        if (bossKey !== lastBossHudKey) {
          lastBossHudKey = bossKey;
          setBossHud(bossSnap);
        }

        const nextReviveSec =
          stateId === 'EMERGENCY_REVIVE'
            ? Math.max(0, emergencyReviveState.remainingSeconds)
            : -1;
        if (nextReviveSec !== lastReviveSec) {
          lastReviveSec = nextReviveSec;
          if (nextReviveSec >= 0) {
            setReviveRemainingSec(nextReviveSec);
          }
        }

        const forceTurretPreview =
          stateId === 'OPENING_HOOK' &&
          Number.isFinite(openingElapsed) &&
          openingElapsed >= 0 &&
          openingElapsed < 30;

        renderer.render(alpha, cameraSystem, parallaxSystem, latestStore, {
          turretAimAngle: combatCoordinator.getTurretAimAngle(),
          turretRecoilPx: combatCoordinator.getTurretRecoilPx(),
          forceTurretPreview,
          renderCombatLayer: (ctx) => {
            excavationSystem.render(ctx);
            lootPickupSystem.render(ctx);
            combatCoordinator.render(ctx, useGameStore.getState());
          },
          renderOverlayLayer: (overlayCtx) => {
            combatCoordinator.renderOverlay(overlayCtx, useGameStore.getState());
          },
        });
      },
    });

    gameLoop.start();

    return () => {
      unsubShake();
      unsubAudioSwitch();
      unsubAudioFire();
      unsubAudioDamage();
      unsubEnemyKillLoot();
      unsubBossBreakLoot();
      unsubAutoUpgradeToast();
      unsubLootSfx();
      unsubRelicAppraisedSfx();
      unsubQuestToast();
      unsubBurstToast();
      unsubEndingTriggered();
      unsubDepthCleared();
      unsubStateResetAim();
      if (autoToastTimerRef.current !== null) {
        window.clearTimeout(autoToastTimerRef.current);
      }
      questSystem.dispose();
      autoUpgradeEngine.dispose();
      gameLoop.stop();
      combatCoordinator.dispose();
      combatCoordinatorRef.current = null;
      particlePoolRef.current = null;
      cameraSystemRef.current = null;
      routeSystemRef.current = null;
      if (typeof window !== 'undefined' && window.__SANDWALKER_DEBUG__) {
        delete window.__SANDWALKER_DEBUG__;
      }
      if (typeof window !== 'undefined' && window.__SANDWALKER_AUDIO__) {
        delete window.__SANDWALKER_AUDIO__;
      }
      renderer.dispose();
    };
  }, [
    eventBus,
    fsm,
    openingHookState,
    oasisSettlementState,
    hazardSystem,
    bossSystem,
    emergencyReviveState,
    dialogueSystem,
    excavationSystem,
    lootPickupSystem,
    autoUpgradeEngine,
    questSystem,
  ]);

  useEffect(() => {
    const unlockOnce = () => {
      soundEngine.unlock();
      bgmEngine.start(currentFsmStateRef.current);
    };
    window.addEventListener('pointerdown', unlockOnce, { once: true, passive: true });
    window.addEventListener('keydown', unlockOnce, { once: true, passive: true });
    return () => {
      bgmEngine.stop();
      window.removeEventListener('pointerdown', unlockOnce);
      window.removeEventListener('keydown', unlockOnce);
    };
  }, []);

  useEffect(() => {
    if (pendingRelics.length === 0) return;
    setCodexNowMs(Date.now());
    const id = window.setInterval(() => {
      setCodexNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(id);
  }, [pendingRelics.length]);

  useEffect(() => subscribeFullscreenChange(setIsFullscreen), []);

  const handleUpdateSettings = (patch: Partial<UserSettings>) => {
    setUserSettings((prev) => {
      const next = saveUserSettings({ ...prev, ...patch });
      soundEngine.setMasterVolume(next.masterVolume);
      soundEngine.setSfxVolume(next.sfxVolume);
      soundEngine.setMuted(next.muted);
      bgmEngine.setVolumes({
        masterVolume: next.masterVolume,
        bgmVolume: next.bgmVolume,
        muted: next.muted,
      });
      setHapticsEnabled(next.hapticsEnabled);
      setIsMuted(next.muted);
      return next;
    });
  };

  const handleToggleMute = () => {
    soundEngine.unlock();
    bgmEngine.start(currentFsmStateRef.current);
    handleUpdateSettings({ muted: !soundEngine.isMuted() });
  };

  const handleToggleFullscreen = () => {
    void toggleFullscreen().then((active) => {
      setIsFullscreen(active);
    });
  };

  const handleTurretSwitch = (turret: TurretType) => {
    triggerHaptic(10);
    const coordinator = combatCoordinatorRef.current;
    if (coordinator) {
      const store = useGameStore.getState();
      coordinator.requestTurretSwitch(turret, store);
      setTurretSwitchCdRatio(coordinator.getSwitchCooldownRatio());
    } else {
      switchTurretAction(turret);
    }
  };

  const handleDodgeBoost = () => {
    const coordinator = combatCoordinatorRef.current;
    if (!coordinator) return;
    const store = useGameStore.getState();
    if (coordinator.activateDodgeBoost(store, fsm.getCurrentStateId())) {
      triggerHaptic(18);
      const ds = coordinator.getDodgeState();
      setDodgeUi({
        active: ds.active,
        cooldownRemainingSec: ds.cooldownRemainingSec,
        cooldownRatio: ds.cooldownRatio,
      });
      const routeSnap = routeSystemRef.current?.update(0, fsm.getCurrentStateId(), store, {
        openingElapsedSeconds: openingHookState.getElapsedSeconds(),
        boostMultiplier: coordinator.getRouteSpeedMultiplier(),
      });
      if (routeSnap) {
        setActualSpeedPx(Math.round(routeSnap.actualSpeed));
      }
    }
  };

  const handleSolarShield = () => {
    const coordinator = combatCoordinatorRef.current;
    if (!coordinator) return;
    const store = useGameStore.getState();
    if (coordinator.activateSolarShield(store, store, fsm.getCurrentStateId())) {
      triggerHaptic(20);
      const ss = coordinator.getSolarShieldCooldownState();
      setShieldUi({
        cooldownRemainingSec: ss.cooldownRemainingSec,
        cooldownRatio: ss.cooldownRatio,
      });
    }
  };

  const handleOverloadSkill = () => {
    triggerHaptic([20, 30, 40]);
    combatCoordinatorRef.current?.triggerOverloadSkill(
      particlePoolRef.current ?? undefined,
      cameraSystemRef.current ?? undefined
    );
  };

  const handleSortie = () => {
    triggerHaptic(15);
    oasisHubState.sortie(fsm);
  };

  const handleCanvasPointerDown = (e: PointerEvent<HTMLCanvasElement>) => {
    const coordinator = combatCoordinatorRef.current;
    if (!coordinator) return;
    try {
      e.currentTarget.setPointerCapture?.(e.pointerId);
    } catch {
      // Synthetic mouse events in headless tests may omit active pointerId
    }
    const pt = clientToZoneB(
      e.clientX,
      e.clientY,
      e.currentTarget.getBoundingClientRect()
    );
    pointerDragStartRef.current = { x: pt.x, y: pt.y };
    coordinator.onAimPointerDown(pt.x, pt.y, useGameStore.getState().setManualAimTarget);
    setAimReticle(coordinator.getAimReticleOverlay());
  };

  const handleCanvasPointerMove = (e: PointerEvent<HTMLCanvasElement>) => {
    const coordinator = combatCoordinatorRef.current;
    if (!coordinator) return;
    const pt = clientToZoneB(
      e.clientX,
      e.clientY,
      e.currentTarget.getBoundingClientRect()
    );
    if (pointerDragStartRef.current && !hasUsedWeakPointAim) {
      const dist = Math.hypot(
        pt.x - pointerDragStartRef.current.x,
        pt.y - pointerDragStartRef.current.y
      );
      if (dist > 6) {
        setHasUsedWeakPointAim(true);
        try {
          window.localStorage.setItem(WEAKPOINT_HINT_STORAGE_KEY, '1');
        } catch {
          // Ignore storage errors
        }
      }
    }
    coordinator.onAimPointerMove(pt.x, pt.y, useGameStore.getState().setManualAimTarget);
  };

  const handleCanvasPointerUp = () => {
    pointerDragStartRef.current = null;
    const coordinator = combatCoordinatorRef.current;
    if (!coordinator) return;
    coordinator.onAimPointerUp();
    setAimReticle(coordinator.getAimReticleOverlay());
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || adSimOpenRef.current) {
        return;
      }
      const target = e.target;
      if (
        target instanceof HTMLElement &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }

      const coordinator = combatCoordinatorRef.current;
      const store = useGameStore.getState();
      const stateId = fsm.getCurrentStateId();
      const combatActive =
        stateId !== null &&
        stateId !== 'OASIS_HUB' &&
        stateId !== 'OASIS_SETTLEMENT' &&
        stateId !== 'EMERGENCY_REVIVE' &&
        store.sandwalker.currentHp > 0;

      if (e.key === '1') {
        handleTurretSwitch('HEAT_RAY');
      } else if (e.key === '2') {
        handleTurretSwitch('HARPOON');
      } else if (e.key === '3') {
        handleTurretSwitch('MORTAR');
      } else if (e.key === ' ') {
        e.preventDefault();
        if (combatActive && coordinator?.activateDodgeBoost(store, stateId)) {
          triggerHaptic(18);
          const ds = coordinator.getDodgeState();
          setDodgeUi({
            active: ds.active,
            cooldownRemainingSec: ds.cooldownRemainingSec,
            cooldownRatio: ds.cooldownRatio,
          });
        }
      } else if (e.key === 'e' || e.key === 'E' || e.key === '4') {
        if (combatActive && coordinator?.activateSolarShield(store, store, stateId)) {
          triggerHaptic(20);
          const ss = coordinator.getSolarShieldCooldownState();
          setShieldUi({
            cooldownRemainingSec: ss.cooldownRemainingSec,
            cooldownRatio: ss.cooldownRatio,
          });
        }
      } else if (e.key === 'q' || e.key === 'Q') {
        setActiveTab((prev) => {
          const idx = GROWTH_TABS.indexOf(prev);
          return GROWTH_TABS[(idx + GROWTH_TABS.length - 1) % GROWTH_TABS.length];
        });
      } else if (e.key === 'r' || e.key === 'R') {
        setActiveTab((prev) => {
          const idx = GROWTH_TABS.indexOf(prev);
          return GROWTH_TABS[(idx + 1) % GROWTH_TABS.length];
        });
      } else if (e.key === 'f' || e.key === 'F') {
        if (isFullscreenSupported()) {
          e.preventDefault();
          void toggleFullscreen().then((active) => {
            setIsFullscreen(active);
          });
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [fsm]);

  const claimOfflineReward = (is2x: boolean) => {
    if (!offlineReward) return;
    const goldEarned = is2x ? offlineReward.zafarGold : offlineReward.gold;
    addCurrencies({ sunGold: goldEarned });
    setOfflineReward(null);
  };

  const handleOfflineZafar2x = () => {
    const store = useGameStore.getState();
    store.resetDailySkipTickets();
    const latestState = useGameStore.getState();
    const result = processRewardedAdRequest(latestState, 'ZAFAR_2X');

    if (result.granted) {
      if (result.usedTicket) {
        useGameStore.getState().consumeDailySkipTicket();
      }
      claimOfflineReward(true);
    } else {
      adSimulator.showRewarded(result.simulationDurationSeconds, () => {
        claimOfflineReward(true);
      });
    }
  };

  const handleActivateRelayTower = () => {
    if (relayAdPendingRef.current || adSimOpenRef.current) {
      return;
    }

    const store = useGameStore.getState();
    const stateId = fsm.getCurrentStateId();
    if (
      !hazardSystem.isRelayTowerAvailable(
        stateId,
        store.meta.currentAct,
        store.meta.currentOasisIndex,
        Boolean(store.endgame?.endlessActive),
        store.endgame?.currentDepth ?? 1
      )
    ) {
      return;
    }

    relayAdPendingRef.current = true;
    setRelayAdPending(true);

    store.resetDailySkipTickets();
    const latestState = useGameStore.getState();
    const result = processRewardedAdRequest(latestState, 'SOLAR_RELAY');

    const applyRelay = () => {
      relayAdPendingRef.current = false;
      setRelayAdPending(false);
      const current = useGameStore.getState();
      const activeStateId = fsm.getCurrentStateId();
      if (
        !hazardSystem.isRelayTowerAvailable(
          activeStateId,
          current.meta.currentAct,
          current.meta.currentOasisIndex,
          Boolean(current.endgame?.endlessActive),
          current.endgame?.currentDepth ?? 1
        )
      ) {
        setRelayBannerVisible(false);
        return;
      }
      hazardSystem.activateSolarRelay(current, fsm);
      setRelayBannerVisible(false);
    };

    if (result.granted) {
      if (result.usedTicket) {
        useGameStore.getState().consumeDailySkipTicket();
      }
      applyRelay();
    } else {
      adSimulator.showRewarded(result.simulationDurationSeconds, applyRelay);
    }
  };

  const handleAcceptEmergencyRevive = () => {
    if (reviveAdPending) return;
    setReviveAdPending(true);
    emergencyReviveState.pauseCountdown(fsm);

    const store = useGameStore.getState();
    store.resetDailySkipTickets();
    const latestState = useGameStore.getState();
    const result = processRewardedAdRequest(latestState, 'EMERGENCY_REVIVE');

    const completeRevive = () => {
      setReviveAdPending(false);
      emergencyReviveState.acceptRevive(fsm);
    };

    if (result.granted) {
      if (result.usedTicket) {
        useGameStore.getState().consumeDailySkipTicket();
      }
      completeRevive();
    } else {
      adSimulator.showRewarded(result.simulationDurationSeconds, completeRevive);
    }
  };

  const handleRetreatEmergencyRevive = () => {
    if (reviveAdPending) return;
    emergencyReviveState.retreat(fsm);
  };

  const handleSettlementZafar2x = () => {
    if (zafar2xClaimed || oasisSettlementState.zafarClaimed || settlementProfit <= 0) {
      return;
    }
    const store = useGameStore.getState();
    store.resetDailySkipTickets();
    const latestState = useGameStore.getState();
    const result = processRewardedAdRequest(latestState, 'ZAFAR_2X');

    const applyZafar = () => {
      const gained = oasisSettlementState.claimZafar2x();
      if (gained > 0) {
        setZafar2xClaimed(true);
      }
    };

    if (result.granted) {
      if (result.usedTicket) {
        useGameStore.getState().consumeDailySkipTicket();
      }
      applyZafar();
    } else {
      adSimulator.showRewarded(result.simulationDurationSeconds, applyZafar);
    }
  };

  const handleZafarCall = () => {
    const store = useGameStore.getState();
    store.resetDailySkipTickets();
    const latestState = useGameStore.getState();
    const result = processRewardedAdRequest(latestState, 'ZAFAR_2X');
    const grantZafarBonus = () => {
      const nextRate = Math.min(3.0, Math.max(2.0, store.trade.nextOasisPriceRate + 0.5));
      useGameStore.getState().setNextOasisPriceRate(Math.round(nextRate * 100) / 100);
      useGameStore.getState().addCurrencies({ sunGold: 50 });
    };
    if (result.granted) {
      if (result.usedTicket) {
        useGameStore.getState().consumeDailySkipTicket();
      }
      grantZafarBonus();
    } else {
      adSimulator.showRewarded(result.simulationDurationSeconds, grantZafarBonus);
    }
  };

  const handleAppraiseReadyRelic = () => {
    triggerHaptic(15);
    excavationSystem.appraiseReadyRelic(useGameStore.getState());
  };

  const handleAppraiseRelicAd = () => {
    if (relicAdPending || adSimOpenRef.current) return;
    const store = useGameStore.getState();
    if (store.relics.pending.length === 0) return;

    setRelicAdPending(true);
    store.resetDailySkipTickets();
    const latestState = useGameStore.getState();
    const result = processRewardedAdRequest(latestState, 'RELIC_APPRAISAL');

    const finalize = () => {
      setRelicAdPending(false);
      excavationSystem.appraisePendingRelicByAd(useGameStore.getState());
    };

    if (result.granted) {
      if (result.usedTicket) {
        useGameStore.getState().consumeDailySkipTicket();
      }
      finalize();
    } else {
      adSimulator.showRewarded(result.simulationDurationSeconds, finalize);
    }
  };

  const handleMerchantRerollAd = () => {
    if (merchantRerollPending || adSimOpenRef.current) return;
    const store = useGameStore.getState();
    setMerchantRerollPending(true);
    store.resetDailySkipTickets();
    const latestState = useGameStore.getState();
    const result = processRewardedAdRequest(latestState, 'MERCHANT_REROLL');

    const finalize = () => {
      setMerchantRerollPending(false);
      wanderingMerchantSystem.rerollOffers(
        latestState.meta.currentOasisIndex,
        latestState.meta.currentAct,
        true
      );
      setMerchantRefreshTick((n) => n + 1);
    };

    if (result.granted) {
      if (result.usedTicket) {
        useGameStore.getState().consumeDailySkipTicket();
      }
      finalize();
    } else {
      adSimulator.showRewarded(result.simulationDurationSeconds, finalize);
    }
  };

  const handleExpeditionBurst = () => {
    const coordinator = combatCoordinatorRef.current;
    if (!coordinator) return;
    const store = useGameStore.getState();
    if (
      coordinator.triggerExpeditionBurst(
        store,
        store,
        fsm.getCurrentStateId(),
        particlePoolRef.current ?? undefined,
        cameraSystemRef.current ?? undefined
      )
    ) {
      const bs = coordinator.getExpeditionBurstState();
      setExpeditionBurstUi({
        ready: bs.ready,
        cooldownRemainingSec: bs.cooldownRemainingSec,
        cooldownRatio: bs.cooldownRatio,
        count: bs.count,
      });
    }
  };

  const merchantOffers = useMemo(
    () => wanderingMerchantSystem.getOffers(currentOasisIndex, currentAct),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [wanderingMerchantSystem, currentOasisIndex, currentAct, merchantRefreshTick]
  );

  const oasisDef = getOasisDefinition(currentOasisIndex);
  const usedCargoUnits = cargo.reduce((sum, item) => sum + item.qty, 0);
  const parsedTradeQty = parseInt(tradeQtyInput, 10);
  const canBuyTypedQty =
    Number.isInteger(parsedTradeQty) &&
    parsedTradeQty > 0 &&
    usedCargoUnits + parsedTradeQty <= cargoCapacity &&
    sunGold >= parsedTradeQty * oasisDef.specialty.buyPrice;
  const maxBuyableUnits = Math.min(
    Math.max(0, cargoCapacity - usedCargoUnits),
    Math.floor(sunGold / Math.max(1, oasisDef.specialty.buyPrice))
  );

  const activeTurretLv = turretLevels[activeTurret] ?? 1;
  const activeTurretTier = turretTiers[activeTurret] ?? 1;
  const turretGoldCost = upgradeCost(activeTurretLv);
  const turretTierCap = activeTurretTier * 10;
  const canUpgradeTurret =
    activeTurretLv < 30 && activeTurretLv < turretTierCap && sunGold >= turretGoldCost;
  const tierUpCost = tierUpGearCost(activeTurretTier);
  const canTierUpTurret =
    activeTurretTier < 3 &&
    activeTurretLv >= turretTierCap &&
    ancientGear >= tierUpCost;

  const legCost = upgradeCost(legPartLevel);
  const canUpgradeLeg = legPartLevel < 20 && sunGold >= legCost;

  const wagonGearCost = 5 * wagonCount;
  const canAddWagon = wagonCount < 5 && ancientGear >= wagonGearCost;

  const unlockedMercCount = mercenaries.filter((m) => m.isUnlocked).length;
  const surgePercent = Math.round(nextOasisPriceRate * 100);
  const codexBonuses = useMemo(
    () => computeRelicCodexBonuses(relicCodex, explorerPassives),
    [relicCodex, explorerPassives]
  );
  const completedQuestIds = questsState?.completedIds ?? [];
  const urgentDelivery = questsState?.urgentDelivery;
  const urgentRemainingSec = urgentDelivery?.active
    ? Math.max(0, urgentDelivery.timeLimitSec - (totalPlaySeconds - urgentDelivery.startedAtPlaySec))
    : 0;
  const surgeJackpot = isSurgeJackpot(nextOasisPriceRate);
  const hasReadyRelic = pendingRelics.some((r) => r.appraiseEndsAt <= codexNowMs);
  const templeGate = useMemo(
    () => evaluateTempleGate({ mapFragments, templeKeys }),
    [mapFragments, templeKeys]
  );
  const depthMods = useMemo(
    () => getDepthModifiers(endgame?.currentDepth ?? 1),
    [endgame?.currentDepth]
  );
  const totalEnemyKills = progression
    ? progression.counters.killsByTurret.HEAT_RAY +
      progression.counters.killsByTurret.HARPOON +
      progression.counters.killsByTurret.MORTAR
    : 0;

  const isTacticalCombatState =
    currentFsmState !== 'OASIS_HUB' &&
    currentFsmState !== 'OASIS_SETTLEMENT' &&
    currentFsmState !== 'EMERGENCY_REVIVE' &&
    hpStatus.currentHp > 0;

  return (
    <>
      <DebugBar />
      <div className="portrait-rotate-hint" data-testid="portrait-rotate-hint">
        📱 가로 화면으로 회전하면 더 넓게 즐길 수 있습니다
      </div>
      <div className="desktop-shortcut-legend" data-testid="desktop-shortcut-legend">
        [1/2/3] 포탑 · [Space] 회피 · [E] 보호막 · [Q/R] 탭 · [F] 전체화면 · 드래그 약점 조준
      </div>

      <div
        className="viewport-shell"
        data-testid="viewport-shell"
        style={{
          transform: `translate(-50%, -50%) scale(${scale})`,
        }}
      >
        {/* ZONE A: Slim Horizontal Top HUD Bar (960 × 56px) */}
        <section className="zone-a" data-testid="zone-a">
          <div className="zone-a-row-top">
            <div className="zone-a-route">
              <span data-testid="hud-oasis-name">
                [출발] {routeDef.fromOasisName} ➔ [도착] {routeDef.toOasisName}
              </span>
              <span data-testid="hud-act-badge" className="hud-act-badge">
                {endgame?.endlessActive
                  ? `심층 D${endgame.currentDepth}`
                  : `Act ${currentAct}`}
              </span>
            </div>

            <div className="zone-a-progress-wrap">
              <div className="zone-a-progress-label">
                <span>행군</span>
                <span data-testid="hud-actual-speed" className="hud-actual-speed">
                  {actualSpeedPx} px/s
                </span>
                <span data-testid="hud-route-progress">
                  {routeProgress.toFixed(1)}% (
                  {Math.round((routeProgress / 100) * routeDef.routeLengthPx)}m /{' '}
                  {routeDef.routeLengthPx.toLocaleString()}m)
                </span>
              </div>
              <div className="zone-a-progress-bar">
                <div
                  className="zone-a-progress-fill"
                  style={{ width: `${routeProgress}%` }}
                />
              </div>
            </div>

            <div className="zone-a-hp-row">
              <span data-testid="hud-sandwalker-hp" className="hud-sandwalker-hp">
                HP {Math.round(hpStatus.currentHp)}/{hpStatus.maxHp}
              </span>
              <span data-testid="hud-solar-shield" className="hud-solar-shield">
                🛡️ {Math.round(hpStatus.solarShieldHp)}
              </span>
              <div className="zone-a-hp-bar">
                <div
                  className="zone-a-hp-fill"
                  style={{
                    width: `${Math.max(0, Math.min(100, hpStatus.hpPercent))}%`,
                  }}
                />
              </div>
            </div>
          </div>

          <div className="zone-a-row-bottom">
            <div className="zone-a-currencies">
              <span data-testid="hud-currency-gold">🪙 {sunGold.toLocaleString()} G</span>
              <span data-testid="hud-currency-gears">⚙️ {ancientGear}</span>
              <span data-testid="hud-currency-fragments" className="hud-currency-fragments">
                🗺️ {mapFragments}/10
              </span>
              <span data-testid="hud-currency-keys">🗝️ {templeKeys}/3</span>
            </div>

            <div className="zone-a-badges">
              <span className="badge badge-surge" data-testid="hud-surge-badge">
                시세 +{surgePercent}%
              </span>
              <span className="badge badge-tier" data-testid="hud-ad-tier-badge">
                VIP T{adTier}
              </span>
              {synergyActive && (
                <span className="badge badge-synergy" data-testid="hud-synergy-badge">
                  ✦ 결속 +25%ATK/+20%G
                </span>
              )}
              <span
                className="badge badge-fsm"
                data-testid="hud-fsm-badge"
                data-fsm-state={currentFsmState}
              >
                {FSM_STATE_LABELS[currentFsmState as GameStateId] ?? currentFsmState}
              </span>
              <button
                type="button"
                className="hud-mute-btn"
                data-testid="hud-mute-btn"
                aria-label={isMuted ? '효과음 켜기' : '효과음 끄기'}
                onClick={handleToggleMute}
              >
                {isMuted ? '🔇' : '🔊'}
              </button>
              <button
                type="button"
                className="hud-settings-btn"
                data-testid="hud-settings-btn"
                aria-label="설정 열기"
                title="환경 설정"
                onClick={() => {
                  triggerHaptic(10);
                  setSettingsOpen(true);
                }}
              >
                🎛️
              </button>
              {fullscreenSupported && (
                <button
                  type="button"
                  className={`hud-fullscreen-btn${isFullscreen ? ' active' : ''}`}
                  data-testid="hud-fullscreen-btn"
                  data-fullscreen={isFullscreen ? 'true' : 'false'}
                  aria-label={isFullscreen ? '전체화면 종료' : '전체화면'}
                  title={isFullscreen ? '전체화면 종료 (F / Esc)' : '전체화면 (F)'}
                  onClick={handleToggleFullscreen}
                >
                  {isFullscreen ? '❐' : '⛶'}
                </button>
              )}
            </div>
          </div>
        </section>

        {/* Main L-Shape Body: Left (Battlefield + Tactical Bar) & Right (Growth Panel) */}
        <div className="viewport-body">
          <div className="landscape-main">
            {/* ZONE B: Canvas 2D Battlefield (680 × 412px) */}
            <section className="zone-b" data-testid="zone-b">
          <canvas
            ref={canvasRef}
            className="zone-b-canvas"
            data-testid="game-canvas"
            onPointerDown={handleCanvasPointerDown}
            onPointerMove={handleCanvasPointerMove}
            onPointerUp={handleCanvasPointerUp}
            onPointerCancel={handleCanvasPointerUp}
          />
          {aimReticle.visible && (
            <div
              data-testid="aim-reticle"
              className={`aim-reticle-overlay ${aimReticle.locked ? 'locked' : ''}`}
              style={{
                left: `${aimReticle.x}px`,
                top: `${aimReticle.y}px`,
              }}
            />
          )}

          {/* Dialogue Balloon Overlays (strictly <= 35 codepoints & top band < 240 shell Y) */}
          {uiBalloons.map((b) => (
            <div
              key={b.id}
              data-testid="dialogue-bubble"
              data-speaker={b.speaker}
              className="dialogue-bubble"
              style={{
                top: `${b.y}px`,
                opacity: b.alpha,
              }}
            >
              {b.text}
            </div>
          ))}

          {/* Opening Hook Overlays */}
          {currentFsmState === 'OPENING_HOOK' && (
            <>
              <div data-testid="intro-phase-badge" className="intro-phase-badge">
                {openingPhaseInfo.badgeText}
              </div>
              {openingPhaseInfo.phase === 1 && (
                <button
                  data-testid="overload-skill-btn"
                  className="overload-skill-btn"
                  onClick={handleOverloadSkill}
                >
                  ⚡ 전탄 과부하 발동
                </button>
              )}
              {openingPhaseInfo.phase === 2 && (
                <button
                  data-testid="emergency-escape-btn"
                  className="emergency-escape-btn"
                  onClick={() => openingHookState.triggerEmergencyEscape(fsm)}
                >
                  ⚡ 긴급 탈출 기동
                </button>
              )}
              {openingPhaseInfo.phase === 3 && (
                <div
                  data-testid="tutorial-turret-prompt"
                  className="tutorial-turret-prompt"
                >
                  💡 하단 [2] 작살 버튼을 눌러 중장갑 적을 제압하세요!
                </div>
              )}
              {introSeenState && (
                <button
                  data-testid="skip-intro-btn"
                  className="skip-intro-btn"
                  onClick={() => openingHookState.skipIntro(fsm)}
                >
                  건너뛰기 ⏭️
                </button>
              )}
            </>
          )}

          {autoUpgradeToast && (
            <div data-testid="auto-upgrade-toast" className="auto-upgrade-toast">
              ⚡ <strong>{autoUpgradeToast.targetLabel}</strong> {autoUpgradeToast.fromValue} ➔{' '}
              {autoUpgradeToast.toValue} · <span>{autoUpgradeToast.triggerReason}</span>
            </div>
          )}

          {/* Oasis Hub Sortie CTA */}
          {currentFsmState === 'OASIS_HUB' && (
            <>
              {currentAct === 4 &&
                currentOasisIndex >= 11 &&
                !endgame?.endingCompleted && (
                  <div className="temple-gate-banner" data-testid="temple-gate-banner">
                    <span>
                      ⛩️ 태양 신전 봉인: 지도 조각 {templeGate.mapFragments}/10 · 열쇠{' '}
                      {templeGate.templeKeys}/3
                    </span>
                    {!templeGate.canUnlock && (
                      <span className="dash-sub"> · {templeGate.missingGuides[0]}</span>
                    )}
                  </div>
                )}
              <button
                data-testid="sortie-btn"
                className="sortie-btn"
                onClick={handleSortie}
              >
                🚩 출격하기
              </button>
            </>
          )}

          {relayBannerVisible && (
            <div data-testid="relay-tower-banner" className="relay-tower-banner">
              <span className="relay-tower-text">☀️ 고대 태양광 중계탑 발견</span>
              <button
                data-testid="relay-activate-btn"
                className="relay-activate-btn"
                disabled={relayAdPending || adSimState.isOpen}
                onClick={handleActivateRelayTower}
              >
                가동 (실드 +50% · 진행 +30%)
              </button>
            </div>
          )}

          {!hasUsedWeakPointAim &&
            (currentFsmState === 'MARCH_NORMAL' || currentFsmState === 'BOSS_ENCOUNTER') &&
            !relayBannerVisible && (
              <div data-testid="weakpoint-aim-hint" className="weakpoint-aim-hint">
                🎯 적의 붉은 약점을 드래그해 조준하면 치명타 2.0x!
              </div>
            )}

          {currentFsmState === 'BOSS_ENCOUNTER' && bossHud && (
            <div data-testid="boss-hud" className="boss-hud">
              <div className="boss-hud-header">
                <span data-testid="boss-name" className="boss-name">
                  {bossHud.name}
                </span>
                <div className="boss-hud-badges">
                  {bossHud.specialKind && (
                    <span data-testid="boss-special-badge" className="boss-special-badge">
                      {bossHud.specialKind === 'SMOKE_RUSH'
                        ? '연막 돌진'
                        : bossHud.specialKind === 'VENOM_BARRAGE'
                          ? '독침 광역기'
                          : '분신 스왑'}
                    </span>
                  )}
                  {bossHud.isGroggy && (
                    <span data-testid="boss-groggy-badge" className="boss-groggy-badge">
                      ⚡ GROGGY
                    </span>
                  )}
                  <span data-testid="boss-phase-badge" className="boss-phase-badge">
                    Phase {bossHud.phase}/{bossHud.maxPhase}
                  </span>
                </div>
              </div>
              <div
                data-testid="boss-hp-bar"
                className="boss-hp-bar"
                role="progressbar"
                aria-valuenow={Math.round(bossHud.hp)}
                aria-valuemax={bossHud.maxHp}
              >
                <div
                  className="boss-hp-fill"
                  style={{
                    width: `${
                      bossHud.maxHp > 0
                        ? Math.max(0, Math.min(100, (bossHud.hp / bossHud.maxHp) * 100))
                        : 0
                    }%`,
                  }}
                />
              </div>
              {bossHud.maxArmor > 0 && (
                <div
                  data-testid="boss-armor-bar"
                  className="boss-armor-bar"
                  role="progressbar"
                  aria-valuenow={Math.round(bossHud.armor)}
                  aria-valuemax={bossHud.maxArmor}
                >
                  <div
                    className="boss-armor-fill"
                    style={{
                      width: `${Math.max(
                        0,
                        Math.min(100, (bossHud.armor / bossHud.maxArmor) * 100)
                      )}%`,
                    }}
                  />
                </div>
              )}
              {bossHud.telegraphActive && (
                <div
                  data-testid="boss-telegraph-warning"
                  className="boss-telegraph-warning"
                >
                  ⚠️ 강공격 예고! 회피 부스트로 회피하세요!
                </div>
              )}
            </div>
          )}
            </section>

            {/* Zone C-1: Tactical Intervention Bar (680 × 72px) */}
            <div className="zone-c-tactical" data-testid="zone-c-tactical">
              <button
                data-testid="turret-btn-heat-ray"
                className={`turret-btn ${activeTurret === 'HEAT_RAY' ? 'active' : ''}`}
                onClick={() => handleTurretSwitch('HEAT_RAY')}
              >
                <span>[1] 열선</span>
                <span className="turret-sub-label">코어/정령 2.0x</span>
                {turretSwitchCdRatio > 0 && (
                  <span
                    data-testid="turret-cooldown-badge"
                    className="turret-btn-cooldown-bar"
                    style={{ width: `${Math.round(turretSwitchCdRatio * 100)}%` }}
                  />
                )}
              </button>
              <button
                data-testid="turret-btn-harpoon"
                className={`turret-btn ${activeTurret === 'HARPOON' ? 'active' : ''}`}
                onClick={() => handleTurretSwitch('HARPOON')}
              >
                <span>[2] 작살</span>
                <span className="turret-sub-label">장갑/외피 2.2x</span>
                {turretSwitchCdRatio > 0 && (
                  <span
                    data-testid="turret-cooldown-badge"
                    className="turret-btn-cooldown-bar"
                    style={{ width: `${Math.round(turretSwitchCdRatio * 100)}%` }}
                  />
                )}
              </button>
              <button
                data-testid="turret-btn-mortar"
                className={`turret-btn ${activeTurret === 'MORTAR' ? 'active' : ''}`}
                onClick={() => handleTurretSwitch('MORTAR')}
              >
                <span>[3] 박격포</span>
                <span className="turret-sub-label">군집/기생 2.2x</span>
                {turretSwitchCdRatio > 0 && (
                  <span
                    data-testid="turret-cooldown-badge"
                    className="turret-btn-cooldown-bar"
                    style={{ width: `${Math.round(turretSwitchCdRatio * 100)}%` }}
                  />
                )}
              </button>
              <button
                className={`action-btn dodge ${dodgeUi.active ? 'active' : ''}`}
                data-testid="dodge-boost-btn"
                data-active={dodgeUi.active ? 'true' : 'false'}
                data-cooldown={formatCooldownSec(dodgeUi.cooldownRemainingSec)}
                disabled={
                  !isTacticalCombatState ||
                  dodgeUi.active ||
                  dodgeUi.cooldownRemainingSec > 0
                }
                onClick={handleDodgeBoost}
              >
                <span>
                  {dodgeUi.active
                    ? '회피 중!'
                    : dodgeUi.cooldownRemainingSec > 0
                      ? `회피 ${formatCooldownSec(dodgeUi.cooldownRemainingSec)}s`
                      : '회피'}
                </span>
                <span className="turret-sub-label">[Space]</span>
                {dodgeUi.cooldownRatio > 0 && (
                  <span
                    className="turret-btn-cooldown-bar"
                    style={{ width: `${Math.round(dodgeUi.cooldownRatio * 100)}%` }}
                  />
                )}
              </button>
              <button
                className={`action-btn shield ${hpStatus.solarShieldHp > 0 ? 'active' : ''}`}
                data-testid="solar-shield-btn"
                data-active={hpStatus.solarShieldHp > 0 ? 'true' : 'false'}
                data-cooldown={formatCooldownSec(shieldUi.cooldownRemainingSec)}
                disabled={!isTacticalCombatState || shieldUi.cooldownRemainingSec > 0}
                onClick={handleSolarShield}
              >
                <span>
                  {shieldUi.cooldownRemainingSec > 0
                    ? `보호막 ${formatCooldownSec(shieldUi.cooldownRemainingSec)}s`
                    : '보호막'}
                </span>
                <span className="turret-sub-label">[E]</span>
                {shieldUi.cooldownRatio > 0 && (
                  <span
                    className="turret-btn-cooldown-bar"
                    style={{ width: `${Math.round(shieldUi.cooldownRatio * 100)}%` }}
                  />
                )}
              </button>
            </div>
          </div>

          {/* ZONE C: Right Growth Dashboard Side Panel (280 × 484px) */}
          <section className="zone-c" data-testid="zone-c">
            {/* Row 2: Growth Tabs Header */}
          <div className="zone-c-tabs">
            <button
              data-testid="tab-btn-mech"
              className={`tab-btn ${activeTab === 'MECH' ? 'active' : ''}`}
              onClick={() => setActiveTab('MECH')}
            >
              기체 개조
            </button>
            <button
              data-testid="tab-btn-mercenaries"
              className={`tab-btn ${activeTab === 'MERCENARIES' ? 'active' : ''}`}
              onClick={() => setActiveTab('MERCENARIES')}
            >
              5인 용병단
            </button>
            <button
              data-testid="tab-btn-trading"
              className={`tab-btn ${activeTab === 'TRADE' ? 'active' : ''}`}
              onClick={() => setActiveTab('TRADE')}
            >
              상단 교역소
            </button>
            <button
              data-testid="tab-btn-codex"
              className={`tab-btn ${activeTab === 'RELICS' ? 'active' : ''}`}
              onClick={() => setActiveTab('RELICS')}
            >
              유물·도감
              {hasReadyRelic && (
                <span data-testid="codex-ready-dot" className="codex-ready-dot" />
              )}
            </button>
          </div>

          {/* Tab Content Area */}
          <div className="zone-c-content" data-testid="zone-c-content">
            {activeTab === 'MECH' && (
              <div className="tab-placeholder-card">
                <div
                  className="card-title"
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                >
                  <span>기체 개조</span>
                  <div className="dash-actions" style={{ flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    <button
                      data-testid="btn-equip-skin-pharaoh"
                      className={`dash-btn ${equippedSkinId === 'GOLDEN_PHARAOH' ? 'skin-active' : 'secondary'}`}
                      onClick={() => {
                        triggerHaptic(12);
                        useGameStore
                          .getState()
                          .setSkin(
                            equippedSkinId === 'GOLDEN_PHARAOH'
                              ? 'DEFAULT'
                              : 'GOLDEN_PHARAOH'
                          );
                      }}
                    >
                      {equippedSkinId === 'GOLDEN_PHARAOH'
                        ? '👑 황금 파라오 중'
                        : '👑 황금 파라오'}
                    </button>
                    <button
                      data-testid="btn-equip-skin-royal-silk"
                      className={`dash-btn ${equippedSkinId === 'ROYAL_SILK' ? 'skin-active' : 'secondary'}`}
                      onClick={() => {
                        triggerHaptic(12);
                        useGameStore
                          .getState()
                          .setSkin(
                            equippedSkinId === 'ROYAL_SILK' ? 'DEFAULT' : 'ROYAL_SILK'
                          );
                      }}
                    >
                      {equippedSkinId === 'ROYAL_SILK'
                        ? '🧣 왕실 비단 중'
                        : '🧣 왕실 비단'}
                    </button>
                  </div>
                </div>

                {/* Auto-Upgrade Policy & Passive Summary */}
                <div className="auto-policy-row">
                  <div className="auto-policy-label">
                    <span>⚡ 자동 성장</span>
                    <span className="dash-sub" data-testid="explorer-passives-summary">
                      감정 {explorerPassives?.appraisalLv ?? 1} · 생존{' '}
                      {explorerPassives?.survivalLv ?? 1} · 비석 {explorerPassives?.linguisticsLv ?? 1}
                    </span>
                  </div>
                  <select
                    data-testid="auto-invest-policy-select"
                    className="auto-policy-select"
                    value={progression?.autoInvestPolicy ?? 'MANUAL'}
                    onChange={(e) => {
                      const policy = e.target.value as AutoInvestPolicy;
                      useGameStore.getState().setAutoInvestPolicy(policy);
                      autoUpgradeEngine.tryAutoInvest(useGameStore.getState());
                    }}
                  >
                    <option value="MANUAL">수동 골드 (조건·전리품만 자동)</option>
                    <option value="BALANCED">균형 자동 투자</option>
                    <option value="COMBAT">전투 우선 자동 투자</option>
                    <option value="ECONOMY">경제·기동 자동 투자</option>
                  </select>
                </div>

                {/* Active Turret Row */}
                <div className="dash-row">
                  <div className="dash-info">
                    <div>
                      <strong>주포 [{TURRET_LABELS[activeTurret]}]</strong>{' '}
                      <span data-testid="turret-level-text">Lv.{activeTurretLv}</span> /{' '}
                      <span data-testid="turret-tier-text">Tier {activeTurretTier}</span>
                    </div>
                    <div className="dash-sub">
                      강화 비용:{' '}
                      <span data-testid="turret-upgrade-cost">
                        {activeTurretLv >= 30 ? 'MAX' : `${turretGoldCost}G`}
                      </span>{' '}
                      (상한 Lv.{turretTierCap})
                    </div>
                    {(() => {
                      const ms = getNextMilestoneSummary(fullGameState, 'TURRET', activeTurret);
                      if (!ms) return null;
                      return (
                        <div className="auto-progress-wrap" data-testid="turret-auto-progress">
                          <span>
                            {ms.title} ({ms.current}/{ms.target})
                          </span>
                          <div className="auto-progress-bar">
                            <div
                              className="auto-progress-fill"
                              style={{ width: `${Math.round(ms.ratio * 100)}%` }}
                            />
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                  <div className="dash-actions">
                    <button
                      data-testid="btn-upgrade-turret"
                      className="dash-btn"
                      disabled={!canUpgradeTurret}
                      onClick={() => {
                        if (useGameStore.getState().upgradeTurret(activeTurret)) {
                          triggerHaptic(15);
                        }
                      }}
                    >
                      포탑 강화
                    </button>
                    <button
                      data-testid="btn-tier-up-turret"
                      className="dash-btn secondary"
                      disabled={!canTierUpTurret}
                      onClick={() => {
                        if (useGameStore.getState().tierUpTurret(activeTurret)) {
                          triggerHaptic(25);
                        }
                      }}
                    >
                      포탑 승급 ({activeTurretTier >= 3 ? 'MAX' : `${tierUpCost}⚙️`})
                    </button>
                  </div>
                </div>

                {/* Leg Part Row */}
                <div className="dash-row">
                  <div className="dash-info">
                    <div>
                      <strong>다리 구동부</strong>{' '}
                      <span data-testid="leg-level-text">Lv.{legPartLevel}</span>
                    </div>
                    <div className="dash-sub">
                      유사 감속 무시{' '}
                      {legPartLevel >= 11
                        ? '100% 면역'
                        : `${Math.round(quicksandIgnore(legPartLevel) * 100)}%`}{' '}
                      · 비용{' '}
                      <span data-testid="leg-upgrade-cost">
                        {legPartLevel >= 20 ? 'MAX' : `${legCost}G`}
                      </span>
                    </div>
                    {(() => {
                      const ms = getNextMilestoneSummary(fullGameState, 'LEG');
                      if (!ms) return null;
                      return (
                        <div className="auto-progress-wrap" data-testid="leg-auto-progress">
                          <span>
                            {ms.title} ({ms.current}/{ms.target})
                          </span>
                          <div className="auto-progress-bar">
                            <div
                              className="auto-progress-fill"
                              style={{ width: `${Math.round(ms.ratio * 100)}%` }}
                            />
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                  <div className="dash-actions">
                    <button
                      data-testid="btn-upgrade-legs"
                      className="dash-btn"
                      disabled={!canUpgradeLeg}
                      onClick={() => {
                        if (useGameStore.getState().upgradeLeg()) {
                          triggerHaptic(15);
                        }
                      }}
                    >
                      다리 강화
                    </button>
                  </div>
                </div>

                {/* Wagon Expansion Row */}
                <div className="dash-row">
                  <div className="dash-info">
                    <div>
                      <strong>화물 마차</strong>{' '}
                      <span data-testid="wagon-count-text">
                        {wagonCount}대 (적재 한도 {cargoCapacity} / 방치 금화{' '}
                        {wagonCount * 2}G/분)
                      </span>
                    </div>
                    <div className="dash-sub">
                      증설 비용:{' '}
                      <span data-testid="wagon-upgrade-cost">
                        {wagonCount >= 5 ? 'MAX' : `${wagonGearCost}⚙️`}
                      </span>
                    </div>
                    {(() => {
                      const ms = getNextMilestoneSummary(fullGameState, 'WAGON');
                      if (!ms) return null;
                      return (
                        <div className="auto-progress-wrap" data-testid="wagon-auto-progress">
                          <span>
                            {ms.title} ({ms.current}/{ms.target})
                          </span>
                          <div className="auto-progress-bar">
                            <div
                              className="auto-progress-fill"
                              style={{ width: `${Math.round(ms.ratio * 100)}%` }}
                            />
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                  <div className="dash-actions">
                    <button
                      data-testid="btn-add-wagon"
                      className="dash-btn secondary"
                      disabled={!canAddWagon}
                      onClick={() => {
                        if (useGameStore.getState().addWagon()) {
                          triggerHaptic(20);
                        }
                      }}
                    >
                      마차 증설
                    </button>
                  </div>
                </div>

                {/* Recent Auto-Upgrade Feed */}
                <div className="auto-upgrade-feed" data-testid="auto-upgrade-feed">
                  {progression && progression.recentAutoUpgrades.length > 0 ? (
                    progression.recentAutoUpgrades.slice(0, 3).map((ev) => (
                      <div key={ev.id} className="auto-upgrade-feed-item">
                        <span>
                          ⚡ <strong>{ev.targetLabel}</strong> {ev.fromValue}➔{ev.toValue}
                        </span>
                        <span className="dash-sub">{ev.triggerReason}</span>
                      </div>
                    ))
                  ) : (
                    <div className="dash-sub">
                      전투 전리품·비석·마일스톤 달성 시 자동 강화 내역이 기록됩니다.
                    </div>
                  )}
                </div>

                {/* Sun Temple Gate (Act 4 before ending) */}
                {currentAct === 4 && !endgame?.endingCompleted && (
                  <div className="temple-gate-panel" data-testid="temple-gate-panel">
                    <div className="codex-section-title">⛩️ 태양 신전 해금 게이트 (Act 4)</div>
                    <div className="dash-sub">
                      고대 지도 조각 {templeGate.mapFragments}/10 · 신전의 열쇠{' '}
                      {templeGate.templeKeys}/3
                    </div>
                    {!templeGate.canUnlock && (
                      <div className="dash-sub" data-testid="temple-gate-guide">
                        {templeGate.missingGuides.join(' / ')}
                      </div>
                    )}
                    <button
                      type="button"
                      data-testid="btn-unlock-temple-gate"
                      className="dash-btn"
                      disabled={!templeGate.canUnlock || currentFsmState !== 'OASIS_HUB'}
                      onClick={() => {
                        const store = useGameStore.getState();
                        if (store.unlockTempleGate()) {
                          eventBus.emit('endgame:templeUnlocked', {
                            mapFragments: store.currencies.mapFragments,
                            templeKeys: store.currencies.templeKeys,
                          });
                          triggerHaptic(24);
                          handleSortie();
                        }
                      }}
                    >
                      {endgame?.templeGateUnlocked
                        ? '태양 신전 진입 가능 · 출격하기'
                        : '태양 신전 봉인 해제 & 최종 결전 출격'}
                    </button>
                  </div>
                )}

                {/* Endless Deep Desert Panel (unlocked after Temple Ending) */}
                {endgame?.endlessUnlocked && (
                  <div className="endless-mode-panel" data-testid="endless-mode-panel">
                    <div className="codex-section-title">
                      🌌 무한의 심층 사막 (현재 심도 Depth {endgame.currentDepth})
                    </div>
                    <div className="dash-sub">
                      최고 돌파 Depth {endgame.maxDepthCleared} · 변이: {depthMods.mutationLabel} ·
                      보스 HP x{depthMods.hpMultiplier.toFixed(2)}
                    </div>
                    <button
                      type="button"
                      data-testid="btn-toggle-endless"
                      className="dash-btn secondary"
                      onClick={() => {
                        useGameStore.getState().toggleEndlessMode(!endgame.endlessActive);
                        triggerHaptic(16);
                      }}
                    >
                      {endgame.endlessActive
                        ? '심층 사막 진행 중 (클릭 시 일반 모드 전환)'
                        : `심층 사막 Depth ${endgame.currentDepth} 활성화`}
                    </button>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'MERCENARIES' && (
              <div className="tab-placeholder-card">
                <div
                  className="card-title"
                  style={{ display: 'flex', justifyContent: 'space-between' }}
                >
                  <span>5인 용병단 ({unlockedMercCount}/5 탑승)</span>
                  {synergyActive && (
                    <span
                      className="badge badge-synergy"
                      data-testid="mercenary-synergy-badge"
                    >
                      결속 발동 중
                    </span>
                  )}
                </div>
                <div
                  className={`merc-synergy-banner ${synergyActive ? 'active' : ''}`}
                  data-testid="mercenary-synergy-status"
                >
                  <span>
                    {synergyActive
                      ? '✦ 5인 결속 시너지: 활성 (상단 전체 공격력 +25%, 교역 금화 +20%)'
                      : `5인 결속 시너지: 비활성 (${unlockedMercCount}/5 해금 — 전원 편성 시 공격력 +25%, 교역 +20%)`}
                  </span>
                  {synergyActive && (
                    <button
                      data-testid="btn-expedition-burst"
                      className="btn-expedition-burst"
                      disabled={!expeditionBurstUi.ready || !isTacticalCombatState}
                      onClick={handleExpeditionBurst}
                    >
                      {expeditionBurstUi.ready
                        ? '⚡ 5인 합동 필살기'
                        : `필살기 ${Math.ceil(expeditionBurstUi.cooldownRemainingSec)}s`}
                    </button>
                  )}
                </div>
                <div className="merc-list">
                  {mercenaries.map((merc) => {
                    const def = MERCENARY_DEFINITIONS[merc.id as MercenaryId];
                    const equipDef = MERC_EQUIPMENT_CATALOG[merc.id as MercenaryId];
                    const eqSlot = mercEquipment?.[merc.id];
                    const mercCost = upgradeCost(merc.level);
                    return (
                      <div
                        key={merc.id}
                        data-testid={`merc-card-${merc.id}`}
                        className={`merc-card ${merc.isUnlocked ? 'unlocked' : 'locked'}`}
                      >
                        <div>
                          <strong>
                            [{def?.roleLabel ?? merc.role}] {def?.name ?? merc.name}
                          </strong>{' '}
                          <span>(Lv.{merc.level})</span>
                          <div style={{ fontSize: '11.5px', opacity: 0.9, lineHeight: 1.32 }}>
                            {merc.isUnlocked
                              ? def?.effectSummary
                              : def?.unlockHint ?? '진행 시 합류'}
                          </div>
                          <div
                            className="merc-equip-pill"
                            data-testid={`merc-equip-${merc.id}`}
                          >
                            {eqSlot
                              ? `전용장비: ${equipDef?.name ?? merc.id} [${EQUIPMENT_RARITY_LABELS[eqSlot.rarity]}] Lv.${eqSlot.level}`
                              : `전용장비 미착용 (${equipDef?.name ?? ''})`}
                          </div>
                        </div>
                        <div className="dash-actions">
                          <span
                            style={{
                              fontWeight: 700,
                              color: merc.isUnlocked ? '#68d391' : '#a0aec0',
                            }}
                          >
                            {merc.isUnlocked ? '탑승 중' : '잠금'}
                          </span>
                          <button
                            data-testid={`btn-upgrade-merc-${merc.id}`}
                            className="dash-btn"
                            disabled={
                              !merc.isUnlocked || merc.level >= 30 || sunGold < mercCost
                            }
                            onClick={() => {
                              if (useGameStore.getState().upgradeMercenary(merc.id)) {
                                triggerHaptic(15);
                              }
                            }}
                          >
                            {merc.level >= 30 ? 'MAX' : `강화 ${mercCost}G`}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {activeTab === 'TRADE' && (
              <div className="tab-placeholder-card">
                <div
                  className="card-title"
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                >
                  <span>
                    상단 교역소 — {oasisDef.name}
                    {surgeJackpot && (
                      <span data-testid="surge-jackpot-pill" className="surge-jackpot-pill">
                        🔥 시세 대박 +{surgePercent}%
                      </span>
                    )}
                  </span>
                  <button
                    data-testid="zafar-call-btn"
                    className="dash-btn secondary"
                    onClick={handleZafarCall}
                  >
                    🐫 자파르 호출
                  </button>
                </div>

                {/* Daily Urgent Delivery Timed Quest */}
                {endgame?.goldenTradeActive && (
                  <div className="golden-trade-badge" data-testid="golden-trade-badge">
                    🌟 대륙 횡단 황금 교역로 활성 (최대 400% 시세 이벤트 적용)
                  </div>
                )}
                <div className="urgent-delivery-card" data-testid="urgent-delivery-card">
                  <div className="dash-info">
                    <strong>🚑 긴급 물자 운송 (일일 타임어택)</strong>
                    <span className="dash-sub">
                      {urgentDelivery?.active
                        ? `진행 중 · 남은 제한시간 ${urgentRemainingSec}초 (성공 시 +${URGENT_DELIVERY_REWARD_GOLD}G + 포탑부품)`
                        : `120초 내 다음 오아시스 도착 시 +${URGENT_DELIVERY_REWARD_GOLD}G + 자동 강화 (완료 ${urgentDelivery?.completedCount ?? 0}회)`}
                    </span>
                  </div>
                  <button
                    data-testid="btn-start-urgent-delivery"
                    className="dash-btn secondary"
                    disabled={Boolean(urgentDelivery?.active) || currentFsmState !== 'OASIS_HUB'}
                    onClick={() => {
                      if (useGameStore.getState().startUrgentDelivery(120)) {
                        triggerHaptic(15);
                      }
                    }}
                  >
                    {urgentDelivery?.active ? '임무 중' : '임무 수락'}
                  </button>
                </div>
                <div className="dash-row">
                  <div className="dash-info">
                    <div>
                      특산품:{' '}
                      <strong data-testid="trade-specialty-name">
                        {oasisDef.specialty.name}
                      </strong>{' '}
                      (<span data-testid="trade-buy-price">{oasisDef.specialty.buyPrice}G</span>)
                    </div>
                    <div className="dash-sub">
                      적재 현황:{' '}
                      <span data-testid="trade-capacity-text">
                        {usedCargoUnits} / {cargoCapacity}
                      </span>{' '}
                      화물 · 다음 시세 +{surgePercent}%
                    </div>
                  </div>
                  <div className="dash-actions">
                    <input
                      data-testid="trade-qty-input"
                      className="trade-input"
                      type="number"
                      min={1}
                      max={cargoCapacity}
                      value={tradeQtyInput}
                      onChange={(e) => setTradeQtyInput(e.target.value)}
                    />
                    <button
                      data-testid="btn-buy-cargo"
                      className="dash-btn"
                      disabled={!canBuyTypedQty}
                      onClick={() => {
                        if (
                          useGameStore
                            .getState()
                            .buyCargo(
                              oasisDef.specialty.id,
                              parsedTradeQty,
                              oasisDef.specialty.buyPrice
                            )
                        ) {
                          triggerHaptic(15);
                        }
                      }}
                    >
                      매입
                    </button>
                    <button
                      data-testid="btn-buy-cargo-max"
                      className="dash-btn secondary"
                      disabled={maxBuyableUnits <= 0}
                      onClick={() => {
                        if (
                          maxBuyableUnits > 0 &&
                          useGameStore
                            .getState()
                            .buyCargo(
                              oasisDef.specialty.id,
                              maxBuyableUnits,
                              oasisDef.specialty.buyPrice
                            )
                        ) {
                          triggerHaptic(18);
                        }
                      }}
                    >
                      최대 적재
                    </button>
                  </div>
                </div>

                <div className="codex-section-title">교역 로테이션 품목</div>
                <div data-testid="trade-rotation-list" className="trade-rotation-list">
                  {oasisDef.secondaryGoods.map((good) => {
                    const remainingSpace = Math.max(0, cargoCapacity - usedCargoUnits);
                    const canBuyOne = remainingSpace >= 1 && sunGold >= good.buyPrice;
                    const canBuyFive = remainingSpace >= 5 && sunGold >= good.buyPrice * 5;
                    return (
                      <div
                        key={good.id}
                        data-testid={`trade-good-${good.id}`}
                        className="trade-rotation-row"
                      >
                        <div className="dash-info">
                          <strong>{good.name}</strong>
                          <span className="dash-sub">{good.buyPrice}G · {good.description}</span>
                        </div>
                        <div className="dash-actions">
                          <button
                            data-testid={`btn-buy-good-${good.id}`}
                            className="dash-btn"
                            disabled={!canBuyOne}
                            onClick={() => {
                              if (useGameStore.getState().buyCargo(good.id, 1, good.buyPrice)) {
                                triggerHaptic(12);
                              }
                            }}
                          >
                            +1
                          </button>
                          <button
                            data-testid={`btn-buy-good-5-${good.id}`}
                            className="dash-btn secondary"
                            disabled={!canBuyFive}
                            onClick={() => {
                              if (useGameStore.getState().buyCargo(good.id, 5, good.buyPrice)) {
                                triggerHaptic(15);
                              }
                            }}
                          >
                            +5
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {cargo.length > 0 && (
                  <div data-testid="trade-cargo-summary" className="dash-sub">
                    선적 중:{' '}
                    {cargo
                      .map((item) => `${getGoodsDisplayName(item.goodsId)} ${item.qty}개`)
                      .join(' · ')}
                  </div>
                )}

                <div
                  className="wandering-merchant-panel"
                  data-testid="wandering-merchant-panel"
                >
                  <div className="codex-section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>떠돌이 상인 특별 품목</span>
                    <button
                      data-testid="btn-merchant-reroll"
                      className="dash-btn secondary"
                      disabled={merchantRerollPending}
                      onClick={handleMerchantRerollAd}
                    >
                      {merchantRerollPending ? '갱신 중...' : '희귀 목록 갱신 (광고/스킵)'}
                    </button>
                  </div>
                  {merchantOffers.map((offer, idx) => {
                    const canBuyOffer = !offer.purchased && sunGold >= offer.costGold;
                    return (
                      <div
                        key={offer.id}
                        data-testid={`merchant-offer-${idx}`}
                        className="merchant-offer-row"
                      >
                        <div className="dash-info">
                          <strong>{offer.title}</strong>
                          <span className="dash-sub">{offer.subtitle}</span>
                        </div>
                        <button
                          data-testid={`btn-buy-merchant-${idx}`}
                          className="dash-btn"
                          disabled={!canBuyOffer}
                          onClick={() => {
                            if (
                              wanderingMerchantSystem.purchaseOffer(
                                offer.id,
                                useGameStore.getState(),
                                autoUpgradeEngine
                              )
                            ) {
                              triggerHaptic(16);
                              setMerchantRefreshTick((n) => n + 1);
                            }
                          }}
                        >
                          {offer.purchased ? '구매 완료' : `${offer.costGold}G`}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {activeTab === 'RELICS' && (
              <div className="tab-placeholder-card">
                <div className="card-title">유물·비석 도감 (Relic Codex & Steles)</div>
                <div data-testid="codex-passive-banner" className="codex-passive-banner">
                  <span>
                    포탑 +{Math.round(codexBonuses.turretDamagePct * 100)}% · 치명 +
                    {Math.round(codexBonuses.critChancePct * 100)}%
                  </span>
                  <span>
                    교역 +{Math.round(codexBonuses.tradeGoldPct * 100)}% · 폭풍감소{' '}
                    {Math.round(codexBonuses.stormResistPct * 100)}% · 발굴 +
                    {Math.round(codexBonuses.excavateSpeedPct * 100)}%
                  </span>
                </div>
                <div data-testid="codex-stele-list">
                  • 해독된 고대 비석: {decodedSteleCount} / {STELE_DEFINITIONS.length}개
                </div>
                <div data-testid="codex-relic-list">
                  • 수집된 고대 유물: {relicCodexCount}종 (감정 대기열 {pendingRelicCount}개)
                </div>
                <div className="dash-sub">
                  • 지도 조각: {mapFragments} / 10개
                  {pendingRelics.length > 0 &&
                    ` · 첫 상자: ${getRelicDefinition(pendingRelics[0].id).name}`}
                </div>

                {pendingRelics.length > 0 && (
                  <div className="dash-actions" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                    {pendingRelics.map((pr, idx) => {
                      const def = getRelicDefinition(pr.id);
                      const remMs = Math.max(0, pr.appraiseEndsAt - codexNowMs);
                      return (
                        <div key={`${pr.id}_${idx}`} className="codex-pending-row">
                          <span>📦 {def.name}</span>
                          <span data-testid="relic-countdown" className="codex-timer-pill">
                            {remMs <= 0 ? '수령 가능!' : formatCountdown(remMs)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="dash-actions">
                  <button
                    data-testid="btn-appraise-relic"
                    className="dash-btn"
                    disabled={!hasReadyRelic}
                    onClick={handleAppraiseReadyRelic}
                  >
                    감정 수령 (+5⚙️)
                  </button>
                  <button
                    data-testid="btn-appraise-relic-ad"
                    className="dash-btn secondary"
                    disabled={pendingRelicCount === 0 || relicAdPending || adSimState.isOpen}
                    onClick={handleAppraiseRelicAd}
                  >
                    ⚡ 광고 즉시 감정 (+5⚙️)
                  </button>
                </div>

                <div className="codex-section-title">고대 유물 ({relicCodexCount} / {RELIC_DEFINITIONS.length})</div>
                <div className="codex-relic-grid">
                  {RELIC_DEFINITIONS.map((def) => {
                    const unlocked = relicCodex.includes(def.id);
                    return (
                      <div
                        key={def.id}
                        data-testid={`relic-card-${def.id}`}
                        className={`codex-relic-card ${unlocked ? 'unlocked' : 'locked'}`}
                      >
                        <PixelIconCanvas relicId={def.id} size={22} />
                        <div>
                          <div style={{ fontWeight: 700, color: unlocked ? '#fef08a' : '#a0aec0' }}>
                            {unlocked ? def.name : '???'}{' '}
                            <span className={`rarity-badge rarity-${def.rarity}`}>
                              {RELIC_RARITY_LABELS[def.rarity]}
                            </span>
                          </div>
                          <div style={{ opacity: 0.85 }}>
                            {unlocked ? `${def.bonusSummary} · ${def.description}` : '사막 발굴로 해금'}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="codex-section-title">
                  원정 퀘스트 ({completedQuestIds.length} / {QUEST_DEFINITIONS.length} 완료)
                </div>
                <div data-testid="quest-board" className="quest-board">
                  {QUEST_DEFINITIONS.filter((q) => q.act <= Math.max(1, currentAct)).map((q) => {
                    const done = completedQuestIds.includes(q.id);
                    const prog = done ? q.target : Math.min(q.target, q.readProgress(fullGameState));
                    return (
                      <div
                        key={q.id}
                        data-testid={`quest-row-${q.id}`}
                        className={`quest-row ${done ? 'done' : ''}`}
                      >
                        <div className="dash-info">
                          <div>
                            <span
                              className={
                                q.kind === 'MAIN' ? 'quest-badge-main' : 'quest-badge-sub'
                              }
                            >
                              {q.kind === 'MAIN' ? `Act${q.act} 메인` : `Act${q.act} 서브`}
                            </span>{' '}
                            <strong>{q.title}</strong> ({prog}/{q.target})
                          </div>
                          <span className="dash-sub">
                            {done ? '✓ 보상 자동 적용 완료' : `보상: ${q.rewardLabel}`}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="codex-section-title">고대 비석 ({decodedSteleCount} / {STELE_DEFINITIONS.length})</div>
                <div className="codex-stele-list">
                  {STELE_DEFINITIONS.map((st) => {
                    const decoded = decodedSteles.includes(st.id);
                    return (
                      <div
                        key={st.id}
                        data-testid={`stele-item-${st.id}`}
                        className={`codex-stele-row ${decoded ? 'decoded' : ''}`}
                      >
                        <div style={{ fontWeight: 700, color: decoded ? '#68d391' : '#a0aec0' }}>
                          {decoded ? st.title : `비석 ${st.id}: ??? (미해독)`}
                        </div>
                        {decoded && (
                          <div className="codex-stele-inscription">"{st.inscription}"</div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="codex-section-title">
                  일일 미션 (보유 스킵권: <span data-testid="daily-skip-tickets-count">{dailySkipTicketsLeft}</span>장)
                </div>
                <div data-testid="daily-missions-panel" className="daily-mission-list">
                  {DAILY_MISSION_DEFINITIONS.map((def) => {
                    const currentMissions =
                      dailyMissions ?? createInitialDailyMissions(getTodayDateString());
                    const item = currentMissions.items.find((m) => m.id === def.id);
                    const progress = Math.min(def.target, item?.progress ?? 0);
                    const claimed = Boolean(item?.claimed);
                    const canClaim = !claimed && progress >= def.target;
                    return (
                      <div
                        key={def.id}
                        data-testid={`daily-mission-${def.id}`}
                        className={`daily-mission-row ${claimed ? 'claimed' : ''}`}
                      >
                        <div className="dash-info">
                          <strong>
                            {def.title} ({progress}/{def.target})
                          </strong>
                          <span className="dash-sub">
                            {def.description} · 보상: 🎫+{def.reward.skipTickets} ⚙️+{def.reward.ancientGear} 🪙+{def.reward.sunGold}
                          </span>
                        </div>
                        <button
                          data-testid={`btn-claim-mission-${def.id}`}
                          className="dash-btn"
                          disabled={!canClaim}
                          onClick={() => {
                            if (
                              useGameStore
                                .getState()
                                .claimDailyMission(def.id as DailyMissionId)
                            ) {
                              triggerHaptic(20);
                            }
                          }}
                        >
                          {claimed ? '수령 완료' : canClaim ? '보상 수령' : '진행 중'}
                        </button>
                      </div>
                    );
                  })}
                </div>

                <div className="codex-section-title">세이브 JSON 백업</div>
                <div data-testid="save-backup-panel" className="save-backup-panel">
                  <div className="dash-actions">
                    <button
                      type="button"
                      data-testid="btn-export-save"
                      className="dash-btn secondary"
                      onClick={() => {
                        const json = SaveManager.exportSaveJson();
                        setSaveJsonInput(json);
                        setSaveBackupStatus('세이브 JSON이 생성되었습니다.');
                        if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
                          navigator.clipboard.writeText(json).catch(() => {});
                        }
                      }}
                    >
                      📤 내보내기
                    </button>
                    <button
                      type="button"
                      data-testid="btn-import-save"
                      className="dash-btn"
                      onClick={() => {
                        const res = SaveManager.importSaveJson(saveJsonInput);
                        setSaveBackupStatus(
                          res.success
                            ? '세이브 불러오기 완료!'
                            : res.error ?? '세이브 불러오기에 실패했습니다.'
                        );
                        if (res.success) {
                          triggerHaptic(20);
                        }
                      }}
                    >
                      📥 가져오기
                    </button>
                  </div>
                  <textarea
                    data-testid="save-json-textarea"
                    className="save-json-textarea"
                    rows={3}
                    placeholder="내보내기 버튼으로 생성된 JSON 또는 백업 JSON을 붙여넣으세요"
                    value={saveJsonInput}
                    onChange={(e) => setSaveJsonInput(e.target.value)}
                  />
                  {saveBackupStatus && (
                    <div data-testid="save-backup-status" className="dash-sub">
                      {saveBackupStatus}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          </section>
        </div>

        {/* Modal: Oasis Arrival Settlement */}
        {currentFsmState === 'OASIS_SETTLEMENT' && (
          <div
            className="modal-overlay modal-settlement"
            data-testid="settlement-modal"
          >
            <div className="modal-dialog">
              <div className="modal-title">🏜️ 오아시스 도착 정산</div>
              <div className="modal-body">
                {endgame?.pendingEndingModal && (
                  <div className="golden-trade-badge" style={{ marginBottom: '8px' }}>
                    🏆 태양 신전 탈환 성공! 정산 후 엔딩 시퀀스가 재생됩니다.
                  </div>
                )}
                <p>교역 화물을 시세에 맞춰 모두 매각했습니다!</p>
                <div
                  data-testid="settlement-profit"
                  style={{
                    fontSize: '24px',
                    fontWeight: 'bold',
                    color: '#ecc94b',
                    margin: '8px 0',
                  }}
                >
                  +{settlementProfit.toLocaleString()} G
                </div>
                {settlementBreakdown && (
                  <div data-testid="settlement-receipt" className="settlement-receipt">
                    <div className="settlement-receipt-row">
                      <span>매각 화물 / 원가</span>
                      <span>
                        {settlementBreakdown.cargoUnits}개 ({settlementBreakdown.purchaseCost.toLocaleString()}G)
                      </span>
                    </div>
                    <div className="settlement-receipt-row">
                      <span>오아시스 시세 배율</span>
                      <span>{Math.round(settlementBreakdown.priceRate * 100)}%</span>
                    </div>
                    <div className="settlement-receipt-row">
                      <span>하룬 상인 보너스</span>
                      <span>{settlementBreakdown.harunUnlocked ? '+25%' : '미적용'}</span>
                    </div>
                    <div className="settlement-receipt-row">
                      <span>5인 결속 시너지</span>
                      <span>{settlementBreakdown.synergyActive ? '+20%' : '미적용'}</span>
                    </div>
                    <div className="settlement-receipt-row total">
                      <span>최종 정산 수익</span>
                      <span>+{settlementProfit.toLocaleString()} G</span>
                    </div>
                  </div>
                )}
                <div style={{ fontSize: '11px', color: '#a0aec0', marginBottom: '6px' }}>
                  실시간 VIP 광고 패스 전환 (현재 T{adTier})
                </div>
                <div className="settlement-tier-row">
                  {([0, 1, 2, 3] as AdTierLevel[]).map((tier) => (
                    <button
                      key={tier}
                      className={`settlement-tier-btn ${adTier === tier ? 'active' : ''}`}
                      onClick={() => useGameStore.getState().setAdTier(tier)}
                    >
                      VIP T{tier}
                    </button>
                  ))}
                </div>
              </div>
              <div className="modal-actions">
                <button
                  data-testid="zafar-double-btn"
                  className="modal-btn modal-btn-secondary"
                  disabled={zafar2xClaimed || settlementProfit <= 0}
                  onClick={handleSettlementZafar2x}
                >
                  자파르 2배 (+{settlementProfit.toLocaleString()}G)
                </button>
                <button
                  data-testid="settlement-proceed-btn"
                  className="modal-btn modal-btn-primary"
                  onClick={() => oasisSettlementState.dismissSettlement(fsm)}
                >
                  다음 루트
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal: Offline Rewards */}
        {offlineReward && (
          <div className="modal-overlay" data-testid="offline-reward-modal">
            <div className="modal-dialog">
              <div className="modal-title">⛺ 사막의 휴식 보상</div>
              <div className="modal-body">
                <p>
                  부재 시간: {offlineReward.clampedMinutes}분{' '}
                  {offlineReward.isCapped && '(최대 8시간 도달)'}
                </p>
                <p style={{ marginTop: '8px' }}>
                  마차들이 자동으로 금화를 모았습니다!
                </p>
                <div
                  style={{
                    fontSize: '22px',
                    fontWeight: 'bold',
                    color: '#ecc94b',
                    margin: '12px 0',
                  }}
                >
                  🪙 +{offlineReward.gold.toLocaleString()} G
                </div>
              </div>
              <div className="modal-actions">
                <button
                  data-testid="offline-claim-btn"
                  className="modal-btn modal-btn-secondary"
                  onClick={() => claimOfflineReward(false)}
                >
                  일반 수령 ({offlineReward.gold}G)
                </button>
                <button
                  data-testid="zafar-double-btn"
                  className="modal-btn modal-btn-primary"
                  onClick={handleOfflineZafar2x}
                >
                  자파르 2배 ({offlineReward.zafarGold}G)
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal: Emergency Revive (rendered before Ad Simulator) */}
        {currentFsmState === 'EMERGENCY_REVIVE' && (
          <div
            className="modal-overlay modal-emergency-revive"
            data-testid="emergency-revive-modal"
          >
            <div className="modal-dialog">
              <div className="modal-title">⚠️ 긴급 복구 프로토콜</div>
              <div className="modal-body">
                <p>샌드워커가 대파되었습니다! 즉시 수리하여 전투에 복귀하시겠습니까?</p>
                <div
                  style={{
                    fontSize: '20px',
                    fontWeight: 'bold',
                    color: '#fc8181',
                    margin: '12px 0',
                  }}
                >
                  ⏱️ 남은 시간: {reviveRemainingSec}초
                </div>
                <p style={{ fontSize: '11px', color: '#a0aec0' }}>
                  후퇴 시 적재 화물의 50%를 잃고 직전 오아시스로 귀환합니다. (강제 광고
                  없음)
                </p>
              </div>
              <div className="modal-actions">
                <button
                  data-testid="revive-retreat-btn"
                  className="modal-btn modal-btn-secondary"
                  disabled={reviveAdPending}
                  onClick={handleRetreatEmergencyRevive}
                >
                  오아시스로 후퇴
                </button>
                <button
                  data-testid="revive-accept-btn"
                  className="modal-btn modal-btn-primary"
                  disabled={reviveAdPending}
                  onClick={handleAcceptEmergencyRevive}
                >
                  긴급 수리 (HP 50% 복구)
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal: Sun Temple Reclaim Ending Sequence */}
        {currentFsmState === 'OASIS_HUB' && endgame?.pendingEndingModal && (
          <div
            className="modal-overlay"
            data-testid="ending-sequence-modal"
          >
            <div className="modal-dialog ending-modal-dialog">
              <div className="modal-title">🏆 태양 신전 탈환 완료 — 대서사 엔딩</div>
              <div className="modal-body">
                <div className="ending-epilogue-list">
                  {TEMPLE_ENDING_EPILOGUE_LINES.map((line, idx) => (
                    <div key={idx} className="ending-epilogue-line">
                      <strong>[{line.speaker}]</strong> {line.text}
                    </div>
                  ))}
                </div>
                <div className="ending-stats-grid" data-testid="ending-stats-grid">
                  <div>여정 시간: {Math.floor(totalPlaySeconds / 60)}분 {totalPlaySeconds % 60}초</div>
                  <div>총 적 처치: {totalEnemyKills}기</div>
                  <div>해독 비석: {decodedSteleCount}/3</div>
                  <div>유물 도감: {relicCodexCount}/20</div>
                  <div>용병 결속: {unlockedMercCount}/5</div>
                  <div>
                    누적 교역: {(progression?.counters.totalTradeProfit ?? 0).toLocaleString()}G
                  </div>
                </div>
                <div className="golden-trade-badge" style={{ marginTop: '8px' }}>
                  ✨ 기념 유물 [태양 신전의 심장 ({TEMPLE_COMMEMORATIVE_RELIC_ID})] 도감 자동 등록 · 대륙 횡단 황금 교역로 해금!
                </div>
              </div>
              <div className="modal-actions">
                <button
                  type="button"
                  data-testid="btn-close-ending"
                  className="modal-btn modal-btn-secondary"
                  onClick={() => useGameStore.getState().dismissEndingModal(false)}
                >
                  오아시스 정비로
                </button>
                <button
                  type="button"
                  data-testid="btn-enter-endless"
                  className="modal-btn modal-btn-primary"
                  onClick={() => {
                    useGameStore.getState().dismissEndingModal(true);
                    triggerHaptic(24);
                  }}
                >
                  🌌 무한의 심층 사막 출정 (Depth 1)
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal: Unified User Settings */}
        <SettingsModal
          isOpen={settingsOpen}
          settings={userSettings}
          autoInvestPolicy={progression?.autoInvestPolicy ?? 'MANUAL'}
          saveJsonInput={saveJsonInput}
          saveBackupStatus={saveBackupStatus}
          onUpdateSettings={handleUpdateSettings}
          onChangeAutoInvestPolicy={(policy) => {
            useGameStore.getState().setAutoInvestPolicy(policy);
            triggerHaptic(10);
          }}
          onChangeSaveJsonInput={setSaveJsonInput}
          onExportSave={() => {
            const json = SaveManager.exportSaveJson();
            setSaveJsonInput(json);
            setSaveBackupStatus('세이브 JSON이 생성되었습니다.');
            if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
              navigator.clipboard.writeText(json).catch(() => {});
            }
          }}
          onImportSave={() => {
            const res = SaveManager.importSaveJson(saveJsonInput);
            setSaveBackupStatus(
              res.success
                ? '세이브 불러오기 완료!'
                : res.error ?? '세이브 불러오기에 실패했습니다.'
            );
            if (res.success) {
              triggerHaptic(20);
            }
          }}
          onClose={() => setSettingsOpen(false)}
        />

        {/* Modal: Ad Simulator (rendered after standard modals with higher z-index) */}
        {adSimState.isOpen && (
          <div className="modal-overlay ad-modal-overlay" data-testid="ad-sim-modal">
            <div className="modal-dialog">
              <div className="modal-title">{adSimState.title}</div>
              <div className="modal-body">
                {adSimState.type === 'INTERSTITIAL' ? (
                  <p>오아시스 도착 축하 전면 광고가 재생 중입니다.</p>
                ) : (
                  <p>보상형 광고가 재생 중입니다.</p>
                )}
                <div
                  data-testid="ad-sim-countdown"
                  style={{ fontSize: '24px', fontWeight: 'bold', margin: '16px 0' }}
                >
                  ⏳ {adSimState.remainingSeconds}초 남음
                </div>
              </div>
              <div className="modal-actions">
                <button
                  data-testid="ad-sim-close-btn"
                  className="modal-btn modal-btn-primary"
                  disabled={!adSimState.canClose}
                  onClick={() => adSimulator.closeModal()}
                  style={{
                    opacity: adSimState.canClose ? 1 : 0.4,
                    cursor: adSimState.canClose ? 'pointer' : 'not-allowed',
                  }}
                >
                  {adSimState.canClose ? '닫기 및 보상 수령' : '광고 시청 중...'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
