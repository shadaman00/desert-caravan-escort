import { describe, it, expect, beforeEach } from 'vitest';
import { EventBus } from '@/engine/EventBus';
import { AutoUpgradeEngine } from '@/engine/systems/AutoUpgradeEngine';
import { BossSystem } from '@/engine/systems/BossSystem';
import { HazardSystem } from '@/engine/systems/HazardSystem';
import { RouteSystem } from '@/engine/systems/RouteSystem';
import {
  TEMPLE_COMMEMORATIVE_RELIC_ID,
  evaluateTempleGate,
  getDepthModifiers,
  rollGoldenTradePriceRate,
} from '@/engine/systems/EndlessExpeditionSystem';
import { useGameStore } from '@/store/gameStore';

describe('Phase 4: Sun Temple Gate, Ending Sequence & Endless Deep Desert', () => {
  beforeEach(() => {
    useGameStore.getState().resetToDefaults();
    useGameStore.getState().setIntroCompleted(true);
  });

  it('evaluates Sun Temple unlock gate and missing currency acquisition guides', () => {
    const locked = evaluateTempleGate({ mapFragments: 7, templeKeys: 2 });
    expect(locked.canUnlock).toBe(false);
    expect(locked.missingGuides).toHaveLength(2);

    const onlyKeysMissing = evaluateTempleGate({ mapFragments: 10, templeKeys: 1 });
    expect(onlyKeysMissing.canUnlock).toBe(false);
    expect(onlyKeysMissing.missingGuides).toHaveLength(1);

    const unlocked = evaluateTempleGate({ mapFragments: 10, templeKeys: 3 });
    expect(unlocked.canUnlock).toBe(true);
    expect(unlocked.missingGuides).toHaveLength(0);
  });

  it('computes endless depth modifiers, boss rotations, dual mutations, and golden trade rates', () => {
    const d1 = getDepthModifiers(1);
    expect(d1.bossRotationAct).toBe(1);
    expect(d1.mutationKind).toBe('QUICKSAND_SURGE');
    expect(d1.hasQuicksand).toBe(true);
    expect(d1.hasSandstorm).toBe(false);
    expect(d1.hpMultiplier).toBe(1.35);

    const d2 = getDepthModifiers(2);
    expect(d2.bossRotationAct).toBe(2);
    expect(d2.mutationKind).toBe('SOLAR_TEMPEST');
    expect(d2.hasSandstorm).toBe(true);
    expect(d2.stormDotMultiplier).toBe(1.25);

    const d3 = getDepthModifiers(3);
    expect(d3.bossRotationAct).toBe(3);
    expect(d3.mutationKind).toBe('DUAL_STORM_QUICKSAND');
    expect(d3.hasQuicksand).toBe(true);
    expect(d3.hasSandstorm).toBe(true);

    expect(getDepthModifiers(5).bossRotationAct).toBe(1);

    expect(rollGoldenTradePriceRate(() => 0)).toBe(2.0);
    expect(rollGoldenTradePriceRate(() => 1)).toBe(4.0);
    expect(rollGoldenTradePriceRate(() => 0.5)).toBe(3.0);
  });

  it('manages store temple ending, commemorative relic registration, depth progression & auto-upgrades', () => {
    const bus = new EventBus();
    const autoEngine = new AutoUpgradeEngine({ eventBus: bus });

    expect(useGameStore.getState().unlockTempleGate()).toBe(false);

    useGameStore.getState().addCurrencies({ mapFragments: 10, templeKeys: 3 });
    expect(useGameStore.getState().unlockTempleGate()).toBe(true);
    expect(useGameStore.getState().endgame?.templeGateUnlocked).toBe(true);

    expect(useGameStore.getState().triggerTempleEnding()).toBe(true);
    // Idempotent: second trigger returns false & does not duplicate relic
    expect(useGameStore.getState().triggerTempleEnding()).toBe(false);

    const afterEnding = useGameStore.getState();
    expect(afterEnding.endgame?.endingCompleted).toBe(true);
    expect(afterEnding.endgame?.pendingEndingModal).toBe(true);
    expect(afterEnding.endgame?.endlessUnlocked).toBe(true);
    expect(afterEnding.endgame?.goldenTradeActive).toBe(true);
    expect(
      afterEnding.relics.codex.filter((id) => id === TEMPLE_COMMEMORATIVE_RELIC_ID)
    ).toHaveLength(1);

    afterEnding.dismissEndingModal(true);
    expect(useGameStore.getState().endgame?.pendingEndingModal).toBe(false);
    expect(useGameStore.getState().endgame?.endlessActive).toBe(true);

    const adv = useGameStore.getState().advanceEndlessDepth();
    expect(adv).toEqual({ clearedDepth: 1, nextDepth: 2 });
    expect(useGameStore.getState().endgame?.maxDepthCleared).toBe(1);

    const beforeAutoCount = useGameStore.getState().progression?.recentAutoUpgrades.length ?? 0;
    bus.emit('endgame:depthCleared', { clearedDepth: 2, nextDepth: 3, bonusGold: 595 });
    expect(useGameStore.getState().progression?.recentAutoUpgrades.length).toBeGreaterThan(
      beforeAutoCount
    );

    autoEngine.dispose();
  });

  it('scales BossSystem HP and activates simultaneous dual-gimmick hazards on Depth 3', () => {
    const boss = new BossSystem();
    boss.startEncounter(1);
    const baseHp = boss.getMaxHp();

    boss.startEncounter(1, undefined, { hpMultiplier: 2.05, damageMultiplier: 1.54 });
    expect(boss.getMaxHp()).toBeGreaterThan(baseHp);
    expect(boss.getTotalHp()).toBe(boss.getMaxHp());

    // Configure Endless Depth 3 (DUAL_STORM_QUICKSAND)
    useGameStore.getState().addCurrencies({ mapFragments: 10, templeKeys: 3 });
    useGameStore.getState().triggerTempleEnding();
    useGameStore.getState().dismissEndingModal(true);
    useGameStore.getState().advanceEndlessDepth();
    useGameStore.getState().advanceEndlessDepth();

    const store = useGameStore.getState();
    const routeSystem = new RouteSystem();
    const hazardSystem = new HazardSystem();

    const snap = routeSystem.update(0.1, 'HAZARD_ZONE', store);
    expect(snap.isQuicksandSlowed).toBe(true);
    expect(snap.isSandstorm).toBe(true);
    expect(snap.isSandstormVisionMasked).toBe(true);
    expect(hazardSystem.isRelayTowerAvailable('HAZARD_ZONE', 4, 0, true, 3)).toBe(true);
    expect(hazardSystem.isSandstormVisionMasked('HAZARD_ZONE', store)).toBe(true);
  });
});
