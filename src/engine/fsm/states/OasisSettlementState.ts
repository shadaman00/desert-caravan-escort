import { GameFSM, IGameState } from '../GameFSM';
import type { EventBus } from '@/engine/EventBus';
import { useGameStore } from '@/store/gameStore';
import { MercenaryState } from '@/store/types';
import { shouldShowInterstitialAd } from '@/game/monetization/adPolicy';
import { adSimulator } from '@/game/monetization/AdSimulator';
import { rollNextOasisPriceRate } from '@/game/data/oases';
import { rollGoldenTradePriceRate } from '@/engine/systems/EndlessExpeditionSystem';
import { computeRelicCodexBonuses } from '@/game/data/relics';
import { computeMercEquipmentMultipliers } from '@/game/data/equipment';

export interface SettlementPayload {
  isChapterBossClear?: boolean;
}

export interface SettlementBreakdown {
  cargoUnits: number;
  purchaseCost: number;
  priceRate: number;
  baseRevenue: number;
  harunUnlocked: boolean;
  synergyActive: boolean;
  harunMultiplier: number;
  synergyMultiplier: number;
  totalProfit: number;
}

const EMPTY_BREAKDOWN: SettlementBreakdown = {
  cargoUnits: 0,
  purchaseCost: 0,
  priceRate: 1.0,
  baseRevenue: 0,
  harunUnlocked: false,
  synergyActive: false,
  harunMultiplier: 1.0,
  synergyMultiplier: 1.0,
  totalProfit: 0,
};

export class OasisSettlementState implements IGameState {
  public readonly id = 'OASIS_SETTLEMENT' as const;
  private readonly eventBus?: EventBus;
  public isChapterBossClear = false;
  public totalProfit = 0;
  public breakdown: SettlementBreakdown = { ...EMPTY_BREAKDOWN };
  public zafarClaimed = false;
  private isDismissing = false;

  constructor(options: { eventBus?: EventBus } = {}) {
    this.eventBus = options.eventBus;
  }

  public enter(_fsm: GameFSM, payload?: unknown): void {
    this.isDismissing = false;
    this.zafarClaimed = false;
    const store = useGameStore.getState();
    const data = (payload as SettlementPayload) ?? {};
    this.isChapterBossClear = Boolean(data.isChapterBossClear);

    // Increment oasis arrival count
    store.incrementOasisArrival();

    // Check bonuses: Harun unlocked (+25%) and 5-mercenary synergy (+20%)
    const harun =
      store.mercenaries.find((m: MercenaryState) => m.id === 'harun')?.isUnlocked ??
      false;
    const synergy =
      store.mercenaries.length === 5 &&
      store.mercenaries.every((m: MercenaryState) => m.isUnlocked);

    const cargoUnits = store.trade.cargo.reduce((sum, c) => sum + c.qty, 0);
    const purchaseCost = store.trade.cargo.reduce(
      (sum, c) => sum + c.qty * c.buyPrice,
      0
    );
    const priceRate = store.trade.nextOasisPriceRate;
    const codexBonuses = computeRelicCodexBonuses(store.relics.codex, store.explorerPassives);
    const harunEqBonus = harun
      ? computeMercEquipmentMultipliers('harun', store.mercEquipment?.harun).tradeBonusPct
      : 0;
    const totalTradeBonus = codexBonuses.tradeGoldPct + harunEqBonus;
    const effectiveRate =
      totalTradeBonus > 0
        ? Math.round(priceRate * (1 + totalTradeBonus) * 1000) / 1000
        : priceRate;
    const harunMultiplier = harun ? 1.25 : 1.0;
    const synergyMultiplier = synergy ? 1.2 : 1.0;

    // Sells trade cargo
    this.totalProfit = store.sellCargo(effectiveRate, harun, synergy);
    this.breakdown = {
      cargoUnits,
      purchaseCost: Math.round(purchaseCost),
      priceRate,
      baseRevenue: Math.round(purchaseCost * priceRate),
      harunUnlocked: harun,
      synergyActive: synergy,
      harunMultiplier,
      synergyMultiplier,
      totalProfit: this.totalProfit,
    };

    // Advance to next oasis index
    const nextOasisIndex = store.meta.currentOasisIndex + 1;
    store.setOasisIndex(nextOasisIndex);

    // Decision D9: arriving at Oasis 2+ in Act 1 unlocks Zara
    if (nextOasisIndex >= 2) {
      store.unlockMercenary('zara');
    }

    if (this.totalProfit > 0) {
      this.eventBus?.emit('trade:settled', {
        profit: this.totalProfit,
        oasisIndex: nextOasisIndex,
      });
    }
  }

  public update(_fsm: GameFSM, _dt: number): void {
    // Waiting for settlement modal dismiss
  }

  /**
   * Grants extra +totalProfit Sun Gold once per settlement via Zafar 2x rewarded ad.
   */
  public claimZafar2x(): number {
    if (this.zafarClaimed || this.totalProfit <= 0) {
      return 0;
    }
    this.zafarClaimed = true;
    useGameStore.getState().addCurrencies({ sunGold: this.totalProfit });
    return this.totalProfit;
  }

  public dismissSettlement(fsm: GameFSM): void {
    if (this.isDismissing) return;
    this.isDismissing = true;

    const store = useGameStore.getState();
    const showAd = shouldShowInterstitialAd(store, this.isChapterBossClear);

    const finalizeDismiss = () => {
      const latest = useGameStore.getState();
      const useGoldenTrade =
        Boolean(latest.endgame?.goldenTradeActive) || Boolean(latest.endgame?.endingCompleted);
      latest.setNextOasisPriceRate(
        useGoldenTrade ? rollGoldenTradePriceRate() : rollNextOasisPriceRate()
      );
      if (
        latest.meta.currentOasisIndex >= latest.meta.currentAct * 3 &&
        latest.meta.currentAct < 4
      ) {
        latest.setAct(latest.meta.currentAct + 1);
      }
      fsm.transitionTo('OASIS_HUB');
    };

    if (showAd) {
      adSimulator.showInterstitial(finalizeDismiss);
    } else {
      finalizeDismiss();
    }
  }

  public exit(_fsm: GameFSM): void {
    this.isDismissing = false;
  }
}
