import type { TurretType } from '@/store/types';

export const TURRET_SWITCH_COOLDOWN_SEC = 0.3;
export const TURRET_SWAP_ANIM_SEC = 0.15;
export const MORTAR_AOE_RADIUS_PX = 90;
export const MORTAR_GRAVITY_PX_S2 = 520;
export const WEAK_POINT_SNAP_RADIUS_PX = 40;
export const MANUAL_AIM_LOCK_DURATION_SEC = 2.0;
export const WEAK_POINT_DAMAGE_MULTIPLIER = 1.5;
export const SYNERGY_ATTACK_BONUS = 0.25;

export interface TurretConfig {
  readonly id: TurretType;
  readonly label: string;
  readonly shortLabel: string;
  readonly baseDpsLv1: number;
  readonly fireIntervalSec: number;
  readonly baseDamagePerHit: number;
  readonly rangePx: number;
  readonly projectileSpeedPx: number;
  readonly knockbackPx: number;
  readonly armorCrushFactor: number;
  readonly aoeRadiusPx: number;
  readonly recoilKickPx: number;
  readonly muzzleLocalX: number;
}

export const TURRET_CONFIGS: Record<TurretType, TurretConfig> = {
  HEAT_RAY: {
    id: 'HEAT_RAY',
    label: '열선 레이저',
    shortLabel: '열선',
    baseDpsLv1: 40,
    fireIntervalSec: 0.1,
    baseDamagePerHit: 4.0,
    rangePx: 500,
    projectileSpeedPx: 0,
    knockbackPx: 0,
    armorCrushFactor: 0.5,
    aoeRadiusPx: 0,
    recoilKickPx: 1.5,
    muzzleLocalX: 30,
  },
  HARPOON: {
    id: 'HARPOON',
    label: '대형 작살포',
    shortLabel: '작살',
    baseDpsLv1: 55,
    fireIntervalSec: 1.0,
    baseDamagePerHit: 55,
    rangePx: 480,
    projectileSpeedPx: 760,
    knockbackPx: 32,
    armorCrushFactor: 2.0,
    aoeRadiusPx: 0,
    recoilKickPx: 6.0,
    muzzleLocalX: 37,
  },
  MORTAR: {
    id: 'MORTAR',
    label: '곡사 박격포',
    shortLabel: '박격포',
    baseDpsLv1: 35,
    fireIntervalSec: 1.5,
    baseDamagePerHit: 52.5,
    rangePx: 460,
    projectileSpeedPx: 0,
    knockbackPx: 0,
    armorCrushFactor: 1.0,
    aoeRadiusPx: MORTAR_AOE_RADIUS_PX,
    recoilKickPx: 7.5,
    muzzleLocalX: 26,
  },
};
