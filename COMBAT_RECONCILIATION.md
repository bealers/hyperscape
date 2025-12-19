# Combat State Reconciliation

This document describes how combat state is synchronized between client and server, how client prediction works, and how desync is detected and recovered.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                           SERVER (Authoritative)                      │
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐                │
│  │ CombatSystem │   │ EventStore  │   │    RNG      │                │
│  │ (tick-based) │   │ (recording) │   │ (SeededRng) │                │
│  └──────┬──────┘   └──────┬──────┘   └──────┬──────┘                │
│         │                 │                 │                        │
│         ▼                 ▼                 ▼                        │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │              Combat Event + Checksum + RNG State              │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                              │                                       │
└──────────────────────────────┼───────────────────────────────────────┘
                               │ WebSocket
                               ▼
┌──────────────────────────────────────────────────────────────────────┐
│                           CLIENT (Prediction)                         │
│  ┌─────────────────┐   ┌──────────────────┐   ┌──────────────────┐  │
│  │  CombatAnimate  │   │ TileInterpolator │   │  DamageSplats    │  │
│  │  (visual only)  │   │ (path prediction)│   │  (visual only)   │  │
│  └─────────────────┘   └──────────────────┘   └──────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Server-Authoritative Model

The combat system uses a **server-authoritative** model where:

1. **Server is the single source of truth** for all combat state
2. **Client predicts movement** but receives authoritative combat results
3. **Damage is never predicted** - always comes from server
4. **All RNG happens on server** with deterministic SeededRandom

### What the Server Controls

| State | Location | Description |
|-------|----------|-------------|
| Health/Damage | `CombatSystem.ts` | All HP changes are server-authoritative |
| Hit/Miss Rolls | `CombatCalculations.ts` | Uses SeededRandom for determinism |
| Combat State | `CombatStateManager.ts` | In-combat, target, cooldowns |
| Attack Timing | `CombatSystem.ts` | Tick-based attack cooldowns (OSRS-accurate) |
| XP Gains | `CombatSystem.ts` | HMAC-signed XP events |

### What the Client Predicts

| State | Location | Description |
|-------|----------|-------------|
| Movement | `TileInterpolator.ts` | Interpolates along server-provided path |
| Animations | `CombatAnimationSync.ts` | Plays attack/hit animations |
| Visual Effects | `DamageSplatSystem.ts` | Renders damage numbers |
| Camera | `ClientCameraSystem.ts` | Follows player position |

---

## Event Recording System

### EventStore (`src/systems/shared/EventStore.ts`)

The EventStore provides a ring buffer for combat events with these capabilities:

```typescript
// Record every combat event with checksum
eventStore.record({
  tick: currentTick,
  type: GameEventType.COMBAT_DAMAGE,
  entityId: attackerId,
  payload: { damage, targetId, rngState }
}, stateInfo, snapshot);
```

**Key features:**
- **Ring Buffer**: Keeps last 100,000 events (configurable)
- **Periodic Snapshots**: Full game state every 100 ticks (~1 minute)
- **FNV-1a Checksums**: Fast hash of critical state for desync detection
- **RNG State Capture**: Enables deterministic replay

### CombatReplayService (`src/systems/shared/combat/CombatReplayService.ts`)

Higher-level API for investigating combat issues:

```typescript
const replayService = new CombatReplayService(eventStore);

// Investigate suspicious player
const report = replayService.investigateEntity("player123", 1000, 2000);
console.log(report.suspiciousEvents); // Damage > max, rapid attacks, etc.

// Replay combat sequence
const timeline = replayService.getCombatTimeline("player1", "mob1", 1500);
const replay = replayService.replayFromSnapshot(1500);
```

---

## Desync Detection

### Checksum Verification

Every combat event includes a FNV-1a checksum of critical game state:

```typescript
interface GameStateInfo {
  currentTick: number;
  playerCount: number;
  activeCombats: number;
}

// Checksum computed as FNV-1a hash
private computeChecksum(stateInfo: GameStateInfo): number {
  const str = JSON.stringify({
    tick: stateInfo.currentTick,
    playerCount: stateInfo.playerCount,
    combatCount: stateInfo.activeCombats,
  });
  // FNV-1a hash implementation
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash * 16777619) >>> 0;
  }
  return hash;
}
```

### Suspicious Event Detection

The CombatReplayService automatically flags:

1. **Impossible Damage**: Damage exceeding expected max hit
2. **Rapid Attacks**: More than 5 attacks per second
3. **State Inconsistencies**: COMBAT_END while not in combat

```typescript
// Configure detection thresholds
replayService.configure({
  maxExpectedDamage: 100,
  maxExpectedHitsPerSecond: 5
});
```

### Event Sequence Verification

Validates logical event ordering:

```typescript
const result = replayService.verifyEventSequence(startTick, endTick);
if (!result.valid) {
  for (const error of result.errors) {
    console.log(`Tick ${error.tick}: ${error.error}`);
  }
}
```

---

## Movement Prediction & Sync

### TileInterpolator (`src/systems/client/TileInterpolator.ts`)

The client uses path prediction for smooth movement:

```
1. Server calculates BFS path
2. Server sends FULL PATH in tileMovementStart
3. Client walks through path at FIXED SPEED
4. Server sends position sync every 600ms tick
5. Client uses server updates for verification only
```

**Desync handling:**

```typescript
// If too far from server position, snap immediately
const MAX_DESYNC_DISTANCE = Math.max(TILES_PER_TICK_RUN * 2, 8);

if (distanceFromServer > MAX_DESYNC_DISTANCE) {
  // Teleport to server position (no interpolation)
  entity.position.copy(serverPosition);
}
```

---

## Recovery Procedures

### For Combat Desync

When a checksum mismatch is detected:

1. **Log the event** for investigation
2. **Use snapshot for recovery**: Load nearest snapshot before desync
3. **Replay events**: Re-apply events from snapshot to current tick
4. **Notify player** if state correction is significant

```typescript
// Get nearest snapshot before desync
const snapshot = eventStore.getNearestSnapshot(desyncTick);

// Replay events from snapshot
const events = eventStore.getEventsInRange(snapshot.tick, currentTick);
for (const event of events) {
  replayEvent(event, snapshot.rngState);
}
```

### For Movement Desync

When position differs significantly from server:

1. **Snap immediately** if distance > MAX_DESYNC_DISTANCE
2. **Gradual correction** for small discrepancies using catch-up multiplier

```typescript
// Exponential smoothing for catch-up
const CATCHUP_SMOOTHING_RATE = 8.0;
const CATCHUP_MAX_CHANGE_PER_SEC = 3.0;
```

---

## Admin Investigation API

The EventStore integrates with admin endpoints for investigation:

### Available Queries

| Endpoint | Description |
|----------|-------------|
| `GET /admin/combat/entity/:id` | Get all events for an entity |
| `GET /admin/combat/timeline/:attacker/:target` | Get combat session timeline |
| `GET /admin/combat/investigate/:id` | Full investigation report |
| `GET /admin/combat/replay/:tick` | Replay from snapshot |

### Example Investigation Flow

```bash
# 1. Player reports: "I got hit for 50 when max is 20!"

# 2. Admin queries combat events
GET /admin/combat/investigate/player123?start=1000&end=2000

# 3. Response includes suspicious events
{
  "suspiciousEvents": [
    {
      "event": { "tick": 1523, "type": "COMBAT_DAMAGE", "damage": 50 },
      "reason": "Damage 50 exceeds max expected 20"
    }
  ]
}

# 4. Replay combat sequence for verification
GET /admin/combat/replay/1520

# 5. Check if RNG state was modified
# (deterministic replay should produce same results)
```

---

## OSRS Accuracy Notes

- **Tick timing**: All combat uses 600ms ticks matching OSRS
- **Attack cooldowns**: Managed per-entity in ticks (e.g., 4 ticks = 2.4s)
- **Retaliation delay**: `ceil(attack_speed / 2) + 1` ticks per OSRS wiki
- **Damage formulas**: Use OSRS wiki accuracy/max hit formulas
- **RNG**: SeededRandom for deterministic, replayable combat

---

## Related Files

| File | Purpose |
|------|---------|
| `EventStore.ts` | Ring buffer event recording |
| `CombatReplayService.ts` | High-level replay/investigation |
| `CombatSystem.ts` | Core combat logic |
| `TileInterpolator.ts` | Movement prediction |
| `CombatAnimationSync.ts` | Animation scheduling |
| `SeededRandom.ts` | Deterministic RNG |

---

*Generated from combat system audit on 2025-12-19*
