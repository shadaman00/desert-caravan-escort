import type { AtmosphericPalette } from '../palette';
import { fillBayerDitherRect } from '../pixel/PixelCanvas';

export const ZONE_B_WIDTH = 680;
export const ZONE_B_HEIGHT = 412;
export const PARALLAX_TILE_WIDTH = 1360;
export const PARALLAX_FACTORS = [0.1, 0.3, 0.6, 1.0] as const;

export interface DesertLayerSpec {
  index: 0 | 1 | 2 | 3;
  factor: number;
  y: number;
  height: number;
}

export const DESERT_LAYER_SPECS: readonly DesertLayerSpec[] = [
  { index: 0, factor: 0.1, y: 120, height: 185 },
  { index: 1, factor: 0.3, y: 165, height: 145 },
  { index: 2, factor: 0.6, y: 215, height: 105 },
  { index: 3, factor: 1.0, y: 300, height: 112 },
] as const;

export interface PeriodicHarmonic {
  freq: number;
  amp: number;
  phase: number;
}

export function periodicWave(
  x: number,
  tileWidth: number,
  harmonics: readonly PeriodicHarmonic[]
): number {
  if (tileWidth <= 0) return 0;
  const theta = (x / tileWidth) * Math.PI * 2;
  let sum = 0;
  for (let i = 0; i < harmonics.length; i++) {
    const h = harmonics[i];
    sum += h.amp * Math.sin(h.freq * theta + h.phase);
  }
  return sum;
}

const NIGHT_STARS: readonly { x: number; y: number; r: number; a: number }[] = [
  { x: 42, y: 20, r: 1.1, a: 0.8 },
  { x: 96, y: 44, r: 0.9, a: 0.65 },
  { x: 148, y: 16, r: 1.3, a: 0.9 },
  { x: 205, y: 58, r: 0.8, a: 0.6 },
  { x: 256, y: 28, r: 1.2, a: 0.75 },
  { x: 304, y: 74, r: 1.0, a: 0.55 },
  { x: 358, y: 18, r: 1.4, a: 0.85 },
  { x: 408, y: 50, r: 0.9, a: 0.7 },
  { x: 462, y: 24, r: 1.1, a: 0.75 },
  { x: 518, y: 38, r: 1.3, a: 0.9 },
  { x: 594, y: 82, r: 0.9, a: 0.5 },
  { x: 642, y: 32, r: 1.0, a: 0.65 },
  { x: 84, y: 92, r: 0.9, a: 0.5 },
  { x: 382, y: 98, r: 1.1, a: 0.5 },
];

export function drawSkyBackdrop(
  ctx: CanvasRenderingContext2D,
  palette: AtmosphericPalette,
  width = ZONE_B_WIDTH,
  groundY = 308
): void {
  ctx.save();

  const skyGrad = ctx.createLinearGradient(0, 0, 0, groundY);
  skyGrad.addColorStop(0, palette.skyTop);
  skyGrad.addColorStop(0.58, palette.skyMid);
  skyGrad.addColorStop(1, palette.skyBottom);
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, width, ZONE_B_HEIGHT);

  if (palette.starsAlpha > 0.01) {
    ctx.fillStyle = '#e2e8f0';
    for (let i = 0; i < NIGHT_STARS.length; i++) {
      const s = NIGHT_STARS[i];
      ctx.globalAlpha = s.a * palette.starsAlpha * palette.celestialAlpha;
      const sx = Math.round(s.x / 2) * 2;
      const sy = Math.round(s.y / 2) * 2;
      ctx.fillRect(sx, sy, 2, 2);
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Celestial body (Sun or Moon)
  const cx = 540;
  const cy = 62;
  const glowGrad = ctx.createRadialGradient(cx, cy, 8, cx, cy, 52);
  glowGrad.addColorStop(0, palette.celestialGlow);
  glowGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.globalAlpha = 0.35 * palette.celestialAlpha;
  ctx.fillStyle = glowGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, 52, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalAlpha = palette.celestialAlpha;
  ctx.fillStyle = palette.celestialBody;
  ctx.beginPath();
  ctx.arc(cx, cy, 22, 0, Math.PI * 2);
  ctx.fill();

  // Subtle horizon atmospheric haze dither (grounded at horizon y=224..248, never floating across upper sky)
  ctx.globalAlpha = 0.12 + palette.sandHazeAlpha * 0.15;
  fillBayerDitherRect(ctx, 0, 224, width, 24, palette.skyBottom, palette.sandHaze, 0.32, 2);

  // Horizon atmospheric haze band
  const hazeGrad = ctx.createLinearGradient(0, 210, 0, groundY + 10);
  hazeGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
  hazeGrad.addColorStop(1, palette.sandHaze);
  ctx.globalAlpha = palette.sandHazeAlpha;
  ctx.fillStyle = hazeGrad;
  ctx.fillRect(0, 210, width, groundY - 200);

  ctx.restore();
}

const FAR_DUNE_HARMONICS: readonly PeriodicHarmonic[] = [
  { freq: 1, amp: 14, phase: 0.4 },
  { freq: 2, amp: 8, phase: 1.7 },
  { freq: 3, amp: 4, phase: 2.9 },
];

const MID_DUNE_BACK_HARMONICS: readonly PeriodicHarmonic[] = [
  { freq: 2, amp: 16, phase: 0.8 },
  { freq: 3, amp: 9, phase: 2.1 },
  { freq: 5, amp: 4, phase: 0.2 },
];

const MID_DUNE_FRONT_HARMONICS: readonly PeriodicHarmonic[] = [
  { freq: 2, amp: 12, phase: 2.4 },
  { freq: 4, amp: 6, phase: 0.9 },
];

const NEAR_RIDGE_HARMONICS: readonly PeriodicHarmonic[] = [
  { freq: 3, amp: 13, phase: 1.1 },
  { freq: 5, amp: 7, phase: 2.6 },
  { freq: 7, amp: 4, phase: 0.3 },
];

const FOREGROUND_RIPPLE_HARMONICS: readonly PeriodicHarmonic[] = [
  { freq: 6, amp: 4.5, phase: 0.5 },
  { freq: 10, amp: 2.2, phase: 1.9 },
];

function fillPeriodicSilhouette(
  ctx: CanvasRenderingContext2D,
  tileWidth: number,
  height: number,
  baseY: number,
  harmonics: readonly PeriodicHarmonic[],
  fillStyle: string | CanvasGradient,
  targetStep = 5
): void {
  if (tileWidth <= 0) return;
  const segments = Math.max(4, Math.round(tileWidth / Math.max(1, targetStep)));
  const step = tileWidth / segments;
  const path = new Path2D();
  path.moveTo(-step, height);
  for (let k = -1; k <= segments + 1; k++) {
    const x = k === 0 ? 0 : k === segments ? tileWidth : (k * tileWidth) / segments;
    const kMod = ((k % segments) + segments) % segments;
    const sampleX = (kMod * tileWidth) / segments;
    const y = baseY + periodicWave(sampleX, tileWidth, harmonics);
    path.lineTo(x, y);
  }
  path.lineTo(tileWidth + step, height);
  path.closePath();
  ctx.fillStyle = fillStyle;
  ctx.fill(path);
}

function drawPyramid(
  ctx: CanvasRenderingContext2D,
  apexX: number,
  apexY: number,
  halfWidth: number,
  baseY: number,
  litColor: string,
  shadowColor: string
): void {
  const leftFacet = new Path2D();
  leftFacet.moveTo(apexX, apexY);
  leftFacet.lineTo(apexX - halfWidth, baseY);
  leftFacet.lineTo(apexX + halfWidth * 0.14, baseY);
  leftFacet.closePath();
  ctx.fillStyle = litColor;
  ctx.fill(leftFacet);

  const rightFacet = new Path2D();
  rightFacet.moveTo(apexX, apexY);
  rightFacet.lineTo(apexX + halfWidth * 0.14, baseY);
  rightFacet.lineTo(apexX + halfWidth, baseY);
  rightFacet.closePath();
  ctx.fillStyle = shadowColor;
  ctx.fill(rightFacet);
}

export function renderLayer0FarDunes(
  ctx: CanvasRenderingContext2D,
  palette: AtmosphericPalette,
  tileWidth = PARALLAX_TILE_WIDTH,
  height = DESERT_LAYER_SPECS[0].height
): void {
  ctx.save();
  ctx.clearRect(0, 0, tileWidth, height);

  // Great pyramids strictly interior to 1360px tile bounds for zero seam wrapping
  drawPyramid(ctx, 180, 26, 68, 132, palette.farDune, palette.farDuneAccent);
  drawPyramid(ctx, 360, 56, 46, 132, palette.farDune, palette.farDuneAccent);
  drawPyramid(ctx, 680, 20, 78, 134, palette.farDune, palette.farDuneAccent);
  drawPyramid(ctx, 1060, 40, 60, 132, palette.farDune, palette.farDuneAccent);

  const duneGrad = ctx.createLinearGradient(0, 75, 0, height);
  duneGrad.addColorStop(0, palette.farDune);
  duneGrad.addColorStop(1, palette.farDuneAccent);
  fillPeriodicSilhouette(ctx, tileWidth, height, 98, FAR_DUNE_HARMONICS, duneGrad);

  // Subtle atmospheric depth veil to separate far background from combat plane
  ctx.globalAlpha = 0.12 + palette.sandHazeAlpha * 0.2;
  ctx.fillStyle = palette.sandHaze;
  ctx.fillRect(0, 96, tileWidth, height - 96);

  ctx.restore();
}

function drawRuinProp(
  ctx: CanvasRenderingContext2D,
  x: number,
  baseY: number,
  variant: 'obelisk' | 'arch',
  color: string
): void {
  const path = new Path2D();
  if (variant === 'obelisk') {
    path.moveTo(x - 6, baseY);
    path.lineTo(x - 4, baseY - 38);
    path.lineTo(x, baseY - 46);
    path.lineTo(x + 4, baseY - 38);
    path.lineTo(x + 6, baseY);
    path.closePath();
  } else {
    // Broken twin arch pillars + lintel
    path.rect(x - 16, baseY - 30, 7, 30);
    path.rect(x + 9, baseY - 28, 7, 28);
    path.rect(x - 19, baseY - 35, 38, 6);
  }
  ctx.fillStyle = color;
  ctx.fill(path);
}

export function renderLayer1MidDunesRuins(
  ctx: CanvasRenderingContext2D,
  palette: AtmosphericPalette,
  tileWidth = PARALLAX_TILE_WIDTH,
  height = DESERT_LAYER_SPECS[1].height
): void {
  ctx.save();
  ctx.clearRect(0, 0, tileWidth, height);

  const backGrad = ctx.createLinearGradient(0, 32, 0, height);
  backGrad.addColorStop(0, palette.midDune);
  backGrad.addColorStop(1, palette.farDuneAccent);
  fillPeriodicSilhouette(ctx, tileWidth, height, 58, MID_DUNE_BACK_HARMONICS, backGrad);

  // Ancient desert ruins placed clear of tile seam boundaries
  drawRuinProp(ctx, 130, 76, 'obelisk', palette.midRuins);
  drawRuinProp(ctx, 420, 74, 'arch', palette.midRuins);
  drawRuinProp(ctx, 790, 78, 'obelisk', palette.midRuins);
  drawRuinProp(ctx, 1140, 72, 'arch', palette.midRuins);

  const frontGrad = ctx.createLinearGradient(0, 62, 0, height);
  frontGrad.addColorStop(0, palette.midDune);
  frontGrad.addColorStop(1, palette.midRuins);
  fillPeriodicSilhouette(ctx, tileWidth, height, 82, MID_DUNE_FRONT_HARMONICS, frontGrad);

  ctx.globalAlpha = 0.08 + palette.sandHazeAlpha * 0.12;
  ctx.fillStyle = palette.sandHaze;
  ctx.fillRect(0, 96, tileWidth, height - 96);

  ctx.restore();
}

function drawCactus(
  ctx: CanvasRenderingContext2D,
  x: number,
  baseY: number,
  scale: number,
  color: string
): void {
  const path = new Path2D();
  const stemW = 4 * scale;
  const stemH = 22 * scale;
  path.rect(x - stemW * 0.5, baseY - stemH, stemW, stemH);
  // Left arm
  path.rect(x - 9 * scale, baseY - 15 * scale, 7 * scale, 3 * scale);
  path.rect(x - 9 * scale, baseY - 21 * scale, 3 * scale, 9 * scale);
  // Right arm
  path.rect(x + 2 * scale, baseY - 12 * scale, 7 * scale, 3 * scale);
  path.rect(x + 6 * scale, baseY - 19 * scale, 3 * scale, 10 * scale);
  ctx.fillStyle = color;
  ctx.fill(path);
}

function drawBoulder(
  ctx: CanvasRenderingContext2D,
  x: number,
  baseY: number,
  w: number,
  h: number,
  color: string
): void {
  const path = new Path2D();
  path.moveTo(x - w * 0.5, baseY);
  path.lineTo(x - w * 0.35, baseY - h * 0.75);
  path.lineTo(x + w * 0.1, baseY - h);
  path.lineTo(x + w * 0.45, baseY - h * 0.55);
  path.lineTo(x + w * 0.5, baseY);
  path.closePath();
  ctx.fillStyle = color;
  ctx.fill(path);
}

export function renderLayer2NearRidges(
  ctx: CanvasRenderingContext2D,
  palette: AtmosphericPalette,
  tileWidth = PARALLAX_TILE_WIDTH,
  height = DESERT_LAYER_SPECS[2].height
): void {
  ctx.save();
  ctx.clearRect(0, 0, tileWidth, height);

  // Jagged sandstone ridge (exact periodic grid so x = 0 and x = tileWidth are vertices)
  const segments = Math.max(4, Math.round(tileWidth / 10));
  const step = tileWidth / segments;
  const ridgePath = new Path2D();
  ridgePath.moveTo(-step, height);
  for (let k = -1; k <= segments + 1; k++) {
    const x = k === 0 ? 0 : k === segments ? tileWidth : (k * tileWidth) / segments;
    const kMod = ((k % segments) + segments) % segments;
    const sampleX = (kMod * tileWidth) / segments;
    const wave = periodicWave(sampleX, tileWidth, NEAR_RIDGE_HARMONICS);
    const quant = Math.round(wave / 3) * 3;
    ridgePath.lineTo(x, 52 + quant);
  }
  ridgePath.lineTo(tileWidth + step, height);
  ridgePath.closePath();
  ctx.fillStyle = palette.nearRidge;
  ctx.fill(ridgePath);

  // Cacti and sandstone boulders strictly clear of [0, tileWidth] seam
  const cactiPositions = [85, 290, 520, 750, 990, 1240];
  for (let i = 0; i < cactiPositions.length; i++) {
    const cx = cactiPositions[i];
    const ridgeY = 52 + periodicWave(cx, tileWidth, NEAR_RIDGE_HARMONICS);
    drawCactus(ctx, cx, ridgeY + 6, i % 2 === 0 ? 1.0 : 0.85, palette.nearCactus);
    if (i % 2 === 1) {
      drawBoulder(ctx, cx + 22, ridgeY + 12, 18, 11, palette.nearRidge);
    }
  }

  ctx.restore();
}

export function renderLayer3ForegroundSand(
  ctx: CanvasRenderingContext2D,
  palette: AtmosphericPalette,
  tileWidth = PARALLAX_TILE_WIDTH,
  height = DESERT_LAYER_SPECS[3].height
): void {
  ctx.save();
  ctx.clearRect(0, 0, tileWidth, height);

  const groundGrad = ctx.createLinearGradient(0, 0, 0, height);
  groundGrad.addColorStop(0, palette.fgSandTop);
  groundGrad.addColorStop(1, palette.fgSandBottom);
  ctx.fillStyle = groundGrad;
  ctx.fillRect(0, 0, tileWidth, height);

  // Top rim highlight
  ctx.fillStyle = palette.sandHaze;
  ctx.globalAlpha = 0.28;
  ctx.fillRect(0, 0, tileWidth, 3);

  // Calm periodic horizontal sand ripples (exact periodic grid across [0, tileWidth])
  ctx.globalAlpha = 0.26;
  ctx.strokeStyle = palette.fgTrack;
  ctx.lineWidth = 2;
  const rippleRows = [22, 54, 86];
  const rippleSegments = Math.max(4, Math.round(tileWidth / 5));
  for (let r = 0; r < rippleRows.length; r++) {
    const ripple = new Path2D();
    const rowY = rippleRows[r];
    for (let k = -1; k <= rippleSegments + 1; k++) {
      const x = k === 0 ? 0 : k === rippleSegments ? tileWidth : (k * tileWidth) / rippleSegments;
      const kMod = ((k % rippleSegments) + rippleSegments) % rippleSegments;
      const sampleX = (kMod * tileWidth) / rippleSegments;
      const y = rowY + periodicWave(sampleX + r * 60, tileWidth, FOREGROUND_RIPPLE_HARMONICS);
      if (k === -1) ripple.moveTo(x, y);
      else ripple.lineTo(x, y);
    }
    ctx.stroke(ripple);
  }

  // Exact integer divisor step (1360 / 40 = 34) for zero-seam low-noise sand pebbles
  ctx.globalAlpha = 0.28;
  ctx.fillStyle = palette.fgTrack;
  const trackStep = 40;
  for (let x = 0; x < tileWidth; x += trackStep) {
    ctx.fillRect(x + 8, 34, 8, 2);
    ctx.fillRect(x + 24, 68, 6, 2);
    ctx.fillRect(x + 32, 46, 3, 2);
  }

  ctx.restore();
}

export function renderLayerToContext(
  index: 0 | 1 | 2 | 3,
  ctx: CanvasRenderingContext2D,
  palette: AtmosphericPalette,
  tileWidth = PARALLAX_TILE_WIDTH,
  height = DESERT_LAYER_SPECS[index].height
): void {
  switch (index) {
    case 0:
      renderLayer0FarDunes(ctx, palette, tileWidth, height);
      break;
    case 1:
      renderLayer1MidDunesRuins(ctx, palette, tileWidth, height);
      break;
    case 2:
      renderLayer2NearRidges(ctx, palette, tileWidth, height);
      break;
    case 3:
      renderLayer3ForegroundSand(ctx, palette, tileWidth, height);
      break;
  }
}
