import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  INTERSTITIAL_MIN_COOLDOWN_SEC,
  NO_AD_GRACE_PERIOD_SEC,
  evaluateOasisInterstitial,
  evaluateRewardedAd,
  shouldShowInterstitialOnDefeat,
  type AdMonetizationState,
} from '@/systems/AdTierManager';
import { SoundSynth } from '@/core/SoundSynth';
import { ASSET_MANIFEST } from '@/data/masterData';

function makeMonState(overrides: Partial<AdMonetizationState> = {}): AdMonetizationState {
  return {
    adTier: 0,
    playTimeSecWithoutAd: 0,
    oasisVisitsSinceLastInterstitial: 0,
    dailyAdSkipRemaining: 0,
    secSinceLastInterstitial: INTERSTITIAL_MIN_COOLDOWN_SEC,
    zone1FirstOasisSettled: false,
    totalInterstitialsShown: 0,
    totalRewardedWatched: 0,
    ...overrides,
  };
}

describe('Phase 4: AdTierManager, SoundSynth & 23 PNG Asset Manifest', () => {
  it('enforces 15-minute grace period and Zone 1 first oasis no-ad protection', () => {
    const early = makeMonState({
      playTimeSecWithoutAd: NO_AD_GRACE_PERIOD_SEC - 10,
      oasisVisitsSinceLastInterstitial: 5,
      zone1FirstOasisSettled: true,
    });
    expect(evaluateOasisInterstitial(early).allowed).toBe(false);
    expect(evaluateOasisInterstitial(early).reason).toBe('GRACE_PERIOD_15MIN');

    const beforeFirstOasis = makeMonState({
      playTimeSecWithoutAd: 1200,
      oasisVisitsSinceLastInterstitial: 3,
      zone1FirstOasisSettled: false,
    });
    expect(evaluateOasisInterstitial(beforeFirstOasis).allowed).toBe(false);
    expect(evaluateOasisInterstitial(beforeFirstOasis).reason).toBe('BEFORE_ZONE1_FIRST_OASIS');
  });

  it('guarantees zero forced interstitials on combat defeat permanently', () => {
    const res = shouldShowInterstitialOnDefeat();
    expect(res.allowed).toBe(false);
    expect(res.reason).toBe('DEFEAT_NO_AD_PERMANENT');
  });

  it('evaluates Tier 0~3 oasis interstitial rules & skip tickets accurately', () => {
    // Tier 0: every 3rd oasis & >= 360s
    expect(
      evaluateOasisInterstitial(
        makeMonState({
          adTier: 0,
          playTimeSecWithoutAd: 1000,
          zone1FirstOasisSettled: true,
          oasisVisitsSinceLastInterstitial: 2,
        })
      ).allowed
    ).toBe(false);
    expect(
      evaluateOasisInterstitial(
        makeMonState({
          adTier: 0,
          playTimeSecWithoutAd: 1000,
          zone1FirstOasisSettled: true,
          oasisVisitsSinceLastInterstitial: 3,
          secSinceLastInterstitial: 360,
        })
      ).allowed
    ).toBe(true);

    // Tier 1: every 7th oasis
    expect(
      evaluateOasisInterstitial(
        makeMonState({
          adTier: 1,
          playTimeSecWithoutAd: 1000,
          zone1FirstOasisSettled: true,
          oasisVisitsSinceLastInterstitial: 6,
        })
      ).allowed
    ).toBe(false);
    expect(
      evaluateOasisInterstitial(
        makeMonState({
          adTier: 1,
          playTimeSecWithoutAd: 1000,
          zone1FirstOasisSettled: true,
          oasisVisitsSinceLastInterstitial: 7,
        })
      ).allowed
    ).toBe(true);

    // Tier 2: chapter boss clear only
    expect(
      evaluateOasisInterstitial(
        makeMonState({
          adTier: 2,
          playTimeSecWithoutAd: 1000,
          zone1FirstOasisSettled: true,
          oasisVisitsSinceLastInterstitial: 10,
        }),
        { isChapterBossCleared: false }
      ).allowed
    ).toBe(false);
    expect(
      evaluateOasisInterstitial(
        makeMonState({
          adTier: 2,
          playTimeSecWithoutAd: 1000,
          zone1FirstOasisSettled: true,
        }),
        { isChapterBossCleared: true }
      ).allowed
    ).toBe(true);

    // Tier 3: 0% permanently
    expect(
      evaluateOasisInterstitial(
        makeMonState({
          adTier: 3,
          playTimeSecWithoutAd: 2000,
          zone1FirstOasisSettled: true,
          oasisVisitsSinceLastInterstitial: 99,
        }),
        { isChapterBossCleared: true }
      ).allowed
    ).toBe(false);

    // Skip ticket consumes ticket instead of showing ad
    const skipRes = evaluateOasisInterstitial(
      makeMonState({
        adTier: 0,
        playTimeSecWithoutAd: 1000,
        zone1FirstOasisSettled: true,
        oasisVisitsSinceLastInterstitial: 3,
        dailyAdSkipRemaining: 2,
      })
    );
    expect(skipRes.allowed).toBe(false);
    expect(skipRes.usedSkipTicket).toBe(true);
  });

  it('evaluates Jafar and Solar Relay rewarded ads cleanly', () => {
    const t0 = evaluateRewardedAd('JAFAR_DOUBLE_TRADE', makeMonState({ adTier: 0 }));
    expect(t0.granted).toBe(true);
    expect(t0.instantPass).toBe(false);

    const t3 = evaluateRewardedAd('SOLAR_RELAY_SHIELD', makeMonState({ adTier: 3 }));
    expect(t3.granted).toBe(true);
    expect(t3.instantPass).toBe(true);
  });

  it('tracks all 6 SoundSynth SFX and mute state safely without throwing in Node', () => {
    const synth = new SoundSynth();
    synth.unlock();
    synth.playLockOn();
    synth.playSteamVent();
    synth.playTurretCycle();
    synth.playGoldenParry();
    synth.playShieldActivate();
    synth.playRelicExcavate();

    const counts = synth.getPlayCounts();
    expect(counts.lockOn).toBe(1);
    expect(counts.steamVent).toBe(1);
    expect(counts.turretCycle).toBe(1);
    expect(counts.goldenParry).toBe(1);
    expect(counts.shieldActivate).toBe(1);
    expect(counts.relicExcavate).toBe(1);

    expect(synth.toggleMute()).toBe(true);
    expect(synth.isMuted()).toBe(true);
    synth.destroy();
  });

  it('maintains strict SRP in AdTierManager.ts with zero DOM/Canvas references', () => {
    const src = readFileSync(
      resolve(__dirname, '../../../src/systems/AdTierManager.ts'),
      'utf-8'
    );
    expect(src).not.toMatch(/CanvasRenderingContext2D|document\.|window\./);
  });

  it('verifies manifest.json and all 23 PNG asset files exist cleanly on disk', () => {
    const publicDir = resolve(__dirname, '../../../public');
    const manifestJson = JSON.parse(
      readFileSync(resolve(publicDir, 'assets/manifest.json'), 'utf-8')
    ) as { available: string[] };

    expect(ASSET_MANIFEST.length).toBe(23);
    expect(manifestJson.available.length).toBe(23);

    for (const entry of ASSET_MANIFEST) {
      expect(manifestJson.available).toContain(entry.path);
      const diskPath = resolve(publicDir, entry.path);
      expect(existsSync(diskPath)).toBe(true);
      expect(statSync(diskPath).size).toBeGreaterThan(256);
    }
  });
});
