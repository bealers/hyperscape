/**
 * FollowManager
 *
 * Server-authoritative system for tracking players following other players.
 * Implements OSRS-accurate following behavior.
 *
 * OSRS-style behavior (from wiki):
 * 1. Player right-clicks another player and selects "Follow"
 * 2. Follower walks behind the leader (not on same tile)
 * 3. When leader moves, follower re-paths to stay behind them
 * 4. Following continues indefinitely until cancelled
 * 5. Cancelled by: clicking to walk, trading, equipping items, target disconnecting
 *
 * @see https://runescape.wiki/w/Follow
 */

import type { World } from "@hyperscape/shared";
import { worldToTile, tilesEqual } from "@hyperscape/shared";
import type { TileMovementManager } from "./tile-movement";

interface FollowState {
  followerId: string;
  targetId: string;
  /** Last tile we pathed toward (to detect when target moves) */
  lastTargetTile: { x: number; z: number } | null;
}

export class FollowManager {
  /** Map of followerId -> follow state */
  private following = new Map<string, FollowState>();

  constructor(
    private world: World,
    private tileMovementManager: TileMovementManager,
  ) {}

  /**
   * Start following another player
   * Called when player selects "Follow" from context menu
   */
  startFollowing(followerId: string, targetId: string): void {
    // Can't follow yourself
    if (followerId === targetId) {
      return;
    }

    // Cancel any existing follow
    this.stopFollowing(followerId);

    // Verify target exists
    const targetEntity = this.world.entities.get(targetId);
    if (!targetEntity) {
      return;
    }

    const targetPos = targetEntity.position;
    if (!targetPos) {
      return;
    }

    const targetTile = worldToTile(targetPos.x, targetPos.z);

    this.following.set(followerId, {
      followerId,
      targetId,
      lastTargetTile: { x: targetTile.x, z: targetTile.z },
    });

    // Immediately start moving toward target (non-combat, meleeRange=0)
    this.tileMovementManager.movePlayerToward(
      followerId,
      targetPos,
      true, // running
      0, // meleeRange=0 for non-combat following
    );
  }

  /**
   * Stop following
   * Called when player clicks elsewhere, trades, equips item, or target disconnects
   */
  stopFollowing(playerId: string): void {
    this.following.delete(playerId);
  }

  /**
   * Check if player is following someone
   */
  isFollowing(playerId: string): boolean {
    return this.following.has(playerId);
  }

  /**
   * Get the target being followed
   */
  getFollowTarget(playerId: string): string | null {
    return this.following.get(playerId)?.targetId ?? null;
  }

  /**
   * Process all following players - called every tick
   *
   * OSRS behavior:
   * - Follower walks behind the leader
   * - Re-paths when leader moves to a new tile
   * - Continues indefinitely until cancelled
   */
  processTick(): void {
    for (const [followerId, state] of this.following) {
      // Check if target still exists (connected)
      const targetEntity = this.world.entities.get(state.targetId);
      if (!targetEntity) {
        // Target disconnected - stop following
        this.following.delete(followerId);
        continue;
      }

      // Check if follower still exists
      const followerEntity = this.world.entities.get(followerId);
      if (!followerEntity) {
        this.following.delete(followerId);
        continue;
      }

      const targetPos = targetEntity.position;
      if (!targetPos) {
        this.following.delete(followerId);
        continue;
      }

      const followerPos = followerEntity.position;
      const followerTile = worldToTile(followerPos.x, followerPos.z);
      const targetTile = worldToTile(targetPos.x, targetPos.z);

      // Check if already adjacent to target (following complete for now)
      if (tilesEqual(followerTile, targetTile)) {
        // On same tile - will naturally separate as target moves
        // Don't re-path, just wait
        continue;
      }

      // Check if target moved to a new tile
      if (
        !state.lastTargetTile ||
        state.lastTargetTile.x !== targetTile.x ||
        state.lastTargetTile.z !== targetTile.z
      ) {
        // Target moved - re-path to follow them
        this.tileMovementManager.movePlayerToward(
          followerId,
          targetPos,
          true, // running
          0, // meleeRange=0 for non-combat
        );
        state.lastTargetTile = { x: targetTile.x, z: targetTile.z };
      }
    }
  }

  /**
   * Process following for a specific player
   * Called by GameTickProcessor during player phase
   */
  processPlayerTick(playerId: string): void {
    const state = this.following.get(playerId);
    if (!state) return;

    // Check if target still exists
    const targetEntity = this.world.entities.get(state.targetId);
    if (!targetEntity) {
      this.following.delete(playerId);
      return;
    }

    // Check if follower still exists
    const followerEntity = this.world.entities.get(playerId);
    if (!followerEntity) {
      this.following.delete(playerId);
      return;
    }

    const targetPos = targetEntity.position;
    if (!targetPos) {
      this.following.delete(playerId);
      return;
    }

    const followerPos = followerEntity.position;
    const followerTile = worldToTile(followerPos.x, followerPos.z);
    const targetTile = worldToTile(targetPos.x, targetPos.z);

    // On same tile - wait for target to move
    if (tilesEqual(followerTile, targetTile)) {
      return;
    }

    // Check if target moved
    if (
      !state.lastTargetTile ||
      state.lastTargetTile.x !== targetTile.x ||
      state.lastTargetTile.z !== targetTile.z
    ) {
      // Re-path to follow
      this.tileMovementManager.movePlayerToward(playerId, targetPos, true, 0);
      state.lastTargetTile = { x: targetTile.x, z: targetTile.z };
    }
  }

  /**
   * Clean up when a player disconnects
   * Removes them as follower AND cancels anyone following them
   */
  onPlayerDisconnect(playerId: string): void {
    // Stop this player from following anyone
    this.following.delete(playerId);

    // Stop anyone following this player
    for (const [followerId, state] of this.following) {
      if (state.targetId === playerId) {
        this.following.delete(followerId);
      }
    }
  }

  /**
   * Get count of active follows (for debugging)
   */
  get size(): number {
    return this.following.size;
  }

  /**
   * Clear all follows (for shutdown)
   */
  destroy(): void {
    this.following.clear();
  }
}
