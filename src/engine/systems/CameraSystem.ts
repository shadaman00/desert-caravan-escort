export interface CameraUpdateInput {
  isSandstormVisionMasked: boolean;
  hpRatio: number;
}

export interface ShakeOffset {
  x: number;
  y: number;
}

export interface CameraSystemOptions {
  rng?: () => number;
}

function moveToward(current: number, target: number, maxDelta: number): number {
  if (Math.abs(target - current) <= maxDelta) return target;
  return current + Math.sign(target - current) * maxDelta;
}

export class CameraSystem {
  private readonly rng: () => number;
  private shakeIntensity = 0;
  private initialIntensity = 0;
  private shakeDuration = 0;
  private shakeElapsed = 0;
  private offset: ShakeOffset = { x: 0, y: 0 };

  private sandstormMaskAlpha = 0;
  private alertTimer = 0;
  private alertDuration = 0;
  private alertMaxAlpha = 0;
  private hitFlashAlpha = 0;
  private pulseClock = 0;
  private lowHpPulseAlpha = 0;

  constructor(options: CameraSystemOptions = {}) {
    this.rng = options.rng ?? Math.random;
  }

  public shake(intensityPx: number, durationSec = 0.45): void {
    if (
      !Number.isFinite(intensityPx) ||
      intensityPx <= 0 ||
      !Number.isFinite(durationSec) ||
      durationSec <= 0
    ) {
      return;
    }

    const remainingDuration = Math.max(0, this.shakeDuration - this.shakeElapsed);
    this.shakeIntensity = Math.max(this.shakeIntensity, intensityPx);
    this.initialIntensity = this.shakeIntensity;
    this.shakeDuration = Math.max(remainingDuration, durationSec);
    this.shakeElapsed = 0;
  }

  public triggerAlertVignette(durationSec = 0.8, maxAlpha = 0.45): void {
    if (
      !Number.isFinite(durationSec) ||
      durationSec <= 0 ||
      !Number.isFinite(maxAlpha) ||
      maxAlpha <= 0
    ) {
      return;
    }
    this.alertDuration = durationSec;
    this.alertTimer = durationSec;
    this.alertMaxAlpha = Math.max(0, Math.min(1, maxAlpha));
  }

  public triggerHitFlash(alpha = 0.28): void {
    if (!Number.isFinite(alpha) || alpha <= 0) return;
    this.hitFlashAlpha = Math.max(this.hitFlashAlpha, Math.max(0, Math.min(1, alpha)));
  }

  public update(dt: number, input: CameraUpdateInput): void {
    if (!Number.isFinite(dt) || dt <= 0) return;
    this.pulseClock += dt;

    // 1. Quadratic-decay trauma shake
    if (this.shakeIntensity > 0.05 && this.shakeDuration > 0) {
      this.shakeElapsed = Math.min(this.shakeDuration, this.shakeElapsed + dt);
      const remainingRatio = Math.max(0, 1 - this.shakeElapsed / this.shakeDuration);
      this.shakeIntensity = this.initialIntensity * remainingRatio * remainingRatio;

      if (this.shakeIntensity <= 0.05 || remainingRatio <= 0) {
        this.shakeIntensity = 0;
        this.initialIntensity = 0;
        this.shakeDuration = 0;
        this.shakeElapsed = 0;
        this.offset.x = 0;
        this.offset.y = 0;
      } else {
        this.offset.x = (this.rng() * 2 - 1) * this.shakeIntensity;
        this.offset.y = (this.rng() * 2 - 1) * this.shakeIntensity;
      }
    } else {
      this.shakeIntensity = 0;
      this.initialIntensity = 0;
      this.shakeDuration = 0;
      this.shakeElapsed = 0;
      this.offset.x = 0;
      this.offset.y = 0;
    }

    // 2. Sandstorm 50% dark vision radial mask lerp
    const maskTarget = input.isSandstormVisionMasked ? 1 : 0;
    this.sandstormMaskAlpha = moveToward(this.sandstormMaskAlpha, maskTarget, dt * 2.5);

    // 3. Low-HP danger vignette
    const hpRatio = Number.isFinite(input.hpRatio) ? Math.max(0, Math.min(1, input.hpRatio)) : 1;
    if (hpRatio <= 0.25 && hpRatio > 0) {
      this.lowHpPulseAlpha = 0.22 + 0.14 * Math.sin(this.pulseClock * 6);
    } else {
      this.lowHpPulseAlpha = moveToward(this.lowHpPulseAlpha, 0, dt * 2.0);
    }

    // 4. Explicit alert vignette & hit flash decay
    if (this.alertTimer > 0) {
      this.alertTimer = Math.max(0, this.alertTimer - dt);
    }
    if (this.hitFlashAlpha > 0) {
      this.hitFlashAlpha = Math.max(0, this.hitFlashAlpha - dt * (0.28 / 0.15));
    }
  }

  public getOffset(): Readonly<ShakeOffset> {
    return this.offset;
  }

  public getShakeIntensity(): number {
    return this.shakeIntensity;
  }

  public getSandstormMaskAlpha(): number {
    return this.sandstormMaskAlpha;
  }

  public getAlertVignetteAlpha(): number {
    const explicitAlpha =
      this.alertDuration > 0 && this.alertTimer > 0
        ? this.alertMaxAlpha * (this.alertTimer / this.alertDuration)
        : 0;
    return Math.max(this.lowHpPulseAlpha, explicitAlpha);
  }

  public applyCameraTransform(ctx: CanvasRenderingContext2D): void {
    if (this.offset.x !== 0 || this.offset.y !== 0) {
      ctx.translate(this.offset.x, this.offset.y);
    }
  }

  public renderOverlays(
    ctx: CanvasRenderingContext2D,
    width = 430,
    height = 512
  ): void {
    // Sandstorm 50% dark vision radial mask (central 50% clear radius)
    if (this.sandstormMaskAlpha > 0.005) {
      const cx = width * 0.5;
      const cy = height * 0.5;
      const innerR = width * 0.25;
      const outerR = width * 0.62;
      const grad = ctx.createRadialGradient(cx, cy, innerR, cx, cy, outerR);
      grad.addColorStop(0, 'rgba(24, 12, 5, 0)');
      grad.addColorStop(0.6, `rgba(24, 12, 5, ${(0.45 * this.sandstormMaskAlpha).toFixed(3)})`);
      grad.addColorStop(1, `rgba(18, 9, 4, ${(0.84 * this.sandstormMaskAlpha).toFixed(3)})`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);
    }

    // Danger / alert vignette
    const alertAlpha = this.getAlertVignetteAlpha();
    if (alertAlpha > 0.005) {
      const cx = width * 0.5;
      const cy = height * 0.5;
      const grad = ctx.createRadialGradient(cx, cy, width * 0.28, cx, cy, height * 0.65);
      grad.addColorStop(0, 'rgba(220, 38, 38, 0)');
      grad.addColorStop(1, `rgba(220, 38, 38, ${alertAlpha.toFixed(3)})`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);
    }

    // Hit flash
    if (this.hitFlashAlpha > 0.005) {
      ctx.fillStyle = `rgba(255, 235, 220, ${this.hitFlashAlpha.toFixed(3)})`;
      ctx.fillRect(0, 0, width, height);
    }
  }
}
