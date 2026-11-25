// ============================================================================
// File: tests/e2e/fixtures/testHelpers.ts
// E2E UI Interaction, Canvas Readiness & State Verification Helpers
// Provides robust, retryable actions adhering to the 430x932 mobile viewport
// ============================================================================

import { Page, expect } from '@playwright/test';
import { TurretType, AdTierLevel, GameStoreState } from './mockStorage';

const DEBUG_BAR_CONTAINERS = [
  '[data-testid="debug-bar"]',
  '.debug-bar',
  'div:has(> div > span:has-text("Developer Debug Bar"))',
] as const;

function splitTopLevelCommas(selectorList: string): string[] {
  const parts: string[] = [];
  let current = '';
  let parenDepth = 0;
  let bracketDepth = 0;
  let quote: '"' | "'" | null = null;
  let escaped = false;

  for (const ch of selectorList) {
    if (escaped) {
      current += ch;
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      current += ch;
      escaped = true;
      continue;
    }
    if (quote) {
      if (ch === quote) quote = null;
      current += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === '(') parenDepth++;
    else if (ch === ')' && parenDepth > 0) parenDepth--;
    else if (ch === '[') bracketDepth++;
    else if (ch === ']' && bracketDepth > 0) bracketDepth--;
    else if (ch === ',' && parenDepth === 0 && bracketDepth === 0) {
      const trimmed = current.trim();
      if (trimmed) parts.push(trimmed);
      current = '';
      continue;
    }
    current += ch;
  }

  const tail = current.trim();
  if (tail) parts.push(tail);
  return parts;
}

function scopeToDebugBar(...selectors: string[]): string {
  const flattened = selectors.flatMap(splitTopLevelCommas);
  return DEBUG_BAR_CONTAINERS.flatMap((container) =>
    flattened.map((sel) => `${container} ${sel}`)
  ).join(', ');
}

/**
 * Dynamic selector builders for Mercenary cards and upgrade buttons.
 */
export function mercCardSelector(id: string): string {
  return `[data-testid="merc-card-${id}"], .merc-card-${id}`;
}

export function mercUpgradeBtnSelector(id: string): string {
  return `[data-testid="btn-upgrade-merc-${id}"], .btn-upgrade-merc-${id}`;
}

export const mercCard = mercCardSelector;
export const btnUpgradeMerc = mercUpgradeBtnSelector;

/**
 * Comprehensive DOM Selectors Dictionary with data-testid standards and fallbacks.
 */
export const SELECTORS = {
  // App Shell & 3-Zone Viewport
  appRoot: '#root, #app, [data-testid="app-root"], .viewport-shell',
  viewportShell: '[data-testid="viewport-shell"], .viewport-shell',
  zoneA: '[data-testid="zone-a"], .zone-a, header',
  zoneB: '[data-testid="zone-b"], .zone-b, main',
  zoneC: '[data-testid="zone-c"], .zone-c, footer',
  zoneCTactical: '[data-testid="zone-c-tactical"], .zone-c-tactical',

  // Battlefield Canvas
  gameCanvas: '[data-testid="game-canvas"], canvas#battlefield-canvas, canvas.zone-b-canvas, canvas',

  // Zone A: HUD Elements (aligned with src/app/App.tsx)
  hudOasisName: '[data-testid="hud-oasis-name"], .hud-oasis-name, .zone-a-route span:first-child',
  hudActBadge: '[data-testid="hud-act-badge"], .hud-act-badge, .zone-a-route span:last-child',
  hudRouteProgress:
    '[data-testid="hud-route-progress"], .hud-route-progress, [role="progressbar"], .zone-a-progress-label span:last-child',
  hudSunGold: '[data-testid="hud-currency-gold"], .hud-currency-gold, .zone-a-currencies span:nth-child(1)',
  hudAncientGear:
    '[data-testid="hud-currency-gears"], .hud-currency-gears, .zone-a-currencies span:nth-child(2)',
  hudMapFragments:
    '[data-testid="hud-currency-fragments"], .hud-currency-fragments, .zone-a-currencies span:nth-child(3)',
  hudTempleKeys:
    '[data-testid="hud-currency-keys"], .hud-currency-keys, .zone-a-currencies span:nth-child(4)',
  hudSurgeBadge: '[data-testid="hud-surge-badge"], .hud-surge-badge, .badge-surge',
  hudAdTierBadge: '[data-testid="hud-ad-tier-badge"], .hud-ad-tier-badge, .badge-tier',
  hudFsmBadge: '[data-testid="hud-fsm-badge"], .hud-fsm-badge, .badge-fsm',
  hudSandwalkerHp: '[data-testid="hud-sandwalker-hp"], .hud-sandwalker-hp',
  hudSolarShield: '[data-testid="hud-solar-shield"], .hud-solar-shield',
  hudActualSpeed: '[data-testid="hud-actual-speed"], .hud-actual-speed',
  hudSynergyBadge: '[data-testid="hud-synergy-badge"], .hud-synergy-badge',
  hudFullscreenBtn: '[data-testid="hud-fullscreen-btn"], .hud-fullscreen-btn',

  // Zone B: Battlefield Overlays & Boss HUD
  dialogueBubble: '[data-testid="dialogue-bubble"], .dialogue-bubble',
  skipIntroBtn: '[data-testid="skip-intro-btn"], button:has-text("건너뛰기"), button:has-text("Skip")',
  overloadSkillBtn: '[data-testid="overload-skill-btn"], button:has-text("과부하"), button:has-text("Overload")',
  introPhaseBadge: '[data-testid="intro-phase-badge"], .intro-phase-badge',
  tutorialTurretPrompt: '[data-testid="tutorial-turret-prompt"], .tutorial-turret-prompt',
  relayBanner: '[data-testid="relay-tower-banner"], .relay-tower-banner',
  relayTowerBanner: '[data-testid="relay-tower-banner"], .relay-tower-banner',
  relayActivateBtn:
    '[data-testid="relay-activate-btn"], [data-testid="relay-tower-banner"] button, .relay-tower-banner button',
  darkVisionMask: '[data-testid="dark-vision-mask"], .dark-vision-mask',
  aimReticle: '[data-testid="aim-reticle"], .aim-reticle',
  bossHud: '[data-testid="boss-hud"], .boss-hud',
  bossName: '[data-testid="boss-name"], .boss-name',
  bossHpBar: '[data-testid="boss-hp-bar"], .boss-hp-bar',
  bossArmorBar: '[data-testid="boss-armor-bar"], .boss-armor-bar',
  bossPhaseBadge: '[data-testid="boss-phase-badge"], .boss-phase-badge',
  bossGroggyBadge: '[data-testid="boss-groggy-badge"], .boss-groggy-badge',
  bossTelegraphWarning: '[data-testid="boss-telegraph-warning"], .boss-telegraph-warning',

  // Zone C: Tactical Bar
  turretBtnHeatRay: '[data-testid="turret-btn-heat-ray"], button:has-text("열선"), button:has-text("Heat Ray")',
  turretBtnHarpoon: '[data-testid="turret-btn-harpoon"], button:has-text("작살"), button:has-text("Harpoon")',
  turretBtnMortar: '[data-testid="turret-btn-mortar"], button:has-text("박격포"), button:has-text("Mortar")',
  turretCooldownBadge:
    '[data-testid="turret-cooldown-badge"], .turret-cooldown, .turret-btn .turret-btn-cooldown-bar',
  dodgeBoostBtn: '[data-testid="dodge-boost-btn"], button:has-text("회피"), button:has-text("Dodge")',
  solarShieldBtn: '[data-testid="solar-shield-btn"], button:has-text("보호막"), button:has-text("Shield")',
  zafarCallBtn:
    '[data-testid="zafar-call-btn"], .zone-c button:has-text("자파르"), .zone-c button:has-text("Zafar")',
  sortieBtn: '[data-testid="sortie-btn"], [data-testid="btn-sortie"], button:has-text("출격"), button:has-text("Sortie")',
  btnSortie: '[data-testid="btn-sortie"], [data-testid="sortie-btn"], button:has-text("출격"), button:has-text("Sortie")',
  zoneCContent: '[data-testid="zone-c-content"], .zone-c-content',

  // Zone C: Dashboard Tabs
  tabBtnMech: '[data-testid="tab-btn-mech"], button:has-text("기체 개조"), button:has-text("Mech")',
  tabBtnMercenaries: '[data-testid="tab-btn-mercenaries"], button:has-text("5인 용병단"), button:has-text("Mercenaries")',
  tabBtnTrading: '[data-testid="tab-btn-trading"], button:has-text("상단 교역소"), button:has-text("Trade")',
  tabBtnCodex: '[data-testid="tab-btn-codex"], button:has-text("유물·도감"), button:has-text("유물·비석 도감"), button:has-text("Codex")',

  // Growth Upgrade Actions & Visual Tiers
  turretLevelText: '[data-testid="turret-level-text"], .turret-level-text',
  turretTierText: '[data-testid="turret-tier-text"], .turret-tier-text',
  turretUpgradeCost: '[data-testid="turret-upgrade-cost"], .turret-upgrade-cost',
  btnUpgradeTurret: '[data-testid="btn-upgrade-turret"], button:has-text("포탑 강화")',
  btnTierUpTurret: '[data-testid="btn-tier-up-turret"], button:has-text("포탑 승급")',
  legLevelText: '[data-testid="leg-level-text"], .leg-level-text',
  legUpgradeCost: '[data-testid="leg-upgrade-cost"], .leg-upgrade-cost',
  btnUpgradeLegs: '[data-testid="btn-upgrade-legs"], [data-testid="btn-upgrade-leg"], button:has-text("다리 강화")',
  wagonCountText: '[data-testid="wagon-count-text"], .wagon-count-text',
  wagonUpgradeCost: '[data-testid="wagon-upgrade-cost"], .wagon-upgrade-cost',
  btnAddWagon: '[data-testid="btn-add-wagon"], button:has-text("마차 증설")',
  btnEquipPharaohSkin: '[data-testid="btn-equip-skin-pharaoh"], button:has-text("황금 파라오")',
  btnEquipRoyalSilkSkin: '[data-testid="btn-equip-skin-royal-silk"], button:has-text("왕실 비단")',
  hudSettingsBtn: '[data-testid="hud-settings-btn"]',
  settingsModal: '[data-testid="settings-modal"]',
  sliderMasterVolume: '[data-testid="slider-master-volume"]',
  sliderBgmVolume: '[data-testid="slider-bgm-volume"]',
  sliderSfxVolume: '[data-testid="slider-sfx-volume"]',
  toggleSettingsMute: '[data-testid="toggle-settings-mute"]',
  toggleSettingsHaptics: '[data-testid="toggle-settings-haptics"]',
  selectToastDensity: '[data-testid="select-toast-density"]',
  settingsAutoInvestSelect: '[data-testid="settings-auto-invest-select"]',
  btnCloseSettings: '[data-testid="btn-close-settings"]',
  autoInvestPolicySelect: '[data-testid="auto-invest-policy-select"]',
  autoUpgradeToast: '[data-testid="auto-upgrade-toast"]',
  autoUpgradeFeed: '[data-testid="auto-upgrade-feed"]',
  turretAutoProgress: '[data-testid="turret-auto-progress"]',
  legAutoProgress: '[data-testid="leg-auto-progress"]',
  wagonAutoProgress: '[data-testid="wagon-auto-progress"]',
  explorerPassivesSummary: '[data-testid="explorer-passives-summary"]',

  // Mercenaries Tab
  mercSynergyBanner:
    '[data-testid="mercenary-synergy-status"], [data-testid="merc-synergy-banner"], .merc-synergy-banner',
  mercenarySynergyStatus:
    '[data-testid="mercenary-synergy-status"], [data-testid="merc-synergy-banner"], .merc-synergy-banner',
  mercSynergyBadge: '[data-testid="mercenary-synergy-badge"], [data-testid="merc-synergy-badge"], .merc-synergy-badge',
  mercCardSelector,
  mercUpgradeBtnSelector,
  mercCard,
  btnUpgradeMerc,
  mercEquipBadge: (mercId: string) => `[data-testid="merc-equip-${mercId}"]`,
  btnExpeditionBurst: '[data-testid="btn-expedition-burst"]',

  // Codex & Appraisal Tab
  codexRelicList: '[data-testid="codex-relic-list"], .codex-relic-list',
  codexSteleList: '[data-testid="codex-stele-list"], .codex-stele-list',
  codexPassiveBanner: '[data-testid="codex-passive-banner"]',
  questBoard: '[data-testid="quest-board"]',
  surgeJackpotPill: '[data-testid="surge-jackpot-pill"]',
  btnStartUrgentDelivery: '[data-testid="btn-start-urgent-delivery"]',
  btnAppraiseRelic: '[data-testid="btn-appraise-relic"], button:has-text("감정 시작"), button:text-is("감정")',
  btnAppraiseRelicAd: '[data-testid="btn-appraise-relic-ad"], button:has-text("즉시 감정")',

  // Economy & Trading Post
  tradeSpecialtyName: '[data-testid="trade-specialty-name"], .trade-specialty-name',
  tradeBuyPrice: '[data-testid="trade-buy-price"], .trade-buy-price',
  tradeCargoQtyInput: '[data-testid="trade-qty-input"], .trade-qty-input',
  btnBuyCargo: '[data-testid="btn-buy-cargo"], button:has-text("매입")',
  btnBuyCargoMax: '[data-testid="btn-buy-cargo-max"], button:has-text("최대 적재")',
  tradeCapacityText: '[data-testid="trade-capacity-text"], .trade-capacity-text',
  wanderingMerchantPanel: '[data-testid="wandering-merchant-panel"]',
  btnMerchantReroll: '[data-testid="btn-merchant-reroll"]',
  merchantOffer: (idx: number) => `[data-testid="merchant-offer-${idx}"]`,
  btnBuyMerchant: (idx: number) => `[data-testid="btn-buy-merchant-${idx}"]`,
  templeGatePanel: '[data-testid="temple-gate-panel"]',
  templeGateGuide: '[data-testid="temple-gate-guide"]',
  btnUnlockTempleGate: '[data-testid="btn-unlock-temple-gate"]',
  endingSequenceModal: '[data-testid="ending-sequence-modal"]',
  btnEnterEndless: '[data-testid="btn-enter-endless"]',
  btnCloseEnding: '[data-testid="btn-close-ending"]',
  endlessModePanel: '[data-testid="endless-mode-panel"]',
  btnToggleEndless: '[data-testid="btn-toggle-endless"]',
  goldenTradeBadge: '[data-testid="golden-trade-badge"]',

  // Modals & Flows
  settlementModal: '[data-testid="settlement-modal"], .modal-settlement',
  settlementProceedBtn:
    '[data-testid="settlement-proceed-btn"], [data-testid="settlement-modal"] button:has-text("다음 루트"), [data-testid="settlement-modal"] button:has-text("출격"), .modal-settlement button:has-text("다음 루트"), .modal-settlement button:has-text("출격")',
  settlementProfit: '[data-testid="settlement-profit"], .settlement-profit',
  zafarDoubleBtn: '[data-testid="zafar-double-btn"], button:has-text("자파르 2배")',

  adSimModal: '[data-testid="ad-sim-modal"], .modal-ad-sim, .modal-overlay.ad-modal-overlay',
  adSimCountdown:
    '[data-testid="ad-sim-countdown"], .ad-countdown, .ad-modal-overlay .modal-body div:has-text("초 남음")',
  adSimCloseBtn:
    '[data-testid="ad-sim-close-btn"], .ad-modal-overlay .modal-actions button, [data-testid="ad-sim-modal"] button:has-text("닫기"), [data-testid="ad-sim-modal"] button:has-text("Close"), .modal-ad-sim button:has-text("닫기"), .modal-ad-sim button:has-text("Close")',

  emergencyReviveModal: '[data-testid="emergency-revive-modal"], .modal-emergency-revive',
  reviveAcceptBtn: '[data-testid="revive-accept-btn"], button:has-text("긴급 수리"), button:has-text("Revive")',
  reviveRetreatBtn: '[data-testid="revive-retreat-btn"], button:has-text("후퇴"), button:has-text("Retreat")',

  offlineRewardModal:
    '[data-testid="offline-reward-modal"], .modal-offline-reward, .modal-overlay:has(.modal-title:has-text("사막의 휴식 보상"))',
  offlineClaimBtn: '[data-testid="offline-claim-btn"], button:has-text("일반 수령")',

  // Developer Debug Bar (aligned with src/ui/debug/DebugBar.tsx & PROJECT.md contracts)
  debugBar: DEBUG_BAR_CONTAINERS.join(', '),
  debugToggleBtn: '[data-testid="debug-toggle-btn"], button:has-text("DEV"), button:has-text("⚙️")',
  debugActSelect: scopeToDebugBar('[data-testid="debug-act-select"]', 'select[name="act"]'),
  debugTierSelect: scopeToDebugBar(
    '[data-testid="debug-tier-select"]',
    'select[name="tier"]',
    '[data-testid="debug-ad-tier-select"]'
  ),
  debugPlayTimeInput: scopeToDebugBar(
    '[data-testid="debug-playtime-input"]',
    'input[name="playtime"]',
    '[data-testid="debug-play-time-input"]'
  ),
  debugSpeedBtn: scopeToDebugBar(
    '[data-testid="debug-speed-btn"]',
    'button:has-text("Speed: 1x")',
    'button:has-text("Speed: 4x")',
    'button:has-text("1x")',
    'button:has-text("4x")'
  ),
  debugAddCurrencyBtn: scopeToDebugBar(
    '[data-testid="debug-add-currency-btn"]',
    'button:has-text("+1000G/+10태엽")'
  ),
  debugResetSaveBtn: scopeToDebugBar(
    '[data-testid="debug-reset-save-btn"]',
    'button:has-text("세이브 초기화")',
    'button:has-text("새 게임")'
  ),
  debugProgressSlider: scopeToDebugBar('[data-testid="debug-progress-slider"]', 'input[type="range"]'),
  debugExportKpiBtn: scopeToDebugBar(
    '[data-testid="debug-export-kpi-btn"]',
    'button:has-text("Export KPI")',
    'button:has-text("KPI")'
  ),
  debugFpsReadout: scopeToDebugBar('[data-testid="debug-fps-readout"]', '.debug-fps-readout'),
} as const;

// ----------------------------------------------------------------------------
// Canvas Readiness & Rendering Helpers
// ----------------------------------------------------------------------------

/**
 * Waits until the Zone B canvas is mounted, has non-zero logical dimensions,
 * has executed at least 2 animation frames, and contains non-empty pixel data.
 */
export async function waitForCanvasReady(page: Page, timeoutMs = 10000): Promise<void> {
  const canvas = page.locator(SELECTORS.gameCanvas).first();
  await canvas.waitFor({ state: 'visible', timeout: timeoutMs });

  await page.waitForFunction(
    (selector) => {
      const el = document.querySelector(selector) as HTMLCanvasElement | null;
      if (!el || el.width === 0 || el.height === 0) return false;
      const ctx = el.getContext('2d');
      if (!ctx) return false;

      // Sample a horizontal row of pixels across the canvas to verify content is painted
      try {
        const sample = ctx.getImageData(0, Math.floor(el.height / 2), Math.min(el.width, 50), 1);
        // Returns true if at least one pixel has a non-zero alpha channel
        for (let i = 3; i < sample.data.length; i += 4) {
          if (sample.data[i] > 0) return true;
        }
      } catch {
        // Fallback to true if context read is temporarily locked
        return true;
      }
      return false;
    },
    SELECTORS.gameCanvas,
    { timeout: timeoutMs }
  );
}

/**
 * Awaits document.fonts.ready (bounded by timeoutMs) and pumps requestAnimationFrame
 * for settleMs before FPS profiling begins, rejecting if fewer than 2 frames complete.
 */
export async function waitForSteadyState(
  page: Page,
  settleMs = 500,
  timeoutMs = 5000
): Promise<void> {
  const safeSettleMs = Number.isFinite(settleMs) && settleMs > 0 ? settleMs : 0;
  const safeTimeoutMs = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 5000;

  const result = await page.evaluate(
    async ({ settle, timeout }) => {
      const start = performance.now();

      if (document.fonts && document.fonts.ready) {
        let fontTimerId: number | undefined;
        try {
          await Promise.race([
            document.fonts.ready,
            new Promise<void>((resolve) => {
              fontTimerId = window.setTimeout(resolve, timeout);
            }),
          ]);
        } finally {
          if (fontTimerId !== undefined) {
            window.clearTimeout(fontTimerId);
          }
        }
      }

      const elapsedAfterFonts = performance.now() - start;
      const remainingBudget = Math.max(100, timeout - elapsedAfterFonts);

      return await new Promise<{ frames: number; timedOut: boolean }>((resolve) => {
        let frames = 0;
        let settleStart: number | null = null;
        let rafId: number | null = null;
        let done = false;

        const watchdogId = window.setTimeout(() => {
          if (done) return;
          done = true;
          if (rafId !== null) {
            cancelAnimationFrame(rafId);
            rafId = null;
          }
          resolve({ frames, timedOut: true });
        }, remainingBudget);

        const tick = (ts: number) => {
          if (done) return;
          frames++;
          if (settleStart === null) {
            settleStart = ts;
          }
          if (ts - settleStart >= settle && frames >= 2) {
            done = true;
            window.clearTimeout(watchdogId);
            resolve({ frames, timedOut: false });
            return;
          }
          rafId = requestAnimationFrame(tick);
        };

        rafId = requestAnimationFrame(tick);
      });
    },
    { settle: safeSettleMs, timeout: safeTimeoutMs }
  );

  if (result.timedOut || result.frames < 2) {
    throw new Error(
      `waitForSteadyState failed: completed ${result.frames} rAF frame(s) (timedOut=${result.timedOut})`
    );
  }
}

/**
 * Samples RGBA pixel data from the Zone B canvas at given logical coordinates (X, Y).
 */
export async function sampleCanvasPixel(
  page: Page,
  logicalX: number,
  logicalY: number
): Promise<{ r: number; g: number; b: number; a: number }> {
  return await page.evaluate(
    ({ selector, x, y }) => {
      const el = document.querySelector(selector) as HTMLCanvasElement;
      if (!el) return { r: 0, g: 0, b: 0, a: 0 };
      const ctx = el.getContext('2d');
      if (!ctx) return { r: 0, g: 0, b: 0, a: 0 };

      // Account for devicePixelRatio backing store scaling
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const pixel = ctx.getImageData(Math.floor(x * dpr), Math.floor(y * dpr), 1, 1).data;
      return { r: pixel[0], g: pixel[1], b: pixel[2], a: pixel[3] };
    },
    { selector: SELECTORS.gameCanvas, x: logicalX, y: logicalY }
  );
}

/**
 * Simulates a touch/pointer drag targeting gesture across Zone B canvas coordinates.
 */
export async function dragWeakPointAim(
  page: Page,
  startLogical: { x: number; y: number },
  endLogical: { x: number; y: number },
  options?: { steps?: number; holdMs?: number; release?: boolean }
): Promise<void> {
  const canvas = page.locator(SELECTORS.gameCanvas).first();
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas bounding box not found for dragWeakPointAim');

  const steps = options?.steps ?? 10;
  const holdMs = options?.holdMs ?? 200;
  const release = options?.release ?? true;

  // Convert logical coordinates within Zone B (680x412) to viewport screen coordinates
  const scale = box.width / 680;
  const startX = box.x + startLogical.x * scale;
  const startY = box.y + startLogical.y * scale;
  const endX = box.x + endLogical.x * scale;
  const endY = box.y + endLogical.y * scale;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(endX, endY, { steps });
  if (holdMs > 0) {
    await page.waitForTimeout(holdMs);
  }
  if (release) {
    await page.mouse.up();
  }
}

// ----------------------------------------------------------------------------
// UI Interaction Helpers
// ----------------------------------------------------------------------------

/**
 * Switches the active turret to Heat Ray, Harpoon, or Mortar.
 */
export async function switchTurret(page: Page, turret: TurretType): Promise<void> {
  const selector =
    turret === 'HEAT_RAY'
      ? SELECTORS.turretBtnHeatRay
      : turret === 'HARPOON'
      ? SELECTORS.turretBtnHarpoon
      : SELECTORS.turretBtnMortar;

  const btn = page.locator(selector).first();
  await btn.waitFor({ state: 'visible', timeout: 5000 });
  await btn.click();
}

/**
 * Triggers the Dodge Boost action in the Tactical Bar.
 */
export async function triggerDodgeBoost(page: Page): Promise<void> {
  const btn = page.locator(SELECTORS.dodgeBoostBtn).first();
  await btn.waitFor({ state: 'visible', timeout: 5000 });
  await btn.click();
}

export interface CombatEnemyDebugSnapshot {
  id: string;
  archetypeId: string;
  kind?: string;
  tags: string[];
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  armor: number;
  weakPointOffset?: { x: number; y: number };
  weakPoints?: Array<{ id: string; x: number; y: number }>;
}

export interface CombatBossDebugSnapshot {
  id: string;
  name?: string;
  phase: number;
  maxPhase?: number;
  hp: number;
  maxHp: number;
  armor: number;
  maxArmor?: number;
  recommendedTurret?: TurretType;
  wavesSpawned?: number;
  isGroggy: boolean;
  telegraphActive: boolean;
  specialKind?: string | null;
  specialTriggerCount?: number;
}

export interface CombatDamageEventSnapshot {
  source: string;
  turret?: TurretType;
  tags: string[];
  multiplier: number;
  damage: number;
  timestamp: number;
}

export interface CombatDebugSnapshot {
  fsmStateId: string | null;
  activeTurret: TurretType;
  switchCooldownRemaining: number;
  lockedTargetId: string | null;
  lockRemainingSec: number;
  synergyActive: boolean;
  activeMercenaries: string[];
  enemyCount: number;
  enemies: CombatEnemyDebugSnapshot[];
  activeProjectiles: {
    hasBeam: boolean;
    harpoons: number;
    mortars: number;
    explosions: number;
  };
  actualSpeed?: number;
  isQuicksandSlowed?: boolean;
  isQuicksandBypassed?: boolean;
  isSandstorm?: boolean;
  isSandstormVisionMasked?: boolean;
  relayTowerVisible?: boolean;
  boss?: CombatBossDebugSnapshot | null;
  particleCount?: number;
  expeditionBurstCount?: number;
  expeditionBurstReady?: boolean;
  recentDamageEvents?: CombatDamageEventSnapshot[];
}

export interface DialogueDebugSnapshot {
  activeBalloons: Array<{
    id: string;
    speaker: string;
    text: string;
    y: number;
    remainingSec: number;
  }>;
  queuedCount: number;
}

export interface SandwalkerDebugSnapshot {
  combat: CombatDebugSnapshot;
  meta: GameStoreState['meta'];
  currencies: GameStoreState['currencies'];
  sandwalker: GameStoreState['sandwalker'];
  mercenaries: Array<
    GameStoreState['mercenaries'][number] & { activeBuffs?: string[] }
  >;
  trade?: GameStoreState['trade'];
  relics?: GameStoreState['relics'];
  steles?: GameStoreState['steles'];
  monetization?: GameStoreState['monetization'];
  progression?: {
    autoInvestPolicy: 'MANUAL' | 'BALANCED' | 'COMBAT' | 'ECONOMY';
    completedMilestones: string[];
    counters: {
      killsByTurret: Record<TurretType, number>;
      bossPartBreaks: number;
      bossDefeats: number;
      stelesDecoded: number;
      relicsAppraised: number;
      quicksandCleared: number;
      sandstormSurvivedSec: number;
      totalTradeProfit: number;
      lootCollected: number;
    };
    recentAutoUpgrades: Array<{
      id: string;
      category: string;
      targetLabel: string;
      fromValue: string;
      toValue: string;
      triggerReason: string;
    }>;
  };
  explorerPassives?: {
    appraisalLv: number;
    survivalLv: number;
    linguisticsLv: number;
  };
  quests?: {
    completedIds: string[];
    urgentDelivery: {
      active: boolean;
      startedAtPlaySec: number;
      timeLimitSec: number;
      completedCount: number;
    };
  };
  mercEquipment?: Partial<
    Record<string, { rarity: 'COMMON' | 'RARE' | 'LEGENDARY' | 'ANCIENT'; level: number; xp: number }>
  >;
  endgame?: {
    templeGateUnlocked: boolean;
    endingCompleted: boolean;
    pendingEndingModal: boolean;
    endlessUnlocked: boolean;
    endlessActive: boolean;
    currentDepth: number;
    maxDepthCleared: number;
    goldenTradeActive: boolean;
  };
  codexBonuses?: {
    turretDamagePct: number;
    critChancePct: number;
    tradeGoldPct: number;
    stormResistPct: number;
    excavateSpeedPct: number;
  };
  lootCount?: number;
  dialogue?: DialogueDebugSnapshot;
}

export interface CanvasRegionStats {
  hash: string;
  meanR: number;
  meanG: number;
  meanB: number;
  nonBgPixels: number;
  centerR: number;
  centerG: number;
  centerB: number;
}

/**
 * Reads all parsed economic and progression metrics displayed in Zone A HUD.
 */
export async function readZoneAHud(page: Page): Promise<{
  oasisName: string;
  routeProgress: number;
  sunGold: number;
  ancientGear: number;
  templeKeys: number;
  adTierBadge?: string;
  fsmState?: string;
  mapFragments?: number;
  actText?: string;
  actualSpeedPx?: number;
  hp?: number;
  maxHp?: number;
  solarShieldHp?: number;
  surgePercent?: number;
  synergyActive?: boolean;
}> {
  const nameText = (await page.locator(SELECTORS.hudOasisName).first().textContent()) || '';
  const progressText =
    (await page.locator(SELECTORS.hudRouteProgress).first().textContent()) || '0';
  const goldText = (await page.locator(SELECTORS.hudSunGold).first().textContent()) || '0';
  const gearText = (await page.locator(SELECTORS.hudAncientGear).first().textContent()) || '0';
  const keysText = (await page.locator(SELECTORS.hudTempleKeys).first().textContent()) || '0';
  const fragmentsLoc = page.locator(SELECTORS.hudMapFragments).first();
  const fragmentsText = (await fragmentsLoc.count()) > 0 ? (await fragmentsLoc.textContent()) || '0' : '0';
  const actLoc = page.locator(SELECTORS.hudActBadge).first();
  const actText = (await actLoc.count()) > 0 ? ((await actLoc.textContent()) || '').trim() : undefined;
  const tierLoc = page.locator(SELECTORS.hudAdTierBadge).first();
  const adTierBadge = (await tierLoc.count()) > 0 ? ((await tierLoc.textContent()) || '').trim() : undefined;
  const fsmLoc = page.locator(SELECTORS.hudFsmBadge).first();
  const fsmAttr = (await fsmLoc.count()) > 0 ? ((await fsmLoc.getAttribute('data-fsm-state')) || '').trim() : '';
  const fsmRaw = (await fsmLoc.count()) > 0 ? ((await fsmLoc.textContent()) || '').trim() : '';
  const fsmState = fsmAttr || (fsmRaw ? fsmRaw.replace(/^FSM:\s*/i, '').trim() : undefined);

  const extractInt = (str: string) => {
    const match = str.replace(/,/g, '').match(/\d+/);
    return match ? parseInt(match[0], 10) : 0;
  };

  const extractFloat = (str: string) => {
    const match = str.replace(/,/g, '').match(/\d+(?:\.\d+)?/);
    return match ? parseFloat(match[0]) : 0;
  };

  const speedLoc = page.locator(SELECTORS.hudActualSpeed).first();
  const actualSpeedPx =
    (await speedLoc.count()) > 0
      ? extractFloat((await speedLoc.textContent()) || '0')
      : undefined;

  const hpLoc = page.locator(SELECTORS.hudSandwalkerHp).first();
  let hp: number | undefined;
  let maxHp: number | undefined;
  if ((await hpLoc.count()) > 0) {
    const hpText = ((await hpLoc.textContent()) || '').replace(/,/g, '');
    const hpMatch = hpText.match(/(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/);
    if (hpMatch) {
      hp = parseFloat(hpMatch[1]);
      maxHp = parseFloat(hpMatch[2]);
    }
  }

  const shieldLoc = page.locator(SELECTORS.hudSolarShield).first();
  const solarShieldHp =
    (await shieldLoc.count()) > 0
      ? extractInt((await shieldLoc.textContent()) || '0')
      : undefined;

  const surgeLoc = page.locator(SELECTORS.hudSurgeBadge).first();
  const surgePercent =
    (await surgeLoc.count()) > 0
      ? extractFloat((await surgeLoc.textContent()) || '0')
      : undefined;

  const synergyLoc = page.locator(SELECTORS.hudSynergyBadge).first();
  const synergyActive =
    (await synergyLoc.count()) > 0
      ? await synergyLoc.isVisible().catch(() => false)
      : false;

  return {
    oasisName: nameText.trim(),
    routeProgress: extractFloat(progressText),
    sunGold: extractInt(goldText),
    ancientGear: extractInt(gearText),
    templeKeys: extractInt(keysText),
    adTierBadge,
    fsmState,
    mapFragments: extractInt(fragmentsText),
    actText,
    actualSpeedPx,
    hp,
    maxHp,
    solarShieldHp,
    surgePercent,
    synergyActive,
  };
}

/**
 * Reads the current FSM state string from the Zone A FSM badge.
 */
export async function readFsmState(page: Page): Promise<string> {
  const loc = page.locator(SELECTORS.hudFsmBadge).first();
  const attr = ((await loc.getAttribute('data-fsm-state').catch(() => null)) || '').trim();
  if (attr) return attr;
  const raw = (await loc.textContent()) || '';
  return raw.replace(/^FSM:\s*/i, '').trim();
}

/**
 * Polls Zone A FSM badge until it matches the expected state.
 */
export async function waitForFsmState(
  page: Page,
  state: string,
  timeoutMs = 10000
): Promise<void> {
  await expect.poll(() => readFsmState(page), { timeout: timeoutMs }).toBe(state);
}

/**
 * Extracts route distance in meters from Zone A progress label (e.g. "37.5% (2,700m / 7,200m)" -> 2700).
 */
export async function readRouteMeters(page: Page): Promise<number> {
  const raw = (await page.locator(SELECTORS.hudRouteProgress).first().textContent()) || '0';
  const cleaned = raw.replace(/,/g, '');
  const parenMatch = cleaned.match(/\(\s*(\d+(?:\.\d+)?)m\s*\//i);
  if (parenMatch) {
    return Math.round(parseFloat(parenMatch[1]));
  }
  const meterMatch = cleaned.match(/(\d+(?:\.\d+)?)m/i);
  return meterMatch ? Math.round(parseFloat(meterMatch[1])) : 0;
}

/**
 * Clicks the Oasis Hub Sortie button and waits for MARCH_NORMAL state.
 */
export async function sortieFromOasis(page: Page): Promise<void> {
  const btn = page.locator(SELECTORS.sortieBtn).first();
  await btn.waitFor({ state: 'visible', timeout: 5000 });
  await btn.click();
  await waitForFsmState(page, 'MARCH_NORMAL');
}

/**
 * Reads the optional read-only QA/Debug runtime snapshot exposed on window.__SANDWALKER_DEBUG__.
 */
export async function readDebugSnapshot(page: Page): Promise<SandwalkerDebugSnapshot | null> {
  return await page.evaluate(() => {
    const bridge = (
      window as unknown as {
        __SANDWALKER_DEBUG__?: { getSnapshot?: () => SandwalkerDebugSnapshot };
      }
    ).__SANDWALKER_DEBUG__;
    return bridge?.getSnapshot?.() ?? null;
  });
}

export async function spawnDebugLoot(
  page: Page,
  itemKind:
    | 'TURRET_PART_HEAT'
    | 'TURRET_PART_HARPOON'
    | 'TURRET_PART_MORTAR'
    | 'HYDRAULIC_BLUEPRINT'
    | 'WAGON_FRAME'
    | 'MERC_MANUAL'
    | 'EXPLORER_TABLET'
): Promise<void> {
  await page.evaluate((kind) => {
    const bridge = (
      window as unknown as {
        __SANDWALKER_DEBUG__?: { spawnLoot?: (k: string) => void };
      }
    ).__SANDWALKER_DEBUG__;
    bridge?.spawnLoot?.(kind);
  }, itemKind);
}

/**
 * Samples average RGBA values across a rectangular logical Zone B region.
 */
export async function sampleRegionAverageColor(
  page: Page,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  step = 4
): Promise<{ r: number; g: number; b: number; a: number; sampleCount: number }> {
  return await page.evaluate(
    ({ selector, lx0, ly0, lx1, ly1, sampleStep }) => {
      const el = document.querySelector(selector) as HTMLCanvasElement | null;
      if (!el) return { r: 0, g: 0, b: 0, a: 0, sampleCount: 0 };
      const ctx = el.getContext('2d');
      if (!ctx) return { r: 0, g: 0, b: 0, a: 0, sampleCount: 0 };

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const safeStep = Math.max(1, Math.floor(sampleStep));
      const minX = Math.max(0, Math.min(el.width - 1, Math.floor(Math.min(lx0, lx1) * dpr)));
      const maxX = Math.max(minX, Math.min(el.width - 1, Math.floor(Math.max(lx0, lx1) * dpr)));
      const minY = Math.max(0, Math.min(el.height - 1, Math.floor(Math.min(ly0, ly1) * dpr)));
      const maxY = Math.max(minY, Math.min(el.height - 1, Math.floor(Math.max(ly0, ly1) * dpr)));

      const width = maxX - minX + 1;
      const height = maxY - minY + 1;
      const data = ctx.getImageData(minX, minY, width, height).data;

      let sumR = 0;
      let sumG = 0;
      let sumB = 0;
      let sumA = 0;
      let count = 0;
      const pixelStep = Math.max(1, Math.floor(safeStep * dpr));

      for (let py = 0; py < height; py += pixelStep) {
        for (let px = 0; px < width; px += pixelStep) {
          const idx = (py * width + px) * 4;
          sumR += data[idx];
          sumG += data[idx + 1];
          sumB += data[idx + 2];
          sumA += data[idx + 3];
          count++;
        }
      }

      if (count === 0) return { r: 0, g: 0, b: 0, a: 0, sampleCount: 0 };
      return {
        r: sumR / count,
        g: sumG / count,
        b: sumB / count,
        a: sumA / count,
        sampleCount: count,
      };
    },
    { selector: SELECTORS.gameCanvas, lx0: x0, ly0: y0, lx1: x1, ly1: y1, sampleStep: step }
  );
}

/**
 * Samples a logical Zone B canvas region and returns deterministic pixel hash, RGB means,
 * non-background pixel count, and center pixel RGB.
 */
export async function sampleCanvasRegionStats(
  page: Page,
  rect: { x: number; y: number; width: number; height: number }
): Promise<CanvasRegionStats> {
  return await page.evaluate(
    ({ selector, region }) => {
      const el = document.querySelector(selector) as HTMLCanvasElement | null;
      if (!el) {
        return {
          hash: '00000000',
          meanR: 0,
          meanG: 0,
          meanB: 0,
          nonBgPixels: 0,
          centerR: 0,
          centerG: 0,
          centerB: 0,
        };
      }
      const ctx = el.getContext('2d');
      if (!ctx) {
        return {
          hash: '00000000',
          meanR: 0,
          meanG: 0,
          meanB: 0,
          nonBgPixels: 0,
          centerR: 0,
          centerG: 0,
          centerB: 0,
        };
      }

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const sx = Math.max(0, Math.min(el.width - 1, Math.floor(region.x * dpr)));
      const sy = Math.max(0, Math.min(el.height - 1, Math.floor(region.y * dpr)));
      const sw = Math.max(1, Math.min(el.width - sx, Math.floor(region.width * dpr)));
      const sh = Math.max(1, Math.min(el.height - sy, Math.floor(region.height * dpr)));

      const data = ctx.getImageData(sx, sy, sw, sh).data;
      const totalPixels = sw * sh;
      const bgR = data[3] > 0 ? data[0] : 11;
      const bgG = data[3] > 0 ? data[1] : 12;
      const bgB = data[3] > 0 ? data[2] : 16;

      let hash = 0x811c9dc5;
      let sumR = 0;
      let sumG = 0;
      let sumB = 0;
      let nonBgPixels = 0;

      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const a = data[i + 3];

        sumR += r;
        sumG += g;
        sumB += b;

        if (a > 0 && Math.abs(r - bgR) + Math.abs(g - bgG) + Math.abs(b - bgB) > 20) {
          nonBgPixels++;
        }

        hash ^= r;
        hash = Math.imul(hash, 0x01000193);
        hash ^= g;
        hash = Math.imul(hash, 0x01000193);
        hash ^= b;
        hash = Math.imul(hash, 0x01000193);
        hash ^= a;
        hash = Math.imul(hash, 0x01000193);
      }

      const cx = Math.floor(sw / 2);
      const cy = Math.floor(sh / 2);
      const cIdx = (cy * sw + cx) * 4;

      return {
        hash: (hash >>> 0).toString(16).padStart(8, '0'),
        meanR: sumR / totalPixels,
        meanG: sumG / totalPixels,
        meanB: sumB / totalPixels,
        nonBgPixels,
        centerR: data[cIdx],
        centerG: data[cIdx + 1],
        centerB: data[cIdx + 2],
      };
    },
    { selector: SELECTORS.gameCanvas, region: rect }
  );
}

/**
 * Asserts that pixels inside a logical Zone B canvas region animate/change over waitMs.
 */
export async function assertCanvasRegionChanged(
  page: Page,
  rect: { x: number; y: number; width: number; height: number },
  waitMs = 350
): Promise<void> {
  const before = await sampleCanvasRegionStats(page, rect);
  await page.waitForTimeout(waitMs);
  const after = await sampleCanvasRegionStats(page, rect);
  expect(
    after.hash,
    `Expected canvas region (${rect.x},${rect.y},${rect.width}x${rect.height}) to change after ${waitMs}ms`
  ).not.toBe(before.hash);
}

/**
 * Measures observed route march speed (px/s normalized to 1x time scale) via Zone A HUD meters.
 */
export async function measureObservedRouteSpeedPxPerSec(
  page: Page,
  sampleWindowMs = 2500
): Promise<number> {
  const startMeters = await readRouteMeters(page);
  const timeScale = await page.evaluate(
    () =>
      (window as unknown as { __SANDWALKER_TIME_SCALE__?: number }).__SANDWALKER_TIME_SCALE__ ?? 1
  );
  const t0 = Date.now();
  await page.waitForTimeout(sampleWindowMs);
  const endMeters = await readRouteMeters(page);
  const elapsedSec = Math.max(0.001, (Date.now() - t0) / 1000);
  return (endMeters - startMeters) / (elapsedSec * Math.max(1, timeScale));
}

/**
 * Selects one of the 4 growth tabs in Zone C Dashboard.
 */
export async function selectDashboardTab(
  page: Page,
  tab: 'mech' | 'mercenaries' | 'trading' | 'codex'
): Promise<void> {
  const selector =
    tab === 'mech'
      ? SELECTORS.tabBtnMech
      : tab === 'mercenaries'
      ? SELECTORS.tabBtnMercenaries
      : tab === 'trading'
      ? SELECTORS.tabBtnTrading
      : SELECTORS.tabBtnCodex;

  const tabBtn = page.locator(selector).first();
  await tabBtn.waitFor({ state: 'visible', timeout: 5000 });
  await tabBtn.click();
}

/**
 * Clicks the opening hook skip button if visible on screen.
 */
export async function skipIntroIfVisible(page: Page): Promise<boolean> {
  const skipBtn = page.locator(SELECTORS.skipIntroBtn).first();
  if (await skipBtn.isVisible()) {
    await skipBtn.click();
    return true;
  }
  return false;
}

// ----------------------------------------------------------------------------
// Developer Debug Bar Helpers
// ----------------------------------------------------------------------------

/**
 * Ensures the Developer Debug Bar overlay is expanded. Strictly idempotent.
 */
export async function openDebugBar(page: Page): Promise<void> {
  const bar = page.locator(SELECTORS.debugBar).first();
  const act1Btn = bar.locator('[data-testid="debug-act-1"], button:has-text("Act 1")').first();

  if ((await bar.isVisible()) || (await act1Btn.isVisible())) {
    return;
  }

  const toggle = page.locator(SELECTORS.debugToggleBtn).first();
  if (!(await toggle.isVisible())) {
    await toggle.waitFor({ state: 'visible', timeout: 5000 });
  }
  await toggle.click();
  await bar.or(act1Btn).first().waitFor({ state: 'visible', timeout: 5000 });
}

/**
 * Overrides the active Act (1~4) via the Debug Bar.
 */
export async function setDebugAct(page: Page, act: number): Promise<void> {
  await openDebugBar(page);
  const debugBar = page.locator(SELECTORS.debugBar).first();
  // Support both select element and button grid representations scoped inside DebugBar
  const actSelect = debugBar
    .locator('[data-testid="debug-act-select"], select[name="act"]')
    .first();
  if (await actSelect.isVisible()) {
    await actSelect.selectOption(String(act));
  } else {
    const actBtn = debugBar
      .locator(
        `[data-testid="debug-act-${act}"], button:has-text("Act ${act}"), button:has-text("${act}막")`
      )
      .first();
    await actBtn.click();
  }
}

/**
 * Overrides the active Ad Tier (0~3) via the Debug Bar.
 */
export async function setDebugAdTier(page: Page, tier: AdTierLevel): Promise<void> {
  await openDebugBar(page);
  const debugBar = page.locator(SELECTORS.debugBar).first();
  const tierSelect = debugBar
    .locator('[data-testid="debug-tier-select"], select[name="tier"], [data-testid="debug-ad-tier-select"]')
    .first();
  if (await tierSelect.isVisible()) {
    await tierSelect.selectOption(String(tier));
  } else {
    const tierBtn = debugBar
      .locator(
        `[data-testid="debug-tier-${tier}"], button:has-text("T${tier}"), button:has-text("Tier ${tier}")`
      )
      .first();
    await tierBtn.click();
  }
}

/**
 * Toggles the game loop simulation time scale (1x vs 4x).
 */
export async function setDebugSpeed(page: Page, speed: 1 | 4): Promise<void> {
  await openDebugBar(page);
  const debugBar = page.locator(SELECTORS.debugBar).first();
  const speedBtn = debugBar
    .locator(
      '[data-testid="debug-speed-btn"], button:has-text("Speed: 1x"), button:has-text("Speed: 4x"), button:has-text("1x"), button:has-text("4x")'
    )
    .first();
  await speedBtn.waitFor({ state: 'visible', timeout: 5000 });
  const currentText = await speedBtn.textContent();
  const currentSpeed = currentText?.includes('4x') ? 4 : 1;
  if (currentSpeed !== speed) {
    await speedBtn.click();
  }
}

/**
 * Sets the total play time in seconds via the Debug Bar.
 * Supports numeric input (if rendered) and DebugBar preset buttons ("0s (초기화)" / "1200s (20분 강제)").
 */
export async function setDebugPlayTime(page: Page, seconds: number): Promise<void> {
  await openDebugBar(page);
  const debugBar = page.locator(SELECTORS.debugBar).first();
  const input = debugBar
    .locator('[data-testid="debug-playtime-input"], input[name="playtime"], [data-testid="debug-play-time-input"]')
    .first();
  if (await input.isVisible()) {
    await input.fill(String(seconds));
    await input.press('Enter');
    await input.dispatchEvent('blur').catch(() => undefined);
    const applyBtn = debugBar.locator('[data-testid="debug-playtime-apply-btn"]').first();
    if (await applyBtn.isVisible().catch(() => false)) {
      await applyBtn.click();
    }
    return;
  }

  if (seconds === 0) {
    const resetBtn = debugBar
      .getByRole('button', { name: /^(0s \(초기화\)|0s)$/ })
      .or(debugBar.locator('[data-testid="debug-playtime-0"], button:has-text("0s (초기화)")'))
      .first();
    await resetBtn.waitFor({ state: 'visible', timeout: 5000 });
    await resetBtn.click();
    return;
  }

  if (seconds === 1200) {
    const forceBtn = debugBar
      .getByRole('button', { name: /^(1200s \(20분 강제\)|1200s)$/ })
      .or(
        debugBar.locator('[data-testid="debug-playtime-1200"], button:has-text("1200s (20분 강제)")')
      )
      .first();
    await forceBtn.waitFor({ state: 'visible', timeout: 5000 });
    await forceBtn.click();
    return;
  }

  throw new Error(
    `Cannot set arbitrary playtime (${seconds}s): DebugBar numeric input not found and only 0s/1200s preset buttons are available.`
  );
}

/**
 * Sets route progress percentage (0~100) via Debug Bar preset buttons or range slider.
 */
export async function setDebugProgress(page: Page, percent: number): Promise<void> {
  await openDebugBar(page);
  const debugBar = page.locator(SELECTORS.debugBar).first();

  if (percent === 0) {
    const btn = debugBar
      .locator('[data-testid="debug-progress-0"]')
      .or(debugBar.getByRole('button', { name: '0%', exact: true }))
      .first();
    await btn.waitFor({ state: 'visible', timeout: 5000 });
    await btn.click();
    return;
  }
  if (percent === 40) {
    const btn = debugBar
      .locator('[data-testid="debug-progress-40"], button:has-text("40%(위기)")')
      .first();
    await btn.waitFor({ state: 'visible', timeout: 5000 });
    await btn.click();
    return;
  }
  if (percent === 70) {
    const btn = debugBar
      .locator('[data-testid="debug-progress-70"], button:has-text("70%(탈출)")')
      .first();
    await btn.waitFor({ state: 'visible', timeout: 5000 });
    await btn.click();
    return;
  }
  if (percent === 95) {
    const btn = debugBar
      .locator('[data-testid="debug-progress-95"], button:has-text("95%(보스)")')
      .first();
    await btn.waitFor({ state: 'visible', timeout: 5000 });
    await btn.click();
    return;
  }
  if (percent === 100) {
    const btn = debugBar
      .locator('[data-testid="debug-progress-100"]')
      .or(debugBar.getByRole('button', { name: '100%', exact: true }))
      .first();
    await btn.waitFor({ state: 'visible', timeout: 5000 });
    await btn.click();
    return;
  }

  const clamped = Math.max(0, Math.min(100, percent));
  const slider = page.locator(SELECTORS.debugProgressSlider).first();
  await slider.waitFor({ state: 'visible', timeout: 5000 });
  await slider.evaluate((el, val) => {
    const input = el as HTMLInputElement;
    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value'
    )?.set;
    if (nativeSetter) {
      nativeSetter.call(input, String(val));
    } else {
      input.value = String(val);
    }
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, clamped);
}

/**
 * Clicks the Debug Bar currency cheat button (+1000G/+10태엽) `times` times.
 */
export async function clickAddDebugCurrencies(page: Page, times = 1): Promise<void> {
  await openDebugBar(page);
  const btn = page.locator(SELECTORS.debugAddCurrencyBtn).first();
  await btn.waitFor({ state: 'visible', timeout: 5000 });
  for (let i = 0; i < times; i++) {
    await btn.click();
  }
}

/**
 * Resets save data via the Debug Bar, automatically accepting the window.confirm dialog
 * and waiting for page reload + canvas readiness.
 */
export async function resetSaveViaDebugBar(page: Page): Promise<void> {
  await openDebugBar(page);
  const resetBtn = page.locator(SELECTORS.debugResetSaveBtn).first();
  await resetBtn.waitFor({ state: 'visible', timeout: 5000 });

  page.once('dialog', (dialog) => {
    void dialog.accept();
  });

  await Promise.all([
    page.waitForEvent('load', { timeout: 10000 }),
    resetBtn.click(),
  ]);
  await waitForCanvasReady(page, 10000);
}

// ----------------------------------------------------------------------------
// Layout & Compliance Assertions (AC-01 & AC-02)
// ----------------------------------------------------------------------------

/**
 * Validates the strict 3-Zone vertical layout boundaries on screen (AC-01).
 */
export async function assert3ZoneLayout(page: Page): Promise<void> {
  const zoneA = page.locator(SELECTORS.zoneA).first();
  const zoneB = page.locator(SELECTORS.zoneB).first();
  const zoneC = page.locator(SELECTORS.zoneC).first();
  const zoneTac = page.locator(SELECTORS.zoneCTactical).first();

  await expect(zoneA).toBeVisible();
  await expect(zoneB).toBeVisible();
  await expect(zoneC).toBeVisible();
  await expect(zoneTac).toBeVisible();

  const boxA = await zoneA.boundingBox();
  const boxB = await zoneB.boundingBox();
  const boxC = await zoneC.boundingBox();
  const boxTac = await zoneTac.boundingBox();

  expect(boxA).not.toBeNull();
  expect(boxB).not.toBeNull();
  expect(boxC).not.toBeNull();
  expect(boxTac).not.toBeNull();

  if (boxA && boxB && boxC && boxTac) {
    // 16:9 L-Shape: Zone A on top; Zone B + Zone C-Tactical on left; Zone C dashboard on right
    expect(boxB.y).toBeGreaterThanOrEqual(boxA.y + boxA.height - 2);
    expect(boxC.y).toBeGreaterThanOrEqual(boxA.y + boxA.height - 2);
    expect(boxTac.y).toBeGreaterThanOrEqual(boxB.y + boxB.height - 2);
    expect(boxC.x).toBeGreaterThanOrEqual(boxB.x + boxB.width - 2);
  }
}

/**
 * Validates all visible dialogue balloons for AC-02 compliance:
 * - String length <= 35 characters (inclusive of spaces per PRD §7 AC-02)
 * - Clears central combat band: logical y ∉ [165, 400] (normalized to 960x540 landscape shell)
 */
export async function assertDialogueCompliance(
  page: Page,
  options?: { minCount?: number }
): Promise<void> {
  const balloons = page.locator(SELECTORS.dialogueBubble);
  const totalCount = await balloons.count();
  const minCount = options?.minCount ?? 1;

  const visibleBalloons: Array<ReturnType<typeof balloons.nth>> = [];
  for (let i = 0; i < totalCount; i++) {
    const balloon = balloons.nth(i);
    if (await balloon.isVisible().catch(() => false)) {
      visibleBalloons.push(balloon);
    }
  }

  expect(
    visibleBalloons.length,
    `Expected at least ${minCount} visible dialogue balloon(s) for AC-02 verification, found ${visibleBalloons.length}`
  ).toBeGreaterThanOrEqual(minCount);

  const shellBox = await page.locator(SELECTORS.viewportShell).first().boundingBox();
  const scale = shellBox && shellBox.width > 0 ? shellBox.width / 960 : 1;
  const originY = shellBox ? shellBox.y : 0;

  for (const balloon of visibleBalloons) {
    const text = (await balloon.textContent()) || '';
    // Unicode code point length (including whitespace)
    const codePointLength = [...text].length;

    expect(
      codePointLength,
      `Dialogue "${text}" exceeds 35 character limit (got ${codePointLength})`
    ).toBeLessThanOrEqual(35);

    const box = await balloon.boundingBox();
    if (box) {
      const logicalTop = (box.y - originY) / scale;
      const logicalBottom = (box.y + box.height - originY) / scale;
      // Must not intersect central combat band [165, 400]
      const clearsBand = logicalBottom <= 165 || logicalTop >= 400;
      expect(
        clearsBand,
        `Dialogue balloon logical Y range [${logicalTop.toFixed(1)}, ${logicalBottom.toFixed(1)}] overlaps central combat band [165, 400]`
      ).toBe(true);
    }
  }
}

/**
 * Validates dialogue balloons for AC-02 compliance AND strict 2-line clamp + Zone B horizontal containment.
 */
export async function assertDialogue2LineClamp(
  page: Page,
  options?: { minCount?: number }
): Promise<void> {
  await assertDialogueCompliance(page, options);

  const balloons = page.locator(SELECTORS.dialogueBubble);
  const count = await balloons.count();
  const shellBox = await page.locator(SELECTORS.viewportShell).first().boundingBox();
  const scale = shellBox && shellBox.width > 0 ? shellBox.width / 960 : 1;

  for (let i = 0; i < count; i++) {
    const balloon = balloons.nth(i);
    if (!(await balloon.isVisible().catch(() => false))) continue;
    const box = await balloon.boundingBox();
    if (!box) continue;

    const metrics = await balloon.evaluate((el) => {
      const cs = window.getComputedStyle(el);
      const fontSize = parseFloat(cs.fontSize) || 14;
      const parsedLineHeight = parseFloat(cs.lineHeight);
      const lineHeight = Number.isFinite(parsedLineHeight) ? parsedLineHeight : fontSize * 1.35;
      const padTop = parseFloat(cs.paddingTop) || 0;
      const padBottom = parseFloat(cs.paddingBottom) || 0;
      const borderTop = parseFloat(cs.borderTopWidth) || 0;
      const borderBottom = parseFloat(cs.borderBottomWidth) || 0;
      return { lineHeight, padY: padTop + padBottom + borderTop + borderBottom };
    });

    const logicalHeight = box.height / scale;
    const contentHeight = Math.max(0, logicalHeight - metrics.padY);
    const lineCount = Math.round(contentHeight / Math.max(1, metrics.lineHeight));

    expect(
      lineCount,
      `Dialogue balloon exceeded 2-line clamp (computed ~${lineCount} lines)`
    ).toBeLessThanOrEqual(2);
    expect(
      box.width,
      `Dialogue balloon width (${box.width.toFixed(1)}px) exceeds scaled 680px Zone B (${(680 * scale).toFixed(1)}px)`
    ).toBeLessThanOrEqual(680 * scale + 1);
  }
}

// ----------------------------------------------------------------------------
// Reusable E2E Workflow Helpers
// ----------------------------------------------------------------------------

/**
 * Waits for the simulated Ad modal, awaits close-button enablement (countdown completion),
 * clicks close, and waits until the modal is hidden.
 * When `options.optional` is true, returns `false` if no Ad modal appears within a short window
 * (useful for Tier 1/2 skip tickets and Tier 3 instant rewards).
 */
export async function waitForAndCloseAdModal(
  page: Page,
  optionsOrTimeout?: number | { timeoutMs?: number; optional?: boolean }
): Promise<boolean> {
  const timeoutMs =
    typeof optionsOrTimeout === 'number'
      ? optionsOrTimeout
      : optionsOrTimeout?.timeoutMs ?? 10000;
  const optional =
    typeof optionsOrTimeout === 'number' ? false : optionsOrTimeout?.optional ?? false;

  const adModal = page.locator(SELECTORS.adSimModal).first();
  if (optional) {
    try {
      await adModal.waitFor({ state: 'visible', timeout: Math.min(1200, timeoutMs) });
    } catch {
      return false;
    }
  } else {
    await adModal.waitFor({ state: 'visible', timeout: timeoutMs });
  }

  const closeBtn = page.locator(SELECTORS.adSimCloseBtn).first();
  await expect(closeBtn).toBeEnabled({ timeout: timeoutMs });
  await closeBtn.click();
  await adModal.waitFor({ state: 'hidden', timeout: timeoutMs });
  return true;
}

/**
 * Dismisses the Oasis Settlement modal, optionally claiming Zafar 2x first and handling any
 * resulting rewarded or interstitial ad modals, then waits for OASIS_HUB state.
 */
export async function dismissSettlement(
  page: Page,
  options?: { useZafar2x?: boolean; closeAdModal?: boolean; timeoutMs?: number }
): Promise<void> {
  const timeoutMs = options?.timeoutMs ?? 10000;
  const modal = page.locator(SELECTORS.settlementModal).first();
  await modal.waitFor({ state: 'visible', timeout: timeoutMs });

  if (options?.useZafar2x) {
    const zafarBtn = modal.locator(SELECTORS.zafarDoubleBtn).first();
    await zafarBtn.waitFor({ state: 'visible', timeout: timeoutMs });
    await zafarBtn.click();
    await waitForAndCloseAdModal(page, { optional: true, timeoutMs });
  }

  const proceedBtn = page.locator(SELECTORS.settlementProceedBtn).first();
  await proceedBtn.waitFor({ state: 'visible', timeout: timeoutMs });
  await proceedBtn.click();

  if (options?.closeAdModal !== false) {
    await waitForAndCloseAdModal(page, { optional: true, timeoutMs });
  }

  await modal.waitFor({ state: 'hidden', timeout: timeoutMs });
  await waitForFsmState(page, 'OASIS_HUB', timeoutMs);
}

/**
 * Accepts the Emergency Revive modal, handles any optional rewarded ad modal, waits for modal
 * dismissal, and optionally verifies the resumed FSM state.
 */
export async function acceptEmergencyRevive(
  page: Page,
  options?: { expectedResumeState?: string; timeoutMs?: number; requireAdModal?: boolean }
): Promise<void> {
  const timeoutMs = options?.timeoutMs ?? 10000;
  const requireAdModal = options?.requireAdModal ?? false;
  const modal = page.locator(SELECTORS.emergencyReviveModal).first();
  await modal.waitFor({ state: 'visible', timeout: timeoutMs });

  const acceptBtn = modal.locator(SELECTORS.reviveAcceptBtn).first();
  await acceptBtn.waitFor({ state: 'visible', timeout: timeoutMs });
  await acceptBtn.click();

  await waitForAndCloseAdModal(page, { optional: !requireAdModal, timeoutMs });
  await modal.waitFor({ state: 'hidden', timeout: timeoutMs });

  if (options?.expectedResumeState) {
    await waitForFsmState(page, options.expectedResumeState, timeoutMs);
  }
}

/**
 * Declines Emergency Revive by clicking Retreat and waits for transition back to OASIS_HUB.
 */
export async function retreatFromRevive(page: Page, timeoutMs = 10000): Promise<void> {
  const modal = page.locator(SELECTORS.emergencyReviveModal).first();
  await modal.waitFor({ state: 'visible', timeout: timeoutMs });

  const retreatBtn = modal.locator(SELECTORS.reviveRetreatBtn).first();
  await retreatBtn.waitFor({ state: 'visible', timeout: timeoutMs });
  await retreatBtn.click();

  await modal.waitFor({ state: 'hidden', timeout: timeoutMs });
  await waitForFsmState(page, 'OASIS_HUB', timeoutMs);
}

/**
 * Switches to the Trading Post tab and buys either a specific cargo quantity or maximum capacity.
 */
export async function buyTradeCargo(
  page: Page,
  qty: number | 'max',
  timeoutMs = 5000
): Promise<void> {
  await selectDashboardTab(page, 'trading');

  if (qty === 'max') {
    const maxBtn = page.locator(SELECTORS.btnBuyCargoMax).first();
    await maxBtn.waitFor({ state: 'visible', timeout: timeoutMs });
    await maxBtn.click();
    return;
  }

  const input = page.locator(SELECTORS.tradeCargoQtyInput).first();
  await input.waitFor({ state: 'visible', timeout: timeoutMs });
  await input.fill(String(qty));

  const buyBtn = page.locator(SELECTORS.btnBuyCargo).first();
  await buyBtn.waitFor({ state: 'visible', timeout: timeoutMs });
  await buyBtn.click();
}

/**
 * Switches to the Mech Mod tab and clicks the specified Sandwalker upgrade or skin action `times` times.
 */
export async function upgradePart(
  page: Page,
  target: 'turret' | 'turret-tier' | 'legs' | 'wagon' | 'skin-pharaoh',
  times = 1,
  timeoutMs = 5000
): Promise<void> {
  await selectDashboardTab(page, 'mech');

  const selector =
    target === 'turret'
      ? SELECTORS.btnUpgradeTurret
      : target === 'turret-tier'
      ? SELECTORS.btnTierUpTurret
      : target === 'legs'
      ? SELECTORS.btnUpgradeLegs
      : target === 'wagon'
      ? SELECTORS.btnAddWagon
      : SELECTORS.btnEquipPharaohSkin;

  const btn = page.locator(selector).first();
  await btn.waitFor({ state: 'visible', timeout: timeoutMs });
  for (let i = 0; i < times; i++) {
    await btn.click();
  }
}

/**
 * Switches to the Mercenaries tab and upgrades the given mercenary `times` times.
 */
export async function upgradeMercenary(
  page: Page,
  mercId: string,
  times = 1,
  timeoutMs = 5000
): Promise<void> {
  await selectDashboardTab(page, 'mercenaries');

  const btn = page.locator(mercUpgradeBtnSelector(mercId)).first();
  await btn.waitFor({ state: 'visible', timeout: timeoutMs });
  for (let i = 0; i < times; i++) {
    await btn.click();
  }
}

/**
 * Triggers the Solar Shield tactical skill from the Zone C Tactical Bar.
 */
export async function triggerSolarShield(page: Page, timeoutMs = 5000): Promise<void> {
  const btn = page.locator(SELECTORS.solarShieldBtn).first();
  await btn.waitFor({ state: 'visible', timeout: timeoutMs });
  await btn.click();
}

/**
 * Waits for the Ancient Solar Relay Tower banner during Hazard Zone and activates it,
 * closing any simulated rewarded ad modal if presented.
 */
export async function activateRelayTower(
  page: Page,
  timeoutMsOrOptions: number | { timeoutMs?: number; requireAdModal?: boolean } = 10000,
  requireAdModalArg = false
): Promise<void> {
  const timeoutMs =
    typeof timeoutMsOrOptions === 'number'
      ? timeoutMsOrOptions
      : timeoutMsOrOptions?.timeoutMs ?? 10000;
  const requireAdModal =
    typeof timeoutMsOrOptions === 'number'
      ? requireAdModalArg
      : timeoutMsOrOptions?.requireAdModal ?? false;

  const banner = page.locator(SELECTORS.relayTowerBanner).first();
  await banner.waitFor({ state: 'visible', timeout: timeoutMs });

  const btn = page.locator(SELECTORS.relayActivateBtn).first();
  await btn.waitFor({ state: 'visible', timeout: timeoutMs });
  await btn.click();

  await waitForAndCloseAdModal(page, { optional: !requireAdModal, timeoutMs });
}

/**
 * Claims the Offline Idle Reward modal using either standard claim or Zafar 2x, handling
 * any rewarded ad modal and waiting until the offline modal closes.
 */
export async function claimOfflineReward(
  page: Page,
  useZafar2x = false,
  timeoutMs = 10000
): Promise<void> {
  const modal = page.locator(SELECTORS.offlineRewardModal).first();
  await modal.waitFor({ state: 'visible', timeout: timeoutMs });

  if (useZafar2x) {
    const zafarBtn = modal.locator(SELECTORS.zafarDoubleBtn).first();
    await zafarBtn.waitFor({ state: 'visible', timeout: timeoutMs });
    await zafarBtn.click();
    await waitForAndCloseAdModal(page, { optional: true, timeoutMs });
  } else {
    const claimBtn = modal.locator(SELECTORS.offlineClaimBtn).first();
    await claimBtn.waitFor({ state: 'visible', timeout: timeoutMs });
    await claimBtn.click();
  }

  await modal.waitFor({ state: 'hidden', timeout: timeoutMs });
}

/**
 * Opens the Debug Bar and clicks the Export KPI button.
 */
export async function exportDebugKpi(page: Page, timeoutMs = 5000): Promise<void> {
  await openDebugBar(page);
  const btn = page.locator(SELECTORS.debugExportKpiBtn).first();
  await btn.waitFor({ state: 'visible', timeout: timeoutMs });
  await btn.click();
}

/**
 * Switches to the Relic Codex tab and triggers either standard appraisal or instant ad appraisal.
 */
export async function appraiseRelic(
  page: Page,
  useAd = false,
  timeoutMsOrOptions: number | { timeoutMs?: number; requireAdModal?: boolean } = 10000,
  requireAdModalArg = false
): Promise<void> {
  const timeoutMs =
    typeof timeoutMsOrOptions === 'number'
      ? timeoutMsOrOptions
      : timeoutMsOrOptions?.timeoutMs ?? 10000;
  const requireAdModal =
    typeof timeoutMsOrOptions === 'number'
      ? requireAdModalArg
      : timeoutMsOrOptions?.requireAdModal ?? false;

  await selectDashboardTab(page, 'codex');

  const selector = useAd ? SELECTORS.btnAppraiseRelicAd : SELECTORS.btnAppraiseRelic;
  const btn = page.locator(selector).first();
  await btn.waitFor({ state: 'visible', timeout: timeoutMs });
  await btn.click();

  if (useAd) {
    await waitForAndCloseAdModal(page, { optional: !requireAdModal, timeoutMs });
  }
}

/**
 * Polls until the turret switch cooldown reaches 0.
 */
export async function waitForSwitchCooldownReady(
  page: Page,
  timeoutMs = 3000
): Promise<void> {
  await expect
    .poll(
      async () => {
        const snap = await readDebugSnapshot(page);
        return snap ? snap.combat.switchCooldownRemaining : 1;
      },
      { timeout: timeoutMs }
    )
    .toBeLessThanOrEqual(0);
}

/**
 * Polls until the active turret matches the expected TurretType.
 */
export async function waitForActiveTurret(
  page: Page,
  turret: TurretType,
  timeoutMs = 3000
): Promise<void> {
  await expect
    .poll(
      async () => {
        const snap = await readDebugSnapshot(page);
        return snap?.combat.activeTurret ?? snap?.sandwalker.activeTurret ?? null;
      },
      { timeout: timeoutMs }
    )
    .toBe(turret);
}

/**
 * Finds the first matching live enemy in DebugSnapshot, computes its Zone B weak-point
 * coordinates, and drags the manual aim reticle onto that weak point.
 */
export async function aimAtFirstEnemyWeakPoint(
  page: Page,
  predicate?: (enemy: CombatEnemyDebugSnapshot) => boolean,
  options?: { steps?: number; holdMs?: number; release?: boolean; timeoutMs?: number }
): Promise<CombatEnemyDebugSnapshot> {
  const timeoutMs = options?.timeoutMs ?? 5000;
  let targetEnemy: CombatEnemyDebugSnapshot | null = null;

  await expect
    .poll(
      async () => {
        const snap = await readDebugSnapshot(page);
        const enemies = snap?.combat.enemies ?? [];
        const match = enemies.find(
          (enemy) => enemy.hp > 0 && (!predicate || predicate(enemy))
        );
        if (match) {
          targetEnemy = match;
          return true;
        }
        return false;
      },
      { timeout: timeoutMs }
    )
    .toBe(true);

  if (!targetEnemy) {
    throw new Error('No matching enemy found for aimAtFirstEnemyWeakPoint');
  }

  const chosen: CombatEnemyDebugSnapshot = targetEnemy;
  const rawX = chosen.weakPointOffset
    ? chosen.x + chosen.weakPointOffset.x
    : chosen.weakPoints && chosen.weakPoints.length > 0
    ? chosen.weakPoints[0].x
    : chosen.x;
  const rawY = chosen.weakPointOffset
    ? chosen.y + chosen.weakPointOffset.y
    : chosen.weakPoints && chosen.weakPoints.length > 0
    ? chosen.weakPoints[0].y
    : chosen.y;

  const targetX = Math.max(0, Math.min(680, rawX));
  const targetY = Math.max(0, Math.min(412, rawY));
  const startX = targetX >= 35 ? targetX - 30 : targetX + 30;
  const startY = targetY >= 25 ? targetY - 20 : targetY + 20;

  await dragWeakPointAim(page, { x: startX, y: startY }, { x: targetX, y: targetY }, {
    steps: options?.steps,
    holdMs: options?.holdMs,
    release: options?.release,
  });

  return chosen;
}

/**
 * Triggers the Zone C Zafar Call tactical action and handles any rewarded ad modal.
 */
export async function triggerZafarCall(
  page: Page,
  options?: { requireAdModal?: boolean; timeoutMs?: number }
): Promise<void> {
  const timeoutMs = options?.timeoutMs ?? 10000;
  const requireAdModal = options?.requireAdModal ?? false;
  const btn = page.locator(SELECTORS.zafarCallBtn).first();
  await btn.waitFor({ state: 'visible', timeout: timeoutMs });
  await btn.click();
  await waitForAndCloseAdModal(page, { optional: !requireAdModal, timeoutMs });
}

/**
 * Waits for and clicks the Opening Hook Overload skill button.
 */
export async function triggerOverloadSkill(page: Page, timeoutMs = 15000): Promise<void> {
  const btn = page.locator(SELECTORS.overloadSkillBtn).first();
  await btn.waitFor({ state: 'visible', timeout: timeoutMs });
  await expect(btn).toBeEnabled({ timeout: timeoutMs });
  await btn.click();
}

/**
 * Reads the current Opening Hook phase badge text if rendered.
 */
export async function readOpeningPhase(page: Page): Promise<string> {
  const badge = page.locator(SELECTORS.introPhaseBadge).first();
  if ((await badge.count()) === 0) return '';
  if (!(await badge.isVisible().catch(() => false))) return '';
  return ((await badge.textContent()) || '').trim();
}

/**
 * Clicks the Opening Hook skip button and waits for transition into OASIS_HUB.
 */
export async function skipOpeningHook(page: Page, timeoutMs = 5000): Promise<void> {
  const skipBtn = page.locator(SELECTORS.skipIntroBtn).first();
  await skipBtn.waitFor({ state: 'visible', timeout: timeoutMs });
  await skipBtn.click();
  await waitForFsmState(page, 'OASIS_HUB', timeoutMs);
}

/**
 * Reads all currently visible dialogue balloon overlays and their bounding boxes.
 */
export async function readVisibleDialogueBalloons(
  page: Page
): Promise<Array<{ text: string; box: { x: number; y: number; width: number; height: number } | null }>> {
  const balloons = page.locator(SELECTORS.dialogueBubble);
  const count = await balloons.count();
  const visible: Array<{
    text: string;
    box: { x: number; y: number; width: number; height: number } | null;
  }> = [];

  for (let i = 0; i < count; i++) {
    const loc = balloons.nth(i);
    if (await loc.isVisible().catch(() => false)) {
      const text = ((await loc.textContent()) || '').trim();
      const box = await loc.boundingBox();
      visible.push({ text, box });
    }
  }
  return visible;
}

/**
 * Waits until a visible dialogue balloon appears (optionally matching text or RegExp).
 */
export async function waitForDialogueBalloon(
  page: Page,
  match?: string | RegExp,
  timeoutMs = 10000
): Promise<{ text: string; box: { x: number; y: number; width: number; height: number } | null }> {
  let found: { text: string; box: { x: number; y: number; width: number; height: number } | null } | null =
    null;

  await expect
    .poll(
      async () => {
        const list = await readVisibleDialogueBalloons(page);
        const item = match
          ? list.find((b) =>
              typeof match === 'string' ? b.text.includes(match) : match.test(b.text)
            )
          : list[0];
        if (item) {
          found = item;
          return true;
        }
        return false;
      },
      { timeout: timeoutMs }
    )
    .toBe(true);

  if (!found) {
    throw new Error('Dialogue balloon not found within timeout');
  }
  return found;
}

/**
 * Switches to the Trading Post tab and reads specialty name, buy price, and cargo capacity metrics.
 */
export async function readTradePanelState(page: Page): Promise<{
  specialtyName: string;
  buyPrice: number;
  capacityText: string;
  usedCapacity: number;
  maxCapacity: number;
}> {
  await selectDashboardTab(page, 'trading');

  const specialtyLoc = page.locator(SELECTORS.tradeSpecialtyName).first();
  const buyPriceLoc = page.locator(SELECTORS.tradeBuyPrice).first();
  const capacityLoc = page.locator(SELECTORS.tradeCapacityText).first();

  const specialtyName =
    (await specialtyLoc.count()) > 0 ? ((await specialtyLoc.textContent()) || '').trim() : '';
  const priceRaw =
    (await buyPriceLoc.count()) > 0 ? ((await buyPriceLoc.textContent()) || '0').replace(/,/g, '') : '0';
  const priceMatch = priceRaw.match(/\d+/);
  const buyPrice = priceMatch ? parseInt(priceMatch[0], 10) : 0;

  const capacityText =
    (await capacityLoc.count()) > 0 ? ((await capacityLoc.textContent()) || '').trim() : '';
  const capMatch = capacityText.replace(/,/g, '').match(/(\d+)\s*\/\s*(\d+)/);
  const usedCapacity = capMatch ? parseInt(capMatch[1], 10) : 0;
  const maxCapacity = capMatch ? parseInt(capMatch[2], 10) : 0;

  return {
    specialtyName,
    buyPrice,
    capacityText,
    usedCapacity,
    maxCapacity,
  };
}

/**
 * Reads the displayed net profit value from the Oasis Settlement modal.
 */
export async function readSettlementProfit(page: Page): Promise<number> {
  const profitLoc = page.locator(SELECTORS.settlementProfit).first();
  await profitLoc.waitFor({ state: 'visible', timeout: 5000 });
  const raw = ((await profitLoc.textContent()) || '0').replace(/,/g, '');
  const match = raw.match(/-?\d+/);
  return match ? parseInt(match[0], 10) : 0;
}

/**
 * Switches to the Relic & Stele Codex tab and reads relic & stele progress.
 */
export async function readCodexState(page: Page): Promise<{
  relicText: string;
  steleText: string;
  decodedCount: number;
  decodedTotal: number;
  relicCount: number;
}> {
  await selectDashboardTab(page, 'codex');

  const relicLoc = page.locator(SELECTORS.codexRelicList).first();
  const steleLoc = page.locator(SELECTORS.codexSteleList).first();
  const fallbackLoc = page.locator(SELECTORS.zoneCContent).first();

  const relicText =
    (await relicLoc.count()) > 0
      ? ((await relicLoc.textContent()) || '').trim()
      : ((await fallbackLoc.textContent()) || '').trim();
  const steleText =
    (await steleLoc.count()) > 0
      ? ((await steleLoc.textContent()) || '').trim()
      : ((await fallbackLoc.textContent()) || '').trim();

  const steleMatch = steleText.replace(/,/g, '').match(/(\d+)\s*\/\s*(\d+)/);
  const decodedCount = steleMatch ? parseInt(steleMatch[1], 10) : 0;
  const decodedTotal = steleMatch ? parseInt(steleMatch[2], 10) : 12;

  const snap = await readDebugSnapshot(page);
  const relicCountMatch = relicText.replace(/,/g, '').match(/(\d+)\s*종/);
  const relicCount =
    snap?.relics?.codex.length ?? (relicCountMatch ? parseInt(relicCountMatch[1], 10) : 0);

  return {
    relicText,
    steleText,
    decodedCount,
    decodedTotal,
    relicCount,
  };
}

/**
 * Collapses the Developer Debug Bar overlay if currently expanded. Strictly idempotent.
 */
export async function closeDebugBar(page: Page): Promise<void> {
  const bar = page.locator(SELECTORS.debugBar).first();
  if (!(await bar.isVisible().catch(() => false))) {
    return;
  }

  const collapseBtn = bar
    .locator('button:has-text("✕"), [data-testid="debug-toggle-btn"]')
    .first();
  if (await collapseBtn.isVisible().catch(() => false)) {
    await collapseBtn.click();
  } else {
    const toggleBtn = page.locator(SELECTORS.debugToggleBtn).first();
    if (await toggleBtn.isVisible().catch(() => false)) {
      await toggleBtn.click();
    }
  }
  await bar.waitFor({ state: 'hidden', timeout: 5000 });
}
