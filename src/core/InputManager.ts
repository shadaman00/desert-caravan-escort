import {
  INPUT_BUFFER_DODGE_SEC,
  INPUT_BUFFER_STANDARD_SEC,
  LAYER2_HEIGHT,
  LOGICAL_WIDTH,
} from '@/data/masterData';

export type BufferedActionKind =
  | 'TURRET_CYCLE'
  | 'TURRET_0'
  | 'TURRET_1'
  | 'TURRET_2'
  | 'VENT_OVERDRIVE'
  | 'DODGE_PARRY'
  | 'SHIELD_ACTIVE'
  | 'EXCAVATE_NEAREST';

export interface LogicalPointerTap {
  x: number;
  y: number;
  remainingSec: number;
}

export interface InputCallbacks {
  onPauseToggle?: () => void;
  onFullscreenToggle?: () => void;
}

/**
 * Cross-platform Input Manager (PRD Section 2 & 6.2).
 * Unifies pointerdown/pointermove/pointerup in Layer 2 (960x404) coordinates
 * alongside keyboard shortcuts and 120ms/150ms input buffering.
 */
export class InputManager {
  private readonly canvas: HTMLCanvasElement;
  private readonly callbacks: InputCallbacks;
  private readonly actionBuffers = new Map<BufferedActionKind, number>();
  private readonly cleanups: Array<() => void> = [];

  private pendingTap: LogicalPointerTap | null = null;
  public pointerX = 0;
  public pointerY = 0;
  public isPointerDown = false;

  constructor(canvas: HTMLCanvasElement, callbacks: InputCallbacks = {}) {
    this.canvas = canvas;
    this.callbacks = callbacks;
    this.bindEvents();
  }

  private clientToBattlefield(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return { x: 0, y: 0 };
    }
    const nx = ((clientX - rect.left) / rect.width) * LOGICAL_WIDTH;
    const ny = ((clientY - rect.top) / rect.height) * LAYER2_HEIGHT;
    return {
      x: Math.max(0, Math.min(LOGICAL_WIDTH, nx)),
      y: Math.max(0, Math.min(LAYER2_HEIGHT, ny)),
    };
  }

  private bindEvents(): void {
    const onPointerDown = (e: PointerEvent) => {
      if (e.button === 2) {
        this.bufferAction('DODGE_PARRY', INPUT_BUFFER_DODGE_SEC);
        return;
      }
      const pt = this.clientToBattlefield(e.clientX, e.clientY);
      this.pointerX = pt.x;
      this.pointerY = pt.y;
      this.isPointerDown = true;
      this.pendingTap = {
        x: pt.x,
        y: pt.y,
        remainingSec: INPUT_BUFFER_STANDARD_SEC,
      };
    };

    const onPointerMove = (e: PointerEvent) => {
      const pt = this.clientToBattlefield(e.clientX, e.clientY);
      this.pointerX = pt.x;
      this.pointerY = pt.y;
    };

    const onPointerUp = () => {
      this.isPointerDown = false;
    };

    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };

    this.canvas.addEventListener('pointerdown', onPointerDown);
    this.canvas.addEventListener('pointermove', onPointerMove);
    this.canvas.addEventListener('pointerup', onPointerUp);
    this.canvas.addEventListener('pointercancel', onPointerUp);
    this.canvas.addEventListener('contextmenu', onContextMenu);
    this.cleanups.push(() => {
      this.canvas.removeEventListener('pointerdown', onPointerDown);
      this.canvas.removeEventListener('pointermove', onPointerMove);
      this.canvas.removeEventListener('pointerup', onPointerUp);
      this.canvas.removeEventListener('pointercancel', onPointerUp);
      this.canvas.removeEventListener('contextmenu', onContextMenu);
    });

    if (typeof window !== 'undefined') {
      const onKeyDown = (e: KeyboardEvent) => {
        const target = e.target as HTMLElement | null;
        if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;

        switch (e.key) {
          case '1':
            this.bufferAction('TURRET_0', INPUT_BUFFER_STANDARD_SEC);
            break;
          case '2':
            this.bufferAction('TURRET_1', INPUT_BUFFER_STANDARD_SEC);
            break;
          case '3':
            this.bufferAction('TURRET_2', INPUT_BUFFER_STANDARD_SEC);
            break;
          case 'q':
          case 'Q':
            this.bufferAction('TURRET_CYCLE', INPUT_BUFFER_STANDARD_SEC);
            break;
          case 'w':
          case 'W':
            this.bufferAction('VENT_OVERDRIVE', INPUT_BUFFER_STANDARD_SEC);
            break;
          case ' ':
            e.preventDefault();
            this.bufferAction('DODGE_PARRY', INPUT_BUFFER_DODGE_SEC);
            break;
          case 'e':
          case 'E':
            // Shield activates immediately (0ms delay spec)
            this.bufferAction('SHIELD_ACTIVE', INPUT_BUFFER_STANDARD_SEC);
            break;
          case 'f':
          case 'F':
            // If Shift+F or Ctrl, allow browser/fullscreen; plain F runs shortcut handler
            this.bufferAction('EXCAVATE_NEAREST', INPUT_BUFFER_STANDARD_SEC);
            break;
          case 'v':
          case 'V':
            this.callbacks.onFullscreenToggle?.();
            break;
          case 'p':
          case 'P':
          case 'Escape':
            this.callbacks.onPauseToggle?.();
            break;
        }
      };
      window.addEventListener('keydown', onKeyDown);
      this.cleanups.push(() => window.removeEventListener('keydown', onKeyDown));
    }
  }

  public bufferAction(action: BufferedActionKind, durationSec = INPUT_BUFFER_STANDARD_SEC): void {
    const existing = this.actionBuffers.get(action) ?? 0;
    this.actionBuffers.set(action, Math.max(existing, durationSec));
  }

  public consumeAction(action: BufferedActionKind): boolean {
    const rem = this.actionBuffers.get(action) ?? 0;
    if (rem > 0) {
      this.actionBuffers.delete(action);
      return true;
    }
    return false;
  }

  public consumeTap(): { x: number; y: number } | null {
    if (!this.pendingTap || this.pendingTap.remainingSec <= 0) {
      this.pendingTap = null;
      return null;
    }
    const res = { x: this.pendingTap.x, y: this.pendingTap.y };
    this.pendingTap = null;
    return res;
  }

  public tick(dt: number): void {
    this.actionBuffers.forEach((rem, key) => {
      const next = rem - dt;
      if (next <= 0) {
        this.actionBuffers.delete(key);
      } else {
        this.actionBuffers.set(key, next);
      }
    });
    if (this.pendingTap) {
      this.pendingTap.remainingSec -= dt;
      if (this.pendingTap.remainingSec <= 0) {
        this.pendingTap = null;
      }
    }
  }

  public destroy(): void {
    while (this.cleanups.length > 0) {
      const fn = this.cleanups.pop();
      fn?.();
    }
    this.actionBuffers.clear();
    this.pendingTap = null;
  }
}
