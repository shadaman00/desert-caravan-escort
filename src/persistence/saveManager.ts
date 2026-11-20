import { GameStoreState } from '../store/types';
import { useGameStore } from '../store/gameStore';
import { getDefaultState, CURRENT_SAVE_VERSION } from '../store/defaults';
import { migrate } from './migrate';

export const SAVE_STORAGE_KEY = 'sandwalkerSaveDataV1';
export const SAVE_BACKUP_KEY = 'sandwalkerSaveDataV1_bak';
export const INTRO_SEEN_KEY = 'sandwalkerIntroSeen';
export const AUTO_SAVE_INTERVAL_MS = 5000;

export interface SaveEnvelope {
  v: number;
  savedAt: number;
  state: GameStoreState;
}

export type SaveLoadResult = GameStoreState & {
  success: boolean;
  state: GameStoreState;
  fromBackup: boolean;
};

function getStorage(): Storage | null {
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage;
  }
  if (typeof localStorage !== 'undefined') {
    return localStorage;
  }
  return null;
}

export class SaveManager {
  private static autoSaveTimer: ReturnType<typeof setInterval> | null = null;
  private static isInitialized = false;

  /**
   * Initializes event listeners and starts the 5s auto-save timer.
   */
  public static init(): void {
    if (!this.isInitialized) {
      this.isInitialized = true;

      // Visibility change listener: save immediately when hidden
      if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'hidden') {
            SaveManager.save();
          }
        });
      }

      // Page hide listener: save before unload
      if (typeof window !== 'undefined') {
        window.addEventListener('pagehide', () => {
          SaveManager.save();
        });
      }
    }

    if (SaveManager.autoSaveTimer === null) {
      SaveManager.startAutoSave();
    }
  }

  public static startAutoSave(): void {
    SaveManager.stopAutoSave();
    SaveManager.autoSaveTimer = setInterval(() => {
      SaveManager.save();
    }, AUTO_SAVE_INTERVAL_MS);
  }

  public static stopAutoSave(): void {
    if (SaveManager.autoSaveTimer !== null) {
      clearInterval(SaveManager.autoSaveTimer);
      SaveManager.autoSaveTimer = null;
    }
  }

  /**
   * Serializes store state and writes to LocalStorage.
   * Mid-route save policy (Decision D7): resets routeProgress to 0 in save data
   * so players resume at the departure oasis with cargo/currencies intact.
   */
  public static save(targetState?: GameStoreState): boolean {
    const storage = getStorage();
    if (!storage) return false;

    try {
      const currentState = targetState ?? useGameStore.getState();

      // Clone state and apply Decision D7: reset routeProgress to 0
      const serializedState: GameStoreState = {
        ...currentState,
        meta: {
          ...currentState.meta,
          routeProgress: 0.0,
          hazardConsumed: false,
          lastSavedTimestamp: Date.now(),
        },
        sandwalker: {
          ...currentState.sandwalker,
          manualAimTargetId: null,
          turretLevels: currentState.meta.isIntroCompleted
            ? currentState.sandwalker.turretLevels
            : { HEAT_RAY: 1, HARPOON: 1, MORTAR: 1 },
          turretTiers: currentState.meta.isIntroCompleted
            ? currentState.sandwalker.turretTiers
            : { HEAT_RAY: 1, HARPOON: 1, MORTAR: 1 },
        },
        mercenaries: currentState.mercenaries.map((m) => ({
          ...m,
          skillCooldown: 0,
        })),
      };

      const envelope: SaveEnvelope = {
        v: CURRENT_SAVE_VERSION,
        savedAt: Date.now(),
        state: serializedState,
      };

      const jsonStr = JSON.stringify(envelope);

      // Save to primary storage
      storage.setItem(SAVE_STORAGE_KEY, jsonStr);

      // Mirror to backup key
      storage.setItem(SAVE_BACKUP_KEY, jsonStr);

      return true;
    } catch (err) {
      console.error('[SaveManager] Failed to save state:', err);
      return false;
    }
  }

  /**
   * Loads saved game from LocalStorage, falling back to backup or default state.
   */
  public static load(): SaveLoadResult | null {
    const storage = getStorage();
    if (!storage) {
      const def = getDefaultState();
      return Object.assign({}, def, { success: false, state: def, fromBackup: false });
    }

    const tryParseAndMigrate = (raw: string | null): GameStoreState | null => {
      if (!raw) return null;
      const parsed: SaveEnvelope = JSON.parse(raw);
      const migrationResult = migrate(parsed);
      return migrationResult.success ? migrationResult.state : null;
    };

    let migratedState: GameStoreState | null = null;
    let fromBackup = false;

    // 1. Try primary storage key (both JSON parse and envelope/schema validation)
    try {
      migratedState = tryParseAndMigrate(storage.getItem(SAVE_STORAGE_KEY));
      if (!migratedState && storage.getItem(SAVE_STORAGE_KEY)) {
        console.warn('[SaveManager] Invalid primary save envelope. Attempting backup...');
      }
    } catch (err) {
      console.warn('[SaveManager] Corrupted primary save data. Attempting backup...', err);
    }

    // 2. Try backup storage key if primary failed parsing or envelope validation
    if (!migratedState) {
      try {
        const backupState = tryParseAndMigrate(storage.getItem(SAVE_BACKUP_KEY));
        if (backupState) {
          migratedState = backupState;
          fromBackup = true;
          console.info('[SaveManager] Successfully recovered save data from backup key.');
        }
      } catch (backupErr) {
        console.error('[SaveManager] Corrupted backup save data as well.', backupErr);
      }
    }

    // 3. Apply recovered state or initialize defaults
    if (migratedState) {
      try {
        useGameStore.getState().replaceState(migratedState);
      } catch {
        // Store might not be created or initialized in some unit test contexts
      }
      return Object.assign({}, migratedState, {
        success: true,
        state: migratedState,
        fromBackup,
      });
    }

    const defaultState = getDefaultState();
    return Object.assign({}, defaultState, {
      success: false,
      state: defaultState,
      fromBackup: false,
    });
  }

  /**
   * Clears save keys (does not wipe sandwalkerIntroSeen).
   */
  public static clearSave(): void {
    const storage = getStorage();
    if (!storage) return;
    storage.removeItem(SAVE_STORAGE_KEY);
    storage.removeItem(SAVE_BACKUP_KEY);
  }

  // --------------------------------------------------------------------------
  // Intro Seen Management (Decision D10)
  // --------------------------------------------------------------------------
  public static isIntroSeen(): boolean {
    const storage = getStorage();
    if (!storage) return false;
    return storage.getItem(INTRO_SEEN_KEY) === 'true';
  }

  public static setIntroSeen(): void {
    const storage = getStorage();
    if (!storage) return;
    storage.setItem(INTRO_SEEN_KEY, 'true');
  }

  public static clearIntroSeen(): void {
    const storage = getStorage();
    if (!storage) return;
    storage.removeItem(INTRO_SEEN_KEY);
  }

  // Instance methods delegating to static methods
  public save(targetState?: GameStoreState): boolean {
    return SaveManager.save(targetState);
  }

  public load(): SaveLoadResult | null {
    return SaveManager.load();
  }

  public clearSave(): void {
    SaveManager.clearSave();
  }
}
