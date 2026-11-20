import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GameFSM, IGameState } from '@/engine/fsm/GameFSM';
import { TimerService } from '@/engine/TimerService';
import { OpeningHookState } from '@/engine/fsm/states/OpeningHookState';
import { OasisHubState } from '@/engine/fsm/states/OasisHubState';
import { MarchNormalState } from '@/engine/fsm/states/MarchNormalState';
import { HazardZoneState } from '@/engine/fsm/states/HazardZoneState';
import { BossEncounterState } from '@/engine/fsm/states/BossEncounterState';
import { EmergencyReviveState } from '@/engine/fsm/states/EmergencyReviveState';
import { OasisSettlementState } from '@/engine/fsm/states/OasisSettlementState';
import { SaveManager } from '@/persistence/saveManager';
import { adSimulator } from '@/game/monetization/AdSimulator';
import { useGameStore } from '@/store/gameStore';

describe('GameFSM Unit Suite', () => {
  let timerService: TimerService;
  let fsm: GameFSM;

  const createMockState = (id: any): IGameState => ({
    id,
    enter: vi.fn(),
    update: vi.fn(),
    exit: vi.fn(),
  });

  let mockStorage: Record<string, string> = {};

  beforeEach(() => {
    vi.useFakeTimers();
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
    timerService = new TimerService();
    fsm = new GameFSM(timerService);
    useGameStore.getState().resetToDefaults();
  });

  afterEach(() => {
    timerService.cancelAll();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('registers states and transitions cleanly', () => {
    const hub = createMockState('OASIS_HUB');
    const march = createMockState('MARCH_NORMAL');

    fsm.registerState(hub);
    fsm.registerState(march);

    fsm.transitionTo('OASIS_HUB');
    expect(fsm.getCurrentStateId()).toBe('OASIS_HUB');
    expect(hub.enter).toHaveBeenCalledOnce();

    fsm.transitionTo('MARCH_NORMAL');
    expect(hub.exit).toHaveBeenCalledOnce();
    expect(march.enter).toHaveBeenCalledOnce();
    expect(fsm.getCurrentStateId()).toBe('MARCH_NORMAL');
  });

  it('unconditionally cancels timers registered under the exiting state', () => {
    const march = createMockState('MARCH_NORMAL');
    const hazard = createMockState('HAZARD_ZONE');

    fsm.registerState(march);
    fsm.registerState(hazard);
    fsm.transitionTo('MARCH_NORMAL');

    const marchTimerCallback = vi.fn();
    const globalTimerCallback = vi.fn();

    // Register march timer and global timer
    timerService.setTimeout('MARCH_NORMAL', marchTimerCallback, 1000);
    timerService.setTimeout('GLOBAL', globalTimerCallback, 1000);

    expect(timerService.getActiveTimerCount('MARCH_NORMAL')).toBe(1);
    expect(timerService.getActiveTimerCount('GLOBAL')).toBe(1);

    // Transition to hazard zone
    fsm.transitionTo('HAZARD_ZONE');

    // March timers must be cancelled immediately
    expect(timerService.getActiveTimerCount('MARCH_NORMAL')).toBe(0);
    expect(timerService.getActiveTimerCount('GLOBAL')).toBe(1);

    // Advance clock past timer expiration
    vi.advanceTimersByTime(2000);

    expect(marchTimerCallback).not.toHaveBeenCalled();
    expect(globalTimerCallback).toHaveBeenCalledOnce();
  });

  it('enforces re-entrancy protection (single pending transition per tick)', () => {
    const s1 = createMockState('MARCH_NORMAL');
    const s2 = createMockState('HAZARD_ZONE');
    const s3 = createMockState('EMERGENCY_REVIVE');

    fsm.registerState(s1);
    fsm.registerState(s2);
    fsm.registerState(s3);

    fsm.transitionTo('MARCH_NORMAL');

    // Make state 2 try to trigger state 3 immediately inside its enter hook
    s2.enter = vi.fn(() => {
      fsm.transitionTo('EMERGENCY_REVIVE');
    });

    const res1 = fsm.transitionTo('HAZARD_ZONE');
    expect(res1).toBe(true);
    expect(fsm.getCurrentStateId()).toBe('HAZARD_ZONE');
  });

  it('triggers concrete transitions at 40%, 70%, 95% route milestones', () => {
    const march = new MarchNormalState();
    const hazard = new HazardZoneState();
    const boss = new BossEncounterState();
    const settlement = new OasisSettlementState();
    const hub = new OasisHubState();

    fsm.registerState(hub);
    fsm.registerState(march);
    fsm.registerState(hazard);
    fsm.registerState(boss);
    fsm.registerState(settlement);

    fsm.transitionTo('MARCH_NORMAL');
    const store = useGameStore.getState();

    // Set progress to 40% and update -> transitions to HAZARD_ZONE
    store.setRouteProgress(40);
    fsm.update(0.1);
    expect(fsm.getCurrentStateId()).toBe('HAZARD_ZONE');

    // Inside hazard zone, set progress to 70% and update -> transitions back to MARCH_NORMAL
    store.setRouteProgress(70);
    fsm.update(0.1);
    expect(fsm.getCurrentStateId()).toBe('MARCH_NORMAL');
    expect(useGameStore.getState().meta.hazardConsumed).toBe(true);

    // Set progress to 95% and update -> transitions to BOSS_ENCOUNTER
    store.setRouteProgress(95);
    fsm.update(0.1);
    expect(fsm.getCurrentStateId()).toBe('BOSS_ENCOUNTER');
  });

  it('preserves boss phase & remaining HP in EmergencyRevive and resumes at 50% HP', () => {
    const boss = new BossEncounterState();
    const revive = new EmergencyReviveState();

    fsm.registerState(boss);
    fsm.registerState(revive);

    fsm.transitionTo('BOSS_ENCOUNTER');
    boss.damageBoss(1500);
    boss.bossPhase = 2;

    // Simulate player defeat (0 HP)
    useGameStore.getState().setHp(0);
    fsm.update(0.1);

    expect(fsm.getCurrentStateId()).toBe('EMERGENCY_REVIVE');
    expect(fsm.resumeContext?.stateId).toBe('BOSS_ENCOUNTER');
    expect(fsm.resumeContext?.bossHp).toBe(boss.bossMaxHp - 1500);
    expect(fsm.resumeContext?.bossPhase).toBe(2);

    // Accept revive
    revive.acceptRevive(fsm);
    expect(fsm.getCurrentStateId()).toBe('BOSS_ENCOUNTER');
    expect(useGameStore.getState().sandwalker.currentHp).toBe(500); // 50% of 1000
    expect(boss.bossHp).toBe(boss.bossMaxHp - 1500);
    expect(boss.bossPhase).toBe(2);
  });

  it('reduces cargo by 50% on retreat from EmergencyRevive and retreats to OASIS_HUB with 0 ads', () => {
    const march = new MarchNormalState();
    const revive = new EmergencyReviveState();
    const hub = new OasisHubState();

    fsm.registerState(hub);
    fsm.registerState(march);
    fsm.registerState(revive);

    fsm.transitionTo('MARCH_NORMAL');
    const store = useGameStore.getState();
    store.setCargo([{ goodsId: 'SPICE', qty: 25, buyPrice: 100 }]);
    store.setHp(0);
    fsm.update(0.1);

    expect(fsm.getCurrentStateId()).toBe('EMERGENCY_REVIVE');

    // Player rejects or retreats
    revive.retreat(fsm);
    expect(fsm.getCurrentStateId()).toBe('OASIS_HUB');

    // Cargo reduced by 50% (floor(25 * 0.5) = 12)
    const currentCargo = useGameStore.getState().trade.cargo;
    expect(currentCargo[0].qty).toBe(12);
    expect(useGameStore.getState().meta.routeProgress).toBe(0);

    // HP is restored to full maxHp so next sortie does not trigger an infinite death loop
    expect(useGameStore.getState().sandwalker.currentHp).toBe(
      useGameStore.getState().sandwalker.maxHp
    );
    hub.sortie(fsm);
    expect(fsm.getCurrentStateId()).toBe('MARCH_NORMAL');
    fsm.update(0.016);
    expect(fsm.getCurrentStateId()).toBe('MARCH_NORMAL');
  });

  it('OpeningHookState keeps intro active even when introSeen is true (D10 manual skip) without wiping state', () => {
    const opening = new OpeningHookState();
    const hub = new OasisHubState();
    fsm.registerState(opening);
    fsm.registerState(hub);

    SaveManager.setIntroSeen();
    const store = useGameStore.getState();
    store.addCurrencies({ sunGold: 9999 });
    store.setAdTier(2);

    fsm.transitionTo('OPENING_HOOK');
    expect(fsm.getCurrentStateId()).toBe('OPENING_HOOK');

    // First update tick remains in OPENING_HOOK (D10: requires explicit skip or 180s completion)
    fsm.update(0.016);
    expect(fsm.getCurrentStateId()).toBe('OPENING_HOOK');
    expect(useGameStore.getState().currencies.sunGold).toBe(9999);
    expect(useGameStore.getState().monetization.adTier).toBe(2);

    // Explicit skip transitions to OASIS_HUB cleanly
    opening.skipIntro(fsm);
    expect(fsm.getCurrentStateId()).toBe('OASIS_HUB');
    expect(useGameStore.getState().currencies.sunGold).toBe(10299);
    expect(useGameStore.getState().monetization.adTier).toBe(2);
  });

  it('OpeningHookState skipIntro grants Decision D10 rewards and transitions to OASIS_HUB', () => {
    const opening = new OpeningHookState();
    const hub = new OasisHubState();
    fsm.registerState(opening);
    fsm.registerState(hub);

    fsm.transitionTo('OPENING_HOOK');
    expect(fsm.getCurrentStateId()).toBe('OPENING_HOOK');
    expect(timerService.getActiveTimerCount('OPENING_HOOK')).toBe(1);

    opening.skipIntro(fsm);
    expect(fsm.getCurrentStateId()).toBe('OASIS_HUB');
    expect(timerService.getActiveTimerCount('OPENING_HOOK')).toBe(0);
    expect(SaveManager.isIntroSeen()).toBe(true);

    const state = useGameStore.getState();
    expect(state.currencies.sunGold).toBe(300);
    expect(state.currencies.ancientGear).toBe(5);
    expect(state.currencies.mapFragments).toBe(1);
    expect(state.mercenaries.find((m) => m.id === 'harun')?.isUnlocked).toBe(true);
    expect(state.mercenaries.find((m) => m.id === 'sera')?.isUnlocked).toBe(true);
  });

  it('HazardZoneState applies Act 1 vs Act 2 quicksand and prioritizes lethal sandstorm DoT over 70% exit', () => {
    const hazard = new HazardZoneState();
    const march = new MarchNormalState();
    const revive = new EmergencyReviveState();
    fsm.registerState(hazard);
    fsm.registerState(march);
    fsm.registerState(revive);

    // Act 1 weakened quicksand (c = 0.2 -> speed 96 px/s) vs Act 2 standard (c = 0.4 -> speed 72 px/s)
    const store = useGameStore.getState();
    store.setAct(1);
    store.setRouteProgress(40);
    fsm.transitionTo('HAZARD_ZONE');
    fsm.update(1); // +96 / 7200 * 100 = +1.3333%
    expect(useGameStore.getState().meta.routeProgress).toBeCloseTo(40 + (96 / 7200) * 100, 4);

    store.setAct(2);
    store.setRouteProgress(40);
    fsm.update(1); // +72 / 10800 * 100 = +0.6667%
    expect(useGameStore.getState().meta.routeProgress).toBeCloseTo(40 + (72 / 10800) * 100, 4);

    // Act 3 sandstorm DoT: lethal damage at 69.9% must enter EMERGENCY_REVIVE, not MARCH_NORMAL
    store.setAct(3);
    store.setRouteProgress(69.9);
    store.setHp(1);
    fsm.update(0.1); // stormDps(1000) * 0.1 = 1.5 damage -> HP = 0
    expect(fsm.getCurrentStateId()).toBe('EMERGENCY_REVIVE');
    expect(useGameStore.getState().sandwalker.currentHp).toBe(0);
    expect(useGameStore.getState().meta.hazardConsumed).toBe(false);
  });

  it('OasisSettlementState settles cargo and evaluates interstitial ad policy on dismiss', () => {
    const settlement = new OasisSettlementState();
    const hub = new OasisHubState();
    fsm.registerState(settlement);
    fsm.registerState(hub);

    const store = useGameStore.getState();
    store.setAct(2);
    store.setPlayTime(1200);
    store.setAdTier(0);
    store.incrementOasisArrival(); // arrivalCount = 1 before enter -> 2 inside enter
    store.setCargo([{ goodsId: 'SPICE', qty: 10, buyPrice: 10 }]);
    store.setNextOasisPriceRate(2.0);
    store.unlockMercenary('harun');

    fsm.transitionTo('OASIS_SETTLEMENT', { isChapterBossClear: false });
    expect(useGameStore.getState().meta.oasisArrivalCount).toBe(2);
    expect(useGameStore.getState().currencies.sunGold).toBe(250); // 10 * 10 * 2.0 * 1.25

    settlement.dismissSettlement(fsm);
    // Should open 5s interstitial modal in Act 2, >=900s, Tier 0, arrival 2
    for (let i = 0; i < 5; i++) {
      vi.advanceTimersByTime(1000);
    }
    adSimulator.closeModal();
    expect(fsm.getCurrentStateId()).toBe('OASIS_HUB');
  });
});
