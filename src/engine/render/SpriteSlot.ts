export interface SpriteTransform {
  x: number;
  y: number;
  rotation?: number;
  scaleX?: number;
  scaleY?: number;
  alpha?: number;
}

export type ProceduralDrawFn<TState = unknown> = (
  ctx: CanvasRenderingContext2D,
  transform: SpriteTransform,
  state: TState
) => void;

export interface SpriteOverride<TState = unknown> {
  readonly id: string;
  draw(ctx: CanvasRenderingContext2D, transform: SpriteTransform, state: TState): boolean;
}

export class SpriteSlot<TState = unknown> {
  public readonly slotId: string;
  private readonly proceduralDraw: ProceduralDrawFn<TState>;
  private override: SpriteOverride<TState> | null = null;

  constructor(slotId: string, proceduralDraw: ProceduralDrawFn<TState>) {
    this.slotId = slotId;
    this.proceduralDraw = proceduralDraw;
  }

  public setOverride(override: SpriteOverride<TState> | null): void {
    this.override = override;
  }

  public hasOverride(): boolean {
    return this.override !== null;
  }

  public render(
    ctx: CanvasRenderingContext2D,
    transform: SpriteTransform,
    state: TState
  ): void {
    if (this.override && this.override.draw(ctx, transform, state)) {
      return;
    }
    this.proceduralDraw(ctx, transform, state);
  }
}

export class SpriteSlotRegistry {
  private readonly slots: Map<string, SpriteSlot<any>> = new Map();

  public register<TState>(slot: SpriteSlot<TState>): void {
    this.slots.set(slot.slotId, slot);
  }

  public get<TState>(slotId: string): SpriteSlot<TState> | undefined {
    return this.slots.get(slotId) as SpriteSlot<TState> | undefined;
  }

  public listSlotIds(): string[] {
    return Array.from(this.slots.keys());
  }
}
