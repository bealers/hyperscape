/**
 * Player Interaction Handler
 *
 * Handles player-to-player interaction requests from clients.
 * Currently supports: Follow
 *
 * Security measures:
 * - Input validation (type, format)
 * - Rate limiting (prevents spam)
 * - Server-side player existence verification
 *
 * @see https://runescape.wiki/w/Follow
 */

import type { ServerSocket } from "../../../shared/types";
import type { World } from "@hyperscape/shared";
import type { FollowManager } from "../FollowManager";
import { validateRequestTimestamp } from "../services/InputValidation";
import { getFollowRateLimiter } from "../services/SlidingWindowRateLimiter";

/**
 * Send feedback to client
 */
function sendPlayerError(socket: ServerSocket, reason: string): void {
  if (socket.send) {
    socket.send("showToast", {
      message: reason,
      type: "error",
    });
  }
}

/**
 * Handle follow player request from client
 *
 * OSRS behavior:
 * - Player walks behind the target
 * - Re-paths when target moves
 * - Cancelled by clicking elsewhere, trading, equipping items
 */
export function handleFollowPlayer(
  socket: ServerSocket,
  data: unknown,
  world: World,
  followManager: FollowManager,
): void {
  const playerEntity = socket.player;
  if (!playerEntity) {
    return;
  }

  const followerId = playerEntity.id;

  // Rate limiting
  const rateLimiter = getFollowRateLimiter();
  if (!rateLimiter.check(followerId)) {
    return;
  }

  // Validate request structure
  if (!data || typeof data !== "object") {
    console.warn(`[Player] Invalid follow request format from ${followerId}`);
    return;
  }

  const payload = data as Record<string, unknown>;

  // Validate timestamp to prevent replay attacks
  if (payload.timestamp !== undefined) {
    const timestampValidation = validateRequestTimestamp(payload.timestamp);
    if (!timestampValidation.valid) {
      console.warn(
        `[Player] Replay attack blocked from ${followerId}: ${timestampValidation.reason}`,
      );
      return;
    }
  }

  // Extract target player ID
  const targetPlayerId = payload.targetPlayerId;
  if (typeof targetPlayerId !== "string" || targetPlayerId.length === 0) {
    console.warn(`[Player] Invalid target player ID from ${followerId}`);
    return;
  }

  // Prevent self-follow
  if (targetPlayerId === followerId) {
    sendPlayerError(socket, "You can't follow yourself.");
    return;
  }

  // Verify target player exists
  // Use world.entities.get() for consistency with FollowManager and other systems
  const targetPlayer = world.entities.get(targetPlayerId);
  if (!targetPlayer) {
    console.warn(
      `[Player] Follow request for non-existent player ${targetPlayerId} from ${followerId}`,
    );
    sendPlayerError(socket, "Player not found.");
    return;
  }

  // Start following
  followManager.startFollowing(followerId, targetPlayerId);

  console.log(`[Player] ${followerId} now following ${targetPlayerId}`);
}
