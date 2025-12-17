/**
 * Skill Unlocks Unit Tests
 *
 * Tests for getUnlocksAtLevel, getUnlocksUpToLevel functions
 * and SKILL_UNLOCKS data integrity.
 */

import { describe, it, expect } from "vitest";
import {
  getUnlocksAtLevel,
  getUnlocksUpToLevel,
  SKILL_UNLOCKS,
} from "../skill-unlocks";

// ============================================================================
// getUnlocksAtLevel Tests
// ============================================================================

describe("getUnlocksAtLevel", () => {
  it("returns unlocks at exact level", () => {
    const unlocks = getUnlocksAtLevel("attack", 40);
    expect(unlocks).toHaveLength(1);
    expect(unlocks[0].description).toBe("Rune weapons");
    expect(unlocks[0].level).toBe(40);
  });

  it("returns empty array for level with no unlocks", () => {
    const unlocks = getUnlocksAtLevel("attack", 2);
    expect(unlocks).toHaveLength(0);
  });

  it("returns empty array for unknown skill", () => {
    const unlocks = getUnlocksAtLevel("unknownskill", 10);
    expect(unlocks).toHaveLength(0);
  });

  it("is case-insensitive for skill names", () => {
    const lower = getUnlocksAtLevel("attack", 40);
    const upper = getUnlocksAtLevel("ATTACK", 40);
    const mixed = getUnlocksAtLevel("Attack", 40);
    const weird = getUnlocksAtLevel("aTtAcK", 40);

    expect(lower).toEqual(upper);
    expect(lower).toEqual(mixed);
    expect(lower).toEqual(weird);
  });

  it("returns all unlocks when multiple exist at same level", () => {
    // Constitution has unlocks at level 10
    const unlocks = getUnlocksAtLevel("constitution", 10);
    expect(unlocks.length).toBeGreaterThanOrEqual(1);
    unlocks.forEach((unlock) => {
      expect(unlock.level).toBe(10);
    });
  });

  it("handles level 1 correctly", () => {
    const unlocks = getUnlocksAtLevel("woodcutting", 1);
    expect(unlocks.length).toBeGreaterThan(0);
    expect(unlocks[0].description).toBe("Normal trees");
  });

  it("handles level 99 correctly", () => {
    const unlocks = getUnlocksAtLevel("strength", 99);
    expect(unlocks.length).toBeGreaterThan(0);
    expect(unlocks[0].description).toBe("Strength cape");
  });
});

// ============================================================================
// getUnlocksUpToLevel Tests
// ============================================================================

describe("getUnlocksUpToLevel", () => {
  it("returns all unlocks up to and including level", () => {
    const unlocks = getUnlocksUpToLevel("attack", 10);
    expect(unlocks.length).toBeGreaterThan(0);
    unlocks.forEach((unlock) => {
      expect(unlock.level).toBeLessThanOrEqual(10);
    });
  });

  it("returns empty array for level 0", () => {
    const unlocks = getUnlocksUpToLevel("attack", 0);
    expect(unlocks).toHaveLength(0);
  });

  it("returns empty array for unknown skill", () => {
    const unlocks = getUnlocksUpToLevel("unknownskill", 99);
    expect(unlocks).toHaveLength(0);
  });

  it("returns all unlocks for level 99", () => {
    const unlocks = getUnlocksUpToLevel("attack", 99);
    const allUnlocks = SKILL_UNLOCKS["attack"];
    expect(unlocks).toHaveLength(allUnlocks?.length ?? 0);
  });

  it("is case-insensitive for skill names", () => {
    const lower = getUnlocksUpToLevel("woodcutting", 30);
    const upper = getUnlocksUpToLevel("WOODCUTTING", 30);
    expect(lower).toEqual(upper);
  });

  it("includes unlocks at exactly the specified level", () => {
    // Woodcutting has unlock at level 30 (Willow trees)
    const unlocks = getUnlocksUpToLevel("woodcutting", 30);
    const hasLevel30 = unlocks.some((u) => u.level === 30);
    expect(hasLevel30).toBe(true);
  });

  it("excludes unlocks above the specified level", () => {
    const unlocks = getUnlocksUpToLevel("woodcutting", 30);
    const hasAbove30 = unlocks.some((u) => u.level > 30);
    expect(hasAbove30).toBe(false);
  });
});

// ============================================================================
// SKILL_UNLOCKS Data Integrity Tests
// ============================================================================

describe("SKILL_UNLOCKS data integrity", () => {
  it("has expected skills defined", () => {
    const expectedSkills = [
      "attack",
      "strength",
      "defence",
      "ranged",
      "magic",
      "prayer",
      "constitution",
      "woodcutting",
      "mining",
      "fishing",
      "cooking",
      "smithing",
      "firemaking",
      "agility",
      "thieving",
      "slayer",
    ];

    expectedSkills.forEach((skill) => {
      expect(SKILL_UNLOCKS[skill]).toBeDefined();
      expect(SKILL_UNLOCKS[skill].length).toBeGreaterThan(0);
    });
  });

  it("all skills have sorted levels (ascending)", () => {
    Object.entries(SKILL_UNLOCKS).forEach(([skill, unlocks]) => {
      for (let i = 1; i < unlocks.length; i++) {
        expect(
          unlocks[i].level,
          `${skill}: level ${unlocks[i].level} should be >= ${unlocks[i - 1].level}`,
        ).toBeGreaterThanOrEqual(unlocks[i - 1].level);
      }
    });
  });

  it("all levels are within valid range (1-99)", () => {
    Object.entries(SKILL_UNLOCKS).forEach(([skill, unlocks]) => {
      unlocks.forEach((unlock) => {
        expect(
          unlock.level,
          `${skill}: level ${unlock.level} should be >= 1`,
        ).toBeGreaterThanOrEqual(1);
        expect(
          unlock.level,
          `${skill}: level ${unlock.level} should be <= 99`,
        ).toBeLessThanOrEqual(99);
      });
    });
  });

  it("all unlocks have non-empty descriptions", () => {
    Object.entries(SKILL_UNLOCKS).forEach(([skill, unlocks]) => {
      unlocks.forEach((unlock, index) => {
        expect(
          unlock.description.length,
          `${skill}[${index}]: description should not be empty`,
        ).toBeGreaterThan(0);
      });
    });
  });

  it("all unlock types are valid", () => {
    const validTypes = ["item", "ability", "area", "quest", "activity"];
    Object.entries(SKILL_UNLOCKS).forEach(([skill, unlocks]) => {
      unlocks.forEach((unlock, index) => {
        expect(
          validTypes,
          `${skill}[${index}]: type "${unlock.type}" should be valid`,
        ).toContain(unlock.type);
      });
    });
  });

  it("each skill has at least 5 unlocks", () => {
    Object.entries(SKILL_UNLOCKS).forEach(([skill, unlocks]) => {
      expect(
        unlocks.length,
        `${skill} should have at least 5 unlocks`,
      ).toBeGreaterThanOrEqual(5);
    });
  });

  it("combat skills have level 1 unlocks", () => {
    const combatSkills = ["attack", "defence", "ranged", "magic", "prayer"];
    combatSkills.forEach((skill) => {
      const unlocks = SKILL_UNLOCKS[skill];
      const hasLevel1 = unlocks?.some((u) => u.level === 1);
      expect(hasLevel1, `${skill} should have level 1 unlock`).toBe(true);
    });
  });
});
