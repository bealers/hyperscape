/**
 * EntityPool Unit Tests
 *
 * Tests the generic object pool for reusable entities.
 *
 * Key behaviors tested:
 * - Acquire/release lifecycle
 * - Pool growth and max size limits
 * - Statistics tracking
 * - Reset and deactivate callbacks
 * - createPoolableWrapper utility
 *
 * @see MOB_AGGRO_IMPLEMENTATION_PLAN.md Phase 4.2
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  EntityPool,
  createPoolableWrapper,
  type PoolableEntity,
} from "../EntityPool";

/**
 * Simple poolable test entity
 */
class TestEntity implements PoolableEntity {
  public value: number = 0;
  public resetCount: number = 0;
  public deactivateCount: number = 0;

  reset(): void {
    this.value = 0;
    this.resetCount++;
  }

  deactivate(): void {
    this.deactivateCount++;
  }
}

describe("EntityPool", () => {
  describe("constructor", () => {
    it("pre-allocates initial pool size", () => {
      const pool = new EntityPool<TestEntity>({
        factory: () => new TestEntity(),
        initialSize: 10,
        maxSize: 100,
      });

      expect(pool.getAvailableCount()).toBe(10);
      expect(pool.getInUseCount()).toBe(0);
    });

    it("uses default growth size when not specified", () => {
      const pool = new EntityPool<TestEntity>({
        factory: () => new TestEntity(),
        initialSize: 20,
        maxSize: 100,
        // growthSize not specified - defaults to initialSize / 4
      });

      const stats = pool.getStats();
      expect(stats.total).toBe(20);
    });

    it("uses custom growth size when specified", () => {
      const pool = new EntityPool<TestEntity>({
        factory: () => new TestEntity(),
        initialSize: 10,
        maxSize: 100,
        growthSize: 5,
      });

      // Exhaust pool to trigger growth
      for (let i = 0; i < 10; i++) {
        pool.acquire();
      }

      // Next acquire should trigger growth of 5
      pool.acquire();

      expect(pool.getStats().growthCount).toBe(2); // Initial + 1 growth
    });

    it("uses custom name for statistics", () => {
      const pool = new EntityPool<TestEntity>({
        factory: () => new TestEntity(),
        initialSize: 5,
        maxSize: 10,
        name: "TestPool",
      });

      expect(pool.getStats().name).toBe("TestPool");
    });
  });

  describe("acquire", () => {
    let pool: EntityPool<TestEntity>;

    beforeEach(() => {
      pool = new EntityPool<TestEntity>({
        factory: () => new TestEntity(),
        initialSize: 5,
        maxSize: 10,
      });
    });

    it("returns an entity from the pool", () => {
      const entity = pool.acquire();

      expect(entity).toBeInstanceOf(TestEntity);
      expect(pool.getAvailableCount()).toBe(4);
      expect(pool.getInUseCount()).toBe(1);
    });

    it("calls reset() on acquired entity", () => {
      const entity = pool.acquire();

      expect(entity.resetCount).toBe(1);
    });

    it("grows pool when exhausted (under max)", () => {
      // Exhaust initial pool
      for (let i = 0; i < 5; i++) {
        pool.acquire();
      }

      expect(pool.getAvailableCount()).toBe(0);

      // Should grow pool
      const entity = pool.acquire();

      expect(entity).toBeInstanceOf(TestEntity);
      expect(pool.getStats().growthCount).toBe(2); // Initial + 1
    });

    it("creates new entity when at max (not pooled on release)", () => {
      // Exhaust pool completely
      for (let i = 0; i < 10; i++) {
        pool.acquire();
      }

      // At max - should still return an entity
      const entity = pool.acquire();

      expect(entity).toBeInstanceOf(TestEntity);
      expect(pool.getStats().acquireCount).toBe(11);
    });

    it("tracks acquire count", () => {
      pool.acquire();
      pool.acquire();
      pool.acquire();

      expect(pool.getStats().acquireCount).toBe(3);
    });

    it("updates peak usage", () => {
      pool.acquire();
      pool.acquire();
      pool.acquire();

      expect(pool.getStats().peakUsage).toBe(3);

      const entity = pool.acquire();
      expect(pool.getStats().peakUsage).toBe(4);

      // Release one
      pool.release(entity);
      expect(pool.getStats().peakUsage).toBe(4); // Peak should not decrease
    });
  });

  describe("release", () => {
    let pool: EntityPool<TestEntity>;

    beforeEach(() => {
      pool = new EntityPool<TestEntity>({
        factory: () => new TestEntity(),
        initialSize: 5,
        maxSize: 10,
      });
    });

    it("returns entity to pool", () => {
      const entity = pool.acquire();
      expect(pool.getAvailableCount()).toBe(4);

      pool.release(entity);

      expect(pool.getAvailableCount()).toBe(5);
      expect(pool.getInUseCount()).toBe(0);
    });

    it("calls deactivate() on released entity", () => {
      const entity = pool.acquire();
      // Entity may have been deactivated during pool initialization
      const initialDeactivateCount = entity.deactivateCount;

      pool.release(entity);

      // Should have one more deactivate call after release
      expect(entity.deactivateCount).toBe(initialDeactivateCount + 1);
    });

    it("tracks release count", () => {
      const entity1 = pool.acquire();
      const entity2 = pool.acquire();

      pool.release(entity1);
      pool.release(entity2);

      expect(pool.getStats().releaseCount).toBe(2);
    });

    it("discards entity when pool is at max capacity", () => {
      // Fill pool to max
      const entities: TestEntity[] = [];
      for (let i = 0; i < 10; i++) {
        entities.push(pool.acquire());
      }

      // Release all - should fill pool to max
      for (const entity of entities) {
        pool.release(entity);
      }

      expect(pool.getAvailableCount()).toBe(10);

      // Acquire a new one (creates extra because we're at max)
      const extra = pool.acquire();
      pool.release(extra);

      // Pool should still be at 10, extra was discarded
      expect(pool.getAvailableCount()).toBe(10);
    });
  });

  describe("withEntity", () => {
    let pool: EntityPool<TestEntity>;

    beforeEach(() => {
      pool = new EntityPool<TestEntity>({
        factory: () => new TestEntity(),
        initialSize: 5,
        maxSize: 10,
      });
    });

    it("acquires, uses, and releases entity automatically", () => {
      const initialAvailable = pool.getAvailableCount();

      const result = pool.withEntity((entity) => {
        entity.value = 42;
        expect(pool.getAvailableCount()).toBe(initialAvailable - 1);
        return entity.value * 2;
      });

      expect(result).toBe(84);
      expect(pool.getAvailableCount()).toBe(initialAvailable);
    });

    it("releases entity even if function throws", () => {
      const initialAvailable = pool.getAvailableCount();

      expect(() => {
        pool.withEntity(() => {
          throw new Error("Test error");
        });
      }).toThrow("Test error");

      expect(pool.getAvailableCount()).toBe(initialAvailable);
    });
  });

  describe("prewarm", () => {
    it("grows pool to target size", () => {
      const pool = new EntityPool<TestEntity>({
        factory: () => new TestEntity(),
        initialSize: 5,
        maxSize: 100,
      });

      pool.prewarm(50);

      expect(pool.getAvailableCount()).toBe(50);
    });

    it("respects max size limit", () => {
      const pool = new EntityPool<TestEntity>({
        factory: () => new TestEntity(),
        initialSize: 5,
        maxSize: 20,
      });

      pool.prewarm(100);

      expect(pool.getAvailableCount()).toBe(20);
    });

    it("does nothing if already at target size", () => {
      const pool = new EntityPool<TestEntity>({
        factory: () => new TestEntity(),
        initialSize: 20,
        maxSize: 100,
      });

      const initialGrowthCount = pool.getStats().growthCount;

      pool.prewarm(10);

      expect(pool.getStats().growthCount).toBe(initialGrowthCount);
      expect(pool.getAvailableCount()).toBe(20);
    });
  });

  describe("getStats", () => {
    it("returns comprehensive statistics", () => {
      const pool = new EntityPool<TestEntity>({
        factory: () => new TestEntity(),
        initialSize: 5,
        maxSize: 20,
        name: "StatsTestPool",
      });

      const e1 = pool.acquire();
      pool.acquire(); // Acquire second entity to test peak usage
      pool.release(e1);

      const stats = pool.getStats();

      expect(stats.name).toBe("StatsTestPool");
      expect(stats.total).toBe(5);
      expect(stats.available).toBe(4);
      expect(stats.inUse).toBe(1);
      expect(stats.peakUsage).toBe(2);
      expect(stats.acquireCount).toBe(2);
      expect(stats.releaseCount).toBe(1);
      expect(stats.growthCount).toBe(1);
    });
  });

  describe("clear", () => {
    it("removes all pooled entities", () => {
      const pool = new EntityPool<TestEntity>({
        factory: () => new TestEntity(),
        initialSize: 10,
        maxSize: 20,
      });

      expect(pool.getAvailableCount()).toBe(10);

      pool.clear();

      expect(pool.getAvailableCount()).toBe(0);
    });

    it("does not affect in-use entities", () => {
      const pool = new EntityPool<TestEntity>({
        factory: () => new TestEntity(),
        initialSize: 10,
        maxSize: 20,
      });

      const entity = pool.acquire();
      pool.clear();

      // Entity is still valid, just won't go back to pool
      expect(entity).toBeInstanceOf(TestEntity);
      expect(pool.getStats().acquireCount).toBe(1);
    });
  });

  describe("reset", () => {
    it("clears pool and resets statistics", () => {
      const pool = new EntityPool<TestEntity>({
        factory: () => new TestEntity(),
        initialSize: 10,
        maxSize: 20,
      });

      pool.acquire();
      pool.acquire();

      pool.reset();

      const stats = pool.getStats();
      expect(stats.available).toBe(0);
      expect(stats.inUse).toBe(0);
      expect(stats.peakUsage).toBe(0);
      expect(stats.acquireCount).toBe(0);
      expect(stats.releaseCount).toBe(0);
      expect(stats.growthCount).toBe(0);
    });
  });

  describe("isFull (implicit through behavior)", () => {
    it("pool stops accepting releases at max", () => {
      const pool = new EntityPool<TestEntity>({
        factory: () => new TestEntity(),
        initialSize: 5,
        maxSize: 5,
      });

      // All in pool, pool is "full" for releases
      expect(pool.getAvailableCount()).toBe(5);

      // Acquire and release should work normally
      const entity = pool.acquire();
      pool.release(entity);
      expect(pool.getAvailableCount()).toBe(5);

      // Create extra entity (bypass pool)
      const extra = new TestEntity();
      pool.release(extra as TestEntity);

      // Pool should cap at max
      expect(pool.getAvailableCount()).toBeLessThanOrEqual(5);
    });
  });
});

describe("createPoolableWrapper", () => {
  it("creates poolable wrapper for plain objects", () => {
    const factory = createPoolableWrapper<{ value: number }>(
      () => ({ value: 0 }),
      (obj) => {
        obj.value = 0;
      },
      (obj) => {
        obj.value = -1;
      },
    );

    const wrapper = factory();

    expect(wrapper.value).toEqual({ value: 0 });
    expect(typeof wrapper.reset).toBe("function");
    expect(typeof wrapper.deactivate).toBe("function");
  });

  it("reset callback is called", () => {
    const resetFn = vi.fn((obj: { value: number }) => {
      obj.value = 0;
    });
    const factory = createPoolableWrapper<{ value: number }>(
      () => ({ value: 0 }),
      resetFn,
    );

    const wrapper = factory();
    wrapper.value.value = 42;
    wrapper.reset();

    expect(resetFn).toHaveBeenCalled();
    expect(wrapper.value.value).toBe(0);
  });

  it("deactivate callback is called when provided", () => {
    const deactivateFn = vi.fn();
    const factory = createPoolableWrapper<{ value: number }>(
      () => ({ value: 0 }),
      (obj) => {
        obj.value = 0;
      },
      deactivateFn,
    );

    const wrapper = factory();
    wrapper.deactivate();

    expect(deactivateFn).toHaveBeenCalled();
  });

  it("deactivate does nothing when not provided", () => {
    const factory = createPoolableWrapper<{ value: number }>(
      () => ({ value: 0 }),
      (obj) => {
        obj.value = 0;
      },
      // No deactivate callback
    );

    const wrapper = factory();

    // Should not throw
    expect(() => wrapper.deactivate()).not.toThrow();
  });

  it("works with EntityPool", () => {
    const factory = createPoolableWrapper<{ x: number; y: number }>(
      () => ({ x: 0, y: 0 }),
      (obj) => {
        obj.x = 0;
        obj.y = 0;
      },
    );

    const pool = new EntityPool({
      factory,
      initialSize: 5,
      maxSize: 10,
    });

    const wrapper = pool.acquire();
    wrapper.value.x = 100;
    wrapper.value.y = 200;

    pool.release(wrapper);

    const reused = pool.acquire();
    expect(reused.value.x).toBe(0);
    expect(reused.value.y).toBe(0);
  });
});
