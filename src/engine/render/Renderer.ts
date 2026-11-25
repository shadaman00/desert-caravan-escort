import type { GameStoreState } from '@/store/types';
import type { EventBus } from '@/engine/EventBus';
import type { CameraSystem } from '@/engine/systems/CameraSystem';
import type { ParallaxSystem } from '@/engine/systems/ParallaxSystem';
import type { RouteSnapshot } from '@/engine/systems/RouteSystem';
import { SpriteSlot, SpriteSlotRegistry } from './SpriteSlot';
import {
  SandwalkerRig,
  SandwalkerRenderInput,
  WALKER_ANCHOR_X,
  WALKER_GROUND_Y,
} from './draw/sandwalker';
import {
  WagonPose,
  WagonRenderInput,
  computeWagonTrain,
} from './draw/wagon';
import {
  ParticlePool,
  emitAmbientWind,
  emitFootfallDust,
  emitWheelDust,
} from './draw/particles';
import {
  PIXEL_BUFFER_HEIGHT,
  PIXEL_BUFFER_WIDTH,
  createPixelBuffer,
} from './pixel/PixelCanvas';
import {
  drawPixelSandwalkerHull,
  drawPixelSandwalkerLegsLayer,
  drawPixelSandwalkerTurret,
} from './pixel/sprites/sandwalkerSprites';
import { drawPixelWagonTrain } from './pixel/sprites/caravanSprites';
import { drawCrispSolarShield } from './draw/overlayDraw';

export const ZONE_B_WIDTH = 680;
export const ZONE_B_HEIGHT = 412;
export const MAX_CANVAS_DPR = 2;

export function computeCanvasBackingSize(devicePixelRatio: number): {
  dpr: number;
  width: number;
  height: number;
} {
  const safeDpr =
    Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  const dpr = Math.min(safeDpr, MAX_CANVAS_DPR);
  return {
    dpr,
    width: Math.round(ZONE_B_WIDTH * dpr),
    height: Math.round(ZONE_B_HEIGHT * dpr),
  };
}

export interface WagonSlotState {
  poses: readonly WagonPose[];
  input: WagonRenderInput;
}

export interface RendererOptions {
  eventBus?: EventBus;
  getDevicePixelRatio?: () => number;
  particleCapacity?: number;
}

export interface RendererDrawOptions {
  turretAimAngle?: number;
  turretRecoilPx?: number;
  forceTurretPreview?: boolean;
  renderCombatLayer?: (ctx: CanvasRenderingContext2D) => void;
  renderOverlayLayer?: (ctx: CanvasRenderingContext2D) => void;
  renderDialogueLayer?: (ctx: CanvasRenderingContext2D) => void;
}

export class Renderer {
  public readonly canvas: HTMLCanvasElement;
  public readonly ctx: CanvasRenderingContext2D;
  public readonly walkerRig: SandwalkerRig;
  public readonly particlePool: ParticlePool;
  public readonly slots: SpriteSlotRegistry;

  private readonly eventBus?: EventBus;
  private readonly getDevicePixelRatio: () => number;
  private readonly pixelBuffer: {
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
  } | null;
  private dpr = 1;
  private travelDistance = 0;
  private elapsedSec = 0;
  private wheelDustTimer = 0;
  private lastRouteSnap: RouteSnapshot | null = null;
  private lastWagonPoses: WagonPose[] = [];

  constructor(canvas: HTMLCanvasElement, options: RendererOptions = {}) {
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('[Renderer] Failed to acquire 2D rendering context');
    }

    this.canvas = canvas;
    this.ctx = ctx;
    this.eventBus = options.eventBus;
    this.getDevicePixelRatio =
      options.getDevicePixelRatio ??
      (() => (typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1));

    this.walkerRig = new SandwalkerRig();
    this.particlePool = new ParticlePool(options.particleCapacity ?? 300);
    this.slots = new SpriteSlotRegistry();
    this.pixelBuffer = createPixelBuffer(PIXEL_BUFFER_WIDTH, PIXEL_BUFFER_HEIGHT);

    this.slots.register(
      new SpriteSlot<WagonSlotState>('caravan.train', (c, _transform, state) => {
        drawPixelWagonTrain(
          c,
          state.poses,
          state.input.equippedSkinId,
          state.input.groundY ?? WALKER_GROUND_Y
        );
      })
    );

    this.slots.register(
      new SpriteSlot<SandwalkerRenderInput>('sandwalker.hull', (c, _transform, state) => {
        drawPixelSandwalkerHull(c, this.walkerRig, state);
      })
    );

    this.slots.register(
      new SpriteSlot<SandwalkerRenderInput>('sandwalker.turret', (c, _transform, state) => {
        drawPixelSandwalkerTurret(c, this.walkerRig, state);
      })
    );

    this.syncBackingResolution();
  }

  public syncBackingResolution(): number {
    const { dpr, width, height } = computeCanvasBackingSize(this.getDevicePixelRatio());
    this.dpr = dpr;

    if (this.canvas.width !== width) {
      this.canvas.width = width;
    }
    if (this.canvas.height !== height) {
      this.canvas.height = height;
    }
    if (this.canvas.style) {
      if (this.canvas.style.width !== `${ZONE_B_WIDTH}px`) {
        this.canvas.style.width = `${ZONE_B_WIDTH}px`;
      }
      if (this.canvas.style.height !== `${ZONE_B_HEIGHT}px`) {
        this.canvas.style.height = `${ZONE_B_HEIGHT}px`;
      }
    }

    return this.dpr;
  }

  public update(dt: number, routeSnap: RouteSnapshot, store: GameStoreState): void {
    const safeDt = Number.isFinite(dt) && dt > 0 ? dt : 0;
    this.elapsedSec += safeDt;
    this.travelDistance += routeSnap.deltaX;
    this.lastRouteSnap = routeSnap;

    if (store.sandwalker.activeTurret !== this.walkerRig.lastTurret) {
      const prevTurret = this.walkerRig.lastTurret;
      this.walkerRig.triggerTurretSwitch(store.sandwalker.activeTurret);
      this.eventBus?.emit('turret:switch', {
        from: prevTurret,
        to: store.sandwalker.activeTurret,
      });
    }

    this.walkerRig.update(
      safeDt,
      routeSnap.actualSpeed,
      WALKER_ANCHOR_X,
      WALKER_GROUND_Y
    );

    // Emit footfall dust & sparks on leg touchdown
    for (let i = 0; i < this.walkerRig.legs.length; i++) {
      const leg = this.walkerRig.legs[i];
      if (leg.didTouchDown) {
        emitFootfallDust(
          this.particlePool,
          leg.ik.footX,
          leg.ik.footY,
          routeSnap.isQuicksandBypassed
        );
        this.eventBus?.emit('walker:footfall', {
          legIndex: leg.config.index,
          x: leg.ik.footX,
          y: leg.ik.footY,
          isQuicksand: routeSnap.hazardKind === 'QUICKSAND',
          isQuicksandBypassed: routeSnap.isQuicksandBypassed,
        });
      }
    }

    // Update trailing camel wagons & emit periodic wheel dust while moving
    const wagonInput: WagonRenderInput = {
      wagonCount: store.sandwalker.wagonCount,
      equippedSkinId: store.monetization.equippedSkinId,
      walkerRearHitchX: WALKER_ANCHOR_X - 38,
      walkerRearHitchY: WALKER_GROUND_Y - 56 + this.walkerRig.hullBobY,
      groundY: WALKER_GROUND_Y,
      speed: routeSnap.actualSpeed,
    };
    this.lastWagonPoses = computeWagonTrain(
      wagonInput,
      this.travelDistance,
      this.elapsedSec
    );

    if (routeSnap.isMoving && this.lastWagonPoses.length > 0) {
      this.wheelDustTimer += safeDt;
      if (this.wheelDustTimer >= 0.14) {
        this.wheelDustTimer = 0;
        for (let i = 0; i < this.lastWagonPoses.length; i++) {
          const pose = this.lastWagonPoses[i];
          emitWheelDust(this.particlePool, pose.wagonX - 5, WALKER_GROUND_Y);
        }
      }
    } else {
      this.wheelDustTimer = 0;
    }

    // Ambient desert wind & 3x storm particles
    emitAmbientWind(
      this.particlePool,
      safeDt,
      routeSnap.isSandstorm || routeSnap.targetTimeOfDay === 'STORM',
      routeSnap.targetTimeOfDay,
      ZONE_B_WIDTH,
      WALKER_GROUND_Y
    );

    const windSpeedX = routeSnap.isSandstorm
      ? -90
      : -routeSnap.actualSpeed * 0.25;
    this.particlePool.update(safeDt, windSpeedX);
  }

  public render(
    _alpha: number,
    cameraSystem: CameraSystem,
    parallaxSystem: ParallaxSystem,
    store: GameStoreState,
    options: RendererDrawOptions = {}
  ): void {
    const dpr = this.syncBackingResolution();
    const screenCtx = this.ctx;
    screenCtx.imageSmoothingEnabled = false;

    const usePixelBuffer = Boolean(this.pixelBuffer && typeof screenCtx.drawImage === 'function');
    const targetCtx = usePixelBuffer ? this.pixelBuffer!.ctx : screenCtx;

    if (usePixelBuffer) {
      targetCtx.imageSmoothingEnabled = false;
      targetCtx.setTransform(1, 0, 0, 1, 0, 0);
      targetCtx.clearRect(0, 0, PIXEL_BUFFER_WIDTH, PIXEL_BUFFER_HEIGHT);
      targetCtx.setTransform(0.5, 0, 0, 0.5, 0, 0);
    } else {
      targetCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      targetCtx.clearRect(0, 0, ZONE_B_WIDTH, ZONE_B_HEIGHT);
    }

    // World-space pass (subject to camera shake)
    targetCtx.save();
    cameraSystem.applyCameraTransform(targetCtx);

    // 1. Sky + 4-Layer Parallax Desert
    parallaxSystem.render(targetCtx, ZONE_B_WIDTH, ZONE_B_HEIGHT);

    // 2. Trailing Camel Wagons (Pixel Art)
    const wagonInput: WagonRenderInput = {
      wagonCount: store.sandwalker.wagonCount,
      equippedSkinId: store.monetization.equippedSkinId,
      walkerRearHitchX: WALKER_ANCHOR_X - 38,
      walkerRearHitchY: WALKER_GROUND_Y - 56 + this.walkerRig.hullBobY,
      groundY: WALKER_GROUND_Y,
      speed: this.lastRouteSnap?.actualSpeed ?? 0,
    };
    const poses =
      this.lastWagonPoses.length === Math.max(0, Math.min(5, store.sandwalker.wagonCount))
        ? this.lastWagonPoses
        : computeWagonTrain(wagonInput, this.travelDistance, this.elapsedSec);

    this.slots.get<WagonSlotState>('caravan.train')?.render(
      targetCtx,
      { x: 0, y: 0 },
      { poses, input: wagonInput }
    );

    // 3. Sandwalker (Back Pixel Legs -> Pixel Hull -> Pixel Solar Shield -> Turret -> Front Pixel Legs)
    const previewTurrets = Boolean(options.forceTurretPreview);
    const walkerInput: SandwalkerRenderInput = {
      anchorX: WALKER_ANCHOR_X,
      groundY: WALKER_GROUND_Y,
      activeTurret: store.sandwalker.activeTurret,
      turretLevels: previewTurrets
        ? { HEAT_RAY: 30, HARPOON: 30, MORTAR: 30 }
        : store.sandwalker.turretLevels,
      turretTiers: previewTurrets
        ? { HEAT_RAY: 3, HARPOON: 3, MORTAR: 3 }
        : store.sandwalker.turretTiers,
      legPartLevel: store.sandwalker.legPartLevel,
      equippedSkinId: store.monetization.equippedSkinId,
      solarShieldHp: store.sandwalker.solarShieldHp,
      maxHp: store.sandwalker.maxHp,
      aimAngle: options.turretAimAngle,
      recoilPx: options.turretRecoilPx,
      isInQuicksand: this.lastRouteSnap?.hazardKind === 'QUICKSAND',
    };

    drawPixelSandwalkerLegsLayer(targetCtx, this.walkerRig, walkerInput, 'back');

    this.slots.get<SandwalkerRenderInput>('sandwalker.hull')?.render(
      targetCtx,
      { x: WALKER_ANCHOR_X, y: WALKER_GROUND_Y },
      walkerInput
    );

    this.slots.get<SandwalkerRenderInput>('sandwalker.turret')?.render(
      targetCtx,
      { x: WALKER_ANCHOR_X, y: WALKER_GROUND_Y },
      walkerInput
    );

    drawPixelSandwalkerLegsLayer(targetCtx, this.walkerRig, walkerInput, 'front');

    // 4. Combat & World Objects Hook (Pass 1: Pixel Art)
    options.renderCombatLayer?.(targetCtx);

    // 5. Foreground Pixel Particle Pool
    this.particlePool.render(targetCtx);

    targetCtx.restore();

    // 6. 2x Nearest-Neighbor Upscale Blit from 340x206 Pixel Buffer to Zone B Canvas
    if (usePixelBuffer) {
      screenCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      screenCtx.imageSmoothingEnabled = false;
      screenCtx.clearRect(0, 0, ZONE_B_WIDTH, ZONE_B_HEIGHT);
      screenCtx.drawImage(
        this.pixelBuffer!.canvas,
        0,
        0,
        PIXEL_BUFFER_WIDTH,
        PIXEL_BUFFER_HEIGHT,
        0,
        0,
        ZONE_B_WIDTH,
        ZONE_B_HEIGHT
      );
    }

    // 7. Pass 2 Native High-DPI Crisp Overlay (Solar Shield Dome, HP Bars, Boss Telegraph, Damage Popups)
    screenCtx.save();
    screenCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cameraSystem.applyCameraTransform(screenCtx);
    drawCrispSolarShield(
      screenCtx,
      WALKER_ANCHOR_X,
      WALKER_GROUND_Y,
      this.walkerRig.hullBobY,
      walkerInput.solarShieldHp,
      walkerInput.maxHp,
      this.elapsedSec
    );
    options.renderOverlayLayer?.(screenCtx);
    screenCtx.restore();

    // 8. Screen-space Camera Overlays (single sandstorm 50% dark vision mask + vignettes)
    cameraSystem.renderOverlays(screenCtx, ZONE_B_WIDTH, ZONE_B_HEIGHT);

    // 9. Dialogue & Debug Hook
    options.renderDialogueLayer?.(screenCtx);

    // Enforce nearest-neighbor smoothing state on screen context for pixel-art contract
    screenCtx.imageSmoothingEnabled = false;
  }

  public dispose(): void {
    this.particlePool.clear();
  }
}
