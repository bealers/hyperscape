/**
 * NPCPositionBuffer Unit Tests
 *
 * Tests the TypedArray-based buffer for NPC positions.
 *
 * Key behaviors tested:
 * - Add/remove NPCs (with swap-and-pop)
 * - Position get/set operations
 * - Tile get/set operations
 * - Flag manipulation
 * - ID-to-index mapping
 * - Raw buffer access for serialization
 * - Zero-allocation getters
 *
 * @see MOB_AGGRO_IMPLEMENTATION_PLAN.md Phase 4.3
 */

import { describe, it, expect, beforeEach } from "vitest";
import { NPCPositionBuffer, NPCFlag } from "../NPCPositionBuffer";
import type { Position3D } from "../../../types";
import type { TileCoord } from "../../../systems/shared/movement/TileSystem";

describe("NPCPositionBuffer", () => {
  describe("constructor", () => {
    it("creates buffer with specified max capacity", () => {
      const buffer = new NPCPositionBuffer({ maxNPCs: 100 });

      expect(buffer.getMaxCount()).toBe(100);
      expect(buffer.getCount()).toBe(0);
    });

    it("initializes empty", () => {
      const buffer = new NPCPositionBuffer({ maxNPCs: 50 });

      expect(buffer.getCount()).toBe(0);
      expect(buffer.isFull()).toBe(false);
    });
  });

  describe("add", () => {
    let buffer: NPCPositionBuffer;

    beforeEach(() => {
      buffer = new NPCPositionBuffer({ maxNPCs: 10 });
    });

    it("adds NPC and returns index", () => {
      const index = buffer.add("npc_1");

      expect(index).toBe(0);
      expect(buffer.getCount()).toBe(1);
    });

    it("increments index for each NPC", () => {
      expect(buffer.add("npc_1")).toBe(0);
      expect(buffer.add("npc_2")).toBe(1);
      expect(buffer.add("npc_3")).toBe(2);
      expect(buffer.getCount()).toBe(3);
    });

    it("returns -1 when buffer is full", () => {
      for (let i = 0; i < 10; i++) {
        buffer.add(`npc_${i}`);
      }

      expect(buffer.isFull()).toBe(true);
      expect(buffer.add("npc_overflow")).toBe(-1);
    });

    it("initializes position to zero", () => {
      buffer.add("npc_1");
      const pos = buffer.getPosition(0);

      expect(pos.x).toBe(0);
      expect(pos.y).toBe(0);
      expect(pos.z).toBe(0);
    });

    it("initializes tile to zero", () => {
      buffer.add("npc_1");
      const tile = buffer.getTile(0);

      expect(tile.x).toBe(0);
      expect(tile.z).toBe(0);
    });

    it("initializes flags to zero", () => {
      buffer.add("npc_1");

      expect(buffer.getFlags(0)).toBe(0);
      expect(buffer.hasFlag(0, NPCFlag.DEAD)).toBe(false);
    });
  });

  describe("remove", () => {
    let buffer: NPCPositionBuffer;

    beforeEach(() => {
      buffer = new NPCPositionBuffer({ maxNPCs: 10 });
    });

    it("removes NPC by ID", () => {
      buffer.add("npc_1");
      buffer.add("npc_2");

      expect(buffer.remove("npc_1")).toBe(true);
      expect(buffer.getCount()).toBe(1);
    });

    it("returns false for unknown ID", () => {
      buffer.add("npc_1");

      expect(buffer.remove("unknown")).toBe(false);
      expect(buffer.getCount()).toBe(1);
    });

    it("uses swap-and-pop (moves last element to removed position)", () => {
      buffer.add("npc_1");
      buffer.add("npc_2");
      buffer.add("npc_3");

      // Set positions for tracking
      buffer.setPosition(0, 1, 1, 1); // npc_1
      buffer.setPosition(1, 2, 2, 2); // npc_2
      buffer.setPosition(2, 3, 3, 3); // npc_3

      // Remove npc_1 (index 0) - npc_3 should move to index 0
      buffer.remove("npc_1");

      // npc_3 should now be at index 0
      expect(buffer.getId(0)).toBe("npc_3");
      expect(buffer.getIndex("npc_3")).toBe(0);

      const pos = buffer.getPosition(0);
      expect(pos.x).toBe(3);
      expect(pos.y).toBe(3);
      expect(pos.z).toBe(3);
    });

    it("handles removing last element (no swap needed)", () => {
      buffer.add("npc_1");
      buffer.add("npc_2");

      buffer.remove("npc_2");

      expect(buffer.getCount()).toBe(1);
      expect(buffer.getId(0)).toBe("npc_1");
    });

    it("updates ID-to-index mapping after swap", () => {
      buffer.add("npc_1");
      buffer.add("npc_2");
      buffer.add("npc_3");

      buffer.remove("npc_1");

      expect(buffer.getIndex("npc_1")).toBeUndefined();
      expect(buffer.getIndex("npc_3")).toBe(0);
      expect(buffer.getIndex("npc_2")).toBe(1);
    });
  });

  describe("position operations", () => {
    let buffer: NPCPositionBuffer;

    beforeEach(() => {
      buffer = new NPCPositionBuffer({ maxNPCs: 10 });
      buffer.add("npc_1");
    });

    it("setPosition updates position", () => {
      buffer.setPosition(0, 10.5, 5.0, 20.5);

      const pos = buffer.getPosition(0);
      expect(pos.x).toBeCloseTo(10.5);
      expect(pos.y).toBeCloseTo(5.0);
      expect(pos.z).toBeCloseTo(20.5);
    });

    it("setPositionFrom updates from Position3D object", () => {
      const pos: Position3D = { x: 15.5, y: 2.0, z: 25.5 };
      buffer.setPositionFrom(0, pos);

      const result = buffer.getPosition(0);
      expect(result.x).toBeCloseTo(15.5);
      expect(result.y).toBeCloseTo(2.0);
      expect(result.z).toBeCloseTo(25.5);
    });

    it("getPosition returns reference to temp object (zero-allocation)", () => {
      buffer.setPosition(0, 10, 20, 30);

      const pos1 = buffer.getPosition(0);
      const pos2 = buffer.getPosition(0);

      // Same object reference
      expect(pos1).toBe(pos2);
    });

    it("getPositionInto writes to provided object", () => {
      buffer.setPosition(0, 100, 200, 300);

      const out: Position3D = { x: 0, y: 0, z: 0 };
      buffer.getPositionInto(0, out);

      expect(out.x).toBeCloseTo(100);
      expect(out.y).toBeCloseTo(200);
      expect(out.z).toBeCloseTo(300);
    });

    it("setPosition marks dirty flag", () => {
      expect(buffer.hasFlag(0, NPCFlag.DIRTY)).toBe(false);

      buffer.setPosition(0, 10, 20, 30);

      expect(buffer.hasFlag(0, NPCFlag.DIRTY)).toBe(true);
    });

    it("handles negative positions", () => {
      buffer.setPosition(0, -50.5, -10.0, -75.5);

      const pos = buffer.getPosition(0);
      expect(pos.x).toBeCloseTo(-50.5);
      expect(pos.y).toBeCloseTo(-10.0);
      expect(pos.z).toBeCloseTo(-75.5);
    });
  });

  describe("tile operations", () => {
    let buffer: NPCPositionBuffer;

    beforeEach(() => {
      buffer = new NPCPositionBuffer({ maxNPCs: 10 });
      buffer.add("npc_1");
    });

    it("setTile updates tile coordinates", () => {
      buffer.setTile(0, 50, 100);

      const tile = buffer.getTile(0);
      expect(tile.x).toBe(50);
      expect(tile.z).toBe(100);
    });

    it("getTile returns reference to temp object", () => {
      buffer.setTile(0, 10, 20);

      const tile1 = buffer.getTile(0);
      const tile2 = buffer.getTile(0);

      expect(tile1).toBe(tile2);
    });

    it("getTileInto writes to provided object", () => {
      buffer.setTile(0, 100, 200);

      const out: TileCoord = { x: 0, z: 0 };
      buffer.getTileInto(0, out);

      expect(out.x).toBe(100);
      expect(out.z).toBe(200);
    });

    it("handles negative tile coordinates", () => {
      buffer.setTile(0, -50, -100);

      const tile = buffer.getTile(0);
      expect(tile.x).toBe(-50);
      expect(tile.z).toBe(-100);
    });

    it("stores tiles as Int16 (max 32767)", () => {
      buffer.setTile(0, 32767, -32768);

      const tile = buffer.getTile(0);
      expect(tile.x).toBe(32767);
      expect(tile.z).toBe(-32768);
    });
  });

  describe("flag operations", () => {
    let buffer: NPCPositionBuffer;

    beforeEach(() => {
      buffer = new NPCPositionBuffer({ maxNPCs: 10 });
      buffer.add("npc_1");
    });

    it("setFlag sets individual flag", () => {
      buffer.setFlag(0, NPCFlag.IN_COMBAT);

      expect(buffer.hasFlag(0, NPCFlag.IN_COMBAT)).toBe(true);
      expect(buffer.hasFlag(0, NPCFlag.DEAD)).toBe(false);
    });

    it("multiple flags can be set", () => {
      buffer.setFlag(0, NPCFlag.IN_COMBAT);
      buffer.setFlag(0, NPCFlag.ATTACKING);

      expect(buffer.hasFlag(0, NPCFlag.IN_COMBAT)).toBe(true);
      expect(buffer.hasFlag(0, NPCFlag.ATTACKING)).toBe(true);
    });

    it("clearFlag removes individual flag", () => {
      buffer.setFlag(0, NPCFlag.IN_COMBAT);
      buffer.setFlag(0, NPCFlag.ATTACKING);

      buffer.clearFlag(0, NPCFlag.IN_COMBAT);

      expect(buffer.hasFlag(0, NPCFlag.IN_COMBAT)).toBe(false);
      expect(buffer.hasFlag(0, NPCFlag.ATTACKING)).toBe(true);
    });

    it("getFlags returns all flags as bitmask", () => {
      buffer.setFlag(0, NPCFlag.DEAD);
      buffer.setFlag(0, NPCFlag.VISIBLE);

      const flags = buffer.getFlags(0);
      expect(flags & NPCFlag.DEAD).toBeTruthy();
      expect(flags & NPCFlag.VISIBLE).toBeTruthy();
      expect(flags & NPCFlag.IN_COMBAT).toBeFalsy();
    });

    it("setFlags replaces all flags", () => {
      buffer.setFlag(0, NPCFlag.DEAD);
      buffer.setFlag(0, NPCFlag.IN_COMBAT);

      buffer.setFlags(0, NPCFlag.VISIBLE);

      expect(buffer.getFlags(0)).toBe(NPCFlag.VISIBLE);
      expect(buffer.hasFlag(0, NPCFlag.DEAD)).toBe(false);
      expect(buffer.hasFlag(0, NPCFlag.IN_COMBAT)).toBe(false);
    });
  });

  describe("NPCFlag enum values", () => {
    it("has correct bit values", () => {
      expect(NPCFlag.NONE).toBe(0);
      expect(NPCFlag.DEAD).toBe(1 << 0);
      expect(NPCFlag.IN_COMBAT).toBe(1 << 1);
      expect(NPCFlag.WANDERING).toBe(1 << 2);
      expect(NPCFlag.CHASING).toBe(1 << 3);
      expect(NPCFlag.ATTACKING).toBe(1 << 4);
      expect(NPCFlag.BLOCKED).toBe(1 << 5);
      expect(NPCFlag.VISIBLE).toBe(1 << 6);
      expect(NPCFlag.DIRTY).toBe(1 << 7);
    });

    it("flags do not overlap", () => {
      const allFlags = [
        NPCFlag.DEAD,
        NPCFlag.IN_COMBAT,
        NPCFlag.WANDERING,
        NPCFlag.CHASING,
        NPCFlag.ATTACKING,
        NPCFlag.BLOCKED,
        NPCFlag.VISIBLE,
        NPCFlag.DIRTY,
      ];

      // Sum of all flags should equal combined bitmask
      const sum = allFlags.reduce((a, b) => a + b, 0);
      const combined = allFlags.reduce((a, b) => a | b, 0);

      expect(sum).toBe(combined);
    });
  });

  describe("ID mapping", () => {
    let buffer: NPCPositionBuffer;

    beforeEach(() => {
      buffer = new NPCPositionBuffer({ maxNPCs: 10 });
    });

    it("getIndex returns correct index", () => {
      buffer.add("npc_1");
      buffer.add("npc_2");

      expect(buffer.getIndex("npc_1")).toBe(0);
      expect(buffer.getIndex("npc_2")).toBe(1);
    });

    it("getIndex returns undefined for unknown ID", () => {
      buffer.add("npc_1");

      expect(buffer.getIndex("unknown")).toBeUndefined();
    });

    it("getId returns correct ID", () => {
      buffer.add("npc_1");
      buffer.add("npc_2");

      expect(buffer.getId(0)).toBe("npc_1");
      expect(buffer.getId(1)).toBe("npc_2");
    });

    it("getId returns empty string for invalid index", () => {
      expect(buffer.getId(99)).toBe("");
    });
  });

  describe("clearDirtyFlags", () => {
    let buffer: NPCPositionBuffer;

    beforeEach(() => {
      buffer = new NPCPositionBuffer({ maxNPCs: 10 });
      buffer.add("npc_1");
      buffer.add("npc_2");
      buffer.add("npc_3");
    });

    it("clears dirty flag on all NPCs", () => {
      buffer.setFlag(0, NPCFlag.DIRTY);
      buffer.setFlag(1, NPCFlag.DIRTY);
      buffer.setFlag(2, NPCFlag.DIRTY);

      expect(buffer.hasFlag(0, NPCFlag.DIRTY)).toBe(true);
      expect(buffer.hasFlag(1, NPCFlag.DIRTY)).toBe(true);
      expect(buffer.hasFlag(2, NPCFlag.DIRTY)).toBe(true);

      buffer.clearDirtyFlags();

      expect(buffer.hasFlag(0, NPCFlag.DIRTY)).toBe(false);
      expect(buffer.hasFlag(1, NPCFlag.DIRTY)).toBe(false);
      expect(buffer.hasFlag(2, NPCFlag.DIRTY)).toBe(false);
    });

    it("preserves other flags", () => {
      buffer.setFlag(0, NPCFlag.DIRTY);
      buffer.setFlag(0, NPCFlag.IN_COMBAT);
      buffer.setFlag(1, NPCFlag.DIRTY);
      buffer.setFlag(1, NPCFlag.VISIBLE);

      buffer.clearDirtyFlags();

      expect(buffer.hasFlag(0, NPCFlag.IN_COMBAT)).toBe(true);
      expect(buffer.hasFlag(1, NPCFlag.VISIBLE)).toBe(true);
    });
  });

  describe("clear", () => {
    it("removes all NPCs", () => {
      const buffer = new NPCPositionBuffer({ maxNPCs: 10 });
      buffer.add("npc_1");
      buffer.add("npc_2");
      buffer.add("npc_3");

      expect(buffer.getCount()).toBe(3);

      buffer.clear();

      expect(buffer.getCount()).toBe(0);
      expect(buffer.getIndex("npc_1")).toBeUndefined();
    });
  });

  describe("raw buffer access", () => {
    let buffer: NPCPositionBuffer;

    beforeEach(() => {
      buffer = new NPCPositionBuffer({ maxNPCs: 10 });
      buffer.add("npc_1");
      buffer.setPosition(0, 100, 200, 300);
      buffer.setTile(0, 50, 75);
      buffer.setFlag(0, NPCFlag.VISIBLE);
    });

    it("getPositionBuffer returns Float32Array", () => {
      const posBuffer = buffer.getPositionBuffer();

      expect(posBuffer).toBeInstanceOf(Float32Array);
      expect(posBuffer[0]).toBeCloseTo(100);
      expect(posBuffer[1]).toBeCloseTo(200);
      expect(posBuffer[2]).toBeCloseTo(300);
    });

    it("getTileBuffer returns Int16Array", () => {
      const tileBuffer = buffer.getTileBuffer();

      expect(tileBuffer).toBeInstanceOf(Int16Array);
      expect(tileBuffer[0]).toBe(50);
      expect(tileBuffer[1]).toBe(75);
    });

    it("getFlagsBuffer returns Uint8Array", () => {
      const flagsBuffer = buffer.getFlagsBuffer();

      expect(flagsBuffer).toBeInstanceOf(Uint8Array);
      expect(flagsBuffer[0]).toBe(NPCFlag.VISIBLE | NPCFlag.DIRTY); // DIRTY set by setPosition
    });

    it("buffers are sized for max NPCs", () => {
      const maxNPCs = 100;
      const largeBuffer = new NPCPositionBuffer({ maxNPCs });

      expect(largeBuffer.getPositionBuffer().length).toBe(maxNPCs * 3); // x, y, z
      expect(largeBuffer.getTileBuffer().length).toBe(maxNPCs * 2); // x, z
      expect(largeBuffer.getFlagsBuffer().length).toBe(maxNPCs * 4); // flags + 3 reserved
    });
  });

  describe("capacity", () => {
    it("getMaxCount returns configured max", () => {
      const buffer = new NPCPositionBuffer({ maxNPCs: 100 });
      expect(buffer.getMaxCount()).toBe(100);
    });

    it("isFull returns true at capacity", () => {
      const buffer = new NPCPositionBuffer({ maxNPCs: 3 });

      expect(buffer.isFull()).toBe(false);
      buffer.add("npc_1");
      expect(buffer.isFull()).toBe(false);
      buffer.add("npc_2");
      expect(buffer.isFull()).toBe(false);
      buffer.add("npc_3");
      expect(buffer.isFull()).toBe(true);
    });
  });

  describe("performance characteristics", () => {
    it("handles large NPC count efficiently", () => {
      const buffer = new NPCPositionBuffer({ maxNPCs: 1000 });

      // Add 1000 NPCs
      for (let i = 0; i < 1000; i++) {
        buffer.add(`npc_${i}`);
        buffer.setPosition(i, i * 1.5, i * 0.5, i * 2.0);
        buffer.setTile(i, i % 100, i % 100);
        buffer.setFlag(i, NPCFlag.VISIBLE);
      }

      expect(buffer.getCount()).toBe(1000);

      // Verify random access
      const pos = buffer.getPosition(500);
      expect(pos.x).toBeCloseTo(500 * 1.5);

      // Remove from middle
      buffer.remove("npc_500");
      expect(buffer.getCount()).toBe(999);
    });
  });
});
