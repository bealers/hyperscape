# Combat System Architecture

This document provides visual diagrams of the combat system's architecture, including system dependencies, event flow, and state machines.

---

## System Dependency Graph

```
                        ┌──────────────────────────────────────────────────────────────┐
                        │                    COMBAT SYSTEM CORE                         │
                        │                     (CombatSystem.ts)                         │
                        │  - Attack processing     - Hit/miss calculations              │
                        │  - Damage application    - Combat timeout handling            │
                        │  - XP distribution       - PID-based attack ordering          │
                        └────────────────────────────┬─────────────────────────────────┘
                                                     │
              ┌──────────────────────────────────────┼──────────────────────────────────────┐
              │                                      │                                      │
              ▼                                      ▼                                      ▼
┌─────────────────────────────┐    ┌─────────────────────────────┐    ┌─────────────────────────────┐
│   CombatStateService.ts     │    │  CombatAnimationManager.ts  │    │  CombatRotationManager.ts   │
│  ─────────────────────────  │    │  ─────────────────────────  │    │  ─────────────────────────  │
│  - Active combat sessions   │    │  - Attack animation timing  │    │  - Face target rotation     │
│  - Combat start/end         │    │  - Animation queuing        │    │  - Combat stance            │
│  - Session lookup           │    │  - Emote coordination       │    │  - Turn speed               │
└─────────────────────────────┘    └─────────────────────────────┘    └─────────────────────────────┘
              │                                      │
              │                                      ▼
              │                    ┌─────────────────────────────┐
              │                    │   CombatAnimationSync.ts    │
              │                    │  ─────────────────────────  │
              │                    │  - Hit delay scheduling     │
              │                    │  - Hitsplat timing          │
              │                    │  - Attack speed sync        │
              │                    └─────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                    SUPPORTING SYSTEMS                                            │
├─────────────────────────────┬─────────────────────────────┬─────────────────────────────────────┤
│       AggroSystem.ts        │       RangeSystem.ts        │        CombatAntiCheat.ts           │
│  ─────────────────────────  │  ─────────────────────────  │  ─────────────────────────────────  │
│  - Mob aggression logic     │  - Attack range checks      │  - Damage validation                │
│  - Tolerance timer          │  - Weapon-based ranges      │  - XP validation                    │
│  - Combat level checks      │  - Distance calculations    │  - Rate limiting                    │
│  - Multi-combat zones       │  - Line-of-sight            │  - HMAC event signing               │
└─────────────────────────────┴─────────────────────────────┴─────────────────────────────────────┘
              │                           │                               │
              ▼                           ▼                               ▼
┌─────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                    DEATH SYSTEMS                                                 │
├─────────────────────────────────────────────────┬───────────────────────────────────────────────┤
│           PlayerDeathSystem.ts                  │           MobDeathSystem.ts                   │
│  ─────────────────────────────────────────────  │  ───────────────────────────────────────────  │
│  - Respawn handling                             │  - Mob despawn                                │
│  - Gravestone mechanics                         │  - Loot drops                                 │
│  - Item protection                              │  - Respawn timer (tick-based)                 │
│  - Wilderness death rules                       │  - Death animation                            │
└─────────────────────────────────────────────────┴───────────────────────────────────────────────┘
```

---

## Event Flow Diagram

### Attack Request → Damage Applied

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                    CLIENT (Browser)                                               │
│                                                                                                  │
│   [1] Click on target  ──►  [2] ATTACK_MOB event  ──►  WebSocket                                │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
                                                             │
                                                             ▼
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                    SERVER                                                         │
│                                                                                                  │
│   [3] CombatRequestValidator.validate()                                                          │
│        ├── Rate limit check (CombatRateLimiter)                                                 │
│        ├── Distance check (RangeSystem)                                                          │
│        └── Target validity check                                                                 │
│                │                                                                                 │
│                ▼                                                                                 │
│   [4] CombatSystem.startCombat(attackerId, targetId)                                            │
│        ├── Create combat session (CombatStateService)                                           │
│        ├── Record event (EventStore)                                                             │
│        └── Schedule first attack (next available tick)                                           │
│                │                                                                                 │
│                ▼                                                                                 │
│   [5] CombatSystem.processTick() - On attack tick                                               │
│        ├── PID ordering (lower PID attacks first)                                               │
│        ├── CombatCalculations.calculateAccuracy()                                               │
│        ├── SeededRandom.hit(accuracy) → Hit/Miss                                                │
│        │        │                                                                                │
│        │        ├── [HIT] CombatCalculations.calculateMaxHit()                                  │
│        │        │         SeededRandom.damage(0, maxHit) → Damage                               │
│        │        │                                                                                │
│        │        └── [MISS] Damage = 0                                                            │
│        │                                                                                         │
│        ├── Apply damage to target                                                                │
│        ├── Calculate XP (attack + strength/ranged/magic + hitpoints)                            │
│        ├── Record event with checksum (EventStore)                                              │
│        └── Emit COMBAT_DAMAGE_DEALT event                                                        │
│                │                                                                                 │
│                ▼                                                                                 │
│   [6] CombatAntiCheat.validateDamage()                                                          │
│        ├── Check damage ≤ max possible hit                                                      │
│        ├── Verify timing between attacks                                                         │
│        └── Sign event with HMAC                                                                  │
│                │                                                                                 │
│                ▼                                                                                 │
│   [7] Broadcast to clients via WebSocket                                                         │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
                                                             │
                                                             ▼
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                    CLIENT (Browser)                                               │
│                                                                                                  │
│   [8] CombatAnimationSync.scheduleHitsplat()                                                    │
│        ├── Calculate hit delay (melee: 1 tick, ranged/magic: varies by distance)               │
│        └── Queue hitsplat for future tick                                                        │
│                │                                                                                 │
│                ▼                                                                                 │
│   [9] CombatAnimationManager.playAttackAnimation()                                              │
│        └── Trigger attack emote on attacker                                                      │
│                │                                                                                 │
│                ▼                                                                                 │
│   [10] After hit delay: DamageSplatSystem.createDamageSplat()                                   │
│         ├── Red splat (damage > 0) or Blue splat (miss)                                         │
│         └── Float up and fade out animation                                                      │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## State Machine Diagrams

### Player Combat State (PlayerCombatStateManager)

```
                                    ┌─────────────────┐
                                    │     PEACEFUL    │
                                    │                 │
                                    │  autoRetaliate  │
                                    │  = enabled      │
                                    └────────┬────────┘
                                             │
                              ┌──────────────┴──────────────┐
                              │                             │
                         [attack]                    [receive attack]
                              │                             │
                              ▼                             ▼
               ┌──────────────────────┐      ┌──────────────────────┐
               │     IN COMBAT        │      │   AUTO-RETALIATE     │
               │                      │      │                      │
               │  targetId = X        │◄─────│  delay = ceil(speed  │
               │  nextAttackTick = N  │      │           / 2) + 1   │
               └──────────┬───────────┘      └──────────────────────┘
                          │
           ┌──────────────┼──────────────┐
           │              │              │
      [timeout]    [target dies]   [manual stop]
           │              │              │
           ▼              ▼              ▼
    ┌─────────────────────────────────────────┐
    │              PEACEFUL                    │
    │                                          │
    │  targetId = null                         │
    │  Can logout after 9.6s (16 ticks)        │
    └─────────────────────────────────────────┘


AFK Detection:
─────────────
  ┌─────────────────────────────────────────┐
  │  If no action for 20 minutes (2000 ticks)│
  │  Auto-retaliate is DISABLED              │
  │                                           │
  │  Any action resets timer                  │
  └─────────────────────────────────────────┘
```

### Mob Combat State (CombatStateManager)

```
                    ┌─────────────────┐
                    │     IDLE        │
                    │                 │
                    │  targetId: null │
                    │  inCombat: false│
                    └────────┬────────┘
                             │
              ┌──────────────┴──────────────┐
              │                             │
       [player in range]            [receives attack]
       [aggro check pass]                   │
              │                             │
              ▼                             │
    ┌──────────────────┐                    │
    │   AGGRESSIVE     │                    │
    │                  │                    │
    │  Moving toward   │                    │
    │  target          │                    │
    └────────┬─────────┘                    │
             │                              │
        [in attack range]                   │
             │                              │
             ▼                              ▼
    ┌──────────────────────────────────────────┐
    │              IN COMBAT                    │
    │                                           │
    │  targetId = playerId                      │
    │  inCombat = true                          │
    │  nextAttackTick = currentTick + speed     │
    │                                           │
    │  On each tick:                            │
    │    if canAttack(tick): performAttack()    │
    └───────────────────┬──────────────────────┘
                        │
         ┌──────────────┼──────────────┐
         │              │              │
    [target moves    [target dies]  [mob dies]
     out of range]       │              │
         │              │              │
         ▼              ▼              ▼
    ┌─────────┐    ┌─────────────┐  ┌─────────────┐
    │ CHASING │    │    IDLE     │  │    DEAD     │
    │         │    │             │  │             │
    │ Path to │    │ Clear state │  │ Death anim  │
    │ target  │    │ Reset timer │  │ Drop loot   │
    └─────────┘    └─────────────┘  │ Respawn     │
                                    └─────────────┘
```

---

## Tick Timing Diagram

### OSRS Tick Cycle (600ms)

```
     0ms        200ms       400ms       600ms       800ms      1000ms      1200ms
      │           │           │           │           │           │           │
      ├───────────┼───────────┼───────────┤───────────┼───────────┼───────────┤
      │                                   │                                   │
      │◄──────── Tick N ─────────────────►│◄──────── Tick N+1 ──────────────►│
      │                                   │                                   │
      │  [1] Process inputs               │  [1] Process inputs               │
      │  [2] Update positions             │  [2] Update positions             │
      │  [3] Process combat               │  [3] Process combat               │
      │  [4] Apply damage                 │  [4] Apply damage                 │
      │  [5] Check deaths                 │  [5] Check deaths                 │
      │  [6] Broadcast state              │  [6] Broadcast state              │
      │                                   │                                   │


Attack Speed Example (4 ticks = 2.4 seconds):
─────────────────────────────────────────────

Tick:    0       1       2       3       4       5       6       7       8
         │       │       │       │       │       │       │       │       │
         │ ATTACK│       │       │       │ ATTACK│       │       │       │ ATTACK
         │   ▼   │       │       │       │   ▼   │       │       │       │   ▼
         │  [HIT]│       │       │       │ [MISS]│       │       │       │  [HIT]
         │       │       │       │       │       │       │       │       │
         │◄──────── 4 ticks ────────────►│◄──────── 4 ticks ────────────►│


Hit Delay Timing:
─────────────────

MELEE (1 tick delay):
  Tick N: Attack animation starts
  Tick N+1: Hitsplat appears, damage applied

RANGED (distance-based):
  Tick N: Projectile fired
  Tick N + ceil(distance/3) + 1: Hitsplat appears

MAGIC (distance-based):
  Tick N: Spell cast animation
  Tick N + ceil(distance/3) + 2: Hitsplat appears
```

---

## Combat Formulas (OSRS-Accurate)

### Accuracy Roll

```
Attack Roll = (Effective Attack Level) × (Equipment Attack Bonus + 64)

Effective Attack Level = floor((Attack Level + Style Bonus + 8) × Prayer Multiplier)

Style Bonuses:
  Accurate: +3
  Aggressive: +0
  Defensive: +0
  Controlled: +1

Hit Chance:
  if (attackRoll > defenceRoll):
    hitChance = 1 - (defenceRoll + 2) / (2 × (attackRoll + 1))
  else:
    hitChance = attackRoll / (2 × (defenceRoll + 1))
```

### Max Hit

```
Effective Strength = floor((Strength Level + Style Bonus + 8) × Prayer Multiplier)

Max Hit = floor(0.5 + Effective Strength × (Strength Bonus + 64) / 640)

Damage Roll = random(0, maxHit) // Uniform distribution
```

### Combat Level

```
Base = 0.25 × (Defence + Hitpoints + floor(Prayer / 2))
Melee = 0.325 × (Attack + Strength)
Ranged = 0.325 × (floor(Ranged / 2) + Ranged)
Magic = 0.325 × (floor(Magic / 2) + Magic)

Combat Level = floor(Base + max(Melee, Ranged, Magic))
```

---

## File Reference

| File | Lines | Purpose |
|------|-------|---------|
| `CombatSystem.ts` | ~2500 | Core combat processing |
| `CombatStateService.ts` | ~300 | Combat session management |
| `CombatStateManager.ts` | ~250 | Mob combat state |
| `PlayerCombatStateManager.ts` | ~400 | Player combat state |
| `CombatAnimationManager.ts` | ~200 | Animation triggering |
| `CombatAnimationSync.ts` | ~400 | Hit delay scheduling |
| `CombatRotationManager.ts` | ~150 | Entity facing |
| `CombatCalculations.ts` | ~450 | Damage/accuracy formulas |
| `CombatLevelCalculator.ts` | ~100 | Combat level formula |
| `HitDelayCalculator.ts` | ~80 | Hit delay formulas |
| `AggroSystem.ts` | ~600 | Mob aggression |
| `RangeSystem.ts` | ~200 | Attack range checks |
| `CombatAntiCheat.ts` | ~350 | Security validation |
| `EventStore.ts` | ~400 | Combat recording |
| `CombatReplayService.ts` | ~570 | Replay/investigation |
| `PlayerDeathSystem.ts` | ~400 | Player death handling |
| `MobDeathSystem.ts` | ~80 | Mob death handling |

---

## OSRS Wiki References

| Mechanic | URL |
|----------|-----|
| Combat | https://oldschool.runescape.wiki/w/Combat |
| Attack Speed | https://oldschool.runescape.wiki/w/Attack_speed |
| Accuracy | https://oldschool.runescape.wiki/w/Accuracy |
| Max Hit | https://oldschool.runescape.wiki/w/Maximum_hit |
| Combat Level | https://oldschool.runescape.wiki/w/Combat_level |
| Auto Retaliate | https://oldschool.runescape.wiki/w/Auto_Retaliate |
| Hitsplats | https://oldschool.runescape.wiki/w/Hitsplat |
| Respawn Rate | https://oldschool.runescape.wiki/w/Respawn_rate |
| Drop Mechanics | https://oldschool.runescape.wiki/w/Drop |

---

*Generated from combat system audit on 2025-12-19*
