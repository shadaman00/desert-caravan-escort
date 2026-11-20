import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useGameStore } from '@/store/gameStore';
import {
  calculatePartyAttack,
  calculatePartyAttackMultiplier,
  isExpeditionSynergyActive,
  tradeSellPayout,
} from '@/game/formulas';
import { MercenarySystem } from '@/engine/systems/MercenarySystem';
import { DamageSystem, type CombatTarget } from '@/engine/systems/DamageSystem';
import { drawMercenaries } from '@/engine/render/draw/mercenary';

function makeEnemy(overrides: Partial<CombatTarget> = {}): CombatTarget {
  return {
    id: overrides.id ?? 'e1',
    x: overrides.x ?? 270,
    y: overrides.y ?? 400,
    radius: overrides.radius ?? 14,
    hp: overrides.hp ?? 500,
    maxHp: overrides.maxHp ?? 500,
    armor: 0,
    maxArmor: 0,
    tags: overrides.tags ?? ['SMALL_SWARM'],
    alive: overrides.alive ?? true,
    knockbackVx: 0,
  };
}

class MockPath2D {
  moveTo = vi.fn();
  lineTo = vi.fn();
  closePath = vi.fn();
}

function createMockCtx(): CanvasRenderingContext2D {
  return {
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    closePath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    arc: vi.fn(),
    ellipse: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    globalAlpha: 1,
    fillStyle: '#000',
    strokeStyle: '#000',
    lineWidth: 1,
  } as unknown as CanvasRenderingContext2D;
}

describe('Mercenaries (#22) & Expedition Synergy (#23) & Unlock Order (D9)', () => {
  beforeEach(() => {
    useGameStore.getState().resetToDefaults();
  });

  it('keeps all 5 mercenaries idle when locked', () => {
    const mercSystem = new MercenarySystem({ rng: () => 0.5 });
    const enemy = makeEnemy({ x: 250, y: 400, hp: 500 });

    const res = mercSystem.update(
      2.0,
      'MARCH_NORMAL',
      useGameStore.getState(),
      [enemy]
    );

    expect(res.damageDealtTotal).toBe(0);
    expect(res.healedHp).toBe(0);
    expect(res.shieldGranted).toBe(0);
    expect(res.bonusGold).toBe(0);
    expect(res.synergyActive).toBe(false);
    expect(enemy.hp).toBe(500);
  });

  it('activates Tarik melee mitigation (-25%) and Solar Buckler shield + knockback', () => {
    const store = useGameStore.getState();
    const mercSystem = new MercenarySystem({ rng: () => 0.5 });
    expect(mercSystem.getIncomingMeleeDamageMultiplier(store)).toBe(1.0);

    store.unlockMercenary('tarik');
    const latest = useGameStore.getState();
    expect(mercSystem.getIncomingMeleeDamageMultiplier(latest)).toBe(0.75);

    const closeEnemy = makeEnemy({ id: 'bandit_close', x: 265, y: 412, hp: 500 });
    // Advance 8.0s in 1.0s increments to trigger Solar Buckler skill & melee attacks
    let totalShield = 0;
    let totalDmg = 0;
    for (let i = 0; i < 8; i++) {
      const res = mercSystem.update(1.0, 'MARCH_NORMAL', useGameStore.getState(), [closeEnemy]);
      totalShield += res.shieldGranted;
      totalDmg += res.damageDealtTotal;
    }

    expect(totalShield > 0).toBe(true);
    expect(totalDmg > 0).toBe(true);
    expect(closeEnemy.x > 265).toBe(true);
  });

  it('activates Sera rapid ranged fire, deterministic crit, and Piercing Volley skill', () => {
    const store = useGameStore.getState();
    store.unlockMercenary('sera');

    // rng = 0.1 (< 0.25 crit chance) triggers 1.75x crit
    const mercSystem = new MercenarySystem({
      rng: () => 0.1,
      damageSystem: new DamageSystem(),
    });
    const enemy = makeEnemy({ x: 320, y: 398, hp: 1000, maxHp: 1000 });

    const resSingle = mercSystem.update(0.7, 'MARCH_NORMAL', useGameStore.getState(), [enemy]);
    // Lv1 baseAttack=24 * 1.75 crit = 42
    expect(resSingle.damageDealtTotal).toBe(42);

    // Advance up to 6.0s to trigger Piercing Volley (3 guaranteed-crit arrows)
    let volleyTriggeredDmg = 0;
    for (let i = 0; i < 6; i++) {
      const res = mercSystem.update(1.0, 'MARCH_NORMAL', useGameStore.getState(), [enemy]);
      volleyTriggeredDmg += res.damageDealtTotal;
    }
    expect(volleyTriggeredDmg > 300).toBe(true);
  });

  it('activates Zara AOE Solar Nova and +30% stele decode speed multiplier', () => {
    const store = useGameStore.getState();
    const mercSystem = new MercenarySystem({ rng: () => 0.5 });
    expect(mercSystem.getSteleDecodeSpeedMultiplier(store)).toBe(1.0);

    store.unlockMercenary('zara');
    expect(mercSystem.getSteleDecodeSpeedMultiplier(useGameStore.getState())).toBe(1.3);

    const e1 = makeEnemy({ id: 'z1', x: 320, y: 398, hp: 500 });
    const e2 = makeEnemy({ id: 'z2', x: 350, y: 398, hp: 500 }); // 30px away -> inside 75px Nova
    const eFar = makeEnemy({ id: 'zfar', x: 430, y: 398, hp: 500 }); // 110px away -> outside 75px

    for (let i = 0; i < 7; i++) {
      mercSystem.update(1.0, 'MARCH_NORMAL', useGameStore.getState(), [e1, e2, eFar]);
    }

    expect(e1.hp < 500).toBe(true);
    expect(e2.hp < 500).toBe(true);
    expect(eFar.hp).toBe(500);
  });

  it('applies Lili 2% maxHp/s heal only in active states while currentHp > 0', () => {
    const store = useGameStore.getState();
    store.unlockMercenary('lili');
    store.setHp(500); // maxHp = 1000 -> 2%/s = 20 HP/s

    const mercSystem = new MercenarySystem({ rng: () => 0.5 });

    // Active march: 1.0s heals 20 HP
    const activeRes = mercSystem.update(1.0, 'MARCH_NORMAL', useGameStore.getState(), []);
    expect(activeRes.healedHp).toBeCloseTo(20);

    // Paused in EMERGENCY_REVIVE / OASIS_HUB / OASIS_SETTLEMENT -> 0 heal
    expect(
      mercSystem.update(1.0, 'EMERGENCY_REVIVE', useGameStore.getState(), []).healedHp
    ).toBe(0);
    expect(mercSystem.update(1.0, 'OASIS_HUB', useGameStore.getState(), []).healedHp).toBe(0);
    expect(
      mercSystem.update(1.0, 'OASIS_SETTLEMENT', useGameStore.getState(), []).healedHp
    ).toBe(0);

    // Guard when currentHp <= 0 (never resurrects)
    useGameStore.getState().setHp(0);
    expect(
      mercSystem.update(1.0, 'MARCH_NORMAL', useGameStore.getState(), []).healedHp
    ).toBe(0);
  });

  it('activates Harun scavenge gold skill and +25% trade bonus', () => {
    const store = useGameStore.getState();
    store.unlockMercenary('harun');
    const mercSystem = new MercenarySystem({ rng: () => 0.5 });
    const enemy = makeEnemy({ x: 300, y: 400, hp: 500 });

    let goldEarned = 0;
    for (let i = 0; i < 8; i++) {
      const res = mercSystem.update(1.0, 'MARCH_NORMAL', useGameStore.getState(), [enemy]);
      goldEarned += res.bonusGold;
    }

    expect(goldEarned > 0).toBe(true);
    expect(tradeSellPayout(10, 10, 2.0, true, false)).toBe(250);
  });

  it('follows canonical D9 unlock sequence and applies +25% ATK / +20% Trade at 5/5 Synergy', () => {
    const store = useGameStore.getState();

    // 0/5
    expect(isExpeditionSynergyActive(store.mercenaries)).toBe(false);
    expect(calculatePartyAttackMultiplier(false)).toBe(1.0);

    // Step 1: Opening / 제1오아시스 -> Harun + Sera (2/5)
    store.grantIntroSkipRewards();
    let mercs = useGameStore.getState().mercenaries;
    expect(mercs.filter((m) => m.isUnlocked).map((m) => m.id).sort()).toEqual(['harun', 'sera']);
    expect(isExpeditionSynergyActive(mercs)).toBe(false);

    // Step 2: 제2오아시스 -> Zara (3/5)
    store.unlockMercenary('zara');
    mercs = useGameStore.getState().mercenaries;
    expect(isExpeditionSynergyActive(mercs)).toBe(false);

    // Step 3: Act 1 Boss clear -> Tarik + Lili (5/5 -> Synergy Active!)
    store.unlockMercenary('tarik');
    store.unlockMercenary('lili');
    mercs = useGameStore.getState().mercenaries;
    expect(isExpeditionSynergyActive(mercs)).toBe(true);
    expect(calculatePartyAttackMultiplier(true)).toBe(1.25);
    expect(calculatePartyAttack(100, true)).toBe(125);
    expect(tradeSellPayout(10, 10, 2.0, true, true)).toBe(300);

    // Verify mercenary damage scales +25% with 5/5 synergy vs 4/5
    const mercSys4 = new MercenarySystem({ rng: () => 0.5 });
    const mercSys5 = new MercenarySystem({ rng: () => 0.5 });

    // Create 4/5 state by resetting and unlocking 4
    useGameStore.getState().resetToDefaults();
    useGameStore.getState().unlockMercenary('harun');
    useGameStore.getState().unlockMercenary('sera');
    useGameStore.getState().unlockMercenary('zara');
    useGameStore.getState().unlockMercenary('tarik');
    const enemy4 = makeEnemy({ x: 300, y: 400, hp: 1000 });
    const res4 = mercSys4.update(0.7, 'MARCH_NORMAL', useGameStore.getState(), [enemy4]);

    useGameStore.getState().unlockMercenary('lili');
    const enemy5 = makeEnemy({ x: 300, y: 400, hp: 1000 });
    const res5 = mercSys5.update(0.7, 'MARCH_NORMAL', useGameStore.getState(), [enemy5]);

    expect(res5.synergyActive).toBe(true);
    expect(res5.damageDealtTotal).toBe(Math.round(res4.damageDealtTotal * 1.25));
  });

  it('renders 5 mercenary silhouettes and golden synergy ring cleanly in Node', () => {
    vi.stubGlobal('Path2D', MockPath2D);
    const ctx = createMockCtx();
    const mercSystem = new MercenarySystem({ rng: () => 0.5 });

    drawMercenaries(ctx, mercSystem.getRuntimeStates(), [], false, 0);

    const store = useGameStore.getState();
    store.unlockMercenary('harun');
    store.unlockMercenary('sera');
    store.unlockMercenary('zara');
    store.unlockMercenary('tarik');
    store.unlockMercenary('lili');

    const enemy = makeEnemy({ x: 270, y: 400, hp: 500 });
    mercSystem.update(1.0, 'MARCH_NORMAL', useGameStore.getState(), [enemy]);

    drawMercenaries(
      ctx,
      mercSystem.getRuntimeStates(),
      mercSystem.getVisualShots(),
      true,
      1.5
    );
    expect(ctx.arc).toHaveBeenCalled();

    vi.unstubAllGlobals();
  });
});
