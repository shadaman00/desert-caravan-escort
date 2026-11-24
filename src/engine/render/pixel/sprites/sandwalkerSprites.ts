import type { SkinId } from '@/store/types';
import {
  getLegArmorVisualTier,
  type SandwalkerRenderInput,
  type SandwalkerRig,
} from '@/engine/render/draw/sandwalker';
import {
  compileSprite,
  drawBresenhamLine,
  drawCompiledSprite,
  PIXEL_UPSCALE,
  type CompiledPixelSprite,
} from '../PixelCanvas';
import { SANDWALKER_PALETTE_DEFAULT, SANDWALKER_PALETTE_PHARAOH } from '../palettes';

/**
 * 38 x 18 pixel-art Sandwalker armored hull (drawn at 2x = 76 x 36 logical px).
 */
const SANDWALKER_HULL_MATRIX: readonly string[] = [
  '...........KKKKKKKKKKKKKKKK...........',
  '.........KKLLLLLLLLLLLLLLLLKK.........',
  '.......KKLLMMMMMMMMMMMMMMMMSSKK.......',
  '......KMMGGGGGGMMMMMMMMMMCCCCMMK......',
  '.....KMMGGGGGGGGMMMMMMMMCCCCCCMMK.....',
  '....KDMDDDDDDDDDDMMMMMMMCCCCCCMMDK....',
  '...KDMDDDDDDDDDDDDDDDDMMCCCCCCMDDDK...',
  '..KDDMMMMDDDDDDDDDDDDDDDDDDDDDDMMDDK..',
  '..KDMSSSSMMMMMMMMMMMMMMMMMMMMMMSSMDK..',
  '.KDOMMKKMMMMMMMMMMMMGGGGMMMMMMMMMMMDK.',
  '.KOOMMKKMMMMMMMMMMMMGGGGMMMMMMMMMMMDK.',
  '.KDDMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMDK.',
  '..KDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDK..',
  '..KRRRRDDDDDDDDMMMMMMMMMMMMDDDDDRRRK..',
  '...KKKKDDDDDDDDMMMMMMMMMMMMDDDDKKKK...',
  '......KMMKKDDKKKKKKKKKKKKKKDDKKMMK....',
  '......KLLKK..KDDDDDDDDDDDDK..KKLLK....',
  '.......KK.....KKKKKKKKKKKK.....KK.....',
];

const SANDWALKER_PHARAOH_CREST_MATRIX: readonly string[] = [
  '.............GGGGGGGGGGGG.............',
  '...........GGSSSSSSSSSSSSGG...........',
  '.........KKLLLLLLLLLLLLLLLLKK.........',
  '.......KKLLRRRRRRRRRRRRRRRRSSKK.......',
  '......KMMOOOOOORRRRRRRRRRCCCCCCK......',
  '.....KMMOOOOOOOOMMMMMMMMCCCCCCMMK.....',
  '....KDMDDDDDDDDDDMMMMMMMCCCCCCMMDK....',
  '...KDMGGGGGGGGDDDDDDDDMMCCCCCCMDDDK...',
  '..KDDMMMMGGGGDDDDDDDDDDDDDDDDDDMMDDK..',
  '..KDMSSSSMMMMMMMMMMMMMMMMMMMMMMSSMDK..',
  '.KDRMMKKMMMMMMMMMMMMGGGGMMMMMMMMMMMDK.',
  '.KRRMKKKMMMMMMMMMMMMGGGGMMMMMMMMMMMDK.',
  '.KDDMMMMMMMMLLLLLLLLLLLLLLMMMMMMMMMDK.',
  '..KDDDDDDDDDLLLLLLLLLLLLLLDDDDDDDDDK..',
  '..KRRRRDDDDDDDDMMMMMMMMMMMMDDDDDRRRK..',
  '...KKKKDDDDDDDDMMMMMMMMMMMMDDDDKKKK...',
  '......KMMKKDDKKKKKKKKKKKKKKDDKKMMK....',
  '......KLLKK..KGGGGGGGGGGGGK..KKLLK....',
];

const HULL_SPRITE_DEFAULT: CompiledPixelSprite = compileSprite(
  SANDWALKER_HULL_MATRIX,
  SANDWALKER_PALETTE_DEFAULT
);

const HULL_SPRITE_PHARAOH: CompiledPixelSprite = compileSprite(
  SANDWALKER_PHARAOH_CREST_MATRIX,
  SANDWALKER_PALETTE_PHARAOH
);

export function drawPixelSandwalkerHull(
  ctx: CanvasRenderingContext2D,
  rig: SandwalkerRig,
  input: SandwalkerRenderInput
): void {
  const anchorX = input.anchorX ?? 240;
  const groundY = input.groundY ?? 336;
  const hullCenterY = groundY - 70 + rig.hullBobY;
  const isPharaoh = input.equippedSkinId === 'GOLDEN_PHARAOH';
  const sprite = isPharaoh ? HULL_SPRITE_PHARAOH : HULL_SPRITE_DEFAULT;

  drawCompiledSprite(ctx, sprite, anchorX, hullCenterY, {
    anchorX: 0.5,
    anchorY: 0.5,
    pixelSize: PIXEL_UPSCALE,
  });

  // Twin pixel furnace exhaust glow sparks behind hull
  const px = PIXEL_UPSCALE;
  const rx = Math.round((anchorX - 38) / px) * px;
  const ry = Math.round((hullCenterY + 2) / px) * px;
  ctx.fillStyle = isPharaoh ? '#ecc94b' : '#dd6b20';
  ctx.fillRect(rx - 4, ry, 4, 4);
  ctx.fillStyle = '#fef08a';
  ctx.fillRect(rx - 2, ry - 4, 2, 2);
}

function getLegColors(skinId: SkinId, isBack: boolean): {
  femur: string;
  tibia: string;
  armor: string;
  bolt: string;
} {
  if (skinId === 'GOLDEN_PHARAOH') {
    return {
      femur: isBack ? '#2d3748' : '#4a5568',
      tibia: isBack ? '#4a5568' : '#718096',
      armor: '#ecc94b',
      bolt: '#38bdf8',
    };
  }
  return {
    femur: isBack ? '#2d3748' : '#4a5568',
    tibia: isBack ? '#4a5568' : '#718096',
    armor: '#4a5568',
    bolt: '#e6a15c',
  };
}

export function drawPixelSandwalkerLegsLayer(
  ctx: CanvasRenderingContext2D,
  rig: SandwalkerRig,
  input: SandwalkerRenderInput,
  layer: 'back' | 'front'
): void {
  const legTier = getLegArmorVisualTier(input.legPartLevel);
  const isBack = layer === 'back';
  const colors = getLegColors(input.equippedSkinId, isBack);
  const px = PIXEL_UPSCALE;
  const femurDots = legTier.tier >= 3 ? 3 : 2;
  const tibiaDots = legTier.tier >= 2 ? 3 : 2;

  ctx.save();
  if (isBack) {
    ctx.globalAlpha = 0.85;
  }

  for (let i = 0; i < rig.legs.length; i++) {
    const leg = rig.legs[i];
    if (leg.config.layer !== layer) continue;

    const { hipX, hipY, kneeX, kneeY, footX, footY } = leg.ik;

    // Stepped Bresenham femur & tibia segments
    drawBresenhamLine(ctx, hipX, hipY, kneeX, kneeY, px, colors.femur, femurDots);
    drawBresenhamLine(ctx, kneeX, kneeY, footX, footY, px, colors.tibia, tibiaDots);

    const kx = Math.round(kneeX / px) * px;
    const ky = Math.round(kneeY / px) * px;
    const fx = Math.round(footX / px) * px;
    const fy = Math.round(footY / px) * px;

    // Bolted pixel armor knee pad scaled by upgrade tier (preserves legArmorMetal scaling)
    const padHalf = (2 + legTier.tier) * px;
    ctx.fillStyle = '#2d3748';
    ctx.fillRect(kx - padHalf, ky - 4, padHalf * 2, (3 + legTier.tier) * px);
    ctx.fillStyle = colors.armor;
    ctx.fillRect(kx - padHalf + px, ky - 2, padHalf * 2 - px * 2, (2 + legTier.tier) * px);

    // Extra armored shin guard block on Tier 2 / Tier 3
    if (legTier.tier >= 2) {
      const mx = Math.round(((kneeX + footX) * 0.5) / px) * px;
      const my = Math.round(((kneeY + footY) * 0.5) / px) * px;
      const shinW = (2 + legTier.tier) * px;
      ctx.fillStyle = '#4a5568';
      ctx.fillRect(mx - Math.floor(shinW / 2), my - 2, shinW, 6);
    }

    // Mechanical pixel foot claw
    ctx.fillStyle = '#2d3748';
    ctx.fillRect(fx - 4, fy - 4, 8, 4);

    // Lv11+ Quicksand immunity bright cyan joint glow (preserves cyanGlow > 20px)
    if (legTier.hasQuicksandGlow) {
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(kx - 2, ky - 2, 6, 6);
      ctx.fillRect(fx - 4, fy - 4, 8, 4);
      ctx.fillStyle = '#7dd3fc';
      ctx.fillRect(kx, ky, 2, 2);
    } else {
      ctx.fillStyle = colors.bolt;
      ctx.fillRect(kx, ky, 2, 2);
    }
  }

  ctx.restore();
}
