# OSRS-Accurate NPC Leash Behavior Implementation Plan

## Problem Statement

Our current NPC leashing behavior differs from OSRS in a key way:

| Behavior | Our Implementation | OSRS |
|----------|-------------------|------|
| When NPC exceeds max range | Walks back to spawn | Stops in place, resumes wandering |
| Range system | Single `wanderRadius` for both wander and leash | Two separate radii: `wanderRadius` (smaller) and `leashRange` (larger) |
| Post-leash behavior | RETURN state → walks to spawn → IDLE | Immediate IDLE at current position |
| Drift back to spawn | Forced (walks back) | Natural (wander targets relative to spawn) |

### OSRS Reference

From [OSRS Wiki](https://oldschool.runescape.wiki/w/Aggression):
> "Stepping outside of a radius will cause a Melee monster to stop attacking you immediately and **return to wandering**"

Key insight: "return to wandering" means resume wander behavior at current position, NOT walk back to spawn.

---

## Critical Issues Found During Review

### Issue 1: Distance Calculation Uses Euclidean (Should Be Chebyshev)

**Location**: `MobEntity.getDistance2D()` (line 1685)

```typescript
// CURRENT (Wrong - Euclidean)
private getDistance2D(point: Position3D): number {
  const dx = pos.x - point.x;
  const dz = pos.z - point.z;
  return Math.sqrt(dx * dx + dz * dz);  // ← Euclidean
}
```

**Problem**: OSRS uses Chebyshev distance (`max(|dx|, |dz|)`) for tile-based calculations. The codebase already has `tileChebyshevDistance` used in `AggroManager`, but leash checks use Euclidean.

**Impact**: At diagonal positions, NPC leashes too early:
- NPC at (6, 6) from spawn (0, 0)
- Euclidean: 8.49 tiles
- Chebyshev: 6 tiles
- With leash range 8, Euclidean incorrectly triggers leash

**Fix**: Use `tileChebyshevDistance` for spawn distance check.

---

### Issue 2: WanderBehavior Class Not Used

**Location**: `MobEntity.generateWanderTarget()` (line 1077)

```typescript
// CURRENT (Wrong - uses current position)
private generateWanderTarget(): Position3D {
  const currentPos = this.getPosition();  // ← Uses current position!
  const angle = Math.random() * Math.PI * 2;
  const distance = this.WANDER_MIN_DISTANCE + Math.random() * ...;

  let targetX = currentPos.x + Math.cos(angle) * distance;  // ← From current
  let targetZ = currentPos.z + Math.sin(angle) * distance;  // ← From current

  // Then clamps to wander radius from spawn (partial fix)
  if (distFromSpawn > this.config.wanderRadius) {
    // Clamp...
  }
}
```

**Problem**:
1. We have an OSRS-accurate `WanderBehavior` class that generates targets relative to spawn
2. MobEntity doesn't use it - has its own implementation that uses current position
3. The clamping creates drift-back effect but isn't truly OSRS-accurate (targets always at boundary toward current position, not uniformly random within wander area)

**Fix**: Either integrate `WanderBehavior` into MobEntity, or rewrite `generateWanderTarget()` to use spawn-relative targets.

---

### Issue 3: Potential Rapid State Flipping at Boundary

**Scenario**:
1. Player stands just outside leash range
2. NPC chases to leash boundary → leashes → IDLE
3. Player still within aggro range (aggro range < leash range)
4. NPC immediately aggros again → CHASE → leashes again
5. Rapid IDLE ↔ CHASE flipping

**Assessment**: This may actually be correct OSRS behavior (NPC gets "stuck" at boundary). However, if it causes performance issues, we may need a post-leash aggro cooldown.

**Action**: Document as known behavior, add optional cooldown if needed.

---

### Issue 4: IdleState Delay After Leash

**Current**: When NPC enters IDLE after leashing, it waits 3-8 seconds before wandering.

**Assessment**: Probably acceptable - the key fix is that NPC doesn't walk back. The idle pause is a minor detail. OSRS NPCs may have similar behavior.

**Action**: Keep as-is, adjust later if testing shows it feels wrong.

---

## Architecture Overview

### Current State Flow (Incorrect)
```
IDLE → CHASE → (exceeds wanderRadius) → RETURN → (walks to spawn) → IDLE
```

### Target State Flow (OSRS-Accurate)
```
IDLE → CHASE → (exceeds leashRange) → IDLE (at current position) → WANDER (targets relative to spawn)
```

### Two-Tier Range System

```
                    Spawn Point (S)
                         │
                         ▼
    ┌─────────────────────────────────────────┐
    │                                         │
    │      ┌─────────────────────────┐        │
    │      │                         │        │
    │      │    Wander Area          │        │
    │      │    (5 tiles)            │        │
    │      │         S               │        │
    │      │                         │        │
    │      └─────────────────────────┘        │
    │                                         │
    │           Leash Area                    │
    │           (7-10 tiles)                  │
    │                                         │
    └─────────────────────────────────────────┘

- NPC wanders within inner box (wander radius)
- NPC can chase into outer box (leash range)
- NPC stops chasing when leaving outer box
- Wander targets always within inner box (relative to spawn)
```

---

## Implementation Phases

> **IMPORTANT**: Phases 4 and 7 MUST be done together in the same commit to avoid failing tests.

---

## DISCOVERY: leashRange Infrastructure Already Exists!

During review, I found that `leashRange` is already partially implemented:

| Component | Location | Status |
|-----------|----------|--------|
| `MobAIStateData.leashRange: number` | `types/entities/npc-mob-types.ts:148` | ✅ Type exists |
| `AGGRO_CONSTANTS.MOB_BEHAVIORS.default.leashRange` | `constants/CombatConstants.ts:151` | ✅ Default = 10 tiles |
| `AggroSystem` sets leashRange | `combat/AggroSystem.ts:187` | ✅ Uses behavior.leashRange |
| `AIStateContext.getLeashRange()` | `managers/AIStateMachine.ts` | ❌ **Missing from interface** |
| `MobEntity` exposes leashRange | `entities/npc/MobEntity.ts` | ❌ **Not implemented** |
| `ChaseState/AttackState` uses leashRange | `managers/AIStateMachine.ts:219,307` | ❌ **Uses getWanderRadius() instead** |

**The infrastructure exists but isn't connected!** This simplifies our implementation significantly.

---

### Phase 1: Add getLeashRange() to AIStateContext

**Goal**: Expose existing leashRange through the context interface.

**File**: `packages/shared/src/entities/managers/AIStateMachine.ts`

```typescript
export interface AIStateContext {
  // ... existing methods ...

  // Spawn & Leashing
  getSpawnPoint(): Position3D;
  getDistanceFromSpawn(): number;
  getWanderRadius(): number;     // For wander target generation (5 tiles default)
  getLeashRange(): number;       // NEW: For chase boundary (10 tiles default)
  getCombatRange(): number;

  // ... rest of methods ...
}
```

**File**: `packages/shared/src/entities/npc/MobEntity.ts`

Add to AIStateContext implementation:

```typescript
// In createAIStateContext()
getLeashRange: () => this.config.leashRange ?? 10,  // Default from AGGRO_CONSTANTS
```

Note: May need to add `leashRange` to `MobEntityConfig` if not already present, or read from `AGGRO_CONSTANTS.MOB_BEHAVIORS.default.leashRange`.

---

### Phase 2: Fix Distance Calculation (Euclidean → Chebyshev)

**Goal**: Use OSRS-accurate Chebyshev distance for leash checks.

**File**: `packages/shared/src/entities/npc/MobEntity.ts`

#### 3.1 Replace getDistance2D with Chebyshev

```typescript
// BEFORE (Euclidean - wrong)
private getDistance2D(point: Position3D): number {
  const pos = this.getPosition();
  const dx = pos.x - point.x;
  const dz = pos.z - point.z;
  return Math.sqrt(dx * dx + dz * dz);
}

// AFTER (Chebyshev - OSRS-accurate)
private getSpawnDistanceTiles(): number {
  const pos = this.getPosition();
  const spawn = this._currentSpawnPoint;
  const currentTile = worldToTile(pos.x, pos.z);
  const spawnTile = worldToTile(spawn.x, spawn.z);
  return tileChebyshevDistance(currentTile, spawnTile);
}
```

#### 3.2 Update AIStateContext

```typescript
// Update the context to use tile-based distance
getDistanceFromSpawn: () => this.getSpawnDistanceTiles(),
```

**Note**: Import `tileChebyshevDistance` from TileSystem.

---

### Phase 3: Fix generateWanderTarget (Current → Spawn-Relative)

**Goal**: Generate wander targets relative to spawn point, not current position.

**File**: `packages/shared/src/entities/npc/MobEntity.ts`

#### Option A: Use Existing WanderBehavior Class

Integrate the already-OSRS-accurate `WanderBehavior` class:

```typescript
// In MobEntity constructor
this.wanderBehavior = new WanderBehavior({
  movementType: this.config.movementType,
  wanderRadius: this.config.wanderRadius,
});

// Update generateWanderTarget
private generateWanderTarget(): Position3D {
  const spawnTile = worldToTile(this._currentSpawnPoint.x, this._currentSpawnPoint.z);
  const targetTile = this.wanderBehavior.generateWanderTarget(spawnTile);
  const targetWorld = tileToWorld(targetTile);
  return { x: targetWorld.x, y: this.getPosition().y, z: targetWorld.z };
}
```

#### Option B: Rewrite In-Place (If WanderBehavior integration is complex)

```typescript
private generateWanderTarget(): Position3D {
  const spawn = this._currentSpawnPoint;
  const radius = this.config.wanderRadius;

  // OSRS-accurate: Random tile within [-radius, +radius] of spawn
  const range = 2 * radius + 1;
  const offsetX = Math.floor(Math.random() * range) - radius;
  const offsetZ = Math.floor(Math.random() * range) - radius;

  return {
    x: spawn.x + offsetX,
    y: this.getPosition().y,
    z: spawn.z + offsetZ,
  };
}
```

**Recommendation**: Option B is simpler and sufficient. The key change is using `spawn` instead of `currentPos`.

---

### Phase 4: Modify ChaseState and AttackState

**Goal**: Check against `leashRange` instead of `wanderRadius`, transition to IDLE instead of RETURN.

**File**: `packages/shared/src/entities/managers/AIStateMachine.ts`

#### 5.1 Update ChaseState

```typescript
export class ChaseState implements AIState {
  readonly name = MobAIState.CHASE;

  update(context: AIStateContext, deltaTime: number): MobAIState | null {
    // OSRS-ACCURATE LEASHING: Check against leashRange, not wanderRadius
    const spawnDistance = context.getDistanceFromSpawn();  // Now returns Chebyshev tiles
    if (spawnDistance > context.getLeashRange()) {
      // OSRS: Stop immediately, transition to IDLE (not RETURN)
      context.setTarget(null);
      context.exitCombat();  // Clear combat state so mob can attack on re-aggro
      return MobAIState.IDLE;  // ← Changed from RETURN
    }

    // ... rest of chase logic unchanged ...
  }
}
```

#### 5.2 Update AttackState

```typescript
export class AttackState implements AIState {
  readonly name = MobAIState.ATTACK;

  update(context: AIStateContext, _deltaTime: number): MobAIState | null {
    // OSRS-ACCURATE LEASHING: Check against leashRange, not wanderRadius
    const spawnDistance = context.getDistanceFromSpawn();
    if (spawnDistance > context.getLeashRange()) {
      context.setTarget(null);
      context.exitCombat();
      return MobAIState.IDLE;  // ← Changed from RETURN
    }

    // ... rest of attack logic unchanged ...
  }
}
```

---

### Phase 5: Repurpose RETURN State for Retreat Mechanic

**Goal**: Keep RETURN state but only use it for explicit retreat scenarios (not leashing).

**File**: `packages/shared/src/entities/managers/AIStateMachine.ts`

The RETURN state should only be triggered by:
1. Low HP retreat behavior (future feature)
2. Attacked from outside max range (future feature)
3. Explicit scripted retreat (boss mechanics)

For now, RETURN state code remains unchanged but is no longer triggered by leashing.

```typescript
/**
 * RETURN State - Walking back to spawn (RETREAT ONLY, not leashing)
 *
 * This state is for explicit retreat scenarios:
 * - Low HP retreat (future)
 * - Attacked from outside max range (future)
 * - Scripted boss retreat mechanics
 *
 * Normal leashing does NOT use this state - NPCs stop in place and wander.
 */
export class ReturnState implements AIState {
  // ... existing implementation unchanged ...
}
```

Add a comment to clarify when RETURN is used:

```typescript
// In AIStateMachine constructor or documentation
// IMPORTANT: RETURN state is for RETREAT, not leashing
// Leashing: CHASE/ATTACK → IDLE (stops in place)
// Retreat: Any state → RETURN → walks to spawn → IDLE
```

---

### Phase 6: Verify Wander Behavior (Already Fixed in Phase 3)

**Goal**: Confirm wander targets are generated relative to spawn (not current position).

This is handled by Phase 3. After that phase, `generateWanderTarget()` will use spawn-relative targets.

**Post-Implementation Verification**:
- Ensure `generateWanderTarget()` uses spawn point, not current position
- Test that NPC outside wander area drifts back toward spawn over multiple wander ticks

---

### Phase 7: Update Existing Tests

> **IMPORTANT**: This phase MUST be done together with Phase 4 in the same commit.

**Goal**: Update tests that expect RETURN state on leashing.

**Files to update**:
- `packages/shared/src/systems/shared/combat/__tests__/AIStateMachine.test.ts`
- `packages/shared/src/systems/shared/combat/__tests__/MobAggro.integration.test.ts`
- Any other tests checking for RETURN state after chase

#### Example Test Changes

```typescript
// BEFORE
it("transitions to RETURN when exceeding wander radius", () => {
  // ... setup ...
  expect(context.aiState).toBe(MobAIState.RETURN);
});

// AFTER
it("transitions to IDLE when exceeding leash range", () => {
  // ... setup with mob beyond leashRange ...
  expect(context.aiState).toBe(MobAIState.IDLE);
  expect(context.target).toBeNull();  // Target cleared
});
```

---

### Phase 8: Add New Tests

**Goal**: Add tests specifically for OSRS-accurate leash behavior.

**File**: `packages/shared/src/systems/shared/combat/__tests__/LeashBehavior.test.ts`

```typescript
describe("OSRS-Accurate Leash Behavior", () => {
  describe("two-tier range system", () => {
    it("allows NPC to chase beyond wander radius but within leash range", () => {
      // NPC at 6 tiles from spawn (beyond 5 tile wander, within 8 tile leash)
      // Should continue chasing
    });

    it("stops NPC when exceeding leash range", () => {
      // NPC at 9 tiles from spawn (beyond 8 tile leash)
      // Should stop chasing, transition to IDLE
    });
  });

  describe("immediate stop behavior", () => {
    it("does NOT walk back to spawn on leash", () => {
      // NPC leashed at position X
      // Should stay at position X, not walk to spawn
    });

    it("transitions directly to IDLE, not RETURN", () => {
      // Verify state is IDLE, not RETURN
    });

    it("clears combat state on leash", () => {
      // Ensure mob can attack immediately on re-aggro
    });
  });

  describe("natural drift back", () => {
    it("generates wander targets within wander radius of spawn", () => {
      // NPC at edge of leash range
      // Next wander target should be toward spawn
    });

    it("gradually returns to wander area through normal wandering", () => {
      // Simulate multiple wander ticks
      // NPC should drift toward spawn
    });
  });

  describe("edge cases", () => {
    it("handles NPC exactly at leash boundary", () => {
      // Test boundary condition
    });

    it("handles large NPCs (2x2) correctly", () => {
      // Use center point for distance calculation
    });

    it("works with custom leash ranges from manifest", () => {
      // Test manifest-specified leashRange
    });
  });
});
```

---

### Phase 9: Update Manifest Schema (Optional)

**Goal**: Allow per-NPC leash range configuration in manifests.

**File**: `packages/shared/src/data/manifests/npc/*.json`

```json
{
  "id": "goblin",
  "name": "Goblin",
  "movement": {
    "type": "wander",
    "wanderRadius": 5,
    "leashRange": 8
  }
}
```

Most NPCs can use the default (`wanderRadius + 3`), but bosses or special NPCs might need custom values.

---

## File Change Summary

| File | Changes |
|------|---------|
| `entities/managers/AIStateMachine.ts` | Add `getLeashRange()` to interface, update ChaseState/AttackState to use leashRange and transition to IDLE |
| `entities/npc/MobEntity.ts` | Implement `getLeashRange()`, fix `getSpawnDistanceTiles()` to use Chebyshev, fix `generateWanderTarget()` to use spawn |
| `__tests__/AIStateMachine.test.ts` | Update expectations for IDLE instead of RETURN |
| `__tests__/MobAggro.integration.test.ts` | Update leash-related tests |
| NEW: `__tests__/LeashBehavior.test.ts` | Add new OSRS-accurate tests |

**Note**: No type changes needed - `leashRange` already exists in `MobAIStateData` and `AGGRO_CONSTANTS`.

---

## Implementation Order

```
Phase 1: Add getLeashRange() to AIStateContext + MobEntity
    ↓
Phase 2: Fix getDistanceFromSpawn() to use Chebyshev
    ↓
Phase 3: Fix generateWanderTarget() to use spawn
    ↓
┌─────────────────────────────────────────────┐
│ Phase 4 + Phase 7 (MUST BE DONE TOGETHER)   │
│ - Modify ChaseState/AttackState → IDLE      │
│ - Update existing tests                     │
└─────────────────────────────────────────────┘
    ↓
Phase 5: Document RETURN state for retreat
    ↓
Phase 6: Verify wander behavior
    ↓
Phase 8: Add new LeashBehavior tests
    ↓
Phase 9: (Optional) Manifest schema update
```

**Commit Strategy**:
1. Commit 1: Phases 1-3 (context method + bug fixes, no behavior change)
2. Commit 2: Phases 4+7 (behavior change + test updates, tests stay green)
3. Commit 3: Phases 5, 6, 8 (documentation + new tests)
4. Commit 4: Phase 9 (optional manifest support)

---

## Testing Strategy

### Unit Tests
- AIStateMachine state transitions
- LeashRange vs WanderRadius distinction
- Context method returns

### Integration Tests
- Full leash scenario: aggro → chase → leash → idle → wander
- Drift-back behavior over multiple ticks
- Large NPC handling (2x2 tiles)

### Manual Testing
1. Aggro a goblin and run away
2. Observe goblin stops at leash boundary (doesn't walk back)
3. Wait and observe goblin eventually wanders back toward spawn
4. Verify goblin can aggro again immediately after leash

---

## Success Criteria

1. ✅ NPCs stop in place when exceeding leash range (no walk-back)
2. ✅ NPCs transition to IDLE, not RETURN, on leash
3. ✅ NPCs resume wandering at current position after leash
4. ✅ Wander targets are relative to spawn (natural drift back)
5. ✅ All existing tests pass or are updated appropriately
6. ✅ New leash behavior tests pass
7. ✅ RETURN state reserved for retreat mechanics only

---

## OSRS Reference Links

- [OSRS Wiki - Aggression](https://oldschool.runescape.wiki/w/Aggression)
- [OSRS Wiki - Pathfinding](https://oldschool.runescape.wiki/w/Pathfinding)
- [OSRS Docs - Random Walk](https://osrs-docs.com/docs/mechanics/random-walk/)

---

## Estimated Complexity

| Phase | Description | Complexity | Risk |
|-------|-------------|------------|------|
| Phase 1 | Add getLeashRange() to context | Low | Low |
| Phase 2 | Fix Euclidean → Chebyshev | Low | Low (bug fix) |
| Phase 3 | Fix generateWanderTarget | Low | Low (bug fix) |
| Phase 4 | Modify ChaseState/AttackState | Medium | Medium (behavior change) |
| Phase 5 | Document RETURN state | Low | Low |
| Phase 6 | Verify wander behavior | Low | Low (audit) |
| Phase 7 | Update existing tests | Medium | Medium |
| Phase 8 | Add new tests | Medium | Low |
| Phase 9 | Manifest schema (optional) | Low | Low |

**Total Estimate**: ~2-3 hours of focused implementation (reduced from 3-4 hours since types already exist)

**Risk Mitigation**:
- Phases 1-3 are additive/fixes without changing behavior (existing tests should pass)
- Phases 4+7 must be atomic (tests fail if done separately)
- Phases 5-8 are low-risk additions

---

## Rollback Plan

If issues arise:

**Partial Rollback** (keep bug fixes):
1. Revert Phase 4 changes to restore RETURN state behavior
2. Keep Phases 1-3 (Chebyshev + spawn-relative wander are bug fixes)

**Full Rollback**:
1. Revert Commit 2 (Phase 4+7)
2. Optionally revert Commit 1 (Phases 1-3)

The core behavior change is isolated to `ChaseState.update()` and `AttackState.update()` in Phase 4 - reverting those two methods restores original behavior while keeping the bug fixes from Phases 1-3.
