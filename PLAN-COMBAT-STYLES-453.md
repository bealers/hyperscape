
# Implementation Plan: Combat Styles System

> **Issue**: Select multiple combat styles to train multiple combat skills at once #453
> **Created**: 2025-12-22
> **Status**: VERIFIED & READY FOR IMPLEMENTATION
> **Complexity**: Low (infrastructure exists, just needs wiring)

---

## Executive Summary

**The Problem**: Combat style bonuses don't affect damage/accuracy. All attacks use "accurate" style regardless of player selection.

**Root Cause**: Two separate modifier systems exist but neither is connected:
- System A (event-based multipliers): Events never emitted
- System B (OSRS stat boosts): Style never passed to damage calculation

**The Fix**: Wire up one of the existing systems (15-30 minutes for Option A, 1 hour for Option B)

---

## Verified Code Analysis

### System A: Event-Based Multipliers (PlayerSystem)

```
PlayerSystem.ATTACK_STYLES (lines 111-172)
    ├── accurate:   damageModifier=1.0,  accuracyModifier=1.15
    ├── aggressive: damageModifier=1.15, accuracyModifier=1.0
    ├── defensive:  damageModifier=0.85, accuracyModifier=1.0
    └── controlled: damageModifier=1.0,  accuracyModifier=1.0

PlayerSystem subscribes to events (lines 271-287)
    ├── COMBAT_DAMAGE_CALCULATE   → handleDamageCalculation() applies damageModifier
    └── COMBAT_ACCURACY_CALCULATE → handleAccuracyCalculation() applies accuracyModifier

CombatSystem (lines 597, 1702)
    └── ❌ NEVER EMITS these events
```

### System B: OSRS-Accurate Stat Boosts (CombatCalculations)

```
CombatCalculations.getStyleBonus() (lines 32-42)
    ├── accurate:   { attack: +3, strength: 0,  defense: 0  }
    ├── aggressive: { attack: 0,  strength: +3, defense: 0  }
    ├── defensive:  { attack: 0,  strength: 0,  defense: +3 }
    └── controlled: { attack: +1, strength: +1, defense: +1 }

CombatCalculations.calculateDamage() (lines 95-159)
    ├── Line 129: effectiveStrength = level + 8 + styleBonus.strength  ← affects max hit
    └── Line 78:  effectiveAttack = level + 8 + styleBonus.attack      ← affects accuracy

DamageCalculator.calculateMeleeDamage() (lines 151-156)
    └── ❌ Calls calculateDamage() WITHOUT style parameter (defaults to "accurate")
```

### What Currently Works ✅

| Component | Location | Status |
|-----------|----------|--------|
| XP distribution (4 XP/damage) | `SkillsSystem.ts:661` | ✅ Works |
| HP XP (1.33 XP/damage) | `SkillsSystem.ts:662` | ✅ Works |
| Style-based XP routing | `SkillsSystem.ts:666-735` | ✅ Works |
| Get player style on kill | `MobEntity.ts:2166-2171` | ✅ Works |
| Style persistence | `PlayerSystem.ts:1736-1786` | ✅ Works |
| Client style selection | `CombatPanel.tsx:234-260` | ✅ Works (but missing controlled) |

### What's Broken ❌

| Issue | Location | Impact |
|-------|----------|--------|
| Style not passed to damage calc | `DamageCalculator.ts:151-156` | All attacks use "accurate" bonuses |
| Events never emitted | `CombatSystem.ts` | Multiplier handlers never triggered |
| Controlled missing from UI | `CombatPanel.tsx:283-287` | Players can't select controlled style |

---

## Implementation Options

### Option A: Emit Events (SIMPLER - Recommended for Quick Fix)

**Effort**: 15-30 minutes
**Approach**: Emit events that PlayerSystem already listens for

**Changes Required**:

**File**: `packages/shared/src/systems/shared/combat/CombatSystem.ts`

At line ~597 (in `executeMeleeAttack`), after calculating damage:
```typescript
// Current:
const rawDamage = this.calculateMeleeDamage(attacker, target);

// Add after:
let finalDamage = rawDamage;
this.world.emit(EventType.COMBAT_DAMAGE_CALCULATE, {
  playerId: attackerId,
  baseDamage: rawDamage,
  callback: (modified: number) => { finalDamage = modified; },
});
// Use finalDamage instead of rawDamage below
```

Repeat at line ~1702 (in `processAutoAttackOnTick`).

**Pros**:
- Uses existing infrastructure
- Minimal code changes
- Easy to test

**Cons**:
- Uses percentage multipliers (1.15x), not OSRS-accurate invisible stat boosts
- Synchronous callback pattern (works but unusual)

---

### Option B: Pass Style to Damage Calculation (MORE ACCURATE)

**Effort**: 1-1.5 hours
**Approach**: Pass player's style through to calculateDamage() which already has OSRS formulas

**Changes Required**:

**File 1**: `packages/shared/src/systems/shared/combat/DamageCalculator.ts`

```typescript
// Change signature (line 50):
calculateMeleeDamage(
  attacker: Entity | MobEntity,
  target: Entity | MobEntity,
  style: string = "accurate",  // Add this parameter
): number {

// Change call to calculateDamage (line 151):
const result = calculateDamage(
  attackerData,
  targetData,
  AttackType.MELEE,
  equipmentStats,
  style as "accurate" | "aggressive" | "defensive" | "controlled",  // Add this
);
```

**File 2**: `packages/shared/src/systems/shared/combat/CombatSystem.ts`

```typescript
// Update private method (line 746):
private calculateMeleeDamage(
  attacker: Entity | MobEntity,
  target: Entity | MobEntity,
  style: string = "accurate",  // Add parameter
): number {
  return this.damageCalculator.calculateMeleeDamage(attacker, target, style);
}

// Update callers at lines 597 and 1702:
// Get player's style first:
const playerSystem = this.world.getSystem("player") as PlayerSystem | null;
const styleData = playerSystem?.getPlayerAttackStyle?.(attackerId);
const style = styleData?.id ?? "accurate";

const rawDamage = this.calculateMeleeDamage(attacker, target, style);
```

**Pros**:
- OSRS-accurate invisible stat boosts (+3 levels)
- Flows through existing damage formula correctly

**Cons**:
- More files to change
- Need to handle type conversion (enum vs string)

---

### Option C: Both Systems (MOST COMPLETE)

Use Option B for OSRS-accurate stat boosts AND emit events for any future modifiers (potions, prayers, etc.)

---

## Phase 2: Add Controlled to UI

**Effort**: 20 minutes

**File**: `packages/client/src/game/panels/CombatPanel.tsx`

```typescript
// Change lines 283-287:
const styles: Array<{ id: string; label: string; xp: string }> = [
  { id: "accurate", label: "Accurate", xp: "Attack" },
  { id: "aggressive", label: "Aggressive", xp: "Strength" },
  { id: "defensive", label: "Defensive", xp: "Defence" },
  { id: "controlled", label: "Controlled", xp: "All" },  // Add this
];

// Change grid from grid-cols-3 to grid-cols-2 (line 416)
<div className="grid grid-cols-2 gap-1">

// Update training text (lines 446-450):
<div className="text-[9px] text-gray-400 italic">
  Training: {styles.find(s => s.id === style)?.xp} + Hitpoints
</div>
```

---

## Phase 3: Weapon-Based Style Availability (OPTIONAL)

**Effort**: 2-3 hours
**Priority**: Medium

OSRS restricts Controlled style to specific weapons. This phase adds that restriction.

**New File**: `packages/shared/src/constants/WeaponStyleConfig.ts`

See previous plan version for full implementation.

---

## TODO Checklist

### Phase 1: Connect Style to Damage (CRITICAL)

- [ ] **1.1** Choose Option A or B
- [ ] **1.2** Implement chosen option in CombatSystem.ts
- [ ] **1.3** If Option B: Update DamageCalculator.ts signature
- [ ] **1.4** Test: Aggressive style should hit ~15% harder (Option A) or use +3 Str formula (Option B)
- [ ] **1.5** Test: Accurate style should hit more often
- [ ] **1.6** Test: Defensive style should hit ~15% weaker (Option A) or use +3 Def formula (Option B)

### Phase 2: UI - Add Controlled Style (HIGH)

- [ ] **2.1** Add "controlled" to styles array in CombatPanel.tsx
- [ ] **2.2** Change grid to 2x2 layout
- [ ] **2.3** Update training text display
- [ ] **2.4** Test: Controlled button appears and is selectable
- [ ] **2.5** Test: Controlled grants split XP (Attack, Strength, Defence)

### Phase 3: Weapon Restrictions (MEDIUM - Optional)

- [ ] **3.1** Create WeaponStyleConfig.ts
- [ ] **3.2** Add validation in PlayerSystem.setPlayerAttackStyle()
- [ ] **3.3** Update CombatPanel to filter styles by weapon
- [ ] **3.4** Test: Controlled unavailable on daggers/axes
- [ ] **3.5** Test: Controlled available on scimitars/maces

### Phase 4: Cleanup (LOW - Optional)

- [ ] **4.1** Remove duplicate CombatStyle type from CombatCalculations.ts
- [ ] **4.2** Consolidate on enum from combat-types.ts
- [ ] **4.3** Remove unused damageModifier/accuracyModifier if using Option B

---

## Acceptance Criteria

### Must Have (MVP)
- [ ] Style bonuses affect damage output (aggressive hits harder)
- [ ] Style bonuses affect accuracy (accurate hits more often)
- [ ] Controlled style available in UI
- [ ] Controlled style splits XP three ways

### Should Have
- [ ] Defensive style reduces damage dealt
- [ ] Style persists across sessions (already works)

### Nice to Have
- [ ] Controlled restricted to appropriate weapons
- [ ] Different attack options per weapon type (Chop/Slash/Lunge)

---

## Testing Plan

### Manual Tests

1. **Aggressive vs Accurate Damage**
   - Set style to Aggressive, attack goblin 10 times, note average damage
   - Set style to Accurate, attack goblin 10 times, note average damage
   - Aggressive should average higher damage

2. **Accurate Hit Rate**
   - Set style to Accurate, attack high-defense mob 20 times
   - Set style to Aggressive, attack same mob 20 times
   - Accurate should have fewer misses

3. **Controlled XP**
   - Set style to Controlled
   - Kill a mob
   - Check XP gains: Attack, Strength, Defence should all increase

### Automated Tests (if time permits)

```typescript
describe('Combat Style Bonuses', () => {
  it('aggressive style increases max hit', () => {
    // Mock player with 50 Strength
    // Calculate damage with aggressive vs accurate
    // Aggressive should have higher max hit
  });

  it('accurate style increases hit chance', () => {
    // Mock attacker and defender
    // Run 1000 accuracy rolls with each style
    // Accurate should have higher hit rate
  });
});
```

---

## Estimated Effort

| Task | Effort | Priority |
|------|--------|----------|
| Phase 1 Option A (emit events) | 15-30 min | **CRITICAL** |
| Phase 1 Option B (pass style) | 1-1.5 hours | **CRITICAL** |
| Phase 2 (Controlled UI) | 20 min | HIGH |
| Phase 3 (Weapon restrictions) | 2-3 hours | MEDIUM |
| Phase 4 (Cleanup) | 30 min | LOW |
| **MVP (Option A + Phase 2)** | **35-50 min** | |
| **MVP (Option B + Phase 2)** | **1.5-2 hours** | |

---

## Quick Reference: Key File Locations

| What | Where |
|------|-------|
| Damage calculation call | `CombatSystem.ts:597, 1702` |
| DamageCalculator method | `DamageCalculator.ts:50-159` |
| OSRS style bonuses | `CombatCalculations.ts:32-42` |
| calculateDamage with style | `CombatCalculations.ts:95-159` |
| Event handlers | `PlayerSystem.ts:1621-1673` |
| Event subscriptions | `PlayerSystem.ts:271-287` |
| ATTACK_STYLES definition | `PlayerSystem.ts:111-172` |
| UI styles array | `CombatPanel.tsx:283-287` |
| XP distribution | `SkillsSystem.ts:643-743` |

---

## Decision Required

**Which option do you want to implement?**

| Option | Time | Accuracy | Complexity |
|--------|------|----------|------------|
| **A** (emit events) | 15-30 min | Percentage multipliers | Low |
| **B** (pass style) | 1-1.5 hrs | OSRS-accurate stat boosts | Medium |
| **C** (both) | 2 hrs | Best of both | Higher |

**Recommendation**: Start with Option A for quick win, can add Option B later for full OSRS accuracy.
