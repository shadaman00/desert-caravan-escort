import {
  AutoInvestPolicy,
  AutoUpgradeEventRecord,
  DailyMissionId,
  EndgameState,
  EquipmentRarity,
  ExplorerPassivesState,
  GameStoreState,
  MercenaryEquipmentSlot,
  ProgressionState,
  QuestsState,
} from '../store/types';
import {
  getDefaultState,
  CURRENT_SAVE_VERSION,
  getTodayDateString,
  createInitialProgressionState,
  createInitialExplorerPassives,
  createInitialQuestsState,
  createDefaultEndgameState,
} from '../store/defaults';
import { DAILY_MISSION_DEFINITIONS, createInitialDailyMissions } from '../game/data/dailyMissions';

export interface MigrationResult {
  success: boolean;
  state: GameStoreState;
}

function isPlainObject(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function safeNonNegInt(val: unknown, fallback = 0): number {
  return typeof val === 'number' && Number.isFinite(val) && val >= 0 ? Math.floor(val) : fallback;
}

const VALID_POLICIES: readonly AutoInvestPolicy[] = ['MANUAL', 'BALANCED', 'COMBAT', 'ECONOMY'];

function normalizeProgression(raw: unknown): ProgressionState {
  const base = createInitialProgressionState();
  if (!isPlainObject(raw)) return base;

  const policy = VALID_POLICIES.includes(raw.autoInvestPolicy as AutoInvestPolicy)
    ? (raw.autoInvestPolicy as AutoInvestPolicy)
    : base.autoInvestPolicy;

  const rawCounters = isPlainObject(raw.counters) ? raw.counters : {};
  const rawKills = isPlainObject(rawCounters.killsByTurret) ? rawCounters.killsByTurret : {};

  const completedMilestones = Array.isArray(raw.completedMilestones)
    ? raw.completedMilestones.filter((id): id is string => typeof id === 'string')
    : [];

  const recentAutoUpgrades = Array.isArray(raw.recentAutoUpgrades)
    ? raw.recentAutoUpgrades
        .filter((ev): ev is AutoUpgradeEventRecord => isPlainObject(ev) && typeof ev.id === 'string')
        .slice(0, 15)
    : [];

  return {
    autoInvestPolicy: policy,
    completedMilestones,
    counters: {
      killsByTurret: {
        HEAT_RAY: safeNonNegInt(rawKills.HEAT_RAY),
        HARPOON: safeNonNegInt(rawKills.HARPOON),
        MORTAR: safeNonNegInt(rawKills.MORTAR),
      },
      bossPartBreaks: safeNonNegInt(rawCounters.bossPartBreaks),
      bossDefeats: safeNonNegInt(rawCounters.bossDefeats),
      stelesDecoded: safeNonNegInt(rawCounters.stelesDecoded),
      relicsAppraised: safeNonNegInt(rawCounters.relicsAppraised),
      quicksandCleared: safeNonNegInt(rawCounters.quicksandCleared),
      sandstormSurvivedSec: safeNonNegInt(rawCounters.sandstormSurvivedSec),
      totalTradeProfit: safeNonNegInt(rawCounters.totalTradeProfit),
      lootCollected: safeNonNegInt(rawCounters.lootCollected),
    },
    recentAutoUpgrades,
  };
}

function normalizeExplorerPassives(raw: unknown): ExplorerPassivesState {
  const base = createInitialExplorerPassives();
  if (!isPlainObject(raw)) return base;
  return {
    appraisalLv: Math.max(1, safeNonNegInt(raw.appraisalLv, 1)),
    survivalLv: Math.max(1, safeNonNegInt(raw.survivalLv, 1)),
    linguisticsLv: Math.max(1, safeNonNegInt(raw.linguisticsLv, 1)),
  };
}

function normalizeQuests(raw: unknown): QuestsState {
  const base = createInitialQuestsState();
  if (!isPlainObject(raw)) return base;
  const completedIds = Array.isArray(raw.completedIds)
    ? raw.completedIds.filter((id): id is string => typeof id === 'string')
    : [];
  const u = isPlainObject(raw.urgentDelivery) ? raw.urgentDelivery : {};
  return {
    completedIds,
    urgentDelivery: {
      active: Boolean(u.active),
      startedAtPlaySec: safeNonNegInt(u.startedAtPlaySec, 0),
      timeLimitSec: Math.max(30, safeNonNegInt(u.timeLimitSec, 120)),
      completedCount: safeNonNegInt(u.completedCount, 0),
    },
  };
}

const VALID_EQUIP_RARITIES: readonly EquipmentRarity[] = ['COMMON', 'RARE', 'LEGENDARY', 'ANCIENT'];

function normalizeMercEquipment(raw: unknown): Partial<Record<string, MercenaryEquipmentSlot>> {
  if (!isPlainObject(raw)) return {};
  const result: Partial<Record<string, MercenaryEquipmentSlot>> = {};
  for (const key of ['tarik', 'sera', 'zara', 'lili', 'harun']) {
    const entry = raw[key];
    if (!isPlainObject(entry)) continue;
    const rarity = VALID_EQUIP_RARITIES.includes(entry.rarity as EquipmentRarity)
      ? (entry.rarity as EquipmentRarity)
      : 'COMMON';
    result[key] = {
      rarity,
      level: Math.max(1, Math.min(20, safeNonNegInt(entry.level, 1))),
      xp: safeNonNegInt(entry.xp, 0),
    };
  }
  return result;
}

function normalizeEndgame(raw: unknown): EndgameState {
  const base = createDefaultEndgameState();
  if (!isPlainObject(raw)) return base;
  return {
    templeGateUnlocked: Boolean(raw.templeGateUnlocked),
    endingCompleted: Boolean(raw.endingCompleted),
    pendingEndingModal: Boolean(raw.pendingEndingModal),
    endlessUnlocked: Boolean(raw.endlessUnlocked),
    endlessActive: Boolean(raw.endlessActive) && Boolean(raw.endlessUnlocked),
    currentDepth: Math.max(1, safeNonNegInt(raw.currentDepth, 1)),
    maxDepthCleared: safeNonNegInt(raw.maxDepthCleared, 0),
    goldenTradeActive: Boolean(raw.goldenTradeActive),
  };
}

export function migrate(envelope: any): MigrationResult {
  try {
    if (!isPlainObject(envelope)) {
      return { success: false, state: getDefaultState() };
    }

    if (envelope.v !== undefined && typeof envelope.v !== 'number') {
      return { success: false, state: getDefaultState() };
    }

    const rawState = envelope.state;

    if (!isPlainObject(rawState)) {
      return { success: false, state: getDefaultState() };
    }

    const defaults = getDefaultState();

    const metaSlice = isPlainObject(rawState.meta) ? rawState.meta : {};
    const currenciesSlice = isPlainObject(rawState.currencies) ? rawState.currencies : {};
    const sandwalkerSlice = isPlainObject(rawState.sandwalker) ? rawState.sandwalker : {};
    const turretLevelsSlice = isPlainObject(sandwalkerSlice.turretLevels)
      ? sandwalkerSlice.turretLevels
      : {};
    const turretTiersSlice = isPlainObject(sandwalkerSlice.turretTiers)
      ? sandwalkerSlice.turretTiers
      : {};
    const monetizationSlice = isPlainObject(rawState.monetization) ? rawState.monetization : {};
    const tradeSlice = isPlainObject(rawState.trade) ? rawState.trade : {};
    const relicsSlice = isPlainObject(rawState.relics) ? rawState.relics : {};
    const stelesSlice = isPlainObject(rawState.steles) ? rawState.steles : {};
    const missionsSlice = isPlainObject(rawState.dailyMissions) ? rawState.dailyMissions : null;
    const todayStr = getTodayDateString();
    let normalizedMissions = createInitialDailyMissions(todayStr);
    if (
      missionsSlice &&
      typeof missionsSlice.resetDate === 'string' &&
      Array.isArray(missionsSlice.items)
    ) {
      normalizedMissions = {
        resetDate: missionsSlice.resetDate,
        items: DAILY_MISSION_DEFINITIONS.map((def) => {
          const match = missionsSlice.items.find(
            (item: unknown) =>
              isPlainObject(item) && (item.id as DailyMissionId) === def.id
          );
          return {
            id: def.id,
            progress:
              match && typeof match.progress === 'number' && Number.isFinite(match.progress)
                ? Math.max(0, Math.floor(match.progress))
                : 0,
            claimed: Boolean(match && match.claimed),
          };
        }),
      };
    }

    // Deep merge defaults for missing or non-object slices
    const state: GameStoreState = {
      meta: { ...defaults.meta, ...metaSlice },
      currencies: { ...defaults.currencies, ...currenciesSlice },
      sandwalker: {
        ...defaults.sandwalker,
        ...sandwalkerSlice,
        turretLevels: { ...defaults.sandwalker.turretLevels, ...turretLevelsSlice },
        turretTiers: { ...defaults.sandwalker.turretTiers, ...turretTiersSlice },
      },
      mercenaries:
        Array.isArray(rawState.mercenaries) &&
        rawState.mercenaries.length === 5 &&
        rawState.mercenaries.every(isPlainObject)
          ? defaults.mercenaries.map((defMerc, idx) => ({
              ...defMerc,
              ...(rawState.mercenaries[idx] as Partial<typeof defMerc>),
            }))
          : defaults.mercenaries,
      monetization: { ...defaults.monetization, ...monetizationSlice },
      trade: {
        ...defaults.trade,
        ...tradeSlice,
        cargo: Array.isArray(tradeSlice.cargo) ? tradeSlice.cargo : [],
      },
      relics: {
        ...defaults.relics,
        ...relicsSlice,
        pending: Array.isArray(relicsSlice.pending) ? relicsSlice.pending : [],
        codex: Array.isArray(relicsSlice.codex) ? relicsSlice.codex : [],
      },
      steles: {
        ...defaults.steles,
        ...stelesSlice,
        decoded: Array.isArray(stelesSlice.decoded) ? stelesSlice.decoded : [],
      },
      dailyMissions: normalizedMissions,
      progression: normalizeProgression(rawState.progression),
      explorerPassives: normalizeExplorerPassives(rawState.explorerPassives),
      quests: normalizeQuests(rawState.quests),
      mercEquipment: normalizeMercEquipment(rawState.mercEquipment),
      endgame: normalizeEndgame(rawState.endgame),
    };

    // Forward version tag
    state.meta.saveVersion = CURRENT_SAVE_VERSION;

    return { success: true, state };
  } catch (err) {
    console.error('[Migration] Failed to migrate save envelope:', err);
    return { success: false, state: getDefaultState() };
  }
}
