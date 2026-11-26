import { ASSET_MANIFEST, type AssetKey } from '@/data/masterData';

export type AssetLoadStatus = 'idle' | 'loading' | 'loaded' | 'missing';

export interface AssetLoadSummary {
  total: number;
  loaded: number;
  missing: number;
}

/**
 * Non-blocking image manifest loader for `public/assets/*` (23 PNG specs).
 * Uses `public/assets/manifest.json` when probing in browsers so absent optional PNGs
 * fall back cleanly to `FallbackShapes` with zero 404 console noise.
 */
export class AssetLoader {
  private readonly images = new Map<AssetKey, HTMLImageElement>();
  private readonly statuses = new Map<AssetKey, AssetLoadStatus>();

  constructor() {
    for (let i = 0; i < ASSET_MANIFEST.length; i++) {
      this.statuses.set(ASSET_MANIFEST[i].key, 'idle');
    }
  }

  public getStatus(key: AssetKey): AssetLoadStatus {
    return this.statuses.get(key) ?? 'missing';
  }

  public getImage(key: AssetKey): HTMLImageElement | null {
    if (this.statuses.get(key) !== 'loaded') return null;
    const img = this.images.get(key);
    if (!img || !img.complete || img.naturalWidth <= 0) {
      return null;
    }
    return img;
  }

  public getSummary(): AssetLoadSummary {
    let loaded = 0;
    let missing = 0;
    for (let i = 0; i < ASSET_MANIFEST.length; i++) {
      const st = this.statuses.get(ASSET_MANIFEST[i].key);
      if (st === 'loaded') loaded += 1;
      else if (st === 'missing') missing += 1;
    }
    return {
      total: ASSET_MANIFEST.length,
      loaded,
      missing,
    };
  }

  public async preloadAll(opts?: { probeAssets?: boolean }): Promise<AssetLoadSummary> {
    if (typeof Image === 'undefined' || opts?.probeAssets === false) {
      for (let i = 0; i < ASSET_MANIFEST.length; i++) {
        this.statuses.set(ASSET_MANIFEST[i].key, 'missing');
      }
      return this.getSummary();
    }

    const baseUrl =
      typeof import.meta !== 'undefined' &&
      (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL
        ? (import.meta as unknown as { env: { BASE_URL: string } }).env.BASE_URL
        : './';
    const cleanBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;

    let availableSet: Set<string> | null = null;
    if (typeof fetch === 'function') {
      try {
        const res = await fetch(`${cleanBase}assets/manifest.json`);
        if (res.ok) {
          const json = (await res.json()) as { available?: unknown };
          if (Array.isArray(json.available)) {
            availableSet = new Set(
              json.available.filter((p): p is string => typeof p === 'string')
            );
          }
        }
      } catch {
        availableSet = new Set<string>();
      }
    }

    const toLoad = ASSET_MANIFEST.filter((entry) => {
      if (availableSet !== null && !availableSet.has(entry.path)) {
        this.statuses.set(entry.key, 'missing');
        return false;
      }
      return true;
    });

    await Promise.all(
      toLoad.map(
        (entry) =>
          new Promise<void>((resolve) => {
            this.statuses.set(entry.key, 'loading');
            const img = new Image();
            img.onload = () => {
              if (img.naturalWidth > 0) {
                this.images.set(entry.key, img);
                this.statuses.set(entry.key, 'loaded');
              } else {
                this.statuses.set(entry.key, 'missing');
              }
              resolve();
            };
            img.onerror = () => {
              this.statuses.set(entry.key, 'missing');
              resolve();
            };
            img.src = `${cleanBase}${entry.path}`;
          })
      )
    );

    return this.getSummary();
  }
}
