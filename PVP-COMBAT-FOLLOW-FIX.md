# PvP Combat Follow Bug Fix Plan

## Issue Description

When Player A attacks Player B in PvP, and Player B runs away while being attacked, Player A (the attacker) does not follow the moving player. Instead, Player A exits combat and stands still.

---

## OSRS Combat Mechanics Research

### Key OSRS Behaviors (Source: [OSRS Wiki](https://oldschool.runescape.wiki/))

#### 1. Attacker Chasing Behavior
When you click to attack a player or NPC, **you will continuously follow and attack them** until:
- You click somewhere else (ground/another target)
- The target dies
- Combat times out (8 ticks / 4.8 seconds of no mutual attacks)

From [Pathfinding Wiki](https://oldschool.runescape.wiki/w/Pathfinding):
> "If the clicked entity is an NPC or player, a new pathfinding attempt will be started every tick, until a target tile can be found."

> "When there is only one checkpoint tile left in the path and the target has moved, the path is recalculated every tick starting from the current tile."

#### 2. Auto-Retaliate Chasing Behavior
From [Auto Retaliate Wiki](https://oldschool.runescape.wiki/w/Auto_Retaliate):
> "When Auto Retaliate is ON, the player's character walks/runs towards the monster (or player) attacking and fights back."

From [Retaliation Wiki](https://oldschool.runescape.wiki/w/Retaliation):
> "If it is enabled, and the attacking entity starts to walk or run away, then the player will follow and attack while chasing it."

#### 3. Clicking Ground Cancels YOUR Attack
From [Queues Documentation](https://osrs-docs.com/docs/mechanics/queues/):
> Clicking on a game square is an interruption that removes weak scripts from the queue.

**Critical distinction**:
- When **YOU** click the ground → YOUR attack action is cancelled, you stop chasing
- When **YOUR TARGET** clicks the ground → They stop attacking you, but YOU keep chasing them

#### 4. Combat Timer
From [Flinching Wiki](https://oldschool.runescape.wiki/w/Flinching):
> "An 8-tick 'in-combat' timer runs. If the opponent does manage to attack, the 8-tick 'in-combat' timer resets."

#### 5. PvP "Dragging" Technique
From [Free-to-play PvP techniques](https://oldschool.runescape.wiki/w/Free-to-play_PvP_techniques):
> "Deliberate movement out of the opponent's weapon range to force them to follow is called dragging."

This confirms that **the attacker DOES follow when the target moves away** - this is an intentional game mechanic used as a PvP technique.

---

## Summary of OSRS Behavior

| Scenario | What Happens |
|----------|--------------|
| Player A attacks Player B | A follows B continuously |
| Player B runs away | A keeps chasing B |
| Player B clicks ground (runs) | A still chases B |
| Player A clicks ground | A stops chasing, stops attacking |
| Player B attacks back (retaliate) | Both chase each other |
| Player B disables auto-retaliate and runs | B stops attacking, A still chases |

**Key Insight**: In OSRS, clicking the ground only cancels **YOUR OWN** attack action. It does NOT affect the person attacking you - they continue chasing you.

---

## Current Bug Analysis

### Root Cause

**File**: `packages/shared/src/systems/shared/combat/CombatSystem.ts`
**Function**: `endCombat()` (lines 1127-1128)

```typescript
// Remove combat states via StateService
this.stateService.removeCombatState(typedEntityId);
this.stateService.removeCombatState(combatState.targetId);  // ← BUG!
```

When Player B (defender with auto-retaliate ON) clicks to run away:
1. `COMBAT_PLAYER_DISENGAGE` is emitted for Player B
2. `handlePlayerDisengage(Player B)` → `forceEndCombat(Player B)`
3. `endCombat()` removes BOTH Player B's AND Player A's combat states
4. Player A stops chasing because their combat state is gone

**This is WRONG per OSRS mechanics**: Player B disengaging should only affect Player B's attack state, NOT Player A's.

---

## Correct OSRS-Accurate Fix

### The Fix: Disengage Only Removes YOUR Combat State

When a player clicks to run away (disengages), ONLY their own combat state should be removed. The attacker's combat state remains intact, so they continue chasing.

**Modified `handlePlayerDisengage`**:

```typescript
private handlePlayerDisengage(playerId: string): void {
  // Check if player is currently attacking something
  const combatState = this.stateService.getCombatData(playerId);
  if (!combatState || combatState.attackerType !== "player") {
    return; // Not in combat as an attacker, nothing to cancel
  }

  const targetId = String(combatState.targetId);
  const typedPlayerId = createEntityID(playerId);

  // OSRS-ACCURATE: Only remove THIS player's combat state
  // The target (who is attacking this player) keeps their combat state
  // and continues chasing this player

  // Reset emote for disengaging player only
  this.animationManager.resetEmote(playerId, "player");

  // Clear combat UI state from this player's entity
  this.stateService.clearCombatStateFromEntity(playerId, "player");

  // Remove ONLY this player's combat state - NOT the target's!
  this.stateService.removeCombatState(typedPlayerId);

  // Mark player as "in combat without target" - they can be hit and retaliate
  // This keeps the combat timer active but player won't auto-attack
  this.stateService.markInCombatWithoutTarget(playerId, targetId);

  // Emit event for UI updates
  this.emitTypedEvent(EventType.COMBAT_PLAYER_DISENGAGED, {
    playerId: playerId,
    targetId: targetId,
  });
}
```

### What This Achieves

| Scenario | Before Fix | After Fix (OSRS-Accurate) |
|----------|------------|---------------------------|
| Player B (defender) runs away | Player A stops chasing | Player A keeps chasing |
| Player B's combat state | Removed ✓ | Removed ✓ |
| Player A's combat state | Removed ✗ | Preserved ✓ |
| Player A's chase behavior | Broken | Works correctly |

---

## Additional Considerations

### 1. The `endCombat()` Function Purpose

The current `endCombat()` is designed for **mutual combat end** scenarios (like death, timeout, or both players stopping). It correctly removes both states in those cases.

For **unilateral disengage** (one player clicking away), we need different behavior - only the disengaging player's state is removed.

### 2. Combat Timeout Still Works

Player A will naturally stop chasing after 8 ticks (4.8 seconds) if:
- Player A cannot reach Player B (pathfinding fails)
- Player A doesn't land any hits

The `combatEndTick` timer handles this automatically.

### 3. Auto-Retaliate Interaction

If Player B has auto-retaliate ON and Player A catches up and hits them:
- Player B's retaliation will create a new combat state for them
- Both players are now in mutual combat again

This is correct OSRS behavior.

---

## Implementation Checklist

- [ ] Modify `handlePlayerDisengage()` to only remove the disengaging player's combat state
- [ ] Keep `endCombat()` unchanged for mutual combat end scenarios
- [ ] Add `COMBAT_PLAYER_DISENGAGED` event type if not exists
- [ ] Verify `checkRangeAndFollow` continues working for the attacker
- [ ] Test PvP: Attacker chases when defender runs
- [ ] Test PvP: Attacker stops when THEY click ground
- [ ] Test PvM: Player chases when mob retreats
- [ ] Test PvM: Mob chases when player runs (existing behavior)
- [ ] Test combat timeout after 8 ticks of no hits
- [ ] Test auto-retaliate re-engagement
- [ ] Build and lint

---

## Testing Scenarios

### Scenario 1: PvP - Defender Runs, Attacker Chases
1. Player A attacks Player B
2. Player B clicks ground to run away
3. **Expected**: Player A follows Player B
4. **Expected**: Player A continues attacking when in range

### Scenario 2: PvP - Attacker Clicks Away
1. Player A attacks Player B
2. Player A clicks ground to walk away
3. **Expected**: Player A stops attacking
4. **Expected**: Player A stops following
5. **Expected**: Player B (if auto-retaliate ON) chases Player A

### Scenario 3: PvP - Mutual Combat, One Disengages
1. Player A attacks Player B (auto-retaliate ON)
2. Both are fighting
3. Player B clicks ground to run
4. **Expected**: Player B stops attacking
5. **Expected**: Player A keeps chasing Player B

### Scenario 4: Combat Timeout
1. Player A attacks Player B
2. Player B runs away to unreachable area
3. **Expected**: After 8 ticks, Player A's combat state times out
4. **Expected**: Player A stops chasing

---

## Sources

- [OSRS Wiki - Combat](https://oldschool.runescape.wiki/w/Combat)
- [OSRS Wiki - Auto Retaliate](https://oldschool.runescape.wiki/w/Auto_Retaliate)
- [OSRS Wiki - Retaliation](https://oldschool.runescape.wiki/w/Retaliation)
- [OSRS Wiki - Pathfinding](https://oldschool.runescape.wiki/w/Pathfinding)
- [OSRS Wiki - Flinching](https://oldschool.runescape.wiki/w/Flinching)
- [OSRS Wiki - Free-to-play PvP techniques](https://oldschool.runescape.wiki/w/Free-to-play_PvP_techniques)
- [OSRS Wiki - PJ Timer](https://oldschool.runescape.wiki/w/PJ_timer)
- [OSRS Docs - Queues](https://osrs-docs.com/docs/mechanics/queues/)
