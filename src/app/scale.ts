import { useState, useEffect } from 'react';

/** Logical dimensions of the 16:9 landscape viewport */
export const LOGICAL_WIDTH = 960;
export const LOGICAL_HEIGHT = 540;

/** 3-Zone L-Shape landscape bounds */
export const ZONE_A_HEIGHT = 56; // Top bar: 960 x 56
export const ZONE_B_WIDTH = 680; // Left upper canvas: 680 x 412
export const ZONE_B_HEIGHT = 412;
export const ZONE_C_TACTICAL_HEIGHT = 72; // Left lower tactical bar: 680 x 72
export const ZONE_C_WIDTH = 280; // Right side panel: 280 x 484
export const ZONE_C_HEIGHT = 484;

export interface ViewportScaleState {
  scale: number;
  logicalWidth: number;
  logicalHeight: number;
  windowWidth: number;
  windowHeight: number;
}

/**
 * Calculates uniform letterbox scale factor.
 */
export function calculateScale(windowWidth: number, windowHeight: number): number {
  if (windowWidth <= 0 || windowHeight <= 0) return 1;
  return Math.min(windowWidth / LOGICAL_WIDTH, windowHeight / LOGICAL_HEIGHT);
}

/**
 * Converts screen client coordinates to logical 430x932 coordinates.
 */
export function clientToLogical(
  clientX: number,
  clientY: number,
  containerRect: DOMRect
): { x: number; y: number } {
  if (containerRect.width <= 0 || containerRect.height <= 0) {
    return { x: 0, y: 0 };
  }
  const scaleX = LOGICAL_WIDTH / containerRect.width;
  const scaleY = LOGICAL_HEIGHT / containerRect.height;
  const x = (clientX - containerRect.left) * scaleX;
  const y = (clientY - containerRect.top) * scaleY;
  return {
    x: Math.max(0, Math.min(LOGICAL_WIDTH, x)),
    y: Math.max(0, Math.min(LOGICAL_HEIGHT, y)),
  };
}

/**
 * Converts screen client coordinates to Zone B (680x412) Canvas coordinates.
 */
export function clientToZoneB(
  clientX: number,
  clientY: number,
  canvasRect: DOMRect
): { x: number; y: number } {
  if (canvasRect.width <= 0 || canvasRect.height <= 0) {
    return { x: 0, y: 0 };
  }
  const scaleX = ZONE_B_WIDTH / canvasRect.width;
  const scaleY = ZONE_B_HEIGHT / canvasRect.height;
  const x = (clientX - canvasRect.left) * scaleX;
  const y = (clientY - canvasRect.top) * scaleY;
  return {
    x: Math.max(0, Math.min(ZONE_B_WIDTH, x)),
    y: Math.max(0, Math.min(ZONE_B_HEIGHT, y)),
  };
}

/**
 * React Hook managing window resize and uniform viewport scaling.
 */
export function useViewportScale(): ViewportScaleState {
  const [state, setState] = useState<ViewportScaleState>(() => {
    if (typeof window === 'undefined') {
      return {
        scale: 1,
        logicalWidth: LOGICAL_WIDTH,
        logicalHeight: LOGICAL_HEIGHT,
        windowWidth: LOGICAL_WIDTH,
        windowHeight: LOGICAL_HEIGHT,
      };
    }
    return {
      scale: calculateScale(window.innerWidth, window.innerHeight),
      logicalWidth: LOGICAL_WIDTH,
      logicalHeight: LOGICAL_HEIGHT,
      windowWidth: window.innerWidth,
      windowHeight: window.innerHeight,
    };
  });

  useEffect(() => {
    const handleResize = () => {
      setState({
        scale: calculateScale(window.innerWidth, window.innerHeight),
        logicalWidth: LOGICAL_WIDTH,
        logicalHeight: LOGICAL_HEIGHT,
        windowWidth: window.innerWidth,
        windowHeight: window.innerHeight,
      });
    };

    window.addEventListener('resize', handleResize, { passive: true });
    window.addEventListener('orientationchange', handleResize, { passive: true });
    document.addEventListener('fullscreenchange', handleResize);
    document.addEventListener('webkitfullscreenchange', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
      document.removeEventListener('fullscreenchange', handleResize);
      document.removeEventListener('webkitfullscreenchange', handleResize);
    };
  }, []);

  return state;
}
