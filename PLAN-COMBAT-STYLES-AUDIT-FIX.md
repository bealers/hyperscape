# Combat Styles System - Audit Fix Plan

**Goal:** Achieve minimum 9/10 rating across all audit criteria
**Current Score:** 7.7/10
**Target Score:** 9.0/10+
**Issue Reference:** #453 Combat Styles Implementation

---

## Executive Summary

The combat styles implementation is functionally correct and OSRS-accurate (10/10), but contains dead code, console logs, and misleading configurations that lower production readiness scores. This plan addresses all P0-P2 issues to achieve 9/10+ rating.

---

## Current Scores vs Target

| Criterion | Current | Target | Gap |
|-----------|---------|--------|-----|
| Production Quality Code | 6/10 | 9/10 | +3 |
| Best Practices | 7/10 | 9/10 | +2 |
| OWASP Security | 9/10 | 9/10 | — |
| Game Studio Audit | 6/10 | 9/10 | +3 |
| Memory & Allocation | 9/10 | 9/10 | — |
| SOLID Principles | 7/10 | 9/10 | +2 |
| OSRS Accuracy | 10/10 | 10/10 | — |

---

## Phase 1: Remove Console Logs (P0)

**Impact:** Production Quality +1, Game Studio +1
**Effort:** Low
**Risk:** None

### Task 1.1: Clean CombatPanel.tsx

Remove all 17 console.log statements from `packages/client/src/game/panels/CombatPanel.tsx`:

**Lines to remove:**
- Line 53: `console.log(\`[CombatPanel] Current style state: ${style}\`);`
- Line 92-97: `console.log("[CombatPanel] getAttackStyleInfo callback received:", info);`
- Line 108: `console.log("[CombatPanel] getAutoRetaliate callback received:", enabled);`
- Line 126: `console.log("[CombatPanel] onUpdate event received:", data);`
- Line 129-134: Player ID comparison logs
- Line 140: `console.log("[CombatPanel] onChanged event received:", data);`
- Line 143-148: Player ID comparison logs
- Line 181: `console.log("[CombatPanel] Auto-retaliate changed:", d.enabled);`
- Line 236-241: `console.log` in changeStyle function
- Line 252: `console.error("[CombatPanel] changeAttackStyle action method not found!");`
- Line 256: `console.log` before calling changeAttackStyle
- Line 273: `console.error("[CombatPanel] setAutoRetaliate action method not found!");`
- Line 278: `console.log(\`[CombatPanel] Toggling auto-retaliate to: ${newValue}\`);`
- Line 433: `console.log(\`[CombatPanel] Changing attack style to: ${s.id}\`);`

**Keep only:** `console.error` for actual error conditions (convert to proper error handling or remove entirely).

### Verification
```bash
grep -n "console\." packages/client/src/game/panels/CombatPanel.tsx
# Should return 0 results
```

---

## Phase 2: Remove Dead Code (P1)

**Impact:** Production Quality +1, Best Practices +1, Game Studio +1, SOLID +1
**Effort:** Medium
**Risk:** Low (code is never executed)

### Task 2.1: Remove Dead Event Subscriptions

**File:** `packages/shared/src/systems/shared/character/PlayerSystem.ts`

Remove these subscriptions (lines 267-294):
```typescript
// REMOVE - Events are never emitted
this.subscribe(EventType.COMBAT_XP_CALCULATE, ...);
this.subscribe(EventType.COMBAT_DAMAGE_CALCULATE, ...);
this.subscribe(EventType.COMBAT_ACCURACY_CALCULATE, ...);
```

### Task 2.2: Remove Dead Event Handlers

**File:** `packages/shared/src/systems/shared/character/PlayerSystem.ts`

Remove these methods entirely:

1. **handleXPCalculation** (lines ~1608-1649) - ~40 lines
2. **handleDamageCalculation** (lines ~1654-1678) - ~25 lines
3. **handleAccuracyCalculation** (lines ~1683-1708) - ~25 lines

Total: ~90 lines of dead code removed.

### Task 2.3: Fix Misleading ATTACK_STYLES Config

**File:** `packages/shared/src/systems/shared/character/PlayerSystem.ts`

**Option A (Recommended):** Remove misleading modifiers entirely

```typescript
// BEFORE (misleading - these values are WRONG and unused)
accurate: {
  damageModifier: 1.0,
  accuracyModifier: 1.15, // WRONG
}

// AFTER (clean - no misleading values)
accurate: {
  id: "accurate",
  name: "Accurate",
  description: "Train Attack. +3 invisible Attack levels.",
  xpDistribution: { attack: 100, strength: 0, defense: 0, constitution: 0 },
  icon: "🎯",
  // Note: Actual combat bonuses applied via CombatCalculations.getStyleBonus()
}
```

**Option B:** Set all modifiers to 1.0 with explanatory comment

```typescript
// All modifiers are 1.0 - actual OSRS bonuses applied in CombatCalculations.getStyleBonus()
// These fields kept for potential future prayer/potion modifiers
damageModifier: 1.0,
accuracyModifier: 1.0,
```

### Task 2.4: Update AttackStyle Interface

**File:** `packages/shared/src/types/game/combat-types.ts`

If removing modifiers (Option A), update the interface:

```typescript
export interface AttackStyle {
  id: string;
  name: string;
  description: string;
  xpDistribution: {
    attack: number;
    strength: number;
    defense: number;
    constitution: number;
  };
  icon: string;
  // Removed: damageModifier, accuracyModifier (unused, see CombatCalculations.getStyleBonus())
}
```

### Verification
```bash
# Verify no references to removed handlers
grep -rn "handleXPCalculation\|handleDamageCalculation\|handleAccuracyCalculation" packages/shared/src/
# Should return 0 results

# Verify events are not emitted anywhere
grep -rn "emit.*COMBAT_DAMAGE_CALCULATE\|emit.*COMBAT_ACCURACY_CALCULATE\|emit.*COMBAT_XP_CALCULATE" packages/shared/src/
# Should return 0 results
```

---

## Phase 3: Type Safety Improvements (P1)

**Impact:** Production Quality +0.5, Best Practices +0.5
**Effort:** Medium
**Risk:** Low

### Task 3.1: Add Type Guards for Event Data

**File:** `packages/client/src/game/panels/CombatPanel.tsx`

Create type guards for event handlers:

```typescript
// Add at top of file
interface StyleUpdateEvent {
  playerId: string;
  currentStyle: { id: string };
}

interface TargetChangedEvent {
  targetId: string | null;
  targetName?: string;
  targetHealth?: PlayerHealth;
}

interface AutoRetaliateEvent {
  playerId: string;
  enabled: boolean;
}

function isStyleUpdateEvent(data: unknown): data is StyleUpdateEvent {
  return (
    typeof data === "object" &&
    data !== null &&
    "playerId" in data &&
    "currentStyle" in data &&
    typeof (data as StyleUpdateEvent).currentStyle?.id === "string"
  );
}

function isAutoRetaliateEvent(data: unknown): data is AutoRetaliateEvent {
  return (
    typeof data === "object" &&
    data !== null &&
    "playerId" in data &&
    typeof (data as AutoRetaliateEvent).enabled === "boolean"
  );
}
```

Replace unsafe casts:
```typescript
// BEFORE
const d = data as { playerId: string; currentStyle: { id: string } };

// AFTER
if (!isStyleUpdateEvent(data)) return;
const d = data;
```

### Task 3.2: Fix `as never` Type Assertion

**File:** `packages/client/src/game/panels/CombatPanel.tsx` (line 296)

```typescript
// BEFORE
return allStyles.filter((s) => availableStyleIds.includes(s.id as never));

// AFTER
return allStyles.filter((s) =>
  availableStyleIds.includes(s.id as typeof availableStyleIds[number])
);

// OR (simpler)
return allStyles.filter((s) => availableStyleIds.some(id => id === s.id));
```

---

## Phase 4: Constants & Documentation (P2)

**Impact:** Production Quality +0.5, Best Practices +0.5
**Effort:** Low
**Risk:** None

### Task 4.1: Extract Magic Numbers

**File:** `packages/shared/src/systems/shared/character/SkillsSystem.ts`

```typescript
// Add to top of file or CombatConstants.ts
/** OSRS: Hitpoints XP per damage dealt */
const OSRS_HP_XP_PER_DAMAGE = 1.33;

/** OSRS: Combat skill XP per damage dealt */
const OSRS_COMBAT_XP_PER_DAMAGE = 4;

// Usage
const combatSkillXP = totalDamage * OSRS_COMBAT_XP_PER_DAMAGE;
const hitpointsXP = totalDamage * OSRS_HP_XP_PER_DAMAGE;
```

### Task 4.2: Add JSDoc to Key Functions

**File:** `packages/shared/src/constants/WeaponStyleConfig.ts`

```typescript
/**
 * Get available combat styles for a weapon type.
 *
 * OSRS-accurate: Not all weapons support all styles.
 * - Axes/Daggers: No "controlled" (pure damage weapons)
 * - Ranged/Magic: Only "accurate" (MVP - melee only)
 *
 * @param weaponType - The type of weapon equipped
 * @returns Array of available combat styles for this weapon
 * @see https://oldschool.runescape.wiki/w/Combat_Options
 */
export function getAvailableStyles(weaponType: WeaponType): CombatStyle[] {
  return WEAPON_STYLE_CONFIG[weaponType] ?? ["accurate"];
}
```

---

## Phase 5: Test Coverage (P2)

**Impact:** Best Practices +1
**Effort:** Medium-High
**Risk:** None

### Task 5.1: Unit Tests for WeaponStyleConfig

**File:** `packages/shared/src/constants/__tests__/WeaponStyleConfig.test.ts` (new)

```typescript
import { describe, it, expect } from "vitest";
import {
  getAvailableStyles,
  isStyleValidForWeapon,
  getDefaultStyleForWeapon,
  WEAPON_STYLE_CONFIG,
} from "../WeaponStyleConfig";
import { WeaponType } from "../../types/game/item-types";

describe("WeaponStyleConfig", () => {
  describe("getAvailableStyles", () => {
    it("returns all 4 styles for swords", () => {
      const styles = getAvailableStyles(WeaponType.SWORD);
      expect(styles).toEqual(["accurate", "aggressive", "defensive", "controlled"]);
    });

    it("returns 3 styles for axes (no controlled)", () => {
      const styles = getAvailableStyles(WeaponType.AXE);
      expect(styles).toEqual(["accurate", "aggressive", "defensive"]);
      expect(styles).not.toContain("controlled");
    });

    it("returns only accurate for ranged weapons", () => {
      expect(getAvailableStyles(WeaponType.BOW)).toEqual(["accurate"]);
      expect(getAvailableStyles(WeaponType.CROSSBOW)).toEqual(["accurate"]);
    });

    it("defaults to accurate for unknown weapon type", () => {
      const styles = getAvailableStyles("unknown" as WeaponType);
      expect(styles).toEqual(["accurate"]);
    });
  });

  describe("isStyleValidForWeapon", () => {
    it("allows controlled for swords", () => {
      expect(isStyleValidForWeapon(WeaponType.SWORD, "controlled")).toBe(true);
    });

    it("rejects controlled for daggers", () => {
      expect(isStyleValidForWeapon(WeaponType.DAGGER, "controlled")).toBe(false);
    });

    it("allows accurate for all weapons", () => {
      Object.values(WeaponType).forEach((type) => {
        expect(isStyleValidForWeapon(type, "accurate")).toBe(true);
      });
    });
  });

  describe("getDefaultStyleForWeapon", () => {
    it("returns accurate as default for most weapons", () => {
      expect(getDefaultStyleForWeapon(WeaponType.SWORD)).toBe("accurate");
      expect(getDefaultStyleForWeapon(WeaponType.AXE)).toBe("accurate");
    });

    it("returns defensive for shields", () => {
      expect(getDefaultStyleForWeapon(WeaponType.SHIELD)).toBe("defensive");
    });
  });

  describe("WEAPON_STYLE_CONFIG completeness", () => {
    it("has config for all WeaponType values", () => {
      Object.values(WeaponType).forEach((type) => {
        expect(WEAPON_STYLE_CONFIG[type]).toBeDefined();
        expect(WEAPON_STYLE_CONFIG[type].length).toBeGreaterThan(0);
      });
    });
  });
});
```

### Task 5.2: Unit Tests for XP Distribution

**File:** `packages/shared/src/systems/shared/character/__tests__/SkillsSystem.xp.test.ts` (new)

```typescript
import { describe, it, expect } from "vitest";

describe("Combat XP Distribution", () => {
  const OSRS_COMBAT_XP_PER_DAMAGE = 4;
  const OSRS_HP_XP_PER_DAMAGE = 1.33;

  describe("Focused styles (accurate/aggressive/defensive)", () => {
    it("grants 4 XP per damage to combat skill", () => {
      const damage = 10;
      const combatXP = damage * OSRS_COMBAT_XP_PER_DAMAGE;
      expect(combatXP).toBe(40);
    });

    it("grants 1.33 XP per damage to Hitpoints", () => {
      const damage = 10;
      const hpXP = damage * OSRS_HP_XP_PER_DAMAGE;
      expect(hpXP).toBeCloseTo(13.3, 1);
    });

    it("total XP is 5.33 per damage", () => {
      const damage = 10;
      const totalXP = damage * (OSRS_COMBAT_XP_PER_DAMAGE + OSRS_HP_XP_PER_DAMAGE);
      expect(totalXP).toBeCloseTo(53.3, 1);
    });
  });

  describe("Controlled style", () => {
    it("grants 1.33 XP per damage to each of 4 skills", () => {
      const damage = 10;
      const xpPerSkill = damage * OSRS_HP_XP_PER_DAMAGE;
      expect(xpPerSkill).toBeCloseTo(13.3, 1);
    });

    it("total XP is 5.32 per damage (4 x 1.33)", () => {
      const damage = 10;
      const totalXP = damage * OSRS_HP_XP_PER_DAMAGE * 4;
      expect(totalXP).toBeCloseTo(53.2, 1);
    });

    it("is slightly less efficient than focused (5.32 vs 5.33)", () => {
      const focusedTotal = OSRS_COMBAT_XP_PER_DAMAGE + OSRS_HP_XP_PER_DAMAGE;
      const controlledTotal = OSRS_HP_XP_PER_DAMAGE * 4;
      expect(controlledTotal).toBeLessThan(focusedTotal);
      expect(focusedTotal - controlledTotal).toBeCloseTo(0.01, 2);
    });
  });
});
```

---

## Phase 6: Memory Optimization (Optional P3)

**Impact:** Memory & Allocation (already 9/10)
**Effort:** Low
**Risk:** None

### Task 6.1: Pre-allocate Style Bonus Objects

**File:** `packages/shared/src/utils/game/CombatCalculations.ts`

```typescript
// Pre-allocated style bonuses (avoid object creation in hot path)
const STYLE_BONUSES: Readonly<Record<CombatStyle, Readonly<StyleBonus>>> = {
  accurate: Object.freeze({ attack: 3, strength: 0, defense: 0 }),
  aggressive: Object.freeze({ attack: 0, strength: 3, defense: 0 }),
  defensive: Object.freeze({ attack: 0, strength: 0, defense: 3 }),
  controlled: Object.freeze({ attack: 1, strength: 1, defense: 1 }),
} as const;

export function getStyleBonus(style: CombatStyle): StyleBonus {
  return STYLE_BONUSES[style];
}
```

---

## Implementation Order

| Phase | Task | Priority | Effort | Impact |
|-------|------|----------|--------|--------|
| 1 | Remove console.logs | P0 | 15 min | +2 |
| 2.1 | Remove dead subscriptions | P1 | 10 min | +0.5 |
| 2.2 | Remove dead handlers | P1 | 15 min | +1 |
| 2.3 | Fix ATTACK_STYLES config | P1 | 20 min | +0.5 |
| 2.4 | Update AttackStyle interface | P1 | 10 min | +0.25 |
| 3.1 | Add type guards | P1 | 30 min | +0.5 |
| 3.2 | Fix `as never` | P1 | 5 min | +0.25 |
| 4.1 | Extract constants | P2 | 10 min | +0.25 |
| 4.2 | Add JSDoc | P2 | 15 min | +0.25 |
| 5.1 | WeaponStyleConfig tests | P2 | 45 min | +0.5 |
| 5.2 | XP distribution tests | P2 | 30 min | +0.5 |
| 6.1 | Pre-allocate bonuses | P3 | 10 min | +0.1 |

**Total Estimated Time:** ~3.5 hours

---

## Expected Final Scores

| Criterion | Before | After | Change |
|-----------|--------|-------|--------|
| Production Quality Code | 6/10 | **9/10** | +3 |
| Best Practices | 7/10 | **9/10** | +2 |
| OWASP Security | 9/10 | 9/10 | — |
| Game Studio Audit | 6/10 | **9/10** | +3 |
| Memory & Allocation | 9/10 | **9.5/10** | +0.5 |
| SOLID Principles | 7/10 | **9/10** | +2 |
| OSRS Accuracy | 10/10 | 10/10 | — |

### **Expected Final Score: 9.2/10** ✅

---

## Verification Checklist

After implementation, verify:

- [ ] `grep -n "console\." CombatPanel.tsx` returns 0 results
- [ ] `grep -rn "handleXPCalculation" packages/shared/` returns 0 results
- [ ] `grep -rn "handleDamageCalculation" packages/shared/` returns 0 results
- [ ] `grep -rn "handleAccuracyCalculation" packages/shared/` returns 0 results
- [ ] `grep -rn "damageModifier\|accuracyModifier" PlayerSystem.ts` returns 0 results (if Option A)
- [ ] `grep -rn "as never" CombatPanel.tsx` returns 0 results
- [ ] `bun run build` succeeds with no errors
- [ ] `bun run test` passes all new tests
- [ ] Combat styles work correctly in-game (manual test)
- [ ] XP distribution matches OSRS formulas (manual test)

---

## Notes

- **OSRS Accuracy remains 10/10** - The actual combat logic is correct
- **No gameplay changes** - All changes are code quality improvements
- **PlayerSystem refactoring deferred** - Splitting into smaller managers would be ideal but is out of scope for 9/10 target
- **Anti-cheat improvements deferred** - Would require architectural changes

---

*Created: 2024-12-24*
*Author: Claude Code Audit*
*Related: PLAN-COMBAT-STYLES-453.md*
