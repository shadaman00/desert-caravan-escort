import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useGameStore } from '@/store/gameStore';
import { EventBus } from '@/engine/EventBus';
import { TimerService } from '@/engine/TimerService';
import { GameFSM } from '@/engine/fsm/GameFSM';
import { OasisHubState } from '@/engine/fsm/states/OasisHubState';
import { MarchNormalState } from '@/engine/fsm/states/MarchNormalState';
import { HazardZoneState } from '@/engine/fsm/states/HazardZoneState';
import { BossEncounterState } from '@/engine/fsm/states/BossEncounterState';
import { EmergencyReviveState } from '@/engine/fsm/states/EmergencyReviveState';
import { OasisSettlementState } from '@/engine/fsm/states/OasisSettlementState';
import {
  BASE_ROUTE_SPEED_PX,
  NORMAL_ROUTE_LENGTH_PX,
  OPENING_ROUTE_LENGTH_PX,
  getRouteDefinition,
  resolveActHazardKind,
} from '@/game/data/routes';
import { BOSS_DEFINITIONS, getBossDefinitionForAct } from '@/game/data/bosses';
import { HazardSystem } from '@/engine/systems/HazardSystem';
import { RouteSystem } from '@/engine/systems/RouteSystem';
import { BossSystem } from '@/engine/systems/BossSystem';
import { CombatCoordinator } from '@/engine/systems/CombatCoordinator';
import { calculateDamage } from '@/engine/systems/DamageSystem';
import { findSnapTarget } from '@/engine/systems/TurretSystem';
import { ParticlePool } from '@/engine/render/draw/particles';
import { CameraSystem } from '@/engine/systems/CameraSystem';
import { drawBoss } from '@/engine/render/draw/bosses';
import { processRewardedAdRequest } from '@/game/monetization/rewardedAds';
import { adSimulator } from '@/game/monetization/AdSimulator';

class MockPath2D {
  moveTo = vi.fn();
  lineTo = vi.fn();
  closePath = vi.fn();
  ellipse = vi.fn();
  rect = vi.fn();
  arc = vi.fn();
  quadraticCurveTo = vi.fn();
}

function createMockCtx(): CanvasRenderingContext2D {
  const grad = { addColorStop: vi.fn() };
  return {
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    scale: vi.fn(),
    beginPath: vi.fn(),
    closePath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    arc: vi.fn(),
    ellipse: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    setLineDash: vi.fn(),
    fillText: vi.fn(),
    createRadialGradient: vi.fn(() => grad),
    createLinearGradient: vi.fn(() => grad),
    globalAlpha: 1,
    fillStyle: '#000',
    strokeStyle: '#000',
    lineWidth: 1,
  } as unknown as CanvasRenderingContext2D;
}

describe('M4: Hazards, Bosses & Emergency Recovery Suite', () => {
  beforeEach(() => {
    useGameStore.getState().resetToDefaults();
    vi.stubGlobal('Path2D', MockPath2D);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  describe('Routes & Act-Based Hazards', () => {
    it('distinguishes 7200px opening route vs 10800px normal routes and maps Act 1-4 hazards', () => {
      expect(OPENING_ROUTE_LENGTH_PX).toBe(7200);
      expect(NORMAL_ROUTE_LENGTH_PX).toBe(10800);
      expect(BASE_ROUTE_SPEED_PX).toBe(120);

      // Opening route = 7200px, hazard = NONE in OPENING_HOOK
      expect(resolveActHazardKind(1, 0, 'OPENING_HOOK')).toBe('NONE');
      expect(getRouteDefinition(1, 0, 'OPENING_HOOK').routeLengthPx).toBe(7200);
      expect(getRouteDefinition(1, 0, 'MARCH_NORMAL').routeLengthPx).toBe(7200);

      // Normal routes (act >= 2 or oasisIndex >= 1) = 10800px
      expect(getRouteDefinition(1, 1, 'MARCH_NORMAL').routeLengthPx).toBe(10800);
      expect(getRouteDefinition(2, 0, 'MARCH_NORMAL').routeLengthPx).toBe(10800);

      // Act 1: weakened quicksand (c = 0.2, 1.5x scorpions)
      const act1Def = getRouteDefinition(1, 1, 'HAZARD_ZONE');
      expect(act1Def.hazardKind).toBe('QUICKSAND');
      expect(act1Def.quicksandPenaltyCoeff).toBe(0.2);
      expect(act1Def.scorpionSpawnMultiplier).toBe(1.5);

      // Act 2: standard quicksand (c = 0.4, 2.0x scorpions)
      const act2Def = getRouteDefinition(2, 1, 'HAZARD_ZONE');
      expect(act2Def.hazardKind).toBe('QUICKSAND');
      expect(act2Def.quicksandPenaltyCoeff).toBe(0.4);
      expect(act2Def.scorpionSpawnMultiplier).toBe(2.0);

      // Act 3: sandstorm
      expect(resolveActHazardKind(3, 0, 'HAZARD_ZONE')).toBe('SANDSTORM');

      // Act 4: alternating 0-based index parity (0,2 -> QUICKSAND; 1,3 -> SANDSTORM)
      expect(resolveActHazardKind(4, 0, 'HAZARD_ZONE')).toBe('QUICKSAND');
      expect(resolveActHazardKind(4, 1, 'HAZARD_ZONE')).toBe('SANDSTORM');
      expect(resolveActHazardKind(4, 2, 'HAZARD_ZONE')).toBe('QUICKSAND');
      expect(resolveActHazardKind(4, 3, 'HAZARD_ZONE')).toBe('SANDSTORM');
    });

    it('computes v_actual (96 / 72 / 120 px/s at Lv11+) and applies Dodge Boost 1.6x in MarchNormal & HazardZone', () => {
      const hazardSystem = new HazardSystem();
      const routeSystem = new RouteSystem();
      const timers = new TimerService();
      const fsm = new GameFSM(timers);
      fsm.registerState(new MarchNormalState({ getSpeedMultiplier: () => 1.6 }));
      fsm.registerState(new HazardZoneState({ hazardSystem }));

      const store = useGameStore.getState();
      store.setAct(2);
      store.setOasisIndex(1); // 10800px Act 2 Quicksand

      // Dodge Boost 1.6x in MarchNormal (120 * 1.6 = 192 px/s -> 192 / 10800 * 100 per sec)
      store.setRouteProgress(10);
      fsm.transitionTo('MARCH_NORMAL');
      fsm.update(1);
      expect(useGameStore.getState().meta.routeProgress).toBeCloseTo(
        10 + (192 / 10800) * 100,
        4
      );

      // Lv1 Act 1 Quicksand -> 96 px/s; Act 2 Lv1 -> 72 px/s; Lv11 -> 120 px/s
      store.setAct(1);
      expect(hazardSystem.computeActualSpeed('HAZARD_ZONE', useGameStore.getState())).toBeCloseTo(96, 5);
      store.setAct(2);
      expect(hazardSystem.computeActualSpeed('HAZARD_ZONE', useGameStore.getState())).toBeCloseTo(72, 5);

      store.addCurrencies({ sunGold: 20000 });
      for (let i = 0; i < 10; i++) store.upgradeLeg();
      expect(useGameStore.getState().sandwalker.legPartLevel).toBe(11);
      expect(hazardSystem.computeActualSpeed('HAZARD_ZONE', useGameStore.getState())).toBe(120);

      const bossSnap = routeSystem.update(1 / 60, 'BOSS_ENCOUNTER', useGameStore.getState());
      expect(bossSnap.actualSpeed).toBe(0);
    });

    it('handles Sandstorm DoT shield-first absorption, vision mask clearing, and Solar Relay Tower', () => {
      const hazardSystem = new HazardSystem();
      const timers = new TimerService();
      const fsm = new GameFSM(timers);
      const march = new MarchNormalState();
      const hazard = new HazardZoneState({ hazardSystem });
      const revive = new EmergencyReviveState();
      fsm.registerState(march);
      fsm.registerState(hazard);
      fsm.registerState(revive);

      // Support both 'RELAY_TOWER' (legacy unit test) and 'SOLAR_RELAY' (types.ts)
      expect(processRewardedAdRequest(useGameStore.getState(), 'SOLAR_RELAY').simulationDurationSeconds).toBe(3);
      expect(processRewardedAdRequest(useGameStore.getState(), 'RELAY_TOWER').simulationDurationSeconds).toBe(3);

      const store = useGameStore.getState();
      store.setAct(3);
      store.setOasisIndex(0);
      store.setRouteProgress(45);
      fsm.transitionTo('HAZARD_ZONE');

      // Vision mask active when solarShieldHp === 0
      expect(hazardSystem.isSandstormVisionMasked('HAZARD_ZONE', useGameStore.getState())).toBe(true);
      expect(hazardSystem.isRelayTowerAvailable('HAZARD_ZONE', 3, 0)).toBe(true);
      expect(hazardSystem.isRelayTowerAvailable('HAZARD_ZONE', 2, 0)).toBe(false);

      // Grant shield of 10 HP, advance 1s -> stormDps(1000)=15 -> 10 shield absorbed, 5 HP damage
      store.setSolarShield(10);
      expect(hazardSystem.isSandstormVisionMasked('HAZARD_ZONE', useGameStore.getState())).toBe(false);
      fsm.update(1);
      expect(useGameStore.getState().sandwalker.solarShieldHp).toBe(0);
      expect(useGameStore.getState().sandwalker.currentHp).toBe(995);
      expect(hazardSystem.isSandstormVisionMasked('HAZARD_ZONE', useGameStore.getState())).toBe(true);

      // Activate Solar Relay at 45% + 120/10800*100 -> jumps +30% (>= 70%) -> exits immediately!
      const relayRes = hazardSystem.activateSolarRelay(useGameStore.getState(), fsm);
      expect(relayRes.shieldGranted).toBe(500);
      expect(useGameStore.getState().sandwalker.solarShieldHp).toBe(500);
      expect(relayRes.exitedHazardZone).toBe(true);
      expect(useGameStore.getState().meta.hazardConsumed).toBe(true);
      expect(fsm.getCurrentStateId()).toBe('MARCH_NORMAL');
      expect(hazardSystem.isRelayTowerAvailable('HAZARD_ZONE', 3, 0)).toBe(false);

      // Re-entering [40%, 70%) with hazardConsumed = true stays in MARCH_NORMAL
      useGameStore.getState().setRouteProgress(55);
      fsm.update(0.1);
      expect(fsm.getCurrentStateId()).toBe('MARCH_NORMAL');
    });
  });

  describe('Great Sandworm (Act 4, 3 Phases) & 3 Mini-Bosses', () => {
    it('enforces D8 affinity rules on Sandworm P1/P2/P3 without mixing SINGLE_LARGE_BOSS into P1', () => {
      const worm = BOSS_DEFINITIONS.GREAT_SANDWORM;
      expect(worm.maxHp).toBe(7000);
      expect(worm.phases[0].tags).toEqual(['WORM_HEAD_SHELL']);
      expect(worm.phases[1].tags).toEqual(['EXPOSED_CORE']);
      expect(worm.phases[2].tags).toEqual(['SINGLE_LARGE_BOSS']);

      const lv1Harpoon = { turret: 'HARPOON' as const, level: 1, baseDamage: 55 };
      const lv1Heat = { turret: 'HEAT_RAY' as const, level: 1, baseDamage: 40 };
      const lv1Mortar = { turret: 'MORTAR' as const, level: 1, baseDamage: 52.5 };

      // P1: Harpoon 2.0x vs Heat Ray 0.6x
      expect(calculateDamage(lv1Harpoon, [...worm.phases[0].tags])).toBe(110);
      expect(calculateDamage(lv1Heat, [...worm.phases[0].tags])).toBe(24);
      // P2: Heat Ray 1.8x
      expect(calculateDamage(lv1Heat, [...worm.phases[1].tags])).toBe(72);
      // P3 Adds: Parasite 2.2x Mortar, Small Swarm 2.0x Mortar
      expect(calculateDamage(lv1Mortar, ['PARASITE'])).toBe(116); // round(52.5 * 2.2)
      expect(calculateDamage(lv1Mortar, ['SMALL_SWARM'])).toBe(105);
    });

    it('progresses Great Sandworm P1 -> Part Break -> 3s Groggy -> P2 -> P3 (3 waves) with monotonic HP & Dodge Boost avoidance', () => {
      const bus = new EventBus();
      const bossSystem = new BossSystem({ eventBus: bus });
      const particles = new ParticlePool(64);
      const camera = new CameraSystem();

      bossSystem.startEncounter(4);
      expect(bossSystem.getTotalHp()).toBe(7000);
      expect(bossSystem.getPhase()).toBe(1);
      expect(bossSystem.getArmor()).toBe(2000);

      // Advance until 1.5s lunge telegraph triggers
      let sawTelegraph = false;
      for (let i = 0; i < 40; i++) {
        const res = bossSystem.update(0.1, useGameStore.getState(), {
          isInvulnerable: true,
          particlePool: particles,
          cameraSystem: camera,
        });
        if (bossSystem.getDebugSnapshot()?.telegraphActive) {
          sawTelegraph = true;
        }
        // While Dodge Boost active, attack is completely evaded (0 hull damage)
        expect(res.hullDamage).toBe(0);
      }
      expect(sawTelegraph).toBe(true);

      // Without Dodge Boost, lunge deals 180 hull damage
      let hitDamage = 0;
      for (let i = 0; i < 50; i++) {
        const res = bossSystem.update(0.1, useGameStore.getState(), {
          isInvulnerable: false,
          particlePool: particles,
          cameraSystem: camera,
        });
        hitDamage += res.hullDamage;
        if (hitDamage > 0) break;
      }
      expect(hitDamage).toBe(180);

      // Break P1 armor -> Part Break drops + 3.0s Groggy
      const [p1Target] = bossSystem.getCombatTargets();
      p1Target.armor = 0;
      const partRewards = bossSystem.syncPostCombat();
      expect(partRewards).toEqual({ ancientGear: 5, templeKeys: 1 });
      expect(bossSystem.getDebugSnapshot()?.isGroggy).toBe(true);
      expect(bossSystem.getTotalHp()).toBe(7000);

      // 3.0s Groggy -> transitions to Phase 2 (monotonic HP 5000 <= 7000)
      for (let i = 0; i < 31; i++) {
        bossSystem.update(0.1, useGameStore.getState());
      }
      expect(bossSystem.getPhase()).toBe(2);
      expect(bossSystem.getTotalHp()).toBe(5000);

      // Defeat Phase 2 -> transitions to Phase 3 (monotonic HP 2000) & spawns 3 waves
      const [p2Target] = bossSystem.getCombatTargets();
      p2Target.hp = 0;
      p2Target.alive = false;
      bossSystem.syncPostCombat();
      expect(bossSystem.getPhase()).toBe(3);
      expect(bossSystem.getTotalHp()).toBe(2000);

      // Advance 9.5s in Phase 3 -> all 3 waves of PARASITE + SMALL_SWARM spawned
      for (let i = 0; i < 95; i++) {
        bossSystem.update(0.1, useGameStore.getState(), { isInvulnerable: true });
      }
      expect(bossSystem.getWavesSpawned()).toBe(3);
      expect(bossSystem.getCombatTargets().length > 1).toBe(true);

      // Defeat Phase 3 -> total HP 0, defeated
      bossSystem.applyManualDamage(2000);
      expect(bossSystem.getTotalHp()).toBe(0);
      expect(bossSystem.isDefeated()).toBe(true);
    });

    it('spawns 3 Mini-Bosses, unlocks Tarik & Lili on Act 1 clear (D9), supports manual weak-point aim, and orders Act advance after interstitial check', () => {
      const bus = new EventBus();
      const timers = new TimerService();
      const fsm = new GameFSM(timers, bus);
      const bossSystem = new BossSystem({ eventBus: bus });
      const coordinator = new CombatCoordinator({ eventBus: bus, bossSystem });

      const bossState = new BossEncounterState({ bossSystem });
      const settlementState = new OasisSettlementState();
      const hubState = new OasisHubState();
      fsm.registerState(bossState);
      fsm.registerState(settlementState);
      fsm.registerState(hubState);

      // Verify all 3 mini-boss definitions
      expect(getBossDefinitionForAct(1).id).toBe('VARKA_ARMORED_CAR');
      expect(getBossDefinitionForAct(2).id).toBe('SCORPION_REX');
      expect(getBossDefinitionForAct(3).id).toBe('MIRAGE_SPIRIT_KING');

      // Act 1 Boss Encounter + manual drag-aim weak-point lock (single target, no double-dip)
      const store = useGameStore.getState();
      store.setAct(1);
      store.setOasisIndex(2); // 3rd oasis of Act 1 -> clearing advances Act 1 -> 2 on dismiss
      store.setPlayTime(1200);
      store.unlockMercenary('harun');
      store.unlockMercenary('sera');
      store.unlockMercenary('zara');

      fsm.transitionTo('BOSS_ENCOUNTER');
      coordinator.update(0.016, 'BOSS_ENCOUNTER', useGameStore.getState(), useGameStore.getState());
      const targets = coordinator.getAllTargets();
      expect(targets.length).toBe(1);

      const wpX = targets[0].x + (targets[0].weakPointOffset?.x ?? 0);
      const wpY = targets[0].y + (targets[0].weakPointOffset?.y ?? 0);
      const snapped = coordinator.onAimPointerDown(
        wpX + 10,
        wpY - 10,
        useGameStore.getState().setManualAimTarget
      );
      expect(snapped?.id).toBe(targets[0].id);

      const dbg = coordinator.getDebugSnapshot('BOSS_ENCOUNTER', useGameStore.getState());
      expect(dbg.boss?.id).toBe('VARKA_ARMORED_CAR');
      expect(dbg.recentDamageEvents.length >= 0).toBe(true);

      // Defeat Act 1 Boss -> D9 unlocks Tarik & Lili -> 5-Mercenary Synergy active!
      bossState.damageBoss(2000);
      fsm.update(0.016);
      expect(fsm.getCurrentStateId()).toBe('OASIS_SETTLEMENT');
      const postBoss = useGameStore.getState();
      expect(postBoss.mercenaries.find((m) => m.id === 'tarik')?.isUnlocked).toBe(true);
      expect(postBoss.mercenaries.find((m) => m.id === 'lili')?.isUnlocked).toBe(true);
      expect(postBoss.mercenaries.every((m) => m.isUnlocked)).toBe(true);

      // Dismiss Settlement: evaluates shouldShowInterstitialAd while currentAct === 1 (blocked -> no ad modal),
      // THEN advances Act 1 -> 2 when currentOasisIndex >= currentAct * 3
      const adStates: boolean[] = [];
      const unsubAd = adSimulator.subscribe((s) => {
        if (s.isOpen) adStates.push(true);
      });
      settlementState.dismissSettlement(fsm);
      unsubAd();
      expect(adStates.length).toBe(0);
      expect(useGameStore.getState().meta.currentAct).toBe(2);
      expect(fsm.getCurrentStateId()).toBe('OASIS_HUB');

      // Mirage Spirit King spawns clones in Act 3
      bossSystem.startEncounter(3);
      for (let i = 0; i < 30; i++) {
        bossSystem.update(0.1, useGameStore.getState(), { isInvulnerable: true });
      }
      expect(bossSystem.getAdds().some((a) => a.kind === 'MIRAGE_CLONE')).toBe(true);
      coordinator.dispose();
    });
  });

  describe('EmergencyRevive Boss Preservation, Timer Race Fix & Zero-Ad Retreat', () => {
    it('cancels 5s auto-retreat timer via pauseCountdown during Tier 0 3s ad and preserves boss phase/HP/armor', () => {
      vi.useFakeTimers();
      const bus = new EventBus();
      const timers = new TimerService();
      const fsm = new GameFSM(timers, bus);
      const bossSystem = new BossSystem({ eventBus: bus });
      const bossState = new BossEncounterState({ bossSystem });
      const reviveState = new EmergencyReviveState();
      const hubState = new OasisHubState();
      fsm.registerState(bossState);
      fsm.registerState(reviveState);
      fsm.registerState(hubState);

      const store = useGameStore.getState();
      store.setAct(4);
      fsm.transitionTo('BOSS_ENCOUNTER');

      // Advance Sandworm to Phase 2 and reduce HP to 3800
      const [p1] = bossSystem.getCombatTargets();
      p1.armor = 0;
      bossSystem.syncPostCombat();
      for (let i = 0; i < 31; i++) {
        bossSystem.update(0.1, useGameStore.getState());
      }
      bossState.damageBoss(1200); // P2 3000 -> 1800, total HP 5000 -> 3800
      fsm.update(0.016);
      expect(bossState.bossPhase).toBe(2);
      expect(bossState.bossHp).toBe(3800);

      // Player dies -> EMERGENCY_REVIVE
      useGameStore.getState().setHp(0);
      fsm.update(0.016);
      expect(fsm.getCurrentStateId()).toBe('EMERGENCY_REVIVE');

      // Advance 3s (remainingSeconds = 2), then user clicks Accept -> pauseCountdown
      for (let i = 0; i < 3; i++) {
        vi.advanceTimersByTime(1000);
      }
      expect(reviveState.remainingSeconds).toBe(2);
      reviveState.pauseCountdown(fsm);

      // Advance another 5s while watching Tier 0 3s ad -> must NOT auto-retreat
      for (let i = 0; i < 5; i++) {
        vi.advanceTimersByTime(1000);
      }
      expect(fsm.getCurrentStateId()).toBe('EMERGENCY_REVIVE');

      // Complete revive -> back to BOSS_ENCOUNTER with 50% HP and preserved phase 2 & 3800 HP
      reviveState.acceptRevive(fsm);
      expect(fsm.getCurrentStateId()).toBe('BOSS_ENCOUNTER');
      expect(useGameStore.getState().sandwalker.currentHp).toBe(500);
      expect(bossSystem.getPhase()).toBe(2);
      expect(bossSystem.getTotalHp()).toBe(3800);
    });

    it('retreats to OASIS_HUB with 50% cargo loss floored, keeps gold/gears, 0 oasisArrivalCount++, and 0 forced ads', () => {
      const adOpened: boolean[] = [];
      const unsubAd = adSimulator.subscribe((s) => {
        if (s.isOpen) adOpened.push(true);
      });

      const timers = new TimerService();
      const fsm = new GameFSM(timers);
      const march = new MarchNormalState();
      const revive = new EmergencyReviveState();
      const hub = new OasisHubState();
      fsm.registerState(march);
      fsm.registerState(revive);
      fsm.registerState(hub);

      const store = useGameStore.getState();
      store.setAct(2);
      store.setPlayTime(1200);
      store.incrementOasisArrival();
      store.incrementOasisArrival(); // arrivalCount = 2 -> interstitial WOULD show if settlement occurred
      store.addCurrencies({ sunGold: 777, ancientGear: 12 });
      store.setCargo([{ goodsId: 'SPICE', qty: 11, buyPrice: 100 }]);
      store.setRouteProgress(50);

      fsm.transitionTo('MARCH_NORMAL');
      useGameStore.getState().setHp(0);
      fsm.update(0.016);
      expect(fsm.getCurrentStateId()).toBe('EMERGENCY_REVIVE');

      revive.retreat(fsm);
      unsubAd();
      expect(fsm.getCurrentStateId()).toBe('OASIS_HUB');
      const finalState = useGameStore.getState();
      expect(finalState.trade.cargo[0].qty).toBe(5); // floor(11 * 0.5)
      expect(finalState.currencies.sunGold).toBe(777);
      expect(finalState.currencies.ancientGear).toBe(12);
      expect(finalState.meta.oasisArrivalCount).toBe(2);
      expect(finalState.meta.routeProgress).toBe(0);
      expect(adOpened.length).toBe(0);
    });
  });

  describe('Node Canvas Mock Smoke Render (drawBoss)', () => {
    it('renders all 4 bosses and Great Sandworm P1/P2/P3 + Groggy + Telegraph cleanly in Node', () => {
      const ctx = createMockCtx();
      const bossSystem = new BossSystem();

      for (const act of [1, 2, 3, 4]) {
        bossSystem.startEncounter(act);
        if (act === 3) {
          for (let i = 0; i < 30; i++) bossSystem.update(0.1, useGameStore.getState());
        }
        const snap = bossSystem.getRenderSnapshot();
        expect(snap).not.toBeNull();
        drawBoss(ctx, snap, snap!.targetId, 1.25);
      }

      // Sandworm P1 telegraph + Groggy + P2 breath + P3 waves
      bossSystem.startEncounter(4);
      for (let i = 0; i < 25; i++) bossSystem.update(0.1, useGameStore.getState());
      drawBoss(ctx, bossSystem.getRenderSnapshot(), null, 2.0);

      const [p1] = bossSystem.getCombatTargets();
      p1.armor = 0;
      bossSystem.syncPostCombat();
      drawBoss(ctx, bossSystem.getRenderSnapshot(), null, 2.5); // Groggy

      for (let i = 0; i < 31; i++) bossSystem.update(0.1, useGameStore.getState());
      for (let i = 0; i < 25; i++) bossSystem.update(0.1, useGameStore.getState());
      drawBoss(ctx, bossSystem.getRenderSnapshot(), null, 5.0); // P2 breath

      const [p2] = bossSystem.getCombatTargets();
      p2.hp = 0;
      p2.alive = false;
      bossSystem.syncPostCombat();
      bossSystem.update(0.1, useGameStore.getState());
      drawBoss(ctx, bossSystem.getRenderSnapshot(), null, 7.0); // P3 parasites

      expect((ctx.fill as ReturnType<typeof vi.fn>).mock.calls.length > 20).toBe(true);
      expect((ctx.stroke as ReturnType<typeof vi.fn>).mock.calls.length > 10).toBe(true);
      expect((ctx.fillRect as ReturnType<typeof vi.fn>).mock.calls.length > 10).toBe(true);
    });
  });

  describe('M4 Remediation Regressions (Fixes 1-4)', () => {
    it('Fix 1: keeps auto-aim boss hits at 1.0x weak-point multiplier while awarding 1.5x only on manual lock and preserving boss snap priority', () => {
      const bus = new EventBus();
      const bossSystem = new BossSystem({ eventBus: bus });
      const coordinator = new CombatCoordinator({ eventBus: bus, bossSystem });

      const damageEvents: Array<{ targetId: string; amount: number; isWeakPoint: boolean }> = [];
      bus.on('damage:dealt', (ev) => {
        if (ev.source === 'TURRET') {
          damageEvents.push({
            targetId: ev.targetId,
            amount: ev.amount,
            isWeakPoint: ev.isWeakPoint,
          });
        }
      });

      // 1) Act 1 Varka Armored Car + Lv1 Harpoon: unlocked = 121 (55 * 2.2), manual lock = 182
      useGameStore.getState().setAct(1);
      coordinator.requestTurretSwitch('HARPOON', useGameStore.getState());
      bossSystem.startEncounter(1);

      for (let i = 0; i < 40 && damageEvents.length === 0; i++) {
        coordinator.update(0.05, 'BOSS_ENCOUNTER', useGameStore.getState(), useGameStore.getState());
      }
      expect(damageEvents.length).toBe(1);
      expect(damageEvents[0].amount).toBe(121);
      expect(damageEvents[0].isWeakPoint).toBe(false);

      // Verify boss target (snapPriority: true) still beats closer regular enemy within 40px
      const [varkaTarget] = bossSystem.getCombatTargets();
      const varkaWpX = varkaTarget.x + (varkaTarget.weakPointOffset?.x ?? 0);
      const varkaWpY = varkaTarget.y + (varkaTarget.weakPointOffset?.y ?? 0);
      const closerRegular = {
        id: 'closer_add',
        x: varkaWpX + 1,
        y: varkaWpY + 1,
        radius: 14,
        hp: 50,
        maxHp: 50,
        tags: ['SMALL_SWARM' as const],
        isWeakPoint: false,
        alive: true,
      };
      expect(findSnapTarget(varkaWpX + 2, varkaWpY + 2, [closerRegular, varkaTarget])?.id).toBe(
        varkaTarget.id
      );

      // Manual lock -> next Harpoon hit deals 182 with isWeakPoint: true
      const locked = coordinator.onAimPointerDown(
        varkaWpX + 8,
        varkaWpY - 8,
        useGameStore.getState().setManualAimTarget
      );
      expect(locked?.id).toBe(varkaTarget.id);
      coordinator.onAimPointerUp();

      for (let i = 0; i < 40 && damageEvents.length < 2; i++) {
        coordinator.update(0.05, 'BOSS_ENCOUNTER', useGameStore.getState(), useGameStore.getState());
      }
      expect(damageEvents.length).toBe(2);
      expect(damageEvents[1].amount).toBe(182);
      expect(damageEvents[1].isWeakPoint).toBe(true);

      // 2) Act 4 Great Sandworm P1 (Harpoon: 110 auto vs 165 manual) & P2 (Heat Ray: 7 auto vs 11 manual)
      damageEvents.length = 0;
      useGameStore.getState().setManualAimTarget(null);
      coordinator.turretSystem.clearProjectilesAndLock();
      useGameStore.getState().setAct(4);
      bossSystem.startEncounter(4);

      for (let i = 0; i < 40 && damageEvents.length === 0; i++) {
        coordinator.update(0.05, 'BOSS_ENCOUNTER', useGameStore.getState(), useGameStore.getState());
      }
      expect(damageEvents[0].amount).toBe(110);
      expect(damageEvents[0].isWeakPoint).toBe(false);

      const [wormP1] = bossSystem.getCombatTargets();
      coordinator.onAimPointerDown(
        wormP1.x + (wormP1.weakPointOffset?.x ?? 0),
        wormP1.y + (wormP1.weakPointOffset?.y ?? 0),
        useGameStore.getState().setManualAimTarget
      );
      coordinator.onAimPointerUp();

      for (let i = 0; i < 40 && damageEvents.length < 2; i++) {
        coordinator.update(0.05, 'BOSS_ENCOUNTER', useGameStore.getState(), useGameStore.getState());
      }
      expect(damageEvents[1].amount).toBe(165);
      expect(damageEvents[1].isWeakPoint).toBe(true);

      // Advance Sandworm to P2 and switch to Heat Ray
      wormP1.armor = 0;
      bossSystem.syncPostCombat();
      for (let i = 0; i < 31; i++) {
        bossSystem.update(0.1, useGameStore.getState());
      }
      expect(bossSystem.getPhase()).toBe(2);

      damageEvents.length = 0;
      coordinator.turretSystem.clearProjectilesAndLock(useGameStore.getState().setManualAimTarget);
      // Wait for turret switch cooldown if any, then switch to HEAT_RAY
      for (let i = 0; i < 10; i++) {
        coordinator.update(0.05, 'OASIS_HUB', useGameStore.getState(), useGameStore.getState());
      }
      expect(coordinator.requestTurretSwitch('HEAT_RAY', useGameStore.getState())).toBe(true);
      coordinator.setExtraTargets(bossSystem.getCombatTargets());

      for (let i = 0; i < 10 && damageEvents.length === 0; i++) {
        coordinator.update(0.05, 'BOSS_ENCOUNTER', useGameStore.getState(), useGameStore.getState());
      }
      expect(damageEvents[0].amount).toBe(7);
      expect(damageEvents[0].isWeakPoint).toBe(false);

      const [wormP2] = bossSystem.getCombatTargets();
      coordinator.onAimPointerDown(
        wormP2.x + (wormP2.weakPointOffset?.x ?? 0),
        wormP2.y + (wormP2.weakPointOffset?.y ?? 0),
        useGameStore.getState().setManualAimTarget
      );
      coordinator.onAimPointerUp();

      const preManualCount = damageEvents.length;
      for (let i = 0; i < 10 && damageEvents.length === preManualCount; i++) {
        coordinator.update(0.05, 'BOSS_ENCOUNTER', useGameStore.getState(), useGameStore.getState());
      }
      expect(damageEvents[preManualCount].amount).toBe(11);
      expect(damageEvents[preManualCount].isWeakPoint).toBe(true);

      coordinator.dispose();
    });

    it('Fix 2: makes HazardSystem.activateSolarRelay idempotent and rejects calls outside HAZARD_ZONE', () => {
      const hazardSystem = new HazardSystem();
      const timers = new TimerService();
      const fsm = new GameFSM(timers);
      fsm.registerState(new MarchNormalState());
      fsm.registerState(new HazardZoneState({ hazardSystem }));
      fsm.registerState(new EmergencyReviveState());

      const store = useGameStore.getState();
      store.setAct(3);
      store.setOasisIndex(0);
      store.setRouteProgress(35);
      fsm.transitionTo('HAZARD_ZONE');

      // First call at 35% -> +500 shield, +30% progress (65%), stays in HAZARD_ZONE
      const first = hazardSystem.activateSolarRelay(useGameStore.getState(), fsm);
      expect(first).toEqual({
        shieldGranted: 500,
        totalShieldHp: 500,
        nextProgress: 65,
        exitedHazardZone: false,
      });
      expect(hazardSystem.isRelayActivated()).toBe(true);
      expect(fsm.getCurrentStateId()).toBe('HAZARD_ZONE');

      // Second call on same route -> strict zero-mutation no-op
      const second = hazardSystem.activateSolarRelay(useGameStore.getState(), fsm);
      expect(second).toEqual({
        shieldGranted: 0,
        totalShieldHp: 500,
        nextProgress: 65,
        exitedHazardZone: false,
      });
      expect(useGameStore.getState().sandwalker.solarShieldHp).toBe(500);
      expect(useGameStore.getState().meta.routeProgress).toBe(65);

      // Fresh route: Sandstorm DoT kills Sandwalker -> EMERGENCY_REVIVE -> activateSolarRelay is no-op
      hazardSystem.resetForNewRoute();
      useGameStore.getState().setSolarShield(0);
      useGameStore.getState().setRouteProgress(45);
      useGameStore.getState().setHp(1);
      fsm.update(1);
      expect(fsm.getCurrentStateId()).toBe('EMERGENCY_REVIVE');

      const outOfStateRevive = hazardSystem.activateSolarRelay(useGameStore.getState(), fsm);
      expect(outOfStateRevive).toEqual({
        shieldGranted: 0,
        totalShieldHp: 0,
        nextProgress: 45,
        exitedHazardZone: false,
      });
      expect(hazardSystem.isRelayActivated()).toBe(false);
      expect(useGameStore.getState().sandwalker.solarShieldHp).toBe(0);
      expect(useGameStore.getState().meta.routeProgress).toBe(45);

      // Also blocked in MARCH_NORMAL
      fsm.transitionTo('MARCH_NORMAL');
      const outOfStateMarch = hazardSystem.activateSolarRelay(useGameStore.getState(), fsm);
      expect(outOfStateMarch.shieldGranted).toBe(0);
      expect(hazardSystem.isRelayActivated()).toBe(false);
    });

    it('Fix 3: preserves mid-Groggy, P1 0-HP Groggy, P3 wavesSpawned, and CombatCoordinator targets across EmergencyRevive', () => {
      const bus = new EventBus();
      const timers = new TimerService();
      const fsm = new GameFSM(timers, bus);
      const bossSystem = new BossSystem({ eventBus: bus });
      const coordinator = new CombatCoordinator({ eventBus: bus, bossSystem });
      const bossState = new BossEncounterState({ bossSystem });
      const reviveState = new EmergencyReviveState();
      fsm.registerState(bossState);
      fsm.registerState(reviveState);

      // 1) Sandworm P1 mid-Groggy resume & CombatCoordinator target sync
      useGameStore.getState().setAct(4);
      fsm.transitionTo('BOSS_ENCOUNTER');
      const [p1] = bossSystem.getCombatTargets();
      p1.armor = 0;
      const initialRewards = bossSystem.syncPostCombat();
      expect(initialRewards).toEqual({ ancientGear: 5, templeKeys: 1 });
      expect(bossSystem.getIsGroggy()).toBe(true);

      // Step 1.0s into 3.0s Groggy (~2.0s left), then die
      bossSystem.update(1.0, useGameStore.getState());
      expect(bossSystem.getGroggyRemainingSec()).toBeCloseTo(2.0, 2);

      useGameStore.getState().setHp(0);
      fsm.update(0.016);
      expect(fsm.getCurrentStateId()).toBe('EMERGENCY_REVIVE');

      reviveState.acceptRevive(fsm);
      expect(fsm.getCurrentStateId()).toBe('BOSS_ENCOUNTER');
      expect(bossSystem.getPhase()).toBe(1);
      expect(bossSystem.getIsGroggy()).toBe(true);
      expect(bossSystem.getGroggyRemainingSec()).toBeCloseTo(2.0, 2);
      expect(bossSystem.isPartBreakTriggered()).toBe(true);
      expect(bossSystem.syncPostCombat()).toEqual({ ancientGear: 0, templeKeys: 0 });
      expect(coordinator.getAllTargets().map((t) => t.id)).toEqual(
        bossSystem.getCombatTargets().map((t) => t.id)
      );

      // Finish remaining 2.0s Groggy -> transitions to Phase 2
      for (let i = 0; i < 21; i++) {
        bossSystem.update(0.1, useGameStore.getState());
      }
      expect(bossSystem.getPhase()).toBe(2);
      expect(bossSystem.getIsGroggy()).toBe(false);

      // 2) Scorpion Rex (Act 2) mid-Groggy resume
      useGameStore.getState().setAct(2);
      useGameStore.getState().setHp(1000);
      fsm.transitionTo('BOSS_ENCOUNTER');
      const [scorp] = bossSystem.getCombatTargets();
      scorp.armor = 0;
      bossSystem.syncPostCombat();
      bossSystem.update(0.5, useGameStore.getState()); // 1.5s -> 1.0s
      useGameStore.getState().setHp(0);
      fsm.update(0.016);
      reviveState.acceptRevive(fsm);
      expect(bossSystem.getIsGroggy()).toBe(true);
      expect(bossSystem.getGroggyRemainingSec()).toBeCloseTo(1.0, 2);

      // 3) Synthetic P1 0-HP resume (bossHp: 5000, bossPhase: 1, bossArmor: 0)
      bossSystem.startEncounter(4, { bossHp: 5000, bossPhase: 1, bossArmor: 0 });
      expect(bossSystem.getPhase()).toBe(1);
      expect(bossSystem.getTotalHp()).toBe(5000);
      expect(bossSystem.getIsGroggy()).toBe(true);
      expect(bossSystem.getCombatTargets().length).toBe(0);
      for (let i = 0; i < 35; i++) {
        const tick = bossSystem.update(0.1, useGameStore.getState());
        expect(tick.hullDamage).toBe(0);
        expect(bossSystem.getDebugSnapshot()?.telegraphActive).toBe(false);
      }
      expect(bossSystem.getPhase()).toBe(2);
      expect(bossSystem.getTotalHp()).toBe(5000);

      // Synthetic P2 0-HP resume (groggyDurationSec: 0) advances cleanly to P3
      bossSystem.startEncounter(4, { bossHp: 2000, bossPhase: 2 });
      expect(bossSystem.getPhase()).toBe(3);
      expect(bossSystem.getTotalHp()).toBe(2000);

      // 4) Sandworm P3 wavesSpawned resume (no wave replay after all 3 waves spawned)
      useGameStore.getState().setAct(4);
      useGameStore.getState().setHp(1000);
      fsm.transitionTo('BOSS_ENCOUNTER');
      bossSystem.startEncounter(4, { bossHp: 2000, bossPhase: 3 });
      for (let i = 0; i < 95; i++) {
        bossSystem.update(0.1, useGameStore.getState(), { isInvulnerable: true });
      }
      expect(bossSystem.getWavesSpawned()).toBe(3);

      useGameStore.getState().setHp(0);
      fsm.update(0.016);
      reviveState.acceptRevive(fsm);
      expect(bossSystem.getPhase()).toBe(3);
      expect(bossSystem.getWavesSpawned()).toBe(3);
      expect(bossSystem.getAdds().length).toBe(0);

      for (let i = 0; i < 100; i++) {
        bossSystem.update(0.1, useGameStore.getState(), { isInvulnerable: true });
      }
      expect(bossSystem.getWavesSpawned()).toBe(3);
      expect(bossSystem.getAdds().length).toBe(0);

      coordinator.dispose();
    });

    it('Fix 4: guards drawBoss against non-finite values, aligns Groggy reticle slumpY, and avoids duplicate boss camera shake', () => {
      const assertFiniteArgs = (name: string, args: number[]) => {
        for (const v of args) {
          if (!Number.isFinite(v)) {
            throw new Error(`Non-finite arg in ${name}: ${v}`);
          }
        }
      };
      const baseCtx = createMockCtx();
      const grad = { addColorStop: vi.fn() };
      const strictCtx = {
        ...baseCtx,
        translate: vi.fn((x: number, y: number) => assertFiniteArgs('translate', [x, y])),
        scale: vi.fn((x: number, y: number) => assertFiniteArgs('scale', [x, y])),
        arc: vi.fn((x: number, y: number, r: number, s: number, e: number) =>
          assertFiniteArgs('arc', [x, y, r, s, e])
        ),
        ellipse: vi.fn((x: number, y: number, rx: number, ry: number, rot: number, s: number, e: number) =>
          assertFiniteArgs('ellipse', [x, y, rx, ry, rot, s, e])
        ),
        fillRect: vi.fn((x: number, y: number, w: number, h: number) =>
          assertFiniteArgs('fillRect', [x, y, w, h])
        ),
        strokeRect: vi.fn((x: number, y: number, w: number, h: number) =>
          assertFiniteArgs('strokeRect', [x, y, w, h])
        ),
        moveTo: vi.fn((x: number, y: number) => assertFiniteArgs('moveTo', [x, y])),
        lineTo: vi.fn((x: number, y: number) => assertFiniteArgs('lineTo', [x, y])),
        quadraticCurveTo: vi.fn((cx: number, cy: number, x: number, y: number) =>
          assertFiniteArgs('quadraticCurveTo', [cx, cy, x, y])
        ),
        createRadialGradient: vi.fn((x0: number, y0: number, r0: number, x1: number, y1: number, r1: number) => {
          assertFiniteArgs('createRadialGradient', [x0, y0, r0, x1, y1, r1]);
          return grad;
        }),
        createLinearGradient: vi.fn((x0: number, y0: number, x1: number, y1: number) => {
          assertFiniteArgs('createLinearGradient', [x0, y0, x1, y1]);
          return grad;
        }),
      } as unknown as CanvasRenderingContext2D;

      const bossSystem = new BossSystem();
      bossSystem.startEncounter(4);
      const validSnap = bossSystem.getRenderSnapshot()!;

      // NaN / Infinity / negative radius cases must not throw or call Canvas APIs with non-finite args
      drawBoss(strictCtx, { ...validSnap, x: Number.NaN }, null, 1);
      drawBoss(strictCtx, { ...validSnap, y: Number.POSITIVE_INFINITY }, null, 1);
      drawBoss(strictCtx, { ...validSnap, radius: -5 }, null, 1);
      drawBoss(strictCtx, { ...validSnap, hp: Number.NaN }, null, 1);
      drawBoss(
        strictCtx,
        { ...validSnap, phase: 2, weakPointOffset: { x: Number.NaN, y: 0 } },
        null,
        1
      );
      drawBoss(strictCtx, validSnap, null, Number.NaN);

      // Malformed adds are skipped cleanly while boss still renders
      drawBoss(
        strictCtx,
        {
          ...validSnap,
          phase: 2,
          adds: [
            {
              id: 'bad_add',
              kind: 'PARASITE',
              x: Number.NaN,
              y: 250,
              baseY: 250,
              vx: 0,
              radius: 10,
              hp: 10,
              maxHp: 10,
              tags: ['PARASITE'],
              alive: true,
              animPhase: 0,
              attackTimer: 1,
              attackInterval: 1,
              attackDamage: 10,
              explodeOnContact: true,
            },
          ],
        },
        null,
        1
      );

      // Locked weak-point ring aligns with Groggy slumpY (+18)
      const [p1] = bossSystem.getCombatTargets();
      p1.armor = 0;
      bossSystem.syncPostCombat();
      const groggySnap = bossSystem.getRenderSnapshot()!;
      expect(groggySnap.isGroggy).toBe(true);
      expect(p1.weakPointOffset?.y).toBe(groggySnap.weakPointOffset.y + 18);

      const arcMock = strictCtx.arc as ReturnType<typeof vi.fn>;
      const prevArcCalls = arcMock.mock.calls.length;
      drawBoss(strictCtx, groggySnap, groggySnap.targetId, 1.5);
      const lockedRingCall = arcMock.mock.calls
        .slice(prevArcCalls)
        .find((c: unknown[]) => c[2] === 10);
      expect(lockedRingCall !== undefined).toBe(true);
      expect(lockedRingCall![0]).toBe(groggySnap.x + groggySnap.weakPointOffset.x);
      expect(lockedRingCall![1]).toBe(groggySnap.y + 18 + groggySnap.weakPointOffset.y);

      // Single camera shake per boss attack even when EventBus 'camera:shake' listener is attached
      const bus = new EventBus();
      const camera = new CameraSystem();
      const origShake = camera.shake.bind(camera);
      const shakeMock = vi.fn((intensity: number, duration: number) => {
        origShake(intensity, duration);
      });
      camera.shake = shakeMock;
      const unsubShake = bus.on('camera:shake', ({ intensity, duration }) => {
        camera.shake(intensity, duration);
      });
      const shakeBoss = new BossSystem({ eventBus: bus });
      shakeBoss.startEncounter(4);

      for (let i = 0; i < 60; i++) {
        const res = shakeBoss.update(0.1, useGameStore.getState(), {
          isInvulnerable: false,
          cameraSystem: camera,
        });
        if (res.hullDamage > 0) break;
      }
      unsubShake();
      expect(shakeMock.mock.calls.length).toBe(1);
    });
  });
});
