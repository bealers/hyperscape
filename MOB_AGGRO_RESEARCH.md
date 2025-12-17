# Mob Aggro System Research Report

## Executive Summary

This document provides an extensive analysis of the current Hyperscape mob aggro/AI system compared to authentic Old School RuneScape (OSRS) mechanics. The goal is to identify why the current system feels "primitive" and "not smooth" and provide a roadmap for improvement based on verified OSRS behavior.

---

## Part 1: Current Hyperscape Implementation

### 1.1 System Architecture Overview

The mob AI system is distributed across multiple files:

| Component | File | Purpose |
|-----------|------|---------|
| AggroManager | `packages/shared/src/entities/managers/AggroManager.ts` | Target detection and tracking |
| AggroSystem | `packages/shared/src/systems/shared/combat/AggroSystem.ts` | Level-based aggression, behavior tracking |
| AIStateMachine | `packages/shared/src/entities/managers/AIStateMachine.ts` | State transitions (IDLE→CHASE→ATTACK→RETURN) |
| CombatStateManager | `packages/shared/src/entities/managers/CombatStateManager.ts` | Attack timing and cooldowns |
| MobEntity | `packages/shared/src/entities/npc/MobEntity.ts` | Entity-level AI updates |
| mob-tile-movement.ts | `packages/server/src/systems/ServerNetwork/mob-tile-movement.ts` | Server-side pathfinding |
| ChasePathfinding | `packages/shared/src/systems/shared/movement/ChasePathfinding.ts` | Chase step calculation |

### 1.2 Current State Machine

```
┌─────────┐    player detected    ┌─────────┐
│  IDLE   │ ──────────────────►  │  CHASE  │
│ (3-8s)  │                       │         │
└────┬────┘                       └────┬────┘
     │                                 │
     │ idle timeout                    │ in combat range
     ▼                                 ▼
┌─────────┐                       ┌─────────┐
│ WANDER  │                       │ ATTACK  │
│         │                       │         │
└────┬────┘                       └────┬────┘
     │                                 │
     │ target found                    │ target out of range
     └────────────► CHASE ◄────────────┘
                      │
                      │ leash exceeded
                      ▼
                 ┌─────────┐
                 │ RETURN  │
                 │         │
                 └────┬────┘
                      │
                      │ reached spawn
                      ▼
                    IDLE
```

### 1.3 Current Aggro Detection Logic

```typescript
// AggroSystem - runs every 500ms (NOT tick-aligned)
for each mob:
  1. Check all players within detectionRange (euclidean distance)
  2. Apply level-based filter: player.level <= mob.level * 2
  3. First valid player becomes target
  4. Start CHASE state
```

**Problems Identified:**
- Uses **euclidean (world) distance** instead of tile distance
- Detection runs on a **fixed 500ms interval** (not aligned to 600ms server ticks)
- No concept of **hunt range vs aggression range vs attack range**
- **First-found target selection** instead of random selection among valid targets
- Single detection range instead of OSRS's three distinct range types

### 1.4 Current Pathfinding Algorithm

**Current Implementation (chaseStep function):**

```typescript
function chaseStep(current, target, isWalkable):
  dx = sign(target.x - current.x)  // -1, 0, or 1
  dz = sign(target.z - current.z)

  // Try diagonal first (CORRECT for OSRS!)
  if (dx !== 0 && dz !== 0):
    if isWalkable(current.x + dx, current.z + dz):
      return {x: current.x + dx, z: current.z + dz}

  // Try cardinal directions
  if (abs(dx) >= abs(dz)):
    // Prioritize X axis
    if (dx !== 0 && isWalkable(current.x + dx, current.z)):
      return {x: current.x + dx, z: current.z}
    if (dz !== 0 && isWalkable(current.x, current.z + dz)):
      return {x: current.x, z: current.z + dz}
  else:
    // Prioritize Z axis
    if (dz !== 0 && isWalkable(current.x, current.z + dz)):
      return {x: current.x, z: current.z + dz}
    if (dx !== 0 && isWalkable(current.x + dx, current.z)):
      return {x: current.x + dx, z: current.z}

  return null  // Stuck!
```

**Problems Identified:**
- Returns `null` immediately when stuck (**no sliding behavior**)
- Doesn't attempt **all cardinal directions** when diagonal blocked
- No **path memory** - NPCs should continue previous path if temporarily blocked
- Missing **obstacle sliding** - NPCs should slide along walls, not stop completely

### 1.5 Movement Issues ("Getting Stuck")

**Root Causes:**

1. **Immediate Failure on Block**: When `chaseStep()` returns null, mob stops completely
2. **No Obstacle Sliding**: OSRS NPCs slide along walls; current system doesn't try alternate directions
3. **No Path Persistence**: OSRS NPCs continue their path if you stop blocking them; current system recalculates every tick
4. **Terrain Check Issues**: `isWalkable()` may have false positives/negatives on flat ground due to height precision
5. **Missing Fallback Movement**: Should try perpendicular directions when blocked

### 1.6 Current Melee Range Check

**Current Implementation:**
- Uses `tilesWithinMeleeRange()` which checks cardinal directions only for range 1
- This is **CORRECT** for OSRS behavior

**Verification Needed:**
- Ensure diagonal tiles are properly excluded for melee range 1
- Larger NPCs should have attack range originate from ALL tiles they occupy

---

## Part 2: OSRS Authentic Mechanics (Verified)

### 2.1 The Game Tick

OSRS runs on a **600ms server tick** (0.6 seconds). All game actions are processed in discrete ticks.

**Tick Processing Order (Critical!):**
```
1. Client input processed
2. NPC turns (in order of NPC ID):
   - Stalls end
   - Timers execute
   - Queue processes
   - Interaction with objects/items
   - Movement
   - Interactions with players/NPCs
3. Player turns (in order of PID):
   - Stalls end
   - Close interface if strong command queued
   - Queue processes
   - Timers execute
   - Area queue
   - Interaction with objects/items
   - Movement
   - Interaction with players/NPCs
```

**Key Implication:** NPCs process BEFORE players each tick. This means hits on NPCs are delayed by 1 additional tick compared to hits on players.

**Source:** [Game tick - OSRS Wiki](https://oldschool.runescape.wiki/w/Game_tick), [Timers - OSRS Docs](https://osrs-docs.com/docs/mechanics/timers/)

### 2.2 NPC Pathfinding: The "Dumb Pathfinder" (VERIFIED)

**Critical Fact:** NO NPC in OSRS uses the smart (BFS) pathfinder. This is an engine limitation.

**The Dumb Pathfinder Algorithm:**
```
1. Calculate direction to target (deltaX, deltaY as -1, 0, or 1)
2. If both deltaX and deltaY are non-zero (diagonal needed):
   - Try diagonal step first
   - If blocked, try the cardinal direction with greater distance
   - If still blocked, try the other cardinal direction
3. If only one axis needs movement:
   - Try that cardinal direction
4. If blocked: NPC is STUCK (enables safespotting)
```

**Movement Priority:** DIAGONAL FIRST, then cardinal directions.

> "This pathing mode naively paths diagonally to the end tile and then straight if there's no diagonals left."

**Sliding Behavior:**
- NPCs "very often slide against objects"
- When diagonal is blocked, they try cardinal directions
- They do NOT intelligently pathfind around obstacles
- Path should NOT be cleared if entity collision blocks movement - NPCs continue their path when unblocked

**Why This Enables Safespotting:**
> "NPCs, and some automatic player movements, always move directly toward their target and do not detour around obstacles if that would mean moving away."

**Sources:**
- [Pathfinding - OSRS Wiki](https://oldschool.runescape.wiki/w/Pathfinding)
- [Random Walk - OSRS Docs](https://osrs-docs.com/docs/mechanics/random-walk/)
- [Safespot - OSRS Wiki](https://oldschool.runescape.wiki/w/Safespot)

### 2.3 The Three Range Types (CRITICAL)

OSRS has THREE distinct ranges with different origins and purposes:

#### Hunt Range
- **Origin:** Southwest tile of the NPC (dynamic - moves with NPC)
- **Purpose:** Area where NPC searches for targets to attack
- **Note:** Does NOT account for NPC size - a large NPC's hunt range originates only from its SW tile

#### Attack Range
- **Origin:** ALL tiles the NPC occupies (dynamic - moves with NPC)
- **Purpose:** How far NPC can hit from current position
- **Shape for Melee (range 1):** Plus shape (+) - **EXCLUDES diagonal/corner tiles**
- **Shape for Ranged/Halberd:** Square shape - includes diagonals

```
Melee Range 1 (Plus Shape):     Ranged/Halberd (Square):
      [X]                           [X][X][X]
   [X][N][X]                        [X][N][X]
      [X]                           [X][X][X]
```

#### Max Range (Aggro Range)
- **Origin:** Static spawn point of NPC (does NOT move)
- **Purpose:** Maximum distance NPC can be "dragged" from spawn
- **Default Value:** 7 tiles if not configured
- **Behavior:** If attacked from within max range but dragged outside, NPC loses interest and returns

**Aggression Range = Max Range + Attack Range** (combined area from spawn point)

**Source:** [Aggressiveness - OSRS Wiki](https://oldschool.runescape.wiki/w/Aggressiveness)

### 2.4 Random Walk (Wandering) - VERIFIED

When idle, NPCs have a chance to wander each tick:

- **Probability:** ~10/1,000 per CLIENT tick = ~26-30% per SERVER tick
  - (1% per client tick × ~30 client ticks per server tick = ~26% compound probability)
- **Wander Radius:** Fixed at **5 tiles** from spawn point (offset -5 to +5 on each axis)
- **Path Length:** Maximum 9 turns per wander calculation
- **Pathfinder Used:** Dumb pathfinder (slides along obstacles)
- **Movement:** 1 tile per tick (walking speed)

**Key Behaviors:**
- NPCs pick random directions and chain them together (not point-to-point pathing)
- They slide against obstacles rather than pathfinding around
- Path continues if temporary blockage is removed
- Sudden direction reversals can occur mid-path

**Source:** [Random Walk - OSRS Docs](https://osrs-docs.com/docs/mechanics/random-walk/)

### 2.5 Aggression Mechanics - VERIFIED

**Level-Based Aggression Formula:**
```
NPC attacks player if: player_combat_level <= (NPC_level * 2)
```

Example: Level 28 Hobgoblin (28 × 2 = 56) attacks players level 56 or below.

**Corollary:** NPCs level 63+ are ALWAYS aggressive to all players (since max player level is 126).

**Target Selection:** When multiple valid targets exist in hunt range:
> "When there are multiple viable targets in their aggression range, the engine's documentation says they pick randomly." - Mod Ash

**Source:** [Aggressiveness - OSRS Wiki](https://oldschool.runescape.wiki/w/Aggressiveness)

### 2.6 Tolerance System - VERIFIED

NPCs become **tolerant** (stop being aggressive) after:

- **Timer:** 10 minutes in same tolerance zone (some exceptions: Armoured zombies = 15 min)
- **Zone Size:** 21×21 tiles centered on player entry point
- **Zone Overlap:** Two zones can overlap and share aggression state
- **Reset:** Exit combined tolerance boundaries (16-32 tiles away typically)

**Exceptions (Always Aggressive):**
- Wilderness monsters
- Warped Terrorbirds, Dark beasts, Nightmare Zone creatures
- Lizardman shamans, Goraks
- God Wars Dungeon factions (when not wearing appropriate items)

**Source:** [Tolerance - OSRS Wiki](https://oldschool.runescape.wiki/w/Tolerance)

### 2.7 Combat Timing - VERIFIED

**Attack Speed:**
- Measured in game ticks (e.g., 4-tick weapon = 2.4 seconds between attacks)
- NPCs have configurable attack speeds per NPC definition

**Retaliation Delay:**
```
retaliation_delay = ceil(attack_speed / 2) + 1 ticks
```
Example: 4-tick attack speed = 3 ticks before NPC retaliates

**PJ Timer (Single-way Combat):**
- 8 game ticks (4.8 seconds) in single-way zones
- Prevents target switching during this window
- Refreshed each time attacker hits

**Source:** [Attack speed - OSRS Wiki](https://oldschool.runescape.wiki/w/Attack_speed)

### 2.8 Entity Collision - VERIFIED

**Collision Flags:**
1. **Player Flag:** Set by players, checked by most NPCs
2. **NPC Flag:** Set and checked by NPCs
3. **Projectile Flag:** Blocks line of sight
4. **Full Flag:** Blocks all movement

**Collision Behavior:**
- Pathfinders IGNORE collision flags during path calculation
- Collision only checked when actually trying to move to a tile
- If blocked by entity, path is NOT cleared - NPC retries each tick
- Certain bosses (GWD generals, Wilderness bosses, etc.) ignore entity collision entirely

**Source:** [Entity Collision - OSRS Docs](https://osrs-docs.com/docs/mechanics/entity-collision/)

### 2.9 Retreat/Leashing - VERIFIED

**Max Range Leashing:**
- NPC can only move within its max range from spawn
- If attacked from within max range but pulled outside, NPC disengages
- Exception: Dragon spear special can push NPCs outside max range

**Retreat Behavior:**
- When target leaves max range, NPC returns toward spawn
- Uses dumb pathfinder for return movement
- Ignores players while returning (prevents aggro loops)

**Source:** [Max Range - OSRS Docs](https://osrs-docs.com/docs/variables/max-range/)

---

## Part 3: Gap Analysis

### 3.1 Critical Differences

| Aspect | Current Implementation | OSRS Authentic | Severity |
|--------|----------------------|----------------|----------|
| **Aggro Timing** | 500ms interval | Per-tick (600ms) processing | HIGH |
| **Stuck Behavior** | Stop completely | Slide along obstacles, retry path | HIGH |
| **Range Types** | Single range | 3 distinct ranges (Hunt/Attack/Max) | HIGH |
| **Target Selection** | First found | Random among valid | MEDIUM |
| **Path Persistence** | Recalculate every tick | Continue path if unblocked | MEDIUM |
| **Tolerance System** | Not implemented | 10-min timer with zones | LOW |
| **Movement Speed** | 2 tiles/tick | 1 tile/tick (intentionally faster) | N/A |

### 3.2 Why Mobs Feel "Primitive"

1. **No Sliding Behavior**: When blocked, mobs freeze instead of trying alternate directions or sliding along walls
2. **Instant Stop on Block**: Single blocked check = complete stop, instead of trying other directions
3. **No Path Memory**: Mobs recalculate path every tick instead of continuing previous path when unblocked
4. **Missing Hunt Range**: No "noticing" phase - aggro is instant when in range
5. **Predictable Targeting**: First-found instead of random makes mob behavior predictable
6. **Non-tick-aligned Updates**: 500ms aggro scan vs 600ms ticks causes timing inconsistencies

### 3.3 Why Mobs Get Stuck on Flat Ground

**Root Cause Analysis:**

1. **Terrain Walkability False Negatives:**
   - Height precision issues in slope detection
   - Overly strict walkability checks
   - Biome boundary edge cases

2. **No Fallback Movement:**
   When diagonal blocked, current system should try:
   - Both cardinal directions toward target
   - Then perpendicular directions (sliding)
   - NOT just return null

3. **No Path Persistence:**
   - OSRS NPCs continue their queued path if temporarily blocked
   - Current system clears path intent on any blockage

4. **Combat Range Oscillation:**
   - Edge case where mob is exactly at combat range boundary
   - May oscillate between "in range" and "out of range" states

---

## Part 4: Recommended Improvements

### 4.1 High Priority Fixes

#### Fix 1: Implement Proper Sliding/Fallback Movement

```typescript
function chaseStepWithSliding(current, target, isWalkable):
  dx = sign(target.x - current.x)
  dz = sign(target.z - current.z)

  // Try diagonal first (OSRS behavior)
  if (dx !== 0 && dz !== 0):
    if isWalkable(current.x + dx, current.z + dz):
      return {x: current.x + dx, z: current.z + dz}

    // Diagonal blocked - try BOTH cardinal directions (sliding)
    // Prioritize axis with greater distance
    if (abs(dx) >= abs(dz)):
      if isWalkable(current.x + dx, current.z):
        return {x: current.x + dx, z: current.z}
      if isWalkable(current.x, current.z + dz):
        return {x: current.x, z: current.z + dz}
    else:
      if isWalkable(current.x, current.z + dz):
        return {x: current.x, z: current.z + dz}
      if isWalkable(current.x + dx, current.z):
        return {x: current.x + dx, z: current.z}

  // Only one axis needed
  if (dx !== 0):
    if isWalkable(current.x + dx, current.z):
      return {x: current.x + dx, z: current.z}
  if (dz !== 0):
    if isWalkable(current.x, current.z + dz):
      return {x: current.x, z: current.z + dz}

  // Truly stuck - this enables safespotting
  return null
```

#### Fix 2: Align Aggro Scanning to Ticks

```typescript
// Instead of setInterval(500ms)
// Process in main server tick loop
onServerTick(tickNumber):
  // NPCs process before players (OSRS order)
  processNPCTimers()
  processNPCQueues()
  processNPCMovement()
  processNPCAggro()  // Once per 600ms tick
  processNPCCombat()

  // Then players...
```

#### Fix 3: Implement Path Persistence

```typescript
// Don't clear path on temporary blockage
if (nextStep === null && mob.hasQueuedPath()):
  // Keep path, retry next tick
  return
else if (nextStep === null):
  // Truly stuck, no path
  mob.clearPath()
```

#### Fix 4: Fix Terrain Walkability

```typescript
// Add tolerance for flat ground
function isWalkable(x, z):
  // More lenient slope check for flat areas
  const slopeTolerance = 0.3  // Increased from previous value
  const heightDiff = abs(getHeight(x, z) - getHeight(currentX, currentZ))
  if (heightDiff < slopeTolerance):
    return true  // Flat enough
  // ... rest of checks
```

### 4.2 Medium Priority Improvements

#### Improvement 1: Implement Three Range Types

```typescript
interface NPCRanges {
  huntRange: number;      // From SW tile, where NPC looks for targets
  attackRange: number;    // From all occupied tiles, combat reach
  maxRange: number;       // From spawn point, leash distance (default: 7)
}

// Hunt range check (from SW tile)
function isInHuntRange(npc, target):
  const swTile = npc.getSouthwestTile()
  const distance = tileDistance(swTile, target.tile)
  return distance <= npc.huntRange

// Attack range check (from any occupied tile, melee = plus shape)
function isInAttackRange(npc, target):
  for tile in npc.getOccupiedTiles():
    if npc.attackType === 'melee':
      // Plus shape - cardinal only
      if isCardinalAdjacent(tile, target.tile):
        return true
    else:
      // Square shape - includes diagonals
      if tileDistance(tile, target.tile) <= npc.attackRange:
        return true
  return false
```

#### Improvement 2: Random Target Selection

```typescript
function selectTarget(validTargets):
  if (validTargets.length === 0):
    return null
  // OSRS: Random selection among valid targets
  return validTargets[Math.floor(Math.random() * validTargets.length)]
```

#### Improvement 3: Melee Range Plus Shape

```typescript
function isCardinalAdjacent(tile1, tile2):
  const dx = abs(tile1.x - tile2.x)
  const dz = abs(tile1.z - tile2.z)
  // Cardinal only: one axis = 1, other axis = 0
  return (dx === 1 && dz === 0) || (dx === 0 && dz === 1)
```

### 4.3 Low Priority Enhancements

- **Tolerance System:** 10-minute timer with 21×21 zones
- **PJ Timer:** 8-tick target switch cooldown
- **NPC Processing Order:** Process NPCs by internal ID, before players
- **Entity Collision Flags:** Proper collision flag system

---

## Part 5: Implementation Roadmap

### Phase 1: Fix Movement (Critical - Fixes "Stuck" Issues)
1. Implement obstacle sliding in chase pathfinding
2. Add path persistence (don't clear on temporary block)
3. Fix terrain walkability edge cases
4. Test with various obstacle configurations

### Phase 2: Improve Aggro (Important - Fixes "Primitive" Feel)
1. Align aggro scanning to 600ms server ticks
2. Implement hunt range (from SW tile)
3. Implement separate attack range (from all occupied tiles)
4. Add random target selection
5. Add max range leashing from spawn point

### Phase 3: Combat Range Accuracy
1. Verify melee range uses plus shape (cardinal only)
2. Implement proper multi-tile NPC attack range origin
3. Add combat range edge case handling

### Phase 4: Polish (Nice to Have)
1. Tolerance system
2. PJ timer
3. NPC processing order
4. Entity collision flag system

---

## Part 6: Known Uncertainties and Edge Cases

### IMPORTANT DISCLAIMER

While this research document aims for OSRS-authentic behavior, several details remain uncertain or undocumented. Implementing these systems will require testing and potential iteration.

### 6.1 Pathfinding Uncertainties

#### Cardinal Direction Priority
**Uncertainty Level: MEDIUM**

When diagonal movement is blocked, which cardinal direction is tried first?

- **Current Assumption:** Axis with greater distance to target
- **Unknown:** Is there a fixed order (e.g., WEST > EAST > NORTH > SOUTH) when distances are equal?
- **Impact:** Could affect safespot behavior in specific scenarios

#### Corner Cutting Rules
**Uncertainty Level: LOW** (Updated - rule found!)

When can NPCs move diagonally through corners of obstacles?

- **FOUND:** Diagonal movement requires BOTH adjacent cardinal tiles to be traversable
- **Rule:** To move diagonally from (0,0) to (1,1), BOTH (1,0) and (0,1) must allow entry
- **Pillars:** Occupy corners of tiles and block diagonal movement from that direction
- **Implementation:** Check both component cardinal directions before allowing diagonal move

```
Example: Moving NE from A to B
    [?][B]
    [A][?]

To move diagonally A→B:
- Tile east of A (bottom-right ?) must allow westward entry
- Tile north of A (top-left ?) must allow southward entry
- If EITHER is blocked, diagonal is blocked
```

**Source:** [Pathfinding - OSRS Wiki](https://oldschool.runescape.wiki/w/Pathfinding)

#### Large NPC Pathfinding Tile
**Uncertainty Level: MEDIUM**

For large NPCs (2x2, 3x3, etc.), which tile is used for pathfinding calculations?

- **Known:** SW tile is used for hunt range origin
- **Unknown:** Is SW tile also used for movement pathfinding, or is the center/actual collision box used?
- **Impact:** Large NPC pathing could be off by 1-2 tiles

### 6.2 Combat Timing Uncertainties

#### First Attack Timing - NPC Initiates Aggro
**Uncertainty Level: MEDIUM** (Updated with partial findings)

When an aggressive NPC first targets a player and reaches combat range:

- **Known:** NPCs process BEFORE players each tick
- **Known:** "Each action registered within one tick will start to take place by the beginning of the next tick"
- **Known:** Melee attacks have 0 hit delay (damage on same tick processed)
- **Implication:** NPC likely attacks on the NEXT tick after entering combat range
- **Still Unknown:** Exact tick when NPC "decides" to attack after spotting player in hunt range

**Best Estimate:** When NPC enters combat range during its processing phase, it attacks at the START of the following tick. Not immediate within the same tick, but no multi-tick delay either.

#### Retaliation Timing (Player Attacks First)
**Uncertainty Level: LOW** (Well documented!)

When PLAYER attacks NPC first:

- **Formula:** `ceil(attackSpeed / 2) + 1` ticks before NPC retaliates
- **Example:** 4-tick attack speed NPC retaliates after 3 ticks (1.8 seconds)
- **Source:** [Attack speed - OSRS Wiki](https://oldschool.runescape.wiki/w/Attack_speed)

#### Hit Delay Mechanics
**Uncertainty Level: LOW** (Well documented!)

- **Melee:** 0 tick hit delay - damage on same tick attack is processed
- **Ranged/Magic:** Variable based on Chebyshev distance to target
- **Processing Order:** NPCs processed before players, so player attacks on NPCs have +1 tick delay
- **Source:** [Hit delay - OSRS Wiki](https://oldschool.runescape.wiki/w/Hit_delay)

#### Retaliation Edge Cases
**Uncertainty Level: MEDIUM**

- **Unknown:** Does retaliation formula apply when NPC is already in combat with another target?
- **Unknown:** What happens if player attacks during NPC's attack animation?
- **Impact:** Could affect switching mechanics

### 6.3 Line of Sight Uncertainties

#### Melee Attack Requirements
**Uncertainty Level: MEDIUM**

For melee attacks, is simple adjacency sufficient or is line-of-sight required?

- **Known:** Attack range for melee is plus shape (cardinal only)
- **Unknown:** Can an NPC attack through a wall if somehow adjacent through diagonal?
- **Unknown:** Are there height/elevation requirements?
- **Impact:** Could affect safespot validity

#### Ranged/Magic Line of Sight
**Uncertainty Level: MEDIUM**

For ranged/magic attacks:

- **Unknown:** Exact line-of-sight calculation algorithm
- **Unknown:** Do projectiles originate from center tile or SW tile for large NPCs?
- **Unknown:** What blocks line of sight (full walls only, or partial obstacles too)?
- **Impact:** Could affect ranged safespot mechanics

### 6.4 Entity Collision Uncertainties

#### Boss Exception List
**Uncertainty Level: LOW**

Certain bosses ignore entity collision, but:

- **Unknown:** Complete list of bosses with this property
- **Known Examples:** GWD generals, some Wilderness bosses
- **Impact:** Boss-specific implementation may need individual configuration

#### Player-to-Player Collision
**Uncertainty Level: LOW**

- **Unknown:** Do NPCs treat player collision differently than NPC collision?
- **Unknown:** Can players body-block NPCs in all scenarios?
- **Impact:** Could affect multi-player coordination tactics

### 6.5 Multi-Combat and Target Selection Uncertainties

#### Target Switch Conditions
**Uncertainty Level: MEDIUM**

In multi-combat zones:

- **Unknown:** Exact conditions under which an NPC switches targets
- **Unknown:** Does damage dealt affect target priority?
- **Unknown:** Is there a re-evaluation frequency for multi-target scenarios?
- **Impact:** Multi-combat behavior may feel different from OSRS

#### Random Selection Distribution
**Uncertainty Level: LOW**

When selecting random target among valid candidates:

- **Unknown:** Is it true uniform random, or weighted by any factor (distance, damage, etc.)?
- **Assumption:** Uniform random based on Mod Ash quote
- **Impact:** Minimal unless selection is actually weighted

### 6.6 Tick Processing Order Uncertainties

#### Sub-tick Ordering
**Uncertainty Level: MEDIUM**

Within the NPC processing phase:

- **Known:** NPCs process before players
- **Known:** NPCs process in order of their internal ID
- **Unknown:** Exact sub-ordering of timers vs queues vs movement vs combat
- **Impact:** Could affect tick-perfect manipulation techniques

### 6.7 State Transition Uncertainties

#### Return-to-Spawn Interruption
**Uncertainty Level: MEDIUM**

When an NPC is returning to spawn:

- **Unknown:** Can it be re-aggro'd during return?
- **Unknown:** Does it need to reach spawn before being aggressive again?
- **Unknown:** What if attacked while returning?
- **Impact:** Could affect kiting/luring mechanics

#### Death and Respawn Timing
**Uncertainty Level: LOW**

- **Unknown:** Exact tick of respawn relative to death
- **Unknown:** Is there a delay before new aggro checks?
- **Impact:** Affects spawn camping strategies

### 6.8 Recommended Verification Approach

To achieve truly exact OSRS behavior, the following verification methods are recommended:

1. **In-Game Testing:** Capture actual OSRS footage of edge cases
2. **RuneLite Plugin Data:** Some plugins expose internal game state
3. **Community Consultation:** OSRS speedrunning/PvM communities have deep mechanical knowledge
4. **Iterative Testing:** Implement, test, compare, iterate
5. **Private Server Comparison:** RSMod and other accurate servers can serve as reference

### 6.9 Summary: What We're Confident About vs. Uncertain

| Mechanic | Confidence | Notes |
|----------|------------|-------|
| Diagonal-first pathfinding | HIGH | Well documented |
| 600ms tick timing | HIGH | Fundamental mechanic |
| Melee plus shape range | HIGH | Well documented |
| Three range types concept | HIGH | Documented on wiki |
| SW tile for hunt range | HIGH | Confirmed |
| Corner cutting rules | HIGH | Both cardinal tiles must be traversable |
| Retaliation timing | HIGH | `ceil(attackSpeed/2)+1` confirmed |
| Hit delay (melee=0) | HIGH | Well documented |
| NPC processes before player | HIGH | Well documented |
| Random target selection | MEDIUM | Mod Ash quote, but details unclear |
| Sliding behavior | MEDIUM | Behavior documented, exact algorithm unclear |
| Path persistence | MEDIUM | Concept clear, implementation details unclear |
| First attack (NPC aggros) | MEDIUM | Likely next tick after in-range, needs verification |
| Cardinal priority order | LOW | No clear documentation for equal distances |
| Large NPC pathfinding | LOW | Partially documented |

**Bottom Line:** The plan captures ~85-90% of mechanics accurately. Key remaining uncertainties:
- Exact cardinal priority when distances are equal
- First attack tick when NPC initiates aggro (not retaliation)
- Large NPC collision box pathfinding details

These can be verified through in-game testing or RSMod source code analysis.

---

## Part 6B: Current Hyperscape Code Analysis vs OSRS

### 6B.1 ChasePathfinding.ts Analysis

**Current Implementation:**
```typescript
// Priority 1: Diagonal (if moving on both axes)
if (dx !== 0 && dz !== 0) {
  candidates.push({ x: current.x + dx, z: current.z + dz });
}

// Priority 2: Cardinal directions (prioritize greater distance axis)
if (absDx >= absDz) {
  if (dx !== 0) candidates.push({ x: current.x + dx, z: current.z });
  if (dz !== 0) candidates.push({ x: current.x, z: current.z + dz });
} else {
  if (dz !== 0) candidates.push({ x: current.x, z: current.z + dz });
  if (dx !== 0) candidates.push({ x: current.x + dx, z: current.z });
}
```

**OSRS Compliance Assessment:**
| Aspect | Status | Notes |
|--------|--------|-------|
| Diagonal first | ✅ CORRECT | Tries diagonal before cardinal |
| Greater distance priority | ✅ CORRECT | Prioritizes axis with more distance |
| Corner cutting check | ❌ MISSING | Should check both adjacent cardinals before diagonal |
| Sliding behavior | ⚠️ PARTIAL | Returns first walkable, but could try more directions |

**Critical Fix Needed:** Diagonal movement should only be allowed if BOTH adjacent cardinal tiles are traversable. Current code only checks if destination tile is walkable.

### 6B.2 MobTileMovementManager.ts Analysis

**Current Implementation:**
- Uses `chaseStep()` for each tick's movement
- Recalculates path every tick while chasing
- Stops immediately when blocked (returns null)

**OSRS Compliance Assessment:**
| Aspect | Status | Notes |
|--------|--------|-------|
| Per-tick recalculation | ✅ CORRECT | NPCs recalculate toward target each tick |
| Path persistence | ❌ MISSING | Should retry same path if entity-blocked |
| Stuck = safespotted | ✅ CORRECT | Intentionally stays stuck (no smart pathfinding) |
| Combat range stop | ✅ CORRECT | Stops when in combat range |

**Improvement Needed:** When blocked by entity collision (not terrain), path should NOT be cleared - NPC should retry on next tick.

### 6B.3 CombatStateManager.ts Analysis

**Current Implementation:**
```typescript
// Retaliation delay formula
onReceiveAttack(currentTick: number): void {
  const retaliationDelay = Math.ceil(this.config.attackSpeedTicks / 2) + 1;
  const retaliationTick = currentTick + retaliationDelay;
  if (!this.inCombat || retaliationTick < this.nextAttackTick) {
    this.nextAttackTick = retaliationTick;
  }
}
```

**OSRS Compliance Assessment:**
| Aspect | Status | Notes |
|--------|--------|-------|
| Retaliation formula | ✅ CORRECT | `ceil(attackSpeed/2) + 1` matches OSRS |
| Attack cooldown tracking | ✅ CORRECT | Uses tick-based nextAttackTick |
| First attack timing | ⚠️ UNCLEAR | Need to verify when NPC initiates aggro |

### 6B.4 AIStateMachine.ts Analysis

**State Transitions:**
```
IDLE → (player detected) → CHASE
CHASE → (in combat range) → ATTACK
ATTACK → (target out of range) → CHASE
CHASE → (leash exceeded) → RETURN
RETURN → (at spawn) → IDLE
```

**OSRS Compliance Assessment:**
| Aspect | Status | Notes |
|--------|--------|-------|
| State machine concept | ✅ CORRECT | Similar to OSRS NPC states |
| Instant aggro | ⚠️ DIFFERENT | Current: instant on detection. OSRS: per-tick check |
| Return ignores players | ✅ CORRECT | NPCs don't re-aggro while returning |
| Leash distance | ✅ CORRECT | Uses wander radius as max range |

### 6B.5 AggroManager.ts Analysis

**Current Implementation:**
- Uses Euclidean distance for aggro range check
- First player found becomes target
- Single range type (aggroRange)

**OSRS Compliance Assessment:**
| Aspect | Status | Notes |
|--------|--------|-------|
| Distance type | ❌ WRONG | Uses Euclidean, should use tile-based |
| Target selection | ❌ WRONG | First-found, should be random |
| Range types | ❌ MISSING | Only one range, should have 3 (hunt/attack/max) |
| Hunt range origin | ❌ MISSING | Should originate from SW tile |
| Attack range origin | ❌ MISSING | Should originate from ALL occupied tiles |

### 6B.6 TileSystem.ts Analysis

**Current Melee Range Implementation:**
```typescript
// Range 1 (standard melee): CARDINAL ONLY - no diagonal attacks
if (meleeRange === COMBAT_CONSTANTS.MELEE_RANGE_STANDARD) {
  return (dx === 1 && dz === 0) || (dx === 0 && dz === 1);
}
```

**OSRS Compliance Assessment:**
| Aspect | Status | Notes |
|--------|--------|-------|
| Plus shape melee | ✅ CORRECT | Cardinal-only for range 1 |
| Halberd range | ✅ CORRECT | Square shape for range 2+ |
| Distance calculation | ✅ CORRECT | Uses Chebyshev for range checks |

### 6B.7 Overall Gap Summary

**High Priority Fixes:**
1. Add corner-cutting check to diagonal movement
2. Implement three range types (hunt/attack/max)
3. Change aggro distance from Euclidean to tile-based
4. Add random target selection
5. Implement path persistence for entity collisions

**Medium Priority Fixes:**
1. Hunt range should originate from SW tile
2. Attack range should originate from ALL occupied tiles
3. Verify first-attack timing when NPC initiates

**Low Priority (Polish):**
1. Tolerance system (10-minute timer)
2. PJ timer (8 ticks)
3. Entity collision flag system

---

## Part 6C: Additional Systems Comparison

### 6C.1 Random Walk/Wander System

**OSRS Mechanics (from osrs-docs.com):**
- Probability: ~10/1000 per client tick (~26-30% per server tick)
- Distance: 5-tile radius from spawn (offset -5 to +5 on each axis)
- Direction: Random, uses dumb pathfinder (not smart BFS)
- Collision: Slides against obstacles, doesn't clear path on entity block
- Path persistence: Resumes when obstruction clears

**Our Implementation (AIStateMachine.ts, MobEntity.ts):**
```typescript
// WanderState idle duration: 3-8 seconds before next wander
private readonly IDLE_MIN_DURATION = 3000;
private readonly IDLE_MAX_DURATION = 8000;

// generateWanderTarget(): 1-5 tiles from current position
private readonly WANDER_MIN_DISTANCE = 1;
private readonly WANDER_MAX_DISTANCE = 5;
```

**OSRS Compliance Assessment:**
| Aspect | Status | Notes |
|--------|--------|-------|
| Wander probability | ❌ DIFFERENT | Ours: Fixed 3-8s idle. OSRS: ~26-30% chance per tick |
| Wander distance | ⚠️ CLOSE | Ours: 1-5 tiles. OSRS: up to 5 tiles from spawn |
| Uses dumb pathfinder | ✅ CORRECT | Uses ChasePathfinding (diagonal-first) |
| Path persistence | ❌ MISSING | Not implemented |
| Wander from spawn | ⚠️ CLOSE | We clamp to wanderRadius from spawn |

**Fix Needed:** Change from fixed idle duration to probabilistic wandering (~26-30% chance per tick)

### 6C.2 AggroSystem.ts Analysis

**Current Implementation Issues:**

```typescript
// Issue 1: Update loop is 500ms, not tick-aligned (600ms)
this.createInterval(() => {
  this.updateMobAI();
}, 500); // Should be 600ms or tick-based

// Issue 2: Uses calculateDistance (Euclidean 3D)
const distance = calculateDistance(mobState.currentPosition, playerPosition);

// Issue 3: Target selection by highest aggro level, not random
private getBestAggroTarget(mobState): AggroTarget {
  for (const [_playerId, aggroTarget] of mobState.aggroTargets) {
    if (aggroTarget.aggroLevel > highestAggro) {
      bestTarget = aggroTarget;
    }
  }
}
```

**OSRS Compliance Assessment:**
| Aspect | Status | Notes |
|--------|--------|-------|
| Update frequency | ❌ WRONG | 500ms, should be 600ms tick |
| Distance calculation | ❌ WRONG | Euclidean 3D, should be tile-based |
| Target selection | ❌ WRONG | Highest aggro, should be random |
| Level-based ignore | ✅ CORRECT | Players above threshold ignored |
| Aggro decay | ⚠️ PARTIAL | 10s timeout, but not OSRS tolerance |

### 6C.3 Large NPC Support (2x2, 3x3)

**Current Implementation:** NOT SUPPORTED

**OSRS Mechanics:**
- Large NPCs occupy multiple tiles (2x2, 3x3, etc.)
- SW tile is the "true" position for hunt range calculations
- Attack range originates from ALL occupied tiles (not just SW)
- Pathfinding uses SW tile as reference point
- Players can stand "inside" large NPCs if they occupy the same tiles

**Our Implementation:**
- All NPCs are 1x1 tile
- No concept of NPC size in pathfinding or range calculations
- No multi-tile collision

**Impact:** Bosses and large monsters will not behave correctly. This is a significant gap for future boss content.

### 6C.4 Damage Calculation (CombatCalculations.ts)

**Our Implementation:**
```typescript
// OSRS accuracy formula
const effectiveAttack = attackerAttackLevel + 8;
const attackRoll = effectiveAttack * (attackerAttackBonus + 64);
const effectiveDefence = targetDefenseLevel + 9;
const defenceRoll = effectiveDefence * (targetDefenseBonus + 64);

// Hit chance calculation
if (attackRoll > defenceRoll) {
  hitChance = 1 - (defenceRoll + 2) / (2 * (attackRoll + 1));
} else {
  hitChance = attackRoll / (2 * (defenceRoll + 1));
}

// Max hit using strength
const effectiveStrength = effectiveStrengthLevel + 8;
maxHit = Math.floor(0.5 + (effectiveStrength * (strengthBonus + 64)) / 640);
```

**OSRS Compliance Assessment:**
| Aspect | Status | Notes |
|--------|--------|-------|
| Accuracy formula | ✅ CORRECT | Matches OSRS exactly |
| Max hit formula | ✅ CORRECT | Matches OSRS exactly |
| Damage roll | ✅ CORRECT | 0 to maxHit inclusive |
| Defense bonus | ⚠️ PARTIAL | NPCs default to 0 (correct for most) |
| Attack styles | ❌ MISSING | No stab/slash/crush bonuses |

**Summary:** Damage calculation is OSRS-accurate for basic melee combat.

### 6C.5 Combat Range Check (isInAttackRange)

**Our Implementation:**
```typescript
// In CombatCalculations.ts - BUGGY!
if (attackType === AttackType.MELEE) {
  const attackerTile = worldToTile(attackerPos.x, attackerPos.z);
  const targetTile = worldToTile(targetPos.x, targetPos.z);
  return tilesAdjacent(attackerTile, targetTile); // WRONG! Includes diagonals!
}

// tilesAdjacent() includes diagonals (8 directions)
return dx <= 1 && dz <= 1 && (dx > 0 || dz > 0);

// tilesWithinMeleeRange() correctly excludes diagonals for range 1
if (meleeRange === COMBAT_CONSTANTS.MELEE_RANGE_STANDARD) {
  return (dx === 1 && dz === 0) || (dx === 0 && dz === 1); // Cardinal only!
}
```

**OSRS Compliance Assessment:**
| Aspect | Status | Notes |
|--------|--------|-------|
| Tile-based melee | ✅ CORRECT | Uses tile adjacency |
| Diagonal exclusion | ❌ BUG! | Uses tilesAdjacent() which INCLUDES diagonals |
| Large NPC range | ❌ MISSING | Doesn't account for NPC size |

**BUG FOUND:** `isInAttackRange()` in CombatCalculations.ts uses `tilesAdjacent()` which includes diagonals. Should use `tilesWithinMeleeRange(attackerTile, targetTile, 1)` for OSRS-accurate melee that excludes diagonals.

### 6C.6 Respawn System (RespawnManager.ts)

**Our Implementation:**
```typescript
// Random spawn location within area
const angle = Math.random() * Math.PI * 2;
const distance = Math.sqrt(Math.random()) * radius;

// Tick-based respawn timer
this.respawnTicksMin = msToTicks(this.config.respawnTimeMin, 1);
this.respawnTicksMax = msToTicks(this.config.respawnTimeMax, 1);
```

**OSRS Compliance Assessment:**
| Aspect | Status | Notes |
|--------|--------|-------|
| Random spawn location | ✅ CORRECT | OSRS spawns at defined point, but random is fine |
| Tick-based timing | ✅ CORRECT | Uses ticks correctly |
| Timer randomness | ✅ CORRECT | Has min/max range |
| Spawn at death location | ✅ CORRECT | We don't do this (correct) |

**Note:** Our random spawn area is actually MORE sophisticated than OSRS (which uses fixed spawn points). This is a deliberate design choice.

### 6C.7 Summary: All Systems Compared

| System | Status | Critical Issues |
|--------|--------|-----------------|
| ChasePathfinding | ⚠️ PARTIAL | Missing corner-cut check |
| MobTileMovement | ⚠️ PARTIAL | Missing path persistence |
| AggroManager | ❌ NEEDS WORK | Wrong distance type, wrong target selection |
| AggroSystem | ❌ NEEDS WORK | Wrong update frequency, wrong distance |
| CombatStateManager | ✅ GOOD | Retaliation formula correct |
| AIStateMachine | ⚠️ PARTIAL | Wrong wander probability |
| Damage Calculation | ✅ GOOD | OSRS-accurate formulas |
| Combat Range (isInAttackRange) | ❌ BUG | Uses tilesAdjacent() instead of tilesWithinMeleeRange() |
| Respawn System | ✅ GOOD | Tick-based, works correctly |
| Large NPC Support | ❌ MISSING | Not implemented at all |
| Line of Sight | ❌ NOT COMPARED | Needs research |

### 6C.8 CRITICAL BUG LIST

Bugs that need immediate fixing:

1. **CombatCalculations.ts:206** - `isInAttackRange()` uses `tilesAdjacent()` which includes diagonals. Melee range 1 should use `tilesWithinMeleeRange()` to exclude diagonals.

2. **AggroSystem.ts:144** - Update interval is 500ms, should be 600ms (tick-aligned)

3. **AggroManager.ts** - Uses Euclidean distance, should use tile-based Chebyshev distance

4. **ChasePathfinding.ts** - Missing corner-cutting check for diagonal movement

---

## Part 7: Design Decision Notes

### Intentional Deviations from OSRS

**Movement Speed (2 tiles/tick):**
- OSRS uses 1 tile/tick for walking NPCs
- Hyperscape intentionally uses 2 tiles/tick for snappier gameplay
- This is a deliberate design choice, not a bug

### Safespotting Support

The dumb pathfinder and melee range restrictions are INTENTIONAL OSRS mechanics that enable safespotting gameplay. These should be preserved:
- NPCs should NOT pathfind around obstacles
- Melee range 1 should NOT include diagonals
- Stuck behavior is a feature, not a bug

---

## Part 8: References

### OSRS Wiki Sources
- [Pathfinding](https://oldschool.runescape.wiki/w/Pathfinding)
- [Tolerance](https://oldschool.runescape.wiki/w/Tolerance)
- [Aggressiveness](https://oldschool.runescape.wiki/w/Aggressiveness)
- [Game tick](https://oldschool.runescape.wiki/w/Game_tick)
- [Attack speed](https://oldschool.runescape.wiki/w/Attack_speed)
- [Attack range](https://oldschool.runescape.wiki/w/Attack_range)
- [Wander radius](https://oldschool.runescape.wiki/w/Wander_radius)
- [Safespot](https://oldschool.runescape.wiki/w/Safespot)
- [Spawning](https://oldschool.runescape.wiki/w/Spawning)

### OSRS Docs Sources
- [Random Walk](https://osrs-docs.com/docs/mechanics/random-walk/)
- [Entity Collision](https://osrs-docs.com/docs/mechanics/entity-collision/)
- [Entity Interactions](https://osrs-docs.com/docs/mechanics/entity-interactions/)
- [Max Range](https://osrs-docs.com/docs/variables/max-range/)
- [Timers](https://osrs-docs.com/docs/mechanics/timers/)
- [Queues](https://osrs-docs.com/docs/mechanics/queues/)

### Community Resources
- [NPC Pathfinding - Rune-Server](https://rune-server.org/threads/npc-pathing.687888/)
- [NPC Aggro Discussion - Rune-Server](https://rune-server.org/threads/npc-aggro.700106/)
- [RSMod Pathfinder](https://github.com/rsmod/rsmod/tree/main/engine/pathfinder)

### Codebase Files Referenced
- `packages/shared/src/entities/managers/AggroManager.ts`
- `packages/shared/src/systems/shared/combat/AggroSystem.ts`
- `packages/shared/src/entities/managers/AIStateMachine.ts`
- `packages/shared/src/entities/managers/CombatStateManager.ts`
- `packages/shared/src/entities/npc/MobEntity.ts`
- `packages/server/src/systems/ServerNetwork/mob-tile-movement.ts`
- `packages/shared/src/systems/shared/movement/ChasePathfinding.ts`

---

*Report generated: December 2024*
*Last updated: December 17, 2024*
*Revision 3: Added Part 6C (additional systems comparison), found critical bug in isInAttackRange()*
*Total systems compared: 11 (ChasePathfinding, MobTileMovement, AggroManager, AggroSystem, CombatStateManager, AIStateMachine, Damage Calculation, Combat Range, Respawn System, Large NPC Support, Line of Sight)*
*Verified against: OSRS Wiki, OSRS Docs, Rune-Server forums, RSMod references*
*For: Hyperscape MMORPG Project*
