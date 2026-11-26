import {
  BIOME_FADE_DISTANCE_M,
  BIOME_TABLE,
  EXPEDITION_TOTAL_DISTANCE_M,
  QUICKSAND_PENALTY,
} from '@/data/masterData';

export interface BiomeRenderState {
  biomeIndex: 0 | 1 | 2 | 3;
  biomeId: string;
  biomeName: string;
  nextBiomeName: string | null;
  distanceMeters: number;
  skyTopHex: string;
  skyBottomHex: string;
  groundHex: string;
  accentGroundHex: string;
  hasQuicksand: boolean;
  quicksandPenalty: number;
  isSandstorm: boolean;
  vignetteAlpha: number;
  stormParticleTarget: number;
  isSinkholeZone: boolean;
  blendFactor: number;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function parseHexColor(hex: string): [number, number, number] {
  const clean = hex.replace('#', '').trim();
  if (clean.length !== 6) return [0, 0, 0];
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return [0, 0, 0];
  return [r, g, b];
}

function toHexByte(n: number): string {
  return Math.min(255, Math.max(0, Math.round(n)))
    .toString(16)
    .padStart(2, '0');
}

export function lerpHexColor(hexA: string, hexB: string, t: number): string {
  const f = clamp01(t);
  const [r1, g1, b1] = parseHexColor(hexA);
  const [r2, g2, b2] = parseHexColor(hexB);
  const r = r1 + (r2 - r1) * f;
  const g = g1 + (g2 - g1) * f;
  const b = b1 + (b2 - b1) * f;
  return `#${toHexByte(r)}${toHexByte(g)}${toHexByte(b)}`.toUpperCase();
}

/**
 * Pure deterministic Biome controller evaluating distance (0 ~ 2,000m)
 * with smooth RGB Lerp over d_fade = 80m prior to each 500m biome boundary.
 * Strictly zero DOM/Canvas imports (PRD Section 2.2 SRP).
 */
export class BiomeSystem {
  public evaluate(distanceMeters: number): BiomeRenderState {
    const safeDist = Number.isFinite(distanceMeters)
      ? Math.min(EXPEDITION_TOTAL_DISTANCE_M, Math.max(0, distanceMeters))
      : 0;

    let idx: 0 | 1 | 2 | 3 = 0;
    if (safeDist >= 1500) idx = 3;
    else if (safeDist >= 1000) idx = 2;
    else if (safeDist >= 500) idx = 1;

    const current = BIOME_TABLE[idx];
    const next = idx < 3 ? BIOME_TABLE[idx + 1] : null;

    let blend = 0;
    if (next) {
      const fadeStart = current.endMeters - BIOME_FADE_DISTANCE_M;
      blend = clamp01((safeDist - fadeStart) / BIOME_FADE_DISTANCE_M);
    }

    const skyTopHex = next
      ? lerpHexColor(current.skyTopHex, next.skyTopHex, blend)
      : current.skyTopHex;
    const skyBottomHex = next
      ? lerpHexColor(current.skyBottomHex, next.skyBottomHex, blend)
      : current.skyBottomHex;
    const groundHex = next
      ? lerpHexColor(current.groundHex, next.groundHex, blend)
      : current.groundHex;
    const accentGroundHex = next
      ? lerpHexColor(current.accentGroundHex, next.accentGroundHex, blend)
      : current.accentGroundHex;

    const vignetteAlpha = next
      ? current.vignetteAlpha + (next.vignetteAlpha - current.vignetteAlpha) * blend
      : current.vignetteAlpha;
    const stormParticleTarget = Math.round(
      next
        ? current.stormParticleTarget +
            (next.stormParticleTarget - current.stormParticleTarget) * blend
        : current.stormParticleTarget
    );

    const effectiveBiome = next && blend >= 0.5 ? next : current;

    return {
      biomeIndex: current.index,
      biomeId: current.id,
      biomeName: current.name,
      nextBiomeName: next ? next.name : null,
      distanceMeters: safeDist,
      skyTopHex,
      skyBottomHex,
      groundHex,
      accentGroundHex,
      hasQuicksand: effectiveBiome.hasQuicksand,
      quicksandPenalty: effectiveBiome.hasQuicksand ? QUICKSAND_PENALTY : 0,
      isSandstorm: effectiveBiome.isSandstorm || vignetteAlpha > 0.15,
      vignetteAlpha: Math.round(vignetteAlpha * 1000) / 1000,
      stormParticleTarget,
      isSinkholeZone: effectiveBiome.isSinkholeZone,
      blendFactor: Math.round(blend * 1000) / 1000,
    };
  }
}
