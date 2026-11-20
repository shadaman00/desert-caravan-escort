import { describe, it, expect } from 'vitest';
import {
  calculateScale,
  clientToLogical,
  clientToZoneB,
  LOGICAL_WIDTH,
  LOGICAL_HEIGHT,
  ZONE_B_HEIGHT,
} from '@/app/scale';

describe('scale.ts logic', () => {
  it('calculates scale correctly for exact dimensions', () => {
    expect(calculateScale(430, 932)).toBe(1);
  });

  it('calculates scale constrained by height', () => {
    // 860 width (2x), 932 height (1x) -> scale constrained to 1
    expect(calculateScale(860, 932)).toBe(1);
  });

  it('calculates scale constrained by width', () => {
    // 430 width (1x), 1864 height (2x) -> scale constrained to 1
    expect(calculateScale(430, 1864)).toBe(1);
  });

  it('scales uniformly when double sized', () => {
    expect(calculateScale(860, 1864)).toBe(2);
  });

  it('handles zero or negative dimensions safely without throwing', () => {
    expect(calculateScale(0, 0)).toBe(1);
    expect(calculateScale(-100, 500)).toBe(1);
  });

  it('converts client coordinates to logical coordinates', () => {
    const mockRect = {
      left: 100,
      top: 50,
      width: 430,
      height: 932,
    } as DOMRect;

    const pt = clientToLogical(150, 100, mockRect);
    expect(pt.x).toBe(50);
    expect(pt.y).toBe(50);
  });

  it('clamps client coordinates within logical bounds', () => {
    const mockRect = {
      left: 0,
      top: 0,
      width: 430,
      height: 932,
    } as DOMRect;

    const ptOutOfBounds = clientToLogical(500, 1000, mockRect);
    expect(ptOutOfBounds.x).toBe(LOGICAL_WIDTH);
    expect(ptOutOfBounds.y).toBe(LOGICAL_HEIGHT);
  });

  it('converts client coordinates to Zone B canvas coordinates', () => {
    const mockCanvasRect = {
      left: 0,
      top: 140,
      width: 430,
      height: ZONE_B_HEIGHT,
    } as DOMRect;

    const pt = clientToZoneB(215, 396, mockCanvasRect);
    expect(pt.x).toBe(215);
    expect(pt.y).toBe(256);
  });
});
