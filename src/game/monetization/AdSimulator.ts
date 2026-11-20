export type AdSimulationType = 'INTERSTITIAL' | 'REWARDED';

export interface AdSimulatorState {
  isOpen: boolean;
  type: AdSimulationType;
  title: string;
  durationSeconds: number;
  remainingSeconds: number;
  canClose: boolean;
  onComplete?: () => void;
}

export class AdSimulator {
  private state: AdSimulatorState = {
    isOpen: false,
    type: 'INTERSTITIAL',
    title: '',
    durationSeconds: 0,
    remainingSeconds: 0,
    canClose: false,
  };

  private intervalId: ReturnType<typeof setInterval> | null = null;
  private listeners: Set<(state: AdSimulatorState) => void> = new Set();

  public subscribe(listener: (state: AdSimulatorState) => void): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  public showInterstitial(onComplete: () => void): void;
  public showInterstitial(durationSeconds: number, onComplete: () => void): void;
  public showInterstitial(
    durationOrCallback: number | (() => void),
    maybeOnComplete?: () => void
  ): void {
    let durationSeconds: number;
    let onComplete: () => void;

    if (typeof durationOrCallback === 'function') {
      durationSeconds = 5;
      onComplete = durationOrCallback;
    } else {
      durationSeconds = durationOrCallback;
      onComplete = maybeOnComplete ?? (() => {});
    }

    if (!Number.isFinite(durationSeconds) || durationSeconds < 0) {
      durationSeconds = 0;
    }

    this.startModal(
      'INTERSTITIAL',
      `전면 광고 시뮬레이터 (${durationSeconds}초)`,
      durationSeconds,
      onComplete
    );
  }

  public showRewarded(durationSeconds: number, onComplete: () => void): void {
    if (!Number.isFinite(durationSeconds) || durationSeconds < 0) {
      durationSeconds = 0;
    }

    if (durationSeconds === 0) {
      onComplete();
      return;
    }

    this.startModal(
      'REWARDED',
      `보상형 광고 시뮬레이터 (${durationSeconds}초)`,
      durationSeconds,
      onComplete
    );
  }

  private startModal(
    type: AdSimulationType,
    title: string,
    durationSeconds: number,
    onComplete: () => void
  ): void {
    this.stopInterval();

    if (!Number.isFinite(durationSeconds) || durationSeconds < 0) {
      durationSeconds = 0;
    }

    const canCloseImmediately = durationSeconds === 0;

    this.state = {
      isOpen: true,
      type,
      title,
      durationSeconds,
      remainingSeconds: durationSeconds,
      canClose: canCloseImmediately,
      onComplete,
    };
    this.notify();

    if (canCloseImmediately) {
      return;
    }

    this.intervalId = setInterval(() => {
      this.state.remainingSeconds -= 1;
      if (this.state.remainingSeconds <= 0) {
        this.state.remainingSeconds = 0;
        this.state.canClose = true;
        this.stopInterval();
      }
      this.notify();
    }, 1000);
  }

  public closeModal(): void {
    if (!this.state.canClose && this.state.remainingSeconds > 0) {
      return; // Cannot close early
    }

    const callback = this.state.onComplete;
    this.stopInterval();
    this.state = {
      isOpen: false,
      type: 'INTERSTITIAL',
      title: '',
      durationSeconds: 0,
      remainingSeconds: 0,
      canClose: false,
      onComplete: undefined,
    };
    this.notify();

    if (callback) {
      callback();
    }
  }

  private stopInterval(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener({ ...this.state });
    }
  }
}

export const adSimulator = new AdSimulator();
