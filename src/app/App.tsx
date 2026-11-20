import {
  useRef,
  useEffect,
  useState,
  useMemo,
  type PointerEvent,
  type ReactElement,
} from 'react';
import { clientToZoneB, useViewportScale } from './scale';
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
import type { AdTierLevel, TurretType } from '../store/types';
import { DebugBar } from '../ui/debug/DebugBar';
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
import { OasisSettlementState } from '../engine/fsm/states/OasisSettlementState';
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
import { Renderer } from '../engine/render/Renderer';
import type { ParticlePool } from '../engine/render/draw/particles';
import { MERCENARY_DEFINITIONS, type MercenaryId } from '../game/data/mercenaries';
import { getOasisDefinition } from '../game/data/oases';
import { getRelicDefinition, STELE_DEFINITIONS } from '../game/data/relics';
import { getOpeningPhaseInfo, type OpeningPhaseInfo } from '../game/data/openingScript';
import { quicksandIgnore, tierUpGearCost, upgradeCost } from '../game/formulas';
import { triggerHaptic } from '../game/haptics';

type GrowthTab = 'MECH' | 'MERCENARIES' | 'TRADE' | 'RELICS';

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
    dialogue: DialogueDebugSnapshot;
  };
}

declare global {
  interface Window {
    __SANDWALKER_DEBUG__?: SandwalkerDebugTelemetry;
  }
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
  const [zafar2xClaimed, setZafar2xClaimed] = useState<boolean>(false);
  const [relicAdPending, setRelicAdPending] = useState<boolean>(false);

  const relayAdPendingRef = useRef<boolean>(false);
  const adSimOpenRef = useRef<boolean>(false);

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
  const synergyActive = useIsExpeditionSynergyActive();
  const decodedSteleCount = useDecodedSteleCount();
  const relicCodexCount = useRelicCodexCount();
  const pendingRelicCount = usePendingRelicCount();
  const pendingRelics = useGameStore((s) => s.relics.pending);

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
  } = useMemo(() => {
    const bus = new EventBus();
    const machine = new GameFSM(timerService, bus);
    const hazard = new HazardSystem();
    const boss = new BossSystem({ eventBus: bus });
    const dialogue = new DialogueSystem();
    const excavation = new ExcavationSystem();
    const opening = new OpeningHookState({
      dialogueSystem: dialogue,
      excavationSystem: excavation,
    });
    const hub = new OasisHubState();
    const revive = new EmergencyReviveState();
    const settlement = new OasisSettlementState();

    const getBoostMult = () =>
      combatCoordinatorRef.current?.getRouteSpeedMultiplier() ?? 1;

    machine.registerState(opening);
    machine.registerState(hub);
    machine.registerState(new MarchNormalState({ getSpeedMultiplier: getBoostMult }));
    machine.registerState(
      new HazardZoneState({ getSpeedMultiplier: getBoostMult, hazardSystem: hazard })
    );
    machine.registerState(new BossEncounterState({ bossSystem: boss }));
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

    if (typeof window !== 'undefined') {
      window.__SANDWALKER_DEBUG__ = {
        getSnapshot: () => {
          const latest = useGameStore.getState();
          const stateId = fsm.getCurrentStateId();
          const routeSnap = routeSystem.getSnapshot();
          const relayVisible = hazardSystem.isRelayTowerAvailable(
            stateId,
            latest.meta.currentAct,
            latest.meta.currentOasisIndex
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
            dialogue: dialogueSystem.getDebugSnapshot(),
          };
        },
      };
    }

    let playTimeAccum = 0;
    let lastSwitchCdRatio = 0;
    let lastReticleKey = '0';
    let lastDodgeKey = '0:0';
    let lastShieldKey = '0';
    let lastActualSpeed = -1;
    let lastRelayVisible = false;
    let lastBossHudKey = 'none';
    let lastReviveSec = -1;
    let lastPhaseNum = 1;
    let lastBalloonsKey = '';

    const unsubShake = eventBus.on('camera:shake', ({ intensity, duration }) => {
      cameraSystem.shake(intensity, duration);
    });

    const unsubStateResetAim = eventBus.on('state:change', ({ from, to }) => {
      setIntroSeenState(SaveManager.isIntroSeen());
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
        excavationSystem.update(
          dt,
          stateId,
          routeSnap.actualSpeed,
          freshStore,
          openingElapsedSeconds
        );
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
          latestStore.meta.currentOasisIndex
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
            combatCoordinator.render(ctx, useGameStore.getState());
          },
        });
      },
    });

    gameLoop.start();

    return () => {
      unsubShake();
      unsubStateResetAim();
      gameLoop.stop();
      combatCoordinator.dispose();
      combatCoordinatorRef.current = null;
      particlePoolRef.current = null;
      cameraSystemRef.current = null;
      if (typeof window !== 'undefined' && window.__SANDWALKER_DEBUG__) {
        delete window.__SANDWALKER_DEBUG__;
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
  ]);

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
    coordinator.onAimPointerMove(pt.x, pt.y, useGameStore.getState().setManualAimTarget);
  };

  const handleCanvasPointerUp = () => {
    const coordinator = combatCoordinatorRef.current;
    if (!coordinator) return;
    coordinator.onAimPointerUp();
    setAimReticle(coordinator.getAimReticleOverlay());
  };

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
        store.meta.currentOasisIndex
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
          current.meta.currentOasisIndex
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
  const hasReadyRelic = pendingRelics.some((r) => r.appraiseEndsAt <= Date.now());
  const isTacticalCombatState =
    currentFsmState !== 'OASIS_HUB' &&
    currentFsmState !== 'OASIS_SETTLEMENT' &&
    currentFsmState !== 'EMERGENCY_REVIVE' &&
    hpStatus.currentHp > 0;

  return (
    <>
      <DebugBar />

      <div
        className="viewport-shell"
        data-testid="viewport-shell"
        style={{
          transform: `translate(-50%, -50%) scale(${scale})`,
        }}
      >
        {/* ZONE A: HUD Overlay (0 ~ 140px) */}
        <section className="zone-a" data-testid="zone-a">
          <div className="zone-a-route">
            <span data-testid="hud-oasis-name">
              [출발] {routeDef.fromOasisName} ➔ [도착] {routeDef.toOasisName}
            </span>
            <span data-testid="hud-act-badge" className="hud-act-badge">
              Act {currentAct}
            </span>
          </div>

          <div className="zone-a-progress-wrap">
            <div className="zone-a-progress-label">
              <span>행군 진행도</span>
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
            <span className="badge badge-fsm" data-testid="hud-fsm-badge">
              {currentFsmState}
            </span>
          </div>
        </section>

        {/* ZONE B: Canvas 2D Battlefield (140 ~ 652px) */}
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
              {openingPhaseInfo.phase === 3 && (
                <div
                  data-testid="tutorial-turret-prompt"
                  className="tutorial-turret-prompt"
                >
                  💡 우측 하단 [2] 작살 버튼을 눌러 중장갑 적을 제압하세요!
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

          {/* Oasis Hub Sortie CTA */}
          {currentFsmState === 'OASIS_HUB' && (
            <button
              data-testid="sortie-btn"
              className="sortie-btn"
              onClick={handleSortie}
            >
              🚩 출격하기
            </button>
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

          {currentFsmState === 'BOSS_ENCOUNTER' && bossHud && (
            <div data-testid="boss-hud" className="boss-hud">
              <div className="boss-hud-header">
                <span data-testid="boss-name" className="boss-name">
                  {bossHud.name}
                </span>
                <div className="boss-hud-badges">
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

        {/* ZONE C: Tactical & Growth Dashboard (652 ~ 932px) */}
        <section className="zone-c" data-testid="zone-c">
          {/* Row 1: Tactical Intervention Bar */}
          <div className="zone-c-tactical">
            <button
              data-testid="turret-btn-heat-ray"
              className={`turret-btn ${activeTurret === 'HEAT_RAY' ? 'active' : ''}`}
              onClick={() => handleTurretSwitch('HEAT_RAY')}
            >
              <span>[1] 열선</span>
              <span style={{ fontSize: '9px', opacity: 0.8 }}>코어/정령 2.0x</span>
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
              <span style={{ fontSize: '9px', opacity: 0.8 }}>장갑/외피 2.2x</span>
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
              <span style={{ fontSize: '9px', opacity: 0.8 }}>군집/기생 2.2x</span>
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
              {shieldUi.cooldownRatio > 0 && (
                <span
                  className="turret-btn-cooldown-bar"
                  style={{ width: `${Math.round(shieldUi.cooldownRatio * 100)}%` }}
                />
              )}
            </button>
          </div>

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
              유물·비석 도감
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
                  <span>기체 개조 (Mech Modification)</span>
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
                      ? '👑 황금 파라오 장착 중'
                      : '👑 황금 파라오 스킨'}
                  </button>
                </div>

                {/* Active Turret Row */}
                <div className="dash-row">
                  <div className="dash-info">
                    <div>
                      <strong>주포 [{activeTurret}]</strong>{' '}
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
                  {synergyActive
                    ? '✦ 5인 결속 시너지: 활성 (상단 전체 공격력 +25%, 교역 금화 +20%)'
                    : `5인 결속 시너지: 비활성 (${unlockedMercCount}/5 해금 — 전원 편성 시 공격력 +25%, 교역 +20%)`}
                </div>
                <div className="merc-list">
                  {mercenaries.map((merc) => {
                    const def = MERCENARY_DEFINITIONS[merc.id as MercenaryId];
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
                          <div style={{ fontSize: '10px', opacity: 0.78 }}>
                            {merc.isUnlocked
                              ? def?.effectSummary
                              : def?.unlockHint ?? '진행 시 합류'}
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
                  <span>상단 교역소 — {oasisDef.name}</span>
                  <button
                    data-testid="zafar-call-btn"
                    className="dash-btn secondary"
                    onClick={handleZafarCall}
                  >
                    🐫 자파르 호출
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
              </div>
            )}

            {activeTab === 'RELICS' && (
              <div className="tab-placeholder-card">
                <div className="card-title">유물·비석 도감 (Relic Codex & Steles)</div>
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
              </div>
            )}
          </div>
        </section>

        {/* Modal: Oasis Arrival Settlement */}
        {currentFsmState === 'OASIS_SETTLEMENT' && (
          <div
            className="modal-overlay modal-settlement"
            data-testid="settlement-modal"
          >
            <div className="modal-dialog">
              <div className="modal-title">🏜️ 오아시스 도착 정산</div>
              <div className="modal-body">
                <p>교역 화물을 시세에 맞춰 모두 매각했습니다!</p>
                <div
                  data-testid="settlement-profit"
                  style={{
                    fontSize: '24px',
                    fontWeight: 'bold',
                    color: '#ecc94b',
                    margin: '10px 0',
                  }}
                >
                  +{settlementProfit.toLocaleString()} G
                </div>
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
