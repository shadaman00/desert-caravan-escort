import { createStore } from 'zustand/vanilla';
import {
  EVENT_INTERVAL_M,
  EXPEDITION_TOTAL_DISTANCE_M,
  MERCENARY_TABLE,
  OASIS_INTERVAL_M,
  TURRET_ORDER,
  type MercenaryId,
  type TurretId,
} from './masterData';
import {
  BASE_CARGO_VALUE,
  MAX_WAGON_COUNT,
  computeCargoCapacityValue,
  computeMercenaryUnlockCost,
  computeTradeProfit,
  computeUpgradeCost,
  computeWagonPurchaseCost,
} from '@/systems/CaravanEconomy';
import {
  advanceMonetizationTimers,
  evaluateOasisInterstitial,
  evaluateRewardedAd,
  type AdMonetizationState,
  type AdTier,
  type InterstitialDecision,
  type RewardedDecision,
  type RewardedPlacement,
} from '@/systems/AdTierManager';

export const SAVE_STORAGE_KEY_V2 = 'sandwalker_save_v2';
export const SAVE_BACKUP_KEY_V2 = 'sandwalker_save_backup';
export const CURRENT_SCHEMA_VERSION_V2 = '2.0.0';

export interface SaveMercenaryEntry {
  id: MercenaryId;
  unlocked: boolean;
  level: number;
}

export interface SaveStateV2 {
  schemaVersion: '2.0.0';
  meta: {
    hasSeenOpeningStoryboard: boolean;
    lastOfflineTimestamp: number;
    autoUpgradeEnabled: boolean;
    pendingTradeMultiplier: number;
    seenEventIds: string[];
  };
  player: {
    gold: number;
    ancientGears: number;
    mapPieces: number;
    templeKeys: number;
    wagonCount: number;
    cargoValue: number;
  };
  sandwalker: {
    equippedTurret: TurretId;
    unlockedTurrets: TurretId[];
    turretLevels: Record<TurretId, number>;
    legLevel: number;
    shieldLevel: number;
  };
  mercenaries: SaveMercenaryEntry[];
  progression: {
    currentBiomeIndex: number;
    currentDistanceMeters: number;
    maxDistanceMeters: number;
    nextEventDistance: number;
    nextOasisDistance: number;
  };
  monetization: AdMonetizationState;
}

export function createInitialSaveStateV2(nowMs = Date.now()): SaveStateV2 {
  return {
    schemaVersion: '2.0.0',
    meta: {
      hasSeenOpeningStoryboard: false,
      lastOfflineTimestamp: nowMs,
      autoUpgradeEnabled: false,
      pendingTradeMultiplier: 1.0,
      seenEventIds: [],
    },
    player: {
      gold: 300,
      ancientGears: 5,
      mapPieces: 0,
      templeKeys: 0,
      wagonCount: 1,
      cargoValue: BASE_CARGO_VALUE,
    },
    sandwalker: {
      equippedTurret: 'TUR_01',
      unlockedTurrets: ['TUR_01'],
      turretLevels: {
        TUR_01: 1,
        TUR_02: 1,
        TUR_03: 1,
      },
      legLevel: 1,
      shieldLevel: 1,
    },
    mercenaries: MERCENARY_TABLE.map((m) => ({
      id: m.id,
      unlocked: m.unlockedByDefault,
      level: 1,
    })),
    progression: {
      currentBiomeIndex: 0,
      currentDistanceMeters: 0,
      maxDistanceMeters: 0,
      nextEventDistance: EVENT_INTERVAL_M,
      nextOasisDistance: OASIS_INTERVAL_M,
    },
    monetization: {
      adTier: 0,
      playTimeSecWithoutAd: 0,
      oasisVisitsSinceLastInterstitial: 0,
      dailyAdSkipRemaining: 0,
      secSinceLastInterstitial: 360,
      zone1FirstOasisSettled: false,
      totalInterstitialsShown: 0,
      totalRewardedWatched: 0,
    },
  };
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function normalizeUnlockedTurrets(raw: unknown, maxDistance: number): TurretId[] {
  const list: TurretId[] = ['TUR_01'];
  if (Array.isArray(raw)) {
    for (let i = 0; i < raw.length; i++) {
      const id = raw[i] as TurretId;
      if (TURRET_ORDER.includes(id) && !list.includes(id)) {
        list.push(id);
      }
    }
  }
  if (maxDistance >= 500 && !list.includes('TUR_02')) list.push('TUR_02');
  if (maxDistance >= 1000 && !list.includes('TUR_03')) list.push('TUR_03');
  return TURRET_ORDER.filter((t) => list.includes(t));
}

/**
 * Loads `sandwalker_save_v2` safely; on JSON parse error or schemaVersion !== '2.0.0',
 * isolates corrupt raw payload into `sandwalker_save_backup` and restores fresh defaults.
 */
export function loadSaveStateV2(storage?: Storage): {
  state: SaveStateV2;
  recoveredFromCorruption: boolean;
} {
  const targetStorage =
    storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined);
  if (!targetStorage) {
    return { state: createInitialSaveStateV2(), recoveredFromCorruption: false };
  }

  const raw = targetStorage.getItem(SAVE_STORAGE_KEY_V2);
  if (!raw) {
    return { state: createInitialSaveStateV2(), recoveredFromCorruption: false };
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (
      !isPlainObject(parsed) ||
      parsed.schemaVersion !== CURRENT_SCHEMA_VERSION_V2 ||
      !isPlainObject(parsed.player) ||
      !isPlainObject(parsed.sandwalker) ||
      !isPlainObject(parsed.progression)
    ) {
      targetStorage.setItem(SAVE_BACKUP_KEY_V2, raw);
      const fresh = createInitialSaveStateV2();
      targetStorage.setItem(SAVE_STORAGE_KEY_V2, JSON.stringify(fresh));
      return { state: fresh, recoveredFromCorruption: true };
    }

    const base = createInitialSaveStateV2();
    const p = parsed.player as Partial<SaveStateV2['player']>;
    const sw = parsed.sandwalker as Partial<SaveStateV2['sandwalker']>;
    const pr = parsed.progression as Partial<SaveStateV2['progression']>;
    const mo = isPlainObject(parsed.monetization)
      ? (parsed.monetization as Partial<SaveStateV2['monetization']>)
      : {};
    const me = isPlainObject(parsed.meta)
      ? (parsed.meta as Partial<SaveStateV2['meta']>)
      : {};

    const wagonCount =
      typeof p.wagonCount === 'number' && Number.isFinite(p.wagonCount)
        ? Math.min(MAX_WAGON_COUNT, Math.max(1, Math.floor(p.wagonCount)))
        : 1;
    const maxDistanceMeters =
      typeof pr.maxDistanceMeters === 'number' && Number.isFinite(pr.maxDistanceMeters)
        ? Math.min(EXPEDITION_TOTAL_DISTANCE_M, Math.max(0, pr.maxDistanceMeters))
        : 0;

    const hydrated: SaveStateV2 = {
      schemaVersion: '2.0.0',
      meta: {
        hasSeenOpeningStoryboard: Boolean(me.hasSeenOpeningStoryboard),
        lastOfflineTimestamp:
          typeof me.lastOfflineTimestamp === 'number' && Number.isFinite(me.lastOfflineTimestamp)
            ? me.lastOfflineTimestamp
            : base.meta.lastOfflineTimestamp,
        autoUpgradeEnabled: Boolean(me.autoUpgradeEnabled),
        pendingTradeMultiplier:
          typeof me.pendingTradeMultiplier === 'number' &&
          Number.isFinite(me.pendingTradeMultiplier) &&
          me.pendingTradeMultiplier >= 1
            ? me.pendingTradeMultiplier
            : 1.0,
        seenEventIds: Array.isArray(me.seenEventIds)
          ? me.seenEventIds.filter((x): x is string => typeof x === 'string')
          : [],
      },
      player: {
        gold: typeof p.gold === 'number' && Number.isFinite(p.gold) ? Math.max(0, Math.floor(p.gold)) : base.player.gold,
        ancientGears:
          typeof p.ancientGears === 'number' && Number.isFinite(p.ancientGears)
            ? Math.max(0, Math.floor(p.ancientGears))
            : base.player.ancientGears,
        mapPieces:
          typeof p.mapPieces === 'number' && Number.isFinite(p.mapPieces)
            ? Math.max(0, Math.floor(p.mapPieces))
            : 0,
        templeKeys:
          typeof p.templeKeys === 'number' && Number.isFinite(p.templeKeys)
            ? Math.max(0, Math.floor(p.templeKeys))
            : 0,
        wagonCount,
        cargoValue:
          typeof p.cargoValue === 'number' && Number.isFinite(p.cargoValue)
            ? Math.max(0, Math.floor(p.cargoValue))
            : computeCargoCapacityValue(wagonCount),
      },
      sandwalker: {
        equippedTurret: TURRET_ORDER.includes(sw.equippedTurret as TurretId)
          ? (sw.equippedTurret as TurretId)
          : 'TUR_01',
        unlockedTurrets: normalizeUnlockedTurrets(sw.unlockedTurrets, maxDistanceMeters),
        turretLevels: {
          ...base.sandwalker.turretLevels,
          ...(isPlainObject(sw.turretLevels)
            ? (sw.turretLevels as Record<TurretId, number>)
            : {}),
        },
        legLevel:
          typeof sw.legLevel === 'number' && Number.isFinite(sw.legLevel)
            ? Math.max(1, Math.floor(sw.legLevel))
            : 1,
        shieldLevel:
          typeof sw.shieldLevel === 'number' && Number.isFinite(sw.shieldLevel)
            ? Math.max(1, Math.floor(sw.shieldLevel))
            : 1,
      },
      mercenaries: Array.isArray(parsed.mercenaries)
        ? base.mercenaries.map((def) => {
            const match = (parsed.mercenaries as unknown[]).find(
              (m) => isPlainObject(m) && m.id === def.id
            ) as Partial<SaveMercenaryEntry> | undefined;
            return match
              ? {
                  id: def.id,
                  unlocked: Boolean(match.unlocked),
                  level:
                    typeof match.level === 'number' && Number.isFinite(match.level)
                      ? Math.max(1, Math.floor(match.level))
                      : 1,
                }
              : def;
          })
        : base.mercenaries,
      progression: {
        currentBiomeIndex:
          typeof pr.currentBiomeIndex === 'number' && Number.isFinite(pr.currentBiomeIndex)
            ? Math.min(3, Math.max(0, Math.floor(pr.currentBiomeIndex)))
            : 0,
        currentDistanceMeters:
          typeof pr.currentDistanceMeters === 'number' && Number.isFinite(pr.currentDistanceMeters)
            ? Math.min(EXPEDITION_TOTAL_DISTANCE_M, Math.max(0, pr.currentDistanceMeters))
            : 0,
        maxDistanceMeters,
        nextEventDistance:
          typeof pr.nextEventDistance === 'number' && Number.isFinite(pr.nextEventDistance)
            ? Math.max(EVENT_INTERVAL_M, pr.nextEventDistance)
            : EVENT_INTERVAL_M,
        nextOasisDistance:
          typeof pr.nextOasisDistance === 'number' && Number.isFinite(pr.nextOasisDistance)
            ? Math.max(OASIS_INTERVAL_M, pr.nextOasisDistance)
            : OASIS_INTERVAL_M,
      },
      monetization: {
        adTier:
          mo.adTier === 0 || mo.adTier === 1 || mo.adTier === 2 || mo.adTier === 3
            ? mo.adTier
            : 0,
        playTimeSecWithoutAd:
          typeof mo.playTimeSecWithoutAd === 'number' && Number.isFinite(mo.playTimeSecWithoutAd)
            ? Math.max(0, mo.playTimeSecWithoutAd)
            : 0,
        oasisVisitsSinceLastInterstitial:
          typeof mo.oasisVisitsSinceLastInterstitial === 'number' &&
          Number.isFinite(mo.oasisVisitsSinceLastInterstitial)
            ? Math.max(0, Math.floor(mo.oasisVisitsSinceLastInterstitial))
            : 0,
        dailyAdSkipRemaining:
          typeof mo.dailyAdSkipRemaining === 'number' && Number.isFinite(mo.dailyAdSkipRemaining)
            ? Math.max(0, Math.floor(mo.dailyAdSkipRemaining))
            : 0,
        secSinceLastInterstitial:
          typeof mo.secSinceLastInterstitial === 'number' &&
          Number.isFinite(mo.secSinceLastInterstitial)
            ? Math.max(0, mo.secSinceLastInterstitial)
            : 360,
        zone1FirstOasisSettled: Boolean(mo.zone1FirstOasisSettled),
        totalInterstitialsShown:
          typeof mo.totalInterstitialsShown === 'number' &&
          Number.isFinite(mo.totalInterstitialsShown)
            ? Math.max(0, Math.floor(mo.totalInterstitialsShown))
            : 0,
        totalRewardedWatched:
          typeof mo.totalRewardedWatched === 'number' &&
          Number.isFinite(mo.totalRewardedWatched)
            ? Math.max(0, Math.floor(mo.totalRewardedWatched))
            : 0,
      },
    };

    return { state: hydrated, recoveredFromCorruption: false };
  } catch {
    targetStorage.setItem(SAVE_BACKUP_KEY_V2, raw);
    const fresh = createInitialSaveStateV2();
    targetStorage.setItem(SAVE_STORAGE_KEY_V2, JSON.stringify(fresh));
    return { state: fresh, recoveredFromCorruption: true };
  }
}

export function persistSaveStateV2(state: SaveStateV2, storage?: Storage): void {
  const targetStorage =
    storage ?? (typeof window !== 'undefined' ? window.localStorage : undefined);
  if (!targetStorage) return;
  try {
    targetStorage.setItem(SAVE_STORAGE_KEY_V2, JSON.stringify(state));
  } catch {
    // Ignore storage quota errors in restricted environments
  }
}

export interface GameStoreV2Actions {
  setDistanceMeters: (distance: number, biomeIndex?: number) => void;
  cycleTurret: (explicitId?: TurretId) => TurretId;
  unlockTurret: (id: TurretId) => void;
  addPlayerResources: (delta: Partial<SaveStateV2['player']>) => void;
  markOpeningSeen: () => void;
  setAutoUpgradeEnabled: (enabled: boolean) => void;
  setPendingTradeMultiplier: (mult: number) => void;
  upgradeTurret: (id: TurretId) => boolean;
  upgradeLeg: () => boolean;
  upgradeShield: () => boolean;
  buyWagon: () => boolean;
  upgradeOrUnlockMercenary: (id: MercenaryId) => boolean;
  settleOasisTrade: (
    biomeIndex: number,
    useJafarMultiplier?: boolean
  ) => { totalProfit: number; restockedCargo: number };
  advanceNextEventDistance: (seenEventId?: string) => void;
  advanceNextOasisDistance: () => void;
  syncMilestonesAfterJump: (distanceMeters: number) => void;
  touchOfflineTimestamp: (nowMs?: number) => void;
  setAdTier: (tier: AdTier) => void;
  addPlayTimeForAd: (dtSec: number) => void;
  recordOasisSettlementForAd: (opts?: { isChapterBossCleared?: boolean }) => InterstitialDecision;
  recordRewardedAd: (placement: RewardedPlacement) => RewardedDecision;
  resetAll: () => void;
}

export type GameStoreV2 = SaveStateV2 & GameStoreV2Actions;

export const gameStore = createStore<GameStoreV2>((set, get) => ({
  ...createInitialSaveStateV2(),

  setDistanceMeters: (distance: number, biomeIndex?: number) =>
    set((s) => {
      const clamped = Math.min(EXPEDITION_TOTAL_DISTANCE_M, Math.max(0, distance));
      const maxDist = Math.max(s.progression.maxDistanceMeters, clamped);
      const nextBiome =
        biomeIndex !== undefined
          ? Math.min(3, Math.max(0, biomeIndex))
          : Math.min(3, Math.floor(clamped / OASIS_INTERVAL_M));
      const unlocked = s.sandwalker.unlockedTurrets.slice();
      if (maxDist >= 500 && !unlocked.includes('TUR_02')) unlocked.push('TUR_02');
      if (maxDist >= 1000 && !unlocked.includes('TUR_03')) unlocked.push('TUR_03');
      return {
        sandwalker: {
          ...s.sandwalker,
          unlockedTurrets: TURRET_ORDER.filter((t) => unlocked.includes(t)),
        },
        progression: {
          ...s.progression,
          currentDistanceMeters: clamped,
          maxDistanceMeters: maxDist,
          currentBiomeIndex: nextBiome,
        },
      };
    }),

  cycleTurret: (explicitId?: TurretId) => {
    const s = get();
    const cur = s.sandwalker.equippedTurret;
    const pool =
      s.sandwalker.unlockedTurrets.length > 0 ? s.sandwalker.unlockedTurrets : (['TUR_01'] as TurretId[]);
    const next: TurretId =
      explicitId && TURRET_ORDER.includes(explicitId)
        ? explicitId
        : pool[(pool.indexOf(cur) + 1) % pool.length];
    set((prev) => ({
      sandwalker: {
        ...prev.sandwalker,
        equippedTurret: next,
      },
    }));
    return next;
  },

  unlockTurret: (id: TurretId) =>
    set((s) => {
      if (s.sandwalker.unlockedTurrets.includes(id)) return s;
      const merged = TURRET_ORDER.filter(
        (t) => t === id || s.sandwalker.unlockedTurrets.includes(t)
      );
      return {
        sandwalker: {
          ...s.sandwalker,
          unlockedTurrets: merged,
        },
      };
    }),

  addPlayerResources: (delta) =>
    set((s) => ({
      player: {
        ...s.player,
        gold: Math.max(0, s.player.gold + (delta.gold ?? 0)),
        ancientGears: Math.max(0, s.player.ancientGears + (delta.ancientGears ?? 0)),
        mapPieces: Math.max(0, s.player.mapPieces + (delta.mapPieces ?? 0)),
        templeKeys: Math.max(0, s.player.templeKeys + (delta.templeKeys ?? 0)),
        wagonCount: Math.min(
          MAX_WAGON_COUNT,
          Math.max(1, s.player.wagonCount + (delta.wagonCount ?? 0))
        ),
        cargoValue: Math.max(0, s.player.cargoValue + (delta.cargoValue ?? 0)),
      },
    })),

  markOpeningSeen: () =>
    set((s) => ({
      meta: {
        ...s.meta,
        hasSeenOpeningStoryboard: true,
      },
    })),

  setAutoUpgradeEnabled: (enabled: boolean) =>
    set((s) => ({
      meta: {
        ...s.meta,
        autoUpgradeEnabled: enabled,
      },
    })),

  setPendingTradeMultiplier: (mult: number) =>
    set((s) => ({
      meta: {
        ...s.meta,
        pendingTradeMultiplier: Math.max(1, mult),
      },
    })),

  upgradeTurret: (id: TurretId) => {
    const s = get();
    if (!s.sandwalker.unlockedTurrets.includes(id)) return false;
    const curLv = s.sandwalker.turretLevels[id] ?? 1;
    const cost = computeUpgradeCost(curLv);
    if (s.player.gold < cost) return false;
    set((prev) => ({
      player: {
        ...prev.player,
        gold: prev.player.gold - cost,
      },
      sandwalker: {
        ...prev.sandwalker,
        turretLevels: {
          ...prev.sandwalker.turretLevels,
          [id]: curLv + 1,
        },
      },
    }));
    return true;
  },

  upgradeLeg: () => {
    const s = get();
    const cost = computeUpgradeCost(s.sandwalker.legLevel);
    if (s.player.gold < cost) return false;
    set((prev) => ({
      player: {
        ...prev.player,
        gold: prev.player.gold - cost,
      },
      sandwalker: {
        ...prev.sandwalker,
        legLevel: prev.sandwalker.legLevel + 1,
      },
    }));
    return true;
  },

  upgradeShield: () => {
    const s = get();
    const cost = computeUpgradeCost(s.sandwalker.shieldLevel);
    if (s.player.gold < cost) return false;
    set((prev) => ({
      player: {
        ...prev.player,
        gold: prev.player.gold - cost,
      },
      sandwalker: {
        ...prev.sandwalker,
        shieldLevel: prev.sandwalker.shieldLevel + 1,
      },
    }));
    return true;
  },

  buyWagon: () => {
    const s = get();
    if (s.player.wagonCount >= MAX_WAGON_COUNT) return false;
    const cost = computeWagonPurchaseCost(s.player.wagonCount);
    if (s.player.gold < cost) return false;
    const nextCount = s.player.wagonCount + 1;
    set((prev) => ({
      player: {
        ...prev.player,
        gold: prev.player.gold - cost,
        wagonCount: nextCount,
        cargoValue: computeCargoCapacityValue(nextCount),
      },
    }));
    return true;
  },

  upgradeOrUnlockMercenary: (id: MercenaryId) => {
    const s = get();
    const idx = s.mercenaries.findIndex((m) => m.id === id);
    if (idx < 0) return false;
    const entry = s.mercenaries[idx];
    const cost = entry.unlocked
      ? computeUpgradeCost(entry.level)
      : computeMercenaryUnlockCost(id);
    if (s.player.gold < cost) return false;

    const nextMercs = s.mercenaries.map((m, i) =>
      i === idx
        ? entry.unlocked
          ? { ...m, level: m.level + 1 }
          : { ...m, unlocked: true, level: 1 }
        : m
    );
    set((prev) => ({
      player: {
        ...prev.player,
        gold: prev.player.gold - cost,
      },
      mercenaries: nextMercs,
    }));
    return true;
  },

  settleOasisTrade: (biomeIndex: number, useJafarMultiplier = false) => {
    const s = get();
    const harun = s.mercenaries.find((m) => m.id === 'harun');
    const merchantLv = harun?.unlocked ? harun.level : 1;
    const mult = useJafarMultiplier
      ? Math.max(2.0, s.meta.pendingTradeMultiplier)
      : s.meta.pendingTradeMultiplier;
    const breakdown = computeTradeProfit(s.player.cargoValue, biomeIndex, merchantLv, mult);
    const restockedCargo = computeCargoCapacityValue(s.player.wagonCount);

    set((prev) => ({
      meta: {
        ...prev.meta,
        pendingTradeMultiplier: 1.0,
      },
      player: {
        ...prev.player,
        gold: prev.player.gold + breakdown.totalProfit,
        cargoValue: restockedCargo,
      },
    }));

    return {
      totalProfit: breakdown.totalProfit,
      restockedCargo,
    };
  },

  advanceNextEventDistance: (seenEventId?: string) =>
    set((s) => {
      const seen =
        seenEventId && !s.meta.seenEventIds.includes(seenEventId)
          ? [...s.meta.seenEventIds, seenEventId]
          : s.meta.seenEventIds;
      return {
        meta: {
          ...s.meta,
          seenEventIds: seen,
        },
        progression: {
          ...s.progression,
          nextEventDistance: s.progression.nextEventDistance + EVENT_INTERVAL_M,
        },
      };
    }),

  advanceNextOasisDistance: () =>
    set((s) => ({
      progression: {
        ...s.progression,
        nextOasisDistance: s.progression.nextOasisDistance + OASIS_INTERVAL_M,
      },
    })),

  syncMilestonesAfterJump: (distanceMeters: number) =>
    set((s) => {
      const clamped = Math.min(EXPEDITION_TOTAL_DISTANCE_M, Math.max(0, distanceMeters));
      const nextEvent =
        Math.floor(clamped / EVENT_INTERVAL_M) * EVENT_INTERVAL_M + EVENT_INTERVAL_M;
      const nextOasis =
        Math.floor(clamped / OASIS_INTERVAL_M) * OASIS_INTERVAL_M + OASIS_INTERVAL_M;
      return {
        progression: {
          ...s.progression,
          nextEventDistance: Math.min(EXPEDITION_TOTAL_DISTANCE_M + EVENT_INTERVAL_M, nextEvent),
          nextOasisDistance: Math.min(EXPEDITION_TOTAL_DISTANCE_M + OASIS_INTERVAL_M, nextOasis),
        },
      };
    }),

  touchOfflineTimestamp: (nowMs = Date.now()) =>
    set((s) => ({
      meta: {
        ...s.meta,
        lastOfflineTimestamp: nowMs,
      },
    })),

  setAdTier: (tier: AdTier) =>
    set((s) => ({
      monetization: {
        ...s.monetization,
        adTier: tier,
      },
    })),

  addPlayTimeForAd: (dtSec: number) =>
    set((s) => ({
      monetization: advanceMonetizationTimers(s.monetization, dtSec),
    })),

  recordOasisSettlementForAd: (opts?: { isChapterBossCleared?: boolean }) => {
    const s = get();
    const candidateState: AdMonetizationState = {
      ...s.monetization,
      oasisVisitsSinceLastInterstitial: s.monetization.oasisVisitsSinceLastInterstitial + 1,
    };
    const decision = evaluateOasisInterstitial(candidateState, opts);

    set((prev) => {
      const nextMon: AdMonetizationState = {
        ...prev.monetization,
        oasisVisitsSinceLastInterstitial: candidateState.oasisVisitsSinceLastInterstitial,
        zone1FirstOasisSettled: true,
      };
      if (decision.usedSkipTicket) {
        nextMon.dailyAdSkipRemaining = Math.max(0, nextMon.dailyAdSkipRemaining - 1);
        nextMon.oasisVisitsSinceLastInterstitial = 0;
        nextMon.secSinceLastInterstitial = 0;
      } else if (decision.allowed) {
        nextMon.oasisVisitsSinceLastInterstitial = 0;
        nextMon.secSinceLastInterstitial = 0;
        nextMon.totalInterstitialsShown += 1;
      }
      return { monetization: nextMon };
    });

    return decision;
  },

  recordRewardedAd: (placement: RewardedPlacement) => {
    const s = get();
    const decision = evaluateRewardedAd(placement, s.monetization);
    set((prev) => ({
      monetization: {
        ...prev.monetization,
        dailyAdSkipRemaining: decision.consumedSkipTicket
          ? Math.max(0, prev.monetization.dailyAdSkipRemaining - 1)
          : prev.monetization.dailyAdSkipRemaining,
        totalRewardedWatched: decision.instantPass
          ? prev.monetization.totalRewardedWatched
          : prev.monetization.totalRewardedWatched + 1,
      },
    }));
    return decision;
  },

  resetAll: () => set(() => createInitialSaveStateV2()),
}));
