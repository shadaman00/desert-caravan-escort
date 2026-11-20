import type { TimeOfDay } from '@/store/types';
import type { GameStateId } from '@/engine/fsm/GameFSM';

export interface RgbColor {
  r: number;
  g: number;
  b: number;
}

export interface HslColor {
  h: number;
  s: number;
  l: number;
}

export interface AtmosphericPalette {
  id: TimeOfDay;
  skyTop: string;
  skyMid: string;
  skyBottom: string;
  celestialBody: string;
  celestialGlow: string;
  celestialAlpha: number;
  farDune: string;
  farDuneAccent: string;
  midDune: string;
  midRuins: string;
  nearRidge: string;
  nearCactus: string;
  fgSandTop: string;
  fgSandBottom: string;
  fgTrack: string;
  sandHaze: string;
  sandHazeAlpha: number;
  ambientTint: string;
  ambientTintAlpha: number;
  starsAlpha: number;
  stormParticleMultiplier: number;
}

export const PALETTE_LERP_DURATION = 2.0;

export const PALETTES: Record<TimeOfDay, AtmosphericPalette> = {
  DAY: {
    id: 'DAY',
    skyTop: '#2b6cb0',
    skyMid: '#63b3ed',
    skyBottom: '#fbd38d',
    celestialBody: '#fffaf0',
    celestialGlow: '#fefcbf',
    celestialAlpha: 1.0,
    farDune: '#d69e66',
    farDuneAccent: '#b77942',
    midDune: '#e09f5a',
    midRuins: '#b57c4a',
    nearRidge: '#c07438',
    nearCactus: '#5f7344',
    fgSandTop: '#d99b52',
    fgSandBottom: '#a86832',
    fgTrack: '#945827',
    sandHaze: '#fef3c7',
    sandHazeAlpha: 0.18,
    ambientTint: '#fffbeb',
    ambientTintAlpha: 0.08,
    starsAlpha: 0,
    stormParticleMultiplier: 1.0,
  },
  DUSK: {
    id: 'DUSK',
    skyTop: '#1a1630',
    skyMid: '#6b2d46',
    skyBottom: '#dd6b20',
    celestialBody: '#ffcc66',
    celestialGlow: '#ed8936',
    celestialAlpha: 0.95,
    farDune: '#6e342d',
    farDuneAccent: '#522320',
    midDune: '#8c3f2b',
    midRuins: '#592822',
    nearRidge: '#612a1f',
    nearCactus: '#38201e',
    fgSandTop: '#9c4e2e',
    fgSandBottom: '#612c1a',
    fgTrack: '#4f2213',
    sandHaze: '#f6ad55',
    sandHazeAlpha: 0.26,
    ambientTint: '#f6ad55',
    ambientTintAlpha: 0.18,
    starsAlpha: 0,
    stormParticleMultiplier: 1.0,
  },
  NIGHT: {
    id: 'NIGHT',
    skyTop: '#090b16',
    skyMid: '#141b33',
    skyBottom: '#253252',
    celestialBody: '#e2e8f0',
    celestialGlow: '#90cdf4',
    celestialAlpha: 0.9,
    farDune: '#1e2842',
    farDuneAccent: '#141c30',
    midDune: '#273452',
    midRuins: '#1a233a',
    nearRidge: '#1b243b',
    nearCactus: '#12192b',
    fgSandTop: '#32405e',
    fgSandBottom: '#1c253b',
    fgTrack: '#151c2e',
    sandHaze: '#63b3ed',
    sandHazeAlpha: 0.14,
    ambientTint: '#4299e1',
    ambientTintAlpha: 0.24,
    starsAlpha: 1.0,
    stormParticleMultiplier: 1.0,
  },
  STORM: {
    id: 'STORM',
    skyTop: '#2b1810',
    skyMid: '#5c3018',
    skyBottom: '#8c4c26',
    celestialBody: '#fbd38d',
    celestialGlow: '#c05621',
    celestialAlpha: 0.35,
    farDune: '#6e3c20',
    farDuneAccent: '#522b16',
    midDune: '#7d4525',
    midRuins: '#4f2a15',
    nearRidge: '#592e18',
    nearCactus: '#3d1f10',
    fgSandTop: '#8a4f2b',
    fgSandBottom: '#593018',
    fgTrack: '#452411',
    sandHaze: '#d97736',
    sandHazeAlpha: 0.48,
    ambientTint: '#dd6b20',
    ambientTintAlpha: 0.3,
    starsAlpha: 0,
    stormParticleMultiplier: 3.0,
  },
};

export function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  if (value >= 1) return 1;
  if (value <= 0) return 0;
  return value;
}

export function hexToRgb(hex: string): RgbColor {
  const cleaned = hex.trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{3}$/.test(cleaned)) {
    const r = parseInt(cleaned[0] + cleaned[0], 16);
    const g = parseInt(cleaned[1] + cleaned[1], 16);
    const b = parseInt(cleaned[2] + cleaned[2], 16);
    return { r, g, b };
  }
  if (/^[0-9a-fA-F]{6}$/.test(cleaned)) {
    const r = parseInt(cleaned.slice(0, 2), 16);
    const g = parseInt(cleaned.slice(2, 4), 16);
    const b = parseInt(cleaned.slice(4, 6), 16);
    return { r, g, b };
  }
  return { r: 0, g: 0, b: 0 };
}

export function rgbToHex(rgb: RgbColor): string {
  const toHex = (c: number) =>
    Math.round(Math.max(0, Math.min(255, Number.isFinite(c) ? c : 0)))
      .toString(16)
      .padStart(2, '0');
  return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`;
}

export function lerpColorRgb(hexA: string, hexB: string, t: number): string {
  const u = clamp01(t);
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  return rgbToHex({
    r: a.r + (b.r - a.r) * u,
    g: a.g + (b.g - a.g) * u,
    b: a.b + (b.b - a.b) * u,
  });
}

export function rgbToHsl(rgb: RgbColor): HslColor {
  const r = Math.max(0, Math.min(255, rgb.r)) / 255;
  const g = Math.max(0, Math.min(255, rgb.g)) / 255;
  const b = Math.max(0, Math.min(255, rgb.b)) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;

  if (max === min) {
    return { h: 0, s: 0, l };
  }

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) {
    h = (g - b) / d + (g < b ? 6 : 0);
  } else if (max === g) {
    h = (b - r) / d + 2;
  } else {
    h = (r - g) / d + 4;
  }
  h *= 60;
  return { h, s, l };
}

export function hslToRgb(hsl: HslColor): RgbColor {
  const h = (((hsl.h % 360) + 360) % 360) / 360;
  const s = clamp01(hsl.s);
  const l = clamp01(hsl.l);

  if (s === 0) {
    const v = l * 255;
    return { r: v, g: v, b: v };
  }

  const hue2rgb = (p: number, q: number, t: number): number => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return {
    r: hue2rgb(p, q, h + 1 / 3) * 255,
    g: hue2rgb(p, q, h) * 255,
    b: hue2rgb(p, q, h - 1 / 3) * 255,
  };
}

export function lerpColorHsl(hexA: string, hexB: string, t: number): string {
  const u = clamp01(t);
  const a = rgbToHsl(hexToRgb(hexA));
  const b = rgbToHsl(hexToRgb(hexB));

  let h: number;
  if (a.s === 0) {
    h = b.h;
  } else if (b.s === 0) {
    h = a.h;
  } else {
    const dh = ((b.h - a.h + 540) % 360) - 180;
    h = (a.h + dh * u + 360) % 360;
  }

  return rgbToHex(
    hslToRgb({
      h,
      s: a.s + (b.s - a.s) * u,
      l: a.l + (b.l - a.l) * u,
    })
  );
}

export function lerpPalette(
  from: AtmosphericPalette,
  to: AtmosphericPalette,
  t: number,
  mode: 'rgb' | 'hsl' = 'rgb'
): AtmosphericPalette {
  const u = clamp01(t);
  const lerpColor = mode === 'hsl' ? lerpColorHsl : lerpColorRgb;
  const lerpNum = (a: number, b: number) => a + (b - a) * u;

  return {
    id: u >= 0.5 ? to.id : from.id,
    skyTop: lerpColor(from.skyTop, to.skyTop, u),
    skyMid: lerpColor(from.skyMid, to.skyMid, u),
    skyBottom: lerpColor(from.skyBottom, to.skyBottom, u),
    celestialBody: lerpColor(from.celestialBody, to.celestialBody, u),
    celestialGlow: lerpColor(from.celestialGlow, to.celestialGlow, u),
    celestialAlpha: lerpNum(from.celestialAlpha, to.celestialAlpha),
    farDune: lerpColor(from.farDune, to.farDune, u),
    farDuneAccent: lerpColor(from.farDuneAccent, to.farDuneAccent, u),
    midDune: lerpColor(from.midDune, to.midDune, u),
    midRuins: lerpColor(from.midRuins, to.midRuins, u),
    nearRidge: lerpColor(from.nearRidge, to.nearRidge, u),
    nearCactus: lerpColor(from.nearCactus, to.nearCactus, u),
    fgSandTop: lerpColor(from.fgSandTop, to.fgSandTop, u),
    fgSandBottom: lerpColor(from.fgSandBottom, to.fgSandBottom, u),
    fgTrack: lerpColor(from.fgTrack, to.fgTrack, u),
    sandHaze: lerpColor(from.sandHaze, to.sandHaze, u),
    sandHazeAlpha: lerpNum(from.sandHazeAlpha, to.sandHazeAlpha),
    ambientTint: lerpColor(from.ambientTint, to.ambientTint, u),
    ambientTintAlpha: lerpNum(from.ambientTintAlpha, to.ambientTintAlpha),
    starsAlpha: lerpNum(from.starsAlpha, to.starsAlpha),
    stormParticleMultiplier: lerpNum(
      from.stormParticleMultiplier,
      to.stormParticleMultiplier
    ),
  };
}

export interface PaletteLayerOverlay {
  id: TimeOfDay;
  alpha: number;
}

export interface PaletteLayerBlend {
  baseId: TimeOfDay;
  overlays: PaletteLayerOverlay[];
}

export class PaletteController {
  private fromPalette: AtmosphericPalette;
  private toPalette: AtmosphericPalette;
  private currentPalette: AtmosphericPalette;
  private elapsed = 0;
  private readonly duration: number;
  private transitioning = false;
  private layerBaseId: TimeOfDay;
  private layerBaseOverlays: PaletteLayerOverlay[] = [];

  constructor(initial: TimeOfDay = 'DAY', duration = PALETTE_LERP_DURATION) {
    this.fromPalette = { ...PALETTES[initial] };
    this.toPalette = { ...PALETTES[initial] };
    this.currentPalette = { ...PALETTES[initial] };
    this.duration = Number.isFinite(duration) ? duration : PALETTE_LERP_DURATION;
    this.layerBaseId = initial;
  }

  public setTarget(target: TimeOfDay, immediate = false): boolean {
    if (target === this.toPalette.id && !immediate) {
      return false;
    }

    const nextPalette = PALETTES[target];
    if (immediate || this.duration <= 0) {
      this.fromPalette = { ...nextPalette };
      this.toPalette = { ...nextPalette };
      this.currentPalette = { ...nextPalette };
      this.elapsed = this.duration;
      this.transitioning = false;
      this.layerBaseId = target;
      this.layerBaseOverlays = [];
      return true;
    }

    const prevBlend = this.getLayerBlend();
    this.layerBaseId = prevBlend.baseId;
    this.layerBaseOverlays = prevBlend.overlays;

    this.fromPalette = { ...this.currentPalette };
    this.toPalette = { ...nextPalette };
    this.elapsed = 0;
    this.transitioning = true;
    return true;
  }

  public update(dt: number): AtmosphericPalette {
    if (!this.transitioning) {
      return this.currentPalette;
    }
    if (!Number.isFinite(dt) || dt <= 0) {
      return this.currentPalette;
    }

    if (this.duration <= 0) {
      this.currentPalette = { ...this.toPalette };
      this.transitioning = false;
      this.layerBaseId = this.toPalette.id;
      this.layerBaseOverlays = [];
      return this.currentPalette;
    }

    this.elapsed = Math.min(this.duration, this.elapsed + dt);
    const t = clamp01(this.elapsed / this.duration);
    this.currentPalette = lerpPalette(this.fromPalette, this.toPalette, t, 'rgb');

    if (t >= 1) {
      this.currentPalette = { ...this.toPalette };
      this.transitioning = false;
      this.layerBaseId = this.toPalette.id;
      this.layerBaseOverlays = [];
    }

    return this.currentPalette;
  }

  public getCurrent(): AtmosphericPalette {
    return this.currentPalette;
  }

  public getTargetId(): TimeOfDay {
    return this.toPalette.id;
  }

  public getFromId(): TimeOfDay {
    return this.fromPalette.id;
  }

  public getLayerBlend(): PaletteLayerBlend {
    if (!this.transitioning || this.duration <= 0) {
      return { baseId: this.toPalette.id, overlays: [] };
    }
    const p = this.getProgress();
    if (p >= 1) {
      return { baseId: this.toPalette.id, overlays: [] };
    }

    const overlays: PaletteLayerOverlay[] = [];
    const fadeOut = 1 - p;
    for (let i = 0; i < this.layerBaseOverlays.length; i++) {
      const ov = this.layerBaseOverlays[i];
      const scaledAlpha = ov.alpha * fadeOut;
      if (scaledAlpha > 0.001) {
        overlays.push({ id: ov.id, alpha: scaledAlpha });
      }
    }
    if (p > 0.001) {
      overlays.push({ id: this.toPalette.id, alpha: p });
    }

    return {
      baseId: this.layerBaseId,
      overlays,
    };
  }

  public getProgress(): number {
    if (!this.transitioning || this.duration <= 0) return 1;
    return clamp01(this.elapsed / this.duration);
  }

  public isTransitioning(): boolean {
    return this.transitioning;
  }
}

export interface PaletteMappingInput {
  fsmStateId: GameStateId | null;
  currentAct: number;
  currentOasisIndex: number;
  routeProgress: number;
  isSandstormActive: boolean;
  openingElapsedSeconds?: number;
  overrideTimeOfDay?: TimeOfDay | null;
}

export function resolveTargetPalette(input: PaletteMappingInput): TimeOfDay {
  if (input.overrideTimeOfDay) return input.overrideTimeOfDay;
  if (input.isSandstormActive) return 'STORM';

  switch (input.fsmStateId) {
    case 'OPENING_HOOK': {
      const t = Number.isFinite(input.openingElapsedSeconds)
        ? input.openingElapsedSeconds!
        : 0;
      if (t < 30) return 'NIGHT';
      if (t < 75) return 'STORM';
      return 'DAY';
    }
    case 'OASIS_HUB':
    case 'OASIS_SETTLEMENT': {
      if (input.currentAct === 2) return 'DUSK';
      if (input.currentAct === 3) return 'NIGHT';
      if (input.currentAct >= 4) return 'DUSK';
      return 'DAY';
    }
    case 'BOSS_ENCOUNTER': {
      if (input.currentAct >= 4) return 'STORM';
      if (input.currentAct === 3) return 'NIGHT';
      return 'DUSK';
    }
    case 'HAZARD_ZONE': {
      return input.currentAct >= 2 ? 'DUSK' : 'DAY';
    }
    case 'MARCH_NORMAL':
    case 'EMERGENCY_REVIVE':
    default: {
      const p = Number.isFinite(input.routeProgress) ? input.routeProgress : 0;
      if (input.currentAct === 1) return p >= 60 ? 'DUSK' : 'DAY';
      if (input.currentAct === 2) return p >= 50 ? 'NIGHT' : 'DUSK';
      if (input.currentAct === 3) return 'NIGHT';
      return p >= 70 ? 'STORM' : 'DUSK';
    }
  }
}
