export type TurretType = 'HEAT_RAY' | 'HARPOON' | 'MORTAR';
export const TurretType = { HEAT_RAY: 'HEAT_RAY', HARPOON: 'HARPOON', MORTAR: 'MORTAR' } as const;

export type MercenaryRole = 'WARRIOR' | 'ARCHER' | 'MAGE' | 'HEALER' | 'MERCHANT';
export const MercenaryRole = { WARRIOR: 'WARRIOR', ARCHER: 'ARCHER', MAGE: 'MAGE', HEALER: 'HEALER', MERCHANT: 'MERCHANT' } as const;

export type AdTierLevel = 0 | 1 | 2 | 3;
export const AdTierLevel = { 0: 0, 1: 1, 2: 2, 3: 3 } as const;

export type TimeOfDay = 'DAY' | 'DUSK' | 'NIGHT' | 'STORM';
export const TimeOfDay = { DAY: 'DAY', DUSK: 'DUSK', NIGHT: 'NIGHT', STORM: 'STORM' } as const;

export type SkinId = 'DEFAULT' | 'GOLDEN_PHARAOH';
export const SkinId = { DEFAULT: 'DEFAULT', GOLDEN_PHARAOH: 'GOLDEN_PHARAOH' } as const;

export type EnemyArchetypeTag =
  | 'MIRAGE'
  | 'EXPOSED_CORE'
  | 'HEAVY_ARMOR'
  | 'WORM_HEAD_SHELL'
  | 'SMALL_SWARM'
  | 'PARASITE'
  | 'SINGLE_LARGE_BOSS';
export const EnemyArchetypeTag = {
  MIRAGE: 'MIRAGE',
  EXPOSED_CORE: 'EXPOSED_CORE',
  HEAVY_ARMOR: 'HEAVY_ARMOR',
  WORM_HEAD_SHELL: 'WORM_HEAD_SHELL',
  SMALL_SWARM: 'SMALL_SWARM',
  PARASITE: 'PARASITE',
  SINGLE_LARGE_BOSS: 'SINGLE_LARGE_BOSS',
} as const;

export type RewardedAdKind =
  | 'ZAFAR_2X'
  | 'SOLAR_RELAY'
  | 'RELIC_APPRAISAL'
  | 'EMERGENCY_REVIVE';
export const RewardedAdKind = {
  ZAFAR_2X: 'ZAFAR_2X',
  SOLAR_RELAY: 'SOLAR_RELAY',
  RELIC_APPRAISAL: 'RELIC_APPRAISAL',
  EMERGENCY_REVIVE: 'EMERGENCY_REVIVE',
} as const;

export interface TradeCargoItem {
  goodsId: string;
  qty: number;
  buyPrice: number;
}

export interface PendingRelic {
  id: string;
  appraiseEndsAt: number; // Unix epoch ms
}

export interface MercenaryState {
  id: string;
  name: string;
  role: MercenaryRole;
  level: number;
  isUnlocked: boolean;
  skillCooldown: number; // Runtime CD counter, resets to 0 on serialization
}

export interface MetaState {
  isIntroCompleted: boolean;
  totalPlaySeconds: number;       // Interstitial ads blocked if < 900s
  currentAct: number;             // 1 ~ 4
  currentOasisIndex: number;      // 0-indexed current oasis
  oasisArrivalCount: number;      // Cumulative arrivals for ad interval calculation
  routeProgress: number;          // 0.0 ~ 100.0 (%)
  lastSavedTimestamp: number;     // Unix epoch ms for offline calculation
  saveVersion: number;            // Migration tracker (current = 1)
  hazardConsumed: boolean;        // 1 hazard encounter per route
  timeOfDay: TimeOfDay;           // Visual palette
}

export interface CurrenciesState {
  sunGold: number;                // Primary currency for levels and trade
  ancientGear: number;            // Tier-up promotions & wagons
  mapFragments: number;           // 0 ~ 10 milestone items
  templeKeys: number;             // 0 ~ 3 ancient artifacts
}

export interface SandwalkerState {
  maxHp: number;
  currentHp: number;
  solarShieldHp: number;          // Absorbs sandstorm DoT first
  activeTurret: TurretType;
  manualAimTargetId: string | null;
  turretLevels: Record<TurretType, number>;
  legPartLevel: number;           // 1 ~ 20 (>=11 ignores quicksand)
  wagonCount: number;             // 1 ~ 5
  cargoCapacity: number;          // wagonCount * 50
  turretTiers: Record<TurretType, number>; // 1 ~ 3
}

export interface MonetizationState {
  adTier: AdTierLevel;
  dailySkipTicketsLeft: number;   // Tier 1: 5, Tier 2: 15, Tier 3: Infinity (999)
  equippedSkinId: SkinId;
  skipTicketsResetDate: string;   // YYYY-MM-DD
}

export interface TradeState {
  cargo: TradeCargoItem[];
  nextOasisPriceRate: number;     // 1.5 ~ 3.0 price surge rate
}

export interface RelicsState {
  pending: PendingRelic[];
  codex: string[];                // Unlocked relic IDs
}

export interface StelesState {
  decoded: number[];              // Decoded stele IDs
}

/**
 * Root GameStoreState schema combining PRD §2.2 and Plan §5.1 extension fields.
 */
export interface GameStoreState {
  meta: MetaState;
  currencies: CurrenciesState;
  sandwalker: SandwalkerState;
  mercenaries: MercenaryState[];
  monetization: MonetizationState;
  trade: TradeState;
  relics: RelicsState;
  steles: StelesState;
}

/**
 * Store Action Reducers interface
 */
export interface GameStoreActions {
  // Meta Actions
  setIntroCompleted: (completed: boolean) => void;
  addPlayTime: (seconds: number) => void;
  setPlayTime: (seconds: number) => void;
  setAct: (act: number) => void;
  setOasisIndex: (index: number) => void;
  incrementOasisArrival: () => void;
  setRouteProgress: (progress: number) => void;
  setHazardConsumed: (consumed: boolean) => void;
  setTimeOfDay: (timeOfDay: TimeOfDay) => void;

  // Currency Actions
  addCurrencies: (delta: Partial<CurrenciesState> | number, gears?: number) => void;
  spendCurrencies: (currencies: Partial<CurrenciesState>) => boolean;

  // Sandwalker & Machine Actions
  setHp: (hp: number) => void;
  applyDamage: (amount: number) => { shieldAbsorbed: number; hpDamage: number; isDestroyed: boolean };
  repairHp: (amount: number) => void;
  setSolarShield: (amount: number) => void;
  switchTurret: (turret: TurretType) => void;
  setManualAimTarget: (targetId: string | null) => void;
  upgradeTurret: (turret: TurretType) => boolean;
  tierUpTurret: (turret: TurretType) => boolean;
  upgradeLeg: () => boolean;
  addWagon: () => boolean;

  // Mercenary Actions
  unlockMercenary: (id: string) => void;
  upgradeMercenary: (id: string) => boolean;
  setMercenarySkillCooldown: (id: string, cd: number) => void;

  // Monetization Actions
  setAdTier: (tier: AdTierLevel) => void;
  consumeDailySkipTicket: () => boolean;
  resetDailySkipTickets: (force?: boolean) => void;
  setSkin: (skinId: SkinId) => void;

  // Trade Actions
  buyCargo: (goodsId: string, qty: number, unitPrice: number) => boolean;
  sellCargo: (rateMultiplier: number, harunBonus: boolean, synergyBonus: boolean) => number;
  setCargo: (cargo: TradeCargoItem[]) => void;
  halveCargo: () => void;
  setNextOasisPriceRate: (rate: number) => void;

  // Relic & Stele Actions
  addPendingRelic: (id: string, durationMs?: number) => void;
  resolveRelic: (id: string) => void;
  decodeStele: (steleId: number) => void;

  // Bulk / Lifecycle Actions
  resetToDefaults: () => void;
  resetSaveData: () => void;
  replaceState: (newState: GameStoreState) => void;
  grantIntroSkipRewards: () => void;
}
