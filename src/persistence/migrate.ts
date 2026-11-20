import { GameStoreState } from '../store/types';
import { getDefaultState, CURRENT_SAVE_VERSION } from '../store/defaults';

export interface MigrationResult {
  success: boolean;
  state: GameStoreState;
}

function isPlainObject(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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
    };

    // Forward version tag
    state.meta.saveVersion = CURRENT_SAVE_VERSION;

    return { success: true, state };
  } catch (err) {
    console.error('[Migration] Failed to migrate save envelope:', err);
    return { success: false, state: getDefaultState() };
  }
}
