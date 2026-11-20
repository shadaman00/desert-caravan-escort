import { defineConfig, chromium } from '@playwright/test';
import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * Resolve Chromium executable cleanly from env override, Playwright default,
 * or local ms-playwright cache (e.g. chromium-1248) without forcing network downloads.
 */
function resolveChromiumExecutablePath(): string | undefined {
  const envPath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  if (envPath && fs.existsSync(envPath)) {
    return envPath;
  }

  try {
    const defaultPath = chromium.executablePath();
    if (defaultPath && fs.existsSync(defaultPath)) {
      return defaultPath;
    }
  } catch {
    // Ignore and fall back to local cache scan
  }

  const localAppData =
    process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  const cacheDir = path.join(localAppData, 'ms-playwright');

  const staticCandidates = [
    path.join(
      cacheDir,
      'chromium_headless_shell-1248',
      'chrome-headless-shell-win64',
      'chrome-headless-shell.exe'
    ),
    path.join(cacheDir, 'chromium-1248', 'chrome-win64', 'chrome.exe'),
    path.join(cacheDir, 'chromium-1248', 'chrome-win', 'chrome.exe'),
  ];

  for (const candidate of staticCandidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  if (fs.existsSync(cacheDir)) {
    const entries = fs.readdirSync(cacheDir).sort().reverse();
    for (const entry of entries) {
      if (entry.startsWith('chromium_headless_shell-')) {
        const p = path.join(
          cacheDir,
          entry,
          'chrome-headless-shell-win64',
          'chrome-headless-shell.exe'
        );
        if (fs.existsSync(p)) return p;
      }
    }
    for (const entry of entries) {
      if (entry.startsWith('chromium-')) {
        for (const sub of ['chrome-win64/chrome.exe', 'chrome-win/chrome.exe']) {
          const p = path.join(cacheDir, entry, sub);
          if (fs.existsSync(p)) return p;
        }
      }
    }
  }

  return undefined;
}

const CHROMIUM_EXECUTABLE_PATH = resolveChromiumExecutablePath();

/**
 * Playwright E2E Configuration for Desert Caravan Escort: Sandwalker Expedition
 * Viewport: 430 x 932 px (logical mobile screen)
 * DPR: 2, Touch enabled, Chromium browser
 */
const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60 * 1000,
  expect: {
    timeout: 10 * 1000,
  },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }]
  ],
  outputDir: 'test-results',

  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'off',

    /* Mobile Emulation: 430 x 932 logical resolution */
    viewport: { width: 430, height: 932 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  },

  projects: [
    {
      name: 'Mobile-Chromium',
      use: {
        browserName: 'chromium',
        viewport: { width: 430, height: 932 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
        launchOptions: {
          ...(CHROMIUM_EXECUTABLE_PATH ? { executablePath: CHROMIUM_EXECUTABLE_PATH } : {}),
          args: [
            '--disable-gpu',
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-renderer-backgrounding',
          ],
        },
      },
    },
  ],

  /* Build and serve production bundle via Vite preview on PORT */
  webServer: {
    command: `npm run build && npx vite preview --port ${PORT} --host 127.0.0.1 --strictPort`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
});
