import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { BiomeSystem, lerpHexColor } from '@/systems/BiomeSystem';
import { ObjectPool } from '@/core/ObjectPool';
import { AssetLoader } from '@/core/AssetLoader';
import {
  ASSET_MANIFEST,
  BIOME_TABLE,
  LAYER1_HEIGHT,
  LAYER2_HEIGHT,
  LAYER3_HEIGHT,
  LOGICAL_HEIGHT,
  LOGICAL_WIDTH,
} from '@/data/masterData';
import {
  SAVE_BACKUP_KEY_V2,
  SAVE_STORAGE_KEY_V2,
  createInitialSaveStateV2,
  gameStore,
  loadSaveStateV2,
} from '@/data/saveStore';

function createMemoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key) => map.get(key) ?? null,
    key: (idx) => Array.from(map.keys())[idx] ?? null,
    removeItem: (key) => {
      map.delete(key);
    },
    setItem: (key, val) => {
      map.set(key, String(val));
    },
  };
}

describe('Phase 1 (v2.0): BiomeSystem, ObjectPool, AssetLoader, SaveStoreV2 & SRP', () => {
  beforeEach(() => {
    gameStore.getState().resetAll();
  });

  it('maintains 960x540 3-Layer Clean HUD geometry with >72% battlefield area and 23 asset entries', () => {
    expect(LAYER1_HEIGHT + LAYER2_HEIGHT + LAYER3_HEIGHT).toBe(LOGICAL_HEIGHT);
    expect(LAYER2_HEIGHT / LOGICAL_HEIGHT).toBeGreaterThanOrEqual(0.72);
    expect(LOGICAL_WIDTH).toBe(960);
    expect(ASSET_MANIFEST).toHaveLength(23);
  });

  it('interpolates 4 biome RGB colors smoothly across 500/1000/1500m boundaries (d_fade=80m)', () => {
    const bio = new BiomeSystem();
    expect(lerpHexColor('#000000', '#FFFFFF', 0.5).toLowerCase()).toBe('#808080');

    const z1 = bio.evaluate(0);
    expect(z1.biomeIndex).toBe(0);
    expect(z1.skyTopHex).toBe(BIOME_TABLE[0].skyTopHex);
    expect(z1.blendFactor).toBe(0);

    // 460m is midpoint of fade [420m..500m] between Zone 1 and Zone 2
    const mid12 = bio.evaluate(460);
    expect(mid12.blendFactor).toBe(0.5);
    expect(mid12.skyTopHex).not.toBe(BIOME_TABLE[0].skyTopHex);
    expect(mid12.skyTopHex).not.toBe(BIOME_TABLE[1].skyTopHex);

    const z2 = bio.evaluate(600);
    expect(z2.biomeIndex).toBe(1);
    expect(z2.hasQuicksand).toBe(true);
    expect(z2.quicksandPenalty).toBe(0.45);

    const z3 = bio.evaluate(1200);
    expect(z3.biomeIndex).toBe(2);
    expect(z3.isSandstorm).toBe(true);
    expect(z3.vignetteAlpha).toBeCloseTo(0.42, 2);
    expect(z3.stormParticleTarget).toBe(80);

    const z4 = bio.evaluate(1800);
    expect(z4.biomeIndex).toBe(3);
    expect(z4.isSinkholeZone).toBe(true);
  });

  it('pre-allocates ObjectPool, reuses inactive slots without extra growth, and supports releaseAll', () => {
    let created = 0;
    const pool = new ObjectPool(
      3,
      () => {
        created += 1;
        return { active: false, value: 0 };
      },
      (item) => {
        item.value = 0;
      }
    );
    expect(created).toBe(3);

    const a = pool.acquire()!;
    const b = pool.acquire()!;
    const c = pool.acquire()!;
    expect(pool.acquire()).toBeNull();
    expect(pool.getActiveCount()).toBe(3);

    a.value = 99;
    pool.release(b);
    expect(pool.getActiveCount()).toBe(2);

    const reused = pool.acquire()!;
    expect(reused).toBe(b);
    expect(reused.value).toBe(0);

    let sum = 0;
    pool.forEachActive((item) => {
      sum += item.value + (item === c ? 1 : 0);
    });
    expect(sum).toBe(100);

    pool.releaseAll();
    expect(pool.getActiveCount()).toBe(0);
    expect(created).toBe(3);
  });

  it('AssetLoader safely marks missing PNGs and SaveStoreV2 isolates corrupt saves into backup key', async () => {
    const loader = new AssetLoader();
    const summary = await loader.preloadAll({ probeAssets: false });
    expect(summary).toEqual({ total: 23, loaded: 0, missing: 23 });
    expect(loader.getImage('SANDWALKER_BODY')).toBeNull();

    const storage = createMemoryStorage();
    storage.setItem(SAVE_STORAGE_KEY_V2, '{corrupt_json');
    const recovered = loadSaveStateV2(storage);
    expect(recovered.recoveredFromCorruption).toBe(true);
    expect(storage.getItem(SAVE_BACKUP_KEY_V2)).toBe('{corrupt_json');
    expect(recovered.state.schemaVersion).toBe('2.0.0');

    const valid = createInitialSaveStateV2(1795600000000);
    valid.player.gold = 999;
    storage.setItem(SAVE_STORAGE_KEY_V2, JSON.stringify(valid));
    const ok = loadSaveStateV2(storage);
    expect(ok.recoveredFromCorruption).toBe(false);
    expect(ok.state.player.gold).toBe(999);
  });

  it('enforces SRP: src/systems/BiomeSystem.ts contains zero Canvas/DOM references', () => {
    const filePath = path.resolve(process.cwd(), 'src/systems/BiomeSystem.ts');
    const content = fs.readFileSync(filePath, 'utf8');
    expect(content).not.toMatch(/CanvasRenderingContext2D|document\.|window\./);
  });
});
