import {
  BIOME_TABLE,
  MERCENARY_TABLE,
  TURRET_ORDER,
  TURRET_TABLE,
  type MercenaryId,
  type TurretId,
} from '@/data/masterData';
import type { SaveStateV2 } from '@/data/saveStore';
import {
  MAX_WAGON_COUNT,
  computeMercenaryUnlockCost,
  computeTradeProfit,
  computeUpgradeCost,
  computeWagonPurchaseCost,
} from '@/systems/CaravanEconomy';

export interface OasisCampCallbacks {
  onSettleTrade: (useJafarDouble: boolean) => void;
  onUpgradeTurret: (id: TurretId) => void;
  onUpgradeLeg: () => void;
  onUpgradeShield: () => void;
  onBuyWagon: () => void;
  onUpgradeMercenary: (id: MercenaryId) => void;
  onToggleAutoUpgrade: (enabled: boolean) => void;
  onDepart: () => void;
}

export interface OasisCampViewContext {
  save: SaveStateV2;
  oasisDistanceMeters: number;
  biomeIndex: number;
  tradeSettledThisStop: boolean;
  lastSettledProfit: number;
}

/**
 * 500m Oasis Camp Slide-Up Trade & Upgrade Sheet inside 960x540 landscape shell.
 */
export class OasisCampModal {
  private readonly container: HTMLDivElement;
  private readonly sheet: HTMLDivElement;
  private readonly titleEl: HTMLDivElement;
  private readonly goldEl: HTMLSpanElement;
  private readonly gearsEl: HTMLSpanElement;
  private readonly autoToggleBtn: HTMLButtonElement;
  private readonly profitEl: HTMLDivElement;
  private readonly tradeFormulaEl: HTMLDivElement;
  private readonly settleBtn: HTMLButtonElement;
  private readonly jafarBtn: HTMLButtonElement;
  private readonly wagonBtn: HTMLButtonElement;
  private readonly partsGridEl: HTMLDivElement;
  private readonly mercGridEl: HTMLDivElement;
  private readonly departBtn: HTMLButtonElement;

  private openFlag = false;
  private readonly callbacks: OasisCampCallbacks;

  constructor(shellEl: HTMLElement, callbacks: OasisCampCallbacks) {
    this.callbacks = callbacks;

    const root = document.createElement('div');
    root.className = 'oasis-camp-modal hidden';
    root.setAttribute('data-testid', 'oasis-camp-modal');

    const sheet = document.createElement('div');
    sheet.className = 'oasis-camp-sheet';
    this.sheet = sheet;

    // Header
    const header = document.createElement('div');
    header.className = 'camp-header';

    const titleEl = document.createElement('div');
    titleEl.className = 'camp-title';
    titleEl.setAttribute('data-testid', 'camp-title');
    this.titleEl = titleEl;

    const rightControls = document.createElement('div');
    rightControls.className = 'camp-header-right';

    const goldEl = document.createElement('span');
    goldEl.className = 'camp-pill';
    goldEl.setAttribute('data-testid', 'camp-gold');
    this.goldEl = goldEl;

    const gearsEl = document.createElement('span');
    gearsEl.className = 'camp-pill';
    gearsEl.setAttribute('data-testid', 'camp-gears');
    this.gearsEl = gearsEl;

    const autoToggleBtn = document.createElement('button');
    autoToggleBtn.type = 'button';
    autoToggleBtn.className = 'camp-toggle-btn';
    autoToggleBtn.setAttribute('data-testid', 'toggle-auto-upgrade');
    this.autoToggleBtn = autoToggleBtn;

    rightControls.append(goldEl, gearsEl, autoToggleBtn);
    header.append(titleEl, rightControls);

    // 2-Column Body
    const body = document.createElement('div');
    body.className = 'camp-grid';

    // Left: Trade Settlement & Caravan Wagon
    const leftCol = document.createElement('section');
    leftCol.className = 'camp-section camp-trade-section';

    const tradeHeading = document.createElement('div');
    tradeHeading.className = 'camp-section-title';
    tradeHeading.textContent = '🐪 오아시스 교역 정산 & 수송 마차';

    const tradeFormula = document.createElement('div');
    tradeFormula.className = 'camp-trade-formula';
    this.tradeFormulaEl = tradeFormula;

    const profitEl = document.createElement('div');
    profitEl.className = 'camp-trade-profit';
    profitEl.setAttribute('data-testid', 'camp-trade-profit');
    this.profitEl = profitEl;

    const tradeBtns = document.createElement('div');
    tradeBtns.className = 'camp-trade-actions';

    const settleBtn = document.createElement('button');
    settleBtn.type = 'button';
    settleBtn.className = 'camp-action-btn primary';
    settleBtn.setAttribute('data-testid', 'btn-camp-settle');
    settleBtn.addEventListener('click', () => this.callbacks.onSettleTrade(false));
    this.settleBtn = settleBtn;

    const jafarBtn = document.createElement('button');
    jafarBtn.type = 'button';
    jafarBtn.className = 'camp-action-btn gold';
    jafarBtn.setAttribute('data-testid', 'btn-camp-jafar-double');
    jafarBtn.addEventListener('click', () => this.callbacks.onSettleTrade(true));
    this.jafarBtn = jafarBtn;

    tradeBtns.append(settleBtn, jafarBtn);

    const wagonBtn = document.createElement('button');
    wagonBtn.type = 'button';
    wagonBtn.className = 'camp-upgrade-btn wagon-btn';
    wagonBtn.setAttribute('data-testid', 'btn-buy-wagon');
    wagonBtn.addEventListener('click', () => this.callbacks.onBuyWagon());
    this.wagonBtn = wagonBtn;

    leftCol.append(tradeHeading, tradeFormula, profitEl, tradeBtns, wagonBtn);

    // Right: Sandwalker Parts & Mercenaries
    const rightCol = document.createElement('section');
    rightCol.className = 'camp-section camp-upgrade-section';

    const partsHeading = document.createElement('div');
    partsHeading.className = 'camp-section-title';
    partsHeading.textContent = '⚙️ 샌드워커 파츠 & 용병단 강화';

    const partsGrid = document.createElement('div');
    partsGrid.className = 'camp-parts-grid';
    this.partsGridEl = partsGrid;

    const mercHeading = document.createElement('div');
    mercHeading.className = 'camp-section-subtitle';
    mercHeading.textContent = '호위 용병단 (고용 / 레벨업)';

    const mercGrid = document.createElement('div');
    mercGrid.className = 'camp-merc-grid';
    this.mercGridEl = mercGrid;

    rightCol.append(partsHeading, partsGrid, mercHeading, mercGrid);
    body.append(leftCol, rightCol);

    // Footer Primary CTA
    const footer = document.createElement('div');
    footer.className = 'camp-footer';

    const departBtn = document.createElement('button');
    departBtn.type = 'button';
    departBtn.className = 'cta-sortie-btn camp-depart-btn';
    departBtn.setAttribute('data-testid', 'btn-camp-depart');
    departBtn.textContent = '🚩 다음 구간 출격';
    departBtn.addEventListener('click', () => this.callbacks.onDepart());
    this.departBtn = departBtn;

    footer.appendChild(departBtn);
    sheet.append(header, body, footer);
    root.appendChild(sheet);

    this.container = root;
    shellEl.appendChild(root);
  }

  public open(ctx: OasisCampViewContext): void {
    this.openFlag = true;
    this.container.classList.remove('hidden');
    this.sheet.classList.add('open');
    this.render(ctx);
  }

  public close(): void {
    this.openFlag = false;
    this.sheet.classList.remove('open');
    this.container.classList.add('hidden');
  }

  public isOpen(): boolean {
    return this.openFlag;
  }

  public render(ctx: OasisCampViewContext): void {
    if (!this.openFlag) return;
    const { save, oasisDistanceMeters, biomeIndex, tradeSettledThisStop, lastSettledProfit } = ctx;
    const biome = BIOME_TABLE[Math.min(3, Math.max(0, biomeIndex))];

    this.titleEl.textContent = `🌴 ${Math.round(oasisDistanceMeters)}m 오아시스 정박 — ${biome.name}`;
    this.goldEl.textContent = `🪙 ${save.player.gold.toLocaleString()} G`;
    this.gearsEl.textContent = `⚙️ ${save.player.ancientGears}`;

    const autoOn = save.meta.autoUpgradeEnabled;
    this.autoToggleBtn.setAttribute('aria-pressed', autoOn ? 'true' : 'false');
    this.autoToggleBtn.classList.toggle('active', autoOn);
    this.autoToggleBtn.textContent = `자동 강화: ${autoOn ? 'ON' : 'OFF'}`;
    this.autoToggleBtn.onclick = () => this.callbacks.onToggleAutoUpgrade(!autoOn);

    const harun = save.mercenaries.find((m) => m.id === 'harun');
    const merchantLv = harun?.unlocked ? harun.level : 1;
    const baseCalc = computeTradeProfit(
      save.player.cargoValue,
      biomeIndex,
      merchantLv,
      save.meta.pendingTradeMultiplier
    );
    const jafarCalc = computeTradeProfit(
      save.player.cargoValue,
      biomeIndex,
      merchantLv,
      Math.max(2.0, save.meta.pendingTradeMultiplier)
    );

    this.tradeFormulaEl.textContent = `화물 ${baseCalc.baseCargo}G × (1 + 지역 ${Math.round(baseCalc.biomeRate * 100)}% + 상인 ${Math.round(baseCalc.merchantBonus * 100)}%)`;

    if (tradeSettledThisStop) {
      this.profitEl.textContent = `정산 완료: +${lastSettledProfit.toLocaleString()} G`;
      this.settleBtn.disabled = true;
      this.settleBtn.textContent = '✓ 교역 정산 완료';
      this.jafarBtn.disabled = true;
      this.jafarBtn.textContent = '자파르 정산 완료';
    } else {
      this.profitEl.textContent = `예상 정산 수익: ${baseCalc.totalProfit.toLocaleString()} G`;
      this.settleBtn.disabled = false;
      this.settleBtn.textContent = `💰 교역 정산 (+${baseCalc.totalProfit} G)`;
      this.jafarBtn.disabled = false;
      this.jafarBtn.textContent = `🐪 자파르 2배 (+${jafarCalc.totalProfit} G)`;
    }

    const wagonFull = save.player.wagonCount >= MAX_WAGON_COUNT;
    const wagonCost = computeWagonPurchaseCost(save.player.wagonCount);
    this.wagonBtn.disabled = wagonFull || save.player.gold < wagonCost;
    this.wagonBtn.innerHTML = wagonFull
      ? `<strong>낙타 수송 마차 (${save.player.wagonCount}/${MAX_WAGON_COUNT} MAX)</strong><span>적재 한도 최대</span>`
      : `<strong>낙타 마차 추가 (${save.player.wagonCount}/${MAX_WAGON_COUNT})</strong><span>${wagonCost} G (적재 +60)</span>`;

    // Parts Grid (TUR_01/02/03, LEG_01, SHD_01)
    this.partsGridEl.innerHTML = '';
    for (let i = 0; i < TURRET_ORDER.length; i++) {
      const tid = TURRET_ORDER[i];
      const spec = TURRET_TABLE[tid];
      const unlocked = save.sandwalker.unlockedTurrets.includes(tid);
      const lv = save.sandwalker.turretLevels[tid] ?? 1;
      const cost = computeUpgradeCost(lv);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'camp-upgrade-btn';
      btn.setAttribute('data-testid', `btn-upgrade-${tid}`);
      btn.disabled = !unlocked || save.player.gold < cost;
      btn.innerHTML = unlocked
        ? `<strong>${spec.name} Lv.${lv}</strong><span>강화 ${cost} G</span>`
        : `<strong>${spec.name} [잠김]</strong><span>${tid === 'TUR_02' ? '500m 오아시스 해금' : '유물/1000m 해금'}</span>`;
      btn.addEventListener('click', () => this.callbacks.onUpgradeTurret(tid));
      this.partsGridEl.appendChild(btn);
    }

    const legCost = computeUpgradeCost(save.sandwalker.legLevel);
    const legBtn = document.createElement('button');
    legBtn.type = 'button';
    legBtn.className = 'camp-upgrade-btn';
    legBtn.setAttribute('data-testid', 'btn-upgrade-LEG_01');
    legBtn.disabled = save.player.gold < legCost;
    legBtn.innerHTML = `<strong>유압 다리 Lv.${save.sandwalker.legLevel}</strong><span>강화 ${legCost} G</span>`;
    legBtn.addEventListener('click', () => this.callbacks.onUpgradeLeg());
    this.partsGridEl.appendChild(legBtn);

    const shdCost = computeUpgradeCost(save.sandwalker.shieldLevel);
    const shdBtn = document.createElement('button');
    shdBtn.type = 'button';
    shdBtn.className = 'camp-upgrade-btn';
    shdBtn.setAttribute('data-testid', 'btn-upgrade-SHD_01');
    shdBtn.disabled = save.player.gold < shdCost;
    shdBtn.innerHTML = `<strong>태양 보호막 Lv.${save.sandwalker.shieldLevel}</strong><span>강화 ${shdCost} G</span>`;
    shdBtn.addEventListener('click', () => this.callbacks.onUpgradeShield());
    this.partsGridEl.appendChild(shdBtn);

    // Mercenaries Grid (6 members)
    this.mercGridEl.innerHTML = '';
    for (let i = 0; i < MERCENARY_TABLE.length; i++) {
      const spec = MERCENARY_TABLE[i];
      const entry = save.mercenaries.find((m) => m.id === spec.id) ?? {
        id: spec.id,
        unlocked: spec.unlockedByDefault,
        level: 1,
      };
      const cost = entry.unlocked
        ? computeUpgradeCost(entry.level)
        : computeMercenaryUnlockCost(spec.id);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'camp-merc-btn';
      btn.setAttribute('data-testid', `btn-merc-${spec.id}`);
      btn.style.borderColor = spec.colorHex;
      btn.disabled = save.player.gold < cost;
      btn.innerHTML = entry.unlocked
        ? `<strong>${spec.name} Lv.${entry.level}</strong><span>${spec.role} · ${cost}G</span>`
        : `<strong>${spec.name} [고용]</strong><span>${spec.role} · ${cost}G</span>`;
      btn.addEventListener('click', () => this.callbacks.onUpgradeMercenary(spec.id));
      this.mercGridEl.appendChild(btn);
    }

    this.departBtn.textContent =
      oasisDistanceMeters >= 2000
        ? '🏆 태양 신전 돌파 · 새 원정 출격'
        : '🚩 다음 구간 출격';
  }
}
