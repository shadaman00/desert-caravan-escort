import { describe, it, expect } from 'vitest';
import {
  PALETTES,
  PALETTE_LERP_DURATION,
  PaletteController,
  clamp01,
  hexToRgb,
  lerpColorHsl,
  lerpColorRgb,
  lerpPalette,
  resolveTargetPalette,
} from '@/engine/render/palette';

describe('Atmospheric Palette & Grading Unit Suite', () => {
  it('interpolates RGB colors with clamping and shorthand hex support', () => {
    expect(lerpColorRgb('#000000', '#ffffff', 0.5)).toBe('#808080');
    expect(lerpColorRgb('#000', '#fff', -0.5)).toBe('#000000');
    expect(lerpColorRgb('#000', '#fff', 1.5)).toBe('#ffffff');
    expect(hexToRgb('#abc')).toEqual({ r: 170, g: 187, b: 204 });
  });

  it('interpolates HSL colors along the shortest hue arc', () => {
    // Red (0 deg) to Magenta (300 deg): midpoint should be 330 deg (rose/pink), NOT green (150 deg)
    const mid = hexToRgb(lerpColorHsl('#ff0000', '#ff00ff', 0.5));
    expect(mid.r > 200).toBe(true);
    expect(mid.g < 20).toBe(true);
    expect(mid.b > 100).toBe(true);
  });

  it('lerpPalette blends color tokens and numeric storm multiplier smoothly', () => {
    const mid = lerpPalette(PALETTES.DAY, PALETTES.STORM, 0.5);
    expect(mid.stormParticleMultiplier).toBeCloseTo(2.0, 5);
    expect(mid.skyTop).toBe(lerpColorRgb(PALETTES.DAY.skyTop, PALETTES.STORM.skyTop, 0.5));
    expect(PALETTES.STORM.stormParticleMultiplier).toBe(3.0);
  });

  it('PaletteController transitions over 2.0 seconds and supports mid-lerp interruption', () => {
    const ctrl = new PaletteController('DAY', PALETTE_LERP_DURATION);
    expect(ctrl.getCurrent().id).toBe('DAY');
    expect(ctrl.isTransitioning()).toBe(false);

    expect(ctrl.setTarget('DUSK')).toBe(true);
    expect(ctrl.setTarget('DUSK')).toBe(false); // duplicate target ignored
    expect(ctrl.isTransitioning()).toBe(true);

    ctrl.update(1.0);
    expect(ctrl.getProgress()).toBeCloseTo(0.5, 5);
    expect(ctrl.isTransitioning()).toBe(true);
    const midSky = ctrl.getCurrent().skyTop;
    expect(midSky).toBe(lerpColorRgb(PALETTES.DAY.skyTop, PALETTES.DUSK.skyTop, 0.5));

    // Interrupt mid-transition toward STORM -> preserves midSky as new start
    expect(ctrl.setTarget('STORM')).toBe(true);
    expect(ctrl.getProgress()).toBe(0);
    expect(ctrl.getCurrent().skyTop).toBe(midSky);

    ctrl.update(1.0);
    expect(ctrl.getProgress()).toBeCloseTo(0.5, 5);
    expect(ctrl.getCurrent().stormParticleMultiplier).toBeCloseTo(2.0, 4);

    ctrl.update(1.0);
    expect(ctrl.getProgress()).toBe(1);
    expect(ctrl.isTransitioning()).toBe(false);
    expect(ctrl.getCurrent().skyTop).toBe(PALETTES.STORM.skyTop);
    expect(ctrl.getCurrent().stormParticleMultiplier).toBe(3.0);
  });

  it('resolveTargetPalette maps OpeningHook, Acts 1-4, Hazards, Boss, and overrides', () => {
    expect(
      resolveTargetPalette({
        fsmStateId: 'OPENING_HOOK',
        currentAct: 1,
        currentOasisIndex: 0,
        routeProgress: 0,
        isSandstormActive: false,
        openingElapsedSeconds: 10,
      })
    ).toBe('NIGHT');

    expect(
      resolveTargetPalette({
        fsmStateId: 'OPENING_HOOK',
        currentAct: 1,
        currentOasisIndex: 0,
        routeProgress: 0,
        isSandstormActive: false,
        openingElapsedSeconds: 50,
      })
    ).toBe('STORM');

    expect(
      resolveTargetPalette({
        fsmStateId: 'OPENING_HOOK',
        currentAct: 1,
        currentOasisIndex: 0,
        routeProgress: 0,
        isSandstormActive: false,
        openingElapsedSeconds: 100,
      })
    ).toBe('DAY');

    expect(
      resolveTargetPalette({
        fsmStateId: 'MARCH_NORMAL',
        currentAct: 1,
        currentOasisIndex: 0,
        routeProgress: 20,
        isSandstormActive: false,
      })
    ).toBe('DAY');

    expect(
      resolveTargetPalette({
        fsmStateId: 'MARCH_NORMAL',
        currentAct: 1,
        currentOasisIndex: 0,
        routeProgress: 65,
        isSandstormActive: false,
      })
    ).toBe('DUSK');

    expect(
      resolveTargetPalette({
        fsmStateId: 'HAZARD_ZONE',
        currentAct: 3,
        currentOasisIndex: 0,
        routeProgress: 50,
        isSandstormActive: true,
      })
    ).toBe('STORM');

    expect(
      resolveTargetPalette({
        fsmStateId: 'BOSS_ENCOUNTER',
        currentAct: 4,
        currentOasisIndex: 0,
        routeProgress: 95,
        isSandstormActive: false,
      })
    ).toBe('STORM');

    expect(
      resolveTargetPalette({
        fsmStateId: 'MARCH_NORMAL',
        currentAct: 1,
        currentOasisIndex: 0,
        routeProgress: 10,
        isSandstormActive: false,
        overrideTimeOfDay: 'NIGHT',
      })
    ).toBe('NIGHT');
  });

  it('clamp01 maps +Infinity to 1, -Infinity/NaN to 0, and smoothly fades starsAlpha', () => {
    expect(clamp01(Number.POSITIVE_INFINITY)).toBe(1);
    expect(clamp01(Number.NEGATIVE_INFINITY)).toBe(0);
    expect(clamp01(Number.NaN)).toBe(0);
    expect(lerpColorRgb('#000000', '#ffffff', Number.POSITIVE_INFINITY)).toBe('#ffffff');
    expect(lerpPalette(PALETTES.DAY, PALETTES.NIGHT, Number.POSITIVE_INFINITY).skyTop).toBe(
      PALETTES.NIGHT.skyTop
    );

    const quarterNight = lerpPalette(PALETTES.DAY, PALETTES.NIGHT, 0.25);
    const threeQuarterNight = lerpPalette(PALETTES.DAY, PALETTES.NIGHT, 0.75);
    expect(PALETTES.DAY.starsAlpha).toBe(0);
    expect(PALETTES.NIGHT.starsAlpha).toBe(1);
    expect(quarterNight.starsAlpha).toBeCloseTo(0.25, 5);
    expect(threeQuarterNight.starsAlpha).toBeCloseTo(0.75, 5);
  });

  it('preserves pre-interrupt offscreen layer blend weights on mid-transition interruption', () => {
    const ctrl = new PaletteController('DAY', 2.0);
    ctrl.setTarget('DUSK');
    ctrl.update(0.6); // p = 0.3

    const beforeInterrupt = ctrl.getLayerBlend();
    expect(beforeInterrupt.baseId).toBe('DAY');
    expect(beforeInterrupt.overlays.length).toBe(1);
    expect(beforeInterrupt.overlays[0].id).toBe('DUSK');
    expect(beforeInterrupt.overlays[0].alpha).toBeCloseTo(0.3, 5);

    // Interrupt at t = 0.3 -> STORM: immediately after setTarget, DUSK@0.3 must remain intact
    ctrl.setTarget('STORM');
    const atInterrupt = ctrl.getLayerBlend();
    expect(atInterrupt.baseId).toBe('DAY');
    expect(atInterrupt.overlays.length).toBe(1);
    expect(atInterrupt.overlays[0].id).toBe('DUSK');
    expect(atInterrupt.overlays[0].alpha).toBeCloseTo(0.3, 5);

    // Halfway through new transition: DUSK scales to 0.15, STORM rises to 0.5
    ctrl.update(1.0);
    const midNew = ctrl.getLayerBlend();
    expect(midNew.baseId).toBe('DAY');
    expect(midNew.overlays).toEqual([
      { id: 'DUSK', alpha: 0.15 },
      { id: 'STORM', alpha: 0.5 },
    ]);

    // Completion clears prior overlays cleanly to 100% STORM
    ctrl.update(1.0);
    expect(ctrl.getLayerBlend()).toEqual({ baseId: 'STORM', overlays: [] });
  });
});
