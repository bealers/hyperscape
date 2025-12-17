/**
 * Level-Up Utils Unit Tests
 *
 * Tests for utility functions: normalizeSkillName, capitalizeSkill,
 * isClientAudio, and isChat type guards.
 */

import { describe, it, expect } from "vitest";
import {
  normalizeSkillName,
  capitalizeSkill,
  isClientAudio,
  isChat,
} from "../../../src/game/hud/level-up/utils";

// ============================================================================
// normalizeSkillName Tests
// ============================================================================

describe("normalizeSkillName", () => {
  it("converts to lowercase", () => {
    expect(normalizeSkillName("Woodcutting")).toBe("woodcutting");
    expect(normalizeSkillName("ATTACK")).toBe("attack");
    expect(normalizeSkillName("Defence")).toBe("defence");
  });

  it("removes spaces", () => {
    expect(normalizeSkillName("Hit Points")).toBe("hitpoints");
    expect(normalizeSkillName("Skill Name")).toBe("skillname");
  });

  it("removes multiple spaces", () => {
    expect(normalizeSkillName("Multi  Word  Skill")).toBe("multiwordskill");
  });

  it("handles empty string", () => {
    expect(normalizeSkillName("")).toBe("");
  });

  it("handles single character", () => {
    expect(normalizeSkillName("A")).toBe("a");
  });

  it("handles already normalized string", () => {
    expect(normalizeSkillName("attack")).toBe("attack");
    expect(normalizeSkillName("woodcutting")).toBe("woodcutting");
  });
});

// ============================================================================
// capitalizeSkill Tests
// ============================================================================

describe("capitalizeSkill", () => {
  it("capitalizes first letter", () => {
    expect(capitalizeSkill("woodcutting")).toBe("Woodcutting");
    expect(capitalizeSkill("attack")).toBe("Attack");
  });

  it("lowercases rest of string", () => {
    expect(capitalizeSkill("WOODCUTTING")).toBe("Woodcutting");
    expect(capitalizeSkill("ATTACK")).toBe("Attack");
  });

  it("handles mixed case", () => {
    expect(capitalizeSkill("wOoDcUtTiNg")).toBe("Woodcutting");
  });

  it("handles single character", () => {
    expect(capitalizeSkill("a")).toBe("A");
    expect(capitalizeSkill("Z")).toBe("Z");
  });

  it("handles empty string", () => {
    expect(capitalizeSkill("")).toBe("");
  });

  it("preserves correctly formatted string", () => {
    expect(capitalizeSkill("Strength")).toBe("Strength");
  });
});

// ============================================================================
// isClientAudio Type Guard Tests
// ============================================================================

describe("isClientAudio", () => {
  // Note: AudioContext is not available in Node.js/bun test environment.
  // These tests verify the type guard rejects invalid inputs.
  // Browser-specific validation (instanceof AudioContext) requires E2E tests.

  it("returns false for null", () => {
    expect(isClientAudio(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isClientAudio(undefined)).toBe(false);
  });

  it("returns false for non-object types", () => {
    expect(isClientAudio("string")).toBe(false);
    expect(isClientAudio(123)).toBe(false);
    expect(isClientAudio(true)).toBe(false);
    expect(isClientAudio([])).toBe(false);
  });

  it("returns false for empty object", () => {
    expect(isClientAudio({})).toBe(false);
  });

  it("returns false for object missing ctx", () => {
    expect(isClientAudio({ groupGains: {}, ready: () => {} })).toBe(false);
  });

  // These tests require AudioContext which isn't available in Node.js
  // Skip them in non-browser environments
  it.skipIf(typeof globalThis.AudioContext === "undefined")(
    "returns false for object with invalid ctx type",
    () => {
      // In browser environment, this would test that ctx must be instanceof AudioContext
      expect(isClientAudio({ ctx: {}, groupGains: {}, ready: () => {} })).toBe(
        false,
      );
    },
  );
});

// ============================================================================
// isChat Type Guard Tests
// ============================================================================

describe("isChat", () => {
  it("returns false for null", () => {
    expect(isChat(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isChat(undefined)).toBe(false);
  });

  it("returns false for non-object types", () => {
    expect(isChat("string")).toBe(false);
    expect(isChat(123)).toBe(false);
    expect(isChat(true)).toBe(false);
    expect(isChat([])).toBe(false);
  });

  it("returns false for empty object", () => {
    expect(isChat({})).toBe(false);
  });

  it("returns false for object without add method", () => {
    expect(isChat({ send: () => {} })).toBe(false);
    expect(isChat({ messages: [] })).toBe(false);
  });

  it("returns false for object with non-function add", () => {
    expect(isChat({ add: "not a function" })).toBe(false);
    expect(isChat({ add: 123 })).toBe(false);
    expect(isChat({ add: null })).toBe(false);
  });

  it("returns true for object with add function", () => {
    expect(isChat({ add: () => {} })).toBe(true);
    expect(isChat({ add: function () {} })).toBe(true);
  });

  it("returns true for object with add and other properties", () => {
    expect(isChat({ add: () => {}, messages: [], clear: () => {} })).toBe(true);
  });
});
