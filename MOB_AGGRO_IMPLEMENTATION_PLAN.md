# Mob Aggro System - Production Implementation Plan

## Overview

This document outlines a comprehensive implementation plan for refactoring the mob aggro, pathfinding, and combat systems to achieve OSRS-authentic behavior while meeting AAA game studio production standards.

**Target Rating:** 9/10 Production Readiness

**Based On:** MOB_AGGRO_RESEARCH.md (Revision 3, December 2024)

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Architecture Overview](#architecture-overview)
3. [Phase 1: Critical Bug Fixes](#phase-1-critical-bug-fixes)
4. [Phase 2: Core System Refactoring](#phase-2-core-system-refactoring)
5. [Phase 3: OSRS Mechanics Implementation](#phase-3-osrs-mechanics-implementation)
6. [Phase 4: Performance & Memory Optimization](#phase-4-performance--memory-optimization)
7. [Phase 5: Testing & Validation](#phase-5-testing--validation)
8. [Code Quality Standards](#code-quality-standards)
9. [Security Considerations](#security-considerations)
10. [Acceptance Criteria](#acceptance-criteria)

---

## Executive Summary

### Current State Issues

| Category | Issues Found | Severity |
|----------|-------------|----------|
| Critical Bugs | 4 | HIGH |
| OSRS Compliance Gaps | 12 | MEDIUM |
| Architecture Issues | 6 | MEDIUM |
| Missing Features | 4 | LOW |

### Goals

1. Fix all critical bugs affecting combat behavior
2. Achieve 95%+ OSRS behavior compliance for core mechanics
3. Meet AAA game studio code quality standards
4. Zero allocations in hot paths (60fps safe)
5. Full server authority with client prediction
6. Comprehensive test coverage (>80%)

---

## Architecture Overview

### Target Architecture (SOLID-Compliant)

```
┌─────────────────────────────────────────────────────────────────┐
│                        SERVER (Authoritative)                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────┐    ┌──────────────────┐                   │
│  │   TickScheduler  │───▶│  NPCTickProcessor │                   │
│  │   (600ms ticks)  │    │  (processes NPCs) │                   │
│  └──────────────────┘    └────────┬─────────┘                   │
│                                   │                              │
│           ┌───────────────────────┼───────────────────────┐     │
│           ▼                       ▼                       ▼     │
│  ┌────────────────┐    ┌────────────────┐    ┌────────────────┐ │
│  │ IAggroStrategy │    │ IPathStrategy  │    │ICombatStrategy │ │
│  │ (DIP)          │    │ (DIP)          │    │(DIP)           │ │
│  └───────┬────────┘    └───────┬────────┘    └───────┬────────┘ │
│          │                     │                     │          │
│          ▼                     ▼                     ▼          │
│  ┌────────────────┐    ┌────────────────┐    ┌────────────────┐ │
│  │HuntRangeChecker│    │DumbPathFinder  │    │MeleeRangeCheck │ │
│  │AttackRangeCheck│    │CornerCutCheck  │    │RetaliationCalc │ │
│  │TargetSelector  │    │PathPersistence │    │DamageCalculator│ │
│  └────────────────┘    └────────────────┘    └────────────────┘ │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Key Design Principles

1. **Single Responsibility (SRP):** Each class has one reason to change
2. **Open/Closed (OCP):** Extend via interfaces, not modification
3. **Dependency Inversion (DIP):** Depend on abstractions, not concretions
4. **Server Authority:** All game state decisions on server
5. **Tick Alignment:** All NPC logic runs on 600ms tick boundaries

---

## Phase 1: Critical Bug Fixes

**Priority:** IMMEDIATE
**Estimated Effort:** 1-2 days
**Risk:** HIGH if not fixed

### 1.1 Fix Melee Range Diagonal Bug

**File:** `packages/shared/src/utils/game/CombatCalculations.ts`
**Line:** 206

**Current (Buggy):**
```typescript
if (attackType === AttackType.MELEE) {
  const attackerTile = worldToTile(attackerPos.x, attackerPos.z);
  const targetTile = worldToTile(targetPos.x, targetPos.z);
  return tilesAdjacent(attackerTile, targetTile); // BUG: Includes diagonals!
}
```

**Fixed:**
```typescript
import { tilesWithinMeleeRange, worldToTile } from '../../systems/shared/movement/TileSystem';

export function isInAttackRange(
  attackerPos: Readonly<Position3D>,
  targetPos: Readonly<Position3D>,
  attackType: AttackType,
  meleeRange: number = COMBAT_CONSTANTS.MELEE_RANGE_STANDARD,
): boolean {
  if (attackType === AttackType.MELEE) {
    const attackerTile = worldToTile(attackerPos.x, attackerPos.z);
    const targetTile = worldToTile(targetPos.x, targetPos.z);
    // OSRS: Range 1 melee excludes diagonals (plus shape only)
    return tilesWithinMeleeRange(attackerTile, targetTile, meleeRange);
  }

  // Ranged uses Chebyshev distance
  const distance = calculateChebyshevDistance(attackerPos, targetPos);
  return distance <= COMBAT_CONSTANTS.RANGED_RANGE && distance > 0;
}
```

**Acceptance Criteria:**
- [ ] Unit test: Diagonal tiles return `false` for melee range 1
- [ ] Unit test: Cardinal tiles return `true` for melee range 1
- [ ] Unit test: Diagonal tiles return `true` for melee range 2+ (halberd)
- [ ] Integration test: Player cannot melee attack from diagonal position

---

### 1.2 Fix AggroSystem Tick Alignment

**File:** `packages/shared/src/systems/shared/combat/AggroSystem.ts`
**Line:** 144

**Current (Buggy):**
```typescript
this.createInterval(() => {
  this.updateMobAI();
}, 500); // Wrong! Not tick-aligned
```

**Fixed:**
```typescript
import { TICK_DURATION_MS } from '../../movement/TileSystem';

// In start() method:
this.createInterval(() => {
  this.updateMobAI();
}, TICK_DURATION_MS); // 600ms - tick-aligned
```

**Acceptance Criteria:**
- [ ] AggroSystem updates run exactly every 600ms
- [ ] Mob behavior is synchronized with server tick

---

### 1.3 Fix Distance Calculation Type

**File:** `packages/shared/src/entities/managers/AggroManager.ts`

**Current (Buggy):**
```typescript
// Uses Euclidean 3D distance
const distance = calculateDistance(mobState.currentPosition, playerPosition);
```

**Fixed:**
```typescript
import { worldToTile, chebyshevTileDistance } from '../../systems/shared/movement/TileSystem';

// Use tile-based Chebyshev distance (OSRS-accurate)
private calculateAggroDistance(
  mobPos: Readonly<Position3D>,
  playerPos: Readonly<Position3D>,
): number {
  const mobTile = worldToTile(mobPos.x, mobPos.z);
  const playerTile = worldToTile(playerPos.x, playerPos.z);
  return chebyshevTileDistance(mobTile, playerTile);
}
```

**New Function in TileSystem.ts:**
```typescript
/**
 * Calculate Chebyshev distance between two tiles (OSRS distance metric)
 * @returns Distance in tiles
 */
export function chebyshevTileDistance(a: TileCoord, b: TileCoord): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.z - b.z));
}
```

**Acceptance Criteria:**
- [ ] All aggro range checks use tile-based distance
- [ ] Unit test: Distance matches OSRS wiki examples
- [ ] Mobs aggro at correct tile distances

---

### 1.4 Fix Corner-Cutting Check

**File:** `packages/shared/src/systems/shared/movement/ChasePathfinding.ts`

**Current (Buggy):**
```typescript
// Only checks if destination is walkable
if (dx !== 0 && dz !== 0) {
  candidates.push({ x: current.x + dx, z: current.z + dz });
}
```

**Fixed:**
```typescript
/**
 * Check if diagonal movement is allowed (OSRS corner-cutting rule)
 * Diagonal movement requires BOTH adjacent cardinal tiles to be traversable.
 *
 * @see https://oldschool.runescape.wiki/w/Pathfinding
 */
private canMoveDiagonally(
  current: TileCoord,
  dx: number,
  dz: number,
  isWalkable: (tile: TileCoord) => boolean,
): boolean {
  // Check the two cardinal tiles that comprise the diagonal
  const cardinalX: TileCoord = { x: current.x + dx, z: current.z };
  const cardinalZ: TileCoord = { x: current.x, z: current.z + dz };
  const diagonal: TileCoord = { x: current.x + dx, z: current.z + dz };

  // All three tiles must be walkable for diagonal movement
  return isWalkable(cardinalX) && isWalkable(cardinalZ) && isWalkable(diagonal);
}

// In chaseStep():
if (dx !== 0 && dz !== 0) {
  // OSRS: Diagonal only if both adjacent cardinals are walkable
  if (this.canMoveDiagonally(current, dx, dz, isWalkable)) {
    candidates.push({ x: current.x + dx, z: current.z + dz });
  }
}
```

**Acceptance Criteria:**
- [ ] Unit test: Cannot move diagonally through L-shaped obstacle
- [ ] Unit test: Can move diagonally in open space
- [ ] Integration test: Safespots work correctly

---

## Phase 2: Core System Refactoring

**Priority:** HIGH
**Estimated Effort:** 3-5 days
**Risk:** MEDIUM

### 2.1 Create Unified Tick Processor

**New File:** `packages/shared/src/systems/shared/tick/NPCTickProcessor.ts`

**Purpose:** Single entry point for all NPC tick processing, ensuring correct order.

```typescript
/**
 * NPCTickProcessor - Processes all NPC logic in OSRS-accurate order
 *
 * OSRS Processing Order (per tick):
 * 1. NPC timers execute
 * 2. NPC queues process
 * 3. NPC movement
 * 4. NPC combat
 * 5. Player timers execute
 * 6. Player queues process
 *
 * @see https://osrs-docs.com/docs/mechanics/timers/
 */
export class NPCTickProcessor {
  // Pre-allocated arrays for zero-allocation iteration
  private readonly _npcBuffer: MobEntity[] = [];
  private readonly _targetBuffer: PlayerEntity[] = [];

  constructor(
    private readonly aggroStrategy: IAggroStrategy,
    private readonly pathStrategy: IPathStrategy,
    private readonly combatStrategy: ICombatStrategy,
  ) {}

  /**
   * Process all NPCs for current tick
   * Called exactly once per 600ms server tick
   */
  processTick(npcs: ReadonlyMap<string, MobEntity>, currentTick: number): void {
    // Clear and populate buffer (no allocation)
    this._npcBuffer.length = 0;
    for (const npc of npcs.values()) {
      if (!npc.isDead()) {
        this._npcBuffer.push(npc);
      }
    }

    // Process in spawn order (by NPC ID for determinism)
    this._npcBuffer.sort((a, b) => a.spawnOrder - b.spawnOrder);

    for (const npc of this._npcBuffer) {
      this.processNPC(npc, currentTick);
    }
  }

  private processNPC(npc: MobEntity, currentTick: number): void {
    // 1. Update timers
    npc.updateTimers(currentTick);

    // 2. Process queues (if any)
    npc.processQueues(currentTick);

    // 3. Aggro check and target selection
    const target = this.aggroStrategy.findTarget(npc, this._targetBuffer);

    // 4. Movement (if has target or wandering)
    if (target || npc.shouldWander(currentTick)) {
      this.pathStrategy.calculateNextStep(npc, target);
    }

    // 5. Combat (if in range)
    if (target && this.combatStrategy.isInRange(npc, target)) {
      this.combatStrategy.processAttack(npc, target, currentTick);
    }
  }
}
```

**Interfaces (DIP):**

```typescript
// packages/shared/src/types/systems/npc-strategies.ts

export interface IAggroStrategy {
  findTarget(npc: MobEntity, buffer: PlayerEntity[]): PlayerEntity | null;
  shouldAggro(npc: MobEntity, player: PlayerEntity): boolean;
}

export interface IPathStrategy {
  calculateNextStep(npc: MobEntity, target: Entity | null): TileCoord | null;
  isBlocked(npc: MobEntity): boolean;
}

export interface ICombatStrategy {
  isInRange(attacker: Entity, target: Entity): boolean;
  processAttack(attacker: MobEntity, target: Entity, tick: number): void;
  calculateDamage(attacker: Entity, target: Entity): DamageResult;
}
```

**Acceptance Criteria:**
- [ ] All NPC processing goes through NPCTickProcessor
- [ ] Processing order matches OSRS documentation
- [ ] Zero allocations in processTick() hot path
- [ ] Unit tests for processing order

---

### 2.2 Implement Three Range Types

**New File:** `packages/shared/src/systems/shared/combat/RangeSystem.ts`

```typescript
/**
 * RangeSystem - OSRS-accurate range calculations
 *
 * OSRS has THREE distinct range types:
 * 1. Hunt Range: Where NPC searches for targets (origin: SW tile)
 * 2. Attack Range: Where NPC can perform attacks (origin: ALL occupied tiles)
 * 3. Max Range: Maximum distance from spawn (origin: spawn point)
 *
 * @see https://oldschool.runescape.wiki/w/Aggressiveness
 */
export class RangeSystem {
  // Pre-allocated for zero-GC range checks
  private readonly _tileBuffer: TileCoord = { x: 0, z: 0 };
  private readonly _occupiedTiles: TileCoord[] = [];

  /**
   * Check if player is within hunt range (NPC initiates aggro)
   * Origin: SW tile of NPC
   */
  isInHuntRange(
    npc: Readonly<NPCData>,
    playerTile: Readonly<TileCoord>,
  ): boolean {
    // Hunt range originates from SW tile only
    const npcSWTile = this.getSWTile(npc);
    const distance = chebyshevTileDistance(npcSWTile, playerTile);
    return distance <= npc.huntRange;
  }

  /**
   * Check if player is within attack range (NPC can attack)
   * Origin: ALL tiles occupied by NPC
   */
  isInAttackRange(
    npc: Readonly<NPCData>,
    playerTile: Readonly<TileCoord>,
    attackType: AttackType,
  ): boolean {
    // Get all tiles NPC occupies
    this.getOccupiedTiles(npc, this._occupiedTiles);

    // Player must be in range of ANY occupied tile
    for (const npcTile of this._occupiedTiles) {
      if (this.checkAttackRange(npcTile, playerTile, attackType, npc.attackRange)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Check if NPC is within max range from spawn
   * Used for leashing
   */
  isWithinMaxRange(
    npc: Readonly<NPCData>,
    spawnPoint: Readonly<TileCoord>,
  ): boolean {
    const npcSWTile = this.getSWTile(npc);
    const distance = chebyshevTileDistance(npcSWTile, spawnPoint);
    return distance <= npc.maxRange;
  }

  /**
   * Get SW tile for NPC (true position for calculations)
   */
  private getSWTile(npc: Readonly<NPCData>): TileCoord {
    this._tileBuffer.x = Math.floor(npc.position.x / TILE_SIZE);
    this._tileBuffer.z = Math.floor(npc.position.z / TILE_SIZE);
    return this._tileBuffer;
  }

  /**
   * Get all tiles occupied by NPC
   * Size 1 = 1 tile, Size 2 = 4 tiles (2x2), etc.
   */
  private getOccupiedTiles(npc: Readonly<NPCData>, buffer: TileCoord[]): void {
    buffer.length = 0;
    const swTile = this.getSWTile(npc);
    const size = npc.size || 1;

    for (let dx = 0; dx < size; dx++) {
      for (let dz = 0; dz < size; dz++) {
        buffer.push({ x: swTile.x + dx, z: swTile.z + dz });
      }
    }
  }

  /**
   * Check attack range from a single tile
   */
  private checkAttackRange(
    attackerTile: TileCoord,
    targetTile: TileCoord,
    attackType: AttackType,
    range: number,
  ): boolean {
    if (attackType === AttackType.MELEE) {
      return tilesWithinMeleeRange(attackerTile, targetTile, range);
    }
    const distance = chebyshevTileDistance(attackerTile, targetTile);
    return distance <= range && distance > 0;
  }
}
```

**Acceptance Criteria:**
- [ ] Hunt range uses SW tile only
- [ ] Attack range checks ALL occupied tiles
- [ ] Max range uses spawn point
- [ ] Unit tests for all three range types
- [ ] Works with 1x1, 2x2, and 3x3 NPCs

---

### 2.3 Implement Random Target Selection

**File:** `packages/shared/src/entities/managers/AggroManager.ts`

```typescript
/**
 * Select random target from valid candidates (OSRS-accurate)
 *
 * OSRS selects targets randomly among all valid candidates,
 * NOT by priority or first-found.
 *
 * @see Mod Ash Twitter confirmation
 */
selectTarget(candidates: ReadonlyArray<PlayerEntity>): PlayerEntity | null {
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  // Random selection (uniform distribution)
  const index = Math.floor(Math.random() * candidates.length);
  return candidates[index];
}

/**
 * Find all valid aggro targets (no allocation version)
 */
findValidTargets(
  npc: MobEntity,
  players: ReadonlyMap<string, PlayerEntity>,
  buffer: PlayerEntity[],
): void {
  buffer.length = 0;

  const npcTile = worldToTile(npc.position.x, npc.position.z);
  const huntRange = npc.huntRange;

  for (const player of players.values()) {
    // Skip invalid targets
    if (player.isDead()) continue;
    if (player.isLoading) continue;
    if (this.isPlayerTooHighLevel(npc, player)) continue;

    // Check hunt range (tile-based)
    const playerTile = worldToTile(player.position.x, player.position.z);
    const distance = chebyshevTileDistance(npcTile, playerTile);

    if (distance <= huntRange) {
      buffer.push(player);
    }
  }
}
```

**Acceptance Criteria:**
- [ ] Target selection is random, not first-found
- [ ] No allocations in findValidTargets()
- [ ] Respects level-based ignore rules
- [ ] Unit test verifies random distribution

---

### 2.4 Implement Path Persistence

**File:** `packages/server/src/systems/ServerNetwork/mob-tile-movement.ts`

```typescript
/**
 * MobTileMovementManager - OSRS-accurate NPC movement
 *
 * Key OSRS behaviors:
 * - Path persists when blocked by entities (retry next tick)
 * - Path clears only when blocked by terrain
 * - NPCs slide along obstacles
 */
export class MobTileMovementManager {
  // Per-NPC path state (no allocation per tick)
  private readonly _pathStates = new Map<string, PathState>();

  interface PathState {
    currentPath: TileCoord | null;
    blockedByEntity: boolean;
    ticksBlocked: number;
  }

  /**
   * Process movement for tick
   */
  processMovement(npc: MobEntity, targetTile: TileCoord | null): void {
    const state = this.getOrCreateState(npc.id);

    // If has target, update path
    if (targetTile) {
      state.currentPath = targetTile;
      state.blockedByEntity = false;
    }

    if (!state.currentPath) return;

    // Calculate next step
    const nextTile = this.pathfinder.chaseStep(
      npc.currentTile,
      state.currentPath,
      (tile) => this.isWalkable(tile, npc),
    );

    if (!nextTile) {
      // Check WHY blocked
      if (this.isBlockedByEntity(npc)) {
        // OSRS: Persist path, retry next tick
        state.blockedByEntity = true;
        state.ticksBlocked++;
        // Don't clear path!
      } else {
        // Blocked by terrain - clear path (safespotted)
        state.currentPath = null;
        state.blockedByEntity = false;
        state.ticksBlocked = 0;
      }
      return;
    }

    // Move to next tile
    this.moveToTile(npc, nextTile);
    state.blockedByEntity = false;
    state.ticksBlocked = 0;
  }

  private isBlockedByEntity(npc: MobEntity): boolean {
    // Check if next desired tile has another entity
    const desiredTile = this.pathfinder.getNextDesiredTile(npc);
    if (!desiredTile) return false;

    return this.entityCollisionSystem.hasSolidEntity(desiredTile, npc.id);
  }
}
```

**Acceptance Criteria:**
- [ ] Path persists when blocked by entities
- [ ] Path clears when blocked by terrain (safespotted)
- [ ] NPC resumes path when entity moves
- [ ] Unit tests for both cases

---

## Phase 3: OSRS Mechanics Implementation

**Priority:** MEDIUM
**Estimated Effort:** 5-7 days
**Risk:** MEDIUM

### 3.1 Implement Probabilistic Wandering

**Current:** Fixed 3-8 second idle duration
**OSRS:** ~26-30% chance per tick to start wandering

```typescript
/**
 * WanderBehavior - OSRS-accurate random walking
 *
 * OSRS: ~10/1000 chance per client tick (~26-30% per server tick)
 * to start a new wander path.
 */
export class WanderBehavior {
  // OSRS probability converted to server tick
  private static readonly WANDER_CHANCE_PER_TICK = 0.26; // ~26%
  private static readonly WANDER_RADIUS = 5; // tiles

  /**
   * Check if NPC should start wandering this tick
   */
  shouldStartWander(npc: MobEntity, currentTick: number): boolean {
    // Must be idle (no target, not in combat)
    if (npc.hasTarget()) return false;
    if (npc.isInCombat()) return false;
    if (npc.movementType === 'stationary') return false;

    // Already wandering
    if (npc.hasWanderPath()) return false;

    // Probabilistic check (OSRS-accurate)
    return Math.random() < WanderBehavior.WANDER_CHANCE_PER_TICK;
  }

  /**
   * Generate wander destination (OSRS-accurate)
   * Random offset -5 to +5 tiles on each axis from spawn
   */
  generateWanderTarget(npc: MobEntity): TileCoord {
    const spawnTile = npc.spawnTile;

    // OSRS: -5 to +5 offset from spawn
    const offsetX = Math.floor(Math.random() * 11) - 5;
    const offsetZ = Math.floor(Math.random() * 11) - 5;

    return {
      x: spawnTile.x + offsetX,
      z: spawnTile.z + offsetZ,
    };
  }
}
```

**Acceptance Criteria:**
- [ ] Wandering is probabilistic, not time-based
- [ ] ~26-30% chance per tick
- [ ] 5-tile radius from spawn
- [ ] Unit test verifies probability distribution

---

### 3.2 Implement Large NPC Support

**New File:** `packages/shared/src/entities/npc/LargeNPCSupport.ts`

```typescript
/**
 * LargeNPCSupport - Multi-tile NPC handling
 *
 * OSRS large NPCs:
 * - Occupy multiple tiles (2x2, 3x3, 4x4, etc.)
 * - SW tile is "true" position for most calculations
 * - Attack range originates from ALL occupied tiles
 * - Players can walk through occupied tiles (with entity collision)
 */
export interface NPCSize {
  width: number;  // tiles in X direction
  depth: number;  // tiles in Z direction
}

export const NPC_SIZES: Record<string, NPCSize> = {
  // 1x1 (default)
  'goblin': { width: 1, depth: 1 },
  'cow': { width: 1, depth: 1 },

  // 2x2
  'general_graardor': { width: 2, depth: 2 },
  'kril_tsutsaroth': { width: 2, depth: 2 },

  // 3x3
  'corporeal_beast': { width: 3, depth: 3 },
  'cerberus': { width: 3, depth: 3 },

  // 4x4
  'vorkath': { width: 4, depth: 4 },

  // 5x5
  'olm_head': { width: 5, depth: 5 },
};

/**
 * Calculate all tiles occupied by a large NPC
 */
export function getOccupiedTiles(
  swTile: TileCoord,
  size: NPCSize,
  buffer: TileCoord[],
): void {
  buffer.length = 0;

  for (let dx = 0; dx < size.width; dx++) {
    for (let dz = 0; dz < size.depth; dz++) {
      buffer.push({
        x: swTile.x + dx,
        z: swTile.z + dz,
      });
    }
  }
}

/**
 * Check if a tile is occupied by a large NPC
 */
export function isTileOccupied(
  tile: TileCoord,
  npcSWTile: TileCoord,
  size: NPCSize,
): boolean {
  return (
    tile.x >= npcSWTile.x &&
    tile.x < npcSWTile.x + size.width &&
    tile.z >= npcSWTile.z &&
    tile.z < npcSWTile.z + size.depth
  );
}
```

**MobEntity Updates:**

```typescript
// In MobEntity constructor
this.size = NPC_SIZES[config.mobType] || { width: 1, depth: 1 };

// Getter for occupied tiles (uses pre-allocated buffer)
private readonly _occupiedTilesBuffer: TileCoord[] = [];

getOccupiedTiles(): ReadonlyArray<TileCoord> {
  getOccupiedTiles(this.swTile, this.size, this._occupiedTilesBuffer);
  return this._occupiedTilesBuffer;
}
```

**Acceptance Criteria:**
- [ ] NPCs can be configured with different sizes
- [ ] SW tile used for pathfinding origin
- [ ] Attack range originates from all occupied tiles
- [ ] Entity collision respects all occupied tiles
- [ ] Unit tests for 1x1, 2x2, 3x3 NPCs

---

### 3.3 Implement First-Attack Timing

**Research Finding (MEDIUM Uncertainty):** Best estimate from research - when NPC initiates aggro, it attacks on the NEXT tick after entering combat range, not immediately.

**Note:** This is inferred from tick processing order documentation, not directly confirmed. May need in-game verification.

```typescript
/**
 * CombatStateManager - OSRS-accurate attack timing
 */
export class CombatStateManager {
  private _pendingFirstAttack: boolean = false;
  private _firstAttackTick: number = -1;

  /**
   * Called when NPC enters combat range with target
   */
  onEnterCombatRange(currentTick: number): void {
    if (!this._inCombat) {
      this._inCombat = true;
      // First attack happens NEXT tick (OSRS behavior)
      this._pendingFirstAttack = true;
      this._firstAttackTick = currentTick + 1;
    }
  }

  /**
   * Check if NPC can attack this tick
   */
  canAttack(currentTick: number): boolean {
    if (this._pendingFirstAttack) {
      if (currentTick >= this._firstAttackTick) {
        this._pendingFirstAttack = false;
        this._nextAttackTick = currentTick + this._attackSpeedTicks;
        return true;
      }
      return false;
    }

    return currentTick >= this._nextAttackTick;
  }
}
```

**Acceptance Criteria:**
- [ ] First attack is delayed by 1 tick after entering range
- [ ] Subsequent attacks follow normal attack speed
- [ ] Unit test verifies first-attack timing

---

## Phase 4: Performance & Memory Optimization

**Priority:** HIGH
**Estimated Effort:** 2-3 days
**Risk:** LOW

### 4.1 Zero-Allocation Hot Path Audit

**Goal:** No `new` keyword or array/object literals in update loops.

**Pre-Allocated Reusables Pattern:**

```typescript
/**
 * Example: NPCTickProcessor with zero allocations
 */
export class NPCTickProcessor {
  // Pre-allocated reusables (created once in constructor)
  private readonly _tempTile: TileCoord = { x: 0, z: 0 };
  private readonly _tempPosition: Position3D = { x: 0, y: 0, z: 0 };
  private readonly _candidateBuffer: PlayerEntity[] = [];
  private readonly _pathBuffer: TileCoord[] = [];
  private readonly _occupiedTilesBuffer: TileCoord[] = [];

  // Reusable THREE.js objects
  private readonly _tempVector3 = new THREE.Vector3();
  private readonly _tempQuaternion = new THREE.Quaternion();
  private readonly _tempMatrix4 = new THREE.Matrix4();

  processTick(): void {
    // Clear buffers (no allocation)
    this._candidateBuffer.length = 0;
    this._pathBuffer.length = 0;

    // All operations use pre-allocated objects
    this._tempTile.x = someValue;
    this._tempTile.z = someOtherValue;

    // Pass buffers to fill (no return allocation)
    this.findCandidates(this._candidateBuffer);
  }
}
```

**Files to Audit:**
- [ ] `NPCTickProcessor.ts`
- [ ] `ChasePathfinding.ts`
- [ ] `AggroManager.ts`
- [ ] `CombatStateManager.ts`
- [ ] `RangeSystem.ts`
- [ ] `MobEntity.ts` (serverUpdate, clientUpdate)

**Acceptance Criteria:**
- [ ] No `new` in any `update()`, `tick()`, or `process*()` methods
- [ ] All temporary objects are pre-allocated class members
- [ ] Buffers are cleared with `.length = 0`, not reassigned
- [ ] Chrome DevTools Memory profiler shows flat heap during gameplay

---

### 4.2 Object Pooling for Entities

```typescript
/**
 * EntityPool - Reuse entity instances to avoid GC pressure
 */
export class EntityPool<T extends PoolableEntity> {
  private readonly _pool: T[] = [];
  private readonly _factory: () => T;
  private readonly _maxSize: number;

  constructor(factory: () => T, initialSize: number, maxSize: number) {
    this._factory = factory;
    this._maxSize = maxSize;

    // Pre-allocate initial pool
    for (let i = 0; i < initialSize; i++) {
      this._pool.push(factory());
    }
  }

  acquire(): T {
    if (this._pool.length > 0) {
      const entity = this._pool.pop()!;
      entity.reset();
      return entity;
    }
    return this._factory();
  }

  release(entity: T): void {
    if (this._pool.length < this._maxSize) {
      entity.deactivate();
      this._pool.push(entity);
    }
  }
}

interface PoolableEntity {
  reset(): void;
  deactivate(): void;
}
```

**Acceptance Criteria:**
- [ ] Hitsplats use object pooling
- [ ] Projectiles use object pooling
- [ ] Temporary calculation objects are pooled
- [ ] Pool sizes tuned for typical gameplay

---

### 4.3 Typed Arrays for Batch Operations

```typescript
/**
 * Use TypedArrays for large numerical datasets
 */
export class NPCPositionBuffer {
  // 3 floats per NPC (x, y, z)
  private readonly _positions: Float32Array;
  private readonly _maxNPCs: number;
  private _count: number = 0;

  constructor(maxNPCs: number) {
    this._maxNPCs = maxNPCs;
    this._positions = new Float32Array(maxNPCs * 3);
  }

  setPosition(index: number, x: number, y: number, z: number): void {
    const offset = index * 3;
    this._positions[offset] = x;
    this._positions[offset + 1] = y;
    this._positions[offset + 2] = z;
  }

  getPosition(index: number, out: Position3D): void {
    const offset = index * 3;
    out.x = this._positions[offset];
    out.y = this._positions[offset + 1];
    out.z = this._positions[offset + 2];
  }
}
```

**Acceptance Criteria:**
- [ ] Network position updates use TypedArrays
- [ ] Batch collision checks use TypedArrays
- [ ] Memory usage scales linearly with NPC count

---

## Phase 5: Testing & Validation

**Priority:** HIGH
**Estimated Effort:** 3-4 days
**Risk:** LOW

### 5.1 Unit Test Coverage

**Target:** >80% coverage for all new/modified code

**Test File Structure:**
```
packages/shared/src/
├── systems/shared/movement/__tests__/
│   ├── ChasePathfinding.test.ts
│   ├── TileSystem.test.ts
│   └── RangeSystem.test.ts
├── entities/managers/__tests__/
│   ├── AggroManager.test.ts
│   ├── CombatStateManager.test.ts
│   └── AIStateMachine.test.ts
└── utils/game/__tests__/
    └── CombatCalculations.test.ts
```

**Example Test Cases:**

```typescript
// ChasePathfinding.test.ts
describe('ChasePathfinding', () => {
  describe('diagonal movement', () => {
    it('should allow diagonal when both cardinals are walkable', () => {
      // Arrange
      const pathfinder = new ChasePathfinding();
      const isWalkable = (tile: TileCoord) => true;

      // Act
      const result = pathfinder.chaseStep(
        { x: 0, z: 0 },
        { x: 1, z: 1 },
        isWalkable
      );

      // Assert
      expect(result).toEqual({ x: 1, z: 1 });
    });

    it('should block diagonal when east cardinal is blocked', () => {
      // Arrange
      const pathfinder = new ChasePathfinding();
      const isWalkable = (tile: TileCoord) => {
        // Block tile at (1, 0)
        return !(tile.x === 1 && tile.z === 0);
      };

      // Act
      const result = pathfinder.chaseStep(
        { x: 0, z: 0 },
        { x: 1, z: 1 },
        isWalkable
      );

      // Assert - should not move diagonally
      expect(result).not.toEqual({ x: 1, z: 1 });
    });
  });

  describe('OSRS melee range', () => {
    it('should exclude diagonals for range 1', () => {
      expect(tilesWithinMeleeRange({ x: 0, z: 0 }, { x: 1, z: 1 }, 1)).toBe(false);
      expect(tilesWithinMeleeRange({ x: 0, z: 0 }, { x: 1, z: 0 }, 1)).toBe(true);
      expect(tilesWithinMeleeRange({ x: 0, z: 0 }, { x: 0, z: 1 }, 1)).toBe(true);
    });

    it('should include diagonals for range 2 (halberd)', () => {
      expect(tilesWithinMeleeRange({ x: 0, z: 0 }, { x: 1, z: 1 }, 2)).toBe(true);
    });
  });
});
```

**Acceptance Criteria:**
- [ ] >80% line coverage
- [ ] >90% branch coverage for critical paths
- [ ] All OSRS mechanics have dedicated tests
- [ ] Tests run in <10 seconds

---

### 5.2 Integration Tests

**Test Real Gameplay Scenarios:**

```typescript
// integration/mob-combat.test.ts
describe('Mob Combat Integration', () => {
  let server: TestServer;
  let player: TestPlayer;
  let goblin: TestMob;

  beforeEach(async () => {
    server = await createTestServer();
    player = await server.spawnPlayer({ x: 10, z: 10 });
    goblin = await server.spawnMob('goblin', { x: 15, z: 10 });
  });

  it('should not attack from diagonal position', async () => {
    // Move player to diagonal of goblin
    await player.moveTo({ x: 16, z: 11 });

    // Wait for combat tick
    await server.waitTicks(2);

    // Goblin should NOT have attacked (diagonal)
    expect(goblin.lastAttackTick).toBe(-1);
  });

  it('should attack from cardinal position', async () => {
    // Move player to cardinal of goblin
    await player.moveTo({ x: 16, z: 10 });

    // Wait for combat tick
    await server.waitTicks(2);

    // Goblin should have attacked
    expect(goblin.lastAttackTick).toBeGreaterThan(0);
  });

  it('should safespot correctly', async () => {
    // Create obstacle
    await server.placeObstacle({ x: 14, z: 10 });

    // Player behind obstacle
    await player.moveTo({ x: 13, z: 10 });

    // Attack goblin to aggro
    await player.attack(goblin);

    // Wait for goblin to attempt approach
    await server.waitTicks(10);

    // Goblin should be stuck (safespotted)
    expect(goblin.position).toEqual({ x: 15, z: 10 });
    expect(goblin.isBlocked()).toBe(true);
  });
});
```

**Acceptance Criteria:**
- [ ] Safespot tests pass
- [ ] Melee diagonal exclusion tests pass
- [ ] Corner-cutting tests pass
- [ ] Large NPC tests pass

---

### 5.3 Performance Benchmarks

```typescript
// benchmarks/npc-tick.bench.ts
describe('NPC Tick Performance', () => {
  it('should process 100 NPCs in <1ms', () => {
    const processor = new NPCTickProcessor(/* deps */);
    const npcs = createMockNPCs(100);

    const start = performance.now();
    processor.processTick(npcs, 1);
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(1);
  });

  it('should process 1000 NPCs in <10ms', () => {
    const processor = new NPCTickProcessor(/* deps */);
    const npcs = createMockNPCs(1000);

    const start = performance.now();
    processor.processTick(npcs, 1);
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(10);
  });

  it('should have zero allocations per tick', () => {
    const processor = new NPCTickProcessor(/* deps */);
    const npcs = createMockNPCs(100);

    // Warm up
    processor.processTick(npcs, 1);

    // Measure allocations
    const before = process.memoryUsage().heapUsed;
    for (let i = 0; i < 1000; i++) {
      processor.processTick(npcs, i);
    }
    const after = process.memoryUsage().heapUsed;

    // Allow <1KB growth (for any unavoidable internals)
    expect(after - before).toBeLessThan(1024);
  });
});
```

**Acceptance Criteria:**
- [ ] 100 NPCs: <1ms per tick
- [ ] 1000 NPCs: <10ms per tick
- [ ] Zero allocations verified
- [ ] 60fps maintained with max NPC count

---

## Code Quality Standards

### TypeScript Standards

```typescript
// ✅ DO: Strong types, no any
interface TileCoord {
  x: number;
  z: number;
}

function calculateDistance(a: TileCoord, b: TileCoord): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.z - b.z));
}

// ❌ DON'T: any or unknown
function calculateDistance(a: any, b: any): any {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.z - b.z));
}
```

### Documentation Standards

```typescript
/**
 * Calculate Chebyshev distance between two tiles
 *
 * Used for OSRS-style distance calculations where diagonal
 * movement costs the same as cardinal movement.
 *
 * @param a - First tile coordinate
 * @param b - Second tile coordinate
 * @returns Distance in tiles (Chebyshev metric)
 *
 * @example
 * chebyshevDistance({ x: 0, z: 0 }, { x: 3, z: 2 }) // returns 3
 *
 * @see https://oldschool.runescape.wiki/w/Distance
 */
export function chebyshevDistance(a: TileCoord, b: TileCoord): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.z - b.z));
}
```

### Error Handling

```typescript
// ✅ DO: Validate at boundaries, trust internal code
export function processPlayerAttack(playerId: string, targetId: string): void {
  const player = this.players.get(playerId);
  if (!player) {
    throw new InvalidPlayerError(`Player ${playerId} not found`);
  }

  const target = this.entities.get(targetId);
  if (!target) {
    throw new InvalidTargetError(`Target ${targetId} not found`);
  }

  // Internal code can trust validated data
  this.executeAttack(player, target);
}

// ❌ DON'T: Over-validate internal code
private executeAttack(player: Player, target: Entity): void {
  // Don't re-validate - already done at boundary
  if (!player) throw new Error('Invalid player'); // Unnecessary
}
```

---

## Security Considerations

### Server Authority

All combat calculations MUST happen on the server:

```typescript
// ✅ SERVER: Authoritative damage calculation
// packages/server/src/systems/combat/CombatProcessor.ts
export class CombatProcessor {
  processAttack(attackerId: string, targetId: string): void {
    const attacker = this.getEntity(attackerId);
    const target = this.getEntity(targetId);

    // Server validates range
    if (!this.rangeSystem.isInAttackRange(attacker, target)) {
      return; // Reject invalid attack
    }

    // Server calculates damage
    const damage = this.damageCalculator.calculate(attacker, target);

    // Server applies damage
    target.takeDamage(damage);

    // Server broadcasts result
    this.broadcast('combat:damage', { targetId, damage });
  }
}

// ❌ CLIENT: Never trust client damage
// Client only DISPLAYS combat, never calculates
```

### Input Validation

```typescript
/**
 * Validate all client inputs at server boundary
 */
export function validateAttackRequest(request: unknown): AttackRequest {
  // Type guard
  if (!isObject(request)) {
    throw new ValidationError('Invalid request format');
  }

  // Validate attackerId
  if (typeof request.attackerId !== 'string' || !isValidUUID(request.attackerId)) {
    throw new ValidationError('Invalid attackerId');
  }

  // Validate targetId
  if (typeof request.targetId !== 'string' || !isValidUUID(request.targetId)) {
    throw new ValidationError('Invalid targetId');
  }

  return request as AttackRequest;
}
```

### Rate Limiting

```typescript
/**
 * Rate limit attack requests to prevent spam
 */
export class AttackRateLimiter {
  private readonly _lastAttacks = new Map<string, number>();
  private readonly MIN_ATTACK_INTERVAL_MS = 400; // Slightly less than 1 tick

  canAttack(playerId: string): boolean {
    const now = Date.now();
    const lastAttack = this._lastAttacks.get(playerId) || 0;

    if (now - lastAttack < this.MIN_ATTACK_INTERVAL_MS) {
      return false;
    }

    this._lastAttacks.set(playerId, now);
    return true;
  }
}
```

---

## Acceptance Criteria

### Phase 1 Complete When:
- [ ] All 4 critical bugs fixed
- [ ] Unit tests for each fix
- [ ] No regressions in existing tests

### Phase 2 Complete When:
- [ ] NPCTickProcessor implemented with correct ordering
- [ ] Three range types working correctly
- [ ] Random target selection implemented
- [ ] Path persistence working
- [ ] All unit tests passing

### Phase 3 Complete When:
- [ ] Probabilistic wandering matches OSRS frequency
- [ ] Large NPCs (2x2, 3x3) working correctly
- [ ] First-attack timing matches OSRS
- [ ] Integration tests passing

### Phase 4 Complete When:
- [ ] Zero allocations in all hot paths
- [ ] Object pooling implemented where needed
- [ ] Performance benchmarks passing
- [ ] Memory profiler shows flat heap

### Phase 5 Complete When:
- [ ] >80% unit test coverage
- [ ] All integration tests passing
- [ ] Performance benchmarks documented
- [ ] Code review passed

### Final Acceptance (9/10 Rating):
- [ ] All phases complete
- [ ] No `any` types in codebase
- [ ] All code documented with JSDoc
- [ ] SOLID principles verified
- [ ] Security review passed
- [ ] Performance targets met
- [ ] OSRS behavior verified against wiki

---

## Appendix A: File Change Summary

| File | Action | Priority |
|------|--------|----------|
| `CombatCalculations.ts` | FIX BUG | Critical |
| `AggroSystem.ts` | FIX BUG | Critical |
| `AggroManager.ts` | FIX BUG | Critical |
| `ChasePathfinding.ts` | FIX BUG | Critical |
| `NPCTickProcessor.ts` | NEW | High |
| `RangeSystem.ts` | NEW | High |
| `WanderBehavior.ts` | NEW | Medium |
| `LargeNPCSupport.ts` | NEW | Medium |
| `npc-strategies.ts` | NEW | Medium |
| `TileSystem.ts` | UPDATE | Medium |
| `MobEntity.ts` | UPDATE | Medium |
| `CombatStateManager.ts` | UPDATE | Medium |
| `AIStateMachine.ts` | UPDATE | Low |

---

## Appendix B: OSRS Reference Links

- [Pathfinding](https://oldschool.runescape.wiki/w/Pathfinding)
- [Aggressiveness](https://oldschool.runescape.wiki/w/Aggressiveness)
- [Attack range](https://oldschool.runescape.wiki/w/Attack_range)
- [Game tick](https://oldschool.runescape.wiki/w/Game_tick)
- [Attack speed](https://oldschool.runescape.wiki/w/Attack_speed)
- [Hit delay](https://oldschool.runescape.wiki/w/Hit_delay)
- [Random Walk](https://osrs-docs.com/docs/mechanics/random-walk/)
- [Entity Collision](https://osrs-docs.com/docs/mechanics/entity-collision/)

---

## Appendix C: Remaining Uncertainties (From Research)

The following mechanics have MEDIUM or LOW confidence and may need in-game verification:

### MEDIUM Uncertainty (Best Estimates Used)

| Mechanic | Implementation Choice | May Need Verification |
|----------|----------------------|----------------------|
| First attack timing | Next tick after in-range | Could be same tick |
| Sliding behavior algorithm | Try diagonal → X → Z | Exact order unclear |
| Path persistence details | Persist on entity block, clear on terrain | Edge cases |
| Random target selection | Uniform random | Could be weighted |
| Sub-tick processing order | Timers → Queues → Movement → Combat | Order within NPC phase |

### LOW Uncertainty (Assumptions Made)

| Mechanic | Implementation Choice | Risk |
|----------|----------------------|------|
| Cardinal priority when equal distance | Greater delta first | Minor safespot edge cases |
| Large NPC pathfinding tile | SW tile | Could be center for some NPCs |
| Return-to-spawn re-aggro | Ignore players while returning | May have exceptions |

### Verification Methods

1. **In-Game Capture:** Record OSRS footage of edge cases
2. **RuneLite Plugins:** Some expose tick timing data
3. **RSMod Source:** Reference accurate private server code
4. **Community Experts:** OSRS speedrunners have deep knowledge
5. **Iterative Testing:** Implement, test, compare, iterate

### Estimated Accuracy

Based on research confidence levels:
- **~85% HIGH confidence** - Implemented per documentation
- **~12% MEDIUM confidence** - Best estimates used
- **~3% LOW confidence** - Assumptions made

Total estimated OSRS behavior accuracy: **~95%** for core mechanics

**Post-Implementation Recommendation:** Allocate 1-2 days for in-game verification and fine-tuning after Phase 3 completion.

---

*Document Version: 1.0*
*Created: December 17, 2024*
*Target Rating: 9/10 Production Readiness*
*Based On: MOB_AGGRO_RESEARCH.md Revision 3*
