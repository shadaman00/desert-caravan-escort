import {
  EndgameState,
  GameStoreState,
  ProgressionState,
  ExplorerPassivesState,
  QuestsState,
} from './types';
import { createInitialDailyMissions } from '../game/data/dailyMissions';

export const CURRENT_SAVE_VERSION = 2;

export function createDefaultEndgameState(): EndgameState {
  return {
    templeGateUnlocked: false,
    endingCompleted: false,
    pendingEndingModal: false,
    endlessUnlocked: false,
    endlessActive: false,
    currentDepth: 1,
    maxDepthCleared: 0,
    goldenTradeActive: false,
  };
}

export function createInitialQuestsState(): QuestsState {
  return {
    completedIds: [],
    urgentDelivery: {
      active: false,
      startedAtPlaySec: 0,
      timeLimitSec: 120,
      completedCount: 0,
    },
  };
}

export function createInitialExplorerPassives(): ExplorerPassivesState {
  return {
    appraisalLv: 1,
    survivalLv: 1,
    linguisticsLv: 1,
  };
}

export function createInitialProgressionState(): ProgressionState {
  return {
    autoInvestPolicy: 'MANUAL',
    completedMilestones: [],
    counters: {
      killsByTurret: {
        HEAT_RAY: 0,
        HARPOON: 0,
        MORTAR: 0,
      },
      bossPartBreaks: 0,
      bossDefeats: 0,
      stelesDecoded: 0,
      relicsAppraised: 0,
      quicksandCleared: 0,
      sandstormSurvivedSec: 0,
      totalTradeProfit: 0,
      lootCollected: 0,
    },
    recentAutoUpgrades: [],
  };
}

export const INITIAL_MERCENARIES = [
  {
    id: 'harun',
    name: '하룬',
    role: 'MERCHANT' as const,
    level: 1,
    isUnlocked: false,
    skillCooldown: 0,
  },
  {
    id: 'sera',
    name: '세라',
    role: 'ARCHER' as const,
    level: 1,
    isUnlocked: false,
    skillCooldown: 0,
  },
  {
    id: 'zara',
    name: '자라',
    role: 'MAGE' as const,
    level: 1,
    isUnlocked: false,
    skillCooldown: 0,
  },
  {
    id: 'tarik',
    name: '타리크',
    role: 'WARRIOR' as const,
    level: 1,
    isUnlocked: false,
    skillCooldown: 0,
  },
  {
    id: 'lili',
    name: '릴리',
    role: 'HEALER' as const,
    level: 1,
    isUnlocked: false,
    skillCooldown: 0,
  },
];

export function getTodayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

export function getDefaultState(): GameStoreState {
  return {
    meta: {
      isIntroCompleted: false,
      totalPlaySeconds: 0,
      currentAct: 1,
      currentOasisIndex: 0,
      oasisArrivalCount: 0,
      routeProgress: 0.0,
      lastSavedTimestamp: Date.now(),
      saveVersion: CURRENT_SAVE_VERSION,
      hazardConsumed: false,
      timeOfDay: 'DAY',
    },
    currencies: {
      sunGold: 0,
      ancientGear: 0,
      mapFragments: 0,
      templeKeys: 0,
    },
    sandwalker: {
      maxHp: 1000,
      currentHp: 1000,
      solarShieldHp: 0,
      activeTurret: 'HEAT_RAY',
      manualAimTargetId: null,
      turretLevels: {
        HEAT_RAY: 1,
        HARPOON: 1,
        MORTAR: 1,
      },
      turretTiers: {
        HEAT_RAY: 1,
        HARPOON: 1,
        MORTAR: 1,
      },
      legPartLevel: 1,
      wagonCount: 1,
      cargoCapacity: 50, // 1 wagon * 50
    },
    mercenaries: INITIAL_MERCENARIES.map((m) => ({ ...m })),
    monetization: {
      adTier: 0,
      dailySkipTicketsLeft: 0,
      equippedSkinId: 'DEFAULT',
      skipTicketsResetDate: getTodayDateString(),
    },
    trade: {
      cargo: [],
      nextOasisPriceRate: 2.0,
    },
    relics: {
      pending: [],
      codex: [],
    },
    steles: {
      decoded: [],
    },
    dailyMissions: createInitialDailyMissions(getTodayDateString()),
    progression: createInitialProgressionState(),
    explorerPassives: createInitialExplorerPassives(),
    quests: createInitialQuestsState(),
    mercEquipment: {},
    endgame: createDefaultEndgameState(),
  };
}

/** Alias for createDefaultGameStoreState */
export const createDefaultGameStoreState = getDefaultState;

/**
 * Intro Skip Rewards (Decision D10):
 * 300 Sun Gold, 5 Ancient Gears, 1 Map Fragment, Harun & Sera unlocked, 1 Wagon.
 */
export function getIntroSkipState(): GameStoreState {
  const base = getDefaultState();
  base.meta.isIntroCompleted = true;
  base.meta.currentOasisIndex = 1;
  base.currencies.sunGold = 300;
  base.currencies.ancientGear = 5;
  base.currencies.mapFragments = 1;
  base.mercenaries = base.mercenaries.map((merc) => {
    if (merc.id === 'harun' || merc.id === 'sera') {
      return { ...merc, isUnlocked: true };
    }
    return merc;
  });
  return base;
}
