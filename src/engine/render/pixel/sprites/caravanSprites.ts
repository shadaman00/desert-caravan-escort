import type { SkinId } from '@/store/types';
import type { WagonPose } from '@/engine/render/draw/wagon';
import type {
  MercenaryRuntimeState,
  MercenaryVisualShot,
} from '@/engine/systems/MercenarySystem';
import { WALKER_ANCHOR_X, WALKER_GROUND_Y } from '@/engine/render/draw/sandwalker';
import {
  compileSprite,
  drawBresenhamLine,
  drawCompiledSprite,
  PIXEL_UPSCALE,
  type CompiledPixelSprite,
} from '../PixelCanvas';
import { CARAVAN_PALETTE_DEFAULT, CARAVAN_PALETTE_PHARAOH } from '../palettes';

// 9 x 8 Camel dot sprite (2x = 18 x 16 logical px)
const CAMEL_MATRIX_F0: readonly string[] = [
  '......KKK',
  '..KK..KHH',
  '.KHKKKHHK',
  'KHHPPPHHK',
  'KHHHHHHHK',
  '.KHHKKHH.',
  '.KS...SK.',
  '.K.....K.',
];

const CAMEL_MATRIX_F1: readonly string[] = [
  '......KKK',
  '..KK..KHH',
  '.KHKKKHHK',
  'KHHPPPHHK',
  'KHHHHHHHK',
  '.KHHKKHH.',
  '..K...K..',
  '..S...S..',
];

// 9 x 10 Wagon dot sprite (2x = 18 x 20 logical px, aligned to R_WAGON_1_CANOPY & dark bed)
const WAGON_MATRIX: readonly string[] = [
  '.TTTTTTT.',
  '.TCCCCCT.',
  'TTCCCCCTT',
  'TCCTCCCTT',
  'TCCCCCCCT',
  'KKKKKKKKK',
  'KBBBBBBBK',
  'KBBBBBBBK',
  'KBBBBBBBK',
  '.KKKKKKK.',
];

const CAMEL_DEFAULT_SPRITES = [
  compileSprite(CAMEL_MATRIX_F0, CARAVAN_PALETTE_DEFAULT),
  compileSprite(CAMEL_MATRIX_F1, CARAVAN_PALETTE_DEFAULT),
] as const;

const CAMEL_PHARAOH_SPRITES = [
  compileSprite(CAMEL_MATRIX_F0, CARAVAN_PALETTE_PHARAOH),
  compileSprite(CAMEL_MATRIX_F1, CARAVAN_PALETTE_PHARAOH),
] as const;

const WAGON_SPRITE_DEFAULT = compileSprite(WAGON_MATRIX, CARAVAN_PALETTE_DEFAULT);
const WAGON_SPRITE_PHARAOH = compileSprite(WAGON_MATRIX, CARAVAN_PALETTE_PHARAOH);

function drawPixelWheel(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  phase: number,
  rimColor: string
): void {
  const px = PIXEL_UPSCALE;
  const rx = Math.round(cx / px) * px;
  const ry = Math.round(cy / px) * px;

  ctx.fillStyle = rimColor;
  ctx.fillRect(rx - 4, ry - 4, 8, 2);
  ctx.fillRect(rx - 4, ry + 2, 8, 2);
  ctx.fillRect(rx - 4, ry - 2, 2, 4);
  ctx.fillRect(rx + 2, ry - 2, 2, 4);

  // Rotating pixel spokes (2-frame diagonal/plus alternation)
  ctx.fillStyle = '#e2e8f0';
  if (phase % 2 === 0) {
    ctx.fillRect(rx - 2, ry, 4, 2);
    ctx.fillRect(rx, ry - 2, 2, 4);
  } else {
    ctx.fillRect(rx - 2, ry - 2, 2, 2);
    ctx.fillRect(rx + 2, ry - 2, 2, 2);
    ctx.fillRect(rx - 2, ry + 2, 2, 2);
    ctx.fillRect(rx + 2, ry + 2, 2, 2);
  }
}

export function drawPixelWagonTrain(
  ctx: CanvasRenderingContext2D,
  poses: readonly WagonPose[],
  equippedSkinId: SkinId,
  groundY = 336
): void {
  if (poses.length === 0) return;
  const isRoyal = equippedSkinId === 'GOLDEN_PHARAOH';
  const px = PIXEL_UPSCALE;
  const camelFrames = isRoyal ? CAMEL_PHARAOH_SPRITES : CAMEL_DEFAULT_SPRITES;
  const wagonSprite = isRoyal ? WAGON_SPRITE_PHARAOH : WAGON_SPRITE_DEFAULT;

  ctx.save();
  for (let i = poses.length - 1; i >= 0; i--) {
    const pose = poses[i];

    // Stepped Bresenham harness tether
    drawBresenhamLine(
      ctx,
      pose.tetherStartX,
      pose.tetherStartY,
      pose.tetherEndX,
      pose.tetherEndY,
      px,
      isRoyal ? '#ecc94b' : '#c69963',
      1
    );

    // Rigid wooden shafts
    drawBresenhamLine(
      ctx,
      pose.camelX - 4,
      pose.camelY - 9,
      pose.wagonX + 8,
      pose.wagonY - 10,
      px,
      '#7c4b28',
      1
    );

    const frameIdx = Math.floor(Math.abs(pose.camelStridePhase)) % 2;
    drawCompiledSprite(ctx, camelFrames[frameIdx], pose.camelX + 1, pose.camelY, {
      anchorX: 0.5,
      anchorY: 1.0,
      pixelSize: px,
    });

    // Draw wagon aligned to canopy (y ~ groundY-26..groundY-16) and bed (y ~ groundY-16..groundY-8)
    drawCompiledSprite(ctx, wagonSprite, pose.wagonX, pose.wagonY - 6, {
      anchorX: 0.5,
      anchorY: 1.0,
      pixelSize: px,
    });

    const wheelRim = isRoyal ? '#ecc94b' : '#b7791f';
    const wheelFrame = Math.floor(Math.abs(pose.wheelAngle * 2)) % 2;
    drawPixelWheel(ctx, pose.wagonX - 4, groundY - 4, wheelFrame, wheelRim);
    drawPixelWheel(ctx, pose.wagonX + 4, groundY - 4, wheelFrame, wheelRim);
  }
  ctx.restore();
}

// --- 5-Mercenary Pixel Sprites (9 x 12 dots, drawn at 2x = 18 x 24 logical px) ---
const MERC_MATRICES: Record<string, readonly string[]> = {
  SHIELD: [
    '..KKKK...',
    '.KSSSSK..',
    '.KFFFFK..',
    '..KKKK...',
    '.KCCCCCKB',
    '.KCCCCCKB',
    'KCCCCKKYB',
    'KCCCCKKYB',
    '.KCCCCKKB',
    '.KCKKCK..',
    '.KK..KK..',
  ],
  BOW: [
    '..KKKK...',
    '.KSSSSK..',
    '.KFFFFK..',
    '..KKKK..Y',
    '.KCCCCCKY',
    '.KCCCCCCY',
    '.KCCCCCKY',
    '.KCCCCK.Y',
    '.KCKKCK..',
    '.KK..KK..',
  ],
  STAFF: [
    '.......YY',
    '..KKKK.OY',
    '.KCCCCK.Y',
    '.KFFFFK.Y',
    '..KKKK..K',
    '.KCCCCCKK',
    '.KCCCCCCK',
    '.KCCCCCKK',
    '.KCKKCK.K',
    '.KK..KK.K',
  ],
  CROSS: [
    '...KKKK..',
    '..KSSSSK.',
    '..KFFFFK.',
    '...KKKK.G',
    '..KCCCCGG',
    '..KCCCCCK',
    '..KCCCCKG',
    '..KCKKCK.',
    '..KK..KK.',
  ],
  PACK: [
    '..KKKK...',
    '.KFFFFK..',
    'KKCCCCKK.',
    'BBCCCCCK.',
    'BYCCCCCK.',
    'BBCCCCCK.',
    'KKCCCCK..',
    '.KCKKCK..',
    '.KK..KK..',
  ],
};

function buildMercSprite(rt: MercenaryRuntimeState): CompiledPixelSprite {
  const mat = MERC_MATRICES[rt.silhouette] ?? MERC_MATRICES.BOW;
  return compileSprite(mat, {
    K: '#141720',
    S: rt.colorAccent,
    F: '#fbd38d',
    C: rt.colorPrimary,
    B: '#744210',
    Y: '#ecc94b',
    O: '#f6ad55',
    G: '#81e6d9',
  });
}

const MERC_SPRITE_CACHE = new Map<string, CompiledPixelSprite>();

export function drawPixelMercenaries(
  ctx: CanvasRenderingContext2D,
  runtimes: readonly MercenaryRuntimeState[],
  shots: readonly MercenaryVisualShot[],
  synergyActive: boolean,
  timeSec: number
): void {
  const px = PIXEL_UPSCALE;

  if (synergyActive) {
    const auraAlpha = 0.22 + 0.1 * Math.sin(timeSec * 4);
    ctx.save();
    ctx.globalAlpha = auraAlpha;
    ctx.fillStyle = '#ecc94b';
    const ax = Math.round((WALKER_ANCHOR_X - 40) / px) * px;
    const ay = Math.round((WALKER_GROUND_Y - 110) / px) * px;
    ctx.fillRect(ax, ay, 80, 2);
    ctx.fillRect(ax, ay + 24, 80, 2);
    ctx.restore();
  }

  for (let i = 0; i < runtimes.length; i++) {
    const rt = runtimes[i];
    if (!rt.isActive) continue;

    let sprite = MERC_SPRITE_CACHE.get(rt.id);
    if (!sprite) {
      sprite = buildMercSprite(rt);
      MERC_SPRITE_CACHE.set(rt.id, sprite);
    }

    const bob = rt.attackFlashTimer > 0 ? -2 : Math.round(Math.sin(timeSec * 4 + i) * 1) * px;
    drawCompiledSprite(ctx, sprite, rt.x, rt.y + bob, {
      anchorX: 0.5,
      anchorY: 1.0,
      pixelSize: px,
    });

    if (rt.skillFlashTimer > 0) {
      const sx = Math.round((rt.x - 10) / px) * px;
      const sy = Math.round((rt.y - 22) / px) * px;
      ctx.fillStyle = rt.colorAccent;
      ctx.fillRect(sx, sy, 20, 2);
      ctx.fillRect(sx, sy + 20, 20, 2);
    }
  }

  // Pixel projectiles & effects
  for (let i = 0; i < shots.length; i++) {
    const s = shots[i];
    const t = Math.min(1, s.age / s.maxLife);
    const alpha = Math.max(0, 1 - t);
    ctx.save();
    ctx.globalAlpha = alpha;

    if (s.kind === 'ARROW') {
      const cx = Math.round((s.fromX + (s.toX - s.fromX) * t) / px) * px;
      const cy = Math.round((s.fromY + (s.toY - s.fromY) * t) / px) * px;
      ctx.fillStyle = s.isCrit ? '#fef08a' : s.color;
      ctx.fillRect(cx - 6, cy, 10, 2);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(cx + 2, cy - 2, 2, 6);
    } else if (s.kind === 'ORB') {
      if (s.aoeRadius) {
        const r = Math.round((s.aoeRadius * (0.3 + 0.7 * t)) / px) * px;
        const tx = Math.round(s.toX / px) * px;
        const ty = Math.round(s.toY / px) * px;
        ctx.fillStyle = s.color;
        ctx.fillRect(tx - r, ty - 2, r * 2, 4);
        ctx.fillRect(tx - 2, ty - r, 4, r * 2);
      } else {
        const cx = Math.round((s.fromX + (s.toX - s.fromX) * t) / px) * px;
        const cy = Math.round((s.fromY + (s.toY - s.fromY) * t) / px) * px;
        ctx.fillStyle = s.color;
        ctx.fillRect(cx - 4, cy - 4, 8, 8);
      }
    } else if (s.kind === 'SLASH') {
      const sx = Math.round((s.fromX + 8) / px) * px;
      const sy = Math.round(s.fromY / px) * px;
      ctx.fillStyle = s.color;
      ctx.fillRect(sx, sy - 14, 4, 28);
      ctx.fillRect(sx + 4, sy - 10, 4, 20);
    } else if (s.kind === 'HEAL_PULSE') {
      const rx = Math.round(s.toX / px) * px;
      const ry = Math.round(s.toY / px) * px;
      ctx.fillStyle = s.color;
      ctx.fillRect(rx - 10, ry - 2, 20, 4);
      ctx.fillRect(rx - 2, ry - 10, 4, 20);
    } else if (s.kind === 'COIN_FLING') {
      const cx = Math.round((s.fromX + (s.toX - s.fromX) * t) / px) * px;
      const cy = Math.round((s.fromY + (s.toY - s.fromY) * t - Math.sin(t * Math.PI) * 18) / px) * px;
      ctx.fillStyle = '#ecc94b';
      ctx.fillRect(cx - 2, cy - 2, 6, 6);
    }
    ctx.restore();
  }
}
