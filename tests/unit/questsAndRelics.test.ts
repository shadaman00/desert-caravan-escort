import { describe, it, expect, beforeEach } from 'vitest';
import { EventBus } from '@/engine/EventBus';
import { AutoUpgradeEngine } from '@/engine/systems/AutoUpgradeEngine';
import { QuestSystem } from '@/engine/systems/QuestSystem';
import { getOasisDefinition, isSurgeJackpot, OASIS_DEFINITIONS } from '@/game/data/oases';
import {
  RELIC_DEFINITIONS,
  computeRelicCodexBonuses,
  pickWeightedRelicId,
} from '@/game/data/relics';
import { QUEST_DEFINITIONS } from '@/game/data/quests';
import { useGameStore } from '@/store/gameStore';

describe('Phase 2: 12 Oases, 4-Rarity Relics Codex & 3-Tier QuestSystem', () => {
  beforeEach(() => {
    useGameStore.getState().resetToDefaults();
    useGameStore.getState().setIntroCompleted(true);
    useGameStore.getState().unlockMercenary('harun');
    useGameStore.getState().unlockMercenary('sera');
  });

  it('defines 12 unique oases across Act 1-4 while preserving 1..3 backward compatibility', () => {
    expect(OASIS_DEFINITIONS).toHaveLength(12);
    const names = new Set(OASIS_DEFINITIONS.map((o) => o.name));
    expect(names.size).toBe(12);

    expect(getOasisDefinition(1).specialty.name).toBe('오아시스 생수');
    expect(getOasisDefinition(2).specialty.buyPrice).toBe(3);
    expect(getOasisDefinition(3).specialty.name).toBe('태양석');
    expect(getOasisDefinition(4).act).toBe(2);
    expect(getOasisDefinition(7).act).toBe(3);
    expect(getOasisDefinition(12).name).toBe('태양 신전 입구');
    expect(getOasisDefinition(13).index).toBe(13);

    expect(isSurgeJackpot(2.59)).toBe(false);
    expect(isSurgeJackpot(2.6)).toBe(true);
  });

  it('defines 20 relics across 4 rarities and keeps baseline bonuses 0 when codex empty & passives Lv.1', () => {
    expect(RELIC_DEFINITIONS).toHaveLength(20);
    const rarities = new Set(RELIC_DEFINITIONS.map((r) => r.rarity));
    expect(rarities.size).toBe(4);

    const baseline = computeRelicCodexBonuses([], {
      appraisalLv: 1,
      survivalLv: 1,
      linguisticsLv: 1,
    });
    expect(baseline).toEqual({
      turretDamagePct: 0,
      critChancePct: 0,
      tradeGoldPct: 0,
      stormResistPct: 0,
      excavateSpeedPct: 0,
    });

    const buffed = computeRelicCodexBonuses(['relic_solar_disc', 'relic_sun_heart'], {
      appraisalLv: 3,
      survivalLv: 2,
      linguisticsLv: 3,
    });
    expect(buffed.turretDamagePct).toBeCloseTo(0.13, 3);
    expect(buffed.tradeGoldPct).toBeCloseTo(0.04, 3);
    expect(buffed.stormResistPct).toBeCloseTo(0.11, 3);
    expect(buffed.excavateSpeedPct).toBeCloseTo(0.1, 3);

    const picked = pickWeightedRelicId(['relic_solar_disc'], 3, 2, () => 0.5);
    expect(picked).not.toBe('relic_solar_disc');
  });

  it('QuestSystem automatically completes Main & Sub quests and triggers AutoUpgradeEngine rewards', () => {
    expect(QUEST_DEFINITIONS).toHaveLength(16);

    const bus = new EventBus();
    const autoEngine = new AutoUpgradeEngine({ eventBus: bus });
    const questSys = new QuestSystem({ eventBus: bus, autoUpgradeEngine: autoEngine });
    const completedEvents: string[] = [];
    bus.on('quest:completed', (ev) => completedEvents.push(ev.questId));

    // Stele #1 decoded -> completes q_main_act1_stele -> grants EXPLORER_TABLET -> upgrades passive!
    useGameStore.getState().decodeStele(1);
    bus.emit('excavation:steleDecoded', { steleId: 1, isNew: true, x: 300, y: 336 });

    expect(useGameStore.getState().quests?.completedIds).toContain('q_main_act1_stele');
    expect(completedEvents).toContain('q_main_act1_stele');
    // linguisticsLv upgraded by ms_stele_1 AND appraisalLv upgraded by EXPLORER_TABLET from quest
    expect((useGameStore.getState().explorerPassives?.linguisticsLv ?? 1)).toBeGreaterThanOrEqual(2);
    expect((useGameStore.getState().explorerPassives?.appraisalLv ?? 1)).toBeGreaterThanOrEqual(2);

    // 15 enemy kills -> completes q_sub_act1_silk_rescue -> +120G + MERC_MANUAL -> upgrades merc Lv!
    for (let i = 0; i < 15; i++) {
      bus.emit('combat:enemyKilled', {
        enemyId: `qmob_${i}`,
        archetypeId: 'BANDIT',
        rewardGold: 10,
        x: 400,
        y: 330,
      });
    }
    expect(useGameStore.getState().quests?.completedIds).toContain('q_sub_act1_silk_rescue');
    expect(useGameStore.getState().currencies.sunGold).toBeGreaterThanOrEqual(120);
    expect(useGameStore.getState().mercenaries.some((m) => m.level >= 2)).toBe(true);

    questSys.dispose();
    autoEngine.dispose();
  });

  it('resolves Urgent Delivery quest on timely settlement arrival and triggers auto-upgrade', () => {
    const bus = new EventBus();
    const autoEngine = new AutoUpgradeEngine({ eventBus: bus });
    const questSys = new QuestSystem({ eventBus: bus, autoUpgradeEngine: autoEngine });
    const urgentWins: string[] = [];
    bus.on('quest:completed', (ev) => {
      if (ev.kind === 'URGENT') urgentWins.push(ev.questId);
    });

    useGameStore.getState().setPlayTime(1000);
    expect(useGameStore.getState().startUrgentDelivery(120)).toBe(true);
    useGameStore.getState().setPlayTime(1065); // arrived in 65s <= 120s
    bus.emit('trade:settled', { profit: 180, oasisIndex: 2 });

    const s = useGameStore.getState();
    expect(s.quests?.urgentDelivery.active).toBe(false);
    expect(s.quests?.urgentDelivery.completedCount).toBe(1);
    expect(s.currencies.sunGold).toBe(150);
    expect(s.sandwalker.turretLevels.HEAT_RAY).toBe(2);
    expect(urgentWins).toEqual(['urgent_delivery']);

    questSys.dispose();
    autoEngine.dispose();
  });
});
