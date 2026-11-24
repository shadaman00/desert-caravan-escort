// ============================================================================
// File: tests/e2e/tier1-feature-coverage/opening-hook.spec.ts
// Milestone E1-B: Tier 1 Feature Coverage — Features 34..35
//   - F34: 180s Opening Hook Sequencer (TC-OPEN-01..07)
//   - F35: Dialogue Balloon System (TC-OPEN-08..13)
// Adheres strictly to Opaque-Box E2E rule (zero src/ or @/ imports).
// ============================================================================

import { test, expect } from '../fixtures/appFixture';
import {
  SELECTORS,
  waitForCanvasReady,
  waitForFsmState,
  readFsmState,
  readDebugSnapshot,
  readZoneAHud,
  sampleRegionAverageColor,
  setDebugSpeed,
  triggerOverloadSkill,
  readOpeningPhase,
  skipOpeningHook,
  readVisibleDialogueBalloons,
  waitForDialogueBalloon,
  assertDialogueCompliance,
  assertDialogue2LineClamp,
} from '../fixtures/testHelpers';
import {
  injectGameState,
  createOpeningHookSeed,
} from '../fixtures/mockStorage';

const R_SKY_BAND = { x0: 20, y0: 15, x1: 220, y1: 115 };

// ============================================================================
// Feature 34: 180s Opening Hook Sequencer
// ============================================================================
test.describe('Tier 1: Feature 34 — 180s Opening Hook Sequencer', () => {
  test('TC-OPEN-01: Phase 1 renders Lv30 preview, NIGHT sky, intro-phase-badge, and Overload AOE skill (F34)', async ({
    gamePage,
    errorTracker,
  }) => {
    await injectGameState(gamePage, createOpeningHookSeed(), { introSeen: false });
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await waitForFsmState(gamePage, 'OPENING_HOOK', 5000);

    const phaseText = await readOpeningPhase(gamePage);
    expect(phaseText.length).toBeGreaterThan(0);

    const skyColor = await sampleRegionAverageColor(
      gamePage,
      R_SKY_BAND.x0,
      R_SKY_BAND.y0,
      R_SKY_BAND.x1,
      R_SKY_BAND.y1
    );
    expect(skyColor.r).toBeLessThan(55);

    const startSnap = await readDebugSnapshot(gamePage);
    expect(startSnap?.meta.timeOfDay).toBe('NIGHT');
    expect(startSnap?.sandwalker.turretLevels.HEAT_RAY).toBe(30);

    await expect
      .poll(async () => (await readDebugSnapshot(gamePage))?.combat.enemyCount ?? 0, {
        timeout: 6000,
        intervals: [80],
      })
      .toBeGreaterThan(0);

    await triggerOverloadSkill(gamePage, 10000);
    await expect
      .poll(
        async () => {
          const snap = await readDebugSnapshot(gamePage);
          return (snap?.combat.particleCount ?? 0) > 0 || (snap?.combat.recentDamageEvents?.length ?? 0) > 0;
        },
        { timeout: 5000, intervals: [50] }
      )
      .toBe(true);

    errorTracker.assertNoErrors();
  });

  test('TC-OPEN-02: Phase 2 (30~75s) triggers Sandworm ambush atmosphere and resets parts to Lv1 (F34)', async ({
    gamePage,
    errorTracker,
  }) => {
    await injectGameState(gamePage, createOpeningHookSeed(), { introSeen: false });
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await waitForFsmState(gamePage, 'OPENING_HOOK', 5000);

    const phase1Text = await readOpeningPhase(gamePage);
    await setDebugSpeed(gamePage, 4);

    // At 4x speed, 30s game time reaches Phase 2 within ~7.5-10s wall-clock
    await expect
      .poll(
        async () => {
          const snap = await readDebugSnapshot(gamePage);
          const phaseText = await readOpeningPhase(gamePage);
          const lvReset = (snap?.sandwalker.turretLevels.HEAT_RAY ?? 30) === 1;
          const duskOrStorm =
            snap?.meta.timeOfDay === 'STORM' || snap?.meta.timeOfDay === 'DUSK';
          return lvReset && duskOrStorm && phaseText !== phase1Text;
        },
        { timeout: 15000, intervals: [150] }
      )
      .toBe(true);

    const snap = await readDebugSnapshot(gamePage);
    expect(snap?.sandwalker.turretLevels.HEAT_RAY).toBe(1);
    expect(['STORM', 'DUSK']).toContain(snap?.meta.timeOfDay);
    errorTracker.assertNoErrors();
  });

  test('TC-OPEN-03: Phase 3 (75~135s) unlocks Harun & Sera, restores DAY, shows turret prompt & Stele #1 (+5 Gear) (F34)', async ({
    gamePage,
    errorTracker,
  }) => {
    await injectGameState(gamePage, createOpeningHookSeed(), { introSeen: false });
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await waitForFsmState(gamePage, 'OPENING_HOOK', 5000);
    await setDebugSpeed(gamePage, 4);

    // Wait for Phase 3 (~75s game time -> ~19s wall-clock at 4x)
    await expect
      .poll(
        async () => {
          const snap = await readDebugSnapshot(gamePage);
          const harun = snap?.mercenaries.find((m) => m.id === 'harun')?.isUnlocked ?? false;
          const sera = snap?.mercenaries.find((m) => m.id === 'sera')?.isUnlocked ?? false;
          return snap?.meta.timeOfDay === 'DAY' && harun && sera;
        },
        { timeout: 28000, intervals: [200] }
      )
      .toBe(true);

    const promptLoc = gamePage.locator(SELECTORS.tutorialTurretPrompt).first();
    await expect(promptLoc).toBeVisible({ timeout: 8000 });

    // Wait until Stele #1 awards +5 Ancient Gear before Phase 4 ends
    await expect
      .poll(async () => (await readDebugSnapshot(gamePage))?.currencies.ancientGear ?? 0, {
        timeout: 22000,
        intervals: [200],
      })
      .toBeGreaterThanOrEqual(5);

    errorTracker.assertNoErrors();
  });

  test('TC-OPEN-04: Phase 4 (135~180s) completes Oasis 1 200% settlement into OASIS_HUB with 300G, 5 Gear, 1 Fragment (F34)', async ({
    gamePage,
    errorTracker,
  }) => {
    test.setTimeout(90000);
    await injectGameState(gamePage, createOpeningHookSeed(), { introSeen: false });
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await waitForFsmState(gamePage, 'OPENING_HOOK', 5000);
    await setDebugSpeed(gamePage, 4);

    // Full 180s sequence at 4x completes in ~45-55s wall-clock
    await waitForFsmState(gamePage, 'OASIS_HUB', 65000);

    const snap = await readDebugSnapshot(gamePage);
    expect(snap?.meta.isIntroCompleted).toBe(true);
    expect(snap?.meta.currentOasisIndex).toBe(1);
    expect(snap?.currencies.sunGold).toBeGreaterThanOrEqual(300);
    expect(snap?.currencies.ancientGear).toBeGreaterThanOrEqual(5);
    expect(snap?.currencies.mapFragments).toBeGreaterThanOrEqual(1);
    await expect(gamePage.locator(SELECTORS.adSimModal)).toHaveCount(0);

    const hud = await readZoneAHud(gamePage);
    expect(hud.sunGold).toBeGreaterThanOrEqual(300);
    errorTracker.assertNoErrors();
  });

  test('TC-OPEN-05: Speed 4x accelerates dt-driven Opening Hook timeline to Phase 2 under 12s wall-clock (F34)', async ({
    gamePage,
    errorTracker,
  }) => {
    await injectGameState(gamePage, createOpeningHookSeed(), { introSeen: false });
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await waitForFsmState(gamePage, 'OPENING_HOOK', 5000);

    // At 1x speed over 2.5s wall-clock, Phase 1 (0..30s) must remain active
    await gamePage.waitForTimeout(2500);
    const snap1x = await readDebugSnapshot(gamePage);
    expect(snap1x?.meta.timeOfDay).toBe('NIGHT');
    expect(snap1x?.sandwalker.turretLevels.HEAT_RAY).toBe(30);

    // Switching to 4x accelerates the remaining ~27.5s to < 12s wall-clock
    const tStart4x = Date.now();
    await setDebugSpeed(gamePage, 4);
    await expect
      .poll(async () => (await readDebugSnapshot(gamePage))?.sandwalker.turretLevels.HEAT_RAY ?? 30, {
        timeout: 12000,
        intervals: [100],
      })
      .toBe(1);

    const elapsed4xMs = Date.now() - tStart4x;
    expect(elapsed4xMs).toBeLessThan(12000);
    errorTracker.assertNoErrors();
  });

  test('TC-OPEN-06: Decision D10 keeps skip-intro-btn strictly HIDDEN on first-time view (introSeen: false) (F34)', async ({
    gamePage,
    errorTracker,
  }) => {
    await injectGameState(gamePage, createOpeningHookSeed(), { introSeen: false });
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await waitForFsmState(gamePage, 'OPENING_HOOK', 5000);

    const skipBtn = gamePage.locator(SELECTORS.skipIntroBtn).first();
    await expect(skipBtn).toBeHidden();

    await gamePage.waitForTimeout(2500);
    await expect(skipBtn).toBeHidden();
    expect(await readFsmState(gamePage)).toBe('OPENING_HOOK');
    errorTracker.assertNoErrors();
  });

  test('TC-OPEN-07: Decision D10 shows skip-intro-btn when introSeen=true & !isIntroCompleted and grants skip rewards (F34)', async ({
    gamePage,
    errorTracker,
  }) => {
    await injectGameState(gamePage, createOpeningHookSeed(), { introSeen: true });
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await waitForFsmState(gamePage, 'OPENING_HOOK', 5000);

    const skipBtn = gamePage.locator(SELECTORS.skipIntroBtn).first();
    await expect(skipBtn).toBeVisible({ timeout: 5000 });

    await skipOpeningHook(gamePage, 5000);

    const snap = await readDebugSnapshot(gamePage);
    expect(snap?.meta.isIntroCompleted).toBe(true);
    expect(snap?.currencies.sunGold).toBe(300);
    expect(snap?.currencies.ancientGear).toBe(5);
    expect(snap?.currencies.mapFragments).toBe(1);
    expect(snap?.mercenaries.find((m) => m.id === 'harun')?.isUnlocked).toBe(true);
    expect(snap?.mercenaries.find((m) => m.id === 'sera')?.isUnlocked).toBe(true);
    errorTracker.assertNoErrors();
  });
});

// ============================================================================
// Feature 35: Dialogue Balloon System
// ============================================================================
test.describe('Tier 1: Feature 35 — Dialogue Balloon System', () => {
  test('TC-OPEN-08: Scripted dialogue balloons render in DOM and sync with snapshot.dialogue (F35)', async ({
    gamePage,
    errorTracker,
  }) => {
    await injectGameState(gamePage, createOpeningHookSeed(), { introSeen: false });
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await waitForFsmState(gamePage, 'OPENING_HOOK', 5000);

    const firstBalloon = await waitForDialogueBalloon(gamePage, undefined, 8000);
    expect(firstBalloon.text.length).toBeGreaterThan(0);

    const snap = await readDebugSnapshot(gamePage);
    expect(snap?.dialogue).toBeDefined();
    expect(snap?.dialogue?.activeBalloons.length).toBeGreaterThanOrEqual(1);
    const syncedMatch = snap?.dialogue?.activeBalloons.some((b) =>
      firstBalloon.text.includes(b.text)
    );
    expect(syncedMatch).toBe(true);
    errorTracker.assertNoErrors();
  });

  test('TC-OPEN-09: AC-02 enforces <= 35 Unicode codepoints on every dialogue balloon across Opening Hook (F35)', async ({
    gamePage,
    errorTracker,
  }) => {
    test.setTimeout(70000);
    await injectGameState(gamePage, createOpeningHookSeed(), { introSeen: false });
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await waitForFsmState(gamePage, 'OPENING_HOOK', 5000);
    await setDebugSpeed(gamePage, 4);

    const observedTexts = new Set<string>();
    const deadline = Date.now() + 50000;

    while (Date.now() < deadline) {
      const fsmState = await readFsmState(gamePage);
      const visible = await readVisibleDialogueBalloons(gamePage);
      for (const b of visible) {
        if (b.text) {
          observedTexts.add(b.text);
          expect(
            [...b.text].length,
            `DOM balloon "${b.text}" exceeded 35 codepoints`
          ).toBeLessThanOrEqual(35);
        }
      }

      const snap = await readDebugSnapshot(gamePage);
      for (const sb of snap?.dialogue?.activeBalloons ?? []) {
        if (sb.text) {
          observedTexts.add(sb.text);
          expect(
            [...sb.text].length,
            `Snapshot balloon "${sb.text}" exceeded 35 codepoints`
          ).toBeLessThanOrEqual(35);
        }
      }

      if (fsmState === 'OASIS_HUB' || observedTexts.size >= 6) {
        break;
      }
      await gamePage.waitForTimeout(200);
    }

    expect(observedTexts.size).toBeGreaterThanOrEqual(4);
    errorTracker.assertNoErrors();
  });

  test('TC-OPEN-10: AC-02 enforces strict 2-line clamp and 430px width containment on dialogue balloons (F35)', async ({
    gamePage,
    errorTracker,
  }) => {
    await injectGameState(gamePage, createOpeningHookSeed(), { introSeen: false });
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await waitForFsmState(gamePage, 'OPENING_HOOK', 5000);

    await waitForDialogueBalloon(gamePage, undefined, 8000);
    await assertDialogue2LineClamp(gamePage, { minCount: 1 });
    errorTracker.assertNoErrors();
  });

  test('TC-OPEN-11: AC-02 guarantees dialogue balloons never overlap central combat band y in [165, 400] (F35)', async ({
    gamePage,
    errorTracker,
  }) => {
    await injectGameState(gamePage, createOpeningHookSeed(), { introSeen: false });
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await waitForFsmState(gamePage, 'OPENING_HOOK', 5000);

    await waitForDialogueBalloon(gamePage, undefined, 8000);
    await assertDialogueCompliance(gamePage, { minCount: 1 });

    // Advance to Phase 2 at 4x and verify multi-speaker balloons also clear [240, 480]
    await setDebugSpeed(gamePage, 4);
    await expect
      .poll(async () => (await readDebugSnapshot(gamePage))?.sandwalker.turretLevels.HEAT_RAY ?? 30, {
        timeout: 15000,
        intervals: [120],
      })
      .toBe(1);

    await setDebugSpeed(gamePage, 1);
    await waitForDialogueBalloon(gamePage, undefined, 8000);
    await assertDialogueCompliance(gamePage, { minCount: 1 });
    errorTracker.assertNoErrors();
  });

  test('TC-OPEN-12: Dialogue system caps max 2 simultaneous balloons and expires each after ~3.8s at 1x (F35)', async ({
    gamePage,
    errorTracker,
  }) => {
    await injectGameState(gamePage, createOpeningHookSeed(), { introSeen: false });
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await waitForFsmState(gamePage, 'OPENING_HOOK', 5000);

    await waitForDialogueBalloon(gamePage, undefined, 8000);
    const snapStart = await readDebugSnapshot(gamePage);
    const firstActive = snapStart?.dialogue?.activeBalloons ?? [];
    expect(firstActive.length).toBeGreaterThanOrEqual(1);
    expect(firstActive.length).toBeLessThanOrEqual(2);
    const firstId = firstActive[0].id;

    // Sample across 4.5s at 1x: active count never exceeds 2 and firstId expires (~3.5s + 0.3s fade)
    let firstExpired = false;
    for (let i = 0; i < 24; i++) {
      const snap = await readDebugSnapshot(gamePage);
      const active = snap?.dialogue?.activeBalloons ?? [];
      expect(active.length).toBeLessThanOrEqual(2);
      if (!active.some((b) => b.id === firstId)) {
        firstExpired = true;
        break;
      }
      await gamePage.waitForTimeout(220);
    }

    expect(firstExpired).toBe(true);
    errorTracker.assertNoErrors();
  });

  test('TC-OPEN-13: Skipping Opening Hook immediately clears all active and queued dialogue balloons (F35)', async ({
    gamePage,
    errorTracker,
  }) => {
    await injectGameState(gamePage, createOpeningHookSeed(), { introSeen: true });
    await gamePage.goto('/');
    await waitForCanvasReady(gamePage, 10000);
    await waitForFsmState(gamePage, 'OPENING_HOOK', 5000);

    await waitForDialogueBalloon(gamePage, undefined, 8000);
    await skipOpeningHook(gamePage, 5000);

    await expect(gamePage.locator(SELECTORS.dialogueBubble)).toHaveCount(0);
    const snap = await readDebugSnapshot(gamePage);
    expect(snap?.dialogue?.activeBalloons ?? []).toEqual([]);
    expect(snap?.dialogue?.queuedCount ?? 0).toBe(0);
    errorTracker.assertNoErrors();
  });
});
