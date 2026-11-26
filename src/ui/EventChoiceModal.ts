import type { DesertEventSpec } from '@/data/eventData';

/**
 * 300m Milestone 2-Choice Event Modal mounted cleanly inside Layer 2 (EVENT_PAUSE).
 */
export class EventChoiceModal {
  private readonly container: HTMLDivElement;
  private readonly speakerEl: HTMLSpanElement;
  private readonly titleEl: HTMLHeadingElement;
  private readonly descEl: HTMLParagraphElement;
  private readonly choiceBtns: [HTMLButtonElement, HTMLButtonElement];

  private activeEvent: DesertEventSpec | null = null;
  private readonly onSelect: (event: DesertEventSpec, choiceIndex: 0 | 1) => void;

  constructor(
    layer2El: HTMLElement,
    onSelect: (event: DesertEventSpec, choiceIndex: 0 | 1) => void
  ) {
    this.onSelect = onSelect;

    const overlay = document.createElement('div');
    overlay.className = 'scene-overlay event-choice-modal hidden';
    overlay.setAttribute('data-testid', 'event-choice-modal');

    const card = document.createElement('div');
    card.className = 'event-card';

    const header = document.createElement('div');
    header.className = 'event-card-header';

    const speaker = document.createElement('span');
    speaker.className = 'event-speaker-badge';
    speaker.setAttribute('data-testid', 'event-speaker');
    this.speakerEl = speaker;

    const milestoneTag = document.createElement('span');
    milestoneTag.className = 'event-milestone-tag';
    milestoneTag.textContent = '300m 사막 조우 이벤트';
    header.append(speaker, milestoneTag);

    const title = document.createElement('h2');
    title.className = 'event-title';
    title.setAttribute('data-testid', 'event-title');
    this.titleEl = title;

    const desc = document.createElement('p');
    desc.className = 'event-desc';
    desc.setAttribute('data-testid', 'event-desc');
    this.descEl = desc;

    const choicesWrap = document.createElement('div');
    choicesWrap.className = 'event-choices-row';

    const btn0 = this.createChoiceButton(0);
    const btn1 = this.createChoiceButton(1);
    this.choiceBtns = [btn0, btn1];

    choicesWrap.append(btn0, btn1);
    card.append(header, title, desc, choicesWrap);
    overlay.appendChild(card);

    this.container = overlay;
    layer2El.appendChild(overlay);
  }

  private createChoiceButton(index: 0 | 1): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'event-choice-btn';
    btn.setAttribute('data-testid', `event-choice-${index}`);
    btn.addEventListener('click', () => {
      if (this.activeEvent) {
        this.onSelect(this.activeEvent, index);
      }
    });
    return btn;
  }

  public open(event: DesertEventSpec, currentGold: number): void {
    this.activeEvent = event;
    this.speakerEl.textContent = event.speakerName;
    this.speakerEl.style.borderColor = event.speakerColorHex;
    this.speakerEl.style.color = event.speakerColorHex;
    this.titleEl.textContent = event.title;
    this.descEl.textContent = event.description;

    for (let i = 0; i < 2; i++) {
      const choice = event.choices[i];
      const btn = this.choiceBtns[i];
      const goldCost = choice.cost.gold ?? 0;
      const affordable = currentGold >= goldCost;
      btn.disabled = !affordable;
      btn.classList.toggle('is-rewarded', Boolean(choice.isRewardedAd));
      btn.innerHTML = `
        <strong class="choice-label">${choice.label}</strong>
        <div class="choice-meta">
          <span class="choice-cost">소모: ${choice.costSummary}</span>
          <span class="choice-reward">보상: ${choice.rewardSummary}</span>
        </div>
      `;
    }

    this.container.classList.remove('hidden');
  }

  public close(): void {
    this.activeEvent = null;
    this.container.classList.add('hidden');
  }

  public isOpen(): boolean {
    return this.activeEvent !== null;
  }

  public getActiveEventId(): string | null {
    return this.activeEvent?.id ?? null;
  }
}
