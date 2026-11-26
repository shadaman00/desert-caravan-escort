import type { AssetLoader } from '@/core/AssetLoader';
import type { AssetKey } from '@/data/masterData';

interface StoryCutSpec {
  readonly assetKey: AssetKey;
  readonly cutLabel: string;
  readonly subtitle: string;
  readonly gradientCss: string;
  readonly motifClass: string;
}

const STORY_CUTS: readonly StoryCutSpec[] = [
  {
    assetKey: 'STORY_CUT1',
    cutLabel: '제1막 · 사라진 태양의 신전',
    subtitle: '천년 폭풍 너머 태양의 신전… 지도를 모으면 길이 열린다!',
    gradientCss: 'linear-gradient(180deg, #b45309 0%, #f59e0b 52%, #78350f 100%)',
    motifClass: 'cut-legend',
  },
  {
    assetKey: 'STORY_CUT2',
    cutLabel: '제2막 · 아포피스 샌드웜의 기습',
    subtitle: '모래 밑에서 괴충이 솟구쳤다! 보행기를 다시 세워야 해!',
    gradientCss: 'linear-gradient(180deg, #7f1d1d 0%, #dc2626 52%, #451a03 100%)',
    motifClass: 'cut-ambush',
  },
  {
    assetKey: 'STORY_CUT3',
    cutLabel: '제3막 · 샌드워커 원정대 출격',
    subtitle: '상단 출발! 오아시스를 잇고 태양의 신전으로 진군한다!',
    gradientCss: 'linear-gradient(180deg, #0f766e 0%, #f59e0b 58%, #92400e 100%)',
    motifClass: 'cut-departure',
  },
];

const CUT_DURATION_SEC = 5.0;
const TOTAL_DURATION_SEC = CUT_DURATION_SEC * STORY_CUTS.length;

/**
 * 15-second 3-Cut Visual Opening Storyboard (16:9 landscape, 5s per cut) per PRD Section 6.1.
 */
export class OpeningStoryboard {
  private readonly container: HTMLDivElement;
  private readonly visualStage: HTMLDivElement;
  private readonly cutBadgeEl: HTMLSpanElement;
  private readonly cutIndicatorEl: HTMLSpanElement;
  private readonly subtitleEl: HTMLDivElement;
  private readonly progressFillEl: HTMLDivElement;
  private readonly assetLoader: AssetLoader;
  private readonly onComplete: () => void;

  private active = false;
  private elapsedSec = 0;
  private currentCutIdx = 0;

  constructor(shellEl: HTMLElement, assetLoader: AssetLoader, onComplete: () => void) {
    this.assetLoader = assetLoader;
    this.onComplete = onComplete;

    const root = document.createElement('div');
    root.className = 'opening-storyboard hidden';
    root.setAttribute('data-testid', 'opening-storyboard');

    const visualStage = document.createElement('div');
    visualStage.className = 'storyboard-stage';
    this.visualStage = visualStage;

    const topBar = document.createElement('div');
    topBar.className = 'storyboard-topbar';

    const cutBadge = document.createElement('span');
    cutBadge.className = 'storyboard-cut-badge';
    this.cutBadgeEl = cutBadge;

    const rightWrap = document.createElement('div');
    rightWrap.className = 'storyboard-top-right';

    const cutIndicator = document.createElement('span');
    cutIndicator.className = 'storyboard-cut-indicator';
    cutIndicator.setAttribute('data-testid', 'storyboard-cut-indicator');
    cutIndicator.textContent = '1 / 3';
    this.cutIndicatorEl = cutIndicator;

    const skipBtn = document.createElement('button');
    skipBtn.type = 'button';
    skipBtn.className = 'storyboard-skip-btn';
    skipBtn.setAttribute('data-testid', 'btn-skip-storyboard');
    skipBtn.textContent = '건너뛰기 ⏭';
    skipBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.finish();
    });

    rightWrap.append(cutIndicator, skipBtn);
    topBar.append(cutBadge, rightWrap);

    const footer = document.createElement('div');
    footer.className = 'storyboard-footer';

    const subtitleEl = document.createElement('div');
    subtitleEl.className = 'storyboard-subtitle';
    subtitleEl.setAttribute('data-testid', 'storyboard-subtitle');
    this.subtitleEl = subtitleEl;

    const progressTrack = document.createElement('div');
    progressTrack.className = 'storyboard-progress-track';
    const progressFill = document.createElement('div');
    progressFill.className = 'storyboard-progress-fill';
    this.progressFillEl = progressFill;
    progressTrack.appendChild(progressFill);

    const tapHint = document.createElement('div');
    tapHint.className = 'storyboard-tap-hint';
    tapHint.textContent = '화면을 탭하면 다음 장면으로 넘어갑니다 (5초마다 자동 전환)';

    footer.append(subtitleEl, progressTrack, tapHint);

    root.append(visualStage, topBar, footer);
    root.addEventListener('click', () => this.advanceCut());

    this.container = root;
    shellEl.appendChild(root);
    this.renderCut(0);
  }

  public open(): void {
    this.active = true;
    this.elapsedSec = 0;
    this.currentCutIdx = 0;
    this.container.classList.remove('hidden');
    this.renderCut(0);
    this.progressFillEl.style.width = '0%';
  }

  public close(): void {
    this.active = false;
    this.container.classList.add('hidden');
  }

  public isOpen(): boolean {
    return this.active;
  }

  public refreshVisual(): void {
    if (!this.active) return;
    this.renderCut(this.currentCutIdx);
  }

  public tick(dt: number): void {
    if (!this.active) return;
    this.elapsedSec += Math.max(0, dt);

    const nextIdx = Math.min(
      STORY_CUTS.length,
      Math.floor(this.elapsedSec / CUT_DURATION_SEC)
    );
    if (nextIdx >= STORY_CUTS.length) {
      this.finish();
      return;
    }

    if (nextIdx !== this.currentCutIdx) {
      this.renderCut(nextIdx);
    }

    const pct = Math.min(100, (this.elapsedSec / TOTAL_DURATION_SEC) * 100);
    this.progressFillEl.style.width = `${pct.toFixed(1)}%`;
  }

  public advanceCut(): void {
    if (!this.active) return;
    const nextIdx = this.currentCutIdx + 1;
    if (nextIdx >= STORY_CUTS.length) {
      this.finish();
      return;
    }
    this.elapsedSec = nextIdx * CUT_DURATION_SEC;
    this.renderCut(nextIdx);
    const pct = Math.min(100, (this.elapsedSec / TOTAL_DURATION_SEC) * 100);
    this.progressFillEl.style.width = `${pct.toFixed(1)}%`;
  }

  private finish(): void {
    if (!this.active) return;
    this.close();
    this.onComplete();
  }

  private renderCut(idx: number): void {
    this.currentCutIdx = idx;
    const spec = STORY_CUTS[idx];
    this.cutBadgeEl.textContent = spec.cutLabel;
    this.cutIndicatorEl.textContent = `${idx + 1} / ${STORY_CUTS.length}`;
    this.subtitleEl.textContent = spec.subtitle;

    const img = this.assetLoader.getImage(spec.assetKey);
    this.visualStage.className = `storyboard-stage ${spec.motifClass}`;
    if (img) {
      this.visualStage.style.backgroundImage = `url("${img.src}")`;
      this.visualStage.innerHTML = '';
    } else {
      this.visualStage.style.backgroundImage = spec.gradientCss;
      this.visualStage.innerHTML =
        idx === 0
          ? '<div class="story-art-sun"></div><div class="story-art-pyramid"></div><div class="story-art-dunes"></div>'
          : idx === 1
            ? '<div class="story-art-sandworm"></div><div class="story-art-dunes"></div>'
            : '<div class="story-art-sun"></div><div class="story-art-walker"></div><div class="story-art-dunes"></div>';
    }
  }
}
