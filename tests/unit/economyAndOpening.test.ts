import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useGameStore } from '@/store/gameStore';
import { SaveManager } from '@/persistence/saveManager';
import { GameFSM } from '@/engine/fsm/GameFSM';
import { TimerService } from '@/engine/TimerService';
import { EventBus } from '@/engine/EventBus';
import { OpeningHookState } from '@/engine/fsm/states/OpeningHookState';
import { OasisHubState } from '@/engine/fsm/states/OasisHubState';
import { OasisSettlementState } from '@/engine/fsm/states/OasisSettlementState';
import {
  getOasisDefinition,
  rollNextOasisPriceRate,
} from '@/game/data/oases';
import {
  RELIC_DEFINITIONS,
  STELE_DEFINITIONS,
  getRelicDefinition,
} from '@/game/data/relics';
import {
  MAX_DIALOGUE_CHARS,
  OPENING_DIALOGUE_CUES,
  getOpeningPhaseInfo,
  validateOpeningScript,
} from '@/game/data/openingScript';
import {
  BUBBLE_FADE_SEC,
  BUBBLE_HOLD_SEC,
  DialogueSystem,
  computeSafeShellY,
  wrapBubbleText,
} from '@/engine/systems/DialogueSystem';
import {
  BASE_EXCAVATE_SEC,
  ExcavationSystem,
  ZARA_EXCAVATE_SPEED_MULT,
} from '@/engine/systems/ExcavationSystem';

describe('M5 Economy, Codex, Dialogue, Excavation & Opening Timeline', () => {
  let mockStorage: Record<string, string> = {};

  beforeEach(() => {
    mockStorage = {};
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => mockStorage[key] ?? null,
      setItem: (key: string, val: string) => {
        mockStorage[key] = val;
      },
      removeItem: (key: string) => {
        delete mockStorage[key];
      },
      clear: () => {
        mockStorage = {};
      },
    });
    useGameStore.getState().resetToDefaults();
    SaveManager.clearIntroSeen();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('oases.ts maps Oasis 1..3 specialties and rolls surge rates in [1.5, 3.0]', () => {
    const o1 = getOasisDefinition(1);
    const o2 = getOasisDefinition(2);
    const o3 = getOasisDefinition(3);

    expect(o1.specialty.name.includes('생수')).toBe(true);
    expect(o1.specialty.buyPrice).toBe(1);
    expect(o2.specialty.name.includes('전갈 해독제')).toBe(true);
    expect(o2.specialty.buyPrice).toBe(3);
    expect(o3.specialty.name.includes('태양석')).toBe(true);
    expect(o3.specialty.buyPrice).toBe(8);

    expect(rollNextOasisPriceRate(() => 0)).toBe(1.5);
    expect(rollNextOasisPriceRate(() => 0.5)).toBe(2.25);
    expect(rollNextOasisPriceRate(() => 1)).toBe(3.0);
  });

  it('relics.ts defines 12 steles and relic lookup fallback cleanly', () => {
    expect(STELE_DEFINITIONS).toHaveLength(12);
    expect(RELIC_DEFINITIONS.some((r) => r.id === 'relic_solar_disc')).toBe(true);
    expect(getRelicDefinition('relic_unknown').gearReward).toBe(5);
  });

  it('openingScript.ts satisfies AC-02 <= 35 codepoint limit across every dialogue cue', () => {
    expect(validateOpeningScript()).toBe(true);
    for (const cue of OPENING_DIALOGUE_CUES) {
      expect([...cue.text].length <= MAX_DIALOGUE_CHARS).toBe(true);
    }
    expect(getOpeningPhaseInfo(0).phase).toBe(1);
    expect(getOpeningPhaseInfo(30).phase).toBe(2);
    expect(getOpeningPhaseInfo(75).phase).toBe(3);
    expect(getOpeningPhaseInfo(135).phase).toBe(4);
  });

  it('DialogueSystem clamps <= 35 chars, wraps <= 2 lines, avoids [165, 400], caps at 2, and expires at 3.8s', () => {
    const dlg = new DialogueSystem();
    const wrapped = wrapBubbleText('신전의 문이 코앞이다! 열선 레이저 최대 출력, 길을 뚫어라! 초과텍스트');
    expect([...wrapped.clampedText].length).toBe(35);
    expect(wrapped.lines.length <= 2).toBe(true);

    expect(computeSafeShellY(240) < 165).toBe(true);

    dlg.enqueue('카심', '첫 번째 대사입니다.');
    dlg.enqueue('세라', '두 번째 대사입니다.');
    dlg.enqueue('하룬', '세 번째 대기열 대사입니다.');

    expect(dlg.getActiveBubbles().length).toBe(2);
    expect(dlg.getQueuedCount()).toBe(1);
    for (const b of dlg.getDebugSnapshot().activeBalloons) {
      expect(b.y + 42 <= 165).toBe(true);
    }

    // Hold at 3.5s -> fade at 3.65s -> expired at 3.8s + queue promotion
    dlg.update(BUBBLE_HOLD_SEC);
    expect(dlg.getActiveBubbles().every((b) => b.alpha === 1)).toBe(true);

    dlg.update(BUBBLE_FADE_SEC / 2);
    expect(dlg.getActiveBubbles().every((b) => b.alpha < 1 && b.alpha > 0)).toBe(true);

    dlg.update(BUBBLE_FADE_SEC);
    expect(dlg.getActiveBubbles().length).toBe(1);
    expect(dlg.getActiveBubbles()[0].speaker).toBe('하룬');
    expect(dlg.getQueuedCount()).toBe(0);

    dlg.clear();
    expect(dlg.getActiveBubbles().length).toBe(0);
  });

  it('ExcavationSystem handles Stele decode (+5 Gear), Zara 1.3x speedup, and manual/ad relic appraisal', () => {
    const excavation = new ExcavationSystem();
    const store = useGameStore.getState();

    // Without Zara: 2.0s duration at x = 220
    excavation.spawnNode({
      id: 'st_1',
      kind: 'STELE',
      steleId: 2,
      x: 220,
      y: 412,
      durationSec: BASE_EXCAVATE_SEC,
    });
    excavation.update(1.6, 'MARCH_NORMAL', 120, useGameStore.getState());
    expect(useGameStore.getState().steles.decoded.includes(2)).toBe(false);

    excavation.update(0.5, 'MARCH_NORMAL', 120, useGameStore.getState());
    expect(useGameStore.getState().steles.decoded.includes(2)).toBe(true);
    expect(useGameStore.getState().currencies.ancientGear).toBe(5);

    // With Zara unlocked: 2.0 / 1.3 = 1.538s completes in 1.6s!
    store.unlockMercenary('zara');
    excavation.spawnNode({
      id: 'rc_1',
      kind: 'RELIC_CHEST',
      relicId: 'relic_solar_disc',
      x: 220,
      y: 412,
      durationSec: BASE_EXCAVATE_SEC,
    });
    excavation.update(
      BASE_EXCAVATE_SEC / ZARA_EXCAVATE_SPEED_MULT + 0.05,
      'MARCH_NORMAL',
      120,
      useGameStore.getState()
    );
    expect(useGameStore.getState().relics.pending.length).toBe(1);

    // Ready vs future appraisal
    store.addPendingRelic('relic_ankh', -1000);
    const readyId = excavation.appraiseReadyRelic(useGameStore.getState());
    expect(readyId).toBe('relic_ankh');
    expect(useGameStore.getState().relics.codex.includes('relic_ankh')).toBe(true);

    const adId = excavation.appraisePendingRelicByAd(useGameStore.getState());
    expect(adId).toBe('relic_solar_disc');
    expect(useGameStore.getState().relics.codex.includes('relic_solar_disc')).toBe(true);
    expect(useGameStore.getState().relics.pending.length).toBe(0);
  });

  it('OpeningHookState runs 4-phase 180s timeline and Settlement unlocks Zara at Oasis 2 + rolls rate + Zafar 2x once', () => {
    const bus = new EventBus();
    const timers = new TimerService();
    const fsm = new GameFSM(timers, bus);
    const dlg = new DialogueSystem();
    const exc = new ExcavationSystem();
    const opening = new OpeningHookState({ dialogueSystem: dlg, excavationSystem: exc });
    const hub = new OasisHubState();
    const settlement = new OasisSettlementState();

    fsm.registerState(opening);
    fsm.registerState(hub);
    fsm.registerState(settlement);

    fsm.transitionTo('OPENING_HOOK');
    expect(useGameStore.getState().sandwalker.turretLevels.HEAT_RAY).toBe(30);
    expect(useGameStore.getState().meta.timeOfDay).toBe('NIGHT');

    // Advance to Phase 2 (t = 35s)
    fsm.update(35);
    expect(useGameStore.getState().sandwalker.turretLevels.HEAT_RAY).toBe(1);
    expect(useGameStore.getState().meta.timeOfDay).toBe('STORM');

    // Advance to Phase 3 (t = 100s)
    fsm.update(65);
    expect(useGameStore.getState().meta.timeOfDay).toBe('DAY');
    expect(useGameStore.getState().steles.decoded.includes(1)).toBe(true);
    expect(useGameStore.getState().currencies.ancientGear).toBe(5);

    // Complete Phase 4 (t = 180s)
    fsm.update(85);
    expect(fsm.getCurrentStateId()).toBe('OASIS_HUB');
    expect(useGameStore.getState().currencies.sunGold).toBe(300);
    expect(useGameStore.getState().currencies.ancientGear).toBe(5);
    expect(useGameStore.getState().currencies.mapFragments).toBe(1);

    // Oasis 1 -> Settlement -> Oasis 2 (unlocks Zara + Zafar 2x single claim + rolls rate)
    useGameStore.getState().buyCargo('WATER', 20, 1);
    useGameStore.getState().setNextOasisPriceRate(2.0);
    fsm.transitionTo('OASIS_SETTLEMENT');
    expect(
      useGameStore.getState().mercenaries.find((m) => m.id === 'zara')?.isUnlocked
    ).toBe(true);
    const expectedProfit = settlement.totalProfit; // floor(20 * 1 * 2.0 * 1.25) = 50
    expect(expectedProfit).toBe(50);

    expect(settlement.claimZafar2x()).toBe(50);
    expect(settlement.claimZafar2x()).toBe(0); // Only once

    settlement.dismissSettlement(fsm);
    expect(fsm.getCurrentStateId()).toBe('OASIS_HUB');
    const rolled = useGameStore.getState().trade.nextOasisPriceRate;
    expect(rolled >= 1.5).toBe(true);
    expect(rolled <= 3.0).toBe(true);

    timers.cancelAll();
  });
});
