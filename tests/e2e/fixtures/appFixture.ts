// ============================================================================
// File: tests/e2e/fixtures/appFixture.ts
// Playwright Custom Test Fixture with Zero-Asset Interceptor & 60 FPS Profiler
// Adheres strictly to AC-01 (Zero-Asset procedural canvas, 0 errors, 60 FPS)
// ============================================================================

import { test as base, expect, Page, Request, Response, ConsoleMessage } from '@playwright/test';

/**
 * Forbidden image extensions per AC-01 Zero-Asset rule.
 * Exported for direct unit/adversarial verification.
 */
export const BANNED_IMAGE_REGEX = /\.(png|jpe?g|webp|svg|gif|bmp|ico|avif|tiff?)($|\?|#)/i;
const BANNED_PATHNAME_REGEX = /\.(png|jpe?g|webp|svg|gif|bmp|ico|avif|tiff?)$/i;
const DATA_IMAGE_REGEX = /^data:image\//i;
const BLOB_URI_REGEX = /^blob:/i;

/**
 * Evaluates whether a URL points to an external or inline image asset.
 * Parses URL pathname with a dummy base so relative URLs with query parameters
 * (e.g. /api/data?ref=test.png) do not cause false positives, while catching
 * #hash fragments, data:image/* URIs, and blob: URIs.
 */
export function isBannedImageUrl(url: string): boolean {
  if (!url) return false;
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (DATA_IMAGE_REGEX.test(trimmed) || BLOB_URI_REGEX.test(trimmed)) {
    return true;
  }
  try {
    const parsed = new URL(trimmed, 'http://localhost');
    return BANNED_PATHNAME_REGEX.test(parsed.pathname);
  } catch {
    return BANNED_IMAGE_REGEX.test(trimmed);
  }
}

/**
 * Matches only the implicit browser /favicon.ico probe (no query/hash).
 */
function isImplicitFaviconUrl(url: string): boolean {
  if (!url) return false;
  const trimmed = url.trim();
  if (!trimmed) return false;
  try {
    const parsed = new URL(trimmed, 'http://localhost');
    return parsed.pathname === '/favicon.ico' && !parsed.search && !parsed.hash;
  } catch {
    return false;
  }
}

/**
 * Returns true only for Playwright errors caused by a page/frame/context
 * closing or navigating mid-evaluation.
 */
function isClosedOrNavigatingContextError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    /Target page, context or browser has been closed/i.test(message) ||
    /Target closed/i.test(message) ||
    /Session closed/i.test(message) ||
    /Execution context was destroyed/i.test(message) ||
    /Frame was detached/i.test(message) ||
    /Cannot find context with specified id/i.test(message) ||
    /page was closed/i.test(message)
  );
}

/**
 * Audits the live DOM and computed CSS styles for embedded data:image/* URIs or
 * banned image URLs that Chromium does not emit via page.on('request').
 */
export async function auditDomForImageAssets(page: Page): Promise<string[]> {
  if (page.isClosed()) return [];
  try {
    return await page.evaluate(() => {
      const violations: string[] = [];
      const dataUriPattern = /data:image\//i;
      const blobUriPattern = /(?:^|["'(\s,])blob:/i;
      const extPattern = /\.(png|jpe?g|webp|svg|gif|bmp|ico|avif|tiff?)($|\?|#|["'),\s])/i;
      const contentUrlPattern =
        /url\([^)]*(?:data:image\/|blob:|\.(?:png|jpe?g|webp|svg|gif|bmp|ico|avif|tiff?)(?:$|\?|#|["'),\s]))/i;
      const hasBannedRef = (val: string) =>
        Boolean(val && (dataUriPattern.test(val) || blobUriPattern.test(val) || extPattern.test(val)));

      const imgs = Array.from(document.querySelectorAll('img'));
      for (const img of imgs) {
        const src = img.getAttribute('src') || img.currentSrc || '';
        const srcset = img.getAttribute('srcset') || '';
        if (hasBannedRef(src)) {
          violations.push(`<img src="${src.slice(0, 120)}">`);
        }
        if (hasBannedRef(srcset)) {
          violations.push(`<img srcset="${srcset.slice(0, 120)}">`);
        }
      }

      const sources = Array.from(document.querySelectorAll('source, link[rel*="icon"]'));
      for (const el of sources) {
        for (const attr of ['src', 'srcset', 'href'] as const) {
          const ref = el.getAttribute(attr) || '';
          if (hasBannedRef(ref)) {
            violations.push(`<${el.tagName.toLowerCase()} ${attr}="${ref.slice(0, 120)}">`);
          }
        }
      }

      const svgImages = Array.from(document.querySelectorAll('svg image, image'));
      for (const el of svgImages) {
        const ref =
          el.getAttribute('href') ||
          el.getAttribute('xlink:href') ||
          el.getAttributeNS('http://www.w3.org/1999/xlink', 'href') ||
          '';
        if (hasBannedRef(ref)) {
          violations.push(`<svg:image href="${ref.slice(0, 120)}">`);
        }
      }

      const imageInputs = Array.from(document.querySelectorAll('input[type="image"][src]'));
      for (const el of imageInputs) {
        const src = el.getAttribute('src') || '';
        if (hasBannedRef(src)) {
          violations.push(`<input type="image" src="${src.slice(0, 120)}">`);
        }
      }

      const videos = Array.from(document.querySelectorAll('video[poster]'));
      for (const el of videos) {
        const poster = el.getAttribute('poster') || '';
        if (hasBannedRef(poster)) {
          violations.push(`<video poster="${poster.slice(0, 120)}">`);
        }
      }

      const allElements = Array.from(document.querySelectorAll('*'));
      const pseudos: Array<string | null> = [null, '::before', '::after'];
      for (const el of allElements) {
        for (const pseudo of pseudos) {
          const style = window.getComputedStyle(el, pseudo);
          const tagLabel = pseudo ? `${el.tagName.toLowerCase()}${pseudo}` : el.tagName.toLowerCase();
          const cssProps =
            pseudo === null
              ? [
                  style.backgroundImage,
                  style.listStyleImage,
                  style.borderImageSource,
                  style.getPropertyValue('mask-image'),
                  style.getPropertyValue('-webkit-mask-image'),
                ]
              : [style.backgroundImage];
          for (const val of cssProps) {
            if (val && val !== 'none' && hasBannedRef(val)) {
              violations.push(`CSS(${tagLabel}): ${val.slice(0, 120)}`);
            }
          }
          if (
            style.content &&
            style.content !== 'none' &&
            style.content !== 'normal' &&
            contentUrlPattern.test(style.content)
          ) {
            violations.push(`CSS-content(${tagLabel}): ${style.content.slice(0, 120)}`);
          }
        }
      }

      return violations;
    });
  } catch (error) {
    if (page.isClosed() || isClosedOrNavigatingContextError(error)) {
      return [];
    }
    throw error;
  }
}

export interface DetectedAssetRequest {
  url: string;
  resourceType: string;
  method: string;
  timestamp: number;
}

export interface CapturedConsoleError {
  type: string;
  text: string;
  location: string;
  timestamp: number;
}

export interface FpsMetrics {
  frameCount: number;
  durationMs: number;
  averageFps: number;
  fps1PercentLow: number;
  minFps: number;
  maxFps: number;
  sampleFrameIntervalsMs: number[];
  timedOut: boolean;
}

export interface AssetTracker {
  getRequests: () => DetectedAssetRequest[];
  clear: () => void;
  auditDomAssets: () => Promise<string[]>;
  assertZeroAssets: () => void;
}

export interface ErrorTracker {
  getPageErrors: () => Error[];
  getConsoleErrors: () => CapturedConsoleError[];
  getAllErrors: () => string[];
  clear: () => void;
  assertNoErrors: () => void;
}

export interface FpsMonitor {
  measure: (durationMs?: number, warmupFrames?: number) => Promise<FpsMetrics>;
  assertCadence: (
    minAverageFps?: number,
    min1PercentLow?: number,
    durationMs?: number,
    warmupFrames?: number
  ) => Promise<FpsMetrics>;
}

export interface SandwalkerFixtures {
  gamePage: Page;
  assetTracker: AssetTracker;
  errorTracker: ErrorTracker;
  fpsMonitor: FpsMonitor;
}

/**
 * Extended Playwright test fixture providing automated AC-01 verification.
 */
export const test = base.extend<SandwalkerFixtures>({
  gamePage: async ({ page }, use) => {
    // ------------------------------------------------------------------------
    // 1. AC-01 Zero-Asset Network Interception (Request + Response)
    // ------------------------------------------------------------------------
    const detectedAssetRequests: DetectedAssetRequest[] = [];

    const handleRequest = (request: Request) => {
      const url = request.url();
      const resourceType = request.resourceType();

      // Chromium automatically probes /favicon.ico with resourceType === 'other' on root loads.
      // Skip recording that implicit GET probe here; handleResponse still flags <400 or image/*,
      // explicit <img src="/favicon.ico"> has resourceType === 'image', and <link rel*="icon"> is caught by DOM audit.
      if (
        request.method() === 'GET' &&
        resourceType === 'other' &&
        isImplicitFaviconUrl(url)
      ) {
        return;
      }

      const isImage = resourceType === 'image' || isBannedImageUrl(url);

      if (isImage) {
        detectedAssetRequests.push({
          url,
          resourceType,
          method: request.method(),
          timestamp: Date.now(),
        });
      }
    };

    const handleResponse = (response: Response) => {
      const url = response.url();
      const contentType = (response.headers()['content-type'] || '').toLowerCase();
      const isImageContent = contentType.startsWith('image/');
      const isServedFavicon = isImplicitFaviconUrl(url) && response.status() < 400;

      if (isImageContent || isServedFavicon) {
        if (!detectedAssetRequests.some((r) => r.url === url)) {
          detectedAssetRequests.push({
            url,
            resourceType: isImageContent
              ? `response:${contentType}`
              : `response:status-${response.status()}`,
            method: response.request().method(),
            timestamp: Date.now(),
          });
        }
      }
    };

    page.on('request', handleRequest);
    page.on('response', handleResponse);

    // ------------------------------------------------------------------------
    // 2. AC-01 Console Error & PageError Capture
    // ------------------------------------------------------------------------
    const uncaughtPageErrors: Error[] = [];
    const capturedConsoleErrors: CapturedConsoleError[] = [];

    const handlePageError = (error: Error) => {
      uncaughtPageErrors.push(error);
    };

    const handleConsole = (msg: ConsoleMessage) => {
      if (msg.type() === 'error') {
        const loc = msg.location();
        const locUrl = loc.url || '';
        const text = msg.text();

        // Chromium automatically probes /favicon.ico on localhost roots; zero-asset SPAs
        // intentionally omit favicon files (explicit <link rel="icon"> is still caught by DOM audit).
        const isBrowserFavicon404 =
          isImplicitFaviconUrl(locUrl) &&
          text.includes('Failed to load resource') &&
          text.includes('404');
        if (isBrowserFavicon404) {
          return;
        }

        capturedConsoleErrors.push({
          type: msg.type(),
          text,
          location: `${locUrl || 'unknown'}:${loc.lineNumber || 0}:${loc.columnNumber || 0}`,
          timestamp: Date.now(),
        });
      }
    };

    page.on('pageerror', handlePageError);
    page.on('console', handleConsole);

    // Attach tracking arrays to page object context for tracker fixture access
    (page as any).__detectedAssetRequests = detectedAssetRequests;
    (page as any).__uncaughtPageErrors = uncaughtPageErrors;
    (page as any).__capturedConsoleErrors = capturedConsoleErrors;

    try {
      // Expose page to test execution
      await use(page);

      // ----------------------------------------------------------------------
      // 3. Automated Teardown Verification (AC-01 Compliance Guard)
      // ----------------------------------------------------------------------
      const domViolations = await auditDomForImageAssets(page);
      const failureMessages: string[] = [];

      if (detectedAssetRequests.length > 0 || domViolations.length > 0) {
        const netDetails = detectedAssetRequests
          .map((r) => `  - [${r.resourceType}] ${r.method} ${r.url}`)
          .join('\n');
        const domDetails = domViolations.map((v) => `  - [DOM/CSS] ${v}`).join('\n');
        const combinedDetails = [netDetails, domDetails].filter(Boolean).join('\n');
        failureMessages.push(
          `[AC-01 Violation] Detected ${detectedAssetRequests.length + domViolations.length} image asset violation(s):\n${combinedDetails}`
        );
      }

      if (uncaughtPageErrors.length > 0 || capturedConsoleErrors.length > 0) {
        const pageErrorSummary = uncaughtPageErrors.map(
          (e) => `[PageError] ${e.message}\n${e.stack || ''}`
        );
        const consoleErrorSummary = capturedConsoleErrors.map(
          (c) => `[ConsoleError] ${c.text} at ${c.location}`
        );
        const allErrors = [...pageErrorSummary, ...consoleErrorSummary].join('\n');
        failureMessages.push(
          `[AC-01 Violation] Uncaught errors detected during test execution:\n${allErrors}`
        );
      }

      if (failureMessages.length > 0) {
        throw new Error(failureMessages.join('\n\n'));
      }
    } finally {
      page.off('request', handleRequest);
      page.off('response', handleResponse);
      page.off('pageerror', handlePageError);
      page.off('console', handleConsole);
    }
  },

  assetTracker: async ({ gamePage }, use) => {
    const tracker: AssetTracker = {
      getRequests: () => {
        return (gamePage as any).__detectedAssetRequests || [];
      },
      clear: () => {
        const list = (gamePage as any).__detectedAssetRequests;
        if (list) list.length = 0;
      },
      auditDomAssets: async () => {
        return await auditDomForImageAssets(gamePage);
      },
      assertZeroAssets: () => {
        const list = (gamePage as any).__detectedAssetRequests || [];
        if (list.length > 0) {
          const details = list
            .map((r: DetectedAssetRequest) => `  - [${r.resourceType}] ${r.method} ${r.url}`)
            .join('\n');
          throw new Error(
            `[AC-01 Violation] Detected ${list.length} external image asset request(s):\n${details}`
          );
        }
      },
    };
    await use(tracker);
  },

  errorTracker: async ({ gamePage }, use) => {
    const tracker: ErrorTracker = {
      getPageErrors: () => (gamePage as any).__uncaughtPageErrors || [],
      getConsoleErrors: () => (gamePage as any).__capturedConsoleErrors || [],
      getAllErrors: () => {
        const pageErrors = ((gamePage as any).__uncaughtPageErrors || []).map((e: Error) => `[PageError] ${e.message}`);
        const consoleErrors = ((gamePage as any).__capturedConsoleErrors || []).map(
          (c: CapturedConsoleError) => `[ConsoleError] ${c.text} at ${c.location}`
        );
        return [...pageErrors, ...consoleErrors];
      },
      clear: () => {
        const pageErrors = (gamePage as any).__uncaughtPageErrors;
        if (pageErrors) pageErrors.length = 0;
        const consoleErrors = (gamePage as any).__capturedConsoleErrors;
        if (consoleErrors) consoleErrors.length = 0;
      },
      assertNoErrors: () => {
        const allErrors = tracker.getAllErrors();
        if (allErrors.length > 0) {
          throw new Error(`[AC-01 Violation] Uncaught errors detected:\n${allErrors.join('\n')}`);
        }
      },
    };
    await use(tracker);
  },

  fpsMonitor: async ({ gamePage }, use) => {
    const monitor: FpsMonitor = {
      measure: async (durationMs = 2000, warmupFrames = 0): Promise<FpsMetrics> => {
        if (!Number.isFinite(durationMs) || durationMs <= 0) {
          return {
            frameCount: 0,
            durationMs: 0,
            averageFps: 0,
            fps1PercentLow: 0,
            minFps: 0,
            maxFps: 0,
            sampleFrameIntervalsMs: [],
            timedOut: false,
          };
        }
        const safeWarmup =
          Number.isFinite(warmupFrames) && warmupFrames > 0 ? Math.floor(warmupFrames) : 0;

        return await gamePage.evaluate(
          ({ duration, warmup }) => {
            return new Promise<FpsMetrics>((resolve) => {
              const MAX_WARMUP_MS = 500;
              const WARMUP_FREEZE_THRESHOLD_MS = 200;
              const WATCHDOG_TIMEOUT_MS = Math.ceil(
                duration + (warmup > 0 ? MAX_WARMUP_MS : 0) + 5000
              );

              const frameDeltas: number[] = [];
              let inWarmup = warmup > 0;
              let remainingWarmup = warmup;
              let warmupStartTs: number | null = null;
              let prevWarmupTs: number | null = null;
              let startTimestamp: number | null = null;
              let lastTimestamp: number | null = null;
              let rafId: number | null = null;
              let settled = false;

              const buildMetrics = (totalElapsedMs: number, timedOut: boolean): FpsMetrics => {
                const frameCount = frameDeltas.length;
                if (totalElapsedMs <= 0 || frameCount === 0) {
                  return {
                    frameCount: 0,
                    durationMs: Math.max(0, Math.round(totalElapsedMs)),
                    averageFps: 0,
                    fps1PercentLow: 0,
                    minFps: 0,
                    maxFps: 0,
                    sampleFrameIntervalsMs: [],
                    timedOut,
                  };
                }

                const averageFps = frameCount / (totalElapsedMs / 1000);

                // Sort instantaneous frame rates ascending to compute percentiles
                const instantaneousFps = frameDeltas
                  .map((dt) => 1000 / dt)
                  .sort((a, b) => a - b);
                const minFps = instantaneousFps[0] ?? 0;
                const maxFps = instantaneousFps[instantaneousFps.length - 1] ?? 0;

                // 1% low: average of slowest 1% of frames (at least 1 frame)
                const lowCount = Math.max(1, Math.ceil(instantaneousFps.length * 0.01));
                const lowSlice = instantaneousFps.slice(0, lowCount);
                const fps1PercentLow =
                  lowSlice.reduce((sum, val) => sum + val, 0) / lowSlice.length;

                return {
                  frameCount,
                  durationMs: Math.round(totalElapsedMs),
                  averageFps: Math.round(averageFps * 10) / 10,
                  fps1PercentLow: Math.round(fps1PercentLow * 10) / 10,
                  minFps: Math.round(minFps * 10) / 10,
                  maxFps: Math.round(maxFps * 10) / 10,
                  sampleFrameIntervalsMs: frameDeltas.slice(0, 50),
                  timedOut,
                };
              };

              const timeoutId = window.setTimeout(() => {
                if (settled) return;
                settled = true;
                if (rafId !== null) {
                  cancelAnimationFrame(rafId);
                  rafId = null;
                }
                const elapsed =
                  startTimestamp !== null && lastTimestamp !== null
                    ? Math.max(0, lastTimestamp - startTimestamp)
                    : 0;
                resolve(buildMetrics(elapsed, true));
              }, WATCHDOG_TIMEOUT_MS);

              const finish = (totalElapsedMs: number) => {
                if (settled) return;
                settled = true;
                window.clearTimeout(timeoutId);
                resolve(buildMetrics(totalElapsedMs, false));
              };

              function frameCallback(currentTimestamp: number) {
                if (settled) return;

                if (inWarmup) {
                  if (warmupStartTs === null || prevWarmupTs === null) {
                    warmupStartTs = currentTimestamp;
                    prevWarmupTs = currentTimestamp;
                    remainingWarmup--;
                    rafId = requestAnimationFrame(frameCallback);
                    return;
                  }

                  const warmupDelta = currentTimestamp - prevWarmupTs;
                  if (warmupDelta > WARMUP_FREEZE_THRESHOLD_MS) {
                    // Freeze detected during warmup: abort warmup and promote freeze delta
                    inWarmup = false;
                    remainingWarmup = 0;
                    startTimestamp = prevWarmupTs;
                    lastTimestamp = currentTimestamp;
                    frameDeltas.push(warmupDelta);

                    const totalElapsedMs = currentTimestamp - startTimestamp;
                    if (totalElapsedMs < duration) {
                      rafId = requestAnimationFrame(frameCallback);
                    } else {
                      finish(totalElapsedMs);
                    }
                    return;
                  }

                  prevWarmupTs = currentTimestamp;
                  remainingWarmup--;

                  if (remainingWarmup <= 0 || currentTimestamp - warmupStartTs >= MAX_WARMUP_MS) {
                    inWarmup = false;
                    remainingWarmup = 0;
                    startTimestamp = currentTimestamp;
                    lastTimestamp = currentTimestamp;
                  }

                  rafId = requestAnimationFrame(frameCallback);
                  return;
                }

                // Initialize timestamps on the first rAF callback to avoid partial vsync skew
                if (startTimestamp === null || lastTimestamp === null) {
                  startTimestamp = currentTimestamp;
                  lastTimestamp = currentTimestamp;
                  rafId = requestAnimationFrame(frameCallback);
                  return;
                }

                const deltaMs = currentTimestamp - lastTimestamp;
                lastTimestamp = currentTimestamp;

                if (deltaMs > 0) {
                  frameDeltas.push(deltaMs);
                }

                const totalElapsedMs = currentTimestamp - startTimestamp;
                if (totalElapsedMs < duration) {
                  rafId = requestAnimationFrame(frameCallback);
                } else {
                  finish(totalElapsedMs);
                }
              }

              rafId = requestAnimationFrame(frameCallback);
            });
          },
          { duration: durationMs, warmup: safeWarmup }
        );
      },

      assertCadence: async (
        minAverageFps = 55,
        min1PercentLow = 45,
        durationMs = 2000,
        warmupFrames = 0
      ): Promise<FpsMetrics> => {
        const metrics = await monitor.measure(durationMs, warmupFrames);
        expect(
          metrics.timedOut,
          'FPS measurement timed out (rAF paused or render stalled)'
        ).toBe(false);
        expect(
          metrics.averageFps,
          `Average FPS (${metrics.averageFps}) must be >= ${minAverageFps}`
        ).toBeGreaterThanOrEqual(minAverageFps);
        expect(
          metrics.fps1PercentLow,
          `1% Low FPS (${metrics.fps1PercentLow}) must be >= ${min1PercentLow}`
        ).toBeGreaterThanOrEqual(min1PercentLow);
        return metrics;
      },
    };

    await use(monitor);
  },
});

export { expect };
