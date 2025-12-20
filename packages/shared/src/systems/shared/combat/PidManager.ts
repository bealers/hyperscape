/**
 * PidManager - OSRS-style Player ID shuffle system
 *
 * Manages combat priority ordering for fair PvP. When two players attack
 * each other on the same tick, the player with lower PID hits first.
 *
 * PIDs are shuffled every 60-150 seconds (randomized) to ensure no player
 * has a permanent combat priority advantage.
 *
 * @see https://oldschool.runescape.wiki/w/PID
 * @see COMBAT-IMPROVEMENTS-PLAN.md
 */

import type { EntityID } from "../../../types/core/identifiers";
import type { SeededRandom } from "../../../utils/SeededRandom";

// =============================================================================
// OSRS PID CONSTANTS
// =============================================================================

/** Minimum PID shuffle interval in ticks (~60 seconds at 600ms/tick) */
const PID_SHUFFLE_MIN_TICKS = 100;

/** Maximum PID shuffle interval in ticks (~150 seconds at 600ms/tick) */
const PID_SHUFFLE_MAX_TICKS = 250;

// =============================================================================
// TYPES
// =============================================================================

/**
 * PID entry for a single entity
 */
export interface PidEntry {
  /** The entity's ID */
  readonly entityId: EntityID;
  /** Current PID (lower = higher priority) */
  pid: number;
  /** Tick when this PID was assigned/shuffled */
  assignedTick: number;
}

/**
 * Interface for objects with an 'id' property (for sorting)
 */
interface HasId {
  readonly id: EntityID | string;
}

/**
 * PID Manager statistics for debugging/monitoring
 */
export interface PidManagerStats {
  /** Total entities with assigned PIDs */
  totalEntities: number;
  /** Tick when last shuffle occurred */
  lastShuffleTick: number;
  /** Tick when next shuffle will occur */
  nextShuffleTick: number;
  /** Total number of shuffles performed */
  totalShuffles: number;
}

// =============================================================================
// PID MANAGER CLASS
// =============================================================================

/**
 * Manages Player IDs for combat priority ordering.
 *
 * In OSRS, when two players attack each other on the same game tick,
 * the player with the lower PID hits first. This can determine who wins
 * in close fights where both players would die on the same tick.
 *
 * PIDs are shuffled periodically to ensure fairness over time.
 *
 * @example
 * ```typescript
 * const rng = getGameRng();
 * const pidManager = new PidManager(rng);
 *
 * // Assign PIDs when players join
 * pidManager.assignPid("player1", currentTick);
 * pidManager.assignPid("player2", currentTick);
 *
 * // Sort attacks by PID priority
 * const sortedAttacks = pidManager.sortByPid(pendingAttacks);
 *
 * // Update each tick (handles shuffle)
 * pidManager.update(currentTick);
 * ```
 */
export class PidManager {
  /** Map of entity ID to PID entry */
  private readonly pids: Map<EntityID, PidEntry> = new Map();

  /** Counter for assigning sequential PIDs */
  private nextPid = 0;

  /** Tick when last shuffle occurred */
  private lastShuffleTick = 0;

  /** Tick when next shuffle will occur */
  private nextShuffleTick = 0;

  /** Total number of shuffles performed */
  private totalShuffles = 0;

  /** Deterministic RNG for shuffle */
  private readonly rng: SeededRandom;

  /** Pre-allocated array for shuffle (avoids GC pressure) */
  private shuffleBuffer: PidEntry[] = [];

  /**
   * Create a new PID Manager
   *
   * @param rng - Deterministic RNG for shuffle timing and ordering
   */
  constructor(rng: SeededRandom) {
    this.rng = rng;
    this.scheduleNextShuffle(0);
  }

  // ===========================================================================
  // PID ASSIGNMENT
  // ===========================================================================

  /**
   * Assign a PID to a new entity (on login/spawn)
   *
   * New entities receive the next sequential PID. This is deterministic
   * and doesn't depend on RNG.
   *
   * @param entityId - Entity to assign PID to
   * @param currentTick - Current game tick
   * @returns The assigned PID
   */
  assignPid(entityId: EntityID, currentTick: number): number {
    // Check if already assigned
    const existing = this.pids.get(entityId);
    if (existing) {
      return existing.pid;
    }

    const pid = this.nextPid++;
    this.pids.set(entityId, {
      entityId,
      pid,
      assignedTick: currentTick,
    });

    return pid;
  }

  /**
   * Remove PID when entity leaves (logout/death/despawn)
   *
   * @param entityId - Entity to remove
   * @returns true if entity was removed, false if not found
   */
  removePid(entityId: EntityID): boolean {
    return this.pids.delete(entityId);
  }

  /**
   * Get entity's current PID
   *
   * @param entityId - Entity to look up
   * @returns PID if found, undefined otherwise
   */
  getPid(entityId: EntityID): number | undefined {
    return this.pids.get(entityId)?.pid;
  }

  /**
   * Check if entity has a PID assigned
   *
   * @param entityId - Entity to check
   * @returns true if entity has PID
   */
  hasPid(entityId: EntityID): boolean {
    return this.pids.has(entityId);
  }

  // ===========================================================================
  // PRIORITY COMPARISON
  // ===========================================================================

  /**
   * Compare PIDs for combat priority
   *
   * Lower PID = higher priority = hits first
   *
   * @param entityA - First entity
   * @param entityB - Second entity
   * @returns Negative if A has priority, positive if B has priority, 0 if equal
   */
  comparePriority(entityA: EntityID, entityB: EntityID): number {
    const pidA = this.getPid(entityA) ?? Infinity;
    const pidB = this.getPid(entityB) ?? Infinity;
    return pidA - pidB;
  }

  /**
   * Sort entities by PID for combat processing order
   *
   * Entities with lower PIDs (higher priority) come first.
   * Entities without PIDs are sorted to the end.
   *
   * @param entities - Array of entities to sort
   * @returns New array sorted by PID (original unchanged)
   */
  sortByPid<T extends HasId>(entities: T[]): T[] {
    return [...entities].sort((a, b) => {
      const idA = (typeof a.id === "string" ? a.id : a.id) as EntityID;
      const idB = (typeof b.id === "string" ? b.id : b.id) as EntityID;
      return this.comparePriority(idA, idB);
    });
  }

  /**
   * Get entity with highest priority (lowest PID) from array
   *
   * @param entityIds - Array of entity IDs
   * @returns Entity ID with lowest PID, or undefined if empty
   */
  getHighestPriority(entityIds: EntityID[]): EntityID | undefined {
    if (entityIds.length === 0) return undefined;

    let bestId = entityIds[0];
    let bestPid = this.getPid(bestId) ?? Infinity;

    for (let i = 1; i < entityIds.length; i++) {
      const pid = this.getPid(entityIds[i]) ?? Infinity;
      if (pid < bestPid) {
        bestPid = pid;
        bestId = entityIds[i];
      }
    }

    return bestId;
  }

  // ===========================================================================
  // SHUFFLE MANAGEMENT
  // ===========================================================================

  /**
   * Update PID manager (call each tick)
   *
   * Checks if a shuffle is due and performs it if so.
   *
   * @param currentTick - Current game tick
   * @returns true if shuffle was performed
   */
  update(currentTick: number): boolean {
    if (currentTick < this.nextShuffleTick) {
      return false;
    }

    this.shuffle(currentTick);
    return true;
  }

  /**
   * Force a PID shuffle immediately
   *
   * Useful for testing or admin commands.
   *
   * @param currentTick - Current game tick
   */
  forceShuffle(currentTick: number): void {
    this.shuffle(currentTick);
  }

  /**
   * Perform PID shuffle using Fisher-Yates algorithm
   *
   * All PIDs are randomly reassigned among existing entities.
   * This is deterministic based on the RNG state.
   *
   * @param currentTick - Current game tick
   */
  private shuffle(currentTick: number): void {
    // Get all entries into buffer (reuse to avoid allocation)
    this.shuffleBuffer.length = 0;
    for (const entry of this.pids.values()) {
      this.shuffleBuffer.push(entry);
    }

    const entries = this.shuffleBuffer;
    const n = entries.length;

    if (n < 2) {
      // Nothing to shuffle
      this.lastShuffleTick = currentTick;
      this.scheduleNextShuffle(currentTick);
      this.totalShuffles++;
      return;
    }

    // Fisher-Yates shuffle on PIDs (not entries)
    // We shuffle the PIDs themselves, not the array positions
    for (let i = n - 1; i > 0; i--) {
      const j = this.rng.nextInt(i + 1);
      // Swap PIDs between entries[i] and entries[j]
      const tempPid = entries[i].pid;
      entries[i].pid = entries[j].pid;
      entries[j].pid = tempPid;
    }

    // Update assignedTick for all entries
    for (const entry of entries) {
      entry.assignedTick = currentTick;
    }

    this.lastShuffleTick = currentTick;
    this.scheduleNextShuffle(currentTick);
    this.totalShuffles++;
  }

  /**
   * Schedule next shuffle with randomized interval
   *
   * @param currentTick - Current game tick
   */
  private scheduleNextShuffle(currentTick: number): void {
    const range = PID_SHUFFLE_MAX_TICKS - PID_SHUFFLE_MIN_TICKS;
    const delay = PID_SHUFFLE_MIN_TICKS + this.rng.nextInt(range + 1);
    this.nextShuffleTick = currentTick + delay;
  }

  // ===========================================================================
  // STATISTICS & DEBUGGING
  // ===========================================================================

  /**
   * Get PID manager statistics
   *
   * @returns Current statistics
   */
  getStats(): PidManagerStats {
    return {
      totalEntities: this.pids.size,
      lastShuffleTick: this.lastShuffleTick,
      nextShuffleTick: this.nextShuffleTick,
      totalShuffles: this.totalShuffles,
    };
  }

  /**
   * Get all PID entries (for debugging)
   *
   * @returns Array of all PID entries
   */
  getAllEntries(): readonly PidEntry[] {
    return Array.from(this.pids.values());
  }

  /**
   * Get ticks until next shuffle
   *
   * @param currentTick - Current game tick
   * @returns Ticks remaining until next shuffle
   */
  getTicksUntilShuffle(currentTick: number): number {
    return Math.max(0, this.nextShuffleTick - currentTick);
  }

  // ===========================================================================
  // LIFECYCLE
  // ===========================================================================

  /**
   * Clear all PIDs (for testing/reset)
   */
  clear(): void {
    this.pids.clear();
    this.nextPid = 0;
    this.totalShuffles = 0;
    this.shuffleBuffer.length = 0;
  }

  /**
   * Get the number of entities with PIDs
   */
  get size(): number {
    return this.pids.size;
  }
}
