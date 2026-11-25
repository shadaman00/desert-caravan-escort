import { GameFSM, IGameState } from '../GameFSM';
import type { EventBus } from '@/engine/EventBus';
import { useGameStore } from '@/store/gameStore';
import { getBossDefinitionForAct } from '@/game/data/bosses';
import type { BossSystem } from '@/engine/systems/BossSystem';
import {
  TEMPLE_COMMEMORATIVE_RELIC_ID,
  TEMPLE_GATE_KEYS,
  TEMPLE_GATE_MAP_FRAGMENTS,
  computeDepthClearBonusGold,
  getDepthModifiers,
} from '@/engine/systems/EndlessExpeditionSystem';

export interface BossEncounterStateOptions {
  bossSystem?: BossSystem;
  eventBus?: EventBus;
}

export class BossEncounterState implements IGameState {
  public readonly id = 'BOSS_ENCOUNTER' as const;
  public bossHp = 2000;
  public bossMaxHp = 2000;
  public bossPhase = 1;
  public bossArmor = 0;
  public bossIsGroggy = false;
  public bossGroggyRemainingSec = 0;
  public bossPartBreakTriggered = false;
  public bossWavesSpawned = 0;

  private readonly bossSystem?: BossSystem;
  private readonly eventBus?: EventBus;
  private isResolvingDefeat = false;

  constructor(options: BossEncounterStateOptions = {}) {
    this.bossSystem = options.bossSystem;
    this.eventBus = options.eventBus;
  }

  public enter(fsm: GameFSM): void {
    this.isResolvingDefeat = false;
    const store = useGameStore.getState();
    const endlessActive = Boolean(store.endgame?.endlessActive);
    const depthMods = endlessActive
      ? getDepthModifiers(store.endgame?.currentDepth ?? 1)
      : null;
    const act = depthMods ? depthMods.bossRotationAct : store.meta.currentAct;
    const scaleOptions = depthMods
      ? { hpMultiplier: depthMods.hpMultiplier, damageMultiplier: depthMods.damageMultiplier }
      : undefined;
    const bossDef = getBossDefinitionForAct(act);

    if (fsm.resumeContext && fsm.resumeContext.stateId === this.id) {
      // Resumed from EmergencyRevive: restore boss status
      const resumedHp = fsm.resumeContext.bossHp ?? bossDef.maxHp;
      const resumedPhase = fsm.resumeContext.bossPhase ?? 1;
      const resumedArmor = fsm.resumeContext.bossArmor;
      const resumedIsGroggy = fsm.resumeContext.bossIsGroggy;
      const resumedGroggyRemainingSec = fsm.resumeContext.bossGroggyRemainingSec;
      const resumedPartBreakTriggered = fsm.resumeContext.bossPartBreakTriggered;
      const resumedWavesSpawned = fsm.resumeContext.bossWavesSpawned;

      if (this.bossSystem) {
        this.bossSystem.startEncounter(
          act,
          {
            bossHp: resumedHp,
            bossPhase: resumedPhase,
            bossArmor: resumedArmor,
            bossIsGroggy: resumedIsGroggy,
            bossGroggyRemainingSec: resumedGroggyRemainingSec,
            bossPartBreakTriggered: resumedPartBreakTriggered,
            bossWavesSpawned: resumedWavesSpawned,
          },
          scaleOptions
        );
        this.syncFromBossSystem();
      } else {
        this.bossMaxHp = Math.max(bossDef.maxHp, resumedHp);
        this.bossHp = resumedHp;
        this.bossPhase = resumedPhase;
        this.bossArmor = resumedArmor ?? 0;
        this.bossIsGroggy = resumedIsGroggy ?? false;
        this.bossGroggyRemainingSec = resumedGroggyRemainingSec ?? 0;
        this.bossPartBreakTriggered = resumedPartBreakTriggered ?? false;
        this.bossWavesSpawned = resumedWavesSpawned ?? 0;
      }
      fsm.resumeContext = null;
    } else {
      // Fresh encounter
      if (this.bossSystem) {
        this.bossSystem.startEncounter(act, undefined, scaleOptions);
        this.syncFromBossSystem();
      } else {
        this.bossMaxHp = bossDef.maxHp;
        this.bossHp = bossDef.maxHp;
        this.bossPhase = 1;
        this.bossArmor = bossDef.phases[0]?.armor ?? 0;
        this.bossIsGroggy = false;
        this.bossGroggyRemainingSec = 0;
        this.bossPartBreakTriggered = false;
        this.bossWavesSpawned = 0;
      }
    }
  }

  private syncFromBossSystem(): void {
    if (!this.bossSystem) return;
    if (this.bossSystem.isDefeated()) {
      this.bossHp = 0;
      this.bossArmor = 0;
      this.bossIsGroggy = false;
      this.bossGroggyRemainingSec = 0;
      return;
    }
    if (this.bossSystem.isActive()) {
      this.bossMaxHp = this.bossSystem.getMaxHp();
      this.bossHp = this.bossSystem.getTotalHp();
      this.bossPhase = this.bossSystem.getPhase();
      this.bossArmor = this.bossSystem.getArmor();
      this.bossIsGroggy = this.bossSystem.getIsGroggy();
      this.bossGroggyRemainingSec = this.bossSystem.getGroggyRemainingSec();
      this.bossPartBreakTriggered = this.bossSystem.isPartBreakTriggered();
      this.bossWavesSpawned = this.bossSystem.getWavesSpawned();
    }
  }

  public update(fsm: GameFSM, _dt: number): void {
    const store = useGameStore.getState();

    if (this.bossSystem) {
      this.syncFromBossSystem();
    }

    // Player defeated
    if (store.sandwalker.currentHp <= 0) {
      fsm.resumeContext = {
        stateId: this.id,
        bossHp: this.bossHp,
        bossPhase: this.bossPhase,
        bossArmor: this.bossArmor,
        bossIsGroggy: this.bossIsGroggy,
        bossGroggyRemainingSec: this.bossGroggyRemainingSec,
        bossPartBreakTriggered: this.bossPartBreakTriggered,
        bossWavesSpawned: this.bossWavesSpawned,
        routeProgress: store.meta.routeProgress,
      };
      fsm.transitionTo('EMERGENCY_REVIVE');
      return;
    }

    // Boss defeated
    if ((this.bossHp <= 0 || this.bossSystem?.isDefeated()) && !this.isResolvingDefeat) {
      this.onBossDefeated(fsm);
    }
  }

  public damageBoss(amount: number): void {
    if (!Number.isFinite(amount) || amount <= 0) return;
    if (this.bossSystem && this.bossSystem.isActive()) {
      this.bossSystem.applyManualDamage(amount);
      this.syncFromBossSystem();
    } else {
      this.bossHp = Math.max(0, this.bossHp - amount);
    }
  }

  public onBossDefeated(fsm: GameFSM): void {
    if (this.isResolvingDefeat) return;
    this.isResolvingDefeat = true;

    const store = useGameStore.getState();
    const endlessActive = Boolean(store.endgame?.endlessActive);
    const act = endlessActive
      ? getDepthModifiers(store.endgame?.currentDepth ?? 1).bossRotationAct
      : store.meta.currentAct;
    const bossDef = getBossDefinitionForAct(act);

    store.addCurrencies({
      ancientGear: bossDef.clearRewards.ancientGear,
      mapFragments: bossDef.clearRewards.mapFragments,
      templeKeys: bossDef.clearRewards.templeKeys,
    });

    // Decision D9: Act 1 Boss clear unlocks Tarik & Lili
    if (bossDef.clearRewards.unlockMercenaryIds) {
      for (const mercId of bossDef.clearRewards.unlockMercenaryIds) {
        store.unlockMercenary(mercId);
      }
    }

    store.setRouteProgress(100);
    this.bossSystem?.clear();
    this.eventBus?.emit('boss:defeated', {
      bossId: bossDef.id,
      act,
      x: bossDef.x,
      y: bossDef.y,
    });

    const latestStore = useGameStore.getState();
    if (latestStore.endgame?.endlessActive) {
      const { clearedDepth, nextDepth } = latestStore.advanceEndlessDepth();
      const bonusGold = computeDepthClearBonusGold(clearedDepth);
      useGameStore.getState().addCurrencies({ sunGold: bonusGold });
      this.eventBus?.emit('endgame:depthCleared', {
        clearedDepth,
        nextDepth,
        bonusGold,
      });
    } else if (
      store.meta.currentAct === 4 &&
      !latestStore.endgame?.endingCompleted &&
      (latestStore.endgame?.templeGateUnlocked ||
        (latestStore.currencies.mapFragments >= TEMPLE_GATE_MAP_FRAGMENTS &&
          latestStore.currencies.templeKeys >= TEMPLE_GATE_KEYS))
    ) {
      if (useGameStore.getState().triggerTempleEnding()) {
        this.eventBus?.emit('endgame:endingTriggered', {
          commemorativeRelicId: TEMPLE_COMMEMORATIVE_RELIC_ID,
        });
      }
    }

    fsm.transitionTo('OASIS_SETTLEMENT', { isChapterBossClear: true });
  }

  public exit(_fsm: GameFSM): void {
    this.isResolvingDefeat = false;
  }
}
