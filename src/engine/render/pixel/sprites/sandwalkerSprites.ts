import type { SkinId } from '@/store/types';
import {
  getLegArmorVisualTier,
  getTurretVisualTier,
  type SandwalkerRenderInput,
  type SandwalkerRig,
} from '@/engine/render/draw/sandwalker';
import {
  compileSprite,
  drawBresenhamLine,
  drawCompiledSprite,
  drawPixelGroundShadow,
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

  drawPixelGroundShadow(ctx, anchorX, groundY + 1, 44, 4, 0.30);

  drawCompiledSprite(ctx, sprite, anchorX, hullCenterY, {
    anchorX: 0.5,
    anchorY: 0.5,
    pixelSize: PIXEL_UPSCALE,
  });

  // Top hull specular rim highlight for dark NIGHT/STORM separation
  const px = PIXEL_UPSCALE;
  ctx.fillStyle = isPharaoh ? '#fef08a' : '#cbd5e0';
  ctx.fillRect(Math.round((anchorX - 18) / px) * px, Math.round((hullCenterY - 16) / px) * px, 34, 2);

  // Twin pixel furnace exhaust glow sparks behind hull
  const rx = Math.round((anchorX - 38) / px) * px;
  const ry = Math.round((hullCenterY + 2) / px) * px;
  ctx.fillStyle = isPharaoh ? '#ecc94b' : '#dd6b20';
  ctx.fillRect(rx - 4, ry, 4, 4);
  ctx.fillStyle = '#fef08a';
  ctx.fillRect(rx - 2, ry - 4, 2, 2);
}

/**
 * Renders unified 16-bit pixel-art Sandwalker turret (HEAT_RAY, HARPOON, MORTAR)
 * with Tier 1..3 barrel evolution, recoil & switch bounce inside R_TURRET bounds.
 */
export function drawPixelSandwalkerTurret(
  ctx: CanvasRenderingContext2D,
  rig: SandwalkerRig,
  input: SandwalkerRenderInput
): void {
  const anchorX = input.anchorX ?? 240;
  const groundY = input.groundY ?? 336;
  const mountX = anchorX + 4;
  const mountY = groundY - 88 + rig.hullBobY;
  const active = input.activeTurret;
  const barrelCount = getTurretVisualTier(
    input.turretLevels[active] ?? 1,
    input.turretTiers[active] ?? 1
  );
  const px = PIXEL_UPSCALE;
  const recoil = Math.round((input.recoilPx ?? 0) / px) * px;

  let switchScaleY = 1;
  let switchTilt = 0;
  if (rig.switchAnimTimer > 0) {
    const t = Math.min(1, rig.switchAnimTimer / 0.15);
    switchScaleY = 1 - 0.25 * Math.sin(t * Math.PI);
    switchTilt = -0.22 * Math.sin(t * Math.PI);
  }

  const baseAim = active === 'MORTAR' ? -0.45 : 0;
  const aimAngle = (input.aimAngle ?? baseAim) + switchTilt;
  const tierScale = 1 + (barrelCount - 1) * 0.1; // 1.0, 1.1, 1.2
  const snap = (v: number) => Math.round(v / px) * px;

  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.translate(snap(mountX), snap(mountY));
  ctx.scale(tierScale, tierScale * switchScaleY);

  // Pixel pedestal collar seated atop hull
  ctx.fillStyle = '#1a202c';
  ctx.fillRect(-14, -8, 28, 10);
  ctx.fillStyle = input.equippedSkinId === 'GOLDEN_PHARAOH' ? '#ecc94b' : '#4a5568';
  ctx.fillRect(-12, -6, 24, 6);

  ctx.translate(0, -10);
  if (typeof ctx.rotate === 'function') {
    ctx.rotate(aimAngle);
  }
  ctx.translate(-recoil, 0);

  // Turret armored housing block
  const podW = 24;
  const podH = 14;
  ctx.fillStyle = '#1a202c';
  ctx.fillRect(-14, -9, podW + 4, podH + 4);

  if (active === 'HEAT_RAY') {
    ctx.fillStyle = '#9b2c2c';
    ctx.fillRect(-12, -7, podW, podH);
    ctx.fillStyle = '#e53e3e';
    ctx.fillRect(-10, -5, podW - 4, 4);
    // Stepped top cooling fins scaled by tier
    ctx.fillStyle = '#f6ad55';
    for (let f = 0; f < barrelCount; f++) {
      ctx.fillRect(-10 + f * 6, -11, 4, 4);
    }
  } else if (active === 'HARPOON') {
    ctx.fillStyle = '#2c5282';
    ctx.fillRect(-12, -7, podW, podH);
    ctx.fillStyle = '#63b3ed';
    ctx.fillRect(-10, -5, podW - 4, 4);
    // Brass winch spool
    ctx.fillStyle = '#ecc94b';
    ctx.fillRect(-8, -4, 6, 6);
  } else {
    ctx.fillStyle = '#975a16';
    ctx.fillRect(-12, -7, podW, podH);
    ctx.fillStyle = '#ecc94b';
    ctx.fillRect(-10, -5, podW - 4, 4);
  }

  // Pixel-stepped barrels scaled 1 / 2 / 3 by visual tier
  const offsets = barrelCount === 1 ? [0] : barrelCount === 2 ? [-4, 4] : [-6, 0, 6];
  const barrelLen = active === 'HARPOON' ? 24 : active === 'HEAT_RAY' ? 22 : 18;
  const lineColor =
    active === 'HEAT_RAY' ? '#f56565' : active === 'HARPOON' ? '#63b3ed' : '#d69e2e';
  const tipColor =
    active === 'HEAT_RAY' ? '#fefcbf' : active === 'HARPOON' ? '#f7fafc' : '#fef08a';

  for (let i = 0; i < offsets.length; i++) {
    const by = offsets[i];
    drawBresenhamLine(ctx, 10, by, 10 + barrelLen, by, px, lineColor, active === 'MORTAR' ? 2 : 1);
    ctx.fillStyle = tipColor;
    ctx.fillRect(10 + barrelLen - 2, by - 2, 4, 4);
  }

  ctx.restore();
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
