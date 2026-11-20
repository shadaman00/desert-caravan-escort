import type { EnemyInstance, EnemyProjectile } from '@/engine/systems/SpawnSystem';

function drawDesertBandit(ctx: CanvasRenderingContext2D, e: EnemyInstance): void {
  const step = Math.sin(e.animPhase) * 2;
  ctx.save();
  ctx.translate(e.x, e.y);

  // Sand-skiff runner sled
  ctx.strokeStyle = '#975a16';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(-11, 10);
  ctx.lineTo(10, 10);
  ctx.lineTo(13, 6);
  ctx.stroke();

  // Tattered crimson hood & ochre cloak
  const body = new Path2D();
  body.moveTo(-7, 9);
  body.lineTo(-5, -7 + step * 0.4);
  body.lineTo(5, -7 + step * 0.4);
  body.lineTo(7, 9);
  body.closePath();
  ctx.fillStyle = '#9b2c2c';
  ctx.fill(body);
  ctx.strokeStyle = '#f6ad55';
  ctx.lineWidth = 1.2;
  ctx.stroke(body);

  // Head + hood
  ctx.fillStyle = '#742a2a';
  ctx.beginPath();
  ctx.arc(0, -10 + step * 0.4, 4.5, 0, Math.PI * 2);
  ctx.fill();

  // Curved scimitar facing left toward walker
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(-4, 0);
  ctx.quadraticCurveTo(-13, -6, -11, -13);
  ctx.stroke();

  ctx.restore();
}

function drawScorpion(ctx: CanvasRenderingContext2D, e: EnemyInstance): void {
  const scuttle = Math.sin(e.animPhase * 1.4) * 2;
  ctx.save();
  ctx.translate(e.x, e.y);

  // Articulated legs
  ctx.strokeStyle = '#4a5568';
  ctx.lineWidth = 2;
  for (let l = -1; l <= 1; l++) {
    ctx.beginPath();
    ctx.moveTo(l * 6, 4);
    ctx.lineTo(l * 8 - 3, 13 + (l % 2 === 0 ? scuttle : -scuttle));
    ctx.stroke();
  }

  // Heavy armored carapace
  const shell = new Path2D();
  shell.moveTo(-14, 4);
  shell.lineTo(-8, -8);
  shell.lineTo(8, -9);
  shell.lineTo(16, 1);
  shell.lineTo(12, 8);
  shell.lineTo(-10, 8);
  shell.closePath();
  ctx.fillStyle = '#2d3748';
  ctx.fill(shell);
  ctx.strokeStyle = '#90cdf4';
  ctx.lineWidth = 1.5;
  ctx.stroke(shell);

  // Forward pincers
  ctx.strokeStyle = '#718096';
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(-12, 1);
  ctx.lineTo(-20, -4 + scuttle * 0.5);
  ctx.lineTo(-17, -8);
  ctx.stroke();

  // Curved stinger tail ending at weakPointOffset (-6, -14)
  ctx.strokeStyle = '#4a5568';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(10, -4);
  ctx.quadraticCurveTo(18, -22, e.weakPointOffset.x, e.weakPointOffset.y);
  ctx.stroke();

  // Glowing venom stinger
  ctx.fillStyle = '#ecc94b';
  ctx.beginPath();
  ctx.arc(e.weakPointOffset.x, e.weakPointOffset.y, 3.2, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawMirageSpirit(ctx: CanvasRenderingContext2D, e: EnemyInstance, timeSec: number): void {
  ctx.save();
  ctx.translate(e.x, e.y);

  // Translucent spectral aura
  const grad = ctx.createRadialGradient(0, 0, 3, 0, 0, 20);
  grad.addColorStop(0, 'rgba(125, 211, 252, 0.75)');
  grad.addColorStop(0.6, 'rgba(128, 90, 213, 0.35)');
  grad.addColorStop(1, 'rgba(128, 90, 213, 0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(0, 0, 20, 0, Math.PI * 2);
  ctx.fill();

  // Crystalline diamond core
  const diamond = new Path2D();
  diamond.moveTo(0, -14);
  diamond.lineTo(10, 0);
  diamond.lineTo(0, 14);
  diamond.lineTo(-10, 0);
  diamond.closePath();
  ctx.fillStyle = '#553c9a';
  ctx.fill(diamond);
  ctx.strokeStyle = '#7dd3fc';
  ctx.lineWidth = 1.6;
  ctx.stroke(diamond);

  // 3 orbiting illusory shards
  for (let i = 0; i < 3; i++) {
    const a = timeSec * 3.5 + (i * Math.PI * 2) / 3;
    const sx = Math.cos(a) * 14;
    const sy = Math.sin(a) * 8;
    ctx.fillStyle = '#bae6fd';
    ctx.beginPath();
    ctx.arc(sx, sy, 2.3, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

export function drawEnemies(
  ctx: CanvasRenderingContext2D,
  enemies: readonly EnemyInstance[],
  projectiles: readonly EnemyProjectile[],
  manualAimTargetId: string | null,
  timeSec: number
): void {
  if (enemies.length === 0 && projectiles.length === 0) return;

  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    if (!e.alive) continue;

    if (e.archetypeId === 'DESERT_BANDIT') {
      drawDesertBandit(ctx, e);
    } else if (e.archetypeId === 'SCORPION') {
      drawScorpion(ctx, e);
    } else {
      drawMirageSpirit(ctx, e, timeSec);
    }

    // Hit flash overlay
    if (e.hitFlashTimer > 0) {
      ctx.save();
      ctx.globalAlpha = Math.min(0.85, e.hitFlashTimer / 0.12);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.radius + 1, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // HP & Armor bars above sprite
    const barW = 30;
    const barH = 4;
    const barX = e.x - barW * 0.5;
    const barY = e.y - e.radius - 10;

    ctx.fillStyle = 'rgba(11, 12, 16, 0.8)';
    ctx.fillRect(barX - 1, barY - 1, barW + 2, barH + 2);
    const hpRatio = e.maxHp > 0 ? Math.max(0, Math.min(1, e.hp / e.maxHp)) : 0;
    ctx.fillStyle = hpRatio > 0.4 ? '#48bb78' : '#f56565';
    ctx.fillRect(barX, barY, barW * hpRatio, barH);

    if (e.maxArmor > 0 && e.armor > 0) {
      const armorRatio = Math.max(0, Math.min(1, e.armor / e.maxArmor));
      ctx.fillStyle = 'rgba(11, 12, 16, 0.8)';
      ctx.fillRect(barX - 1, barY - 6, barW + 2, 4);
      ctx.fillStyle = '#63b3ed';
      ctx.fillRect(barX, barY - 5, barW * armorRatio, 2.5);
    }

    // Weak-point ring when locked
    if (manualAimTargetId && e.id === manualAimTargetId) {
      const wx = e.x + e.weakPointOffset.x;
      const wy = e.y + e.weakPointOffset.y;
      ctx.save();
      ctx.strokeStyle = '#ecc94b';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(wx, wy, 7, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  // Ranged enemy projectiles
  if (projectiles.length > 0) {
    ctx.save();
    for (let i = 0; i < projectiles.length; i++) {
      const p = projectiles[i];
      if (!p.alive) continue;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}
