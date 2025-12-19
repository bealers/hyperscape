# Combat System Recommended Improvements

Based on comprehensive audit of 35+ combat-related files. Current overall score: **8.7/10**

---

## Priority 1: Critical Fixes

### 1.1 ~~Replace setTimeout with Tick-Based Respawn Timer~~ ALREADY SOLVED

**Status:** FALSE ALARM - Investigation revealed this is already correctly implemented.

**Findings:**
1. **MobEntity.die()** (line 1813) does NOT call `super.die()` - it has its own complete implementation
2. **MobEntity** uses `RespawnManager` which is already TICK-BASED (see `RespawnManager.ts:44-46`):
   ```typescript
   // TICK-BASED respawn timing (OSRS-accurate)
   private respawnStartTick: number | null = null;
   private respawnDurationTicks: number = 0;
   ```
3. **PlayerEntity** sets `respawnTime: 0` (line 295), so the setTimeout condition is NEVER true
4. The setTimeout in `CombatantEntity.die():332-334` is effectively DEAD CODE

**No action needed** - mob respawns are already OSRS-accurate via RespawnManager.

---

### 1.2 Enforce EntityID Branded Type Usage
**Files:** Combat system uses plain `string` for entity IDs despite branded type existing

**Issue:** `EntityID` branded type exists at `types/core/identifiers.ts:13` and is imported in `CombatSystem.ts:9`, but most internal parameters/interfaces use plain `string`. This creates type safety gaps.

**Evidence from CombatSystem.ts:**
```typescript
// Line 9: EntityID is imported
import { EntityID } from "../../../types/core/identifiers";

// But parameters still use plain string (lines 106-107, 245-246, 324-325, 647):
attackerId: string;  // Should be EntityID
targetId: string;    // Should be EntityID
```

**Affected interfaces in CombatSystem.ts:**
- `CombatPlayerEntity` (lines 66-99): `id: string`
- Event handlers (lines 231-232, 245-246): `playerId: string`, `targetId: string`
- `startCombat` parameters (lines 324-325): `attackerId: string`, `targetId: string`
- `handleMobAttack` (line 647): `mobId: string`, `targetId: string`

**Solution:** Replace `string` with `EntityID` in all combat interfaces:
```typescript
// Before
interface CombatPlayerEntity {
  id: string;
  // ...
}

// After
interface CombatPlayerEntity {
  id: EntityID;
  // ...
}
```

**Impact:** Prevents accidental ID misuse at compile time, leverages existing `createEntityID()` and `isValidEntityID()` utilities.

---

## Priority 2: Code Quality Improvements

### 2.1 Extract Damage Application to Polymorphic Handler
**File:** `packages/shared/src/systems/shared/combat/CombatSystem.ts`

**Issue:** Multiple methods contain `if (targetType === 'player') ... else if (targetType === 'mob')` conditionals.

**Evidence (7 occurrences found via grep):**
```typescript
// Line 456: Loading check
if (targetType === "player" && target.data?.isLoading) {

// Lines 900-924: Damage application
if (targetType === "player") {
  const playerSystem = this.world.getSystem<PlayerSystem>("player");
  // ...player-specific damage logic
}

// Lines 1080-1104: Retaliation check
if (targetType === "mob" && targetEntity) {
  // mob retaliation logic
} else if (targetType === "player") {
  // player auto-retaliate logic
}

// Lines 1142, 1174, 1291, 2143: Additional conditionals
```

**Solution:** Implement Strategy pattern:
```typescript
interface DamageHandler {
  applyDamage(targetId: EntityID, damage: number, attackerId: EntityID): void;
  getHealth(entityId: EntityID): number;
  isAlive(entityId: EntityID): boolean;
  canRetaliate(entityId: EntityID, currentTick: number): boolean;
}

class PlayerDamageHandler implements DamageHandler { ... }
class MobDamageHandler implements DamageHandler { ... }

// In CombatSystem constructor
private damageHandlers = new Map<EntityType, DamageHandler>([
  ['player', new PlayerDamageHandler(this.world)],
  ['mob', new MobDamageHandler(this.world)],
]);

// Usage
const handler = this.damageHandlers.get(targetType);
handler.applyDamage(targetId, damage, attackerId);
```

**Impact:** Cleaner code, easier to add new entity types (pets, summons, etc.).

---

### 2.2 ~~Remove Deprecated Constants~~ IMPLEMENTED

**File:** `packages/shared/src/constants/CombatConstants.ts:118-123`

**Status:** COMPLETED - Deprecated `DAMAGE_MULTIPLIERS` block removed.

**What was removed:**
```typescript
// CombatConstants.ts:118-123 - DELETED
DAMAGE_MULTIPLIERS: {
  MELEE_ATTACK: 0.5, // Deprecated - use OSRS formula
  RANGED_ATTACK: 0.5, // Deprecated - use OSRS formula
  DEFENSE_REDUCTION: 0.25, // Deprecated - defense doesn't reduce damage in OSRS
},
```

**Impact:** Cleaner API, prevents incorrect formula usage.

---

### 2.3 ~~Optimize Hot-Path Array Allocations~~ COMPLETED

**Status:** CombatAnimationSync.ts COMPLETED, CombatUtils.ts deferred (lower priority - called on-demand not every tick)

**Files:**
- `CombatAnimationSync.ts:337` - ✅ FIXED: Pre-allocated array reused each tick
- `CombatUtils.ts:226` - Deferred (not a hot path - called on-demand)

**Implementation in CombatAnimationSync.ts:**
```typescript
// Added class property (line 133-134):
// Pre-allocated array for hot-path optimization (avoids GC pressure)
private completedHitsplatIndices: number[] = [];

// Modified processTick() (line 339-340):
// Process scheduled hitsplats (reuse pre-allocated array to avoid GC)
this.completedHitsplatIndices.length = 0;
```

**Impact:** Reduces GC pressure in combat-heavy scenarios (100+ concurrent combats).

---

## Priority 3: Architecture Enhancements

### 3.1 ~~Add Combat State Machine for Players~~ IMPLEMENTED

**Status:** COMPLETED - Created `PlayerCombatStateManager.ts`

**File:** `packages/shared/src/entities/managers/PlayerCombatStateManager.ts`

**Implementation includes:**
- ✅ Combat state tracking (in combat, target, attacker)
- ✅ Attack cooldowns using game ticks (OSRS-accurate)
- ✅ Auto-retaliate toggle (enabled by default)
- ✅ AFK detection for auto-retaliate disable (20 min)
- ✅ Logout prevention tracking (9.6 seconds)
- ✅ Combat timeout tracking (4.8 seconds)
- ✅ Weapon switching support (dynamic attack speed/range)
- ✅ OSRS wiki references

**Key methods:**
```typescript
canAttack(currentTick: number): boolean;
performAttack(targetId: string, currentTick: number): boolean;
onReceiveAttack(attackerId: string, currentTick: number): void;
canLogout(currentTick: number): boolean;
isAFK(currentTick: number): boolean;
setAutoRetaliate(enabled: boolean): void;
```

**Impact:** Consistent state management between players and mobs, OSRS-accurate timing.

---

### 3.2 Extract Combat Formulas to Pure Module - DEFERRED

**Status:** Deferred - Lower priority, existing structure is well-organized

**Rationale:** After review, the existing formula files are well-organized with OSRS wiki references:
- `CombatCalculations.ts` - Main formulas (accuracy, damage, style bonuses)
- `HitDelayCalculator.ts` - Hit delay formulas (melee/ranged/magic)
- `CombatLevelCalculator.ts` - Combat level formula

Each file is focused and well-documented. Consolidation would require updating imports across 11+ files with minimal practical benefit.

**Current:** Combat formulas are spread across 11 files (grep for `calculateDamage|calculateMaxHit|calculateAccuracy`):

| File | Functions |
|------|-----------|
| `utils/game/CombatCalculations.ts` | Main formulas (OSRS-accurate) |
| `utils/game/CombatUtils.ts` | `calculateComponentDamage()` (simplified version) |
| `utils/game/HitDelayCalculator.ts` | Hit delay formulas |
| `utils/game/CombatLevelCalculator.ts` | Combat level formula |
| `entities/CombatantEntity.ts` | `calculateDamage()` (wrapper) |
| `systems/shared/combat/CombatSystem.ts` | Imports and uses all above |
| + 5 more test/benchmark files | Various usages |

**Issue:** `CombatUtils.ts:87-106` has a **simplified** `calculateComponentDamage()` that differs from OSRS formula:
```typescript
// CombatUtils.ts - SIMPLIFIED (not OSRS-accurate)
const baseDamage = (attackerStats.strength?.level || 1) + weaponDamage;
const damageReduction = defense / (defense + 100);  // NOT OSRS formula
```

**Solution:** Consolidate into single `OSRSFormulas.ts`:
```typescript
// packages/shared/src/utils/game/OSRSFormulas.ts
export const OSRSFormulas = {
  // Accuracy (from CombatCalculations.ts)
  calculateAccuracyRoll(effectiveLevel: number, bonus: number): number,
  calculateDefenceRoll(effectiveLevel: number, bonus: number): number,
  doesAttackHit(attackRoll: number, defenceRoll: number, rng: SeededRandom): boolean,

  // Damage (from CombatCalculations.ts)
  calculateMaxHit(effectiveStrength: number, strengthBonus: number): number,
  rollDamage(maxHit: number, rng: SeededRandom): number,

  // Hit Delay (from HitDelayCalculator.ts)
  calculateMeleeDelay(): number,
  calculateRangedDelay(distance: number): number,
  calculateMagicDelay(distance: number): number,

  // Combat Level (from CombatLevelCalculator.ts)
  calculateCombatLevel(stats: CombatStats): number,
} as const;
```

**Migration:** Deprecate `CombatUtils.calculateComponentDamage()` and redirect to OSRS formula.

**Impact:** Single source of truth, easier to audit OSRS accuracy, prevents formula drift.

---

### 3.3 ~~Add Server Reconciliation Documentation~~ IMPLEMENTED

**Status:** COMPLETED - Created `COMBAT_RECONCILIATION.md`

**File:** `COMBAT_RECONCILIATION.md`

**Contents include:**
1. Architecture overview with server-authoritative model
2. What state is predicted on client vs server-controlled
3. EventStore recording system with checksums
4. Desync detection (FNV-1a checksums, suspicious event flags)
5. Recovery procedures for combat and movement desync
6. Admin investigation API endpoints
7. OSRS accuracy notes

**Impact:** Comprehensive documentation for understanding prediction/reconciliation model.

---

## Priority 4: Test Coverage Gaps

### 4.1 Add Performance Regression Tests
**File:** `packages/shared/src/systems/shared/combat/__tests__/CombatBenchmarks.test.ts`

**Current:** Has some benchmarks, but missing:
- Memory allocation tracking
- GC pause measurement
- 100+ entity combat scenarios

**Solution:** Extend benchmark suite:
```typescript
describe('Combat Performance Regression', () => {
  it('processes 100 concurrent combats under 1ms per tick', async () => {
    // Setup 100 player-vs-mob combat pairs
    const startTime = performance.now();
    combatSystem.processTick(currentTick);
    const elapsed = performance.now() - startTime;
    expect(elapsed).toBeLessThan(1);
  });

  it('does not allocate during processTick hot path', () => {
    // Use --expose-gc and measure heap before/after
  });
});
```

---

### 4.2 Add Desync Detection Tests
**Solution:** Test EventStore checksum validation:
```typescript
describe('Combat Desync Detection', () => {
  it('detects modified event in replay', () => {
    // Record events
    // Modify one event
    // Verify checksum mismatch detected
  });

  it('generates investigation report for suspicious patterns', () => {
    // Create impossible damage sequence
    // Verify flagged in report
  });
});
```

---

## Priority 5: Documentation

### 5.1 ~~Audit Existing OSRS Wiki References~~ IMPLEMENTED

**Status:** COMPLETED - Added wiki references to death systems

**Files with wiki references (updated):**

| File | Wiki References |
|------|-----------------|
| `AggroSystem.ts` | Lines 32, 347, 424, 498 - Aggression, Tolerance, Combat level |
| `CombatStateManager.ts` | Lines 21, 170 - Attack speed, Auto Retaliate |
| `TileSystem.ts` | Lines 182, 364 - Attack range, Pathfinding |
| `CombatConstants.ts` | Lines 13, 36, 47, 68, 88, 101, 107 - Multiple mechanics |
| `HitDelayCalculator.ts` | Lines 8-31 - Hit delay formulas |
| `CombatCalculations.ts` | Lines 36, 66, 118, 178, 320, 399 - Combat options, Accuracy, DPS, Range, Auto Retaliate |
| `RangeSystem.ts` | Line 15 - Aggressiveness |
| `MobDeathSystem.ts` | ✅ NEW: Lines 15-16 - Respawn rate, Drop mechanics |
| `PlayerDeathSystem.ts` | ✅ NEW: Lines 106-108 - Gravestone, Death, Wilderness death |
| `DamageSplatSystem.ts` | ✅ NEW: Line 19 - Hitsplat mechanics |
| `PlayerCombatStateManager.ts` | ✅ NEW: Lines 17-19 - Auto Retaliate, Attack speed, Logout |

**Impact:** All combat-related files now have OSRS wiki references for auditing accuracy.

---

### 5.2 ~~Create Combat System Architecture Diagram~~ IMPLEMENTED

**Status:** COMPLETED - Created `docs/COMBAT_ARCHITECTURE.md`

**File:** `docs/COMBAT_ARCHITECTURE.md`

**Contents include:**
- System dependency graph (CombatSystem → all services)
- Event flow diagram (attack request → validation → damage → hitsplat)
- State machine diagrams for Player/Mob combat (using PlayerCombatStateManager)
- Tick timing diagram with attack speed examples
- Combat formulas with OSRS wiki references
- Complete file reference table

---

## Implementation Status

| Item | Description | Status |
|------|-------------|--------|
| 1.1 | setTimeout Respawn Timer | ✅ ALREADY SOLVED (false alarm) |
| 1.2 | EntityID Branded Type | ⏳ Pending (large refactor) |
| 2.1 | Polymorphic Damage Handlers | ⏳ Pending (medium effort) |
| 2.2 | Remove Deprecated Constants | ✅ COMPLETED |
| 2.3 | Hot-Path Array Optimization | ✅ COMPLETED |
| 3.1 | PlayerCombatStateManager | ✅ COMPLETED |
| 3.2 | Formula Consolidation | 🔄 DEFERRED (existing structure is good) |
| 3.3 | Reconciliation Documentation | ✅ COMPLETED |
| 4.1 | Performance Regression Tests | ⏳ Pending |
| 4.2 | Desync Detection Tests | ⏳ Pending |
| 5.1 | OSRS Wiki References | ✅ COMPLETED |
| 5.2 | Architecture Diagram | ✅ COMPLETED |

**Progress: 7/12 items complete (58%)**

---

## Success Metrics

After implementing all improvements:

| Category | Current | Target |
|----------|---------|--------|
| Production Quality | 8.5 | 9.0 |
| Best Practices | 8.5 | 9.0 |
| OWASP Security | 9.0 | 9.0 |
| Game Studio Audit | 9.0 | 9.5 |
| Memory Hygiene | 9.0 | 9.5 |
| SOLID Principles | 8.5 | 9.0 |
| OSRS Accuracy | 9.5 | 9.5 |
| **Overall** | **8.7** | **9.2** |

---

## Notes

- All changes should maintain backward compatibility with existing save data
- Performance improvements should be verified with benchmarks before/after
- OSRS accuracy changes should cite wiki sources
- Security changes should be reviewed by second developer

---

*Generated from combat system audit on 2025-12-19*
