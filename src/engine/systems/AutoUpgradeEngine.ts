import type { EventBus } from '@/engine/EventBus';
import {
  AUTO_UPGRADE_MILESTONES,
  LOOT_ITEM_CATALOG,
  type AutoUpgradeMilestoneDef,
} from '@/game/data/autoUpgradeRules';
import { MERCENARY_DEFINITIONS, type MercenaryId } from '@/game/data/mercenaries';
import { MERC_EQUIPMENT_CATALOG, type EquipmentRarity } from '@/game/data/equipment';
import { tierUpGearCost, upgradeCost } from '@/game/formulas';
import { useGameStore } from '@/store/gameStore';
import type {
  AutoUpgradeCategory,
  AutoUpgradeEventRecord,
  AutoUpgradeItemKind,
  ExplorerPassivesState,
  GameStoreActions,
  GameStoreState,
  TurretType,
} from '@/store/types';

export type AutoUpgradeStore = GameStoreState & GameStoreActions;

const TURRET_NAMES: Record<TurretType, string> = {
  HEAT_RAY: '열선 레이저',
  HARPOON: '작살포',
  MORTAR: '박격포',
};

const PASSIVE_NAMES: Record<keyof ExplorerPassivesState, string> = {
  appraisalLv: '유물 감정학',
  survivalLv: '사막 생존술',
  linguisticsLv: '비석 언어학',
};

function makeRecord(
  category: AutoUpgradeCategory,
  targetLabel: string,
  fromValue: string,
  toValue: string,
  triggerReason: string
): AutoUpgradeEventRecord {
  return {
    id: `au_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    timestamp: Date.now(),
    category,
    targetLabel,
    fromValue,
    toValue,
    triggerReason,
  };
}

/**
 * Coordinates automatic condition- & item-driven progression upgrades across turrets,
 * legs, wagons, mercenaries, and explorer passives.
 */
export class AutoUpgradeEngine {
  private readonly eventBus?: EventBus;
  private readonly getStore: () => AutoUpgradeStore;
  private readonly unsubs: Array<() => void> = [];

  constructor(options: { eventBus?: EventBus; getStore?: () => AutoUpgradeStore } = {}) {
    this.eventBus = options.eventBus;
    this.getStore = options.getStore ?? (() => useGameStore.getState());
    this.bindEvents();
  }

  private bindEvents(): void {
    if (!this.eventBus) return;

    this.unsubs.push(
      this.eventBus.on('combat:enemyKilled', () => {
        const store = this.getStore();
        if (!store.meta.isIntroCompleted) return;
        const activeTurret = store.sandwalker.activeTurret;
        store.incrementTurretKillCounter(activeTurret, 1);
        this.evaluateAll(this.getStore(), { allowAutoInvest: true });
      }),

      this.eventBus.on('boss:partBreak', () => {
        const store = this.getStore();
        if (!store.meta.isIntroCompleted) return;
        store.incrementProgressionCounter('bossPartBreaks', 1);
        this.evaluateAll(this.getStore(), { allowAutoInvest: true });
      }),

      this.eventBus.on('boss:defeated', ({ act }) => {
        const store = this.getStore();
        if (!store.meta.isIntroCompleted) return;
        store.incrementProgressionCounter('bossDefeats', 1);
        const dropMercIds = ['tarik', 'sera', 'zara', 'lili', 'harun'] as const;
        const pickedMerc = dropMercIds[Math.max(0, (act - 1) % dropMercIds.length)];
        const rarity: EquipmentRarity = act >= 3 ? 'LEGENDARY' : 'RARE';
        this.applyEquipmentReward(pickedMerc, rarity, '챕터 보스 토벌 전리품', this.getStore());
        this.evaluateAll(this.getStore(), { allowAutoInvest: true });
      }),

      this.eventBus.on('excavation:steleDecoded', ({ isNew }) => {
        const store = this.getStore();
        if (!store.meta.isIntroCompleted || !isNew) return;
        store.incrementProgressionCounter('stelesDecoded', 1);
        this.evaluateAll(this.getStore(), { allowAutoInvest: true });
      }),

      this.eventBus.on('excavation:relicAppraised', () => {
        const store = this.getStore();
        if (!store.meta.isIntroCompleted) return;
        store.incrementProgressionCounter('relicsAppraised', 1);
        this.evaluateAll(this.getStore(), { allowAutoInvest: true });
      }),

      this.eventBus.on('trade:settled', ({ profit }) => {
        const store = this.getStore();
        if (!store.meta.isIntroCompleted || profit <= 0) return;
        store.incrementProgressionCounter('totalTradeProfit', profit);
        this.evaluateAll(this.getStore(), { allowAutoInvest: true });
      }),

      this.eventBus.on('hazard:cleared', ({ hazardKind }) => {
        const store = this.getStore();
        if (!store.meta.isIntroCompleted) return;
        if (hazardKind === 'QUICKSAND') {
          store.incrementProgressionCounter('quicksandCleared', 1);
        }
        this.evaluateAll(this.getStore(), { allowAutoInvest: true });
      }),

      this.eventBus.on('loot:collected', ({ itemKind }) => {
        const store = this.getStore();
        if (!store.meta.isIntroCompleted) return;
        store.incrementProgressionCounter('lootCollected', 1);
        this.applyItemPickup(itemKind, this.getStore());
        this.evaluateAll(this.getStore(), { allowAutoInvest: true });
      }),

      this.eventBus.on('endgame:depthCleared', ({ clearedDepth }) => {
        const store = this.getStore();
        if (!store.meta.isIntroCompleted) return;
        const dropMercIds = ['tarik', 'sera', 'zara', 'lili', 'harun'] as const;
        const pickedMerc = dropMercIds[Math.max(0, (clearedDepth - 1) % dropMercIds.length)];
        const reason = `심층 Depth ${clearedDepth} 보상`;
        if (clearedDepth % 3 === 0 || clearedDepth % 2 === 0) {
          const rarity: EquipmentRarity = clearedDepth % 3 === 0 ? 'ANCIENT' : 'LEGENDARY';
          this.applyEquipmentReward(pickedMerc, rarity, reason, this.getStore());
        } else {
          const applied = this.applyItemPickup('TURRET_PART_ANY', this.getStore());
          if (!applied) {
            this.applyEquipmentReward(pickedMerc, 'RARE', reason, this.getStore());
          }
        }
        this.evaluateAll(this.getStore(), { allowAutoInvest: true });
      })
    );
  }

  public dispose(): void {
    while (this.unsubs.length > 0) {
      const fn = this.unsubs.pop();
      fn?.();
    }
  }

  private emitApplied(record: AutoUpgradeEventRecord, store: AutoUpgradeStore): void {
    store.recordAutoUpgradeEvent(record);
    this.eventBus?.emit('progression:autoUpgrade', record);
  }

  public recordSandstormSecond(store: AutoUpgradeStore = this.getStore()): void {
    if (!store.meta.isIntroCompleted) return;
    store.incrementProgressionCounter('sandstormSurvivedSec', 1);
    this.evaluateMilestones(this.getStore());
  }

  /**
   * Applies an acquired battlefield or quest item immediately as a free upgrade.
   */
  public applyItemPickup(
    itemKind: AutoUpgradeItemKind,
    store: AutoUpgradeStore = this.getStore()
  ): AutoUpgradeEventRecord | null {
    const meta = LOOT_ITEM_CATALOG[itemKind];
    const reason = `${meta.label} 획득`;

    if (
      itemKind === 'TURRET_PART_HEAT' ||
      itemKind === 'TURRET_PART_HARPOON' ||
      itemKind === 'TURRET_PART_MORTAR' ||
      itemKind === 'TURRET_PART_ANY'
    ) {
      const targetTurret: TurretType =
        itemKind === 'TURRET_PART_HEAT'
          ? 'HEAT_RAY'
          : itemKind === 'TURRET_PART_HARPOON'
            ? 'HARPOON'
            : itemKind === 'TURRET_PART_MORTAR'
              ? 'MORTAR'
              : store.sandwalker.activeTurret;

      const beforeLv = store.sandwalker.turretLevels[targetTurret] ?? 1;
      const beforeTier = store.sandwalker.turretTiers[targetTurret] ?? 1;
      if (beforeLv >= beforeTier * 10 && beforeTier < 3) {
        this.tryAutoTierUpForTurret(targetTurret, this.getStore(), `${reason} (티어 돌파)`);
      }

      const fresh = this.getStore();
      const prevLv = fresh.sandwalker.turretLevels[targetTurret] ?? 1;
      if (fresh.grantFreeTurretLevel(targetTurret)) {
        const ev = makeRecord(
          'TURRET_LV',
          TURRET_NAMES[targetTurret],
          `Lv.${prevLv}`,
          `Lv.${prevLv + 1}`,
          reason
        );
        this.emitApplied(ev, this.getStore());
        this.tryAutoTierUpForTurret(targetTurret, this.getStore(), '포탑 레벨 상한 도달');
        return ev;
      }
      return null;
    }

    if (itemKind === 'HYDRAULIC_BLUEPRINT') {
      const prevLv = store.sandwalker.legPartLevel;
      if (store.grantFreeLegLevel(11)) {
        const nextLv = this.getStore().sandwalker.legPartLevel;
        const ev = makeRecord('LEG', '다리 구동부', `Lv.${prevLv}`, `Lv.${nextLv}`, reason);
        this.emitApplied(ev, this.getStore());
        return ev;
      }
      return null;
    }

    if (itemKind === 'LEG_PISTON') {
      const prevLv = store.sandwalker.legPartLevel;
      if (store.grantFreeLegLevel()) {
        const nextLv = this.getStore().sandwalker.legPartLevel;
        const ev = makeRecord('LEG', '다리 구동부', `Lv.${prevLv}`, `Lv.${nextLv}`, reason);
        this.emitApplied(ev, this.getStore());
        return ev;
      }
      return null;
    }

    if (itemKind === 'WAGON_FRAME') {
      const prevWagons = store.sandwalker.wagonCount;
      if (store.grantFreeWagon()) {
        const ev = makeRecord(
          'WAGON',
          '화물 마차',
          `${prevWagons}대`,
          `${prevWagons + 1}대`,
          reason
        );
        this.emitApplied(ev, this.getStore());
        return ev;
      }
      return null;
    }

    if (itemKind === 'MERC_MANUAL') {
      const beforeLevels = new Map(store.mercenaries.map((m) => [m.id, m.level]));
      const upgradedId = store.grantFreeMercenaryLevel();
      if (upgradedId) {
        const prevLv = beforeLevels.get(upgradedId) ?? 1;
        const mercName = MERCENARY_DEFINITIONS[upgradedId as MercenaryId]?.name ?? upgradedId;
        const ev = makeRecord('MERC', mercName, `Lv.${prevLv}`, `Lv.${prevLv + 1}`, reason);
        this.emitApplied(ev, this.getStore());
        return ev;
      }
      return null;
    }

    if (itemKind === 'EXPLORER_TABLET') {
      const passives = store.explorerPassives ?? {
        appraisalLv: 1,
        survivalLv: 1,
        linguisticsLv: 1,
      };
      const keys: Array<keyof ExplorerPassivesState> = [
        'appraisalLv',
        'survivalLv',
        'linguisticsLv',
      ];
      const targetKey = [...keys].sort((a, b) => passives[a] - passives[b])[0];
      const prevLv = passives[targetKey];
      if (store.grantExplorerPassiveLevel(targetKey)) {
        const ev = makeRecord(
          'PASSIVE',
          PASSIVE_NAMES[targetKey],
          `Lv.${prevLv}`,
          `Lv.${prevLv + 1}`,
          reason
        );
        this.emitApplied(ev, this.getStore());
        return ev;
      }
      return null;
    }

    if (itemKind === 'EQUIP_CRATE') {
      const unlocked = store.mercenaries.filter((m) => m.isUnlocked);
      const candidates = unlocked.length > 0 ? unlocked : store.mercenaries;
      const targetMerc = [...candidates].sort((a, b) => {
        const aLv = store.mercEquipment?.[a.id]?.level ?? 0;
        const bLv = store.mercEquipment?.[b.id]?.level ?? 0;
        return aLv - bLv;
      })[0];
      if (!targetMerc) return null;
      const act = Math.max(1, store.meta.currentAct);
      const rarity: EquipmentRarity = act >= 4 ? 'LEGENDARY' : act >= 2 ? 'RARE' : 'COMMON';
      return this.applyEquipmentReward(targetMerc.id, rarity, reason, store);
    }

    return null;
  }

  /**
   * Acquires dedicated equipment for a mercenary (auto-equip / rarity upgrade / dismantle XP).
   */
  public applyEquipmentReward(
    mercId: string,
    rarity: EquipmentRarity,
    triggerReason: string,
    store: AutoUpgradeStore = this.getStore()
  ): AutoUpgradeEventRecord | null {
    const def = MERC_EQUIPMENT_CATALOG[mercId as keyof typeof MERC_EQUIPMENT_CATALOG];
    if (!def) return null;
    const res = store.acquireMercenaryEquipment(mercId, rarity);
    const ev = makeRecord('EQUIP', def.name, res.fromLabel, res.toLabel, triggerReason);
    this.emitApplied(ev, this.getStore());
    return ev;
  }

  private tryAutoTierUpForTurret(
    turret: TurretType,
    store: AutoUpgradeStore,
    reason: string
  ): boolean {
    const lv = store.sandwalker.turretLevels[turret] ?? 1;
    const tier = store.sandwalker.turretTiers[turret] ?? 1;
    if (tier >= 3 || lv < tier * 10) return false;
    const gearCost = tierUpGearCost(tier);
    if (store.currencies.ancientGear < gearCost) return false;

    if (store.tierUpTurret(turret)) {
      const ev = makeRecord(
        'TURRET_TIER',
        TURRET_NAMES[turret],
        `Tier ${tier}`,
        `Tier ${tier + 1}`,
        `${reason} (${gearCost}⚙️)`
      );
      this.emitApplied(ev, this.getStore());
      return true;
    }
    return false;
  }

  private applyMilestoneReward(ms: AutoUpgradeMilestoneDef, store: AutoUpgradeStore): void {
    const reason = `${ms.title} 조건 달성`;
    const reward = ms.reward;

    if (reward.type === 'TURRET_LV') {
      const target: TurretType =
        reward.turret === 'ACTIVE' ? store.sandwalker.activeTurret : reward.turret;
      const lv = store.sandwalker.turretLevels[target] ?? 1;
      const tier = store.sandwalker.turretTiers[target] ?? 1;
      if (lv >= tier * 10 && tier < 3) {
        this.tryAutoTierUpForTurret(target, this.getStore(), `${reason} (티어 돌파)`);
      }
      const fresh = this.getStore();
      const prevLv = fresh.sandwalker.turretLevels[target] ?? 1;
      if (fresh.grantFreeTurretLevel(target)) {
        this.emitApplied(
          makeRecord('TURRET_LV', TURRET_NAMES[target], `Lv.${prevLv}`, `Lv.${prevLv + 1}`, reason),
          this.getStore()
        );
        this.tryAutoTierUpForTurret(target, this.getStore(), '포탑 레벨 상한 도달');
      }
      return;
    }

    if (reward.type === 'LEG_LV') {
      const prevLv = store.sandwalker.legPartLevel;
      if (store.grantFreeLegLevel(reward.minTargetLevel)) {
        const nextLv = this.getStore().sandwalker.legPartLevel;
        this.emitApplied(
          makeRecord('LEG', '다리 구동부', `Lv.${prevLv}`, `Lv.${nextLv}`, reason),
          this.getStore()
        );
      }
      return;
    }

    if (reward.type === 'WAGON') {
      const prev = store.sandwalker.wagonCount;
      if (store.grantFreeWagon()) {
        this.emitApplied(
          makeRecord('WAGON', '화물 마차', `${prev}대`, `${prev + 1}대`, reason),
          this.getStore()
        );
      }
      return;
    }

    if (reward.type === 'MERC_LV') {
      const before = new Map(store.mercenaries.map((m) => [m.id, m.level]));
      const upgradedId = store.grantFreeMercenaryLevel();
      if (upgradedId) {
        const prev = before.get(upgradedId) ?? 1;
        const name = MERCENARY_DEFINITIONS[upgradedId as MercenaryId]?.name ?? upgradedId;
        this.emitApplied(
          makeRecord('MERC', name, `Lv.${prev}`, `Lv.${prev + 1}`, reason),
          this.getStore()
        );
      }
      return;
    }

    if (reward.type === 'PASSIVE_LV') {
      const passives = store.explorerPassives ?? {
        appraisalLv: 1,
        survivalLv: 1,
        linguisticsLv: 1,
      };
      const prev = passives[reward.key];
      if (store.grantExplorerPassiveLevel(reward.key)) {
        this.emitApplied(
          makeRecord(
            'PASSIVE',
            PASSIVE_NAMES[reward.key],
            `Lv.${prev}`,
            `Lv.${prev + 1}`,
            reason
          ),
          this.getStore()
        );
      }
    }
  }

  public evaluateMilestones(store: AutoUpgradeStore = this.getStore()): AutoUpgradeMilestoneDef[] {
    const prog = store.progression;
    if (!prog) return [];

    const applied: AutoUpgradeMilestoneDef[] = [];
    for (const ms of AUTO_UPGRADE_MILESTONES) {
      const fresh = this.getStore();
      const freshProg = fresh.progression;
      if (!freshProg || freshProg.completedMilestones.includes(ms.id)) continue;
      if (ms.readProgress(freshProg.counters) >= ms.targetCount) {
        if (fresh.markMilestoneCompleted(ms.id)) {
          this.applyMilestoneReward(ms, this.getStore());
          applied.push(ms);
        }
      }
    }
    return applied;
  }

  /**
   * When autoInvestPolicy !== 'MANUAL', spends surplus Sun Gold above a cargo trade reserve
   * (max(100, wagonCount * 50)) and Ancient Gears at capped tiers.
   */
  public tryAutoInvest(store: AutoUpgradeStore = this.getStore()): AutoUpgradeEventRecord[] {
    const prog = store.progression;
    if (!prog || prog.autoInvestPolicy === 'MANUAL') return [];

    const applied: AutoUpgradeEventRecord[] = [];
    const policy = prog.autoInvestPolicy;
    const tradeReserve = Math.max(100, store.sandwalker.wagonCount * 50);

    for (let step = 0; step < 3; step++) {
      const s = this.getStore();
      const availableGold = s.currencies.sunGold - tradeReserve;
      const activeTurret = s.sandwalker.activeTurret;
      let progressed = false;

      if (policy === 'ECONOMY' && s.sandwalker.wagonCount < 5) {
        const gearCost = 5 * s.sandwalker.wagonCount;
        if (s.currencies.ancientGear >= gearCost) {
          const prevW = s.sandwalker.wagonCount;
          if (s.addWagon()) {
            const ev = makeRecord(
              'WAGON',
              '화물 마차',
              `${prevW}대`,
              `${prevW + 1}대`,
              '경제 자동 투자'
            );
            this.emitApplied(ev, this.getStore());
            applied.push(ev);
            progressed = true;
            continue;
          }
        }
      }

      if (this.tryAutoTierUpForTurret(activeTurret, s, '자동 승급 투자')) {
        const latestLog = this.getStore().progression?.recentAutoUpgrades[0];
        if (latestLog) applied.push(latestLog);
        progressed = true;
        continue;
      }

      if (availableGold <= 0) break;

      if (policy === 'COMBAT' || policy === 'BALANCED') {
        const tLv = s.sandwalker.turretLevels[activeTurret] ?? 1;
        const tTier = s.sandwalker.turretTiers[activeTurret] ?? 1;
        const tCost = upgradeCost(tLv);
        if (tLv < 30 && tLv < tTier * 10 && availableGold >= tCost) {
          if (s.upgradeTurret(activeTurret)) {
            const ev = makeRecord(
              'TURRET_LV',
              TURRET_NAMES[activeTurret],
              `Lv.${tLv}`,
              `Lv.${tLv + 1}`,
              policy === 'COMBAT' ? '전투 자동 투자' : '균형 자동 투자'
            );
            this.emitApplied(ev, this.getStore());
            applied.push(ev);
            progressed = true;
            continue;
          }
        }
      }

      if (policy === 'ECONOMY' || policy === 'BALANCED') {
        const lLv = s.sandwalker.legPartLevel;
        const lCost = upgradeCost(lLv);
        if (lLv < 20 && availableGold >= lCost) {
          if (s.upgradeLeg()) {
            const ev = makeRecord(
              'LEG',
              '다리 구동부',
              `Lv.${lLv}`,
              `Lv.${lLv + 1}`,
              policy === 'ECONOMY' ? '기동 자동 투자' : '균형 자동 투자'
            );
            this.emitApplied(ev, this.getStore());
            applied.push(ev);
            progressed = true;
            continue;
          }
        }
      }

      const unlockedMerc = [...s.mercenaries]
        .filter((m) => m.isUnlocked && m.level < 30)
        .sort((a, b) => a.level - b.level)[0];
      if (unlockedMerc && availableGold >= upgradeCost(unlockedMerc.level)) {
        const prevLv = unlockedMerc.level;
        if (s.upgradeMercenary(unlockedMerc.id)) {
          const name = MERCENARY_DEFINITIONS[unlockedMerc.id as MercenaryId]?.name ?? unlockedMerc.id;
          const ev = makeRecord('MERC', name, `Lv.${prevLv}`, `Lv.${prevLv + 1}`, '자동 용병 훈련');
          this.emitApplied(ev, this.getStore());
          applied.push(ev);
          progressed = true;
        }
      }

      if (!progressed) break;
    }

    return applied;
  }

  public evaluateAll(
    store: AutoUpgradeStore = this.getStore(),
    options: { allowAutoInvest?: boolean } = {}
  ): void {
    this.evaluateMilestones(store);
    if (options.allowAutoInvest) {
      this.tryAutoInvest(this.getStore());
    }
  }
}
