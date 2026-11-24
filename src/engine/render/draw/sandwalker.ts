import type { SkinId, TurretType } from '@/store/types';

export const WALKER_ANCHOR_X = 240;
export const WALKER_GROUND_Y = 336;
export const LEG_UPPER_LEN = 28;
export const LEG_LOWER_LEN = 32;
export const STRIDE_GROUND_TRAVEL = 48;
export const TURRET_SWITCH_DURATION = 0.15;

export type LegLayer = 'back' | 'front';

export interface IKJointResult {
  hipX: number;
  hipY: number;
  kneeX: number;
  kneeY: number;
  footX: number;
  footY: number;
  angleHip: number;
  angleKnee: number;
  clampedDist: number;
}

export interface LegConfig {
  readonly index: 0 | 1 | 2 | 3 | 4 | 5;
  readonly layer: LegLayer;
  readonly tripodGroup: 'A' | 'B';
  readonly phaseOffset: number;
  readonly hipOffsetX: number;
  readonly hipOffsetY: number;
  readonly restFootOffsetX: number;
  readonly flip: boolean;
}

export interface LegRuntimeState {
  readonly config: LegConfig;
  ik: IKJointResult;
  isSwinging: boolean;
  wasSwinging: boolean;
  didTouchDown: boolean;
  liftY: number;
}

export interface SandwalkerRenderInput {
  anchorX?: number;
  groundY?: number;
  activeTurret: TurretType;
  turretLevels: Record<TurretType, number>;
  turretTiers: Record<TurretType, number>;
  legPartLevel: number;
  equippedSkinId: SkinId;
  solarShieldHp: number;
  maxHp: number;
  aimAngle?: number;
  recoilPx?: number;
  isInQuicksand?: boolean;
}

export const LEG_CONFIGS: readonly LegConfig[] = [
  {
    index: 0,
    layer: 'front',
    tripodGroup: 'A',
    phaseOffset: 0,
    hipOffsetX: -24,
    hipOffsetY: 0,
    restFootOffsetX: -28,
    flip: true,
  },
  {
    index: 1,
    layer: 'back',
    tripodGroup: 'B',
    phaseOffset: Math.PI,
    hipOffsetX: -20,
    hipOffsetY: -3,
    restFootOffsetX: -24,
    flip: true,
  },
  {
    index: 2,
    layer: 'back',
    tripodGroup: 'A',
    phaseOffset: 0,
    hipOffsetX: 0,
    hipOffsetY: -3,
    restFootOffsetX: 0,
    flip: false,
  },
  {
    index: 3,
    layer: 'front',
    tripodGroup: 'B',
    phaseOffset: Math.PI,
    hipOffsetX: 2,
    hipOffsetY: 0,
    restFootOffsetX: 2,
    flip: false,
  },
  {
    index: 4,
    layer: 'front',
    tripodGroup: 'A',
    phaseOffset: 0,
    hipOffsetX: 24,
    hipOffsetY: 0,
    restFootOffsetX: 28,
    flip: false,
  },
  {
    index: 5,
    layer: 'back',
    tripodGroup: 'B',
    phaseOffset: Math.PI,
    hipOffsetX: 20,
    hipOffsetY: -3,
    restFootOffsetX: 24,
    flip: false,
  },
] as const;

export function solveTwoBoneIK(
  hipX: number,
  hipY: number,
  targetX: number,
  targetY: number,
  L1: number,
  L2: number,
  flip: boolean
): IKJointResult {
  const safeHipX = Number.isFinite(hipX) ? hipX : 0;
  const safeHipY = Number.isFinite(hipY) ? hipY : 0;
  const l1 = Number.isFinite(L1) ? Math.max(1e-3, L1) : LEG_UPPER_LEN;
  const l2 = Number.isFinite(L2) ? Math.max(1e-3, L2) : LEG_LOWER_LEN;
  const safeTargetX = Number.isFinite(targetX) ? targetX : safeHipX;
  const safeTargetY = Number.isFinite(targetY) ? targetY : safeHipY + l1 + l2;

  const dx = safeTargetX - safeHipX;
  const dy = safeTargetY - safeHipY;
  const rawDist = Math.hypot(dx, dy);

  const eps = 1e-3;
  const minDist = Math.abs(l1 - l2) + eps;
  const maxDist = l1 + l2 - eps;
  const d =
    minDist >= maxDist ? maxDist : Math.min(maxDist, Math.max(minDist, rawDist));

  const baseAngle = rawDist < 1e-6 ? Math.PI * 0.5 : Math.atan2(dy, dx);
  const ux = rawDist < 1e-6 ? 0 : dx / rawDist;
  const uy = rawDist < 1e-6 ? 1 : dy / rawDist;

  const cosAlphaRaw = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d);
  const cosAlpha = Math.max(-1, Math.min(1, cosAlphaRaw));
  const alpha = Math.acos(cosAlpha);

  const bendSign = flip ? 1 : -1;
  const angleHip = baseAngle + bendSign * alpha;
  const kneeX = safeHipX + Math.cos(angleHip) * l1;
  const kneeY = safeHipY + Math.sin(angleHip) * l1;
  const footX = safeHipX + ux * d;
  const footY = safeHipY + uy * d;
  const angleKnee = Math.atan2(footY - kneeY, footX - kneeX);

  return {
    hipX: safeHipX,
    hipY: safeHipY,
    kneeX,
    kneeY,
    footX,
    footY,
    angleHip,
    angleKnee,
    clampedDist: d,
  };
}

export function getTurretVisualTier(level: number, explicitTier?: number): 1 | 2 | 3 {
  const safeLevel = Number.isFinite(level) ? Math.max(1, Math.floor(level)) : 1;
  const levelTier = safeLevel >= 21 ? 3 : safeLevel >= 11 ? 2 : 1;
  const safeExplicit =
    explicitTier !== undefined && Number.isFinite(explicitTier)
      ? Math.floor(explicitTier)
      : 1;
  const combined = Math.max(levelTier, safeExplicit);
  return Math.min(3, Math.max(1, combined)) as 1 | 2 | 3;
}

export function getLegArmorVisualTier(legPartLevel: number): {
  tier: 1 | 2 | 3;
  boltCount: 1 | 2 | 3;
  armorScale: number;
  hasQuicksandGlow: boolean;
} {
  const lvl = Number.isFinite(legPartLevel)
    ? Math.max(1, Math.floor(legPartLevel))
    : 1;
  const tier: 1 | 2 | 3 = lvl >= 20 ? 3 : lvl >= 11 ? 2 : 1;
  return {
    tier,
    boltCount: tier,
    armorScale: 1 + (lvl - 1) * 0.03,
    hasQuicksandGlow: lvl >= 11,
  };
}

export class SandwalkerRig {
  public gaitPhase = 0;
  public currentStrideAmp = 0;
  public currentLiftHeight = 0;
  public hullBobY = 0;
  public switchAnimTimer = 0;
  public lastTurret: TurretType = 'HEAT_RAY';
  public readonly legs: LegRuntimeState[];

  constructor() {
    this.legs = LEG_CONFIGS.map((config) => {
      const hipX = WALKER_ANCHOR_X + config.hipOffsetX;
      const hipY = WALKER_GROUND_Y - 52 + config.hipOffsetY;
      const footX = WALKER_ANCHOR_X + config.restFootOffsetX;
      const footY = WALKER_GROUND_Y;
      return {
        config,
        ik: solveTwoBoneIK(
          hipX,
          hipY,
          footX,
          footY,
          LEG_UPPER_LEN,
          LEG_LOWER_LEN,
          config.flip
        ),
        isSwinging: false,
        wasSwinging: false,
        didTouchDown: false,
        liftY: 0,
      };
    });
  }

  public triggerTurretSwitch(nextTurret: TurretType): void {
    this.lastTurret = nextTurret;
    this.switchAnimTimer = TURRET_SWITCH_DURATION;
  }

  public update(
    dt: number,
    actualSpeed: number,
    anchorX = WALKER_ANCHOR_X,
    groundY = WALKER_GROUND_Y
  ): void {
    const safeDt = Number.isFinite(dt) && dt > 0 ? dt : 0;
    const safeSpeed = Number.isFinite(actualSpeed) && actualSpeed > 0 ? actualSpeed : 0;

    if (this.switchAnimTimer > 0 && safeDt > 0) {
      this.switchAnimTimer = Math.max(0, this.switchAnimTimer - safeDt);
    }

    const isMoving = safeSpeed > 0.5;
    const targetAmp = isMoving ? Math.min(20, 6 + (safeSpeed / 120) * 11) : 0;
    const targetLift = isMoving ? Math.min(16, 4 + (safeSpeed / 120) * 9) : 0;
    const lerpRate = safeDt > 0 ? Math.min(1, safeDt * 12) : 0;

    this.currentStrideAmp += (targetAmp - this.currentStrideAmp) * lerpRate;
    this.currentLiftHeight += (targetLift - this.currentLiftHeight) * lerpRate;

    const omega = isMoving ? (safeSpeed / STRIDE_GROUND_TRAVEL) * Math.PI * 2 : 0;
    this.gaitPhase = (this.gaitPhase + omega * safeDt) % (Math.PI * 2);

    this.hullBobY = isMoving ? Math.sin(this.gaitPhase * 2) * 1.8 : 0;
    const hipBaseY = groundY - 52;

    for (let i = 0; i < this.legs.length; i++) {
      const leg = this.legs[i];
      const localPhase = (this.gaitPhase + leg.config.phaseOffset) % (Math.PI * 2);
      const u = localPhase / (Math.PI * 2);
      const isSwinging = isMoving && u < 0.5;
      const didTouchDown = leg.wasSwinging && !isSwinging && isMoving;
      leg.wasSwinging = isSwinging;
      leg.isSwinging = isSwinging;
      leg.didTouchDown = didTouchDown;

      let strideX = 0;
      let liftY = 0;
      if (isMoving) {
        if (isSwinging) {
          const s = u / 0.5;
          strideX = -this.currentStrideAmp * Math.cos(s * Math.PI);
          liftY = this.currentLiftHeight * Math.sin(s * Math.PI);
        } else {
          const s = (u - 0.5) / 0.5;
          strideX = this.currentStrideAmp * (1 - 2 * s);
          liftY = 0;
        }
      }

      leg.liftY = liftY;

      const hipX = anchorX + leg.config.hipOffsetX;
      const hipY = hipBaseY + leg.config.hipOffsetY + this.hullBobY;
      const targetX = anchorX + leg.config.restFootOffsetX + strideX;
      const targetY = groundY - liftY;

      leg.ik = solveTwoBoneIK(
        hipX,
        hipY,
        targetX,
        targetY,
        LEG_UPPER_LEN,
        LEG_LOWER_LEN,
        leg.config.flip
      );
    }
  }
}

interface WalkerSkinPalette {
  hullTop: string;
  hullBottom: string;
  trim: string;
  visor: string;
  inlay: string;
  legStrut: string;
  legPlate: string;
  bolt: string;
}

function getSkinPalette(skinId: SkinId): WalkerSkinPalette {
  if (skinId === 'GOLDEN_PHARAOH') {
    return {
      hullTop: '#d69e2e',
      hullBottom: '#744210',
      trim: '#fef08a',
      visor: '#63b3ed',
      inlay: '#2b6cb0',
      legStrut: '#b7791f',
      legPlate: '#ecc94b',
      bolt: '#2b6cb0',
    };
  }
  return {
    hullTop: '#334155',
    hullBottom: '#1b2230',
    trim: '#e6a15c',
    visor: '#f6ad55',
    inlay: '#475569',
    legStrut: '#4a5568',
    legPlate: '#64748b',
    bolt: '#e6a15c',
  };
}

export function drawSandwalkerLegsLayer(
  ctx: CanvasRenderingContext2D,
  rig: SandwalkerRig,
  input: SandwalkerRenderInput,
  layer: LegLayer
): void {
  const palette = getSkinPalette(input.equippedSkinId);
  const legTier = getLegArmorVisualTier(input.legPartLevel);
  const isBack = layer === 'back';

  ctx.save();
  if (isBack) {
    ctx.globalAlpha = 0.78;
  }

  for (let i = 0; i < rig.legs.length; i++) {
    const leg = rig.legs[i];
    if (leg.config.layer !== layer) continue;

    const { hipX, hipY, kneeX, kneeY, footX, footY, angleKnee } = leg.ik;

    // Upper femur strut
    ctx.strokeStyle = isBack ? '#2d3748' : palette.legStrut;
    ctx.lineCap = 'round';
    ctx.lineWidth = (isBack ? 4.2 : 5.2) * Math.min(1.3, legTier.armorScale * 0.92);
    ctx.beginPath();
    ctx.moveTo(hipX, hipY);
    ctx.lineTo(kneeX, kneeY);
    ctx.stroke();

    // Lower tibia strut
    ctx.lineWidth = (isBack ? 3.5 : 4.4) * Math.min(1.25, legTier.armorScale * 0.9);
    ctx.beginPath();
    ctx.moveTo(kneeX, kneeY);
    ctx.lineTo(footX, footY);
    ctx.stroke();

    // Shin armor plate (scales with legPartLevel)
    const midX = (kneeX + footX) * 0.5;
    const midY = (kneeY + footY) * 0.5;
    const plateLen = 13 * Math.min(1.35, legTier.armorScale);
    const plateThick = 4.2 * Math.min(1.45, legTier.armorScale);

    ctx.save();
    ctx.translate(midX, midY);
    ctx.rotate(angleKnee);
    const plate = new Path2D();
    plate.moveTo(-plateLen * 0.5, -plateThick * 0.65);
    plate.lineTo(plateLen * 0.5, -plateThick * 0.45);
    plate.lineTo(plateLen * 0.42, plateThick * 0.65);
    plate.lineTo(-plateLen * 0.45, plateThick * 0.65);
    plate.closePath();

    ctx.fillStyle = isBack ? '#3b4758' : palette.legPlate;
    ctx.fill(plate);
    ctx.strokeStyle = legTier.hasQuicksandGlow
      ? input.isInQuicksand
        ? '#38bdf8'
        : '#7dd3fc'
      : palette.trim;
    ctx.lineWidth = legTier.hasQuicksandGlow ? 1.5 : 1;
    ctx.stroke(plate);
    ctx.restore();

    // Knee servo & joint bolts (1..3 bolts by tier)
    const servoRadius = 3.2 + legTier.tier * 0.65;
    ctx.fillStyle = palette.hullBottom;
    ctx.beginPath();
    ctx.arc(kneeX, kneeY, servoRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = legTier.hasQuicksandGlow ? '#38bdf8' : palette.trim;
    ctx.lineWidth = 1.2;
    ctx.stroke();

    ctx.fillStyle = legTier.hasQuicksandGlow ? '#bae6fd' : palette.bolt;
    for (let b = 0; b < legTier.boltCount; b++) {
      const bx = kneeX + (b - (legTier.boltCount - 1) * 0.5) * 2.1;
      ctx.beginPath();
      ctx.arc(bx, kneeY, 0.95, 0, Math.PI * 2);
      ctx.fill();
    }

    // Articulated desert foot pad
    const footPad = new Path2D();
    footPad.moveTo(footX - 6, footY);
    footPad.lineTo(footX + 7, footY);
    footPad.lineTo(footX + 4, footY - 3.5);
    footPad.lineTo(footX - 4, footY - 3.5);
    footPad.closePath();
    ctx.fillStyle = isBack ? '#2d3748' : palette.hullBottom;
    ctx.fill(footPad);
    ctx.strokeStyle = legTier.hasQuicksandGlow ? '#38bdf8' : palette.trim;
    ctx.lineWidth = 1;
    ctx.stroke(footPad);
  }

  ctx.restore();
}

export function drawSandwalkerHull(
  ctx: CanvasRenderingContext2D,
  rig: SandwalkerRig,
  input: SandwalkerRenderInput
): void {
  const anchorX = input.anchorX ?? WALKER_ANCHOR_X;
  const groundY = input.groundY ?? WALKER_GROUND_Y;
  const hullY = groundY - 88 + rig.hullBobY; // y=324..360
  const palette = getSkinPalette(input.equippedSkinId);

  ctx.save();

  // Rear tow hitch bracket (x = anchorX - 38 = 158)
  ctx.fillStyle = palette.legStrut;
  ctx.fillRect(anchorX - 39, groundY - 59 + rig.hullBobY, 7, 6);

  // Main beveled armored hull Path2D
  const hullPath = new Path2D();
  hullPath.moveTo(anchorX - 35, hullY + 34);
  hullPath.lineTo(anchorX - 38, hullY + 14);
  hullPath.lineTo(anchorX - 24, hullY + 2);
  hullPath.lineTo(anchorX + 20, hullY + 2);
  hullPath.lineTo(anchorX + 37, hullY + 16);
  hullPath.lineTo(anchorX + 33, hullY + 34);
  hullPath.closePath();

  const hullGrad = ctx.createLinearGradient(0, hullY, 0, hullY + 36);
  hullGrad.addColorStop(0, palette.hullTop);
  hullGrad.addColorStop(1, palette.hullBottom);
  ctx.fillStyle = hullGrad;
  ctx.fill(hullPath);

  ctx.strokeStyle = palette.trim;
  ctx.lineWidth = 2;
  ctx.stroke(hullPath);

  // Armored deck trim / inlay band
  ctx.fillStyle = palette.inlay;
  ctx.fillRect(anchorX - 22, hullY + 18, 42, 7);

  if (input.equippedSkinId === 'GOLDEN_PHARAOH') {
    // Royal sun crest & lapis trim
    ctx.fillStyle = '#fef08a';
    ctx.beginPath();
    ctx.arc(anchorX - 2, hullY + 12, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  // Forward cockpit visor
  const visor = new Path2D();
  visor.moveTo(anchorX + 16, hullY + 8);
  visor.lineTo(anchorX + 31, hullY + 16);
  visor.lineTo(anchorX + 24, hullY + 22);
  visor.lineTo(anchorX + 14, hullY + 18);
  visor.closePath();
  ctx.fillStyle = palette.visor;
  ctx.fill(visor);

  ctx.restore();
}

export function getTurretMuzzleLocalX(turret: TurretType): number {
  if (turret === 'HEAT_RAY') return 30;
  if (turret === 'HARPOON') return 37;
  return 26;
}

export function computeTurretMuzzleWorldPos(params: {
  anchorX?: number;
  groundY?: number;
  hullBobY: number;
  turret: TurretType;
  barrelCount: 1 | 2 | 3;
  aimAngle: number;
  recoilPx?: number;
}): { x: number; y: number; pivotX: number; pivotY: number; tierScale: number } {
  const anchorX = params.anchorX ?? WALKER_ANCHOR_X;
  const groundY = params.groundY ?? WALKER_GROUND_Y;
  const tierScale = 1 + (params.barrelCount - 1) * 0.1;
  const pivotX = anchorX + 4;
  const pivotY = groundY - 88 + params.hullBobY - 8 * tierScale;
  const localDist =
    Math.max(0, getTurretMuzzleLocalX(params.turret) - (params.recoilPx ?? 0)) * tierScale;
  return {
    x: pivotX + Math.cos(params.aimAngle) * localDist,
    y: pivotY + Math.sin(params.aimAngle) * localDist,
    pivotX,
    pivotY,
    tierScale,
  };
}

export function drawSandwalkerTurret(
  ctx: CanvasRenderingContext2D,
  rig: SandwalkerRig,
  input: SandwalkerRenderInput
): void {
  const anchorX = input.anchorX ?? WALKER_ANCHOR_X;
  const groundY = input.groundY ?? WALKER_GROUND_Y;
  const mountX = anchorX + 4;
  const mountY = groundY - 88 + rig.hullBobY;

  const active = input.activeTurret;
  const barrelCount = getTurretVisualTier(
    input.turretLevels[active] ?? 1,
    input.turretTiers[active] ?? 1
  );
  const tierScale = 1 + (barrelCount - 1) * 0.1; // 1.0, 1.1, 1.2
  const recoil = input.recoilPx ?? 0;

  let switchScaleY = 1;
  let switchTilt = 0;
  if (rig.switchAnimTimer > 0) {
    const t = rig.switchAnimTimer / TURRET_SWITCH_DURATION;
    switchScaleY = 1 - 0.25 * Math.sin(t * Math.PI);
    switchTilt = -0.22 * Math.sin(t * Math.PI);
  }

  const baseAim = active === 'MORTAR' ? -0.52 : 0;
  const aimAngle = (input.aimAngle ?? baseAim) + switchTilt;
  const palette = getSkinPalette(input.equippedSkinId);

  ctx.save();
  ctx.translate(mountX, mountY);
  ctx.scale(tierScale, tierScale * switchScaleY);

  // Rotating turret ring base
  ctx.fillStyle = palette.hullBottom;
  ctx.strokeStyle = palette.trim;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.rect(-13, -7, 26, 9);
  ctx.fill();
  ctx.stroke();

  ctx.translate(0, -8);
  ctx.rotate(aimAngle);
  ctx.translate(-recoil, 0);

  const offsets =
    barrelCount === 1 ? [0] : barrelCount === 2 ? [-3.5, 3.5] : [-5, 0, 5];

  if (active === 'HEAT_RAY') {
    // Crimson/orange thermal emitter pod + cooling fins + 1..3 emitter barrels
    const pod = new Path2D();
    pod.moveTo(-14, -9);
    pod.lineTo(10, -9);
    pod.lineTo(14, -4);
    pod.lineTo(14, 4);
    pod.lineTo(10, 7);
    pod.lineTo(-14, 7);
    pod.closePath();
    ctx.fillStyle = '#9b2c2c';
    ctx.fill(pod);
    ctx.strokeStyle = '#feb2b2';
    ctx.lineWidth = 1.4;
    ctx.stroke(pod);

    // Cooling fins
    ctx.fillStyle = '#ed8936';
    ctx.fillRect(-10, -11, 12, 2.5);

    for (let i = 0; i < offsets.length; i++) {
      const by = offsets[i];
      ctx.fillStyle = '#f56565';
      ctx.fillRect(12, by - 1.8, 17, 3.6);
      ctx.fillStyle = '#fefcbf';
      ctx.fillRect(26, by - 1.3, 4, 2.6);
    }
  } else if (active === 'HARPOON') {
    // Steel-blue rail breech + winch drum + 1..3 barbed harpoon rails
    const breech = new Path2D();
    breech.rect(-15, -8, 26, 15);
    ctx.fillStyle = '#2c5282';
    ctx.fill(breech);
    ctx.strokeStyle = '#90cdf4';
    ctx.lineWidth = 1.4;
    ctx.stroke(breech);

    // Winch spool
    ctx.fillStyle = '#ecc94b';
    ctx.beginPath();
    ctx.arc(-6, -1, 4.5, 0, Math.PI * 2);
    ctx.fill();

    for (let i = 0; i < offsets.length; i++) {
      const by = offsets[i];
      ctx.fillStyle = '#63b3ed';
      ctx.fillRect(11, by - 1.5, 20, 3);
      // Barbed harpoon tip
      const tip = new Path2D();
      tip.moveTo(31, by - 3.2);
      tip.lineTo(37, by);
      tip.lineTo(31, by + 3.2);
      tip.closePath();
      ctx.fillStyle = '#e2e8f0';
      ctx.fill(tip);
    }
  } else {
    // MORTAR: Heavy amber-gold siege turret + 1..3 wide-bore mortar tubes
    const carriage = new Path2D();
    carriage.moveTo(-14, 7);
    carriage.lineTo(-10, -9);
    carriage.lineTo(12, -9);
    carriage.lineTo(15, 7);
    carriage.closePath();
    ctx.fillStyle = '#975a16';
    ctx.fill(carriage);
    ctx.strokeStyle = '#faf089';
    ctx.lineWidth = 1.5;
    ctx.stroke(carriage);

    for (let i = 0; i < offsets.length; i++) {
      const by = offsets[i];
      ctx.fillStyle = '#d69e2e';
      ctx.fillRect(8, by - 2.6, 16, 5.2);
      ctx.fillStyle = '#ecc94b';
      ctx.fillRect(22, by - 3.2, 4, 6.4);
    }
  }

  ctx.restore();
}

export function drawSandwalkerSolarShield(
  ctx: CanvasRenderingContext2D,
  rig: SandwalkerRig,
  input: SandwalkerRenderInput,
  timeSec: number
): void {
  if (input.solarShieldHp <= 0) return;

  const anchorX = input.anchorX ?? WALKER_ANCHOR_X;
  const groundY = input.groundY ?? WALKER_GROUND_Y;
  const cx = anchorX;
  const cy = groundY - 62 + rig.hullBobY;
  const pulse = 0.85 + 0.15 * Math.sin(timeSec * 5);

  ctx.save();
  const radius = 58;
  const grad = ctx.createRadialGradient(cx, cy, 18, cx, cy, radius);
  grad.addColorStop(0, 'rgba(99, 179, 237, 0.04)');
  grad.addColorStop(0.75, `rgba(99, 179, 237, ${(0.18 * pulse).toFixed(3)})`);
  grad.addColorStop(1, `rgba(246, 224, 94, ${(0.48 * pulse).toFixed(3)})`);

  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, Math.PI * 0.95, Math.PI * 2.05);
  ctx.fill();

  ctx.strokeStyle = `rgba(144, 205, 244, ${(0.85 * pulse).toFixed(3)})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, Math.PI * 0.98, Math.PI * 2.02);
  ctx.stroke();

  ctx.restore();
}
