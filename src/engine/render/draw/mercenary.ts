import type {
  MercenaryRuntimeState,
  MercenaryVisualShot,
} from '@/engine/systems/MercenarySystem';
import { WALKER_ANCHOR_X, WALKER_GROUND_Y } from './sandwalker';

function drawMercenarySilhouette(
  ctx: CanvasRenderingContext2D,
  rt: MercenaryRuntimeState,
  timeSec: number
): void {
  const bob = rt.attackFlashTimer > 0 ? -2 : Math.sin(timeSec * 4 + rt.x * 0.05) * 0.8;
  const x = rt.x;
  const y = rt.y + bob;

  ctx.save();
  ctx.translate(x, y);

  // Subtle shadow / ground anchor for ground units
  if (rt.id === 'tarik' || rt.id === 'harun') {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
    ctx.beginPath();
    ctx.ellipse(0, 1, 9, 3, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Body cloak / tunic
  const body = new Path2D();
  body.moveTo(-6, 0);
  body.lineTo(-4, -15);
  body.lineTo(4, -15);
  body.lineTo(6, 0);
  body.closePath();
  ctx.fillStyle = rt.colorPrimary;
  ctx.fill(body);
  ctx.strokeStyle = rt.colorAccent;
  ctx.lineWidth = 1.2;
  ctx.stroke(body);

  // Head
  ctx.fillStyle = '#fbd38d';
  ctx.beginPath();
  ctx.arc(0, -19, 3.6, 0, Math.PI * 2);
  ctx.fill();

  // Role-specific equipment silhouette (Shield / Bow / Staff / Cross / Camel Pack)
  switch (rt.silhouette) {
    case 'SHIELD': {
      // Tarik: Front kite shield
      const shield = new Path2D();
      shield.moveTo(4, -16);
      shield.lineTo(12, -16);
      shield.lineTo(11, -6);
      shield.lineTo(8, -2);
      shield.lineTo(4, -6);
      shield.closePath();
      ctx.fillStyle = '#3182ce';
      ctx.fill(shield);
      ctx.strokeStyle = '#ecc94b';
      ctx.lineWidth = 1.3;
      ctx.stroke(shield);
      break;
    }
    case 'BOW': {
      // Sera: Curved archer bow
      ctx.strokeStyle = '#ecc94b';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.arc(5, -12, 7, -Math.PI * 0.45, Math.PI * 0.45);
      ctx.stroke();
      // Arrow nocked
      ctx.strokeStyle = '#9ae6b4';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(2, -12);
      ctx.lineTo(13, -12);
      ctx.stroke();
      break;
    }
    case 'STAFF': {
      // Zara: Tall golden sun-orb staff
      ctx.strokeStyle = '#ecc94b';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(6, 0);
      ctx.lineTo(6, -24);
      ctx.stroke();
      ctx.fillStyle = '#f6ad55';
      ctx.beginPath();
      ctx.arc(6, -25, 3, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'CROSS': {
      // Lili: Radiant healer cross / ankh emblem
      ctx.strokeStyle = '#81e6d9';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(7, -20);
      ctx.lineTo(7, -8);
      ctx.moveTo(3, -15);
      ctx.lineTo(11, -15);
      ctx.stroke();
      break;
    }
    case 'PACK': {
      // Harun: Merchant pack / saddle bag + gold trim
      ctx.fillStyle = '#975a16';
      ctx.fillRect(-11, -14, 7, 10);
      ctx.strokeStyle = '#ecc94b';
      ctx.lineWidth = 1.2;
      ctx.strokeRect(-11, -14, 7, 10);
      ctx.fillStyle = '#ecc94b';
      ctx.beginPath();
      ctx.arc(-7.5, -9, 1.8, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
  }

  // Skill activation aura flash
  if (rt.skillFlashTimer > 0) {
    ctx.strokeStyle = rt.colorAccent;
    ctx.lineWidth = 1.6;
    ctx.globalAlpha = Math.min(1, rt.skillFlashTimer * 2);
    ctx.beginPath();
    ctx.arc(0, -12, 13, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();
}

function drawVisualShots(
  ctx: CanvasRenderingContext2D,
  shots: readonly MercenaryVisualShot[]
): void {
  if (shots.length === 0) return;

  ctx.save();
  for (let i = 0; i < shots.length; i++) {
    const s = shots[i];
    const t = Math.min(1, s.age / s.maxLife);
    const alpha = Math.max(0, 1 - t);
    ctx.globalAlpha = alpha;

    if (s.kind === 'ARROW') {
      const cx = s.fromX + (s.toX - s.fromX) * t;
      const cy = s.fromY + (s.toY - s.fromY) * t;
      const angle = Math.atan2(s.toY - s.fromY, s.toX - s.fromX);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(angle);
      ctx.strokeStyle = s.isCrit ? '#fef08a' : s.color;
      ctx.lineWidth = s.isCrit ? 2.2 : 1.5;
      ctx.beginPath();
      ctx.moveTo(-8, 0);
      ctx.lineTo(4, 0);
      ctx.stroke();
      ctx.restore();
    } else if (s.kind === 'ORB') {
      if (s.aoeRadius) {
        const r = s.aoeRadius * (0.3 + 0.7 * t);
        ctx.strokeStyle = s.color;
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.arc(s.toX, s.toY, r, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        const cx = s.fromX + (s.toX - s.fromX) * t;
        const cy = s.fromY + (s.toY - s.fromY) * t;
        ctx.fillStyle = s.color;
        ctx.beginPath();
        ctx.arc(cx, cy, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (s.kind === 'SLASH') {
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(s.fromX + 10, s.fromY, 18, -0.9, 0.9);
      ctx.stroke();
    } else if (s.kind === 'HEAL_PULSE') {
      const r = (s.aoeRadius ?? 42) * (0.4 + 0.6 * t);
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(s.toX, s.toY, r, 0, Math.PI * 2);
      ctx.stroke();
    } else if (s.kind === 'COIN_FLING') {
      const cx = s.fromX + (s.toX - s.fromX) * t;
      const cy = s.fromY + (s.toY - s.fromY) * t - Math.sin(t * Math.PI) * 18;
      ctx.fillStyle = s.color;
      ctx.beginPath();
      ctx.arc(cx, cy, 3.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

export function drawMercenaries(
  ctx: CanvasRenderingContext2D,
  runtimes: readonly MercenaryRuntimeState[],
  shots: readonly MercenaryVisualShot[],
  synergyActive: boolean,
  timeSec: number
): void {
  const active = runtimes.filter((r) => r.isActive);
  if (active.length === 0 && shots.length === 0) return;

  // Expedition Synergy Golden Ring & 5-Star Crest (Feature #23)
  if (synergyActive) {
    const pulse = 0.28 + 0.12 * Math.sin(timeSec * 4);
    ctx.save();
    ctx.strokeStyle = `rgba(236, 201, 75, ${pulse.toFixed(3)})`;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.ellipse(WALKER_ANCHOR_X, WALKER_GROUND_Y + 2, 74, 12, 0, 0, Math.PI * 2);
    ctx.stroke();

    // 5-Star Synergy Crest above deck
    const crestY = WALKER_GROUND_Y - 122 + Math.sin(timeSec * 3) * 1.5;
    for (let s = 0; s < 5; s++) {
      const sx = WALKER_ANCHOR_X - 16 + s * 8;
      ctx.fillStyle = '#fef08a';
      ctx.beginPath();
      ctx.arc(sx, crestY, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  for (let i = 0; i < active.length; i++) {
    drawMercenarySilhouette(ctx, active[i], timeSec);
  }

  drawVisualShots(ctx, shots);
}
