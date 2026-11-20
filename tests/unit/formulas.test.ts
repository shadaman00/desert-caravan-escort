import { describe, it, expect } from 'vitest';
import {
  upgradeCost,
  statAt,
  tierUpGearCost,
  quicksandIgnore,
  quicksandSpeed,
  stormDps,
  relayShield,
  tradeSellPayout,
  calculateTradeSellPrice,
  calculateAffinityMultiplier,
  calculateDamageMultiplier,
  evasionCooldown,
} from '@/game/formulas';

describe('Formulas Unit Suite', () => {
  describe('Upgrade Cost formula: round(50 * 1.18^(n-1))', () => {
    it('matches exact PRD balance progression benchmarks', () => {
      expect(upgradeCost(1)).toBe(50);
      expect(upgradeCost(2)).toBe(59);
      expect(upgradeCost(5)).toBe(97);
      expect(upgradeCost(10)).toBe(222);
      expect(upgradeCost(11)).toBe(262);
      expect(upgradeCost(20)).toBe(1161);
      expect(upgradeCost(30)).toBe(6075);
    });
  });

  describe('Stat Scaling: Stat_0 * (1 + 0.22 * (n-1))', () => {
    it('scales linearly by 22% per level', () => {
      expect(statAt(100, 1)).toBe(100);
      expect(statAt(100, 2)).toBeCloseTo(122);
      expect(statAt(100, 5)).toBeCloseTo(188);
      expect(statAt(100, 10)).toBeCloseTo(298);
    });
  });

  describe('Tier-Up Promotion Cost: 5 * Tier', () => {
    it('requires 5 gears per target tier', () => {
      expect(tierUpGearCost(1)).toBe(5);
      expect(tierUpGearCost(2)).toBe(10);
      expect(tierUpGearCost(3)).toBe(15);
    });
  });

  describe('Quicksand ignore & speed formulas', () => {
    it('computes R_ignore clamped between 0.0 and 1.0', () => {
      expect(quicksandIgnore(1)).toBe(0.0);
      expect(quicksandIgnore(6)).toBeCloseTo(0.5);
      expect(quicksandIgnore(11)).toBe(1.0);
      expect(quicksandIgnore(20)).toBe(1.0);
    });

    it('applies weakened penalty in Act 1 (c = 0.2)', () => {
      expect(quicksandSpeed(120, 1, 1)).toBeCloseTo(96);
      expect(quicksandSpeed(120, 6, 1)).toBeCloseTo(108);
      expect(quicksandSpeed(120, 11, 1)).toBe(120);
      expect(quicksandSpeed(120, 20, 1)).toBe(120);
    });

    it('applies standard penalty in Act 2+ (c = 0.4)', () => {
      expect(quicksandSpeed(120, 1, 2)).toBeCloseTo(72);
      expect(quicksandSpeed(120, 6, 2)).toBeCloseTo(96);
      expect(quicksandSpeed(120, 11, 2)).toBe(120);
      expect(quicksandSpeed(120, 20, 2)).toBe(120);
    });
  });

  describe('Sandstorm DoT & Solar Shield', () => {
    it('calculates 1.5% maxHp per second', () => {
      expect(stormDps(1000)).toBe(15);
      expect(stormDps(2500)).toBe(37.5);
    });

    it('calculates 50% maxHp for Relay Shield', () => {
      expect(relayShield(1000)).toBe(500);
      expect(relayShield(3000)).toBe(1500);
    });
  });

  describe('Trade Sell Pricing', () => {
    it('applies surge rate, Harun (+25%), and Synergy (+20%) for single unit', () => {
      // Base: 10 * 2.0 = 20
      expect(calculateTradeSellPrice(10, 2.0, false, false)).toBe(20);
      // Harun only: 20 * 1.25 = 25
      expect(calculateTradeSellPrice(10, 2.0, true, false)).toBe(25);
      // Synergy only: 20 * 1.20 = 24
      expect(calculateTradeSellPrice(10, 2.0, false, true)).toBe(24);
      // Both: 20 * 1.25 * 1.20 = 30
      expect(calculateTradeSellPrice(10, 2.0, true, true)).toBe(30);
    });

    it('calculates total payout for multiple cargo items', () => {
      // 10 units at 10 Gold with 2.0x surge without bonuses: 10 * 10 * 2.0 = 200
      expect(tradeSellPayout(10, 10, 2.0, false, false)).toBe(200);
      // With Harun (+25%): 200 * 1.25 = 250
      expect(tradeSellPayout(10, 10, 2.0, true, false)).toBe(250);
      // With Harun and 5-Merc Synergy (+25% and +20%): 200 * 1.25 * 1.20 = 300
      expect(tradeSellPayout(10, 10, 2.0, true, true)).toBe(300);
    });
  });

  describe('Weapon Affinity & Multi-Tag Rule (Decision D8)', () => {
    it('applies standard single tag counters', () => {
      expect(calculateAffinityMultiplier('HEAT_RAY', ['MIRAGE'])).toBe(2.0);
      expect(calculateAffinityMultiplier('HEAT_RAY', ['EXPOSED_CORE'])).toBe(1.8);
      expect(calculateAffinityMultiplier('HEAT_RAY', ['HEAVY_ARMOR'])).toBe(0.6);
      expect(calculateAffinityMultiplier('HARPOON', ['HEAVY_ARMOR'])).toBe(2.2);
      expect(calculateAffinityMultiplier('HARPOON', ['WORM_HEAD_SHELL'])).toBe(2.0);
      expect(calculateAffinityMultiplier('HARPOON', ['SMALL_SWARM'])).toBe(0.7);
      expect(calculateAffinityMultiplier('MORTAR', ['SMALL_SWARM'])).toBe(2.0);
      expect(calculateAffinityMultiplier('MORTAR', ['PARASITE'])).toBe(2.2);
      expect(calculateAffinityMultiplier('MORTAR', ['SINGLE_LARGE_BOSS'])).toBe(0.8);
    });

    it('applies Decision D8: single highest multiplier for multi-tag entities (no multiplicative stacking)', () => {
      // Mortar against Boss (0.8x) + Parasite (2.2x) -> max(0.8, 2.2) = 2.2
      expect(calculateDamageMultiplier('MORTAR', ['SINGLE_LARGE_BOSS', 'PARASITE'])).toBe(2.2);

      // Harpoon against Armor (2.2x) + Small Swarm (0.7x) -> max(2.2, 0.7) = 2.2
      expect(calculateDamageMultiplier('HARPOON', ['HEAVY_ARMOR', 'SMALL_SWARM'])).toBe(2.2);

      // Unknown or empty tags default to 1.0
      expect(calculateDamageMultiplier('HEAT_RAY', [])).toBe(1.0);
    });
  });

  describe('Leg Evasion Boost Cooldown: max(4.0, 8.0 - 0.2 * (legLevel - 1))', () => {
    it('computes linear cooldown reduction from 8.0s down to 4.0s floor', () => {
      expect(evasionCooldown(1)).toBeCloseTo(8.0);
      expect(evasionCooldown(2)).toBeCloseTo(7.8);
      expect(evasionCooldown(6)).toBeCloseTo(7.0);
      expect(evasionCooldown(11)).toBeCloseTo(6.0);
      expect(evasionCooldown(20)).toBeCloseTo(4.2);
      expect(evasionCooldown(21)).toBeCloseTo(4.0);
      expect(evasionCooldown(30)).toBe(4.0);
    });

    it('safely clamps invalid, fractional, and non-finite leg levels', () => {
      expect(evasionCooldown(0)).toBe(8.0);
      expect(evasionCooldown(-5)).toBe(8.0);
      expect(evasionCooldown(6.9)).toBeCloseTo(7.0);
      expect(evasionCooldown(Number.NaN)).toBe(8.0);
      expect(evasionCooldown(Number.POSITIVE_INFINITY)).toBe(8.0);
      expect(evasionCooldown(Number.NEGATIVE_INFINITY)).toBe(8.0);
    });
  });
});
