import { describe, it, expect, beforeEach } from 'vitest';
import { EventBus } from '@/engine/EventBus';
import { AutoUpgradeEngine } from '@/engine/systems/AutoUpgradeEngine';
import { LootPickupSystem } from '@/engine/systems/LootPickupSystem';
import { migrate } from '@/persistence/migrate';
import { CURRENT_SAVE_VERSION, getDefaultState } from '@/store/defaults';
import { useGameStore } from '@/store/gameStore';

describe('Phase 1: Auto-Upgrade Engine, Loot Pickup & v2 Save Migration', () => {
  beforeEach(() => {
    useGameStore.getState().resetToDefaults();
    useGameStore.getState().setIntroCompleted(true);
    useGameStore.getState().unlockMercenary('harun');
    useGameStore.getState().unlockMercenary('sera');
  });

  it('migrates v1 save envelopes cleanly to saveVersion 2 with default progression & passives', () => {
    const v1Base = getDefaultState();
    delete (v1Base as { progression?: unknown }).progression;
    delete (v1Base as { explorerPassives?: unknown }).explorerPassives;
    v1Base.currencies.sunGold = 450;
    v1Base.sandwalker.turretLevels.HARPOON = 7;

    const result = migrate({
      v: 1,
      savedAt: 1700000000000,
      state: v1Base,
    });

    expect(result.success).toBe(true);
    expect(result.state.meta.saveVersion).toBe(CURRENT_SAVE_VERSION);
    expect(CURRENT_SAVE_VERSION).toBe(2);
    expect(result.state.currencies.sunGold).toBe(450);
    expect(result.state.sandwalker.turretLevels.HARPOON).toBe(7);
    expect(result.state.progression?.autoInvestPolicy).toBe('MANUAL');
    expect(result.state.progression?.completedMilestones).toEqual([]);
    expect(result.state.explorerPassives).toEqual({
      appraisalLv: 1,
      survivalLv: 1,
      linguisticsLv: 1,
    });
  });

  it('applies battlefield loot items immediately without charging currency', () => {
    const bus = new EventBus();
    const engine = new AutoUpgradeEngine({ eventBus: bus });
    const events: string[] = [];
    bus.on('progression:autoUpgrade', (ev) => events.push(`${ev.category}:${ev.targetLabel}:${ev.toValue}`));

    useGameStore.getState().addCurrencies({ sunGold: 100, ancientGear: 10 });
    const goldBefore = useGameStore.getState().currencies.sunGold;
    const gearBefore = useGameStore.getState().currencies.ancientGear;

    bus.emit('loot:collected', { itemKind: 'TURRET_PART_HARPOON', label: '고강도 작살 노즐', x: 240, y: 300 });
    bus.emit('loot:collected', { itemKind: 'HYDRAULIC_BLUEPRINT', label: '유압식 다족 설계도', x: 240, y: 300 });
    bus.emit('loot:collected', { itemKind: 'WAGON_FRAME', label: '강화 마차 프레임', x: 240, y: 300 });
    bus.emit('loot:collected', { itemKind: 'MERC_MANUAL', label: '전투 교범', x: 240, y: 300 });
    bus.emit('loot:collected', { itemKind: 'EXPLORER_TABLET', label: '태양 제국 서판', x: 240, y: 300 });

    const s = useGameStore.getState();
    expect(s.sandwalker.turretLevels.HARPOON).toBe(2);
    expect(s.sandwalker.legPartLevel).toBe(11);
    expect(s.sandwalker.wagonCount).toBe(2);
    expect(s.sandwalker.cargoCapacity).toBe(100);
    expect(s.mercenaries.some((m) => m.isUnlocked && m.level === 2)).toBe(true);
    expect(s.explorerPassives?.appraisalLv).toBe(2);
    expect(s.currencies.sunGold).toBe(goldBefore);
    expect(s.currencies.ancientGear).toBe(gearBefore);
    expect(events.length).toBe(5);

    engine.dispose();
  });

  it('evaluates condition milestones idempotently and chains turret tier-up at Lv.10', () => {
    const bus = new EventBus();
    const engine = new AutoUpgradeEngine({ eventBus: bus });

    // Pre-level HEAT_RAY to Lv.9 and stock 5 Ancient Gears
    for (let i = 0; i < 8; i++) {
      useGameStore.getState().grantFreeTurretLevel('HEAT_RAY');
    }
    useGameStore.getState().addCurrencies({ ancientGear: 5 });
    expect(useGameStore.getState().sandwalker.turretLevels.HEAT_RAY).toBe(9);
    expect(useGameStore.getState().sandwalker.turretTiers.HEAT_RAY).toBe(1);

    // 5 kills with HEAT_RAY triggers ms_heat_kills_5 -> Lv.10 -> chained Tier 2 auto-promotion!
    for (let k = 0; k < 5; k++) {
      bus.emit('combat:enemyKilled', {
        enemyId: `e_${k}`,
        archetypeId: 'BANDIT',
        rewardGold: 10,
        x: 400,
        y: 330,
      });
    }

    const s = useGameStore.getState();
    expect(s.sandwalker.turretLevels.HEAT_RAY).toBe(10);
    expect(s.sandwalker.turretTiers.HEAT_RAY).toBe(2);
    expect(s.currencies.ancientGear).toBe(0);
    expect(s.progression?.completedMilestones).toContain('ms_heat_kills_5');

    // Stele decode milestone (once)
    bus.emit('excavation:steleDecoded', { steleId: 1, isNew: true, x: 300, y: 336 });
    bus.emit('excavation:steleDecoded', { steleId: 1, isNew: false, x: 300, y: 336 });
    expect(useGameStore.getState().progression?.counters.stelesDecoded).toBe(1);
    expect(useGameStore.getState().explorerPassives?.linguisticsLv).toBe(2);

    engine.dispose();
  });

  it('respects trade reserve during autoInvestPolicy and skips during OPENING_HOOK', () => {
    const bus = new EventBus();
    const engine = new AutoUpgradeEngine({ eventBus: bus });

    // During intro (isIntroCompleted = false), kill events do not grant milestone progression
    useGameStore.getState().setIntroCompleted(false);
    for (let k = 0; k < 5; k++) {
      bus.emit('combat:enemyKilled', {
        enemyId: `intro_${k}`,
        archetypeId: 'BANDIT',
        rewardGold: 10,
        x: 400,
        y: 330,
      });
    }
    expect(useGameStore.getState().progression?.counters.killsByTurret.HEAT_RAY).toBe(0);

    // Complete intro, set MANUAL first -> no gold spent
    useGameStore.getState().setIntroCompleted(true);
    useGameStore.getState().addCurrencies({ sunGold: 220 });
    expect(engine.tryAutoInvest()).toHaveLength(0);
    expect(useGameStore.getState().currencies.sunGold).toBe(220);

    // Switch to COMBAT policy -> invests surplus (220 - 100 reserve = 120G -> upgrades Lv1->2 (50G) and Lv2->3 (59G), keeping >=100G reserve)
    useGameStore.getState().setAutoInvestPolicy('COMBAT');
    const applied = engine.tryAutoInvest();
    expect(applied.length).toBe(2);
    expect(useGameStore.getState().sandwalker.turretLevels.HEAT_RAY).toBe(3);
    expect(useGameStore.getState().currencies.sunGold).toBe(111);

    engine.dispose();
  });

  it('LootPickupSystem bounces, magnetizes toward Sandwalker, and emits loot:collected', () => {
    const bus = new EventBus();
    const collected: string[] = [];
    bus.on('loot:collected', (ev) => collected.push(ev.itemKind));

    const pickups = new LootPickupSystem({ eventBus: bus });
    pickups.spawnLoot('WAGON_FRAME', 340, 320);
    expect(pickups.getActivePickups()).toHaveLength(1);

    for (let i = 0; i < 40; i++) {
      pickups.update(0.05, 'MARCH_NORMAL');
    }

    expect(pickups.getActivePickups()).toHaveLength(0);
    expect(collected).toEqual(['WAGON_FRAME']);
  });
});
