/**
 * Level-Up Audio Unit Tests
 *
 * Tests for the isMilestoneLevel utility function.
 * Note: playLevelUpSound/playMilestoneLevelUpSound require AudioContext
 * which is not available in Node.js unit tests.
 */

import { describe, it, expect } from "vitest";
import { isMilestoneLevel } from "../../../src/game/hud/level-up/levelUpAudio";

// ============================================================================
// isMilestoneLevel Tests
// ============================================================================

describe("isMilestoneLevel", () => {
  describe("milestone levels (10, 25, 50, 75, 99)", () => {
    it("returns true for level 10", () => {
      expect(isMilestoneLevel(10)).toBe(true);
    });

    it("returns true for level 25", () => {
      expect(isMilestoneLevel(25)).toBe(true);
    });

    it("returns true for level 50", () => {
      expect(isMilestoneLevel(50)).toBe(true);
    });

    it("returns true for level 75", () => {
      expect(isMilestoneLevel(75)).toBe(true);
    });

    it("returns true for level 99 (max level)", () => {
      expect(isMilestoneLevel(99)).toBe(true);
    });
  });

  describe("non-milestone levels", () => {
    it("returns false for level 1", () => {
      expect(isMilestoneLevel(1)).toBe(false);
    });

    it("returns false for level 9 (just before milestone)", () => {
      expect(isMilestoneLevel(9)).toBe(false);
    });

    it("returns false for level 11 (just after milestone)", () => {
      expect(isMilestoneLevel(11)).toBe(false);
    });

    it("returns false for level 24 (just before milestone)", () => {
      expect(isMilestoneLevel(24)).toBe(false);
    });

    it("returns false for level 26 (just after milestone)", () => {
      expect(isMilestoneLevel(26)).toBe(false);
    });

    it("returns false for level 49 (just before milestone)", () => {
      expect(isMilestoneLevel(49)).toBe(false);
    });

    it("returns false for level 51 (just after milestone)", () => {
      expect(isMilestoneLevel(51)).toBe(false);
    });

    it("returns false for level 74 (just before milestone)", () => {
      expect(isMilestoneLevel(74)).toBe(false);
    });

    it("returns false for level 76 (just after milestone)", () => {
      expect(isMilestoneLevel(76)).toBe(false);
    });

    it("returns false for level 98 (just before max)", () => {
      expect(isMilestoneLevel(98)).toBe(false);
    });
  });

  describe("edge cases", () => {
    it("returns false for level 0", () => {
      expect(isMilestoneLevel(0)).toBe(false);
    });

    it("returns false for negative levels", () => {
      expect(isMilestoneLevel(-1)).toBe(false);
      expect(isMilestoneLevel(-10)).toBe(false);
    });

    it("returns false for level 100 (above max)", () => {
      expect(isMilestoneLevel(100)).toBe(false);
    });

    it("returns false for very high levels", () => {
      expect(isMilestoneLevel(120)).toBe(false);
      expect(isMilestoneLevel(1000)).toBe(false);
    });
  });

  describe("common training levels", () => {
    it("returns false for common early levels", () => {
      expect(isMilestoneLevel(2)).toBe(false);
      expect(isMilestoneLevel(5)).toBe(false);
      expect(isMilestoneLevel(7)).toBe(false);
    });

    it("returns false for common mid levels", () => {
      expect(isMilestoneLevel(30)).toBe(false);
      expect(isMilestoneLevel(40)).toBe(false);
      expect(isMilestoneLevel(60)).toBe(false);
      expect(isMilestoneLevel(70)).toBe(false);
    });

    it("returns false for common high levels", () => {
      expect(isMilestoneLevel(80)).toBe(false);
      expect(isMilestoneLevel(85)).toBe(false);
      expect(isMilestoneLevel(90)).toBe(false);
      expect(isMilestoneLevel(92)).toBe(false);
    });
  });
});
