import { GameFSM, IGameState } from '../GameFSM';
import { useGameStore } from '@/store/gameStore';
import { SaveManager } from '@/persistence/saveManager';
import {
  OPENING_DIALOGUE_CUES,
  type OpeningPhaseId,
} from '@/game/data/openingScript';
import type { DialogueSystem } from '@/engine/systems/DialogueSystem';
import type { ExcavationSystem } from '@/engine/systems/ExcavationSystem';

export interface OpeningHookSystems {
  dialogueSystem?: DialogueSystem;
  excavationSystem?: ExcavationSystem;
}

export class OpeningHookState implements IGameState {
  public readonly id = 'OPENING_HOOK' as const;
  private elapsedSeconds = 0;
  private phase: OpeningPhaseId = 1;
  private phase2Applied = false;
  private phase3Applied = false;
  private stele1Decoded = false;
  private phase4Applied = false;
  private completed = false;
  private readonly triggeredCueIds = new Set<string>();

  private dialogueSystem?: DialogueSystem;
  private excavationSystem?: ExcavationSystem;

  constructor(systems: OpeningHookSystems = {}) {
    this.dialogueSystem = systems.dialogueSystem;
    this.excavationSystem = systems.excavationSystem;
  }

  public setSystems(systems: OpeningHookSystems): void {
    this.dialogueSystem = systems.dialogueSystem;
    this.excavationSystem = systems.excavationSystem;
  }

  public enter(fsm: GameFSM): void {
    this.elapsedSeconds = 0;
    this.phase = 1;
    this.phase2Applied = false;
    this.phase3Applied = false;
    this.stele1Decoded = false;
    this.phase4Applied = false;
    this.completed = false;
    this.triggeredCueIds.clear();
    this.dialogueSystem?.clear();

    const store = useGameStore.getState();
    store.setIntroCompleted(false);
    store.setTimeOfDay('NIGHT');
    store.setRouteProgress(0);

    // Phase 1 preview (0..30s): Lv.30 Tier 3 turrets visually and in telemetry
    useGameStore.setState((s) => ({
      sandwalker: {
        ...s.sandwalker,
        turretLevels: { HEAT_RAY: 30, HARPOON: 30, MORTAR: 30 },
        turretTiers: { HEAT_RAY: 3, HARPOON: 3, MORTAR: 3 },
      },
    }));

    // Register a heartbeat interval in the OPENING_HOOK TimerService group
    // (Decision D10 / TC-STATE-19 & fsm.test cancellation verification),
    // while actual timeline progression uses dt inside update() for 4x scaling.
    fsm.timerService.setInterval(this.id, () => {}, 1000);

    // Enqueue first Phase 1 cue immediately if elapsed >= 0
    this.triggerDueDialogueCues();
  }

  public update(fsm: GameFSM, dt: number): void {
    if (this.completed) return;
    const safeDt = Number.isFinite(dt) && dt > 0 ? dt : 0;
    this.elapsedSeconds += safeDt;

    this.triggerDueDialogueCues();

    const store = useGameStore.getState();

    // Phase 2 (30~75s): Sandworm ambush, 12px shake, STORM atmosphere, reset parts to Lv1
    if (this.elapsedSeconds >= 30 && !this.phase2Applied) {
      this.phase2Applied = true;
      this.phase = 2;
      store.setTimeOfDay('STORM');
      useGameStore.setState((s) => ({
        sandwalker: {
          ...s.sandwalker,
          turretLevels: { HEAT_RAY: 1, HARPOON: 1, MORTAR: 1 },
          turretTiers: { HEAT_RAY: 1, HARPOON: 1, MORTAR: 1 },
        },
      }));
      fsm.eventBus?.emit('camera:shake', { intensity: 12, duration: 1.2 });
    }

    // Phase 3 (75~135s): First oasis march with Harun & Sera, DAY sky, Stele #1 decoding
    if (this.elapsedSeconds >= 75 && !this.phase3Applied) {
      this.phase3Applied = true;
      this.phase = 3;
      store.setTimeOfDay('DAY');
      store.unlockMercenary('harun');
      store.unlockMercenary('sera');
      this.excavationSystem?.spawnNode({
        id: 'intro_stele_1',
        kind: 'STELE',
        steleId: 1,
        x: 340,
        y: 412,
        durationSec: 2.0,
      });
    }

    if (this.elapsedSeconds >= 75 && this.elapsedSeconds < 135) {
      const p3Progress = ((this.elapsedSeconds - 75) / 60) * 95;
      store.setRouteProgress(p3Progress);
    }

    // Ensure Stele #1 (+5 Ancient Gear) decodes reliably by t = 95s even if speed/timing skips
    if (this.elapsedSeconds >= 95 && !this.stele1Decoded) {
      this.stele1Decoded = true;
      const latest = useGameStore.getState();
      if (!latest.steles.decoded.includes(1)) {
        latest.decodeStele(1);
        latest.addCurrencies({ ancientGear: 5 });
      }
    }

    // Phase 4 (135~180s): Arrival at Oasis 1 (200% surge)
    if (this.elapsedSeconds >= 135 && !this.phase4Applied) {
      this.phase4Applied = true;
      this.phase = 4;
      store.setTimeOfDay('DAY');
      store.setRouteProgress(100);
    }

    if (this.elapsedSeconds >= 180) {
      this.completeIntro(fsm);
    }
  }

  public exit(_fsm: GameFSM): void {
    this.dialogueSystem?.clear();
    // Ensure Lv.30 preview turrets never leak out of OPENING_HOOK
    const s = useGameStore.getState();
    if (!s.meta.isIntroCompleted && s.sandwalker.turretLevels.HEAT_RAY === 30) {
      useGameStore.setState((cur) => ({
        sandwalker: {
          ...cur.sandwalker,
          turretLevels: { HEAT_RAY: 1, HARPOON: 1, MORTAR: 1 },
          turretTiers: { HEAT_RAY: 1, HARPOON: 1, MORTAR: 1 },
        },
      }));
    }
  }

  public getElapsedSeconds(): number {
    return this.elapsedSeconds;
  }

  public getPhase(): OpeningPhaseId {
    return this.phase;
  }

  public skipIntro(fsm: GameFSM): void {
    this.completeIntro(fsm);
  }

  private triggerDueDialogueCues(): void {
    if (!this.dialogueSystem) return;
    for (const cue of OPENING_DIALOGUE_CUES) {
      if (this.elapsedSeconds >= cue.triggerAtSec && !this.triggeredCueIds.has(cue.id)) {
        this.triggeredCueIds.add(cue.id);
        this.dialogueSystem.enqueue(cue.speaker, cue.text, cue.id);
      }
    }
  }

  private completeIntro(fsm: GameFSM): void {
    if (this.completed) return;
    this.completed = true;

    this.dialogueSystem?.clear();
    SaveManager.setIntroSeen();

    const s = useGameStore.getState();
    const hadStele1Gear = this.stele1Decoded || s.steles.decoded.includes(1);

    // Reset any lingering Lv30 preview turrets down to Lv1/Tier1 before completing intro
    useGameStore.setState((cur) => ({
      sandwalker: {
        ...cur.sandwalker,
        turretLevels:
          cur.sandwalker.turretLevels.HEAT_RAY === 30
            ? { HEAT_RAY: 1, HARPOON: 1, MORTAR: 1 }
            : cur.sandwalker.turretLevels,
        turretTiers:
          cur.sandwalker.turretTiers.HEAT_RAY === 3 && !cur.meta.isIntroCompleted
            ? { HEAT_RAY: 1, HARPOON: 1, MORTAR: 1 }
            : cur.sandwalker.turretTiers,
      },
    }));

    const cur = useGameStore.getState();
    if (!cur.meta.isIntroCompleted) {
      if (hadStele1Gear) {
        // Stele #1 already granted 5 ancientGear; grant remaining 300G + 1 Fragment without doubling Gear
        cur.addCurrencies({ sunGold: 300, ancientGear: 0, mapFragments: 1 });
        cur.unlockMercenary('harun');
        cur.unlockMercenary('sera');
        cur.decodeStele(1);
        cur.setIntroCompleted(true);
        cur.setOasisIndex(Math.max(1, cur.meta.currentOasisIndex));
      } else {
        cur.grantIntroSkipRewards();
        useGameStore.getState().decodeStele(1);
      }
    }

    const after = useGameStore.getState();
    after.setTimeOfDay('DAY');
    after.setRouteProgress(0);
    fsm.transitionTo('OASIS_HUB');
  }
}
