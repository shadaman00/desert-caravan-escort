export const MAX_BUBBLE_CHARS = 35;
export const MAX_BUBBLE_LINES = 2;
export const BUBBLE_HOLD_SEC = 3.5;
export const BUBBLE_FADE_SEC = 0.3;
export const BUBBLE_TOTAL_SEC = BUBBLE_HOLD_SEC + BUBBLE_FADE_SEC;
export const MAX_CONCURRENT_BUBBLES = 2;

// 430x932 viewport shell coordinates: Zone B starts at y = 140
export const ZONE_B_ORIGIN_Y = 140;
export const FORBIDDEN_COMBAT_BAND_MIN_Y = 240;
export const FORBIDDEN_COMBAT_BAND_MAX_Y = 480;

// Zone B local Y slots: 6px -> 146px shellY, 50px -> 190px shellY (both strictly <= 240 bottom)
const ZONE_B_SLOT_Y = [6, 50] as const;

export interface ActiveDialogueBubble {
  readonly id: string;
  readonly slotIndex: 0 | 1;
  readonly speaker: string;
  readonly text: string;
  readonly lines: readonly [string] | readonly [string, string];
  elapsed: number;
  readonly duration: number;
  alpha: number;
  readonly x: number;
  readonly y: number;
  readonly shellY: number;
}

export interface QueuedDialogueItem {
  readonly id: string;
  readonly speaker: string;
  readonly text: string;
}

export interface DialogueDebugSnapshot {
  activeBalloons: Array<{
    id: string;
    speaker: string;
    text: string;
    y: number;
    remainingSec: number;
  }>;
  queuedCount: number;
}

/**
 * Clamps dialogue text to <= 35 Unicode codepoints (including spaces) and wraps into <= 2 lines.
 */
export function wrapBubbleText(rawText: string): {
  clampedText: string;
  lines: [string] | [string, string];
} {
  const trimmed = (rawText ?? '').trim();
  const codePoints = [...trimmed].slice(0, MAX_BUBBLE_CHARS);
  const clampedText = codePoints.join('');

  if (codePoints.length <= 18) {
    return { clampedText, lines: [clampedText] };
  }

  // Find a natural space split near the middle so both lines stay balanced
  const mid = Math.ceil(codePoints.length / 2);
  let splitIdx = -1;
  for (let offset = 0; offset <= 5; offset++) {
    if (mid + offset < codePoints.length && codePoints[mid + offset] === ' ') {
      splitIdx = mid + offset;
      break;
    }
    if (mid - offset > 4 && codePoints[mid - offset] === ' ') {
      splitIdx = mid - offset;
      break;
    }
  }

  if (splitIdx === -1) {
    splitIdx = mid;
  }

  const line1 = codePoints.slice(0, splitIdx).join('').trim();
  const line2 = codePoints.slice(splitIdx).join('').trim();
  if (!line2) {
    return { clampedText: line1, lines: [line1] };
  }
  return { clampedText, lines: [line1, line2] };
}

/**
 * Ensures any shell-space Y coordinate clears the central combat band [240, 480].
 */
export function computeSafeShellY(requestedShellY: number): number {
  if (
    requestedShellY >= FORBIDDEN_COMBAT_BAND_MIN_Y - 40 &&
    requestedShellY <= FORBIDDEN_COMBAT_BAND_MAX_Y
  ) {
    return ZONE_B_ORIGIN_Y + ZONE_B_SLOT_Y[0];
  }
  return requestedShellY;
}

export class DialogueSystem {
  private activeBubbles: ActiveDialogueBubble[] = [];
  private queue: QueuedDialogueItem[] = [];
  private nextId = 1;

  public enqueue(speaker: string, text: string, id?: string): void {
    const cleanSpeaker = (speaker ?? '').trim() || '대원';
    const { clampedText } = wrapBubbleText(text);
    if (!clampedText) return;

    const itemId = id ?? `dlg_${this.nextId++}`;

    // Deduplicate active or queued items with the exact same caller-specified id
    if (
      id &&
      (this.activeBubbles.some((b) => b.id === id) ||
        this.queue.some((q) => q.id === id))
    ) {
      return;
    }

    if (this.activeBubbles.length < MAX_CONCURRENT_BUBBLES) {
      this.activateBubble({ id: itemId, speaker: cleanSpeaker, text: clampedText });
    } else {
      this.queue.push({ id: itemId, speaker: cleanSpeaker, text: clampedText });
    }
  }

  public update(dt: number): void {
    const safeDt = Number.isFinite(dt) && dt > 0 ? dt : 0;
    if (safeDt <= 0) return;

    for (let i = this.activeBubbles.length - 1; i >= 0; i--) {
      const bubble = this.activeBubbles[i];
      bubble.elapsed += safeDt;

      if (bubble.elapsed >= bubble.duration) {
        this.activeBubbles.splice(i, 1);
        continue;
      }

      if (bubble.elapsed <= BUBBLE_HOLD_SEC) {
        bubble.alpha = 1;
      } else {
        const fadeProgress = (bubble.elapsed - BUBBLE_HOLD_SEC) / BUBBLE_FADE_SEC;
        bubble.alpha = Math.max(0, 1 - fadeProgress);
      }
    }

    while (this.activeBubbles.length < MAX_CONCURRENT_BUBBLES && this.queue.length > 0) {
      const next = this.queue.shift()!;
      this.activateBubble(next);
    }
  }

  public clear(): void {
    this.activeBubbles = [];
    this.queue = [];
  }

  public getActiveBubbles(): readonly ActiveDialogueBubble[] {
    return this.activeBubbles;
  }

  public getQueuedCount(): number {
    return this.queue.length;
  }

  public getDebugSnapshot(): DialogueDebugSnapshot {
    return {
      activeBalloons: this.activeBubbles.map((b) => ({
        id: b.id,
        speaker: b.speaker,
        text: b.text,
        y: b.shellY,
        remainingSec: Math.max(0, Math.round((b.duration - b.elapsed) * 100) / 100),
      })),
      queuedCount: this.queue.length,
    };
  }

  private activateBubble(item: QueuedDialogueItem): void {
    const usedSlots = new Set(this.activeBubbles.map((b) => b.slotIndex));
    const slotIndex: 0 | 1 = usedSlots.has(0) ? 1 : 0;
    const zoneBY = ZONE_B_SLOT_Y[slotIndex];
    const shellY = computeSafeShellY(ZONE_B_ORIGIN_Y + zoneBY);
    const { clampedText, lines } = wrapBubbleText(item.text);

    this.activeBubbles.push({
      id: item.id,
      slotIndex,
      speaker: item.speaker,
      text: clampedText,
      lines,
      elapsed: 0,
      duration: BUBBLE_TOTAL_SEC,
      alpha: 1,
      x: 16,
      y: zoneBY,
      shellY,
    });
  }
}
