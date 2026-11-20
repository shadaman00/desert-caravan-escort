import type { BossAddInstance, BossRenderSnapshot } from '@/engine/systems/BossSystem';
import { WALKER_ANCHOR_X, WALKER_GROUND_Y } from '@/engine/render/draw/sandwalker';

function setDashSafe(ctx: CanvasRenderingContext2D, segments: number[]): void {
  if (typeof ctx.setLineDash === 'function') {
    ctx.setLineDash(segments);
  }
}

function drawVarkaArmoredCar(
  ctx: CanvasRenderingContext2D,
  boss: BossRenderSnapshot,
  timeSec: number
): void {
  const bob = Math.sin(timeSec * 5) * 1.5;
  ctx.save();
  ctx.translate(boss.x, boss.y + bob);

  // Armored ironclad hull
  const hull = new Path2D();
  hull.moveTo(-42, 16);
  hull.lineTo(-48, -6);
  hull.lineTo(-26, -24);
  hull.lineTo(30, -24);
  hull.lineTo(44, 0);
  hull.lineTo(42, 18);
  hull.closePath();
  ctx.fillStyle = '#2d3748';
  ctx.fill(hull);
  ctx.strokeStyle = boss.armor > 0 ? '#90cdf4' : '#e53e3e';
  ctx.lineWidth = 2.2;
  ctx.stroke(hull);

  // Front spiked ram plow
  const plow = new Path2D();
  plow.moveTo(-42, 18);
  plow.lineTo(-60, 22);
  plow.lineTo(-48, -2);
  plow.closePath();
  ctx.fillStyle = '#975a16';
  ctx.fill(plow);
  ctx.strokeStyle = '#f6ad55';
  ctx.lineWidth = 1.5;
  ctx.stroke(plow);

  // Turret cannon pointing left toward walker
  ctx.fillStyle = '#4a5568';
  ctx.fillRect(-34, -22, 24, 9);
  ctx.strokeStyle = '#cbd5e0';
  ctx.strokeRect(-34, -22, 24, 9);

  // Weak point glowing engine hatch
  ctx.fillStyle = '#f6ad55';
  ctx.beginPath();
  ctx.arc(boss.weakPointOffset.x, boss.weakPointOffset.y, 7, 0, Math.PI * 2);
  ctx.fill();

  // 3 spiked wheels aligned to ground
  const wheelY = WALKER_GROUND_Y - boss.y - 6;
  const wheelXs = [-26, 2, 28];
  for (let i = 0; i < wheelXs.length; i++) {
    ctx.fillStyle = '#1a202c';
    ctx.beginPath();
    ctx.arc(wheelXs[i], wheelY, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#a0aec0';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  ctx.restore();
}

function drawScorpionRex(
  ctx: CanvasRenderingContext2D,
  boss: BossRenderSnapshot,
  timeSec: number
): void {
  const scuttle = Math.sin(timeSec * 6) * 2.5;
  ctx.save();
  ctx.translate(boss.x, boss.y);

  // 4 chitin legs per side
  ctx.strokeStyle = '#4a5568';
  ctx.lineWidth = 3;
  for (let l = -1.5; l <= 1.5; l += 1) {
    const dir = l % 2 === 0 ? scuttle : -scuttle;
    ctx.beginPath();
    ctx.moveTo(l * 14, 6);
    ctx.lineTo(l * 17 - 6, 30 + dir);
    ctx.stroke();
  }

  // Obsidian armored carapace
  const shell = new Path2D();
  shell.moveTo(-36, 8);
  shell.lineTo(-22, -16);
  shell.lineTo(18, -18);
  shell.lineTo(38, 4);
  shell.lineTo(28, 18);
  shell.lineTo(-26, 18);
  shell.closePath();
  ctx.fillStyle = '#1a202c';
  ctx.fill(shell);
  ctx.strokeStyle = boss.armor > 0 ? '#63b3ed' : '#f6ad55';
  ctx.lineWidth = 2.4;
  ctx.stroke(shell);

  // Twin forward pincers
  ctx.strokeStyle = '#718096';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(-30, 4);
  ctx.lineTo(-50, -8 + scuttle * 0.4);
  ctx.lineTo(-42, -18);
  ctx.stroke();

  // Arched segmented tail leading to venom stinger weak point
  ctx.strokeStyle = '#2d3748';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(22, -6);
  ctx.quadraticCurveTo(44, -52, boss.weakPointOffset.x, boss.weakPointOffset.y);
  ctx.stroke();

  // Glowing venom sac weak point
  ctx.fillStyle = '#ecc94b';
  ctx.beginPath();
  ctx.arc(boss.weakPointOffset.x, boss.weakPointOffset.y, 7.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawMirageSpiritKing(
  ctx: CanvasRenderingContext2D,
  boss: BossRenderSnapshot,
  timeSec: number
): void {
  const hover = Math.sin(timeSec * 3.2) * 5;
  ctx.save();
  ctx.translate(boss.x, boss.y + hover);

  // Outer spectral aura
  const aura = ctx.createRadialGradient(0, 0, 6, 0, 0, 46);
  aura.addColorStop(0, 'rgba(125, 211, 252, 0.8)');
  aura.addColorStop(0.55, 'rgba(128, 90, 213, 0.4)');
  aura.addColorStop(1, 'rgba(128, 90, 213, 0)');
  ctx.fillStyle = aura;
  ctx.beginPath();
  ctx.arc(0, 0, 46, 0, Math.PI * 2);
  ctx.fill();

  // Faceted amethyst crystal body
  const crystal = new Path2D();
  crystal.moveTo(0, -34);
  crystal.lineTo(24, -4);
  crystal.lineTo(14, 30);
  crystal.lineTo(-14, 30);
  crystal.lineTo(-24, -4);
  crystal.closePath();
  ctx.fillStyle = '#553c9a';
  ctx.fill(crystal);
  ctx.strokeStyle = '#7dd3fc';
  ctx.lineWidth = 2.2;
  ctx.stroke(crystal);

  // Golden crown prism weak point
  ctx.fillStyle = '#ecc94b';
  ctx.beginPath();
  ctx.arc(boss.weakPointOffset.x, boss.weakPointOffset.y, 7, 0, Math.PI * 2);
  ctx.fill();

  // 6 orbiting shards
  for (let i = 0; i < 6; i++) {
    const angle = timeSec * 2.4 + (i * Math.PI * 2) / 6;
    ctx.fillStyle = '#bae6fd';
    ctx.beginPath();
    ctx.arc(Math.cos(angle) * 34, Math.sin(angle) * 20, 3.6, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function drawGreatSandworm(
  ctx: CanvasRenderingContext2D,
  boss: BossRenderSnapshot,
  timeSec: number
): void {
  // Cratered sand sinkhole at ground Y
  ctx.save();
  ctx.fillStyle = 'rgba(151, 90, 22, 0.55)';
  ctx.beginPath();
  if (typeof ctx.ellipse === 'function') {
    ctx.ellipse(boss.x, WALKER_GROUND_Y, 54, 14, 0, 0, Math.PI * 2);
  } else {
    ctx.arc(boss.x, WALKER_GROUND_Y, 30, 0, Math.PI * 2);
  }
  ctx.fill();
  ctx.restore();

  // Telegraph lunge warning corridor (Phase 1 1.5s lunge)
  if (boss.telegraphActive && boss.patternKind === 'WORM_LUNGE') {
    ctx.save();
    ctx.fillStyle = 'rgba(229, 62, 62, 0.22)';
    ctx.fillRect(WALKER_ANCHOR_X, WALKER_GROUND_Y - 56, boss.x - WALKER_ANCHOR_X, 56);
    ctx.strokeStyle = '#fc8181';
    ctx.lineWidth = 2;
    setDashSafe(ctx, [8, 5]);
    ctx.beginPath();
    ctx.moveTo(boss.x - 20, boss.y);
    ctx.lineTo(WALKER_ANCHOR_X + 20, boss.y);
    ctx.stroke();
    setDashSafe(ctx, []);
    ctx.restore();
  }

  // Sand breath cone (Phase 2)
  if (Number.isFinite(boss.breathVisualTimer) && boss.breathVisualTimer > 0) {
    ctx.save();
    const grad = ctx.createLinearGradient(boss.x - 30, boss.y, WALKER_ANCHOR_X, boss.y);
    grad.addColorStop(0, 'rgba(246, 173, 85, 0.85)');
    grad.addColorStop(1, 'rgba(237, 137, 54, 0.08)');
    ctx.fillStyle = grad;
    const cone = new Path2D();
    cone.moveTo(boss.x - 28, boss.y - 10);
    cone.lineTo(WALKER_ANCHOR_X + 10, boss.y - 44);
    cone.lineTo(WALKER_ANCHOR_X + 10, boss.y + 24);
    cone.closePath();
    ctx.fill(cone);
    ctx.restore();
  }

  const slumpY = boss.isGroggy ? 18 : 0;
  ctx.save();
  ctx.translate(boss.x, boss.y + slumpY);

  // 6 undulating segmented worm rings
  for (let s = 5; s >= 1; s--) {
    const sway = Math.sin(timeSec * 3.5 + s * 0.7) * 5;
    const sx = s * 10;
    const sy = s * 4 + sway * 0.4;
    const r = Math.max(18, 42 - s * 3.5);
    ctx.fillStyle = boss.phase === 3 ? '#553c9a' : '#744210';
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = boss.phase === 1 && boss.armor > 0 ? '#90cdf4' : '#d69e2e';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // Worm Head
  if (boss.phase === 1) {
    const head = new Path2D();
    head.moveTo(-40, 12);
    head.lineTo(-34, -28);
    head.lineTo(10, -34);
    head.lineTo(30, -8);
    head.lineTo(24, 24);
    head.lineTo(-26, 26);
    head.closePath();
    ctx.fillStyle = boss.armor > 0 ? '#2d3748' : '#744210';
    ctx.fill(head);
    ctx.strokeStyle = boss.armor > 0 ? '#63b3ed' : '#f6ad55';
    ctx.lineWidth = 2.6;
    ctx.stroke(head);
  } else {
    // Phase 2 & 3 open toothy maw exposing core
    ctx.fillStyle = '#4a2511';
    ctx.beginPath();
    ctx.arc(-4, -4, 34, 0, Math.PI * 2);
    ctx.fill();

    // Solar Core radial gradient in Phase 2
    const coreGrad = ctx.createRadialGradient(
      boss.weakPointOffset.x,
      boss.weakPointOffset.y,
      3,
      boss.weakPointOffset.x,
      boss.weakPointOffset.y,
      18
    );
    coreGrad.addColorStop(0, '#fff5f5');
    coreGrad.addColorStop(0.5, boss.phase === 2 ? '#f6ad55' : '#b794f4');
    coreGrad.addColorStop(1, 'rgba(229, 62, 62, 0)');
    ctx.fillStyle = coreGrad;
    ctx.beginPath();
    ctx.arc(boss.weakPointOffset.x, boss.weakPointOffset.y, 18, 0, Math.PI * 2);
    ctx.fill();
  }

  // Groggy stun stars
  if (boss.isGroggy) {
    for (let i = 0; i < 3; i++) {
      const a = timeSec * 5 + (i * Math.PI * 2) / 3;
      ctx.fillStyle = '#ecc94b';
      ctx.beginPath();
      ctx.arc(Math.cos(a) * 24 - 10, -36 + Math.sin(a) * 7, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.restore();
}

function drawBossAdds(ctx: CanvasRenderingContext2D, adds: readonly BossAddInstance[], timeSec: number): void {
  for (let i = 0; i < adds.length; i++) {
    const add = adds[i];
    if (
      !add ||
      !add.alive ||
      !Number.isFinite(add.x) ||
      !Number.isFinite(add.y) ||
      !Number.isFinite(add.radius) ||
      add.radius <= 0 ||
      !Number.isFinite(add.animPhase)
    ) {
      continue;
    }
    ctx.save();
    ctx.translate(add.x, add.y);

    if (add.kind === 'MIRAGE_CLONE') {
      ctx.globalAlpha = 0.65;
      ctx.fillStyle = '#553c9a';
      ctx.beginPath();
      ctx.arc(0, 0, add.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#7dd3fc';
      ctx.lineWidth = 1.6;
      ctx.stroke();
    } else if (add.kind === 'PARASITE') {
      const pulse = 1 + Math.sin(timeSec * 8 + add.animPhase) * 0.1;
      ctx.scale(pulse, pulse);
      ctx.fillStyle = '#6b46c1';
      ctx.beginPath();
      ctx.arc(0, 0, add.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#f687b3';
      ctx.lineWidth = 1.8;
      ctx.stroke();
    } else {
      ctx.fillStyle = '#9b2c2c';
      ctx.beginPath();
      ctx.arc(0, 0, add.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#f6ad55';
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }

    ctx.restore();
  }
}

export function drawBoss(
  ctx: CanvasRenderingContext2D,
  boss: BossRenderSnapshot | null,
  manualAimTargetId: string | null,
  timeSec: number
): void {
  if (
    !boss ||
    !Number.isFinite(boss.x) ||
    !Number.isFinite(boss.y) ||
    !Number.isFinite(boss.radius) ||
    boss.radius < 0 ||
    !Number.isFinite(boss.hp) ||
    !Number.isFinite(boss.maxHp) ||
    !Number.isFinite(boss.armor) ||
    !Number.isFinite(boss.maxArmor) ||
    !boss.weakPointOffset ||
    !Number.isFinite(boss.weakPointOffset.x) ||
    !Number.isFinite(boss.weakPointOffset.y) ||
    !Number.isFinite(timeSec)
  ) {
    return;
  }

  if (boss.id === 'VARKA_ARMORED_CAR') {
    drawVarkaArmoredCar(ctx, boss, timeSec);
  } else if (boss.id === 'SCORPION_REX') {
    drawScorpionRex(ctx, boss, timeSec);
  } else if (boss.id === 'MIRAGE_SPIRIT_KING') {
    drawMirageSpiritKing(ctx, boss, timeSec);
  } else {
    drawGreatSandworm(ctx, boss, timeSec);
  }

  if (Array.isArray(boss.adds) && boss.adds.length > 0) {
    drawBossAdds(ctx, boss.adds, timeSec);
  }

  // Hit flash overlay
  if (Number.isFinite(boss.hitFlashTimer) && boss.hitFlashTimer > 0) {
    ctx.save();
    ctx.globalAlpha = Math.min(0.8, boss.hitFlashTimer / 0.12);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(boss.x, boss.y, boss.radius + 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Canvas fallback HP & Armor bars above boss
  const barW = 72;
  const barX = boss.x - barW * 0.5;
  const barY = boss.y - boss.radius - 18;
  ctx.fillStyle = 'rgba(11, 12, 16, 0.85)';
  ctx.fillRect(barX - 1, barY - 1, barW + 2, 7);
  const hpRatio = boss.maxHp > 0 ? Math.max(0, Math.min(1, boss.hp / boss.maxHp)) : 0;
  ctx.fillStyle = '#e53e3e';
  ctx.fillRect(barX, barY, barW * hpRatio, 5);

  if (boss.maxArmor > 0 && boss.armor > 0) {
    const armorRatio = Math.max(0, Math.min(1, boss.armor / boss.maxArmor));
    ctx.fillStyle = 'rgba(11, 12, 16, 0.85)';
    ctx.fillRect(barX - 1, barY - 7, barW + 2, 5);
    ctx.fillStyle = '#63b3ed';
    ctx.fillRect(barX, barY - 6, barW * armorRatio, 3);
  }

  // Locked weak-point ring
  if (manualAimTargetId && manualAimTargetId === boss.targetId) {
    const slumpY = boss.id === 'GREAT_SANDWORM' && boss.isGroggy ? 18 : 0;
    const wx = boss.x + boss.weakPointOffset.x;
    const wy = boss.y + slumpY + boss.weakPointOffset.y;
    ctx.save();
    ctx.strokeStyle = '#ecc94b';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(wx, wy, 10, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}
