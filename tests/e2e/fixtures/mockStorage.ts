// ============================================================================
// File: tests/e2e/fixtures/mockStorage.ts
// Pre-Configured LocalStorage Seeds & Injection Helpers for Playwright
// Compatible with GameStoreState schema, SaveManager, and Decision Log D1~D13
// ============================================================================

import { Page } from '@playwright/test';

export const SAVE_STORAGE_KEY = 'sandwalkerSaveDataV1';
export const SAVE_BACKUP_KEY = 'sandwalkerSaveDataV1_bak';
export const INTRO_SEEN_KEY = 'sandwalkerIntroSeen';
export const CURRENT_SAVE_VERSION = 1;

export type TurretType = 'HEAT_RAY' | 'HARPOON' | 'MORTAR';
export type MercenaryRole = 'WARRIOR' | 'ARCHER' | 'MAGE' | 'HEALER' | 'MERCHANT';
export type AdTierLevel = 0 | 1 | 2 | 3;
export type TimeOfDay = 'DAY' | 'DUSK' | 'NIGHT' | 'STORM';

export interface GameStoreState {
  meta: {
    isIntroCompleted: boolean;
    totalPlaySeconds: number;
    currentAct: number;
    currentOasisIndex: number;
    oasisArrivalCount: number;
    routeProgress: number;
    lastSavedTimestamp: number;
    saveVersion: number;
    hazardConsumed: boolean;
    timeOfDay: TimeOfDay;
  };
  currencies: {
    sunGold: number;
    ancientGear: number;
    mapFragments: number;
    templeKeys: number;
  };
  sandwalker: {
    maxHp: number;
    currentHp: number;
    solarShieldHp: number;
    activeTurret: TurretType;
    manualAimTargetId: string | null;
    turretLevels: Record<TurretType, number>;
    legPartLevel: number;
    wagonCount: number;
    cargoCapacity: number;
    turretTiers: Record<TurretType, number>;
  };
  mercenaries: Array<{
    id: string;
    name: string;
    role: MercenaryRole;
    level: number;
    isUnlocked: boolean;
    skillCooldown: number;
  }>;
  monetization: {
    adTier: AdTierLevel;
    dailySkipTicketsLeft: number;
    equippedSkinId: 'DEFAULT' | 'GOLDEN_PHARAOH' | 'ROYAL_SILK';
    skipTicketsResetDate: string;
  };
  trade: {
    cargo: Array<{ goodsId: string; qty: number; buyPrice: number }>;
    nextOasisPriceRate: number;
  };
  relics: {
    pending: Array<{ id: string; appraiseEndsAt: number }>;
    codex: string[];
  };
  steles: {
    decoded: number[];
  };
  endgame?: {
    templeGateUnlocked: boolean;
    endingCompleted: boolean;
    pendingEndingModal: boolean;
    endlessUnlocked: boolean;
    endlessActive: boolean;
    currentDepth: number;
    maxDepthCleared: number;
    goldenTradeActive: boolean;
  };
}

export interface SaveEnvelope {
  v: number;
  savedAt: number;
  state: GameStoreState;
}

/**
 * Standard fresh user initial state defaults.
 */
export function createDefaultGameState(): GameStoreState {
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
      legPartLevel: 1,
      wagonCount: 1,
      cargoCapacity: 50,
      turretTiers: {
        HEAT_RAY: 1,
        HARPOON: 1,
        MORTAR: 1,
      },
    },
    mercenaries: [
      { id: 'harun', name: '하룬', role: 'MERCHANT', level: 1, isUnlocked: false, skillCooldown: 0 },
      { id: 'sera', name: '세라', role: 'ARCHER', level: 1, isUnlocked: false, skillCooldown: 0 },
      { id: 'zara', name: '자라', role: 'MAGE', level: 1, isUnlocked: false, skillCooldown: 0 },
      { id: 'tarik', name: '타리크', role: 'WARRIOR', level: 1, isUnlocked: false, skillCooldown: 0 },
      { id: 'lili', name: '릴리', role: 'HEALER', level: 1, isUnlocked: false, skillCooldown: 0 },
    ],
    monetization: {
      adTier: 0,
      dailySkipTicketsLeft: 0,
      equippedSkinId: 'DEFAULT',
      skipTicketsResetDate: new Date().toISOString().split('T')[0],
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
  };
}

/**
 * Wraps a GameStoreState in a persistent SaveEnvelope.
 */
export function wrapInSaveEnvelope(state: GameStoreState): SaveEnvelope {
  return {
    v: CURRENT_SAVE_VERSION,
    savedAt: state.meta.lastSavedTimestamp || Date.now(),
    state,
  };
}

// ----------------------------------------------------------------------------
// Pre-Configured Seed Presets
// ----------------------------------------------------------------------------

/**
 * Act 1 Hub Seed (Post-intro completion, ready for departure).
 */
export function createAct1HubSeed(opts?: {
  sunGold?: number;
  ancientGear?: number;
  mapFragments?: number;
  templeKeys?: number;
  currentOasisIndex?: number;
  oasisArrivalCount?: number;
  totalPlaySeconds?: number;
  unlockedMercIds?: string[];
  adTier?: AdTierLevel;
  legPartLevel?: number;
  wagonCount?: number;
}): GameStoreState {
  const state = createDefaultGameState();
  state.meta.isIntroCompleted = true;
  state.meta.totalPlaySeconds = opts?.totalPlaySeconds ?? 180;
  state.meta.currentAct = 1;
  state.meta.currentOasisIndex = opts?.currentOasisIndex ?? 1;
  state.meta.oasisArrivalCount = opts?.oasisArrivalCount ?? 1;
  state.currencies.sunGold = opts?.sunGold ?? 300;
  state.currencies.ancientGear = opts?.ancientGear ?? 5;
  state.currencies.mapFragments = opts?.mapFragments ?? 1;
  if (opts?.templeKeys !== undefined) {
    state.currencies.templeKeys = opts.templeKeys;
  }
  const unlockedSet = new Set(opts?.unlockedMercIds ?? ['harun', 'sera']);
  state.mercenaries = state.mercenaries.map((m) => ({
    ...m,
    isUnlocked: unlockedSet.has(m.id),
  }));
  if (opts?.adTier !== undefined) {
    state.monetization.adTier = opts.adTier;
    state.monetization.dailySkipTicketsLeft =
      opts.adTier === 1 ? 5 : opts.adTier === 2 ? 15 : opts.adTier === 3 ? 9999 : 0;
  }
  if (opts?.legPartLevel !== undefined) {
    state.sandwalker.legPartLevel = opts.legPartLevel;
  }
  if (opts?.wagonCount !== undefined) {
    state.sandwalker.wagonCount = opts.wagonCount;
    state.sandwalker.cargoCapacity = opts.wagonCount * 50;
  }
  return state;
}

/**
 * Act 2 Quicksand Seed (Hazard Zone, testing Leg Lv1 vs Lv11 speed penalty).
 */
export function createAct2QuicksandSeed(
  legLevel = 1,
  opts?: {
    sunGold?: number;
    turretLevel?: number;
    turretTier?: number;
    adTier?: AdTierLevel;
    totalPlaySeconds?: number;
    unlockedMercIds?: string[];
  }
): GameStoreState {
  const state = createAct1HubSeed({
    sunGold: opts?.sunGold,
    adTier: opts?.adTier,
    unlockedMercIds: opts?.unlockedMercIds,
  });
  state.meta.currentAct = 2;
  state.meta.totalPlaySeconds = opts?.totalPlaySeconds ?? 1000; // >= 900s
  state.meta.routeProgress = 45.0; // In Hazard Zone (40~70%)
  state.sandwalker.legPartLevel = legLevel;
  if (opts?.turretLevel !== undefined) {
    state.sandwalker.turretLevels = {
      HEAT_RAY: opts.turretLevel,
      HARPOON: opts.turretLevel,
      MORTAR: opts.turretLevel,
    };
  }
  if (opts?.turretTier !== undefined) {
    state.sandwalker.turretTiers = {
      HEAT_RAY: opts.turretTier,
      HARPOON: opts.turretTier,
      MORTAR: opts.turretTier,
    };
  }
  return state;
}

/**
 * Act 3 Sandstorm Seed (Testing DoT & Solar Shield absorption).
 */
export function createAct3SandstormSeed(
  shieldHp = 0,
  opts?: {
    adTier?: AdTierLevel;
    turretLevel?: number;
    turretTier?: number;
    unlockAllMercs?: boolean;
    legPartLevel?: number;
    sunGold?: number;
  }
): GameStoreState {
  const state = createAct1HubSeed({
    adTier: opts?.adTier,
    legPartLevel: opts?.legPartLevel,
    sunGold: opts?.sunGold,
  });
  state.meta.currentAct = 3;
  state.meta.totalPlaySeconds = 1200;
  state.meta.routeProgress = 50.0;
  state.meta.timeOfDay = 'STORM';
  state.sandwalker.solarShieldHp = shieldHp;
  if (opts?.turretLevel !== undefined) {
    state.sandwalker.turretLevels = {
      HEAT_RAY: opts.turretLevel,
      HARPOON: opts.turretLevel,
      MORTAR: opts.turretLevel,
    };
  }
  if (opts?.turretTier !== undefined) {
    state.sandwalker.turretTiers = {
      HEAT_RAY: opts.turretTier,
      HARPOON: opts.turretTier,
      MORTAR: opts.turretTier,
    };
  }
  if (opts?.unlockAllMercs) {
    state.mercenaries = state.mercenaries.map((m) => ({ ...m, isUnlocked: true }));
  }
  return state;
}

/**
 * Act 4 Great Sandworm Boss Seed (Route progress 95%).
 */
export function createAct4BossSeed(): GameStoreState {
  const state = createAct1HubSeed();
  state.meta.currentAct = 4;
  state.meta.totalPlaySeconds = 1800;
  state.meta.routeProgress = 95.0; // Boss encounter threshold
  return state;
}

/**
 * Monetization Ad Seed: configurable tier, playtime, act, and arrival count.
 */
export function createAdTierSeed(
  tier: AdTierLevel,
  totalPlaySeconds: number,
  act: number,
  arrivalCount: number
): GameStoreState {
  const state = createAct1HubSeed();
  state.monetization.adTier = tier;
  state.monetization.dailySkipTicketsLeft = tier === 1 ? 5 : tier === 2 ? 15 : tier === 3 ? 9999 : 0;
  state.meta.totalPlaySeconds = totalPlaySeconds;
  state.meta.currentAct = act;
  state.meta.oasisArrivalCount = arrivalCount;
  return state;
}

/**
 * All 5 Mercenaries Unlocked Seed (Activates Expedition Synergy buff).
 */
export function createAllMercenariesSeed(): GameStoreState {
  const state = createAct1HubSeed();
  state.mercenaries = state.mercenaries.map((m) => ({ ...m, isUnlocked: true, level: 10 }));
  return state;
}

/**
 * Visual Tier Seed: configures turret levels (Lv 1, 11, 21) and wagon count (1~5).
 */
export function createVisualTierSeed(
  turretLevel: number,
  turretTier: number,
  wagonCount: number
): GameStoreState {
  const state = createAct1HubSeed();
  state.sandwalker.turretLevels = {
    HEAT_RAY: turretLevel,
    HARPOON: turretLevel,
    MORTAR: turretLevel,
  };
  state.sandwalker.turretTiers = {
    HEAT_RAY: turretTier,
    HARPOON: turretTier,
    MORTAR: turretTier,
  };
  const clampedWagons = Math.max(1, Math.min(5, Math.floor(wagonCount)));
  state.sandwalker.wagonCount = clampedWagons;
  state.sandwalker.cargoCapacity = clampedWagons * 50;
  return state;
}

/**
 * Cargo Seed: configures trade cargo quantity, unit buy price, and Act.
 */
export function createCargoSeed(
  qty: number,
  buyPrice = 100,
  act: 1 | 2 | 3 | 4 = 1
): GameStoreState {
  const state = createAct1HubSeed();
  state.meta.currentAct = act;
  if (qty > state.sandwalker.cargoCapacity) {
    const neededWagons = Math.min(5, Math.max(1, Math.ceil(qty / 50)));
    state.sandwalker.wagonCount = neededWagons;
    state.sandwalker.cargoCapacity = neededWagons * 50;
  }
  const clampedQty = Math.max(0, Math.min(qty, state.sandwalker.cargoCapacity));
  state.trade.cargo = clampedQty > 0 ? [{ goodsId: 'SPICE', qty: clampedQty, buyPrice }] : [];
  return state;
}

/**
 * Mercenary Count Seed: unlocks only specified mercenary IDs at the given level.
 */
export function createMercenaryCountSeed(
  unlockedIds: string[],
  level = 1
): GameStoreState {
  const state = createAct1HubSeed();
  state.mercenaries = state.mercenaries.map((m) => ({
    ...m,
    level,
    isUnlocked: unlockedIds.includes(m.id),
  }));
  return state;
}

/**
 * Act 4 Route Seed: configures Act 4 oasis index (odd/even hazard alternation) and leg level.
 */
export function createAct4RouteSeed(
  oasisIndex: number,
  legLevel = 1
): GameStoreState {
  const state = createAct1HubSeed();
  state.meta.currentAct = 4;
  state.meta.currentOasisIndex = oasisIndex;
  state.meta.totalPlaySeconds = 1800;
  state.sandwalker.legPartLevel = legLevel;
  return state;
}

/**
 * Boss Seed for Acts 1~4 (Varka, Scorpion Rex, Mirage Spirit King, Great Sandworm).
 */
export function createBossSeedForAct(
  act: 1 | 2 | 3 | 4,
  opts?: {
    turretLevel?: number;
    turretTier?: number;
    legPartLevel?: number;
    unlockedMercIds?: string[];
    sunGold?: number;
    oasisIndex?: number;
    adTier?: AdTierLevel;
  }
): GameStoreState {
  const state = createAct1HubSeed({
    sunGold: opts?.sunGold,
    currentOasisIndex: opts?.oasisIndex,
    unlockedMercIds: opts?.unlockedMercIds,
    adTier: opts?.adTier,
    legPartLevel: opts?.legPartLevel,
  });
  state.meta.currentAct = act;
  state.meta.totalPlaySeconds = act === 4 ? 1800 : act === 3 ? 1200 : act === 2 ? 1000 : 300;
  state.meta.routeProgress = 95.0;
  if (opts?.turretLevel !== undefined) {
    state.sandwalker.turretLevels = {
      HEAT_RAY: opts.turretLevel,
      HARPOON: opts.turretLevel,
      MORTAR: opts.turretLevel,
    };
  }
  if (opts?.turretTier !== undefined) {
    state.sandwalker.turretTiers = {
      HEAT_RAY: opts.turretTier,
      HARPOON: opts.turretTier,
      MORTAR: opts.turretTier,
    };
  }
  return state;
}

/**
 * Relic & Stele Codex Seed: configures pending appraisal relics, decoded codex, decoded steles, and currencies.
 */
export function createRelicCodexSeed(opts?: {
  pending?: Array<{ id: string; appraiseEndsAt: number }>;
  codex?: string[];
  decodedSteles?: number[];
  adTier?: AdTierLevel;
  sunGold?: number;
  ancientGear?: number;
  totalPlaySeconds?: number;
}): GameStoreState {
  const state = createAct1HubSeed({
    sunGold: opts?.sunGold,
    ancientGear: opts?.ancientGear,
    adTier: opts?.adTier,
    totalPlaySeconds: opts?.totalPlaySeconds ?? 1000,
  });
  state.relics = {
    pending:
      opts?.pending !== undefined
        ? opts.pending.map((item) => ({ ...item }))
        : [{ id: 'relic_solar_disc', appraiseEndsAt: Date.now() + 60_000 }],
    codex: opts?.codex !== undefined ? [...opts.codex] : [],
  };
  state.steles = {
    decoded: opts?.decodedSteles !== undefined ? [...opts.decodedSteles] : [],
  };
  return state;
}

/**
 * Turret Level Seed: activates the target turret at a specific level and tier.
 */
export function createTurretLevelSeed(
  turret: TurretType,
  level: number,
  tier: number
): GameStoreState {
  const state = createAct1HubSeed();
  state.sandwalker.activeTurret = turret;
  state.sandwalker.turretLevels[turret] = level;
  state.sandwalker.turretTiers[turret] = tier;
  return state;
}

/**
 * Economy & Trading Seed: configures currencies, oasis index, wagons, cargo, surge rate, and merchant/synergy unlocks.
 */
export function createEconomyTradeSeed(opts?: {
  sunGold?: number;
  ancientGear?: number;
  oasisIndex?: number;
  wagonCount?: number;
  cargo?: Array<{ goodsId: string; qty: number; buyPrice: number }>;
  nextOasisPriceRate?: number;
  harunUnlocked?: boolean;
  allMercsUnlocked?: boolean;
}): GameStoreState {
  const state = createAct1HubSeed();
  if (opts?.sunGold !== undefined) {
    state.currencies.sunGold = opts.sunGold;
  }
  if (opts?.ancientGear !== undefined) {
    state.currencies.ancientGear = opts.ancientGear;
  }
  if (opts?.oasisIndex !== undefined) {
    state.meta.currentOasisIndex = opts.oasisIndex;
  }
  if (opts?.wagonCount !== undefined) {
    state.sandwalker.wagonCount = opts.wagonCount;
    state.sandwalker.cargoCapacity = opts.wagonCount * 50;
  }
  if (opts?.cargo !== undefined) {
    state.trade.cargo = opts.cargo.map((item) => ({ ...item }));
  }
  if (opts?.nextOasisPriceRate !== undefined) {
    state.trade.nextOasisPriceRate = opts.nextOasisPriceRate;
  }
  if (opts?.allMercsUnlocked !== undefined) {
    state.mercenaries = state.mercenaries.map((m) => ({
      ...m,
      isUnlocked: opts.allMercsUnlocked ? true : m.isUnlocked,
    }));
  }
  if (opts?.harunUnlocked !== undefined) {
    state.mercenaries = state.mercenaries.map((m) =>
      m.id === 'harun' ? { ...m, isUnlocked: opts.harunUnlocked! } : m
    );
  }
  return state;
}

/**
 * Upgrade Progression Seed: configures currencies, turret levels/tiers, leg level, wagon count, and skin.
 */
export function createUpgradeProgressionSeed(opts?: {
  sunGold?: number;
  ancientGear?: number;
  turretLevels?: Record<TurretType, number>;
  turretTiers?: Record<TurretType, number>;
  legPartLevel?: number;
  wagonCount?: number;
  skinId?: 'DEFAULT' | 'GOLDEN_PHARAOH';
}): GameStoreState {
  const state = createAct1HubSeed();
  if (opts?.sunGold !== undefined) {
    state.currencies.sunGold = opts.sunGold;
  }
  if (opts?.ancientGear !== undefined) {
    state.currencies.ancientGear = opts.ancientGear;
  }
  if (opts?.turretLevels !== undefined) {
    state.sandwalker.turretLevels = { ...opts.turretLevels };
  }
  if (opts?.turretTiers !== undefined) {
    state.sandwalker.turretTiers = { ...opts.turretTiers };
  }
  if (opts?.legPartLevel !== undefined) {
    state.sandwalker.legPartLevel = opts.legPartLevel;
  }
  if (opts?.wagonCount !== undefined) {
    state.sandwalker.wagonCount = opts.wagonCount;
    state.sandwalker.cargoCapacity = opts.wagonCount * 50;
  }
  if (opts?.skinId !== undefined) {
    state.monetization.equippedSkinId = opts.skinId;
  }
  return state;
}

/**
 * Opening Hook Seed: returns default fresh state with isIntroCompleted: false.
 */
export function createOpeningHookSeed(): GameStoreState {
  const state = createDefaultGameState();
  state.meta.isIntroCompleted = false;
  return state;
}

// ----------------------------------------------------------------------------
// LocalStorage Injection Functions (page.addInitScript)
// ----------------------------------------------------------------------------

let initSeedCounter = 0;

/**
 * Injects a fully qualified GameStoreState into browser LocalStorage before initial page load.
 * Guarded via sessionStorage so subsequent page.reload() calls preserve in-game mutations
 * unless options.persistAcrossReloads is explicitly set to true.
 */
export async function injectGameState(
  page: Page,
  state: GameStoreState,
  options?: {
    introSeen?: boolean;
    mirrorBackup?: boolean;
    persistAcrossReloads?: boolean;
  }
): Promise<void> {
  const envelope = wrapInSaveEnvelope(state);
  const jsonStr = JSON.stringify(envelope);
  const introSeenVal = options?.introSeen ?? state.meta.isIntroCompleted;
  const mirrorBackup = options?.mirrorBackup ?? true;
  const persistAcrossReloads = options?.persistAcrossReloads ?? false;
  const guardKey = `__sandwalker_seed_${++initSeedCounter}`;

  await page.addInitScript(
    ({ storageKey, backupKey, introKey, data, introSeen, backup, persist, tokenKey }) => {
      if (!persist) {
        if (window.sessionStorage.getItem(tokenKey)) {
          return;
        }
        window.sessionStorage.setItem(tokenKey, '1');
      }
      window.localStorage.setItem(storageKey, data);
      if (backup) {
        window.localStorage.setItem(backupKey, data);
      }
      if (introSeen !== undefined) {
        window.localStorage.setItem(introKey, introSeen ? 'true' : 'false');
      }
    },
    {
      storageKey: SAVE_STORAGE_KEY,
      backupKey: SAVE_BACKUP_KEY,
      introKey: INTRO_SEEN_KEY,
      data: jsonStr,
      introSeen: introSeenVal,
      backup: mirrorBackup,
      persist: persistAcrossReloads,
      tokenKey: guardKey,
    }
  );
}

/**
 * Injects raw key-value string pairs into LocalStorage (used for corruption/recovery testing).
 * Guarded via sessionStorage so page.reload() does not clobber post-recovery mutations
 * unless persistAcrossReloads is explicitly true.
 */
export async function injectRawStorage(
  page: Page,
  items: Record<string, string>,
  options?: { persistAcrossReloads?: boolean; clearBefore?: boolean }
): Promise<void> {
  const persistAcrossReloads = options?.persistAcrossReloads ?? false;
  const clearBefore = options?.clearBefore ?? false;
  const guardKey = `__sandwalker_raw_${++initSeedCounter}`;

  await page.addInitScript(
    ({ entries, persist, clearFirst, tokenKey }) => {
      if (!persist) {
        if (window.sessionStorage.getItem(tokenKey)) {
          return;
        }
        window.sessionStorage.setItem(tokenKey, '1');
      }
      if (clearFirst) {
        window.localStorage.clear();
      }
      for (const [key, val] of Object.entries(entries)) {
        window.localStorage.setItem(key, val);
      }
    },
    { entries: items, persist: persistAcrossReloads, clearFirst: clearBefore, tokenKey: guardKey }
  );
}

/**
 * Sets only the sandwalkerIntroSeen key without initializing save data.
 * Guarded via sessionStorage across reloads unless persistAcrossReloads is true.
 */
export async function injectIntroSeenOnly(
  page: Page,
  seen = true,
  options?: { persistAcrossReloads?: boolean }
): Promise<void> {
  const persistAcrossReloads = options?.persistAcrossReloads ?? false;
  const guardKey = `__sandwalker_intro_${++initSeedCounter}`;

  await page.addInitScript(
    ({ introKey, seenVal, persist, tokenKey }) => {
      if (!persist) {
        if (window.sessionStorage.getItem(tokenKey)) {
          return;
        }
        window.sessionStorage.setItem(tokenKey, '1');
      }
      window.localStorage.setItem(introKey, seenVal ? 'true' : 'false');
    },
    {
      introKey: INTRO_SEEN_KEY,
      seenVal: seen,
      persist: persistAcrossReloads,
      tokenKey: guardKey,
    }
  );
}

/**
 * Reads the current saved GameStoreState from LocalStorage inside the browser.
 * Guards against primitive JSON values (null, false, 0, strings) and arrays.
 */
export async function readCurrentStoredState(page: Page): Promise<GameStoreState | null> {
  return await page.evaluate((key) => {
    const isPlainObject = (v: unknown): v is Record<string, unknown> =>
      typeof v === 'object' && v !== null && !Array.isArray(v);

    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!isPlainObject(parsed)) {
        return null;
      }
      if ('state' in parsed) {
        if (
          parsed.v !== undefined &&
          (typeof parsed.v !== 'number' || !Number.isFinite(parsed.v))
        ) {
          return null;
        }
        if (!isPlainObject(parsed.state)) {
          return null;
        }
        const st = parsed.state;
        if (
          (st.meta !== undefined && !isPlainObject(st.meta)) ||
          (st.currencies !== undefined && !isPlainObject(st.currencies)) ||
          (st.sandwalker !== undefined && !isPlainObject(st.sandwalker))
        ) {
          return null;
        }
        return st as unknown as GameStoreState;
      }
      if (
        isPlainObject(parsed.meta) &&
        isPlainObject(parsed.currencies) &&
        isPlainObject(parsed.sandwalker)
      ) {
        return parsed as unknown as GameStoreState;
      }
      return null;
    } catch {
      return null;
    }
  }, SAVE_STORAGE_KEY);
}

/**
 * Clears all LocalStorage entries.
 */
export async function clearLocalStorage(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.localStorage.clear();
  });
}
