import {
  ENTITY_VISUAL_SPECS,
  FALLBACK_HEX_COLORS,
  type TurretId,
} from '@/data/masterData';

function applyAnchorScale(ctx: CanvasRenderingContext2D, x: number, y: number, scale: number): void {
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.translate(-x, -y);
}

/**
 * Geometric Placeholder Renderer (PRD Section 4.3).
 * Executes immediately whenever `public/assets/*.png` files are absent.
 */

export function drawFallbackSandwalker(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  walkPhase: number,
  heatRatio: number,
  isOverdrive: boolean
): void {
  ctx.save();
  applyAnchorScale(ctx, x, y, ENTITY_VISUAL_SPECS.sandwalkerFallbackScale);

  // 6 animated sine-wave legs (#3E2723) anchored below hull
  ctx.strokeStyle = FALLBACK_HEX_COLORS.SANDWALKER_LEGS;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  const hipOffsets = [-22, -10, 0, 8, 18, 26];
  for (let i = 0; i < hipOffsets.length; i++) {
    const phase = walkPhase + (i % 2 === 0 ? 0 : Math.PI);
    const stepX = Math.sin(phase) * 7;
    const stepY = Math.max(0, -Math.cos(phase)) * 6;
    const hx = x + hipOffsets[i];
    const hy = y - 16;
    const kneeX = hx + (i < 3 ? -6 : 6) + stepX * 0.4;
    const kneeY = y - 8 - stepY * 0.5;
    const footX = hx + stepX;
    const footY = y - stepY;

    ctx.beginPath();
    ctx.moveTo(hx, hy);
    ctx.lineTo(kneeX, kneeY);
    ctx.lineTo(footX, footY);
    ctx.stroke();
  }

  // Ground contact shadow
  ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
  ctx.beginPath();
  ctx.ellipse(x, y + 1, 34, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Trapezoidal 72 x 48 hull centered at (0.5, 1.0)
  const bob = Math.sin(walkPhase * 2) * 1.8;
  const hullBottom = y - 14 + bob;
  const hullTop = hullBottom - 32;

  ctx.fillStyle = FALLBACK_HEX_COLORS.SANDWALKER_HULL;
  ctx.strokeStyle = FALLBACK_HEX_COLORS.SANDWALKER_LEGS;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x - 36, hullBottom);
  ctx.lineTo(x - 28, hullTop);
  ctx.lineTo(x + 28, hullTop);
  ctx.lineTo(x + 36, hullBottom);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Overdrive / Sweet-spot orange warning rim
  if (isOverdrive || heatRatio >= 0.75) {
    ctx.strokeStyle = isOverdrive ? '#00E5FF' : '#FF7043';
    ctx.lineWidth = 2.2;
    ctx.stroke();
  }

  // Glowing cyan front solar core
  ctx.fillStyle = '#00E5FF';
  ctx.fillRect(x + 12, hullTop + 9, 14, 10);
  ctx.strokeStyle = '#0F172A';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 12, hullTop + 9, 14, 10);

  ctx.restore();
}

export function drawFallbackTurret(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  turretId: TurretId,
  aimAngleRad = 0
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(ENTITY_VISUAL_SPECS.turretFallbackScale, ENTITY_VISUAL_SPECS.turretFallbackScale);
  ctx.rotate(aimAngleRad);

  if (turretId === 'TUR_01') {
    // Harpoon (32x12, pivot 0.3, 0.5)
    ctx.fillStyle = FALLBACK_HEX_COLORS.SANDWALKER_LEGS;
    ctx.fillRect(-10, -6, 18, 12);
    ctx.fillStyle = FALLBACK_HEX_COLORS.TURRET_HARPOON;
    ctx.fillRect(4, -3, 18, 6);
    ctx.beginPath();
    ctx.moveTo(22, -6);
    ctx.lineTo(32, 0);
    ctx.lineTo(22, 6);
    ctx.closePath();
    ctx.fill();
  } else if (turretId === 'TUR_02') {
    // Thermal Laser (28x14)
    ctx.fillStyle = '#1E293B';
    ctx.fillRect(-8, -7, 18, 14);
    ctx.fillStyle = FALLBACK_HEX_COLORS.TURRET_LASER;
    ctx.fillRect(10, -4, 14, 8);
    ctx.beginPath();
    ctx.arc(8, 0, 4, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // Flame Mortar (26x18)
    ctx.save();
    ctx.rotate(-0.35);
    ctx.fillStyle = '#3E2723';
    ctx.fillRect(-8, -9, 20, 18);
    ctx.fillStyle = FALLBACK_HEX_COLORS.TURRET_MORTAR;
    ctx.fillRect(8, -7, 10, 14);
    ctx.restore();
  }

  ctx.restore();
}

export function drawFallbackWagon(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  wheelAngle: number
): void {
  ctx.save();
  applyAnchorScale(ctx, x, y, ENTITY_VISUAL_SPECS.wagonFallbackScale);

  // Lead camel silhouette pulling slightly ahead (+20px)
  ctx.fillStyle = '#C68B59';
  ctx.fillRect(x + 14, y - 16, 12, 8);
  ctx.fillRect(x + 22, y - 22, 4, 9);
  ctx.fillRect(x + 15, y - 8, 3, 8);
  ctx.fillRect(x + 22, y - 8, 3, 8);

  // Wooden tether shaft
  ctx.strokeStyle = '#5D4037';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x + 10, y - 11);
  ctx.lineTo(x + 18, y - 13);
  ctx.stroke();

  // Wagon canopy (#D7CCC8) & bed (#8D6E63) 44x32 equivalent
  ctx.fillStyle = FALLBACK_HEX_COLORS.WAGON_CANOPY;
  ctx.beginPath();
  ctx.arc(x, y - 15, 13, Math.PI, 0);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#5D4037';
  ctx.lineWidth = 1.2;
  ctx.stroke();

  ctx.fillStyle = FALLBACK_HEX_COLORS.WAGON_BODY;
  ctx.fillRect(x - 14, y - 15, 28, 10);
  ctx.strokeRect(x - 14, y - 15, 28, 10);

  // Spinning spoked wheels
  const wheelOffsets = [-9, 9];
  for (let i = 0; i < wheelOffsets.length; i++) {
    const wx = x + wheelOffsets[i];
    const wy = y - 5;
    ctx.save();
    ctx.translate(wx, wy);
    ctx.strokeStyle = '#4E342E';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.rotate(wheelAngle);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-4, 0);
    ctx.lineTo(4, 0);
    ctx.moveTo(0, -4);
    ctx.lineTo(0, 4);
    ctx.stroke();
    ctx.restore();
  }

  ctx.restore();
}

export function drawFallbackMercenary(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  colorHex: string,
  bobPhase: number
): void {
  const by = y + Math.sin(bobPhase) * 2.2;
  ctx.save();
  applyAnchorScale(ctx, x, by, ENTITY_VISUAL_SPECS.mercenaryFallbackScale);
  ctx.fillStyle = colorHex;
  ctx.strokeStyle = '#1E293B';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(x, by - 14, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillRect(x - 5, by - 9, 10, 9);
  ctx.strokeRect(x - 5, by - 9, 10, 9);
  ctx.restore();
}

export function drawFallbackRaider(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  flashWhite = false
): void {
  ctx.save();
  applyAnchorScale(ctx, x, y, ENTITY_VISUAL_SPECS.enemyFallbackScales.RAIDER);
  ctx.fillStyle = flashWhite ? '#FFFFFF' : FALLBACK_HEX_COLORS.ENEMY_RAIDER_CLOAK;
  ctx.beginPath();
  ctx.moveTo(x, y - 34);
  ctx.lineTo(x + 14, y - 17);
  ctx.lineTo(x, y);
  ctx.lineTo(x - 14, y - 17);
  ctx.closePath();
  ctx.fill();
  if (!flashWhite) {
    ctx.fillStyle = FALLBACK_HEX_COLORS.ENEMY_RAIDER_SCARF;
    ctx.fillRect(x - 10, y - 24, 20, 5);
  }
  ctx.restore();
}

export function drawFallbackBoss(
  ctx: CanvasRenderingContext2D,
  bossKey: 'BOSS_SCORPION' | 'BOSS_MIRAGE' | 'BOSS_SANDWORM',
  x: number,
  y: number,
  flashWhite = false
): void {
  ctx.save();
  applyAnchorScale(ctx, x, y, ENTITY_VISUAL_SPECS.enemyFallbackScales[bossKey]);
  if (bossKey === 'BOSS_SCORPION') {
    ctx.fillStyle = flashWhite ? '#FFFFFF' : FALLBACK_HEX_COLORS.BOSS_SCORPION_BODY;
    ctx.beginPath();
    ctx.ellipse(x, y - 26, 40, 22, 0, 0, Math.PI * 2);
    ctx.fill();
    if (!flashWhite) {
      ctx.strokeStyle = FALLBACK_HEX_COLORS.BOSS_SCORPION_STING;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(x + 25, y - 30);
      ctx.quadraticCurveTo(x + 38, y - 64, x + 10, y - 58);
      ctx.stroke();
    }
  } else if (bossKey === 'BOSS_MIRAGE') {
    ctx.fillStyle = flashWhite ? '#FFFFFF' : FALLBACK_HEX_COLORS.BOSS_MIRAGE_BODY;
    ctx.beginPath();
    ctx.moveTo(x - 36, y - 72);
    ctx.lineTo(x + 36, y - 72);
    ctx.lineTo(x, y);
    ctx.closePath();
    ctx.fill();
    if (!flashWhite) {
      ctx.fillStyle = FALLBACK_HEX_COLORS.BOSS_MIRAGE_CROWN;
      ctx.fillRect(x - 16, y - 86, 32, 10);
    }
  } else {
    ctx.fillStyle = flashWhite ? '#FFFFFF' : FALLBACK_HEX_COLORS.BOSS_SANDWORM_SHELL;
    for (let s = 0; s < 4; s++) {
      ctx.beginPath();
      ctx.arc(x + s * 6, y - 22 - s * 28, 34 - s * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    if (!flashWhite) {
      ctx.fillStyle = FALLBACK_HEX_COLORS.BOSS_SANDWORM_WEAKSPOT;
      ctx.beginPath();
      ctx.arc(x - 14, y - 92, 12, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}
