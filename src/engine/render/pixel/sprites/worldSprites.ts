import type { CombatTarget, DamagePopup } from '@/engine/systems/DamageSystem';
import type {
  HarpoonProjectile,
  HeatRayBeamState,
  ManualAimState,
  MortarExplosionEffect,
  MortarShell,
} from '@/engine/systems/TurretSystem';
import { MANUAL_AIM_LOCK_DURATION_SEC, WEAK_POINT_SNAP_RADIUS_PX } from '@/game/data/turrets';
import {
  compileSprite,
  drawBresenhamLine,
  drawCompiledSprite,
  PIXEL_UPSCALE,
  type CompiledPixelSprite,
} from '../PixelCanvas';
import { WORLD_PALETTE } from '../palettes';

// 10 x 10 pixel icons for each collectible Relic in Codex UI
export const RELIC_ICON_MATRICES: Readonly<Record<string, readonly string[]>> = {
  relic_solar_disc: [
    '...GGGG...',
    '..GYYYYG..',
    '.GYGGGGYG.',
    'GYGYYYYGYG',
    'GYGYYYYGYG',
    'GYGYYYYGYG',
    'GYGYYYYGYG',
    '.GYGGGGYG.',
    '..GYYYYG..',
    '...GGGG...',
  ],
  relic_ankh: [
    '...GGGG...',
    '..GYYYYG..',
    '..GY..YG..',
    '..GYYYYG..',
    '.GGGGGGGG.',
    '.YYYYYYYY.',
    '....GG....',
    '....GG....',
    '....YY....',
    '....GG....',
  ],
  relic_scarab: [
    '..K....K..',
    '..KCGGCK..',
    '.KCCCCCCK.',
    'KGGGGGGGGK',
    'KCCGGGGCCK',
    'KCCGGGGCCK',
    '.KCCCCCCK.',
    '..KGGGGK..',
    '.K..KK..K.',
    '..........',
  ],
  relic_crown: [
    '.Y..YY..Y.',
    '.Y.Y..Y.Y.',
    '.YYYYYYYY.',
    '.GRGRRRRG.',
    '.YYYYYYYY.',
    '.GPGGGGPG.',
    '.GGGGGGGG.',
    '.GGGGGGGG.',
    '..........',
    '..........',
  ],
  relic_sun_compass: [
    '...KKKK...',
    '..KGGGGK..',
    '.KGLRRLGK.',
    'KGLRRRRGGK',
    'KGGCCCCGGK',
    'KGGGGGGGGK',
    '.KGGSSGGK.',
    '..KGGGGK..',
    '...KKKK...',
    '..........',
  ],
  relic_astral_astrolabe: [
    '....GG....',
    '..KGGGGK..',
    '.KSSSSSSK.',
    'KGCCSSCCGK',
    'KGSCCCCSGK',
    'KGCCYYCCGK',
    '.KSSSSSSK.',
    '..KGGGGK..',
    '..........',
    '..........',
  ],
};

export const HARPOON_HEAD_SPRITE: CompiledPixelSprite = compileSprite(
  [
    '....L..',
    '..LLLL.',
    'KKLLLLL',
    '..LLLL.',
    '....L..',
  ],
  WORLD_PALETTE
);

export const STELE_ICON_SPRITE: CompiledPixelSprite = compileSprite(
  [
    '..KKKKK..',
    '.KMMMMMK.',
    '.KMCCCMK.',
    '.KMMMMMK.',
    '.KMCGCMK.',
    '.KMMMMMK.',
    '.KMCCCMK.',
    'KKKKKKKKK',
  ],
  WORLD_PALETTE
);

export function drawPixelHeatRayBeam(
  ctx: CanvasRenderingContext2D,
  beam: HeatRayBeamState | null
): void {
  if (!beam || beam.alpha <= 0.01) return;
  const px = PIXEL_UPSCALE;
  const tierDots = beam.tier === 3 ? 3 : beam.tier === 2 ? 2 : 1;

  ctx.save();
  ctx.globalAlpha = beam.alpha;
  drawBresenhamLine(ctx, beam.x1, beam.y1, beam.x2, beam.y2, px, '#dd6b20', tierDots + 2);
  drawBresenhamLine(ctx, beam.x1, beam.y1, beam.x2, beam.y2, px, '#fb923c', tierDots + 1);
  drawBresenhamLine(ctx, beam.x1, beam.y1, beam.x2, beam.y2, px, '#fefcbf', Math.max(1, tierDots - 1));

  // Muzzle pixel flash
  const mx = Math.round(beam.x1 / px) * px;
  const my = Math.round(beam.y1 / px) * px;
  ctx.fillStyle = '#fef08a';
  ctx.fillRect(mx - 4, my - 4, 8, 8);
  ctx.restore();
}

export function drawPixelHarpoons(
  ctx: CanvasRenderingContext2D,
  harpoons: readonly HarpoonProjectile[]
): void {
  if (harpoons.length === 0) return;
  const px = PIXEL_UPSCALE;

  ctx.save();
  for (let i = 0; i < harpoons.length; i++) {
    const h = harpoons[i];
    drawBresenhamLine(ctx, h.originX, h.originY, h.x, h.y, px, '#cbd5e0', 1);
    drawCompiledSprite(ctx, HARPOON_HEAD_SPRITE, h.x, h.y, { pixelSize: px });
  }
  ctx.restore();
}

export function drawPixelMortarsAndExplosions(
  ctx: CanvasRenderingContext2D,
  mortars: readonly MortarShell[],
  explosions: readonly MortarExplosionEffect[]
): void {
  if (mortars.length === 0 && explosions.length === 0) return;
  const px = PIXEL_UPSCALE;

  ctx.save();
  for (let i = 0; i < mortars.length; i++) {
    const m = mortars[i];
    const tx = Math.round(m.targetX / px) * px;
    const ty = Math.round(m.targetY / px) * px;
    // Crisp pulsing pixel target reticle
    ctx.fillStyle = 'rgba(249, 115, 22, 0.72)';
    ctx.fillRect(tx - 14, ty - 2, 10, 4);
    ctx.fillRect(tx + 4, ty - 2, 10, 4);
    ctx.fillStyle = '#fef08a';
    ctx.fillRect(tx - 2, ty - 4, 4, 8);

    const sx = Math.round(m.x / px) * px;
    const sy = Math.round(m.y / px) * px;
    ctx.fillStyle = '#744210';
    ctx.fillRect(sx - 6, sy - 4, 12, 8);
    ctx.fillStyle = '#fef08a';
    ctx.fillRect(sx - 4, sy - 2, 4, 4);
  }

  for (let i = 0; i < explosions.length; i++) {
    const exp = explosions[i];
    const t = Math.min(1, exp.age / exp.maxLife);
    const currentR = Math.max(8, Math.round((exp.radius * (0.28 + 0.72 * t)) / px) * px);
    const ex = Math.round(exp.x / px) * px;
    const ey = Math.round(exp.y / px) * px;
    const fade = Math.max(0, 1 - t);

    // Subtle translucent inner heat flash (keeps enemies/damage numbers legible underneath)
    ctx.globalAlpha = fade * 0.28;
    const coreR = Math.max(4, Math.round((currentR * 0.45) / px) * px);
    ctx.fillStyle = '#dd6b20';
    ctx.fillRect(ex - coreR, ey - coreR, coreR * 2, coreR * 2);

    // Crisp hollow stepped pixel shockwave perimeter ring
    ctx.globalAlpha = fade * 0.9;
    ctx.fillStyle = '#f6ad55';
    ctx.fillRect(ex - currentR, ey - currentR, currentR * 2, px * 2);
    ctx.fillRect(ex - currentR, ey + currentR - px * 2, currentR * 2, px * 2);
    ctx.fillRect(ex - currentR, ey - currentR, px * 2, currentR * 2);
    ctx.fillRect(ex + currentR - px * 2, ey - currentR, px * 2, currentR * 2);

    // Inner bright yellow highlight & 4 corner pixel sparks
    const innerR = Math.max(4, currentR - px * 2);
    ctx.fillStyle = '#fef08a';
    ctx.fillRect(ex - innerR, ey - innerR, innerR * 2, px);
    ctx.fillRect(ex - innerR, ey + innerR - px, innerR * 2, px);
    const diag = Math.round((currentR * 0.8) / px) * px;
    ctx.fillRect(ex - diag - 2, ey - diag - 2, 4, 4);
    ctx.fillRect(ex + diag - 2, ey - diag - 2, 4, 4);
    ctx.fillRect(ex - diag - 2, ey + diag - 2, 4, 4);
    ctx.fillRect(ex + diag - 2, ey + diag - 2, 4, 4);
  }
  ctx.restore();
}

export function drawPixelWeakPointReticle(
  ctx: CanvasRenderingContext2D,
  aimState: ManualAimState,
  targets: readonly CombatTarget[],
  timeSec: number
): void {
  const lockedTarget = aimState.lockedTargetId
    ? targets.find((t) => t.id === aimState.lockedTargetId && t.alive)
    : undefined;
  if (!aimState.isDragging && !lockedTarget) return;

  const px = PIXEL_UPSCALE;
  ctx.save();

  if (aimState.isDragging) {
    const cx = Math.round(aimState.pointerX / px) * px;
    const cy = Math.round(aimState.pointerY / px) * px;
    const r = Math.round(WEAK_POINT_SNAP_RADIUS_PX / px) * px;
    ctx.fillStyle = 'rgba(236, 201, 75, 0.55)';
    for (let a = 0; a < 16; a++) {
      const ang = (a / 16) * Math.PI * 2;
      const dx = Math.round((cx + Math.cos(ang) * r) / px) * px;
      const dy = Math.round((cy + Math.sin(ang) * r) / px) * px;
      ctx.fillRect(dx, dy, 4, 4);
    }
    ctx.fillStyle = '#ecc94b';
    ctx.fillRect(cx - 2, cy - 2, 4, 4);
  }

  if (lockedTarget) {
    const wpX = Math.round((lockedTarget.x + (lockedTarget.weakPointOffset?.x ?? 0)) / px) * px;
    const wpY = Math.round((lockedTarget.y + (lockedTarget.weakPointOffset?.y ?? 0)) / px) * px;
    const offset = Math.round((14 + Math.sin(timeSec * 8) * 2) / px) * px;
    const ratio = Math.max(0, Math.min(1, aimState.lockRemainingSec / MANUAL_AIM_LOCK_DURATION_SEC));

    // Pixel brackets
    ctx.fillStyle = '#ecc94b';
    ctx.fillRect(wpX - offset, wpY - offset, 6, 2);
    ctx.fillRect(wpX - offset, wpY - offset, 2, 6);
    ctx.fillRect(wpX + offset - 6, wpY - offset, 6, 2);
    ctx.fillRect(wpX + offset - 2, wpY - offset, 2, 6);
    ctx.fillRect(wpX - offset, wpY + offset - 2, 6, 2);
    ctx.fillRect(wpX - offset, wpY + offset - 6, 2, 6);
    ctx.fillRect(wpX + offset - 6, wpY + offset - 2, 6, 2);
    ctx.fillRect(wpX + offset - 2, wpY + offset - 6, 2, 6);

    // Pixel lock countdown bar below reticle
    const barW = Math.round((24 * ratio) / px) * px;
    ctx.fillStyle = '#0b0c10';
    ctx.fillRect(wpX - 12, wpY + offset + 2, 24, 4);
    ctx.fillStyle = '#f56565';
    ctx.fillRect(wpX - 12, wpY + offset + 2, Math.max(0, barW), 2);
  }

  ctx.restore();
}

export function drawPixelDamagePopups(
  ctx: CanvasRenderingContext2D,
  popups: readonly DamagePopup[]
): void {
  if (popups.length === 0) return;
  const px = PIXEL_UPSCALE;

  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (let i = 0; i < popups.length; i++) {
    const p = popups[i];
    const t = Math.min(1, p.age / p.maxLife);
    const alpha = Math.max(0, 1 - t * t);
    const fontSize = Math.round(11 * p.scale);
    const x = Math.round(p.x / px) * px;
    const y = Math.round(p.y / px) * px;

    ctx.globalAlpha = alpha;
    ctx.font = `bold ${fontSize}px monospace`;
    ctx.fillStyle = '#0b0c10';
    ctx.fillText(p.text, x + 2, y + 2);
    ctx.fillStyle = p.color;
    ctx.fillText(p.text, x, y);
  }

  ctx.restore();
}
