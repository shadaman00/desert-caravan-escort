export const PIXEL_BUFFER_WIDTH = 340;
export const PIXEL_BUFFER_HEIGHT = 206;
export const PIXEL_UPSCALE = 2;

/**
 * 4x4 normalized Bayer ordered dithering matrix (values 0..15).
 */
export const BAYER_4X4: readonly (readonly [number, number, number, number])[] = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

export interface PixelPoint {
  readonly x: number;
  readonly y: number;
}

export interface CompiledPixelRun {
  readonly x: number;
  readonly y: number;
  readonly color: string;
}

export interface CompiledPixelSprite {
  readonly width: number;
  readonly height: number;
  readonly pixels: readonly CompiledPixelRun[];
  canvas: HTMLCanvasElement | null;
  bakeAttempted: boolean;
}

/**
 * Evaluates 4x4 Bayer ordered dithering threshold for grid coordinate (px, py).
 */
export function shouldDitherPixel(px: number, py: number, ratio: number): boolean {
  if (!Number.isFinite(ratio) || ratio <= 0) return false;
  if (ratio >= 1) return true;
  const mx = ((Math.floor(px) % 4) + 4) % 4;
  const my = ((Math.floor(py) % 4) + 4) % 4;
  const threshold = (BAYER_4X4[my][mx] + 0.5) / 16;
  return ratio > threshold;
}

/**
 * Renders a Bayer 4x4 ordered-dithered rectangle snapped to `pixelSize`.
 */
export function fillBayerDitherRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  colorA: string,
  colorB: string,
  ratio: number,
  pixelSize = PIXEL_UPSCALE
): void {
  const safeSize = Math.max(1, Math.round(pixelSize));
  const sx = Math.round(x / safeSize) * safeSize;
  const sy = Math.round(y / safeSize) * safeSize;
  const sw = Math.max(safeSize, Math.round(width / safeSize) * safeSize);
  const sh = Math.max(safeSize, Math.round(height / safeSize) * safeSize);

  ctx.fillStyle = colorA;
  ctx.fillRect(sx, sy, sw, sh);

  if (ratio <= 0) return;
  if (ratio >= 1) {
    ctx.fillStyle = colorB;
    ctx.fillRect(sx, sy, sw, sh);
    return;
  }

  ctx.fillStyle = colorB;
  const cols = Math.floor(sw / safeSize);
  const rows = Math.floor(sh / safeSize);
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (shouldDitherPixel(col, row, ratio)) {
        ctx.fillRect(sx + col * safeSize, sy + row * safeSize, safeSize, safeSize);
      }
    }
  }
}

/**
 * Integer Bresenham line rasterizer returning connected grid points.
 */
export function rasterizeBresenhamLine(
  x0: number,
  y0: number,
  x1: number,
  y1: number
): PixelPoint[] {
  let cx = Math.round(x0);
  let cy = Math.round(y0);
  const tx = Math.round(x1);
  const ty = Math.round(y1);

  if (!Number.isFinite(cx) || !Number.isFinite(cy) || !Number.isFinite(tx) || !Number.isFinite(ty)) {
    return [];
  }

  const points: PixelPoint[] = [];
  const dx = Math.abs(tx - cx);
  const dy = -Math.abs(ty - cy);
  const sx = cx < tx ? 1 : -1;
  const sy = cy < ty ? 1 : -1;
  let err = dx + dy;

  for (let guard = 0; guard < 2048; guard++) {
    points.push({ x: cx, y: cy });
    if (cx === tx && cy === ty) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      cx += sx;
    }
    if (e2 <= dx) {
      err += dx;
      cy += sy;
    }
  }
  return points;
}

/**
 * Draws a stepped pixel-art line segment using Bresenham rasterization on the `pixelSize` grid.
 */
export function drawBresenhamLine(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  pixelSize: number,
  color: string,
  thicknessDots = 1
): void {
  const safeSize = Math.max(1, Math.round(pixelSize));
  const gx0 = Math.round(x0 / safeSize);
  const gy0 = Math.round(y0 / safeSize);
  const gx1 = Math.round(x1 / safeSize);
  const gy1 = Math.round(y1 / safeSize);
  const pts = rasterizeBresenhamLine(gx0, gy0, gx1, gy1);
  if (pts.length === 0) return;

  const tDots = Math.max(1, Math.round(thicknessDots));
  const offset = Math.floor((tDots - 1) / 2);
  const blockSize = tDots * safeSize;

  ctx.fillStyle = color;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    ctx.fillRect((p.x - offset) * safeSize, (p.y - offset) * safeSize, blockSize, blockSize);
  }
}

/**
 * Compiles an ASCII pixel matrix into a pre-baked sprite with lazy offscreen canvas caching.
 * '.' and ' ' represent transparent pixels.
 */
export function compileSprite(
  matrix: readonly string[],
  palette: Readonly<Record<string, string>>,
  options?: { flashWhite?: boolean; flipX?: boolean }
): CompiledPixelSprite {
  const height = matrix.length;
  const width = matrix.reduce((max, row) => Math.max(max, row.length), 0);
  const pixels: CompiledPixelRun[] = [];
  const flashWhite = Boolean(options?.flashWhite);
  const flipX = Boolean(options?.flipX);

  for (let y = 0; y < height; y++) {
    const row = matrix[y];
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === '.' || ch === ' ') continue;
      const color = flashWhite ? '#ffffff' : palette[ch];
      if (!color) continue;
      pixels.push({
        x: flipX ? width - 1 - x : x,
        y,
        color,
      });
    }
  }

  return {
    width,
    height,
    pixels,
    canvas: null,
    bakeAttempted: false,
  };
}

function ensureSpriteBaked(sprite: CompiledPixelSprite): HTMLCanvasElement | null {
  if (sprite.canvas) return sprite.canvas;
  if (sprite.bakeAttempted) return null;
  sprite.bakeAttempted = true;

  if (typeof document === 'undefined' || sprite.width <= 0 || sprite.height <= 0) {
    return null;
  }

  try {
    const offscreen = document.createElement('canvas');
    offscreen.width = sprite.width;
    offscreen.height = sprite.height;
    const octx = offscreen.getContext('2d');
    if (!octx) return null;

    octx.imageSmoothingEnabled = false;
    for (let i = 0; i < sprite.pixels.length; i++) {
      const p = sprite.pixels[i];
      octx.fillStyle = p.color;
      octx.fillRect(p.x, p.y, 1, 1);
    }
    sprite.canvas = offscreen;
    return offscreen;
  } catch {
    return null;
  }
}

/**
 * Draws a compiled pixel sprite at integer `pixelSize`-snapped coordinates without smoothing.
 */
export function drawCompiledSprite(
  ctx: CanvasRenderingContext2D,
  sprite: CompiledPixelSprite,
  worldX: number,
  worldY: number,
  options?: { anchorX?: number; anchorY?: number; pixelSize?: number }
): void {
  const pixelSize = Math.max(1, Math.round(options?.pixelSize ?? PIXEL_UPSCALE));
  const anchorX = options?.anchorX ?? 0.5;
  const anchorY = options?.anchorY ?? 0.5;
  const drawW = sprite.width * pixelSize;
  const drawH = sprite.height * pixelSize;
  const left = Math.round((worldX - drawW * anchorX) / pixelSize) * pixelSize;
  const top = Math.round((worldY - drawH * anchorY) / pixelSize) * pixelSize;

  ctx.imageSmoothingEnabled = false;
  const baked = ensureSpriteBaked(sprite);
  if (baked) {
    ctx.drawImage(baked, 0, 0, sprite.width, sprite.height, left, top, drawW, drawH);
    return;
  }

  // Node / headless mock fallback
  for (let i = 0; i < sprite.pixels.length; i++) {
    const p = sprite.pixels[i];
    ctx.fillStyle = p.color;
    ctx.fillRect(left + p.x * pixelSize, top + p.y * pixelSize, pixelSize, pixelSize);
  }
}

/**
 * Renders a 2-tier stepped pixel-art contact shadow grounded on the desert floor.
 */
export function drawPixelGroundShadow(
  ctx: CanvasRenderingContext2D,
  cx: number,
  groundY: number,
  radiusX: number,
  radiusY = 4,
  alpha = 0.28
): void {
  const px = PIXEL_UPSCALE;
  const rx = Math.max(px * 2, Math.round(radiusX / px) * px);
  const ry = Math.max(px, Math.round(radiusY / px) * px);
  const sx = Math.round(cx / px) * px;
  const sy = Math.round(groundY / px) * px;

  ctx.save();
  ctx.fillStyle = `rgba(11, 14, 22, ${Math.max(0.05, Math.min(0.65, alpha)).toFixed(2)})`;
  ctx.fillRect(sx - rx, sy - Math.floor(ry / 2), rx * 2, ry);
  const innerRx = Math.max(px, Math.round((rx * 0.68) / px) * px);
  ctx.fillRect(sx - innerRx, sy - Math.floor(ry / 2) - px, innerRx * 2, ry + px);
  ctx.restore();
}

/**
 * Creates an offscreen pixel buffer canvas with nearest-neighbor configuration.
 */
export function createPixelBuffer(
  width = PIXEL_BUFFER_WIDTH,
  height = PIXEL_BUFFER_HEIGHT
): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null {
  if (typeof document === 'undefined') return null;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.imageSmoothingEnabled = false;
    return { canvas, ctx };
  } catch {
    return null;
  }
}
