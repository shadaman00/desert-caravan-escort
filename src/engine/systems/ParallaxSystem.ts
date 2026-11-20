import type { TimeOfDay } from '@/store/types';
import { parallaxDx } from '@/game/formulas';
import {
  PALETTES,
  PaletteController,
  PALETTE_LERP_DURATION,
} from '@/engine/render/palette';
import {
  DESERT_LAYER_SPECS,
  PARALLAX_FACTORS,
  PARALLAX_TILE_WIDTH,
  ZONE_B_HEIGHT,
  ZONE_B_WIDTH,
  drawSkyBackdrop,
  renderLayerToContext,
} from '@/engine/render/draw/desertLayers';

export type CanvasFactory = (width: number, height: number) => HTMLCanvasElement;

function getDefaultCanvasFactory(): CanvasFactory | null {
  if (typeof document === 'undefined') return null;
  return (width: number, height: number) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  };
}

export interface ParallaxSystemOptions {
  tileWidth?: number;
  initialTimeOfDay?: TimeOfDay;
  paletteLerpDuration?: number;
  canvasFactory?: CanvasFactory | null;
}

export class ParallaxSystem {
  public readonly tileWidth: number;
  public readonly paletteController: PaletteController;
  private readonly canvasFactory: CanvasFactory | null;
  private readonly layerCache: Map<TimeOfDay, HTMLCanvasElement[]> = new Map();
  private readonly offsets: [number, number, number, number] = [0, 0, 0, 0];
  public rebuildCount = 0;

  constructor(options: ParallaxSystemOptions = {}) {
    this.tileWidth =
      options.tileWidth !== undefined &&
      Number.isFinite(options.tileWidth) &&
      options.tileWidth > 0
        ? options.tileWidth
        : PARALLAX_TILE_WIDTH;
    this.paletteController = new PaletteController(
      options.initialTimeOfDay ?? 'DAY',
      options.paletteLerpDuration ?? PALETTE_LERP_DURATION
    );
    this.canvasFactory =
      options.canvasFactory !== undefined ? options.canvasFactory : getDefaultCanvasFactory();
  }

  public update(dt: number, actualSpeed: number, targetTimeOfDay: TimeOfDay): void {
    if (Number.isFinite(dt) && dt > 0 && Number.isFinite(actualSpeed)) {
      for (let i = 0; i < 4; i++) {
        const k = PARALLAX_FACTORS[i];
        const rawDx = parallaxDx(k, actualSpeed, dt);
        let wrappedDx: number;
        if (Number.isFinite(rawDx)) {
          wrappedDx = rawDx % this.tileWidth;
        } else {
          // Avoid +/-Infinity overflow on extreme finite inputs (e.g. actualSpeed = 1e308, dt = 10)
          const periodSpeed = this.tileWidth / k;
          const speedRem = Number.isFinite(periodSpeed) && periodSpeed > 0 ? actualSpeed % periodSpeed : 0;
          const reducedDx = parallaxDx(k, speedRem, dt);
          wrappedDx = Number.isFinite(reducedDx) ? reducedDx % this.tileWidth : 0;
        }
        const nextOffset =
          (((this.offsets[i] + wrappedDx) % this.tileWidth) + this.tileWidth) % this.tileWidth;
        if (Number.isFinite(nextOffset)) {
          this.offsets[i] = nextOffset;
        }
      }
    }

    this.paletteController.setTarget(targetTimeOfDay);
    this.paletteController.update(dt);
  }

  public getOffsets(): readonly [number, number, number, number] {
    return this.offsets;
  }

  public getRebuildCount(): number {
    return this.rebuildCount;
  }

  public invalidateCache(): void {
    this.layerCache.clear();
  }

  public getOrBuildLayerSet(timeOfDay: TimeOfDay): HTMLCanvasElement[] | null {
    const existing = this.layerCache.get(timeOfDay);
    if (existing) {
      return existing;
    }
    if (!this.canvasFactory) {
      return null;
    }

    const palette = PALETTES[timeOfDay];
    const canvases: HTMLCanvasElement[] = [];

    for (let i = 0; i < DESERT_LAYER_SPECS.length; i++) {
      const spec = DESERT_LAYER_SPECS[i];
      const offscreen = this.canvasFactory(this.tileWidth, spec.height);
      const offCtx = offscreen.getContext('2d');
      if (offCtx) {
        renderLayerToContext(spec.index, offCtx, palette, this.tileWidth, spec.height);
      }
      canvases.push(offscreen);
    }

    this.layerCache.set(timeOfDay, canvases);
    this.rebuildCount += 1;
    return canvases;
  }

  public render(
    ctx: CanvasRenderingContext2D,
    viewportWidth = ZONE_B_WIDTH,
    _viewportHeight = ZONE_B_HEIGHT
  ): void {
    const currentPalette = this.paletteController.getCurrent();
    drawSkyBackdrop(ctx, currentPalette, viewportWidth, 380);

    const blend = this.paletteController.getLayerBlend();
    const baseSet = this.getOrBuildLayerSet(blend.baseId);
    if (!baseSet) return;

    const overlaySets: Array<{ set: HTMLCanvasElement[]; alpha: number }> = [];
    for (let j = 0; j < blend.overlays.length; j++) {
      const ov = blend.overlays[j];
      if (ov.alpha <= 0.001) continue;
      const ovSet = this.getOrBuildLayerSet(ov.id);
      if (ovSet) {
        overlaySets.push({ set: ovSet, alpha: ov.alpha });
      }
    }

    for (let i = 0; i < DESERT_LAYER_SPECS.length; i++) {
      const spec = DESERT_LAYER_SPECS[i];
      const offset = this.offsets[i];

      if (overlaySets.length > 0) {
        ctx.save();
        ctx.globalAlpha = 1;
        this.drawTiledLayer(ctx, baseSet[i], offset, spec.y, viewportWidth);
        for (let j = 0; j < overlaySets.length; j++) {
          ctx.globalAlpha = overlaySets[j].alpha;
          this.drawTiledLayer(ctx, overlaySets[j].set[i], offset, spec.y, viewportWidth);
        }
        ctx.restore();
      } else {
        this.drawTiledLayer(ctx, baseSet[i], offset, spec.y, viewportWidth);
      }
    }
  }

  private drawTiledLayer(
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    offset: number,
    y: number,
    viewportWidth: number
  ): void {
    ctx.save();
    ctx.translate(-offset, 0);
    ctx.drawImage(canvas, 0, y);
    if (this.tileWidth - offset < viewportWidth) {
      ctx.drawImage(canvas, this.tileWidth, y);
    }
    ctx.restore();
  }
}
