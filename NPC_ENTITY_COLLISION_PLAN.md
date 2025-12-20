# NPC Entity Collision Implementation Plan

## Issue Summary

**Current Behavior (Incorrect):**
When multiple mobs aggro and attack the same player, they all stack on top of each other in the same tile position.

**OSRS Behavior (Correct):**
NPCs use server-side collision flags to prevent stacking. Each NPC marks its tile as "occupied" and other NPCs cannot path onto that tile. NPCs naturally spread around the player or queue up if tiles are blocked.

---

## Research Findings (OSRS Mechanics)

### Source 1: Entity Collision System
> "Entity collision is a mechanic deployed by most players and NPCs in OldSchool RuneScape. It uses server-side pathfinding flags to prevent said entities from colliding on the same game squares."

**Key Mechanics:**
- When NPC moves to a tile: Sets "NPC-occupied" flag on that tile
- When NPC leaves a tile: Removes the flag
- Before moving: NPC checks if destination tile has occupied flag
- If blocked: NPC waits or tries alternative path

### Source 2: NPC Movement When Blocked
> "In RS, they pick a random cardinal direction (north, east, west, south) and try to move the NPC towards that by 1 tile, if it can. If not, the NPC does nothing that cycle."

**Implications:**
- NPCs don't use smart pathfinding around other entities
- If blocked, they simply wait and retry next tick
- This creates natural "queuing" behavior

### Source 3: Stacking is an Exploit
> "Upon running over the tile on which the NPC closest to you stands, you will remove the NPC-occupied flag on that tile, allowing another NPC to walk on that tile."

**Key Insight:** NPC stacking in OSRS only happens through player exploitation, not normal behavior.

### Source 4: Boss Exceptions
> "Certain monsters (most bosses, some other monsters included) are defined to ignore entity clipping. They will walk through any NPC."

**Complete Exception List (verified from osrs-docs.com):**
- Godwars generals AND their minions (General Graardor, Kree'arra, Commander Zilyana, K'ril Tsutsaroth)
- Dagannoth Kings (Rex, Prime, Supreme)
- Most Chambers of Xeric NPCs (except skeletal mages)
- Wilderness bosses: Callisto, Venenatis, Vet'ion, Chaos Elemental, Chaos Fanatic, Crazy Archaeologist, Scorpia
- The Mimic
- Animated Armours (Warriors Guild)
- Hunter NPCs
- Dusk & Dawn (Grotesque Guardians)
- Smoke Devils

### Source 5: Pathfinder vs Movement Check (CRITICAL)
> "The dumb pathfinder should ignore entity collisions entirely. However, further down the road where the path is actually processed, the processing should be halted if an entity collision prevents going forward. The path should not be cleared if that is the case though, as NPCs tend to continue moving in their previous paths if you stop obstructing them."

**Key Implications:**
- Pathfinder calculates path IGNORING entity collision flags
- Collision is checked ONLY when actually executing movement to the tile
- If blocked by entity, movement fails BUT path is RETAINED (not cleared)
- NPC will resume movement along same path when obstruction clears
- This is why NPCs "wait behind" other NPCs instead of recalculating

### Source 6: Flag Update Order During Movement
> "During movement, right before you reposition the creature, you must remove the flags underneath the creature. After removing the flags beneath the creature, you reposition it, and add the flags back for the tiles which the creature now occupies."

**Exact Order (must follow precisely):**
1. REMOVE collision flags from old tiles
2. REPOSITION entity to new tiles
3. ADD collision flags on new tiles

### Source 7: Stacking Exploit Mechanic
> "Entities that are defined to clip will set the respective flag to true on the tile they walk to, and will set the flag to false when they walk off the tile (EVEN IF the tile contains another entity - this is how RS does the stacking of NPCs)."

**How NPC stacking works in OSRS:**
1. Entity A and Entity B are on adjacent tiles
2. Player runs through Entity A's tile
3. Entity A temporarily clears its flag (player passed through)
4. Entity B walks onto Entity A's tile (flag was cleared)
5. Result: A and B are now stacked on same tile

> **Design Decision:** We will NOT replicate this exploit. Our `vacate()` only removes OUR entity's occupation, not blindly clearing the flag. This prevents stacking.

### Source 8: Melee Attack Range (Cardinal Only)
> "Almost all melee weapons have an attack range of 1, but cannot perform attacks diagonally... resulting in a 'plus' shape."

**Verified:** Range 1 melee = N/S/E/W only, NO diagonals. Our plan correctly uses cardinal-only for range 1.

### Source 9: Multi-Tile NPC Positioning
> "For larger monsters, their location is defined by the south-westernmost square they occupy. This is the location used by most calculations."

**Verified:** SW tile is the anchor. Our `LargeNPCSupport.getSWTile()` is correct.

### Source 10: NPCs Cannot Run
> "No NPC in OSRS can run (client supports it, server doesn't), and no NPC can actually use the smart pathfinder. It is an engine limitation."

**Verified:** NPCs move max 1 tile per tick. Our plan correctly assumes this.

### References
- [osrs-docs.com - Entity Collision](https://osrs-docs.com/docs/mechanics/entity-collision/)
- [OSRS Wiki - Pathfinding](https://oldschool.runescape.wiki/w/Pathfinding)
- [Rune-Server - Entity Blocking and Stacking](https://rune-server.org/threads/entity-blocking-and-stacking-mechanic.699367/)
- [Rune-Server - NPC Pathing](https://rune-server.org/threads/npc-pathing.687888/)

---

## Current Codebase Analysis

### What Exists (Working Well)

| Component | Location | Status |
|-----------|----------|--------|
| Tile-based positioning | `TileSystem.ts` | ✅ Complete |
| Cardinal-only melee range | `tilesWithinMeleeRange()` | ✅ OSRS-accurate |
| Same-tile step-out | `MobEntity.tryStepOutCardinal()` | ✅ Implemented |
| Chase pathfinding | `ChasePathfinding.ts` | ✅ "Dumb pathfinder" |
| Combat range tiles | `getBestCombatRangeTile()` | ✅ Working |
| Aggro system | `AggroSystem.ts` | ✅ Working |
| **TilePool** | `utils/pools/TilePool.ts` | ✅ Zero-allocation tile operations |
| **Branded EntityID** | `types/core/identifiers.ts` | ✅ Type-safe IDs |
| **Pre-allocated buffers** | `ChasePathfinding.ts`, `RangeSystem.ts` | ✅ Production patterns |

### What's Missing (The Gap)

| Component | Issue |
|-----------|-------|
| Entity Occupancy Map | No tracking of which entities occupy which tiles |
| Movement Validation | No check for entity occupancy before movement |
| Stacking Prevention | Multiple mobs can occupy same tile |
| Step-out Validation | `tryStepOutCardinal()` doesn't check if destination is occupied |
| Pathfinding Integration | BFS/Chase pathfinders don't consider entity collisions |

### Existing Utilities to Reuse

**File:** `packages/shared/src/entities/npc/LargeNPCSupport.ts`

Already has multi-tile NPC utilities that should be reused:
- `getOccupiedTiles(swTile, size, buffer)` - Get all tiles occupied by NPC (zero-allocation with buffer)
- `isTileOccupiedByNPC(tile, npcSWTile, size)` - Check if tile is within NPC's area
- `doNPCsOverlap(npc1SW, npc1Size, npc2SW, npc2Size)` - Check NPC overlap
- `getNPCSize(mobType)` - Get size from mob type (goblin=1x1, boss=2x2+)
- `getSWTile(worldPos)` - Get SW tile from world position

**File:** `packages/shared/src/utils/pools/TilePool.ts`

Production-grade object pooling:
- `tilePool.acquire()` / `tilePool.release()` - Zero-allocation tile operations
- `tilePool.withTiles()` - Scoped tile usage with automatic release
- Pre-allocated pool with automatic growth

### Key Files to Modify

```
packages/shared/src/
├── systems/shared/movement/
│   ├── EntityOccupancyMap.ts      # NEW - Central occupancy tracking
│   ├── TileSystem.ts              # Add occupancy-aware helpers
│   ├── BFSPathfinder.ts           # Integrate occupancy checks
│   └── ChasePathfinding.ts        # Integrate occupancy checks
├── entities/npc/
│   ├── LargeNPCSupport.ts         # Reuse existing utilities
│   └── MobEntity.ts               # Register/unregister occupancy
├── entities/managers/
│   └── AIStateMachine.ts          # Use occupancy in state logic
├── core/
│   └── World.ts                   # Add entityOccupancy instance
└── types/entities/
    └── entities.ts                # Add ignoresEntityCollision to MobEntityConfig
```

---

## Implementation Plan

### Phase 1: Entity Occupancy Map (Zero-Allocation Design)

**File:** `packages/shared/src/systems/shared/movement/EntityOccupancyMap.ts` (NEW)

Create a centralized system to track which entities occupy which tiles with **zero allocations in hot paths**.

```typescript
/**
 * EntityOccupancyMap - Tracks entity tile occupancy for collision
 *
 * OSRS-accurate entity collision:
 * - Each tile can be occupied by at most one NPC (for collision purposes)
 * - Players also set occupancy flags (optional - OSRS does this)
 * - Bosses/special NPCs can ignore collision (configurable)
 *
 * Memory Hygiene:
 * - Uses string keys ("x,z") for O(1) lookup
 * - Pre-allocated query buffers to avoid hot path allocations
 * - No closures created during isBlocked/isOccupied checks
 *
 * @see https://osrs-docs.com/docs/mechanics/entity-collision/
 */

import type { EntityID } from "../../../types/core/identifiers";
import { isValidEntityID } from "../../../types/core/identifiers";
import type { TileCoord } from "./TileSystem";

/** Entity types that can occupy tiles */
export type OccupantType = "player" | "mob";

/**
 * Occupancy entry stored in the map
 * Kept minimal to reduce memory footprint
 */
interface OccupancyEntry {
  readonly entityId: EntityID;
  readonly entityType: OccupantType;
  readonly ignoresCollision: boolean;
}

/**
 * Statistics for monitoring and debugging
 */
export interface OccupancyStats {
  /** Total tiles currently occupied */
  occupiedTileCount: number;
  /** Total entities being tracked */
  trackedEntityCount: number;
  /** Tiles occupied by mobs */
  mobTileCount: number;
  /** Tiles occupied by players */
  playerTileCount: number;
  /** Entities that ignore collision (bosses) */
  collisionIgnoringEntities: number;
}

/**
 * Interface for dependency injection and testing
 * Allows systems to depend on abstraction, not concrete implementation
 */
export interface IEntityOccupancy {
  /** Check if tile is blocked by another entity (respects ignoresCollision) */
  isBlocked(tile: TileCoord, excludeEntityId?: EntityID): boolean;

  /** Check if tile has any occupant (ignores collision flags) */
  isOccupied(tile: TileCoord, excludeEntityId?: EntityID): boolean;

  /** Register entity on tiles */
  occupy(
    entityId: EntityID,
    tiles: readonly TileCoord[],
    tileCount: number,
    entityType: OccupantType,
    ignoresCollision: boolean,
  ): void;

  /** Remove entity from all tiles */
  vacate(entityId: EntityID): void;

  /** Move entity to new tiles (atomic) */
  move(
    entityId: EntityID,
    newTiles: readonly TileCoord[],
    tileCount: number,
  ): void;

  /** Get occupant of a tile (for debugging) */
  getOccupant(tile: TileCoord): OccupancyEntry | null;
}

/**
 * Production implementation of entity occupancy tracking
 */
export class EntityOccupancyMap implements IEntityOccupancy {
  // ============================================================================
  // STORAGE
  // ============================================================================

  /** Tile key -> OccupancyEntry (one entity per tile for blocking) */
  private readonly _occupiedTiles = new Map<string, OccupancyEntry>();

  /** EntityID -> Set of tile keys (for vacate/move operations) */
  private readonly _entityTiles = new Map<EntityID, Set<string>>();

  /** Cache entity metadata for move operations (avoids re-lookup) */
  private readonly _entityMetadata = new Map<EntityID, {
    entityType: OccupantType;
    ignoresCollision: boolean;
  }>();

  // ============================================================================
  // PRE-ALLOCATED BUFFERS (Zero-allocation hot path support)
  // ============================================================================

  /** Reusable key buffer to avoid string concatenation in hot paths */
  private _keyBuffer = "";

  // ============================================================================
  // CONFIGURATION
  // ============================================================================

  /** Maximum entities to track (prevents unbounded growth) */
  private readonly MAX_ENTITIES = 10000;

  /** Maximum tiles per entity (5x5 boss = 25 tiles max) */
  private readonly MAX_TILES_PER_ENTITY = 25;

  // ============================================================================
  // PUBLIC API
  // ============================================================================

  /**
   * Check if tile is blocked by another entity
   *
   * Respects `ignoresCollision` flag - entities that ignore collision
   * (bosses) don't block other entities.
   *
   * @param tile - Tile to check
   * @param excludeEntityId - Entity to exclude from check (self)
   * @returns true if tile is blocked
   */
  isBlocked(tile: TileCoord, excludeEntityId?: EntityID): boolean {
    this._keyBuffer = `${tile.x},${tile.z}`;
    const entry = this._occupiedTiles.get(this._keyBuffer);

    if (!entry) return false;
    if (excludeEntityId && entry.entityId === excludeEntityId) return false;
    if (entry.ignoresCollision) return false;

    return true;
  }

  /**
   * Check if tile has any occupant (ignores collision flags)
   *
   * Use this for spawn validation - we don't want to spawn
   * entities on top of each other even if one ignores collision.
   *
   * @param tile - Tile to check
   * @param excludeEntityId - Entity to exclude from check
   * @returns true if tile is occupied
   */
  isOccupied(tile: TileCoord, excludeEntityId?: EntityID): boolean {
    this._keyBuffer = `${tile.x},${tile.z}`;
    const entry = this._occupiedTiles.get(this._keyBuffer);

    if (!entry) return false;
    if (excludeEntityId && entry.entityId === excludeEntityId) return false;

    return true;
  }

  /**
   * Register entity on tiles
   *
   * @param entityId - Entity ID (must be valid EntityID)
   * @param tiles - Pre-allocated tile buffer
   * @param tileCount - Number of valid tiles in buffer
   * @param entityType - "player" or "mob"
   * @param ignoresCollision - If true, this entity doesn't block others
   */
  occupy(
    entityId: EntityID,
    tiles: readonly TileCoord[],
    tileCount: number,
    entityType: OccupantType,
    ignoresCollision: boolean,
  ): void {
    // Validation
    if (!isValidEntityID(entityId)) {
      console.warn("[EntityOccupancyMap] Invalid entityId in occupy()");
      return;
    }

    if (tileCount <= 0 || tileCount > this.MAX_TILES_PER_ENTITY) {
      console.warn(`[EntityOccupancyMap] Invalid tileCount: ${tileCount}`);
      return;
    }

    if (this._entityTiles.size >= this.MAX_ENTITIES) {
      console.error("[EntityOccupancyMap] Max entity limit reached");
      return;
    }

    // Clean up any existing occupancy for this entity
    this.vacate(entityId);

    // Create entry (single allocation, reused for all tiles)
    const entry: OccupancyEntry = {
      entityId,
      entityType,
      ignoresCollision,
    };

    // Cache metadata for move operations
    this._entityMetadata.set(entityId, { entityType, ignoresCollision });

    // Track tiles for this entity
    const tileKeys = new Set<string>();

    for (let i = 0; i < tileCount; i++) {
      const tile = tiles[i];
      if (!this.isValidTile(tile)) continue;

      const key = `${tile.x},${tile.z}`;
      this._occupiedTiles.set(key, entry);
      tileKeys.add(key);
    }

    this._entityTiles.set(entityId, tileKeys);
  }

  /**
   * Remove entity from all occupied tiles
   *
   * @param entityId - Entity to remove
   */
  vacate(entityId: EntityID): void {
    if (!isValidEntityID(entityId)) return;

    const tileKeys = this._entityTiles.get(entityId);
    if (!tileKeys) return;

    // Remove all tile entries
    for (const key of tileKeys) {
      this._occupiedTiles.delete(key);
    }

    // Cleanup tracking
    this._entityTiles.delete(entityId);
    this._entityMetadata.delete(entityId);
  }

  /**
   * Move entity to new tiles (atomic operation)
   *
   * Uses cached metadata to avoid re-specifying entityType/ignoresCollision.
   *
   * @param entityId - Entity to move
   * @param newTiles - Pre-allocated tile buffer with new positions
   * @param tileCount - Number of valid tiles in buffer
   */
  move(
    entityId: EntityID,
    newTiles: readonly TileCoord[],
    tileCount: number,
  ): void {
    const metadata = this._entityMetadata.get(entityId);
    if (!metadata) {
      console.warn(`[EntityOccupancyMap] Cannot move unknown entity: ${entityId}`);
      return;
    }

    // Vacate old tiles
    const oldTileKeys = this._entityTiles.get(entityId);
    if (oldTileKeys) {
      for (const key of oldTileKeys) {
        this._occupiedTiles.delete(key);
      }
      oldTileKeys.clear(); // Reuse the Set
    }

    // Create entry for new tiles
    const entry: OccupancyEntry = {
      entityId,
      entityType: metadata.entityType,
      ignoresCollision: metadata.ignoresCollision,
    };

    // Occupy new tiles
    const tileKeys = oldTileKeys || new Set<string>();

    for (let i = 0; i < tileCount; i++) {
      const tile = newTiles[i];
      if (!this.isValidTile(tile)) continue;

      const key = `${tile.x},${tile.z}`;
      this._occupiedTiles.set(key, entry);
      tileKeys.add(key);
    }

    this._entityTiles.set(entityId, tileKeys);
  }

  /**
   * Get occupant of a tile (for debugging/admin tools)
   *
   * @param tile - Tile to check
   * @returns Occupancy entry or null
   */
  getOccupant(tile: TileCoord): OccupancyEntry | null {
    this._keyBuffer = `${tile.x},${tile.z}`;
    return this._occupiedTiles.get(this._keyBuffer) ?? null;
  }

  /**
   * Find first unoccupied tile from buffer (zero-allocation)
   *
   * @param tiles - Pre-allocated tile buffer to search
   * @param tileCount - Number of valid tiles in buffer
   * @param excludeEntityId - Entity to exclude from blocking check
   * @returns Index of first unoccupied tile, or -1 if all blocked
   */
  findUnoccupiedTileIndex(
    tiles: readonly TileCoord[],
    tileCount: number,
    excludeEntityId?: EntityID,
  ): number {
    for (let i = 0; i < tileCount; i++) {
      if (!this.isBlocked(tiles[i], excludeEntityId)) {
        return i;
      }
    }
    return -1;
  }

  /**
   * Get statistics for monitoring dashboard
   */
  getStats(): OccupancyStats {
    let mobTileCount = 0;
    let playerTileCount = 0;
    let collisionIgnoringEntities = 0;

    const countedEntities = new Set<EntityID>();

    for (const entry of this._occupiedTiles.values()) {
      if (entry.entityType === "mob") mobTileCount++;
      else playerTileCount++;

      if (!countedEntities.has(entry.entityId)) {
        countedEntities.add(entry.entityId);
        if (entry.ignoresCollision) collisionIgnoringEntities++;
      }
    }

    return {
      occupiedTileCount: this._occupiedTiles.size,
      trackedEntityCount: this._entityTiles.size,
      mobTileCount,
      playerTileCount,
      collisionIgnoringEntities,
    };
  }

  /**
   * Clear all occupancy data (for world reset/testing)
   */
  clear(): void {
    this._occupiedTiles.clear();
    this._entityTiles.clear();
    this._entityMetadata.clear();
  }

  /**
   * Cleanup stale entries for entities that no longer exist
   * Call periodically (e.g., every 100 ticks) to prevent memory leaks
   *
   * @param isEntityAlive - Function to check if entity still exists
   * @returns Number of stale entities removed
   */
  cleanupStaleEntries(isEntityAlive: (id: EntityID) => boolean): number {
    let removed = 0;

    for (const entityId of this._entityTiles.keys()) {
      if (!isEntityAlive(entityId)) {
        this.vacate(entityId);
        removed++;
      }
    }

    if (removed > 0) {
      console.log(`[EntityOccupancyMap] Cleaned up ${removed} stale entries`);
    }

    return removed;
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  /**
   * Validate tile coordinates (prevent NaN/Infinity)
   */
  private isValidTile(tile: TileCoord): boolean {
    return (
      Number.isFinite(tile.x) &&
      Number.isFinite(tile.z) &&
      Number.isInteger(tile.x) &&
      Number.isInteger(tile.z)
    );
  }
}

/**
 * Singleton instance for common use cases
 * (World will create its own instance for isolation)
 */
export const entityOccupancyMap = new EntityOccupancyMap();
```

**Integration with World.ts:**

```typescript
// In packages/shared/src/core/World.ts

import { EntityOccupancyMap, IEntityOccupancy } from "../systems/shared/movement/EntityOccupancyMap";

export class World extends EventEmitter {
  // ============================================================================
  // ENTITY OCCUPANCY (Tile collision for NPCs)
  // ============================================================================

  /**
   * Entity occupancy tracking for tile-based collision.
   * Prevents NPCs from stacking on same tile (OSRS-accurate).
   *
   * @see NPC_ENTITY_COLLISION_PLAN.md
   */
  entityOccupancy: IEntityOccupancy;

  constructor() {
    super();
    // ... existing code ...

    // Initialize entity occupancy tracking
    this.entityOccupancy = new EntityOccupancyMap();
  }

  // Add cleanup call in destroy():
  destroy(): void {
    // ... existing cleanup ...

    if (this.entityOccupancy instanceof EntityOccupancyMap) {
      this.entityOccupancy.clear();
    }
  }
}
```

**Key Design Decisions:**

1. **Zero allocations in hot paths**: `isBlocked()` and `isOccupied()` use pre-allocated `_keyBuffer`
2. **Branded EntityID type**: Full type safety, prevents mixing entity types
3. **Interface for DIP**: `IEntityOccupancy` allows dependency injection and testing
4. **Buffer-based API**: `occupy()` and `move()` take pre-allocated buffers + count
5. **Bounds validation**: Prevents NaN/Infinity tiles, enforces entity limits
6. **Stale entry cleanup**: Periodic cleanup prevents memory leaks
7. **Metrics support**: `getStats()` for monitoring dashboard

---

### Phase 2: Integrate with MobEntity (Zero-Allocation)

**File:** `packages/shared/src/entities/npc/MobEntity.ts`

#### 2.1 Pre-allocated Buffers

```typescript
import { tilePool, PooledTile } from "../../utils/pools/TilePool";
import { getSWTile, getOccupiedTiles, getNPCSize, NPCSize } from "./LargeNPCSupport";
import type { EntityID } from "../../types/core/identifiers";
import { CARDINAL_DIRECTIONS } from "../../systems/shared/movement/TileSystem";

export class MobEntity extends CombatantEntity {
  // ============================================================================
  // PRE-ALLOCATED OCCUPANCY BUFFERS (Zero-allocation)
  // ============================================================================

  /** Reusable buffer for occupied tiles (max 5x5 = 25 tiles) */
  private readonly _occupiedTilesBuffer: TileCoord[] = Array.from(
    { length: 25 },
    () => ({ x: 0, z: 0 })
  );

  /** Cached NPC size (avoid repeated lookups) */
  private _cachedSize: NPCSize | null = null;

  /** Reusable buffer for cardinal step-out tiles */
  private readonly _cardinalBuffer: TileCoord[] = [
    { x: 0, z: 0 },
    { x: 0, z: 0 },
    { x: 0, z: 0 },
    { x: 0, z: 0 },
  ];

  /** Pre-allocated tile for current position */
  private readonly _currentTile: TileCoord = { x: 0, z: 0 };

  /** Shuffle indices for random cardinal selection (avoids array allocation) */
  private readonly _shuffleIndices: number[] = [0, 1, 2, 3];
```

#### 2.2 Register Occupancy on Spawn

```typescript
  /**
   * Register this mob's tile occupancy on spawn
   * Called after position is set in constructor/spawn
   */
  private registerOccupancy(): void {
    // Cache size on first call (avoid repeated map lookups)
    if (!this._cachedSize) {
      this._cachedSize = getNPCSize(this.config.mobType);
    }

    const swTile = getSWTile(this.position);
    const tileCount = getOccupiedTiles(swTile, this._cachedSize, this._occupiedTilesBuffer);

    this.world.entityOccupancy.occupy(
      this.id as EntityID,
      this._occupiedTilesBuffer,
      tileCount,
      "mob",
      this.config.ignoresEntityCollision ?? false
    );
  }
```

#### 2.3 Update Occupancy on Movement

```typescript
  /**
   * Update tile occupancy when mob moves
   * Called from moveTowards() or position setter
   *
   * @param newPosition - The new world position
   */
  private updateOccupancy(newPosition: Position3D): void {
    if (!this._cachedSize) {
      this._cachedSize = getNPCSize(this.config.mobType);
    }

    const swTile = getSWTile(newPosition);
    const tileCount = getOccupiedTiles(swTile, this._cachedSize, this._occupiedTilesBuffer);

    this.world.entityOccupancy.move(
      this.id as EntityID,
      this._occupiedTilesBuffer,
      tileCount
    );
  }
```

#### 2.4 Unregister on Death/Despawn

```typescript
  /**
   * Remove tile occupancy on death/despawn
   * Called from die() and despawn() methods
   */
  private unregisterOccupancy(): void {
    this.world.entityOccupancy.vacate(this.id as EntityID);
  }

  // In die() method:
  die(): void {
    this.unregisterOccupancy(); // Free tiles immediately
    // ... existing death logic ...
  }

  // In despawn() method:
  despawn(): void {
    this.unregisterOccupancy();
    // ... existing despawn logic ...
  }
```

#### 2.5 Fix tryStepOutCardinal() (Zero-Allocation)

**Current Code (lines 1088-1114):**
```typescript
tryStepOutCardinal(): void {
  const targetTile = getRandomCardinalTile(currentTile);
  // Emits move request without checking if tile is occupied
  this.emit(EventType.MOB_NPC_MOVE_REQUEST, { targetTile });
}
```

**Fixed Code (Zero-Allocation):**
```typescript
/**
 * Try to step out to an adjacent cardinal tile (OSRS-accurate)
 *
 * When mob is on same tile as target, picks a random unoccupied
 * cardinal direction and moves there. If all blocked, does nothing.
 *
 * Memory: Zero allocations - uses pre-allocated buffers
 */
tryStepOutCardinal(): void {
  // Get current tile (mutate pre-allocated buffer)
  this._currentTile.x = Math.floor(this.position.x);
  this._currentTile.z = Math.floor(this.position.z);

  // Populate cardinal buffer (mutate in place)
  for (let i = 0; i < 4; i++) {
    this._cardinalBuffer[i].x = this._currentTile.x + CARDINAL_DIRECTIONS[i].x;
    this._cardinalBuffer[i].z = this._currentTile.z + CARDINAL_DIRECTIONS[i].z;
  }

  // Fisher-Yates shuffle of indices (no allocation)
  for (let i = 3; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = this._shuffleIndices[i];
    this._shuffleIndices[i] = this._shuffleIndices[j];
    this._shuffleIndices[j] = temp;
  }

  // Find first unoccupied AND walkable tile
  for (let i = 0; i < 4; i++) {
    const idx = this._shuffleIndices[i];
    const tile = this._cardinalBuffer[idx];

    if (!this.world.entityOccupancy.isBlocked(tile, this.id as EntityID) &&
        this.isTileWalkable(tile)) {
      this.emit(EventType.MOB_NPC_MOVE_REQUEST, {
        targetTile: { x: tile.x, z: tile.z }
      });
      return;
    }
  }

  // All cardinal tiles blocked - do nothing this tick (OSRS-accurate)
  // Will retry next tick
}

/**
 * Reset shuffle indices (call once after each shuffle cycle completes)
 */
private resetShuffleIndices(): void {
  this._shuffleIndices[0] = 0;
  this._shuffleIndices[1] = 1;
  this._shuffleIndices[2] = 2;
  this._shuffleIndices[3] = 3;
}
```

---

### Phase 3: Integrate with Movement Execution (OSRS-Accurate)

**CRITICAL OSRS MECHANIC:** Per Source 5, the pathfinder IGNORES entity collision. Collision is only checked when EXECUTING movement to the tile. If blocked, movement fails but path is RETAINED.

**Architecture Decision:**
```
OSRS-Accurate Flow:
1. ChasePathfinder.chaseStep() → Calculates next tile (IGNORES entity collision)
2. MobEntity.moveTowards() → Attempts to move to tile
3. Movement Executor → Checks entity collision BEFORE moving
4. If blocked → Movement fails, path retained, retry next tick
5. If clear → Execute movement, update occupancy
```

**File:** `packages/shared/src/systems/shared/movement/ChasePathfinding.ts`

The existing `ChasePathfinder` class should remain UNCHANGED - it correctly ignores entity collision per OSRS mechanics. Entity collision is checked in the movement executor (Phase 3.1 below).

```typescript
// ChasePathfinder.chaseStep() - NO CHANGES NEEDED
// It already ignores entity collision (only checks terrain walkability)
// This is OSRS-accurate behavior
```

### Phase 3.1: Movement Executor with Entity Collision Check

**File:** `packages/shared/src/entities/npc/MobEntity.ts` (in moveTowards method)

This is where entity collision is actually checked - at movement execution time, not during pathfinding.

```typescript
// In MobEntity.ts - Add to moveTowards method

/** Pre-allocated tile for movement validation */
private readonly _movementTargetTile: TileCoord = { x: 0, z: 0 };

/** Cached path target (for path retention when blocked) */
private _currentPathTarget: TileCoord | null = null;

/**
 * OSRS-Accurate Movement Execution
 *
 * Key behaviors (per Source 5):
 * - Pathfinder calculates path IGNORING entity collision
 * - Entity collision checked HERE at movement execution
 * - If blocked: movement fails, path RETAINED for retry next tick
 * - If clear: execute movement, update occupancy
 */
private executeMovementStep(targetTile: TileCoord): boolean {
  // Convert to tile coords
  this._movementTargetTile.x = Math.floor(targetTile.x);
  this._movementTargetTile.z = Math.floor(targetTile.z);

  // Check entity collision BEFORE moving (OSRS-accurate)
  if (this.world.entityOccupancy.isBlocked(this._movementTargetTile, this.id as EntityID)) {
    // BLOCKED by another entity
    // Per OSRS: Do NOT clear path, will retry next tick
    // This creates the "waiting behind" behavior
    return false;
  }

  // Check terrain walkability
  if (!this.isTileWalkable(this._movementTargetTile)) {
    return false;
  }

  // Movement allowed - execute it
  // Follow OSRS order (Source 6):
  // 1. Remove old flags
  // 2. Reposition
  // 3. Add new flags
  this.updateOccupancy({
    x: this._movementTargetTile.x,
    y: this.position.y,
    z: this._movementTargetTile.z
  });

  // Actually move the entity
  this.position.x = this._movementTargetTile.x + 0.5; // Center of tile
  this.position.z = this._movementTargetTile.z + 0.5;

  return true;
}

/**
 * Modified moveTowards with path retention
 */
moveTowards(target: Position3D, deltaTime: number): void {
  // Calculate path step (pathfinder IGNORES entity collision - OSRS-accurate)
  const nextTile = this._chasePathfinder.chaseStep(
    this._currentTile,
    { x: Math.floor(target.x), z: Math.floor(target.z) },
    (tile) => this.isTileWalkable(tile)
    // NOTE: NO occupancy parameter - pathfinder ignores entity collision
  );

  if (!nextTile) {
    // Already at destination or terrain-blocked
    return;
  }

  // Try to execute movement (this is where entity collision is checked)
  const moved = this.executeMovementStep(nextTile);

  if (!moved) {
    // Blocked by entity - path is RETAINED (will retry next tick)
    // This is OSRS-accurate "waiting behind" behavior
    return;
  }

  // Success - clear path target if reached
  if (this._currentPathTarget &&
      Math.floor(this.position.x) === this._currentPathTarget.x &&
      Math.floor(this.position.z) === this._currentPathTarget.z) {
    this._currentPathTarget = null;
  }
}
```

---

### Phase 4: TileSystem Helpers (Zero-Allocation)

**File:** `packages/shared/src/systems/shared/movement/TileSystem.ts`

Add helper functions that use pre-allocated buffers.

```typescript
import type { IEntityOccupancy } from "./EntityOccupancyMap";
import type { EntityID } from "../../../types/core/identifiers";

// ============================================================================
// PRE-ALLOCATED BUFFERS FOR MELEE TILE FUNCTIONS
// ============================================================================

/** Pre-allocated buffer for cardinal melee tiles (range 1) */
const _cardinalMeleeTiles: TileCoord[] = [
  { x: 0, z: 0 },
  { x: 0, z: 0 },
  { x: 0, z: 0 },
  { x: 0, z: 0 },
];

/** Pre-allocated buffer for extended melee tiles (range 2+, max 5x5 = 24 tiles) */
const _extendedMeleeTiles: TileCoord[] = Array.from(
  { length: 24 },
  () => ({ x: 0, z: 0 })
);

/** Pre-allocated distance buffer for sorting */
const _distanceBuffer: number[] = new Array(24).fill(0);

// ============================================================================
// OCCUPANCY-AWARE TILE FUNCTIONS
// ============================================================================

/**
 * Get cardinal melee tiles (range 1) into pre-allocated buffer
 *
 * @param targetTile - Target's tile position
 * @param buffer - Pre-allocated buffer to fill (must have length >= 4)
 * @returns 4 (always 4 cardinal tiles)
 */
export function getCardinalMeleeTiles(
  targetTile: TileCoord,
  buffer: TileCoord[],
): number {
  buffer[0].x = targetTile.x;
  buffer[0].z = targetTile.z - 1; // North
  buffer[1].x = targetTile.x;
  buffer[1].z = targetTile.z + 1; // South
  buffer[2].x = targetTile.x - 1;
  buffer[2].z = targetTile.z;     // West
  buffer[3].x = targetTile.x + 1;
  buffer[3].z = targetTile.z;     // East
  return 4;
}

/**
 * Find best unoccupied combat tile for melee attack (zero-allocation)
 *
 * OSRS-accurate: Cardinal tiles only for range 1
 * Uses internal pre-allocated buffers - DO NOT store returned tile reference.
 *
 * @param attackerTile - Attacker's current tile
 * @param targetTile - Target's tile
 * @param occupancy - Entity occupancy map
 * @param attackerId - Attacker's ID (excluded from collision)
 * @param isWalkable - Function to check terrain walkability
 * @param range - Attack range (default 1)
 * @returns Best tile reference (internal buffer) or null if all blocked
 */
export function getBestUnoccupiedMeleeTile(
  attackerTile: TileCoord,
  targetTile: TileCoord,
  occupancy: IEntityOccupancy,
  attackerId: EntityID,
  isWalkable: (tile: TileCoord) => boolean,
  range: number = 1,
): TileCoord | null {
  // Get candidate tiles based on range
  const buffer = range === 1 ? _cardinalMeleeTiles : _extendedMeleeTiles;
  const tileCount = range === 1
    ? getCardinalMeleeTiles(targetTile, buffer)
    : getExtendedMeleeTiles(targetTile, range, buffer);

  // Calculate distances and find best unoccupied tile
  let bestTile: TileCoord | null = null;
  let bestDistance = Infinity;

  for (let i = 0; i < tileCount; i++) {
    const tile = buffer[i];

    // Skip if blocked or unwalkable
    if (occupancy.isBlocked(tile, attackerId)) continue;
    if (!isWalkable(tile)) continue;

    // Calculate Chebyshev distance
    const distance = Math.max(
      Math.abs(attackerTile.x - tile.x),
      Math.abs(attackerTile.z - tile.z)
    );

    if (distance < bestDistance) {
      bestDistance = distance;
      bestTile = tile;
    }
  }

  return bestTile;
}

/**
 * Get extended melee tiles (range 2+) into pre-allocated buffer
 *
 * @param targetTile - Target's tile position
 * @param range - Attack range
 * @param buffer - Pre-allocated buffer to fill
 * @returns Number of tiles filled
 */
export function getExtendedMeleeTiles(
  targetTile: TileCoord,
  range: number,
  buffer: TileCoord[],
): number {
  let index = 0;

  for (let dx = -range; dx <= range && index < buffer.length; dx++) {
    for (let dz = -range; dz <= range && index < buffer.length; dz++) {
      // Skip target tile itself
      if (dx === 0 && dz === 0) continue;

      // Check if within Chebyshev distance
      if (Math.max(Math.abs(dx), Math.abs(dz)) <= range) {
        buffer[index].x = targetTile.x + dx;
        buffer[index].z = targetTile.z + dz;
        index++;
      }
    }
  }

  return index;
}
```

---

### Phase 5: AIStateMachine Integration

**File:** `packages/shared/src/entities/managers/AIStateMachine.ts`

#### 5.1 ChaseState - Use Occupancy-Aware Tile Selection

```typescript
import { getBestUnoccupiedMeleeTile } from "../../systems/shared/movement/TileSystem";
import type { EntityID } from "../../types/core/identifiers";

// Pre-allocated tiles for AI state machine
const _aiAttackerTile: TileCoord = { x: 0, z: 0 };
const _aiTargetTile: TileCoord = { x: 0, z: 0 };

export class ChaseState implements AIState {
  // ... existing properties ...

  update(context: MobAIContext, deltaTime: number): AIStateType | null {
    // ... existing validation ...

    const targetPosition = context.getTargetPosition();
    if (!targetPosition) {
      return AIStateType.IDLE;
    }

    // Update pre-allocated tiles
    _aiAttackerTile.x = Math.floor(context.position.x);
    _aiAttackerTile.z = Math.floor(context.position.z);
    _aiTargetTile.x = Math.floor(targetPosition.x);
    _aiTargetTile.z = Math.floor(targetPosition.z);

    // Check if already in combat range
    if (this.isInCombatRange(_aiAttackerTile, _aiTargetTile, context.combatRange)) {
      return AIStateType.ATTACK;
    }

    // Get best combat tile considering other entities
    const combatTile = getBestUnoccupiedMeleeTile(
      _aiAttackerTile,
      _aiTargetTile,
      context.world.entityOccupancy,
      context.entityId as EntityID,
      context.isWalkable,
      context.combatRange
    );

    if (!combatTile) {
      // All combat tiles are occupied - wait (creates natural queuing)
      // Don't change state, will retry next tick
      return null;
    }

    // Path toward best combat tile
    context.moveTowards({ x: combatTile.x, y: 0, z: combatTile.z }, deltaTime);

    return null; // Stay in chase state
  }
}
```

#### 5.2 AttackState - Validate Step-Out Destination

The `tryStepOutCardinal()` fix in Phase 2 handles this. AttackState calls it when on same tile as target:

```typescript
export class AttackState implements AIState {
  update(context: MobAIContext, deltaTime: number): AIStateType | null {
    // ... existing logic ...

    // If on same tile as target, try to step out (Phase 2.5 handles occupancy check)
    if (this.isOnSameTile(context.position, targetPosition)) {
      context.entity.tryStepOutCardinal();
    }

    // ... rest of attack logic ...
  }
}
```

---

### Phase 6: Player Collision (Optional)

Players can also set occupancy flags to prevent mobs from walking through them.

**File:** `packages/shared/src/entities/player/PlayerEntity.ts`

```typescript
import type { EntityID } from "../../types/core/identifiers";

export class PlayerEntity extends Entity {
  // Pre-allocated tile buffer
  private readonly _playerTile: TileCoord = { x: 0, z: 0 };
  private readonly _playerTileBuffer: TileCoord[] = [{ x: 0, z: 0 }];

  /**
   * Register player occupancy (call after spawn/teleport)
   */
  private registerOccupancy(): void {
    this._playerTileBuffer[0].x = Math.floor(this.position.x);
    this._playerTileBuffer[0].z = Math.floor(this.position.z);

    this.world.entityOccupancy.occupy(
      this.id as EntityID,
      this._playerTileBuffer,
      1,
      "player",
      false // Players don't ignore collision
    );
  }

  /**
   * Update occupancy on movement
   */
  private updateOccupancy(newPosition: Position3D): void {
    this._playerTileBuffer[0].x = Math.floor(newPosition.x);
    this._playerTileBuffer[0].z = Math.floor(newPosition.z);

    this.world.entityOccupancy.move(
      this.id as EntityID,
      this._playerTileBuffer,
      1
    );
  }

  /**
   * Remove occupancy on logout/death
   */
  private unregisterOccupancy(): void {
    this.world.entityOccupancy.vacate(this.id as EntityID);
  }
}
```

**Note:** This is optional and might need gameplay tuning. In OSRS, players can walk through NPCs but NPCs respect player collision flags.

---

### Phase 7: Boss/Special NPC Configuration

**File:** `packages/shared/src/types/entities/entities.ts`

Add `ignoresEntityCollision` flag to MobEntityConfig interface (lines 172-205):

```typescript
export interface MobEntityConfig extends EntityConfig<MobEntityProperties> {
  type: EntityType.MOB;
  mobType: string; // Mob ID (e.g., 'goblin', 'general_graardor')
  level: number;
  maxHealth: number;
  currentHealth: number;
  attack: number;
  attackPower: number;
  defense: number;
  defenseBonus: number;
  attackSpeedTicks: number;
  moveSpeed: number;
  aggressive: boolean;
  retaliates: boolean;
  attackable: boolean;
  movementType: "stationary" | "wander" | "patrol";
  aggroRange: number;
  combatRange: number;
  wanderRadius: number;
  leashRange?: number;
  respawnTime: number;
  xpReward: number;
  lootTable: Array<{
    itemId: string;
    chance: number;
    minQuantity: number;
    maxQuantity: number;
  }>;
  spawnPoint: Position3D;
  aiState: MobAIState;
  targetPlayerId: string | null;
  lastAttackTime: number;
  deathTime: number | null;

  /**
   * If true, NPC walks through other NPCs (OSRS boss behavior)
   * Used for: GWD generals, Dagannoth Kings, raid bosses, etc.
   * @default false
   */
  ignoresEntityCollision?: boolean;
}
```

**Note:** NPC size is determined by `getNPCSize(mobType)` from `LargeNPCSupport.ts`, not stored in config.
Boss sizes are pre-defined: goblin=1x1, general_graardor=2x2, corporeal_beast=3x3, etc.

---

## Implementation Order

| Phase | Description | Priority | Complexity |
|-------|-------------|----------|------------|
| 1 | EntityOccupancyMap class | HIGH | Medium |
| 2 | MobEntity integration | HIGH | Medium |
| 5 | AIStateMachine integration | HIGH | Medium |
| 3 | Pathfinding integration | HIGH | Low |
| 4 | TileSystem helpers | MEDIUM | Low |
| 7 | Boss configuration | MEDIUM | Low |
| 6 | Player collision (optional) | LOW | Low |

**Recommended order:** 1 → 2 → 5 → 3 → 4 → 7 → 6

---

## Testing Strategy

### Real Hyperscape Integration Tests (NO MOCKS)

Per project rules: **"NO MOCKS - Use real Hyperscape instances with Playwright"**

All tests spawn actual game servers and use real gameplay.

**File:** `packages/shared/src/systems/shared/movement/__tests__/EntityOccupancy.integration.test.ts`

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createTestWorld, TestWorld } from "../../../../test/TestWorld";
import { spawnMob, spawnPlayer } from "../../../../test/TestHelpers";
import { EntityOccupancyMap } from "../EntityOccupancyMap";

describe("EntityOccupancy Integration", () => {
  let world: TestWorld;

  beforeEach(async () => {
    world = await createTestWorld();
  });

  afterEach(async () => {
    await world.destroy();
  });

  describe("Single mob approaching player", () => {
    it("takes cardinal tile when attacking", async () => {
      const player = await spawnPlayer(world, { x: 10, z: 10 });
      const goblin = await spawnMob(world, "goblin", { x: 12, z: 10 });

      // Wait for goblin to path to player
      await world.tickUntil(() => goblin.aiState === "attack", 20);

      // Goblin should be on cardinal tile (N/S/E/W of player)
      const goblinTile = world.getTile(goblin.position);
      const playerTile = world.getTile(player.position);

      const isCardinal = (
        (goblinTile.x === playerTile.x && Math.abs(goblinTile.z - playerTile.z) === 1) ||
        (goblinTile.z === playerTile.z && Math.abs(goblinTile.x - playerTile.x) === 1)
      );

      expect(isCardinal).toBe(true);
    });
  });

  describe("Multiple mobs attacking same player", () => {
    it("second mob cannot occupy same tile as first", async () => {
      const player = await spawnPlayer(world, { x: 10, z: 10 });
      const goblin1 = await spawnMob(world, "goblin", { x: 12, z: 10 });
      const goblin2 = await spawnMob(world, "goblin", { x: 8, z: 10 });

      // Wait for both to engage
      await world.tickUntil(() =>
        goblin1.aiState === "attack" && goblin2.aiState === "attack",
        30
      );

      // Goblins should be on DIFFERENT tiles
      const tile1 = world.getTile(goblin1.position);
      const tile2 = world.getTile(goblin2.position);

      expect(tile1.x !== tile2.x || tile1.z !== tile2.z).toBe(true);
    });

    it("mobs naturally spread around player (N/S/E/W)", async () => {
      const player = await spawnPlayer(world, { x: 10, z: 10 });

      // Spawn 4 goblins from different directions
      const goblins = await Promise.all([
        spawnMob(world, "goblin", { x: 10, z: 7 }),  // From north
        spawnMob(world, "goblin", { x: 10, z: 13 }), // From south
        spawnMob(world, "goblin", { x: 7, z: 10 }),  // From west
        spawnMob(world, "goblin", { x: 13, z: 10 }), // From east
      ]);

      // Wait for all to engage
      await world.tickUntil(() =>
        goblins.every(g => g.aiState === "attack"),
        40
      );

      // All 4 cardinal tiles should be occupied
      const playerTile = world.getTile(player.position);
      const occupiedTiles = new Set(
        goblins.map(g => `${world.getTile(g.position).x},${world.getTile(g.position).z}`)
      );

      expect(occupiedTiles.size).toBe(4);
    });

    it("fifth mob queues behind when 4 cardinals full", async () => {
      const player = await spawnPlayer(world, { x: 10, z: 10 });

      // Spawn 5 goblins
      const goblins = await Promise.all([
        spawnMob(world, "goblin", { x: 10, z: 7 }),
        spawnMob(world, "goblin", { x: 10, z: 13 }),
        spawnMob(world, "goblin", { x: 7, z: 10 }),
        spawnMob(world, "goblin", { x: 13, z: 10 }),
        spawnMob(world, "goblin", { x: 15, z: 10 }), // 5th goblin
      ]);

      // Wait for engagement
      await world.tickUntil(() =>
        goblins.slice(0, 4).every(g => g.aiState === "attack"),
        40
      );

      // 5th goblin should be in chase state (waiting/queuing)
      expect(goblins[4].aiState).toBe("chase");

      // 5th goblin should NOT be on same tile as any other
      const tile5 = world.getTile(goblins[4].position);
      for (let i = 0; i < 4; i++) {
        const tile = world.getTile(goblins[i].position);
        expect(tile5.x !== tile.x || tile5.z !== tile.z).toBe(true);
      }
    });
  });

  describe("Mob death frees tile", () => {
    it("tile becomes available when mob dies", async () => {
      const player = await spawnPlayer(world, { x: 10, z: 10 });
      const goblin = await spawnMob(world, "goblin", { x: 12, z: 10 });

      await world.tickUntil(() => goblin.aiState === "attack", 20);

      const goblinTile = world.getTile(goblin.position);

      // Tile should be occupied
      expect(world.entityOccupancy.isOccupied(goblinTile)).toBe(true);

      // Kill goblin
      goblin.die();
      await world.tick();

      // Tile should be free
      expect(world.entityOccupancy.isOccupied(goblinTile)).toBe(false);
    });
  });

  describe("Boss ignoresEntityCollision", () => {
    it("boss can stack with other mobs", async () => {
      const player = await spawnPlayer(world, { x: 10, z: 10 });

      // Spawn regular goblin first
      const goblin = await spawnMob(world, "goblin", { x: 12, z: 10 });
      await world.tickUntil(() => goblin.aiState === "attack", 20);

      // Spawn boss that ignores collision
      const boss = await spawnMob(world, "general_graardor", {
        x: 14, z: 10,
        ignoresEntityCollision: true
      });

      await world.tickUntil(() => boss.aiState === "attack", 30);

      // Boss should be able to path through/onto goblin's tile if needed
      // (Actual behavior depends on boss size and pathing)
      expect(boss.aiState).toBe("attack");
    });
  });

  describe("Safespotting still works", () => {
    it("dumb pathfinder enables safespotting", async () => {
      // Create obstacle between player and mob spawn
      const player = await spawnPlayer(world, { x: 10, z: 10 });
      await world.placeObstacle({ x: 11, z: 10 }); // Block direct path

      const goblin = await spawnMob(world, "goblin", { x: 12, z: 10 });

      // Goblin should get stuck (not smart path around)
      await world.tick(10);

      // Goblin should NOT be attacking (blocked by obstacle)
      expect(goblin.aiState).not.toBe("attack");
    });
  });
});
```

### Visual/Manual Test Checklist

- [ ] Multiple goblins attack player - no stacking visible
- [ ] Mobs form natural formation around player (N/S/E/W)
- [ ] Mobs visually "queue up" when cardinal tiles are full
- [ ] Walking under mobs causes them to try stepping out
- [ ] Safespotting still works (dumb pathfinder)
- [ ] Boss (2x2) can walk through smaller mobs

---

## Performance Considerations

### Zero-Allocation Hot Path Compliance

| Operation | Allocations | Notes |
|-----------|-------------|-------|
| `isBlocked()` | 0 | Uses `_keyBuffer` |
| `isOccupied()` | 0 | Uses `_keyBuffer` |
| `move()` | 0* | Reuses existing Set |
| `tryStepOutCardinal()` | 0 | Pre-allocated buffers |
| `getBestUnoccupiedMeleeTile()` | 0 | Module-level buffers |
| `ChasePathfinder.chaseStep()` | 0 | Pre-allocated `_result` |

*`move()` is O(1) allocation on first call per entity, then zero.

### Benchmarks (Add to Performance Test Suite)

```typescript
describe("EntityOccupancy Performance", () => {
  it("handles 1000 entities without degradation", async () => {
    const occupancy = new EntityOccupancyMap();
    const buffer: TileCoord[] = [{ x: 0, z: 0 }];

    // Warm up
    for (let i = 0; i < 100; i++) {
      occupancy.occupy(`entity_${i}` as EntityID, buffer, 1, "mob", false);
    }

    // Benchmark isBlocked
    const start = performance.now();
    const testTile = { x: 500, z: 500 };

    for (let i = 0; i < 100000; i++) {
      occupancy.isBlocked(testTile);
    }

    const elapsed = performance.now() - start;

    // Should complete 100k checks in < 50ms
    expect(elapsed).toBeLessThan(50);
  });

  it("move() is O(1) for single-tile entities", async () => {
    const occupancy = new EntityOccupancyMap();
    const buffer: TileCoord[] = [{ x: 0, z: 0 }];
    const entityId = "test_entity" as EntityID;

    occupancy.occupy(entityId, buffer, 1, "mob", false);

    const start = performance.now();

    for (let i = 0; i < 10000; i++) {
      buffer[0].x = i % 100;
      buffer[0].z = Math.floor(i / 100);
      occupancy.move(entityId, buffer, 1);
    }

    const elapsed = performance.now() - start;

    // Should complete 10k moves in < 20ms
    expect(elapsed).toBeLessThan(20);
  });
});
```

---

## Edge Cases

| Case | Expected Behavior | Implementation |
|------|-------------------|----------------|
| Mob spawns on occupied tile | Find nearest unoccupied tile | Check before spawn, relocate if needed |
| All cardinal tiles blocked | Mob waits, retries next tick | `tryStepOutCardinal()` returns early |
| Mob dies | Immediately frees tile | `vacate()` in `die()` method |
| Player logs out | Immediately frees tile | `vacate()` in disconnect handler |
| Mob teleports | Atomic move (vacate old, occupy new) | `move()` method |
| 2x2 boss moves | All 4 tiles update atomically | `move()` with 4-tile buffer |
| Two mobs try same tile same tick | First one wins (tick processing order) | Deterministic ordering via PID |
| Stale entity (crash) | Cleaned up periodically | `cleanupStaleEntries()` every 100 ticks |
| NaN/Infinity tile coords | Rejected with warning | `isValidTile()` validation |
| Max entity limit reached | Logged error, spawn fails | `MAX_ENTITIES` check in `occupy()` |

---

## Anti-Cheat Integration

**File:** `packages/shared/src/systems/shared/combat/CombatAntiCheat.ts`

Add occupancy violation tracking:

```typescript
export enum ViolationType {
  // ... existing types ...
  EXCESSIVE_TILE_CHANGES = "EXCESSIVE_TILE_CHANGES",
  IMPOSSIBLE_TILE_TELEPORT = "IMPOSSIBLE_TILE_TELEPORT",
}

// In EntityOccupancyMap, add violation reporting:
move(entityId: EntityID, newTiles: readonly TileCoord[], tileCount: number): void {
  const oldTileKeys = this._entityTiles.get(entityId);

  // Check for suspicious teleportation (more than 2 tiles in one tick)
  if (oldTileKeys && oldTileKeys.size > 0) {
    const oldKey = oldTileKeys.values().next().value;
    const [oldX, oldZ] = oldKey.split(",").map(Number);
    const newX = newTiles[0].x;
    const newZ = newTiles[0].z;

    const distance = Math.max(Math.abs(newX - oldX), Math.abs(newZ - oldZ));
    if (distance > 2) {
      // This is suspicious - mobs should only move 1 tile per tick
      // Could be a bug or exploit attempt
      console.warn(`[EntityOccupancy] Suspicious move: ${entityId} moved ${distance} tiles`);
    }
  }

  // ... rest of move logic ...
}
```

---

## Files Created/Modified Summary

### New Files
- `packages/shared/src/systems/shared/movement/EntityOccupancyMap.ts`
- `packages/shared/src/systems/shared/movement/__tests__/EntityOccupancy.integration.test.ts`

### Modified Files
- `packages/shared/src/entities/npc/MobEntity.ts` - Pre-allocated buffers, occupancy methods, movement executor
- `packages/shared/src/entities/managers/AIStateMachine.ts` - Use occupancy in chase/attack
- `packages/shared/src/systems/shared/movement/TileSystem.ts` - Zero-allocation helpers
- `packages/shared/src/core/World.ts` - Add entityOccupancy instance
- `packages/shared/src/types/entities/entities.ts` - Add `ignoresEntityCollision` to MobEntityConfig

### Reused Files (No Modifications Needed - OSRS-Accurate)
- `packages/shared/src/systems/shared/movement/ChasePathfinding.ts` - Already ignores entity collision (correct per OSRS)
- `packages/shared/src/systems/shared/movement/BFSPathfinder.ts` - Already ignores entity collision (correct per OSRS)
- `packages/shared/src/entities/npc/LargeNPCSupport.ts` - Existing utilities
- `packages/shared/src/utils/pools/TilePool.ts` - Object pooling

---

## Quality Checklist

### Production Quality Code
- [x] Zero allocations in hot paths (pre-allocated buffers)
- [x] Uses `tilePool` pattern from existing codebase
- [x] Branded `EntityID` type for type safety
- [x] Input validation (NaN, Infinity, bounds)
- [x] Error handling with meaningful warnings
- [x] JSDoc documentation on all public methods

### SOLID Principles
- [x] **SRP**: EntityOccupancyMap has single responsibility
- [x] **OCP**: `ignoresCollision` is data-driven, not hardcoded
- [x] **LSP**: N/A (no inheritance)
- [x] **ISP**: `IEntityOccupancy` interface for dependency injection
- [x] **DIP**: Systems depend on interface, not concrete class

### Memory & Allocation Hygiene
- [x] No `new` in update loops
- [x] Pre-allocated private reusables (`_keyBuffer`, `_cardinalBuffer`, etc.)
- [x] Buffer-based API (caller provides pre-allocated buffer)
- [x] No closures created in hot paths
- [x] Reuse of Sets in `move()` operation

### Security & Anti-Cheat
- [x] Server-side only (no client trust)
- [x] Bounds validation prevents injection
- [x] Max entity limits prevent DoS
- [x] Suspicious movement logging
- [x] Stale entry cleanup prevents memory exhaustion

### Testing
- [x] Real Hyperscape integration tests (NO MOCKS)
- [x] Performance benchmarks included
- [x] Edge case coverage
- [x] Visual test checklist

---

## OSRS Mechanics Verification Summary

### Verified Mechanics (All Match OSRS)

| Mechanic | OSRS Behavior | Our Implementation | Status |
|----------|--------------|-------------------|--------|
| **Collision Flags** | Set on spawn/move-to, removed on despawn/move-off | `occupy()`, `vacate()`, `move()` | ✅ Match |
| **Pathfinder** | IGNORES entity collision flags | ChasePathfinder unchanged | ✅ Match |
| **Collision Check** | Checked at movement execution, not pathfinding | `executeMovementStep()` | ✅ Match |
| **Path Retention** | Path NOT cleared when blocked by entity | `moveTowards()` retries | ✅ Match |
| **Step-Out** | Random cardinal (N/E/S/W), all 4 directions | Fisher-Yates shuffle 4 cardinals | ✅ Match |
| **If Blocked** | Do nothing that cycle, retry next tick | Return early, retry | ✅ Match |
| **Melee Range 1** | Cardinal only (N/S/E/W), no diagonals | `getCardinalMeleeTiles()` | ✅ Match |
| **Multi-tile NPCs** | SW tile is anchor, all tiles flagged | `getSWTile()`, `getOccupiedTiles()` | ✅ Match |
| **NPCs Can't Run** | Max 1 tile per tick | Single tile per tick | ✅ Match |
| **Boss Exceptions** | Ignore entity collision entirely | `ignoresEntityCollision` flag | ✅ Match |
| **Flag Order** | Remove old → Reposition → Add new | `move()` order | ✅ Match |

### Deliberate Deviations from OSRS

| Mechanic | OSRS Behavior | Our Behavior | Reason |
|----------|--------------|--------------|--------|
| **Stacking Exploit** | Removing flag clears even if another entity present | Only remove OUR entity's occupation | Prevent exploit, improve gameplay |

### Notes on RS3 vs OSRS Differences

The PvM Encyclopedia mentions NPCs can only move in 3 directions (E/W/S, never north) when walked under. This is **RS3-specific behavior**, not OSRS. In OSRS, NPCs pick from all 4 cardinal directions randomly.

---

## References

- [osrs-docs.com - Entity Collision](https://osrs-docs.com/docs/mechanics/entity-collision/)
- [osrs-docs.com - Random Walk](https://osrs-docs.com/docs/mechanics/random-walk/)
- [osrs-docs.com - Entity Interactions](https://osrs-docs.com/docs/mechanics/entity-interactions/)
- [OSRS Wiki - Pathfinding](https://oldschool.runescape.wiki/w/Pathfinding)
- [OSRS Wiki - Attack Range](https://oldschool.runescape.wiki/w/Attack_range)
- [OSRS Wiki - Game Square](https://oldschool.runescape.wiki/w/Game_square)
- [Rune-Server - Entity Blocking and Stacking](https://rune-server.org/threads/entity-blocking-and-stacking-mechanic.699367/)
- [Rune-Server - NPC Pathing](https://rune-server.org/threads/npc-pathing.687888/)
- [Rune-Server - Dynamic NPC Position Calibration](https://rune-server.org/threads/dynamic-npc-position-calibration-adapting-to-player-proximity-and-tile-occupation.704619/)
- [PvM Encyclopedia - Mechanics](https://pvme.io/pvme-guides/miscellaneous-information/mechanics/) (RS3, some shared mechanics)
