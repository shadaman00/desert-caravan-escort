import { GameFSM, IGameState } from '../GameFSM';
import { useGameStore } from '@/store/gameStore';
import { MercenaryState } from '@/store/types';
import { shouldShowInterstitialAd } from '@/game/monetization/adPolicy';
import { adSimulator } from '@/game/monetization/AdSimulator';
import { rollNextOasisPriceRate } from '@/game/data/oases';

export interface SettlementPayload {
  isChapterBossClear?: boolean;
}

export class OasisSettlementState implements IGameState {
  public readonly id = 'OASIS_SETTLEMENT' as const;
  public isChapterBossClear = false;
  public totalProfit = 0;
  public zafarClaimed = false;
  private isDismissing = false;

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

    // Sells trade cargo
    this.totalProfit = store.sellCargo(store.trade.nextOasisPriceRate, harun, synergy);

    // Advance to next oasis index
    const nextOasisIndex = store.meta.currentOasisIndex + 1;
    store.setOasisIndex(nextOasisIndex);

    // Decision D9: arriving at Oasis 2+ in Act 1 unlocks Zara
    if (nextOasisIndex >= 2) {
      store.unlockMercenary('zara');
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
      latest.setNextOasisPriceRate(rollNextOasisPriceRate());
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
