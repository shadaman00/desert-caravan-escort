import type { EventBus } from '@/engine/EventBus';
import {
  QUEST_DEFINITIONS,
  URGENT_DELIVERY_REWARD_GOLD,
  type QuestDefinition,
} from '@/game/data/quests';
import { useGameStore } from '@/store/gameStore';
import type { AutoUpgradeEngine, AutoUpgradeStore } from './AutoUpgradeEngine';

/**
 * Evaluates 3-tier Main, Sub, and Urgent Delivery quests on progression events and
 * feeds completed quest rewards straight into AutoUpgradeEngine.
 */
export class QuestSystem {
  private readonly eventBus?: EventBus;
  private readonly autoUpgradeEngine?: AutoUpgradeEngine;
  private readonly getStore: () => AutoUpgradeStore;
  private readonly unsubs: Array<() => void> = [];

  constructor(
    options: {
      eventBus?: EventBus;
      autoUpgradeEngine?: AutoUpgradeEngine;
      getStore?: () => AutoUpgradeStore;
    } = {}
  ) {
    this.eventBus = options.eventBus;
    this.autoUpgradeEngine = options.autoUpgradeEngine;
    this.getStore = options.getStore ?? (() => useGameStore.getState());
    this.bindEvents();
  }

  private bindEvents(): void {
    if (!this.eventBus) return;

    const evalHandler = () => {
      const store = this.getStore();
      if (!store.meta.isIntroCompleted) return;
      this.evaluateQuests(store);
    };

    this.unsubs.push(
      this.eventBus.on('combat:enemyKilled', evalHandler),
      this.eventBus.on('boss:partBreak', evalHandler),
      this.eventBus.on('boss:defeated', evalHandler),
      this.eventBus.on('excavation:steleDecoded', evalHandler),
      this.eventBus.on('excavation:relicAppraised', evalHandler),
      this.eventBus.on('hazard:cleared', evalHandler),
      this.eventBus.on('loot:collected', evalHandler),
      this.eventBus.on('trade:settled', () => {
        const store = this.getStore();
        if (!store.meta.isIntroCompleted) return;
        this.resolveUrgentOnArrival(store);
        this.evaluateQuests(this.getStore());
      })
    );
  }

  public dispose(): void {
    while (this.unsubs.length > 0) {
      this.unsubs.pop()?.();
    }
  }

  private resolveUrgentOnArrival(store: AutoUpgradeStore): boolean {
    const urgent = store.quests?.urgentDelivery;
    if (!urgent || !urgent.active) return false;

    const elapsed = store.meta.totalPlaySeconds - urgent.startedAtPlaySec;
    const succeeded = store.sandwalker.currentHp > 0 && elapsed <= urgent.timeLimitSec;
    store.resolveUrgentDelivery(succeeded);

    if (succeeded) {
      store.addCurrencies({ sunGold: URGENT_DELIVERY_REWARD_GOLD });
      this.eventBus?.emit('quest:completed', {
        questId: 'urgent_delivery',
        title: '긴급 물자 운송 완수',
        kind: 'URGENT',
      });
      this.autoUpgradeEngine?.applyItemPickup('TURRET_PART_ANY', this.getStore());
    }
    return succeeded;
  }

  public evaluateQuests(store: AutoUpgradeStore = this.getStore()): QuestDefinition[] {
    const completed = new Set(store.quests?.completedIds ?? []);
    const currentAct = Math.max(1, store.meta.currentAct);
    const newlyCompleted: QuestDefinition[] = [];

    for (const q of QUEST_DEFINITIONS) {
      if (completed.has(q.id)) continue;
      if (q.act > currentAct) continue;

      const latest = this.getStore();
      if (q.readProgress(latest) >= q.target) {
        if (latest.completeQuest(q.id)) {
          if (q.rewardGold > 0) {
            this.getStore().addCurrencies({ sunGold: q.rewardGold });
          }
          this.eventBus?.emit('quest:completed', {
            questId: q.id,
            title: q.title,
            kind: q.kind,
          });
          if (q.rewardItem) {
            this.autoUpgradeEngine?.applyItemPickup(q.rewardItem, this.getStore());
          }
          newlyCompleted.push(q);
        }
      }
    }

    return newlyCompleted;
  }
}
