# Level-Up Notification System - Improvement Plan

## Objective

Raise the level-up notification system from **8/10 to 9/10+** production readiness based on the technical audit criteria.

## Current Issues Summary

| Priority | Issue | Impact | Effort |
|----------|-------|--------|--------|
| **Critical** | No unit tests | Best Practices: 7/10 | Medium |
| **Medium** | Duplicated level detection logic | Game Studio: 8/10 | Low |
| **Medium** | Type assertions instead of guards | Production Quality: 8/10 | Low |
| **Minor** | Array allocations in state updates | Memory Hygiene: 7/10 | Low |
| **Minor** | DIP - Direct world dependencies | SOLID: 9/10 | Medium |

---

## Phase 1: Centralize Level Detection (Priority: Medium)

### Problem
Both `useLevelUpState.ts` and `useXPOrbState.ts` independently track previous levels and detect level-ups. This violates DRY and could cause desync issues.

### Solution
Have `useXPOrbState` emit a client-side level-up event that `useLevelUpState` subscribes to.

### Existing Infrastructure (Verified)
> **IMPORTANT**: The event type `SKILLS_LEVEL_UP = "skills:level_up"` already exists at `event-types.ts:343`.
> It is emitted by `SkillsSystem.ts:586` on the server, BUT it is **NOT sent over WebSocket** to clients.
> The client must emit this event locally when it detects a level-up from XP drop data.

### Files to Modify
- `packages/shared/src/types/events/event-payloads.ts` (add SkillsLevelUpEvent interface and EventMap entry)
- `packages/client/src/game/hud/xp-orb/useXPOrbState.ts` (emit event)
- `packages/client/src/game/hud/level-up/useLevelUpState.ts` (subscribe to event, remove duplicate tracking)

### Implementation

#### 1.1 Event Type Already Exists (No Changes Needed)

```typescript
// packages/shared/src/types/events/event-types.ts
// ALREADY EXISTS at line 343:
SKILLS_LEVEL_UP = "skills:level_up",
```

#### 1.2 Add Level-Up Event Payload to EventMap

The server already emits this event at `SkillsSystem.ts:586` with this structure:
```typescript
{ entityId, skill, oldLevel, newLevel, totalLevel }
```

However, `SKILLS_LEVEL_UP` is **NOT in EventMap** (missing typed payload). We need to add it:

```typescript
// packages/shared/src/types/events/event-payloads.ts

// Add this interface near other skill-related types:
export interface SkillsLevelUpEvent {
  entityId?: string;      // Server includes this
  skill: string;
  oldLevel: number;
  newLevel: number;
  totalLevel?: number;    // Server includes this
  timestamp?: number;     // Client can add this
}

// Add to EventMap interface:
export interface EventMap {
  // ... existing entries ...
  [EventType.SKILLS_LEVEL_UP]: SkillsLevelUpEvent;
}
```

#### 1.3 Emit from useXPOrbState (Single Source of Truth)

```typescript
// packages/client/src/game/hud/xp-orb/useXPOrbState.ts
// In handleXPDrop, after detecting level-up:

if (prevLevel !== undefined && data.newLevel > prevLevel) {
  setLevelUpSkill(skillKey);

  // Emit client-side level-up event (reuses existing SKILLS_LEVEL_UP type)
  // Note: Server also emits this event but doesn't send it over WebSocket
  world.emit(EventType.SKILLS_LEVEL_UP, {
    skill: data.skill,
    oldLevel: prevLevel,
    newLevel: data.newLevel,
    timestamp: Date.now(),
  } satisfies SkillsLevelUpEvent);

  clearTimeout(levelUpTimeout);
  levelUpTimeout = setTimeout(() => {
    setLevelUpSkill(null);
  }, 600);
}
```

#### 1.4 Simplify useLevelUpState (Subscribe Only)

```typescript
// packages/client/src/game/hud/level-up/useLevelUpState.ts
import { EventType } from "@hyperscape/shared";
import type { SkillsLevelUpEvent } from "@hyperscape/shared";

export function useLevelUpState(world: ClientWorld): UseLevelUpStateResult {
  const [levelUpQueue, setLevelUpQueue] = useState<LevelUpEvent[]>([]);
  const [currentLevelUp, setCurrentLevelUp] = useState<LevelUpEvent | null>(null);

  // Subscribe to client-side level-up event (no duplicate tracking)
  useEffect(() => {
    const handleLevelUp = (data: SkillsLevelUpEvent) => {
      const event: LevelUpEvent = {
        skill: data.skill,
        oldLevel: data.oldLevel,
        newLevel: data.newLevel,
        timestamp: data.timestamp,
      };
      setLevelUpQueue((prev) => [...prev, event]);
    };

    world.on(EventType.SKILLS_LEVEL_UP, handleLevelUp);
    return () => {
      world.off(EventType.SKILLS_LEVEL_UP, handleLevelUp);
    };
  }, [world]);

  // ... rest unchanged
}
```

### Benefits
- Single source of truth for level-up detection
- Eliminates duplicate `previousLevelsRef` tracking
- Makes level-up events available to other systems (achievements, broadcasting, etc.)
- Reduces code by ~20 lines

---

## Phase 2: Replace Type Assertions with Type Guards (Priority: Medium)

### Problem
Using `as` type assertions bypasses TypeScript's type checking and can hide runtime errors.

```typescript
// Current (unsafe)
const audio = world.audio as ClientAudio | undefined;
const chat = world.chat as Chat | undefined;
```

### Solution
Create proper type guard functions that validate at runtime.

### Files to Modify
- `packages/client/src/game/hud/level-up/LevelUpNotification.tsx`
- `packages/client/src/game/hud/level-up/utils.ts` (add type guards)

### Implementation

#### 2.1 Add Type Guards to utils.ts

```typescript
// packages/client/src/game/hud/level-up/utils.ts

import type { ClientAudio, Chat } from "@hyperscape/shared";

/**
 * Type guard for ClientAudio system
 * Validates the object has required AudioContext properties
 */
export function isClientAudio(obj: unknown): obj is ClientAudio {
  if (typeof obj !== "object" || obj === null) return false;
  const audio = obj as Record<string, unknown>;
  return (
    "ctx" in audio &&
    audio.ctx instanceof AudioContext &&
    "groupGains" in audio &&
    typeof audio.groupGains === "object" &&
    "ready" in audio &&
    typeof audio.ready === "function"
  );
}

/**
 * Type guard for Chat system
 * Validates the object has required add method
 */
export function isChat(obj: unknown): obj is Chat {
  if (typeof obj !== "object" || obj === null) return false;
  const chat = obj as Record<string, unknown>;
  return "add" in chat && typeof chat.add === "function";
}
```

#### 2.2 Update LevelUpNotification.tsx

```typescript
// packages/client/src/game/hud/level-up/LevelUpNotification.tsx

import { isClientAudio, isChat, capitalizeSkill } from "./utils";

// In useEffect:
useEffect(() => {
  if (!currentLevelUp) return;
  if (processedRef.current.has(currentLevelUp.timestamp)) return;
  processedRef.current.add(currentLevelUp.timestamp);

  // === AUDIO (with type guard) ===
  if (isClientAudio(world.audio)) {
    const audio = world.audio;
    const sfxVolume = audio.groupGains?.sfx?.gain?.value ?? 1;
    if (sfxVolume > 0) {
      audio.ready(() => {
        playLevelUpFanfare(
          currentLevelUp.newLevel,
          audio.ctx,
          audio.groupGains?.sfx,
        );
      });
    }
  }

  // === CHAT MESSAGE (with type guard) ===
  if (isChat(world.chat)) {
    const chat = world.chat;
    const messageBody = `Congratulations! You've advanced a ${capitalizeSkill(currentLevelUp.skill)} level. You are now level ${currentLevelUp.newLevel}.`;

    const message: ChatMessage = {
      id: uuid(),
      from: "",
      body: messageBody,
      text: messageBody,
      timestamp: Date.now(),
      createdAt: new Date().toISOString(),
    };

    chat.add(message, false);
  }
}, [currentLevelUp, world]);
```

#### 2.3 Update index.ts exports

```typescript
// packages/client/src/game/hud/level-up/index.ts
export {
  normalizeSkillName,
  capitalizeSkill,
  isClientAudio,
  isChat,
} from "./utils";
```

### Benefits
- Runtime type safety with proper validation
- Better error messages if types are wrong
- TypeScript narrowing works correctly after guards
- Reusable guards for other systems

---

## Phase 3: Add Unit Tests (Priority: Critical)

### Problem
Zero test coverage. Cannot verify correctness or catch regressions.

### Solution
Add comprehensive unit tests using Vitest (project's test framework).

### Files to Create
- `packages/client/src/game/hud/level-up/__tests__/utils.test.ts`
- `packages/client/src/game/hud/level-up/__tests__/useLevelUpState.test.ts`
- `packages/client/src/game/hud/level-up/__tests__/levelUpAudio.test.ts`
- `packages/shared/src/data/__tests__/skill-unlocks.test.ts`

### Implementation

#### 3.1 Utils Tests

```typescript
// packages/client/src/game/hud/level-up/__tests__/utils.test.ts
import { describe, it, expect } from "vitest";
import {
  normalizeSkillName,
  capitalizeSkill,
  isClientAudio,
  isChat,
} from "../utils";

describe("normalizeSkillName", () => {
  it("converts to lowercase", () => {
    expect(normalizeSkillName("Woodcutting")).toBe("woodcutting");
    expect(normalizeSkillName("ATTACK")).toBe("attack");
  });

  it("removes spaces", () => {
    expect(normalizeSkillName("Hit Points")).toBe("hitpoints");
  });

  it("handles empty string", () => {
    expect(normalizeSkillName("")).toBe("");
  });
});

describe("capitalizeSkill", () => {
  it("capitalizes first letter", () => {
    expect(capitalizeSkill("woodcutting")).toBe("Woodcutting");
    expect(capitalizeSkill("attack")).toBe("Attack");
  });

  it("lowercases rest of string", () => {
    expect(capitalizeSkill("WOODCUTTING")).toBe("Woodcutting");
  });

  it("handles single character", () => {
    expect(capitalizeSkill("a")).toBe("A");
  });

  it("handles empty string", () => {
    expect(capitalizeSkill("")).toBe("");
  });
});

describe("isClientAudio", () => {
  it("returns false for null/undefined", () => {
    expect(isClientAudio(null)).toBe(false);
    expect(isClientAudio(undefined)).toBe(false);
  });

  it("returns false for non-object", () => {
    expect(isClientAudio("string")).toBe(false);
    expect(isClientAudio(123)).toBe(false);
  });

  it("returns false for object missing ctx", () => {
    expect(isClientAudio({ groupGains: {}, ready: () => {} })).toBe(false);
  });

  it("returns true for valid ClientAudio-like object", () => {
    const mockAudio = {
      ctx: new AudioContext(),
      groupGains: { sfx: { gain: { value: 1 } } },
      ready: () => {},
    };
    expect(isClientAudio(mockAudio)).toBe(true);
  });
});

describe("isChat", () => {
  it("returns false for null/undefined", () => {
    expect(isChat(null)).toBe(false);
    expect(isChat(undefined)).toBe(false);
  });

  it("returns false for object without add method", () => {
    expect(isChat({})).toBe(false);
    expect(isChat({ add: "not a function" })).toBe(false);
  });

  it("returns true for object with add function", () => {
    expect(isChat({ add: () => {} })).toBe(true);
  });
});
```

#### 3.2 Level-Up Audio Tests

```typescript
// packages/client/src/game/hud/level-up/__tests__/levelUpAudio.test.ts
import { describe, it, expect } from "vitest";
import { isMilestoneLevel } from "../levelUpAudio";

describe("isMilestoneLevel", () => {
  it("returns true for milestone levels", () => {
    expect(isMilestoneLevel(10)).toBe(true);
    expect(isMilestoneLevel(25)).toBe(true);
    expect(isMilestoneLevel(50)).toBe(true);
    expect(isMilestoneLevel(75)).toBe(true);
    expect(isMilestoneLevel(99)).toBe(true);
  });

  it("returns false for non-milestone levels", () => {
    expect(isMilestoneLevel(1)).toBe(false);
    expect(isMilestoneLevel(9)).toBe(false);
    expect(isMilestoneLevel(11)).toBe(false);
    expect(isMilestoneLevel(49)).toBe(false);
    expect(isMilestoneLevel(98)).toBe(false);
  });

  it("returns false for edge cases", () => {
    expect(isMilestoneLevel(0)).toBe(false);
    expect(isMilestoneLevel(-1)).toBe(false);
    expect(isMilestoneLevel(100)).toBe(false);
  });
});
```

#### 3.3 Skill Unlocks Tests

```typescript
// packages/shared/src/data/__tests__/skill-unlocks.test.ts
import { describe, it, expect } from "vitest";
import {
  getUnlocksAtLevel,
  getUnlocksUpToLevel,
  SKILL_UNLOCKS,
} from "../skill-unlocks";

describe("getUnlocksAtLevel", () => {
  it("returns unlocks at exact level", () => {
    const unlocks = getUnlocksAtLevel("attack", 40);
    expect(unlocks).toHaveLength(1);
    expect(unlocks[0].description).toBe("Rune weapons");
  });

  it("returns empty array for level with no unlocks", () => {
    const unlocks = getUnlocksAtLevel("attack", 2);
    expect(unlocks).toHaveLength(0);
  });

  it("returns empty array for unknown skill", () => {
    const unlocks = getUnlocksAtLevel("unknownskill", 10);
    expect(unlocks).toHaveLength(0);
  });

  it("is case-insensitive", () => {
    const lower = getUnlocksAtLevel("attack", 40);
    const upper = getUnlocksAtLevel("ATTACK", 40);
    const mixed = getUnlocksAtLevel("Attack", 40);
    expect(lower).toEqual(upper);
    expect(lower).toEqual(mixed);
  });

  it("returns multiple unlocks if multiple exist at level", () => {
    // Verify there's at least one skill with multiple unlocks at same level
    // or test with a skill that has multiple
    const unlocks = getUnlocksAtLevel("constitution", 10);
    expect(unlocks.length).toBeGreaterThanOrEqual(1);
  });
});

describe("getUnlocksUpToLevel", () => {
  it("returns all unlocks up to and including level", () => {
    const unlocks = getUnlocksUpToLevel("attack", 10);
    expect(unlocks.length).toBeGreaterThan(0);
    unlocks.forEach((unlock) => {
      expect(unlock.level).toBeLessThanOrEqual(10);
    });
  });

  it("returns empty array for level 0", () => {
    const unlocks = getUnlocksUpToLevel("attack", 0);
    expect(unlocks).toHaveLength(0);
  });

  it("returns all unlocks for level 99", () => {
    const unlocks = getUnlocksUpToLevel("attack", 99);
    const allUnlocks = SKILL_UNLOCKS["attack"];
    expect(unlocks).toHaveLength(allUnlocks?.length ?? 0);
  });
});

describe("SKILL_UNLOCKS data integrity", () => {
  it("all skills have sorted levels", () => {
    Object.entries(SKILL_UNLOCKS).forEach(([skill, unlocks]) => {
      for (let i = 1; i < unlocks.length; i++) {
        expect(unlocks[i].level).toBeGreaterThanOrEqual(unlocks[i - 1].level);
      }
    });
  });

  it("all levels are within valid range (1-99)", () => {
    Object.entries(SKILL_UNLOCKS).forEach(([skill, unlocks]) => {
      unlocks.forEach((unlock) => {
        expect(unlock.level).toBeGreaterThanOrEqual(1);
        expect(unlock.level).toBeLessThanOrEqual(99);
      });
    });
  });

  it("all unlocks have non-empty descriptions", () => {
    Object.entries(SKILL_UNLOCKS).forEach(([skill, unlocks]) => {
      unlocks.forEach((unlock) => {
        expect(unlock.description.length).toBeGreaterThan(0);
      });
    });
  });

  it("all unlock types are valid", () => {
    const validTypes = ["item", "ability", "area", "quest", "activity"];
    Object.entries(SKILL_UNLOCKS).forEach(([skill, unlocks]) => {
      unlocks.forEach((unlock) => {
        expect(validTypes).toContain(unlock.type);
      });
    });
  });
});
```

#### 3.4 useLevelUpState Tests (React Hook Testing)

```typescript
// packages/client/src/game/hud/level-up/__tests__/useLevelUpState.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useLevelUpState } from "../useLevelUpState";
import { EventType } from "@hyperscape/shared";

// Mock world object
function createMockWorld() {
  const listeners = new Map<string, Set<Function>>();

  return {
    on: vi.fn((event: string, handler: Function) => {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(handler);
    }),
    off: vi.fn((event: string, handler: Function) => {
      listeners.get(event)?.delete(handler);
    }),
    emit: (event: string, data: unknown) => {
      listeners.get(event)?.forEach((handler) => handler(data));
    },
  };
}

describe("useLevelUpState", () => {
  let mockWorld: ReturnType<typeof createMockWorld>;

  beforeEach(() => {
    mockWorld = createMockWorld();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("subscribes to SKILLS_LEVEL_UP on mount", () => {
    renderHook(() => useLevelUpState(mockWorld as never));
    expect(mockWorld.on).toHaveBeenCalledWith(
      EventType.SKILLS_LEVEL_UP,
      expect.any(Function)
    );
  });

  it("unsubscribes on unmount", () => {
    const { unmount } = renderHook(() => useLevelUpState(mockWorld as never));
    unmount();
    expect(mockWorld.off).toHaveBeenCalledWith(
      EventType.SKILLS_LEVEL_UP,
      expect.any(Function)
    );
  });

  it("returns null currentLevelUp initially", () => {
    const { result } = renderHook(() => useLevelUpState(mockWorld as never));
    expect(result.current.currentLevelUp).toBeNull();
  });

  it("queues level-up when event received", () => {
    const { result } = renderHook(() => useLevelUpState(mockWorld as never));

    act(() => {
      mockWorld.emit(EventType.SKILLS_LEVEL_UP, {
        skill: "Woodcutting",
        oldLevel: 1,
        newLevel: 2,
        timestamp: Date.now(),
      });
    });

    expect(result.current.currentLevelUp).not.toBeNull();
    expect(result.current.currentLevelUp?.skill).toBe("Woodcutting");
    expect(result.current.currentLevelUp?.newLevel).toBe(2);
  });

  it("dismissLevelUp clears current level-up", () => {
    const { result } = renderHook(() => useLevelUpState(mockWorld as never));

    act(() => {
      mockWorld.emit(EventType.SKILLS_LEVEL_UP, {
        skill: "Attack",
        oldLevel: 1,
        newLevel: 2,
        timestamp: Date.now(),
      });
    });

    expect(result.current.currentLevelUp).not.toBeNull();

    act(() => {
      result.current.dismissLevelUp();
    });

    expect(result.current.currentLevelUp).toBeNull();
  });

  it("queues multiple level-ups and processes sequentially", () => {
    const { result } = renderHook(() => useLevelUpState(mockWorld as never));

    act(() => {
      mockWorld.emit(EventType.SKILLS_LEVEL_UP, {
        skill: "Attack",
        oldLevel: 1,
        newLevel: 2,
        timestamp: Date.now(),
      });
      mockWorld.emit(EventType.SKILLS_LEVEL_UP, {
        skill: "Strength",
        oldLevel: 1,
        newLevel: 2,
        timestamp: Date.now() + 1,
      });
    });

    // First level-up shown
    expect(result.current.currentLevelUp?.skill).toBe("Attack");

    // Dismiss first
    act(() => {
      result.current.dismissLevelUp();
    });

    // Second level-up shown
    expect(result.current.currentLevelUp?.skill).toBe("Strength");

    // Dismiss second
    act(() => {
      result.current.dismissLevelUp();
    });

    // Queue empty
    expect(result.current.currentLevelUp).toBeNull();
  });
});
```

### Benefits
- Catch regressions early
- Document expected behavior
- Enable confident refactoring
- Required for 9/10 rating

---

## Phase 4: Optimize Memory Allocations (Priority: Minor)

### Problem
Some allocations in event handlers and state updates.

### Solution
Pre-allocate reusable objects where practical.

### Files to Modify
- `packages/client/src/game/hud/level-up/useLevelUpState.ts`
- `packages/client/src/game/hud/level-up/LevelUpNotification.tsx`

### Implementation

#### 4.1 Optimize Queue Updates

```typescript
// packages/client/src/game/hud/level-up/useLevelUpState.ts

// Use functional update that mutates minimally
const handleLevelUp = useCallback((data: SkillLevelUpEvent) => {
  setLevelUpQueue((prev) => {
    // Avoid spread if possible - use concat for single item
    const event: LevelUpEvent = {
      skill: data.skill,
      oldLevel: data.oldLevel,
      newLevel: data.newLevel,
      timestamp: data.timestamp,
    };
    return prev.concat(event); // Slightly more efficient than [...prev, event]
  });
}, []);
```

#### 4.2 Pre-compute ISO String Pattern

```typescript
// packages/client/src/game/hud/level-up/LevelUpNotification.tsx

// Cache the message template
const createChatMessage = useCallback((levelUp: LevelUpEvent): ChatMessage => {
  const messageBody = `Congratulations! You've advanced a ${capitalizeSkill(levelUp.skill)} level. You are now level ${levelUp.newLevel}.`;
  const now = Date.now();

  return {
    id: uuid(),
    from: "",
    body: messageBody,
    text: messageBody,
    timestamp: now,
    createdAt: new Date(now).toISOString(),
  };
}, []);
```

### Benefits
- Reduced GC pressure
- More predictable performance
- Minor improvement (low priority)

---

## Phase 5: Improve Dependency Inversion (Priority: Minor)

### Problem
Direct dependencies on `world.audio` and `world.chat` make testing harder and violate DIP.

### Solution
Accept audio and chat systems as optional props with world as fallback.

### Files to Modify
- `packages/client/src/game/hud/level-up/LevelUpNotification.tsx`

### Implementation

```typescript
// packages/client/src/game/hud/level-up/LevelUpNotification.tsx

interface LevelUpNotificationProps {
  world: ClientWorld;
  // Optional dependency injection for testing
  audioSystem?: ClientAudio;
  chatSystem?: Chat;
}

export function LevelUpNotification({
  world,
  audioSystem,
  chatSystem,
}: LevelUpNotificationProps) {
  // Use injected dependencies or fall back to world
  const audio = audioSystem ?? (isClientAudio(world.audio) ? world.audio : undefined);
  const chat = chatSystem ?? (isChat(world.chat) ? world.chat : undefined);

  // ... rest of implementation uses audio and chat directly
}
```

### Benefits
- Easier unit testing with mocks
- Follows Dependency Inversion Principle
- More flexible composition

---

## Implementation Order

| Phase | Priority | Effort | Impact on Score |
|-------|----------|--------|-----------------|
| **Phase 3** | Critical | Medium | +1.0 (7→8 Best Practices) |
| **Phase 1** | Medium | Low | +0.5 (Game Studio cleanliness) |
| **Phase 2** | Medium | Low | +0.5 (Production Quality) |
| **Phase 4** | Minor | Low | +0.25 (Memory Hygiene) |
| **Phase 5** | Minor | Medium | +0.25 (SOLID) |

**Recommended order:** Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5

---

## Expected Final Scores

| Criterion | Current | After Improvements |
|-----------|---------|-------------------|
| Production Quality Code | 8/10 | 9/10 |
| Best Practices | 7/10 | 9/10 |
| OWASP Security | 9/10 | 9/10 |
| Game Studio Audit | 8/10 | 9/10 |
| Memory & Allocation Hygiene | 7/10 | 8/10 |
| SOLID Principles | 9/10 | 10/10 |

**Final Score: 9.0/10** (up from 8.0/10)

---

## Testing Checklist After Improvements

- [ ] All unit tests pass
- [ ] Centralized level-up event emits correctly
- [ ] Type guards validate correctly
- [ ] useLevelUpState subscribes to new event
- [ ] Existing functionality unchanged
- [ ] Build passes with no TypeScript errors
- [ ] No lint warnings in level-up module

---

## Files Summary

### New Files
```
packages/client/src/game/hud/level-up/__tests__/
├── utils.test.ts
├── useLevelUpState.test.ts
└── levelUpAudio.test.ts

packages/shared/src/data/__tests__/
└── skill-unlocks.test.ts
```

### Modified Files
```
packages/shared/src/types/events/event-payloads.ts  (add SkillsLevelUpEvent + EventMap entry)
packages/client/src/game/hud/xp-orb/useXPOrbState.ts (emit SKILLS_LEVEL_UP event)
packages/client/src/game/hud/level-up/useLevelUpState.ts (subscribe to event, remove duplicate tracking)
packages/client/src/game/hud/level-up/utils.ts      (add type guards)
packages/client/src/game/hud/level-up/LevelUpNotification.tsx (use guards)
packages/client/src/game/hud/level-up/index.ts      (export guards)
```

**Notes:**
- `event-types.ts` does NOT need modification - `SKILLS_LEVEL_UP` already exists at line 343
- `event-payloads.ts` needs `SkillsLevelUpEvent` interface and an entry in `EventMap`
