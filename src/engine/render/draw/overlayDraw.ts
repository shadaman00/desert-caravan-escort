import type { BossRenderSnapshot } from '@/engine/systems/BossSystem';
import type { DamagePopup } from '@/engine/systems/DamageSystem';
import type { EnemyInstance } from '@/engine/systems/SpawnSystem';
import type { ManualAimState } from '@/engine/systems/TurretSystem';
import type { CombatTarget } from '@/engine/systems/DamageSystem';
import { MANUAL_AIM_LOCK_DURATION_SEC, WEAK_POINT_SNAP_RADIUS_PX } from '@/game/data/turrets';

/**
 * Renders a layered glowing dome for Solar Shield on the native Pass-2 overlay.
 */
export function drawCrispSolarShield(
  ctx: CanvasRenderingContext2D,
  anchorX: number,
  groundY: number,
  hullBobY: number,
  solarShieldHp: number,
  maxHp: number,
  timeSec: number
): void {
  if (solarShieldHp <= 0 || maxHp <= 0) return;

  const cx = anchorX;
  const cy = groundY - 68 + hullBobY;
  const rx = 56;
  const ry = 46;
  const ratio = Math.max(0.15, Math.min(1, solarShieldHp / maxHp));
  const pulse = 0.85 + 0.15 * Math.sin(timeSec * 5.2);

  ctx.save();
  ctx.beginPath();
  if (typeof ctx.ellipse === 'function') {
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  } else {
    ctx.arc(cx, cy, ry, 0, Math.PI * 2);
  }

  if (typeof ctx.createRadialGradient === 'function') {
    const domeGrad = ctx.createRadialGradient(cx, cy - 8, 12, cx, cy, rx);
    domeGrad.addColorStop(0, 'rgba(56, 189, 248, 0.04)');
    domeGrad.addColorStop(0.68, `rgba(56, 189, 248, ${(0.12 * pulse).toFixed(3)})`);
    domeGrad.addColorStop(1, `rgba(125, 211, 252, ${(0.34 * pulse).toFixed(3)})`);
    ctx.fillStyle = domeGrad;
  } else {
    ctx.fillStyle = 'rgba(56, 189, 248, 0.18)';
  }
  ctx.fill();

  // Outer energy rim
  ctx.strokeStyle = '#38bdf8';
  ctx.globalAlpha = (0.65 + 0.25 * ratio) * pulse;
  ctx.lineWidth = 2.2;
  ctx.stroke();

  // Inner dashed shimmer arc
  ctx.beginPath();
  if (typeof ctx.ellipse === 'function') {
    ctx.ellipse(cx, cy, rx - 4, ry - 4, 0, -Math.PI * 0.92, Math.PI * 0.12);
  } else {
    ctx.arc(cx, cy, ry - 4, -Math.PI * 0.92, Math.PI * 0.12);
  }
  if (typeof ctx.setLineDash === 'function') {
    ctx.setLineDash([7, 5]);
  }
  ctx.strokeStyle = '#e0f2fe';
  ctx.globalAlpha = 0.72 * pulse;
  ctx.lineWidth = 1.4;
  ctx.stroke();
  if (typeof ctx.setLineDash === 'function') {
    ctx.setLineDash([]);
  }

  ctx.restore();
}

/**
 * Renders crisp 1:1 native-resolution HP and Armor bars above regular wave enemies.
 */
export function drawCrispEnemyBars(
  ctx: CanvasRenderingContext2D,
  enemies: readonly EnemyInstance[]
): void {
  if (enemies.length === 0) return;

  ctx.save();
  const barW = 34;
  const barH = 4;

  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    if (!e.alive) continue;

    const barX = Math.round(e.x - barW * 0.5);
    const barY = Math.round(e.y - e.radius - 13);

    // High-contrast dark border
    ctx.fillStyle = '#0b0c10';
    ctx.fillRect(barX - 1, barY - 1, barW + 2, barH + 2);

    const hpRatio = e.maxHp > 0 ? Math.max(0, Math.min(1, e.hp / e.maxHp)) : 0;
    const fillW = Math.round(barW * hpRatio);
    ctx.fillStyle = hpRatio > 0.5 ? '#48bb78' : hpRatio > 0.25 ? '#ecc94b' : '#f56565';
    if (fillW > 0) {
      ctx.fillRect(barX, barY, fillW, barH);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
      ctx.fillRect(barX, barY, fillW, 1);
    }

    if (e.maxArmor > 0 && e.armor > 0) {
      const armorRatio = Math.max(0, Math.min(1, e.armor / e.maxArmor));
      const aFillW = Math.round(barW * armorRatio);
      const armorY = barY - 5;
      ctx.fillStyle = '#0b0c10';
      ctx.fillRect(barX - 1, armorY - 1, barW + 2, 5);
      ctx.fillStyle = '#63b3ed';
      ctx.fillRect(barX, armorY, Math.max(1, aFillW), 3);
    }
  }

  ctx.restore();
}

/**
 * Renders high-visibility boss weak-point pulse beacon and attack telegraph corridor.
 */
export function drawCrispBossTelegraph(
  ctx: CanvasRenderingContext2D,
  boss: BossRenderSnapshot | null,
  walkerAnchorX: number,
  walkerGroundY: number,
  timeSec: number
): void {
  if (!boss) return;

  const wpX = boss.x + boss.weakPointOffset.x;
  const wpY = boss.y + (boss.id === 'MIRAGE_SPIRIT_KING' ? Math.sin(timeSec * 3.2) * 5 : 0) + boss.weakPointOffset.y;

  ctx.save();

  // Subtle high-contrast weak-point pulse ring so players notice weak spot
  const ringR = 9 + Math.sin(timeSec * 6) * 1.5;
  ctx.beginPath();
  ctx.arc(wpX, wpY, ringR, 0, Math.PI * 2);
  ctx.strokeStyle = boss.isGroggy ? '#fef08a' : '#fc8181';
  ctx.lineWidth = 1.6;
  ctx.stroke();

  if (boss.telegraphActive) {
    const startX = walkerAnchorX + 28;
    const endX = Math.max(startX + 40, boss.x - 16);
    const laneTop = walkerGroundY - 80;
    const laneH = 44;
    const progress = Math.max(0, Math.min(1, boss.telegraphProgress));

    // Danger corridor fill + charge sweep
    ctx.fillStyle = `rgba(229, 62, 62, ${(0.14 + 0.14 * progress).toFixed(3)})`;
    ctx.fillRect(startX, laneTop, endX - startX, laneH);

    const sweepW = Math.round((endX - startX) * progress);
    if (sweepW > 0) {
      ctx.fillStyle = 'rgba(245, 101, 101, 0.22)';
      ctx.fillRect(endX - sweepW, laneTop, sweepW, laneH);
    }

    // Dashed warning borders
    if (typeof ctx.setLineDash === 'function') {
      ctx.setLineDash([8, 5]);
    }
    ctx.strokeStyle = '#fc8181';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(startX, laneTop);
    ctx.lineTo(endX, laneTop);
    ctx.moveTo(startX, laneTop + laneH);
    ctx.lineTo(endX, laneTop + laneH);
    ctx.stroke();
    if (typeof ctx.setLineDash === 'function') {
      ctx.setLineDash([]);
    }

    // Pulsing (!) warning badge above boss head
    const badgeX = boss.x - 18;
    const badgeY = boss.y - boss.radius - 16;
    const pulse = 1 + 0.08 * Math.sin(timeSec * 14);
    ctx.save();
    ctx.translate(badgeX, badgeY);
    ctx.scale(pulse, pulse);
    ctx.beginPath();
    ctx.moveTo(0, -10);
    ctx.lineTo(10, 0);
    ctx.lineTo(0, 10);
    ctx.lineTo(-10, 0);
    ctx.closePath();
    ctx.fillStyle = '#e53e3e';
    ctx.fill();
    ctx.strokeStyle = '#fef08a';
    ctx.lineWidth = 1.6;
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('!', 0, 1);
    ctx.restore();
  }

  ctx.restore();
}

/**
 * Renders crisp native-resolution manual drag snap ring and locked weak-point brackets.
 */
export function drawCrispWeakPointReticle(
  ctx: CanvasRenderingContext2D,
  aimState: ManualAimState,
  targets: readonly CombatTarget[],
  timeSec: number
): void {
  const lockedTarget = aimState.lockedTargetId
    ? targets.find((t) => t.id === aimState.lockedTargetId && t.alive)
    : undefined;
  if (!aimState.isDragging && !lockedTarget) return;

  ctx.save();

  if (aimState.isDragging) {
    const cx = aimState.pointerX;
    const cy = aimState.pointerY;
    ctx.beginPath();
    ctx.arc(cx, cy, WEAK_POINT_SNAP_RADIUS_PX, 0, Math.PI * 2);
    if (typeof ctx.setLineDash === 'function') {
      ctx.setLineDash([6, 4]);
    }
    ctx.strokeStyle = 'rgba(254, 240, 138, 0.72)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    if (typeof ctx.setLineDash === 'function') {
      ctx.setLineDash([]);
    }

    ctx.strokeStyle = '#ecc94b';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx - 7, cy);
    ctx.lineTo(cx + 7, cy);
    ctx.moveTo(cx, cy - 7);
    ctx.lineTo(cx, cy + 7);
    ctx.stroke();
  }

  if (lockedTarget) {
    const wpX = Math.round(lockedTarget.x + (lockedTarget.weakPointOffset?.x ?? 0));
    const wpY = Math.round(lockedTarget.y + (lockedTarget.weakPointOffset?.y ?? 0));
    const offset = 13 + Math.sin(timeSec * 8) * 1.5;
    const len = 6;
    const ratio = Math.max(
      0,
      Math.min(1, aimState.lockRemainingSec / MANUAL_AIM_LOCK_DURATION_SEC)
    );

    const drawCorners = (color: string, lineWidth: number) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      ctx.beginPath();
      // Top-left
      ctx.moveTo(wpX - offset, wpY - offset + len);
      ctx.lineTo(wpX - offset, wpY - offset);
      ctx.lineTo(wpX - offset + len, wpY - offset);
      // Top-right
      ctx.moveTo(wpX + offset - len, wpY - offset);
      ctx.lineTo(wpX + offset, wpY - offset);
      ctx.lineTo(wpX + offset, wpY - offset + len);
      // Bottom-left
      ctx.moveTo(wpX - offset, wpY + offset - len);
      ctx.lineTo(wpX - offset, wpY + offset);
      ctx.lineTo(wpX - offset + len, wpY + offset);
      // Bottom-right
      ctx.moveTo(wpX + offset - len, wpY + offset);
      ctx.lineTo(wpX + offset, wpY + offset);
      ctx.lineTo(wpX + offset, wpY + offset - len);
      ctx.stroke();
    };

    drawCorners('#0b0c10', 3.6);
    drawCorners('#fef08a', 1.8);

    // Crisp lock duration countdown bar below bracket
    const barW = 28;
    const barY = Math.round(wpY + offset + 4);
    ctx.fillStyle = '#0b0c10';
    ctx.fillRect(wpX - barW / 2 - 1, barY - 1, barW + 2, 5);
    ctx.fillStyle = '#f56565';
    ctx.fillRect(wpX - barW / 2, barY, Math.round(barW * ratio), 3);
  }

  ctx.restore();
}

/**
 * Renders razor-sharp outlined floating damage numbers at 1:1 native DPR resolution.
 */
export function drawCrispDamagePopups(
  ctx: CanvasRenderingContext2D,
  popups: readonly DamagePopup[]
): void {
  if (popups.length === 0) return;

  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';

  for (let i = 0; i < popups.length; i++) {
    const p = popups[i];
    const t = Math.min(1, p.age / p.maxLife);
    const alpha = Math.max(0, 1 - t * t);
    const fontSize = Math.max(12, Math.round(13.5 * p.scale));
    const x = Math.round(p.x);
    const y = Math.round(p.y);

    ctx.globalAlpha = alpha;
    ctx.font = `800 ${fontSize}px 'Pretendard', system-ui, monospace`;
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = '#0b0c10';
    if (typeof ctx.strokeText === 'function') {
      ctx.strokeText(p.text, x, y);
    }
    ctx.fillStyle = p.color;
    ctx.fillText(p.text, x, y);
  }

  ctx.restore();
}
