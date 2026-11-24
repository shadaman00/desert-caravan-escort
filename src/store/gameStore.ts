import { create } from 'zustand';
import {
  GameStoreState,
  GameStoreActions,
  TurretType,
  AdTierLevel,
  SkinId,
  TimeOfDay,
  TradeCargoItem,
  CurrenciesState,
  DailyMissionId,
  DailyMissionsState,
} from './types';
import { getDefaultState, getTodayDateString } from './defaults';
import {
  createInitialDailyMissions,
  getDailyMissionDefinition,
} from '../game/data/dailyMissions';
import { upgradeCost, tierUpGearCost, tradeSellPayout } from '../game/formulas';
import { SaveManager } from '../persistence/saveManager';

function ensureTodayMissions(
  current: DailyMissionsState | undefined,
  todayStr = getTodayDateString()
): DailyMissionsState {
  if (!current || current.resetDate !== todayStr || !Array.isArray(current.items)) {
    return createInitialDailyMissions(todayStr);
  }
  return current;
}

function advanceMissionState(
  current: DailyMissionsState | undefined,
  id: DailyMissionId,
  delta: number
): DailyMissionsState {
  const base = ensureTodayMissions(current);
  const safeDelta = Number.isFinite(delta) && delta > 0 ? Math.floor(delta) : 0;
  if (safeDelta <= 0) return base;
  const def = getDailyMissionDefinition(id);
  return {
    ...base,
    items: base.items.map((item) =>
      item.id === id
        ? { ...item, progress: Math.min(def.target, item.progress + safeDelta) }
        : item
    ),
  };
}

export const useGameStore = create<GameStoreState & GameStoreActions>()((set, get) => ({
  ...getDefaultState(),

  // --------------------------------------------------------------------------
  // Meta Actions
  // --------------------------------------------------------------------------
  setIntroCompleted: (completed: boolean) =>
    set((state) => ({
      meta: { ...state.meta, isIntroCompleted: completed },
    })),

  addPlayTime: (seconds: number) =>
    set((state) => ({
      meta: { ...state.meta, totalPlaySeconds: state.meta.totalPlaySeconds + seconds },
    })),

  setPlayTime: (seconds: number) =>
    set((state) => ({
      meta: { ...state.meta, totalPlaySeconds: Math.max(0, seconds) },
    })),

  setAct: (act: number) =>
    set((state) => ({
      meta: { ...state.meta, currentAct: act, hazardConsumed: false },
    })),

  setOasisIndex: (index: number) =>
    set((state) => ({
      meta: { ...state.meta, currentOasisIndex: index },
    })),

  incrementOasisArrival: () =>
    set((state) => ({
      meta: { ...state.meta, oasisArrivalCount: state.meta.oasisArrivalCount + 1 },
      dailyMissions: advanceMissionState(state.dailyMissions, 'CLEAR_ROUTE', 1),
    })),

  setRouteProgress: (progress: number) =>
    set((state) => {
      const clamped = Math.min(100, Math.max(0, progress));
      if (state.meta.routeProgress === clamped) return state;
      return {
        meta: { ...state.meta, routeProgress: clamped },
      };
    }),

  setHazardConsumed: (consumed: boolean) =>
    set((state) => ({
      meta: { ...state.meta, hazardConsumed: consumed },
    })),

  setTimeOfDay: (timeOfDay: TimeOfDay) =>
    set((state) => ({
      meta: { ...state.meta, timeOfDay },
    })),

  // --------------------------------------------------------------------------
  // Currency Actions
  // --------------------------------------------------------------------------
  addCurrencies: (delta: Partial<CurrenciesState> | number, gears?: number) =>
    set((state) => {
      const sanitizePositiveDelta = (v: unknown): number =>
        typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0;

      let deltaGold = 0;
      let deltaGears = 0;
      let deltaFragments = 0;
      let deltaKeys = 0;

      if (typeof delta === 'number') {
        deltaGold = sanitizePositiveDelta(delta);
        deltaGears = sanitizePositiveDelta(gears);
      } else if (delta && typeof delta === 'object') {
        deltaGold = sanitizePositiveDelta(delta.sunGold);
        deltaGears = sanitizePositiveDelta(delta.ancientGear);
        deltaFragments = sanitizePositiveDelta(delta.mapFragments);
        deltaKeys = sanitizePositiveDelta(delta.templeKeys);
      }

      if (deltaGold === 0 && deltaGears === 0 && deltaFragments === 0 && deltaKeys === 0) {
        return state;
      }

      return {
        currencies: {
          sunGold: state.currencies.sunGold + deltaGold,
          ancientGear: state.currencies.ancientGear + deltaGears,
          mapFragments: Math.min(10, state.currencies.mapFragments + deltaFragments),
          templeKeys: Math.min(3, state.currencies.templeKeys + deltaKeys),
        },
      };
    }),

  spendCurrencies: (cost: Partial<CurrenciesState>) => {
    if (!cost || typeof cost !== 'object') return false;
    const costFields: Array<keyof CurrenciesState> = [
      'sunGold',
      'ancientGear',
      'mapFragments',
      'templeKeys',
    ];
    for (const key of costFields) {
      const v = cost[key];
      if (v !== undefined && (typeof v !== 'number' || !Number.isFinite(v) || v < 0)) {
        return false;
      }
    }

    const { currencies } = get();
    const reqGold = cost.sunGold ?? 0;
    const reqGears = cost.ancientGear ?? 0;
    const reqFragments = cost.mapFragments ?? 0;
    const reqKeys = cost.templeKeys ?? 0;

    if (
      currencies.sunGold < reqGold ||
      currencies.ancientGear < reqGears ||
      currencies.mapFragments < reqFragments ||
      currencies.templeKeys < reqKeys
    ) {
      return false;
    }

    set((state) => ({
      currencies: {
        sunGold: state.currencies.sunGold - reqGold,
        ancientGear: state.currencies.ancientGear - reqGears,
        mapFragments: state.currencies.mapFragments - reqFragments,
        templeKeys: state.currencies.templeKeys - reqKeys,
      },
    }));
    return true;
  },

  // --------------------------------------------------------------------------
  // Sandwalker Actions
  // --------------------------------------------------------------------------
  setHp: (hp: number) =>
    set((state) => {
      if (!Number.isFinite(hp)) return state;
      const nextHp = Math.min(state.sandwalker.maxHp, Math.max(0, hp));
      if (state.sandwalker.currentHp === nextHp) return state;
      return {
        sandwalker: {
          ...state.sandwalker,
          currentHp: nextHp,
        },
      };
    }),

  applyDamage: (amount: number) => {
    if (!Number.isFinite(amount) || amount <= 0) {
      return {
        shieldAbsorbed: 0,
        hpDamage: 0,
        isDestroyed: get().sandwalker.currentHp <= 0,
      };
    }

    let absorbed = 0;
    let hpDmg = 0;
    let destroyed = false;

    set((state) => {
      let currentShield = state.sandwalker.solarShieldHp;
      let currentHp = state.sandwalker.currentHp;
      let remainingDamage = amount;

      if (currentShield > 0) {
        if (currentShield >= remainingDamage) {
          absorbed = remainingDamage;
          currentShield -= remainingDamage;
          remainingDamage = 0;
        } else {
          absorbed = currentShield;
          remainingDamage -= currentShield;
          currentShield = 0;
        }
      }

      if (remainingDamage > 0) {
        hpDmg = remainingDamage;
        currentHp = Math.max(0, currentHp - remainingDamage);
      }

      destroyed = currentHp <= 0;

      return {
        sandwalker: {
          ...state.sandwalker,
          solarShieldHp: currentShield,
          currentHp: currentHp,
        },
      };
    });

    return { shieldAbsorbed: absorbed, hpDamage: hpDmg, isDestroyed: destroyed };
  },

  repairHp: (amount: number) =>
    set((state) => {
      if (!Number.isFinite(amount) || amount <= 0) return state;
      const nextHp = Math.min(state.sandwalker.maxHp, state.sandwalker.currentHp + amount);
      if (nextHp === state.sandwalker.currentHp) return state;
      return {
        sandwalker: {
          ...state.sandwalker,
          currentHp: nextHp,
        },
      };
    }),

  setSolarShield: (amount: number) =>
    set((state) => {
      if (!Number.isFinite(amount)) return state;
      const nextShield = Math.min(state.sandwalker.maxHp, Math.max(0, amount));
      if (state.sandwalker.solarShieldHp === nextShield) return state;
      return {
        sandwalker: {
          ...state.sandwalker,
          solarShieldHp: nextShield,
        },
      };
    }),

  switchTurret: (turret: TurretType) =>
    set((state) => {
      if (turret !== 'HEAT_RAY' && turret !== 'HARPOON' && turret !== 'MORTAR') {
        return state;
      }
      if (state.sandwalker.activeTurret === turret) return state;
      return {
        sandwalker: { ...state.sandwalker, activeTurret: turret },
      };
    }),

  setManualAimTarget: (targetId: string | null) =>
    set((state) => {
      if (state.sandwalker.manualAimTargetId === targetId) return state;
      return {
        sandwalker: { ...state.sandwalker, manualAimTargetId: targetId },
      };
    }),

  upgradeTurret: (turret: TurretType) => {
    const { sandwalker, currencies } = get();
    if (
      !Object.prototype.hasOwnProperty.call(sandwalker.turretLevels, turret) ||
      !Object.prototype.hasOwnProperty.call(sandwalker.turretTiers, turret)
    ) {
      return false;
    }
    const curLevel = sandwalker.turretLevels[turret];
    if (curLevel >= 30) return false;

    // Check tier promotion cap (level 10 requires tier 2, level 20 requires tier 3)
    const curTier = sandwalker.turretTiers[turret];
    if (curLevel >= curTier * 10) {
      return false; // Must tierUpTurret first
    }

    const cost = upgradeCost(curLevel);
    if (currencies.sunGold < cost) return false;

    set((state) => ({
      currencies: {
        ...state.currencies,
        sunGold: state.currencies.sunGold - cost,
      },
      sandwalker: {
        ...state.sandwalker,
        turretLevels: {
          ...state.sandwalker.turretLevels,
          [turret]: curLevel + 1,
        },
      },
      dailyMissions: advanceMissionState(state.dailyMissions, 'UPGRADE_UNIT', 1),
    }));
    return true;
  },

  tierUpTurret: (turret: TurretType) => {
    const { sandwalker, currencies } = get();
    if (
      !Object.prototype.hasOwnProperty.call(sandwalker.turretTiers, turret) ||
      !Object.prototype.hasOwnProperty.call(sandwalker.turretLevels, turret)
    ) {
      return false;
    }
    const curTier = sandwalker.turretTiers[turret];
    const curLevel = sandwalker.turretLevels[turret];

    if (curTier >= 3 || curLevel < curTier * 10) return false;

    const gearCost = tierUpGearCost(curTier);
    if (currencies.ancientGear < gearCost) return false;

    set((state) => ({
      currencies: {
        ...state.currencies,
        ancientGear: state.currencies.ancientGear - gearCost,
      },
      sandwalker: {
        ...state.sandwalker,
        turretTiers: {
          ...state.sandwalker.turretTiers,
          [turret]: curTier + 1,
        },
      },
    }));
    return true;
  },

  upgradeLeg: () => {
    const { sandwalker, currencies } = get();
    if (sandwalker.legPartLevel >= 20) return false;

    const cost = upgradeCost(sandwalker.legPartLevel);
    if (currencies.sunGold < cost) return false;

    set((state) => ({
      currencies: {
        ...state.currencies,
        sunGold: state.currencies.sunGold - cost,
      },
      sandwalker: {
        ...state.sandwalker,
        legPartLevel: state.sandwalker.legPartLevel + 1,
      },
      dailyMissions: advanceMissionState(state.dailyMissions, 'UPGRADE_UNIT', 1),
    }));
    return true;
  },

  addWagon: () => {
    const { sandwalker, currencies } = get();
    if (sandwalker.wagonCount >= 5) return false;

    const gearCost = 5 * sandwalker.wagonCount;
    if (currencies.ancientGear < gearCost) return false;

    set((state) => {
      const nextWagons = state.sandwalker.wagonCount + 1;
      return {
        currencies: {
          ...state.currencies,
          ancientGear: state.currencies.ancientGear - gearCost,
        },
        sandwalker: {
          ...state.sandwalker,
          wagonCount: nextWagons,
          cargoCapacity: nextWagons * 50,
        },
      };
    });
    return true;
  },

  // --------------------------------------------------------------------------
  // Mercenary Actions
  // --------------------------------------------------------------------------
  unlockMercenary: (id: string) =>
    set((state) => ({
      mercenaries: state.mercenaries.map((merc) =>
        merc.id === id ? { ...merc, isUnlocked: true } : merc
      ),
    })),

  upgradeMercenary: (id: string) => {
    const { mercenaries, currencies } = get();
    const merc = mercenaries.find((m) => m.id === id);
    if (!merc || !merc.isUnlocked || merc.level >= 30) return false;

    const cost = upgradeCost(merc.level);
    if (currencies.sunGold < cost) return false;

    set((state) => ({
      currencies: {
        ...state.currencies,
        sunGold: state.currencies.sunGold - cost,
      },
      mercenaries: state.mercenaries.map((m) =>
        m.id === id ? { ...m, level: m.level + 1 } : m
      ),
      dailyMissions: advanceMissionState(state.dailyMissions, 'UPGRADE_UNIT', 1),
    }));
    return true;
  },

  setMercenarySkillCooldown: (id: string, cd: number) =>
    set((state) => ({
      mercenaries: state.mercenaries.map((m) =>
        m.id === id ? { ...m, skillCooldown: Math.max(0, cd) } : m
      ),
    })),

  // --------------------------------------------------------------------------
  // Monetization Actions
  // --------------------------------------------------------------------------
  setAdTier: (tier: AdTierLevel) =>
    set((state) => {
      let tickets = 0;
      if (tier === 1) tickets = 5;
      else if (tier === 2) tickets = 15;
      else if (tier === 3) tickets = 9999; // Unlimited

      return {
        monetization: {
          ...state.monetization,
          adTier: tier,
          dailySkipTicketsLeft: tickets,
        },
      };
    }),

  consumeDailySkipTicket: () => {
    const { monetization } = get();
    if (monetization.adTier === 3) return true; // VIP unlimited
    if (monetization.dailySkipTicketsLeft <= 0) return false;

    set((state) => ({
      monetization: {
        ...state.monetization,
        dailySkipTicketsLeft: state.monetization.dailySkipTicketsLeft - 1,
      },
    }));
    return true;
  },

  resetDailySkipTickets: (force = false) => {
    const today = getTodayDateString();
    const { monetization } = get();
    if (!force && monetization.skipTicketsResetDate === today) return;

    let tickets = 0;
    if (monetization.adTier === 1) tickets = 5;
    else if (monetization.adTier === 2) tickets = 15;
    else if (monetization.adTier === 3) tickets = 9999;

    set((state) => ({
      monetization: {
        ...state.monetization,
        dailySkipTicketsLeft: tickets,
        skipTicketsResetDate: today,
      },
    }));
  },

  setSkin: (skinId: SkinId) =>
    set((state) => {
      if (skinId !== 'DEFAULT' && skinId !== 'GOLDEN_PHARAOH') {
        return state;
      }
      if (state.monetization.equippedSkinId === skinId) return state;
      return {
        monetization: { ...state.monetization, equippedSkinId: skinId },
      };
    }),

  // --------------------------------------------------------------------------
  // Trade Actions
  // --------------------------------------------------------------------------
  buyCargo: (goodsId: string, qty: number, unitPrice: number) => {
    if (!Number.isInteger(qty) || qty <= 0 || !Number.isFinite(unitPrice) || unitPrice < 0) {
      return false;
    }

    const { trade, sandwalker, currencies } = get();
    const currentUnits = trade.cargo.reduce((sum, item) => sum + item.qty, 0);
    if (currentUnits + qty > sandwalker.cargoCapacity) return false;

    const totalCost = qty * unitPrice;
    if (currencies.sunGold < totalCost) return false;

    set((state) => {
      const existing = state.trade.cargo.find((c) => c.goodsId === goodsId);
      let updatedCargo: TradeCargoItem[];

      if (existing) {
        const totalQty = existing.qty + qty;
        const avgPrice = Math.round((existing.qty * existing.buyPrice + qty * unitPrice) / totalQty);
        updatedCargo = state.trade.cargo.map((c) =>
          c.goodsId === goodsId ? { ...c, qty: totalQty, buyPrice: avgPrice } : c
        );
      } else {
        updatedCargo = [...state.trade.cargo, { goodsId, qty, buyPrice: unitPrice }];
      }

      return {
        currencies: {
          ...state.currencies,
          sunGold: state.currencies.sunGold - totalCost,
        },
        trade: {
          ...state.trade,
          cargo: updatedCargo,
        },
        dailyMissions: advanceMissionState(state.dailyMissions, 'BUY_CARGO', qty),
      };
    });
    return true;
  },

  sellCargo: (rateMultiplier: number, harunBonus: boolean, synergyBonus: boolean) => {
    if (!Number.isFinite(rateMultiplier) || rateMultiplier <= 0) return 0;

    const { trade } = get();
    if (trade.cargo.length === 0) return 0;

    let totalPayout = 0;

    for (const item of trade.cargo) {
      totalPayout += tradeSellPayout(
        item.buyPrice,
        item.qty,
        rateMultiplier,
        harunBonus,
        synergyBonus
      );
    }

    set((state) => ({
      currencies: {
        ...state.currencies,
        sunGold: state.currencies.sunGold + totalPayout,
      },
      trade: {
        ...state.trade,
        cargo: [],
      },
    }));

    return totalPayout;
  },

  setCargo: (cargo: TradeCargoItem[]) =>
    set((state) => ({
      trade: { ...state.trade, cargo },
    })),

  halveCargo: () =>
    set((state) => ({
      trade: {
        ...state.trade,
        cargo: state.trade.cargo
          .map((item) => ({ ...item, qty: Math.floor(item.qty * 0.5) }))
          .filter((item) => item.qty > 0),
      },
    })),

  setNextOasisPriceRate: (rate: number) =>
    set((state) => ({
      trade: { ...state.trade, nextOasisPriceRate: rate },
    })),

  // --------------------------------------------------------------------------
  // Relics & Steles Actions
  // --------------------------------------------------------------------------
  addPendingRelic: (id: string, durationMs = 60000) =>
    set((state) => ({
      relics: {
        ...state.relics,
        pending: [...state.relics.pending, { id, appraiseEndsAt: Date.now() + durationMs }],
      },
    })),

  resolveRelic: (id: string) =>
    set((state) => ({
      relics: {
        ...state.relics,
        pending: state.relics.pending.filter((p) => p.id !== id),
        codex: state.relics.codex.includes(id) ? state.relics.codex : [...state.relics.codex, id],
      },
    })),

  decodeStele: (steleId: number) =>
    set((state) => ({
      steles: {
        ...state.steles,
        decoded: state.steles.decoded.includes(steleId)
          ? state.steles.decoded
          : [...state.steles.decoded, steleId],
      },
    })),

  // --------------------------------------------------------------------------
  // Daily Missions Actions
  // --------------------------------------------------------------------------
  resetDailyMissionsIfNeeded: (todayStr = getTodayDateString()) =>
    set((state) => {
      if (state.dailyMissions && state.dailyMissions.resetDate === todayStr) {
        return state;
      }
      return {
        dailyMissions: createInitialDailyMissions(todayStr),
      };
    }),

  recordMissionProgress: (id: DailyMissionId, delta = 1) =>
    set((state) => ({
      dailyMissions: advanceMissionState(state.dailyMissions, id, delta),
    })),

  claimDailyMission: (id: DailyMissionId) => {
    const state = get();
    const missions = ensureTodayMissions(state.dailyMissions);
    const def = getDailyMissionDefinition(id);
    const targetItem = missions.items.find((m) => m.id === id);
    if (!targetItem || targetItem.claimed || targetItem.progress < def.target) {
      return false;
    }

    const nextTickets =
      state.monetization.adTier === 3
        ? Math.max(9999, state.monetization.dailySkipTicketsLeft)
        : state.monetization.dailySkipTicketsLeft + def.reward.skipTickets;

    set((curr) => ({
      currencies: {
        ...curr.currencies,
        ancientGear: curr.currencies.ancientGear + def.reward.ancientGear,
        sunGold: curr.currencies.sunGold + def.reward.sunGold,
      },
      monetization: {
        ...curr.monetization,
        dailySkipTicketsLeft: nextTickets,
      },
      dailyMissions: {
        ...missions,
        items: missions.items.map((item) =>
          item.id === id ? { ...item, claimed: true } : item
        ),
      },
    }));
    return true;
  },

  // --------------------------------------------------------------------------
  // Lifecycle Actions
  // --------------------------------------------------------------------------
  resetToDefaults: () => set(getDefaultState()),

  resetSaveData: () => {
    SaveManager.clearSave();
    set(getDefaultState());
  },

  replaceState: (newState: GameStoreState) => set(() => ({ ...newState })),

  grantIntroSkipRewards: () => {
    set((state) => {
      if (state.meta.isIntroCompleted) {
        return state;
      }
      return {
        ...state,
        meta: {
          ...state.meta,
          isIntroCompleted: true,
          currentOasisIndex: Math.max(1, state.meta.currentOasisIndex),
        },
        currencies: {
          ...state.currencies,
          sunGold: state.currencies.sunGold + 300,
          ancientGear: state.currencies.ancientGear + 5,
          mapFragments: Math.min(10, state.currencies.mapFragments + 1),
        },
        mercenaries: state.mercenaries.map((m) =>
          m.id === 'harun' || m.id === 'sera' ? { ...m, isUnlocked: true } : m
        ),
      };
    });
  },
}));
