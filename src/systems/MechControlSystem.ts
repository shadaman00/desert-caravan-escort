import {
  BASE_MARCH_SPEED,
  DODGE_COOLDOWN_SEC,
  DODGE_IFRAME_SEC,
  FORCED_COOL_DURATION_SEC,
  FORCED_COOL_FIRE_MULT,
  HEAT_COOL_PER_SEC,
  HEAT_GAIN_PER_SEC,
  HEAT_MAX,
  HEAT_SWEET_MAX,
  HEAT_SWEET_MIN,
  OVERDRIVE_DURATION_SEC,
  OVERDRIVE_FIRE_MULT,
  OVERDRIVE_SPEED_MULT,
  PARTS_MASTER,
  QUICKSAND_RESIST_PER_LV,
  SPEED_GROWTH_PER_LEG_LV,
} from '@/data/masterData';

export type MechFsmState =
  | 'MARCH_AUTO'
  | 'OVERDRIVE_VENT'
  | 'GOLDEN_COUNTER'
  | 'SHIELD_ACTIVE'
  | 'EVENT_PAUSE';

export interface MechControlSnapshot {
  fsmState: MechFsmState;
  heat: number;
  inSweetSpot: boolean;
  isOverdrive: boolean;
  overdriveRemainingSec: number;
  forcedCoolRemainingSec: number;
  isShieldActive: boolean;
  shieldRemainingSec: number;
  shieldCooldownSec: number;
  isInvulnerable: boolean;
  dodgeCooldownSec: number;
  fireRateMultiplier: number;
  speedMultiplier: number;
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

export function computeMarchSpeed(
  legLevel: number,
  quicksandPenalty: number,
  overdriveMultiplier = 1.0
): number {
  const safeLeg = Math.max(1, Math.floor(legLevel));
  const resistance = Math.min(1.0, QUICKSAND_RESIST_PER_LV * (safeLeg - 1));
  const terrainFactor = 1 - quicksandPenalty * (1 - resistance);
  return BASE_MARCH_SPEED * (1 + SPEED_GROWTH_PER_LEG_LV * safeLeg) * terrainFactor * overdriveMultiplier;
}

/**
 * Pure deterministic Sandwalker Mech State Machine & Overheat/Parry/Shield controller.
 * Zero DOM/Canvas imports (PRD Section 2.2 SRP).
 */
export class MechControlSystem {
  private fsmState: MechFsmState = 'MARCH_AUTO';
  private heat = 0;
  private overdriveRemainingSec = 0;
  private forcedCoolRemainingSec = 0;
  private invulnRemainingSec = 0;
  private dodgeCooldownSec = 0;
  private shieldRemainingSec = 0;
  private shieldCooldownSec = 0;
  private goldenCounterRemainingSec = 0;
  private moraleRemainingSec = 0;
  private eventPaused = false;

  public reset(): void {
    this.fsmState = 'MARCH_AUTO';
    this.heat = 0;
    this.overdriveRemainingSec = 0;
    this.forcedCoolRemainingSec = 0;
    this.invulnRemainingSec = 0;
    this.dodgeCooldownSec = 0;
    this.shieldRemainingSec = 0;
    this.shieldCooldownSec = 0;
    this.goldenCounterRemainingSec = 0;
    this.moraleRemainingSec = 0;
    this.eventPaused = false;
  }

  public triggerEventOverdrive(): void {
    this.heat = 0;
    this.forcedCoolRemainingSec = 0;
    this.overdriveRemainingSec = OVERDRIVE_DURATION_SEC;
    this.syncFsmState();
  }

  public triggerShieldCooldownFromEvent(): void {
    this.shieldRemainingSec = 0;
    this.shieldCooldownSec = PARTS_MASTER.SHD_01.cooldownSec;
    this.syncFsmState();
  }

  public fullChargeShield(): void {
    this.shieldCooldownSec = 0;
    this.syncFsmState();
  }

  public applyMoraleBonus(durationSec: number): void {
    if (durationSec <= 0) return;
    this.moraleRemainingSec = Math.max(this.moraleRemainingSec, durationSec);
  }

  public setEventPause(paused: boolean): void {
    this.eventPaused = paused;
    this.syncFsmState();
  }

  public setHeatForDebug(heatValue: number): void {
    this.heat = clamp(heatValue, 0, HEAT_MAX);
    if (this.heat >= HEAT_MAX && this.forcedCoolRemainingSec <= 0) {
      this.forcedCoolRemainingSec = FORCED_COOL_DURATION_SEC;
    }
  }

  public update(dt: number, isFiring: boolean): MechControlSnapshot {
    const safeDt = Math.max(0, dt);
    if (this.eventPaused) {
      this.syncFsmState();
      return this.getSnapshot();
    }

    if (this.overdriveRemainingSec > 0) {
      this.overdriveRemainingSec = Math.max(0, this.overdriveRemainingSec - safeDt);
    }

    if (this.forcedCoolRemainingSec > 0) {
      this.forcedCoolRemainingSec = Math.max(0, this.forcedCoolRemainingSec - safeDt);
      this.heat = (this.forcedCoolRemainingSec / FORCED_COOL_DURATION_SEC) * HEAT_MAX;
      if (this.forcedCoolRemainingSec <= 0) {
        this.heat = 0;
      }
    } else if (this.overdriveRemainingSec <= 0) {
      // PRD Section 3.1: H(t+dt) = clamp(H(t) + (R_heat - R_cool) * dt, 0, 100) while firing
      const deltaHeat = isFiring
        ? (HEAT_GAIN_PER_SEC - HEAT_COOL_PER_SEC) * safeDt
        : -HEAT_COOL_PER_SEC * safeDt;
      this.heat = clamp(this.heat + deltaHeat, 0, HEAT_MAX);
      if (this.heat >= HEAT_MAX) {
        this.forcedCoolRemainingSec = FORCED_COOL_DURATION_SEC;
      }
    }

    if (this.invulnRemainingSec > 0) {
      this.invulnRemainingSec = Math.max(0, this.invulnRemainingSec - safeDt);
    }
    if (this.goldenCounterRemainingSec > 0) {
      this.goldenCounterRemainingSec = Math.max(0, this.goldenCounterRemainingSec - safeDt);
    }
    if (this.dodgeCooldownSec > 0) {
      this.dodgeCooldownSec = Math.max(0, this.dodgeCooldownSec - safeDt);
    }
    if (this.shieldRemainingSec > 0) {
      this.shieldRemainingSec = Math.max(0, this.shieldRemainingSec - safeDt);
    }
    if (this.shieldCooldownSec > 0) {
      this.shieldCooldownSec = Math.max(0, this.shieldCooldownSec - safeDt);
    }
    if (this.moraleRemainingSec > 0) {
      this.moraleRemainingSec = Math.max(0, this.moraleRemainingSec - safeDt);
    }

    this.syncFsmState();
    return this.getSnapshot();
  }

  public tryVentOverdrive(): boolean {
    if (this.eventPaused || this.forcedCoolRemainingSec > 0 || this.overdriveRemainingSec > 0) {
      return false;
    }
    if (this.heat < HEAT_SWEET_MIN || this.heat > HEAT_SWEET_MAX) {
      return false;
    }
    this.heat = 0;
    this.overdriveRemainingSec = OVERDRIVE_DURATION_SEC;
    this.syncFsmState();
    return true;
  }

  public tryDodgeOrParry(isBossTelegraphActive: boolean): {
    triggered: boolean;
    isGoldenCounter: boolean;
  } {
    if (this.eventPaused || this.dodgeCooldownSec > 0) {
      return { triggered: false, isGoldenCounter: false };
    }
    this.dodgeCooldownSec = DODGE_COOLDOWN_SEC;
    this.invulnRemainingSec = DODGE_IFRAME_SEC;

    if (isBossTelegraphActive) {
      this.goldenCounterRemainingSec = DODGE_IFRAME_SEC;
      this.syncFsmState();
      return { triggered: true, isGoldenCounter: true };
    }

    this.syncFsmState();
    return { triggered: true, isGoldenCounter: false };
  }

  public tryActivateShield(shieldLevel: number): boolean {
    if (this.eventPaused || this.shieldCooldownSec > 0) {
      return false;
    }
    const extraSec = Math.max(0, shieldLevel - 1) * PARTS_MASTER.SHD_01.durationBonusPerLv;
    this.shieldRemainingSec = PARTS_MASTER.SHD_01.baseDurationSec + extraSec;
    this.shieldCooldownSec = PARTS_MASTER.SHD_01.cooldownSec;
    this.syncFsmState();
    return true;
  }

  private syncFsmState(): void {
    if (this.eventPaused) {
      this.fsmState = 'EVENT_PAUSE';
    } else if (this.goldenCounterRemainingSec > 0) {
      this.fsmState = 'GOLDEN_COUNTER';
    } else if (this.overdriveRemainingSec > 0) {
      this.fsmState = 'OVERDRIVE_VENT';
    } else if (this.shieldRemainingSec > 0) {
      this.fsmState = 'SHIELD_ACTIVE';
    } else {
      this.fsmState = 'MARCH_AUTO';
    }
  }

  public getSnapshot(): MechControlSnapshot {
    const isOverdrive = this.overdriveRemainingSec > 0;
    const isForcedCool = this.forcedCoolRemainingSec > 0;
    const baseRate = isOverdrive
      ? OVERDRIVE_FIRE_MULT
      : isForcedCool
        ? FORCED_COOL_FIRE_MULT
        : 1.0;
    const fireRateMultiplier = this.moraleRemainingSec > 0 ? baseRate * 1.15 : baseRate;

    return {
      fsmState: this.fsmState,
      heat: Math.round(this.heat * 10) / 10,
      inSweetSpot: !isForcedCool && !isOverdrive && this.heat >= HEAT_SWEET_MIN && this.heat <= HEAT_SWEET_MAX,
      isOverdrive,
      overdriveRemainingSec: this.overdriveRemainingSec,
      forcedCoolRemainingSec: this.forcedCoolRemainingSec,
      isShieldActive: this.shieldRemainingSec > 0,
      shieldRemainingSec: this.shieldRemainingSec,
      shieldCooldownSec: this.shieldCooldownSec,
      isInvulnerable: this.invulnRemainingSec > 0,
      dodgeCooldownSec: this.dodgeCooldownSec,
      fireRateMultiplier,
      speedMultiplier: isOverdrive ? OVERDRIVE_SPEED_MULT : 1.0,
    };
  }
}
