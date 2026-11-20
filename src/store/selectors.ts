import { useShallow } from 'zustand/react/shallow';
import { useGameStore } from './gameStore';

// Currencies
export const useCurrencies = () => useGameStore((s) => s.currencies);
export const useSunGold = () => useGameStore((s) => s.currencies.sunGold);
export const useAncientGear = () => useGameStore((s) => s.currencies.ancientGear);
export const useMapFragments = () => useGameStore((s) => s.currencies.mapFragments);
export const useTempleKeys = () => useGameStore((s) => s.currencies.templeKeys);

// Route & Meta
export const useRouteProgress = () => useGameStore((s) => s.meta.routeProgress);
export const useCurrentAct = () => useGameStore((s) => s.meta.currentAct);
export const useCurrentOasisIndex = () => useGameStore((s) => s.meta.currentOasisIndex);
export const useOasisArrivalCount = () => useGameStore((s) => s.meta.oasisArrivalCount);
export const useTimeOfDay = () => useGameStore((s) => s.meta.timeOfDay);
export const useTotalPlaySeconds = () => useGameStore((s) => s.meta.totalPlaySeconds);
export const useIsIntroCompleted = () => useGameStore((s) => s.meta.isIntroCompleted);

// Sandwalker & Combat
export const useHpStatus = () =>
  useGameStore(
    useShallow((s) => ({
      currentHp: s.sandwalker.currentHp,
      maxHp: s.sandwalker.maxHp,
      solarShieldHp: s.sandwalker.solarShieldHp,
      hpPercent:
        s.sandwalker.maxHp > 0
          ? Math.round((s.sandwalker.currentHp / s.sandwalker.maxHp) * 100)
          : 0,
    }))
  );

export const useActiveTurret = () => useGameStore((s) => s.sandwalker.activeTurret);
export const useTurretLevels = () => useGameStore((s) => s.sandwalker.turretLevels);
export const useTurretTiers = () => useGameStore((s) => s.sandwalker.turretTiers);
export const useLegLevel = () => useGameStore((s) => s.sandwalker.legPartLevel);
export const useWagonCount = () => useGameStore((s) => s.sandwalker.wagonCount);
export const useManualAimTargetId = () => useGameStore((s) => s.sandwalker.manualAimTargetId);
export const useCargoCapacity = () => useGameStore((s) => s.sandwalker.cargoCapacity);

// Mercenaries & Synergy
export const useMercenaries = () => useGameStore((s) => s.mercenaries);
export const useMercenary = (id: string) =>
  useGameStore((s) => s.mercenaries.find((m) => m.id === id));
export const useIsExpeditionSynergyActive = () =>
  useGameStore((s) => s.mercenaries.length === 5 && s.mercenaries.every((m) => m.isUnlocked));

// Relics & Steles
export const useDecodedSteleCount = () => useGameStore((s) => s.steles.decoded.length);
export const useRelicCodexCount = () => useGameStore((s) => s.relics.codex.length);
export const usePendingRelicCount = () => useGameStore((s) => s.relics.pending.length);

// Monetization
export const useAdTier = () => useGameStore((s) => s.monetization.adTier);
export const useDailySkipTickets = () => useGameStore((s) => s.monetization.dailySkipTicketsLeft);
export const useEquippedSkin = () => useGameStore((s) => s.monetization.equippedSkinId);

// Trade
export const useCargo = () => useGameStore((s) => s.trade.cargo);
export const useNextOasisPriceRate = () => useGameStore((s) => s.trade.nextOasisPriceRate);
export const useCargoCapacityInfo = () =>
  useGameStore(
    useShallow((s) => {
      const currentUnits = s.trade.cargo.reduce((acc, c) => acc + c.qty, 0);
      return {
        currentUnits,
        capacity: s.sandwalker.cargoCapacity,
        isFull: currentUnits >= s.sandwalker.cargoCapacity,
      };
    })
  );
