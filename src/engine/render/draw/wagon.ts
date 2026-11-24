import type { SkinId } from '@/store/types';

export const MAX_WAGONS = 5;
export const WAGON_PITCH = 29;
export const FIRST_UNIT_OFFSET = 14;
export const WAGON_WHEEL_RADIUS = 4.5;

export interface WagonPose {
  index: number;
  camelX: number;
  camelY: number;
  camelStridePhase: number;
  wagonX: number;
  wagonY: number;
  bobOffsetY: number;
  wheelAngle: number;
  tetherStartX: number;
  tetherStartY: number;
  tetherEndX: number;
  tetherEndY: number;
}

export interface WagonRenderInput {
  wagonCount: number;
  equippedSkinId: SkinId;
  walkerRearHitchX: number;
  walkerRearHitchY: number;
  groundY?: number;
  speed: number;
}

export function computeWagonTrain(
  input: WagonRenderInput,
  travelDistance: number,
  bobClockSec: number
): WagonPose[] {
  const count = Number.isFinite(input.wagonCount)
    ? Math.max(0, Math.min(MAX_WAGONS, Math.floor(input.wagonCount)))
    : 0;
  const groundY = input.groundY ?? 336;
  const speed = Number.isFinite(input.speed) && input.speed > 0 ? input.speed : 0;
  const wheelAngle = travelDistance / WAGON_WHEEL_RADIUS;
  const isMoving = speed > 0.5;
  const bobFreq = isMoving ? (speed / 120) * 7.5 : 0;

  const poses: WagonPose[] = [];
  let prevBobOffsetY = 0;

  for (let i = 0; i < count; i++) {
    const camelX = input.walkerRearHitchX - FIRST_UNIT_OFFSET - i * WAGON_PITCH;
    const wagonX = camelX - 16;
    const phase = bobClockSec * bobFreq + i * 1.15;
    const bobOffsetY = isMoving ? Math.sin(phase) * 1.6 : 0;
    const camelY = groundY + (isMoving ? Math.abs(Math.sin(phase)) * -0.8 : 0);
    const wagonY = groundY + bobOffsetY;

    let tetherStartX: number;
    let tetherStartY: number;
    if (i === 0) {
      tetherStartX = input.walkerRearHitchX;
      tetherStartY = input.walkerRearHitchY;
    } else {
      const prevWagonX = camelX + WAGON_PITCH - 16;
      tetherStartX = prevWagonX - 8.5;
      tetherStartY = groundY - 12 + prevBobOffsetY;
    }

    const tetherEndX = camelX + 4.5;
    const tetherEndY = camelY - 11;

    poses.push({
      index: i,
      camelX,
      camelY,
      camelStridePhase: isMoving ? phase * 1.4 : 0,
      wagonX,
      wagonY,
      bobOffsetY,
      wheelAngle,
      tetherStartX,
      tetherStartY,
      tetherEndX,
      tetherEndY,
    });

    prevBobOffsetY = bobOffsetY;
  }

  return poses;
}

function drawCamel(
  ctx: CanvasRenderingContext2D,
  pose: WagonPose,
  isRoyal: boolean
): void {
  const { camelX, camelY, camelStridePhase } = pose;
  const coat = isRoyal ? '#e8d5b7' : '#c68b59';
  const packColor = isRoyal ? '#2b6cb0' : '#8b5a2b';
  const legSwingA = Math.sin(camelStridePhase) * 2.5;
  const legSwingB = Math.cos(camelStridePhase) * 2.5;

  // 4 animated legs
  ctx.strokeStyle = isRoyal ? '#c9b08a' : '#9c683c';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(camelX - 3, camelY - 7);
  ctx.lineTo(camelX - 3 + legSwingA, camelY);
  ctx.moveTo(camelX - 1, camelY - 7);
  ctx.lineTo(camelX - 1 + legSwingB, camelY);
  ctx.moveTo(camelX + 2.5, camelY - 7);
  ctx.lineTo(camelX + 2.5 - legSwingA, camelY);
  ctx.moveTo(camelX + 4, camelY - 7);
  ctx.lineTo(camelX + 4 - legSwingB, camelY);
  ctx.stroke();

  // Camel body, hump, neck & head via Path2D
  const camelPath = new Path2D();
  camelPath.moveTo(camelX - 5, camelY - 7);
  camelPath.lineTo(camelX - 4.5, camelY - 11);
  camelPath.quadraticCurveTo(camelX, camelY - 16, camelX + 3, camelY - 11);
  // Neck & head facing +X
  camelPath.lineTo(camelX + 5.5, camelY - 15.5);
  camelPath.lineTo(camelX + 8.5, camelY - 15.2);
  camelPath.lineTo(camelX + 8.2, camelY - 13.2);
  camelPath.lineTo(camelX + 5.8, camelY - 12.8);
  camelPath.lineTo(camelX + 4.5, camelY - 7);
  camelPath.closePath();

  ctx.fillStyle = coat;
  ctx.fill(camelPath);

  // Saddle cargo pack
  ctx.fillStyle = packColor;
  ctx.fillRect(camelX - 3.2, camelY - 13.8, 5, 3.2);
}

function drawSpokedWheel(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  angle: number,
  rimColor: string
): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.strokeStyle = rimColor;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.stroke();

  ctx.rotate(angle);
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let k = 0; k < 2; k++) {
    const a = k * (Math.PI * 0.5);
    const dx = Math.cos(a) * radius;
    const dy = Math.sin(a) * radius;
    ctx.moveTo(-dx, -dy);
    ctx.lineTo(dx, dy);
  }
  ctx.stroke();
  ctx.restore();
}

export function drawWagonTrain(
  ctx: CanvasRenderingContext2D,
  poses: readonly WagonPose[],
  equippedSkinId: SkinId,
  groundY = 336
): void {
  if (poses.length === 0) return;
  const isRoyal = equippedSkinId === 'GOLDEN_PHARAOH';

  ctx.save();

  for (let i = poses.length - 1; i >= 0; i--) {
    const pose = poses[i];

    // Quadratic harness tether
    const midX = (pose.tetherStartX + pose.tetherEndX) * 0.5;
    const midY = (pose.tetherStartY + pose.tetherEndY) * 0.5 + 2.5;
    ctx.strokeStyle = isRoyal ? '#ecc94b' : '#c69963';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(pose.tetherStartX, pose.tetherStartY);
    ctx.quadraticCurveTo(midX, midY, pose.tetherEndX, pose.tetherEndY);
    ctx.stroke();

    // Rigid wooden shafts from camel flank to wagon front
    ctx.strokeStyle = '#7c4b28';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(pose.camelX - 4, pose.camelY - 9);
    ctx.lineTo(pose.wagonX + 8.5, pose.wagonY - 10);
    ctx.stroke();

    // Camel silhouette
    drawCamel(ctx, pose, isRoyal);

    // Wagon canopy + bed
    const wx = pose.wagonX;
    const wy = pose.wagonY;

    const canopy = new Path2D();
    canopy.moveTo(wx - 8, wy - 16);
    canopy.quadraticCurveTo(wx, wy - 25.5, wx + 8, wy - 16);
    canopy.closePath();
    ctx.fillStyle = isRoyal ? '#553c9a' : '#d6b88d';
    ctx.fill(canopy);
    ctx.strokeStyle = isRoyal ? '#ecc94b' : '#9c7a4c';
    ctx.lineWidth = 1;
    ctx.stroke(canopy);

    // Canopy rib seams
    ctx.beginPath();
    ctx.moveTo(wx - 2.5, wy - 16);
    ctx.lineTo(wx - 2, wy - 20.5);
    ctx.moveTo(wx + 2.5, wy - 16);
    ctx.lineTo(wx + 2, wy - 20.5);
    ctx.stroke();

    // Wagon bed
    ctx.fillStyle = isRoyal ? '#744210' : '#4a321f';
    ctx.strokeStyle = isRoyal ? '#ecc94b' : '#c87d32';
    ctx.lineWidth = 1.2;
    ctx.fillRect(wx - 8.5, wy - 17, 17, 11);
    ctx.strokeRect(wx - 8.5, wy - 17, 17, 11);

    // Rotating spoked wheels
    const wheelRim = isRoyal ? '#ecc94b' : '#b7791f';
    drawSpokedWheel(
      ctx,
      wx - 5,
      groundY - WAGON_WHEEL_RADIUS,
      WAGON_WHEEL_RADIUS,
      pose.wheelAngle,
      wheelRim
    );
    drawSpokedWheel(
      ctx,
      wx + 5,
      groundY - WAGON_WHEEL_RADIUS,
      WAGON_WHEEL_RADIUS,
      pose.wheelAngle,
      wheelRim
    );
  }

  ctx.restore();
}
