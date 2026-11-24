import type { ActiveDialogueBubble } from '@/engine/systems/DialogueSystem';

function drawRoundedBox(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/**
 * Renders top-band speech bubbles on Canvas 2D cleanly above the central combat zone.
 */
export function drawSpeechBubbles(
  ctx: CanvasRenderingContext2D,
  bubbles: readonly ActiveDialogueBubble[]
): void {
  if (!bubbles || bubbles.length === 0) return;

  ctx.save();
  for (const b of bubbles) {
    if (b.alpha <= 0.02) continue;

    ctx.globalAlpha = b.alpha;
    const boxX = b.x;
    const boxY = b.y;
    const boxW = 648;
    const lineCount = b.lines.length;
    const boxH = lineCount === 1 ? 26 : 38;

    drawRoundedBox(ctx, boxX, boxY, boxW, boxH, 7);
    ctx.fillStyle = 'rgba(15, 20, 32, 0.88)';
    ctx.fill();
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = 'rgba(236, 201, 75, 0.78)';
    ctx.stroke();

    // Speaker tag pill on left
    ctx.fillStyle = '#dd6b20';
    drawRoundedBox(ctx, boxX + 6, boxY + 5, 50, boxH - 10, 4);
    ctx.fill();

    ctx.fillStyle = '#fffaf0';
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(b.speaker, boxX + 31, boxY + boxH / 2);

    // Dialogue text lines
    ctx.fillStyle = '#fefcbf';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    if (lineCount === 1) {
      ctx.fillText(b.lines[0], boxX + 64, boxY + 7);
    } else {
      ctx.fillText(b.lines[0], boxX + 64, boxY + 5);
      ctx.fillText(b.lines[1] ?? '', boxX + 64, boxY + 20);
    }
  }
  ctx.restore();
}
