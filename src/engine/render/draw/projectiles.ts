import type { CombatTarget, DamagePopup } from '@/engine/systems/DamageSystem';
import {
  getTargetWeakPointPos,
  type HarpoonProjectile,
  type HeatRayBeamState,
  type ManualAimState,
  type MortarExplosionEffect,
  type MortarShell,
} from '@/engine/systems/TurretSystem';
import { MANUAL_AIM_LOCK_DURATION_SEC, WEAK_POINT_SNAP_RADIUS_PX } from '@/game/data/turrets';

export function drawHeatRayBeam(
  ctx: CanvasRenderingContext2D,
  beam: HeatRayBeamState | null
): void {
  if (!beam || beam.alpha <= 0.01) return;

  const tierScale = beam.tier === 3 ? 2.0 : beam.tier === 2 ? 1.5 : 1.0;

  ctx.save();
  ctx.globalAlpha = beam.alpha;
  ctx.lineCap = 'round';

  // Outer thermal glow
  ctx.strokeStyle = 'rgba(249, 115, 22, 0.35)';
  ctx.lineWidth = 10 * tierScale;
  ctx.beginPath();
  ctx.moveTo(beam.x1, beam.y1);
  ctx.lineTo(beam.x2, beam.y2);
  ctx.stroke();

  // Mid orange laser beam
  ctx.strokeStyle = '#fb923c';
  ctx.lineWidth = 5 * tierScale;
  ctx.beginPath();
  ctx.moveTo(beam.x1, beam.y1);
  ctx.lineTo(beam.x2, beam.y2);
  ctx.stroke();

  // Multi-barrel converging filament lines for Tier 2/3
  if (beam.barrelCount >= 2) {
    const dx = beam.x2 - beam.x1;
    const dy = beam.y2 - beam.y1;
    const len = Math.max(1, Math.hypot(dx, dy));
    const nx = -dy / len;
    const ny = dx / len;
    const offsets = beam.barrelCount === 2 ? [-3.2, 3.2] : [-4.5, 4.5];
    ctx.strokeStyle = 'rgba(254, 240, 138, 0.75)';
    ctx.lineWidth = 1.2;
    for (let i = 0; i < offsets.length; i++) {
      const off = offsets[i];
      ctx.beginPath();
      ctx.moveTo(beam.x1 + nx * off, beam.y1 + ny * off);
      ctx.lineTo(beam.x2 + nx * off * 0.3, beam.y2 + ny * off * 0.3);
      ctx.stroke();
    }
  }

  // Hot white-gold core
  ctx.strokeStyle = '#fefcbf';
  ctx.lineWidth = 2.1 * tierScale;
  ctx.beginPath();
  ctx.moveTo(beam.x1, beam.y1);
  ctx.lineTo(beam.x2, beam.y2);
  ctx.stroke();

  // Muzzle thermal flare
  ctx.fillStyle = '#fef08a';
  ctx.beginPath();
  ctx.arc(beam.x1, beam.y1, 4.5 * tierScale, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

export function drawHarpoons(
  ctx: CanvasRenderingContext2D,
  harpoons: readonly HarpoonProjectile[]
): void {
  if (harpoons.length === 0) return;

  ctx.save();
  for (let i = 0; i < harpoons.length; i++) {
    const h = harpoons[i];

    // Steel tether wire from muzzle to harpoon tail
    ctx.strokeStyle = '#cbd5e0';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(h.originX, h.originY);
    ctx.lineTo(h.x, h.y);
    ctx.stroke();

    // Subtle metallic highlight dash
    ctx.strokeStyle = 'rgba(144, 205, 244, 0.55)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(h.originX, h.originY - 0.8);
    ctx.lineTo(h.x, h.y - 0.8);
    ctx.stroke();

    // Barbed harpoon head
    const angle = Math.atan2(h.vy, h.vx);
    const scale = 1 + (h.tier - 1) * 0.14;
    ctx.save();
    ctx.translate(h.x, h.y);
    ctx.rotate(angle);
    ctx.scale(scale, scale);

    const head = new Path2D();
    head.moveTo(10, 0);
    head.lineTo(-4, -5);
    head.lineTo(-1, -1.8);
    head.lineTo(-8, -1.8);
    head.lineTo(-8, 1.8);
    head.lineTo(-1, 1.8);
    head.lineTo(-4, 5);
    head.closePath();

    ctx.fillStyle = '#e2e8f0';
    ctx.fill(head);
    ctx.strokeStyle = '#63b3ed';
    ctx.lineWidth = 1.2;
    ctx.stroke(head);

    ctx.restore();
  }
  ctx.restore();
}

export function drawMortarsAndExplosions(
  ctx: CanvasRenderingContext2D,
  mortars: readonly MortarShell[],
  explosions: readonly MortarExplosionEffect[]
): void {
  if (mortars.length === 0 && explosions.length === 0) return;

  ctx.save();

  // In-flight shells
  for (let i = 0; i < mortars.length; i++) {
    const m = mortars[i];
    const vyNow = m.vy0 + m.g * m.elapsed;
    const angle = Math.atan2(vyNow, m.vx);
    const scale = 1 + (m.tier - 1) * 0.12;

    // Ground impact preview ring
    ctx.strokeStyle = 'rgba(249, 115, 22, 0.35)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.ellipse(m.targetX, m.targetY, 16, 6, 0, 0, Math.PI * 2);
    ctx.stroke();

    // Shell body + fuse spark
    ctx.save();
    ctx.translate(m.x, m.y);
    ctx.rotate(angle);
    ctx.scale(scale, scale);

    const shell = new Path2D();
    shell.ellipse(0, 0, 6.5, 3.8, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#744210';
    ctx.fill(shell);
    ctx.strokeStyle = '#ecc94b';
    ctx.lineWidth = 1.2;
    ctx.stroke(shell);

    ctx.fillStyle = '#fef08a';
    ctx.beginPath();
    ctx.arc(-6, 0, 2.4, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  // Impact AOE shockwaves
  for (let i = 0; i < explosions.length; i++) {
    const exp = explosions[i];
    const t = Math.min(1, exp.age / exp.maxLife);
    const currentR = exp.radius * (0.28 + 0.72 * t);
    const alpha = Math.max(0, 1 - t);

    const grad = ctx.createRadialGradient(exp.x, exp.y, 4, exp.x, exp.y, currentR);
    grad.addColorStop(0, `rgba(254, 240, 138, ${(0.55 * alpha).toFixed(3)})`);
    grad.addColorStop(0.55, `rgba(249, 115, 22, ${(0.38 * alpha).toFixed(3)})`);
    grad.addColorStop(1, 'rgba(249, 115, 22, 0)');

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(exp.x, exp.y, currentR, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = `rgba(251, 146, 60, ${(0.9 * alpha).toFixed(3)})`;
    ctx.lineWidth = 2.4 * (1 - t * 0.5);
    ctx.beginPath();
    ctx.arc(exp.x, exp.y, currentR, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();
}

export function drawWeakPointReticle(
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

  // Dragging snap-search ring (40px radius)
  if (aimState.isDragging) {
    ctx.strokeStyle = 'rgba(236, 201, 75, 0.55)';
    ctx.lineWidth = 1.4;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.arc(aimState.pointerX, aimState.pointerY, WEAK_POINT_SNAP_RADIUS_PX, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = 'rgba(236, 201, 75, 0.85)';
    ctx.beginPath();
    ctx.arc(aimState.pointerX, aimState.pointerY, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  // Locked weak-point reticle & 2.0s countdown ring
  if (lockedTarget) {
    const wp = getTargetWeakPointPos(lockedTarget);
    const pulse = 1 + 0.1 * Math.sin(timeSec * 8);
    const r = 16 * pulse;
    const ratio = Math.max(
      0,
      Math.min(1, aimState.lockRemainingSec / MANUAL_AIM_LOCK_DURATION_SEC)
    );

    // Countdown arc
    ctx.strokeStyle = '#f56565';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(wp.x, wp.y, r + 4, -Math.PI * 0.5, -Math.PI * 0.5 + Math.PI * 2 * ratio);
    ctx.stroke();

    // 4 Corner brackets
    ctx.strokeStyle = '#ecc94b';
    ctx.lineWidth = 2;
    const b = 6;
    const corners: Array<[number, number, number, number]> = [
      [-1, -1, 1, 1],
      [1, -1, -1, 1],
      [-1, 1, 1, -1],
      [1, 1, -1, -1],
    ];
    for (let i = 0; i < corners.length; i++) {
      const [cx, cy, sx, sy] = corners[i];
      const px = wp.x + cx * r;
      const py = wp.y + cy * r;
      ctx.beginPath();
      ctx.moveTo(px + sx * b, py);
      ctx.lineTo(px, py);
      ctx.lineTo(px, py + sy * b);
      ctx.stroke();
    }

    // Center crosshair dot
    ctx.fillStyle = '#f56565';
    ctx.beginPath();
    ctx.arc(wp.x, wp.y, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

export function drawDamagePopups(
  ctx: CanvasRenderingContext2D,
  popups: readonly DamagePopup[]
): void {
  if (popups.length === 0) return;

  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (let i = 0; i < popups.length; i++) {
    const p = popups[i];
    const t = Math.min(1, p.age / p.maxLife);
    const alpha = Math.max(0, 1 - t * t);
    const fontSize = Math.round(11 * p.scale);

    ctx.globalAlpha = alpha;
    ctx.font = `800 ${fontSize}px system-ui, -apple-system, sans-serif`;
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = 'rgba(11, 12, 16, 0.9)';
    ctx.strokeText(p.text, p.x, p.y);
    ctx.fillStyle = p.color;
    ctx.fillText(p.text, p.x, p.y);
  }

  ctx.restore();
}
