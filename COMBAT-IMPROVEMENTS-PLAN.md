# Combat System Improvements Plan

This document outlines implementation plans for the remaining optional improvements identified in the combat system audit.

---

## Table of Contents

1. [PID Shuffle System](#1-pid-shuffle-system)
2. [AIStateContext Interface Splitting](#2-aistatecontext-interface-splitting)
3. [Type Guard Replacements](#3-type-guard-replacements)

---

## 1. PID Shuffle System

### Priority: 🟢 Low
### Complexity: Medium
### Estimated Files: 3-4

### Background

In OSRS, Player ID (PID) determines combat priority. When two players attack each other on the same tick, the player with lower PID hits first. PIDs are shuffled every 60-150 seconds to ensure fairness.

**OSRS Wiki Reference:** https://oldschool.runescape.wiki/w/PID

### Current State

The combat system processes attacks in entity iteration order, which is deterministic but not fair for PvP scenarios.

### Implementation

#### Step 1: Create PID Manager

**File:** `packages/shared/src/systems/shared/combat/PidManager.ts`

```typescript
/**
 * PidManager - OSRS-style Player ID shuffle system
 *
 * Manages combat priority ordering for fair PvP.
 * PIDs are shuffled every 60-150 seconds (randomized).
 *
 * @see https://oldschool.runescape.wiki/w/PID
 */

import type { EntityID } from "../../../types/core/identifiers";

/** PID shuffle interval range in ticks (60-150 seconds) */
const PID_SHUFFLE_MIN_TICKS = 100;  // ~60 seconds
const PID_SHUFFLE_MAX_TICKS = 250;  // ~150 seconds

export interface PidEntry {
  entityId: EntityID;
  pid: number;
  assignedTick: number;
}

export class PidManager {
  private pids: Map<EntityID, PidEntry> = new Map();
  private nextPid = 0;
  private lastShuffleTick = 0;
  private nextShuffleTick = 0;
  private rng: { nextInt: (max: number) => number };

  constructor(rng: { nextInt: (max: number) => number }) {
    this.rng = rng;
    this.scheduleNextShuffle(0);
  }

  /**
   * Assign PID to a new entity (on login/spawn)
   */
  assignPid(entityId: EntityID, currentTick: number): number {
    const pid = this.nextPid++;
    this.pids.set(entityId, {
      entityId,
      pid,
      assignedTick: currentTick,
    });
    return pid;
  }

  /**
   * Remove PID when entity leaves (logout/death)
   */
  removePid(entityId: EntityID): void {
    this.pids.delete(entityId);
  }

  /**
   * Get entity's current PID
   */
  getPid(entityId: EntityID): number | undefined {
    return this.pids.get(entityId)?.pid;
  }

  /**
   * Compare PIDs for combat priority
   * Returns negative if a has priority, positive if b has priority, 0 if equal
   */
  comparePriority(entityA: EntityID, entityB: EntityID): number {
    const pidA = this.getPid(entityA) ?? Infinity;
    const pidB = this.getPid(entityB) ?? Infinity;
    return pidA - pidB;
  }

  /**
   * Sort entities by PID for combat processing
   */
  sortByPid<T extends { id: EntityID }>(entities: T[]): T[] {
    return [...entities].sort((a, b) => this.comparePriority(a.id, b.id));
  }

  /**
   * Check and perform PID shuffle if due
   * Call this each tick from the game loop
   */
  update(currentTick: number): boolean {
    if (currentTick < this.nextShuffleTick) {
      return false;
    }

    this.shuffle(currentTick);
    return true;
  }

  /**
   * Perform PID shuffle (Fisher-Yates on PID assignments)
   */
  private shuffle(currentTick: number): void {
    const entries = Array.from(this.pids.values());

    // Fisher-Yates shuffle
    for (let i = entries.length - 1; i > 0; i--) {
      const j = this.rng.nextInt(i + 1);
      // Swap PIDs (not entries)
      const tempPid = entries[i].pid;
      entries[i].pid = entries[j].pid;
      entries[j].pid = tempPid;
    }

    // Update map with new PIDs
    for (const entry of entries) {
      entry.assignedTick = currentTick;
      this.pids.set(entry.entityId, entry);
    }

    this.lastShuffleTick = currentTick;
    this.scheduleNextShuffle(currentTick);
  }

  /**
   * Schedule next shuffle with randomized interval
   */
  private scheduleNextShuffle(currentTick: number): void {
    const range = PID_SHUFFLE_MAX_TICKS - PID_SHUFFLE_MIN_TICKS;
    const delay = PID_SHUFFLE_MIN_TICKS + this.rng.nextInt(range);
    this.nextShuffleTick = currentTick + delay;
  }

  /**
   * Get stats for debugging
   */
  getStats(): {
    totalEntities: number;
    lastShuffleTick: number;
    nextShuffleTick: number;
  } {
    return {
      totalEntities: this.pids.size,
      lastShuffleTick: this.lastShuffleTick,
      nextShuffleTick: this.nextShuffleTick,
    };
  }

  /**
   * Clear all PIDs (for testing/reset)
   */
  clear(): void {
    this.pids.clear();
    this.nextPid = 0;
  }
}
```

#### Step 2: Integrate with CombatSystem

**File:** `packages/shared/src/systems/shared/combat/CombatSystem.ts`

Add PID-based attack ordering:

```typescript
// In CombatSystem constructor
private pidManager: PidManager;

constructor(world: World) {
  // ... existing code ...
  this.pidManager = new PidManager(getGameRng());
}

// In processCombatTick
processCombatTick(currentTick: number): void {
  // Update PID shuffle
  this.pidManager.update(currentTick);

  // Get all pending attacks and sort by PID
  const pendingAttacks = this.getPendingAttacks();
  const sortedAttacks = this.pidManager.sortByPid(pendingAttacks);

  // Process attacks in PID order
  for (const attack of sortedAttacks) {
    this.processAttack(attack, currentTick);
  }
}
```

#### Step 3: Hook into Player Join/Leave

**File:** `packages/server/src/systems/ServerNetwork/index.ts`

```typescript
// On player join
handlePlayerJoin(playerId: EntityID, currentTick: number): void {
  // ... existing code ...
  combatSystem.pidManager.assignPid(playerId, currentTick);
}

// On player leave
handlePlayerLeave(playerId: EntityID): void {
  // ... existing code ...
  combatSystem.pidManager.removePid(playerId);
}
```

#### Step 4: Add Unit Tests

**File:** `packages/shared/src/systems/shared/combat/__tests__/PidManager.test.ts`

```typescript
describe("PidManager", () => {
  it("assigns sequential PIDs to new entities", () => {
    const manager = new PidManager(mockRng);
    expect(manager.assignPid("player1", 0)).toBe(0);
    expect(manager.assignPid("player2", 0)).toBe(1);
  });

  it("maintains PID priority order", () => {
    const manager = new PidManager(mockRng);
    manager.assignPid("player1", 0); // PID 0
    manager.assignPid("player2", 0); // PID 1
    expect(manager.comparePriority("player1", "player2")).toBeLessThan(0);
  });

  it("shuffles PIDs after interval", () => {
    const manager = new PidManager(mockRng);
    manager.assignPid("player1", 0);
    manager.assignPid("player2", 0);

    const originalPid1 = manager.getPid("player1");
    manager.update(300); // After shuffle interval

    // PIDs should be different after shuffle (probabilistically)
  });

  it("removes PID on entity leave", () => {
    const manager = new PidManager(mockRng);
    manager.assignPid("player1", 0);
    manager.removePid("player1");
    expect(manager.getPid("player1")).toBeUndefined();
  });
});
```

### Files to Modify

| File | Changes |
|------|---------|
| `packages/shared/src/systems/shared/combat/PidManager.ts` | **NEW** - PID management |
| `packages/shared/src/systems/shared/combat/CombatSystem.ts` | Add PID integration |
| `packages/server/src/systems/ServerNetwork/index.ts` | Hook player join/leave |
| `packages/shared/src/index.ts` | Export PidManager |

---

## 2. AIStateContext Interface Splitting

### Priority: 🟢 Low
### Complexity: Low
### Estimated Files: 2

### Background

The current `AIStateContext` interface has 25+ methods, violating the Interface Segregation Principle (ISP). Not all AI states need all methods.

### Current State

**File:** `packages/shared/src/entities/managers/AIStateMachine.ts`

```typescript
export interface AIStateContext {
  // Movement methods (7)
  getPosition(): Position3D;
  requestMoveTo(target: Position3D, tilesPerTick?: number): void;
  isAtDestination(): boolean;
  tryStepOutCardinal(): boolean;
  isWalkable(tile: TileCoord): boolean;
  getHomePosition(): Position3D;
  getLeashRadius(): number;

  // Targeting methods (6)
  findNearbyPlayer(): string | null;
  getPlayer(playerId: string): PlayerEntity | null;
  getCurrentTarget(): string | null;
  setCurrentTarget(targetId: string | null): void;
  getAggroManager(): AggroManager;
  hasValidTarget(): boolean;

  // Combat methods (5)
  canAttack(currentTick: number): boolean;
  performAttack(targetId: string, currentTick: number): void;
  getCombatRange(): number;
  getCombatStateManager(): CombatStateManager;
  onEnterCombatRange(currentTick: number): void;

  // State methods (4)
  getCurrentTick(): number;
  isDead(): boolean;
  isRespawning(): boolean;
  getConfig(): MobConfig;

  // Wander methods (3)
  pickRandomWanderTile(): TileCoord | null;
  getWanderRadius(): number;
  getWanderCooldownTicks(): number;
}
```

### Implementation

#### Step 1: Define Segregated Interfaces

**File:** `packages/shared/src/entities/managers/AIStateContext.ts` (NEW)

```typescript
/**
 * AIStateContext - Segregated interfaces for AI state machine
 *
 * Follows Interface Segregation Principle (ISP):
 * Each state only depends on the methods it actually uses.
 */

import type { Position3D } from "../../types/core/base-types";
import type { TileCoord } from "../../systems/shared/movement/TileSystem";
import type { PlayerEntity } from "../player/PlayerEntity";
import type { AggroManager } from "./AggroManager";
import type { CombatStateManager } from "./CombatStateManager";
import type { MobConfig } from "../../types/entities/mobs";

/**
 * Core context - required by all states
 */
export interface AIStateCoreContext {
  getCurrentTick(): number;
  isDead(): boolean;
  isRespawning(): boolean;
  getConfig(): MobConfig;
  getPosition(): Position3D;
}

/**
 * Movement context - for states that involve movement
 */
export interface AIStateMovementContext {
  requestMoveTo(target: Position3D, tilesPerTick?: number): void;
  isAtDestination(): boolean;
  tryStepOutCardinal(): boolean;
  isWalkable(tile: TileCoord): boolean;
  getHomePosition(): Position3D;
  getLeashRadius(): number;
}

/**
 * Targeting context - for states that involve target selection
 */
export interface AIStateTargetingContext {
  findNearbyPlayer(): string | null;
  getPlayer(playerId: string): PlayerEntity | null;
  getCurrentTarget(): string | null;
  setCurrentTarget(targetId: string | null): void;
  getAggroManager(): AggroManager;
  hasValidTarget(): boolean;
}

/**
 * Combat context - for states that involve combat
 */
export interface AIStateCombatContext {
  canAttack(currentTick: number): boolean;
  performAttack(targetId: string, currentTick: number): void;
  getCombatRange(): number;
  getCombatStateManager(): CombatStateManager;
  onEnterCombatRange(currentTick: number): void;
}

/**
 * Wander context - for idle/wander states
 */
export interface AIStateWanderContext {
  pickRandomWanderTile(): TileCoord | null;
  getWanderRadius(): number;
  getWanderCooldownTicks(): number;
}

/**
 * Full context - combines all for backwards compatibility
 */
export interface AIStateContext
  extends AIStateCoreContext,
    AIStateMovementContext,
    AIStateTargetingContext,
    AIStateCombatContext,
    AIStateWanderContext {}

/**
 * State-specific context types
 * Each state only receives the interfaces it needs
 */
export type IdleStateContext = AIStateCoreContext &
  AIStateTargetingContext &
  AIStateWanderContext;

export type WanderStateContext = AIStateCoreContext &
  AIStateMovementContext &
  AIStateWanderContext;

export type ChaseStateContext = AIStateCoreContext &
  AIStateMovementContext &
  AIStateTargetingContext &
  AIStateCombatContext;

export type AttackStateContext = AIStateCoreContext &
  AIStateMovementContext &
  AIStateTargetingContext &
  AIStateCombatContext;

export type ReturnStateContext = AIStateCoreContext &
  AIStateMovementContext;

export type DeadStateContext = AIStateCoreContext;
```

#### Step 2: Update State Classes

**File:** `packages/shared/src/entities/managers/AIStateMachine.ts`

```typescript
import type {
  AIStateContext,
  IdleStateContext,
  WanderStateContext,
  ChaseStateContext,
  AttackStateContext,
  ReturnStateContext,
  DeadStateContext,
} from "./AIStateContext";

/**
 * Base state interface with generic context type
 */
interface AIState<TContext extends AIStateCoreContext = AIStateContext> {
  readonly name: MobAIState;
  enter(context: TContext): void;
  update(context: TContext): MobAIState | null;
  exit(context: TContext): void;
}

/**
 * Idle state - only needs core + targeting + wander
 */
class IdleState implements AIState<IdleStateContext> {
  readonly name = MobAIState.IDLE;

  enter(context: IdleStateContext): void { /* ... */ }
  update(context: IdleStateContext): MobAIState | null { /* ... */ }
  exit(context: IdleStateContext): void { /* ... */ }
}

/**
 * Attack state - needs core + movement + targeting + combat
 */
class AttackState implements AIState<AttackStateContext> {
  readonly name = MobAIState.ATTACK;

  enter(context: AttackStateContext): void { /* ... */ }
  update(context: AttackStateContext): MobAIState | null { /* ... */ }
  exit(context: AttackStateContext): void { /* ... */ }
}

// ... similar updates for other states
```

#### Step 3: Update MobEntity Context Creation

The MobEntity already implements all methods, so no changes needed there. The context object it creates satisfies all interfaces.

### Files to Modify

| File | Changes |
|------|---------|
| `packages/shared/src/entities/managers/AIStateContext.ts` | **NEW** - Segregated interfaces |
| `packages/shared/src/entities/managers/AIStateMachine.ts` | Import new types, update state generics |
| `packages/shared/src/index.ts` | Export new interfaces |

### Benefits

1. **Type Safety**: Each state only accesses methods it actually uses
2. **Documentation**: Interface names document state requirements
3. **Testing**: Easier to mock - only mock needed methods
4. **Maintenance**: Changes to combat methods don't affect wander state, etc.

---

## 3. Type Guard Replacements

### Priority: 🟢 Low
### Complexity: Low
### Estimated Files: 5-6

### Background

Several files use `as unknown as` casts for duck-typing, which bypasses TypeScript's type safety. Type guards provide runtime validation with type narrowing.

### Current Locations

```typescript
// MobDamageHandler.ts:94
const mobEntity = targetEntity as unknown as {
  aiStateMachine?: { onReceiveDamage?: (attackerId: string, damage: number) => void };
};

// MobEntity.ts:1412
const terrain = this.world.getSystem?.("terrain") as unknown as {
  isPositionWalkable?: (x: number, z: number) => { walkable: boolean };
};

// PlayerDamageHandler.ts
const playerEntity = targetEntity as unknown as {
  combatStateManager?: PlayerCombatStateManager;
};
```

### Implementation

#### Step 1: Create Type Guard Utilities

**File:** `packages/shared/src/utils/typeGuards.ts`

```typescript
/**
 * Type Guards - Runtime type validation with type narrowing
 *
 * Replaces unsafe `as unknown as` casts with validated type checks.
 * Each guard returns a type predicate for TypeScript narrowing.
 */

// ============ Entity Type Guards ============

/**
 * Check if entity has AI state machine with damage handler
 */
export interface EntityWithAIDamageHandler {
  aiStateMachine: {
    onReceiveDamage: (attackerId: string, damage: number) => void;
  };
}

export function hasAIDamageHandler(
  entity: unknown
): entity is EntityWithAIDamageHandler {
  if (!entity || typeof entity !== "object") return false;

  const e = entity as Record<string, unknown>;
  if (!e.aiStateMachine || typeof e.aiStateMachine !== "object") return false;

  const ai = e.aiStateMachine as Record<string, unknown>;
  return typeof ai.onReceiveDamage === "function";
}

/**
 * Check if entity has player combat state manager
 */
export interface EntityWithPlayerCombat {
  combatStateManager: {
    onReceiveAttack: (attackerId: string, currentTick: number) => void;
    isAutoRetaliateEnabled: () => boolean;
    getTargetId: () => string | null;
  };
}

export function hasPlayerCombatManager(
  entity: unknown
): entity is EntityWithPlayerCombat {
  if (!entity || typeof entity !== "object") return false;

  const e = entity as Record<string, unknown>;
  if (!e.combatStateManager || typeof e.combatStateManager !== "object") return false;

  const csm = e.combatStateManager as Record<string, unknown>;
  return (
    typeof csm.onReceiveAttack === "function" &&
    typeof csm.isAutoRetaliateEnabled === "function" &&
    typeof csm.getTargetId === "function"
  );
}

/**
 * Check if entity has death state manager
 */
export interface EntityWithDeathState {
  deathStateManager: {
    isDead: () => boolean;
    die: (killerId: string) => void;
  };
}

export function hasDeathStateManager(
  entity: unknown
): entity is EntityWithDeathState {
  if (!entity || typeof entity !== "object") return false;

  const e = entity as Record<string, unknown>;
  if (!e.deathStateManager || typeof e.deathStateManager !== "object") return false;

  const dsm = e.deathStateManager as Record<string, unknown>;
  return (
    typeof dsm.isDead === "function" &&
    typeof dsm.die === "function"
  );
}

// ============ System Type Guards ============

/**
 * Check if system has terrain walkability check
 */
export interface TerrainSystemLike {
  isPositionWalkable: (x: number, z: number) => { walkable: boolean };
}

export function isTerrainSystem(
  system: unknown
): system is TerrainSystemLike {
  if (!system || typeof system !== "object") return false;

  const s = system as Record<string, unknown>;
  return typeof s.isPositionWalkable === "function";
}

/**
 * Check if system has mob retrieval
 */
export interface MobSystemLike {
  getMob: (id: string) => unknown;
}

export function isMobSystem(
  system: unknown
): system is MobSystemLike {
  if (!system || typeof system !== "object") return false;

  const s = system as Record<string, unknown>;
  return typeof s.getMob === "function";
}

/**
 * Check if system has equipment retrieval
 */
export interface EquipmentSystemLike {
  getPlayerEquipment: (playerId: string) => {
    weapon?: { item?: { weaponType?: string; id?: string } };
  };
}

export function isEquipmentSystem(
  system: unknown
): system is EquipmentSystemLike {
  if (!system || typeof system !== "object") return false;

  const s = system as Record<string, unknown>;
  return typeof s.getPlayerEquipment === "function";
}

// ============ Entity Property Guards ============

/**
 * Check if entity has setServerEmote method (for mobs)
 */
export interface EntityWithServerEmote {
  setServerEmote: (emote: string) => void;
}

export function hasServerEmote(
  entity: unknown
): entity is EntityWithServerEmote {
  if (!entity || typeof entity !== "object") return false;

  const e = entity as Record<string, unknown>;
  return typeof e.setServerEmote === "function";
}

/**
 * Check if entity has network dirty marking
 */
export interface EntityWithNetworkDirty {
  markNetworkDirty: () => void;
}

export function hasNetworkDirty(
  entity: unknown
): entity is EntityWithNetworkDirty {
  if (!entity || typeof entity !== "object") return false;

  const e = entity as Record<string, unknown>;
  return typeof e.markNetworkDirty === "function";
}
```

#### Step 2: Replace Casts in MobDamageHandler

**File:** `packages/shared/src/systems/shared/combat/handlers/MobDamageHandler.ts`

```typescript
// Before
const mobEntity = targetEntity as unknown as {
  aiStateMachine?: { onReceiveDamage?: (attackerId: string, damage: number) => void };
};
if (mobEntity.aiStateMachine?.onReceiveDamage) {
  mobEntity.aiStateMachine.onReceiveDamage(attackerId, damage);
}

// After
import { hasAIDamageHandler } from "../../../../utils/typeGuards";

if (hasAIDamageHandler(targetEntity)) {
  targetEntity.aiStateMachine.onReceiveDamage(attackerId, damage);
}
```

#### Step 3: Replace Casts in MobEntity

**File:** `packages/shared/src/entities/npc/MobEntity.ts`

```typescript
// Before
const terrain = this.world.getSystem?.("terrain") as unknown as {
  isPositionWalkable?: (x: number, z: number) => { walkable: boolean };
};
if (typeof terrain?.isPositionWalkable === "function") {
  const result = terrain.isPositionWalkable(worldPos.x, worldPos.z);
  return result.walkable;
}

// After
import { isTerrainSystem } from "../../utils/typeGuards";

const terrain = this.world.getSystem?.("terrain");
if (isTerrainSystem(terrain)) {
  const result = terrain.isPositionWalkable(worldPos.x, worldPos.z);
  return result.walkable;
}
```

#### Step 4: Replace Casts in PlayerDamageHandler

**File:** `packages/shared/src/systems/shared/combat/handlers/PlayerDamageHandler.ts`

```typescript
// Before
const playerEntity = targetEntity as unknown as {
  combatStateManager?: PlayerCombatStateManager;
};
if (playerEntity.combatStateManager) {
  playerEntity.combatStateManager.onReceiveAttack(attackerId, currentTick);
}

// After
import { hasPlayerCombatManager } from "../../../../utils/typeGuards";

if (hasPlayerCombatManager(targetEntity)) {
  targetEntity.combatStateManager.onReceiveAttack(attackerId, currentTick);
}
```

#### Step 5: Replace Casts in CombatAnimationManager

**File:** `packages/shared/src/systems/shared/combat/CombatAnimationManager.ts`

```typescript
// Before
const mobEntity = this.world.entities.get(entityId) as
  | AnimatableMobEntity
  | undefined;
if (mobEntity?.setServerEmote) {
  mobEntity.setServerEmote(Emotes.COMBAT);
}

// After
import { hasServerEmote } from "../../../utils/typeGuards";

const mobEntity = this.world.entities.get(entityId);
if (hasServerEmote(mobEntity)) {
  mobEntity.setServerEmote(Emotes.COMBAT);
}
```

#### Step 6: Add Unit Tests

**File:** `packages/shared/src/utils/__tests__/typeGuards.test.ts`

```typescript
import {
  hasAIDamageHandler,
  hasPlayerCombatManager,
  isTerrainSystem,
  isMobSystem,
  hasServerEmote,
} from "../typeGuards";

describe("Type Guards", () => {
  describe("hasAIDamageHandler", () => {
    it("returns true for entity with AI damage handler", () => {
      const entity = {
        aiStateMachine: {
          onReceiveDamage: jest.fn(),
        },
      };
      expect(hasAIDamageHandler(entity)).toBe(true);
    });

    it("returns false for null", () => {
      expect(hasAIDamageHandler(null)).toBe(false);
    });

    it("returns false for entity without aiStateMachine", () => {
      expect(hasAIDamageHandler({})).toBe(false);
    });

    it("returns false for entity with incomplete aiStateMachine", () => {
      const entity = { aiStateMachine: {} };
      expect(hasAIDamageHandler(entity)).toBe(false);
    });
  });

  describe("isTerrainSystem", () => {
    it("returns true for valid terrain system", () => {
      const system = {
        isPositionWalkable: jest.fn().mockReturnValue({ walkable: true }),
      };
      expect(isTerrainSystem(system)).toBe(true);
    });

    it("returns false for system without isPositionWalkable", () => {
      expect(isTerrainSystem({})).toBe(false);
    });
  });

  describe("hasServerEmote", () => {
    it("returns true for entity with setServerEmote", () => {
      const entity = { setServerEmote: jest.fn() };
      expect(hasServerEmote(entity)).toBe(true);
    });

    it("returns false for entity without setServerEmote", () => {
      expect(hasServerEmote({})).toBe(false);
    });
  });
});
```

### Files to Modify

| File | Changes |
|------|---------|
| `packages/shared/src/utils/typeGuards.ts` | **NEW** - Type guard functions |
| `packages/shared/src/systems/shared/combat/handlers/MobDamageHandler.ts` | Replace casts |
| `packages/shared/src/systems/shared/combat/handlers/PlayerDamageHandler.ts` | Replace casts |
| `packages/shared/src/entities/npc/MobEntity.ts` | Replace casts |
| `packages/shared/src/systems/shared/combat/CombatAnimationManager.ts` | Replace casts |
| `packages/shared/src/index.ts` | Export type guards |

### Benefits

1. **Runtime Safety**: Guards validate at runtime, catching bugs
2. **Type Safety**: TypeScript narrows types after guard
3. **Debugging**: Guards can log when types don't match
4. **Testability**: Guards are unit-testable
5. **Reusability**: Same guards used across codebase

---

## Implementation Order

Recommended order of implementation:

1. **Type Guards** (Lowest risk, immediate type safety improvement)
2. **AIStateContext Splitting** (Refactor, no behavior change)
3. **PID System** (New feature, needs testing)

---

## Testing Checklist

- [ ] PID shuffle randomization verified
- [ ] PID priority ordering works in PvP
- [ ] All AI states compile with new context types
- [ ] Type guards pass all unit tests
- [ ] No runtime regressions in combat flow
- [ ] Performance benchmarks unchanged

---

## Commit Messages

```
feat(combat): add OSRS-style PID shuffle system for PvP fairness

refactor(ai): split AIStateContext into segregated interfaces (ISP)

refactor(types): replace unsafe casts with type guard functions
```
