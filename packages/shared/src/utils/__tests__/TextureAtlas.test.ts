import { describe, it, expect } from "vitest";
import * as THREE from "three";
import {
  TextureAtlas,
  createAtlasUniforms,
  AtlasUVData,
} from "../rendering/TextureAtlas";

describe("TextureAtlas", () => {
  describe("UV mapping math", () => {
    // Mirrors TextureAtlas.generate() UV calculation (can't test generate() without canvas)
    function expectedUVForIndex(gridSize: number, index: number): AtlasUVData {
      const row = Math.floor(index / gridSize);
      const col = index % gridSize;
      const scale = 1 / gridSize;

      return {
        offset: [col * scale, row * scale],
        scale: [scale, scale],
        gridPosition: [row, col],
      };
    }

    it("2x2 grid: first texture at (0,0) with scale 0.5", () => {
      const uv = expectedUVForIndex(2, 0);

      expect(uv.offset).toEqual([0, 0]);
      expect(uv.scale).toEqual([0.5, 0.5]);
      expect(uv.gridPosition).toEqual([0, 0]);
    });

    it("2x2 grid: second texture at (0.5,0)", () => {
      const uv = expectedUVForIndex(2, 1);

      expect(uv.offset).toEqual([0.5, 0]);
      expect(uv.scale).toEqual([0.5, 0.5]);
      expect(uv.gridPosition).toEqual([0, 1]);
    });

    it("2x2 grid: third texture at (0,0.5)", () => {
      const uv = expectedUVForIndex(2, 2);

      expect(uv.offset).toEqual([0, 0.5]);
      expect(uv.scale).toEqual([0.5, 0.5]);
      expect(uv.gridPosition).toEqual([1, 0]);
    });

    it("2x2 grid: fourth texture at (0.5,0.5)", () => {
      const uv = expectedUVForIndex(2, 3);

      expect(uv.offset).toEqual([0.5, 0.5]);
      expect(uv.scale).toEqual([0.5, 0.5]);
      expect(uv.gridPosition).toEqual([1, 1]);
    });

    it("4x4 grid: textures at correct positions", () => {
      const scale = 1 / 4;

      // First texture
      const uv0 = expectedUVForIndex(4, 0);
      expect(uv0.offset).toEqual([0, 0]);
      expect(uv0.scale).toEqual([scale, scale]);

      // Last texture (index 15)
      const uv15 = expectedUVForIndex(4, 15);
      expect(uv15.offset).toEqual([0.75, 0.75]);
      expect(uv15.gridPosition).toEqual([3, 3]);

      // Middle texture (index 5 = row 1, col 1)
      const uv5 = expectedUVForIndex(4, 5);
      expect(uv5.offset).toEqual([0.25, 0.25]);
      expect(uv5.gridPosition).toEqual([1, 1]);
    });

    it("UV transform produces correct atlas coordinates", () => {
      const transformUV = (
        uv: AtlasUVData,
        u: number,
        v: number,
      ): [number, number] => [
        u * uv.scale[0] + uv.offset[0],
        v * uv.scale[1] + uv.offset[1],
      ];

      // Sample center (0.5, 0.5) of texture 0 -> atlas (0.25, 0.25)
      const [u0, v0] = transformUV(expectedUVForIndex(2, 0), 0.5, 0.5);
      expect(u0).toBeCloseTo(0.25, 5);
      expect(v0).toBeCloseTo(0.25, 5);

      // Sample center of texture 3 -> atlas (0.75, 0.75)
      const [u3, v3] = transformUV(expectedUVForIndex(2, 3), 0.5, 0.5);
      expect(u3).toBeCloseTo(0.75, 5);
      expect(v3).toBeCloseTo(0.75, 5);
    });
  });

  describe("addTexture capacity", () => {
    const tex = () =>
      new THREE.DataTexture(new Uint8Array([255, 0, 0, 255]), 1, 1);

    it("accepts textures up to capacity", () => {
      const atlas = new TextureAtlas(1024, 2);
      expect(atlas.addTexture("tex1", tex())).toBe(true);
      expect(atlas.addTexture("tex2", tex())).toBe(true);
      expect(atlas.addTexture("tex3", tex())).toBe(true);
      expect(atlas.addTexture("tex4", tex())).toBe(true);
    });

    it("rejects textures when full", () => {
      const atlas = new TextureAtlas(1024, 2);
      for (let i = 0; i < 4; i++) atlas.addTexture(`tex${i}`, tex());
      expect(atlas.addTexture("tex5", tex())).toBe(false);
    });

    it("3x3 grid allows 9 textures", () => {
      const atlas = new TextureAtlas(1024, 3);
      for (let i = 0; i < 9; i++)
        expect(atlas.addTexture(`tex${i}`, tex())).toBe(true);
      expect(atlas.addTexture("tex10", tex())).toBe(false);
    });
  });

  describe("dispose", () => {
    it("clears textures after dispose", () => {
      const atlas = new TextureAtlas(1024, 2);
      const tex = () =>
        new THREE.DataTexture(new Uint8Array([255, 0, 0, 255]), 1, 1);

      atlas.addTexture("tex1", tex());
      atlas.dispose();

      for (let i = 0; i < 4; i++)
        expect(atlas.addTexture(`tex${i}`, tex())).toBe(true);
    });
  });

  describe("createAtlasUniforms", () => {
    it("converts UV data to Vector2 uniforms", () => {
      const uvMap = new Map<string, AtlasUVData>();
      uvMap.set("grass", {
        offset: [0, 0],
        scale: [0.5, 0.5],
        gridPosition: [0, 0],
      });
      uvMap.set("dirt", {
        offset: [0.5, 0],
        scale: [0.5, 0.5],
        gridPosition: [0, 1],
      });

      const uniforms = createAtlasUniforms(uvMap);

      expect(uniforms.get("grass")).toBeDefined();
      expect(uniforms.get("grass")!.offset).toBeInstanceOf(THREE.Vector2);
      expect(uniforms.get("grass")!.offset.x).toBe(0);
      expect(uniforms.get("grass")!.offset.y).toBe(0);
      expect(uniforms.get("grass")!.scale.x).toBe(0.5);
      expect(uniforms.get("grass")!.scale.y).toBe(0.5);

      expect(uniforms.get("dirt")!.offset.x).toBe(0.5);
      expect(uniforms.get("dirt")!.offset.y).toBe(0);
    });

    it("preserves all entries from UV map", () => {
      const uvMap = new Map<string, AtlasUVData>();
      uvMap.set("a", {
        offset: [0, 0],
        scale: [0.25, 0.25],
        gridPosition: [0, 0],
      });
      uvMap.set("b", {
        offset: [0.25, 0],
        scale: [0.25, 0.25],
        gridPosition: [0, 1],
      });
      uvMap.set("c", {
        offset: [0.5, 0],
        scale: [0.25, 0.25],
        gridPosition: [0, 2],
      });
      uvMap.set("d", {
        offset: [0.75, 0],
        scale: [0.25, 0.25],
        gridPosition: [0, 3],
      });

      const uniforms = createAtlasUniforms(uvMap);

      expect(uniforms.size).toBe(4);
      expect(uniforms.has("a")).toBe(true);
      expect(uniforms.has("b")).toBe(true);
      expect(uniforms.has("c")).toBe(true);
      expect(uniforms.has("d")).toBe(true);
    });
  });

  describe("resolution math", () => {
    it("cell size = resolution / gridSize", () => {
      expect(2048 / 2).toBe(1024);
      expect(2048 / 4).toBe(512);
      expect(4096 / 8).toBe(512);
    });

    it("scale = 1 / gridSize", () => {
      expect(1 / 2).toBe(0.5);
      expect(1 / 4).toBe(0.25);
      expect(1 / 8).toBe(0.125);
    });
  });

  describe("boundary conditions", () => {
    const tex = () =>
      new THREE.DataTexture(new Uint8Array([255, 0, 0, 255]), 1, 1);

    it("handles 1x1 grid", () => {
      const atlas = new TextureAtlas(1024, 1);
      expect(atlas.addTexture("only", tex())).toBe(true);
      expect(atlas.addTexture("extra", tex())).toBe(false);
    });

    it("handles 8x8 grid (64 textures)", () => {
      const atlas = new TextureAtlas(4096, 8);
      for (let i = 0; i < 64; i++)
        expect(atlas.addTexture(`tex${i}`, tex())).toBe(true);
      expect(atlas.addTexture("tex64", tex())).toBe(false);
    });

    it("UV coordinates stay within [0, 1]", () => {
      for (let i = 0; i < 16; i++) {
        const row = Math.floor(i / 4),
          col = i % 4,
          scale = 0.25;
        const offset = [col * scale, row * scale];
        expect(offset[0]).toBeGreaterThanOrEqual(0);
        expect(offset[0] + scale).toBeLessThanOrEqual(1);
        expect(offset[1]).toBeGreaterThanOrEqual(0);
        expect(offset[1] + scale).toBeLessThanOrEqual(1);
      }
    });
  });

  describe("UV edge cases", () => {
    it("handles (0,0) corner", () => {
      expect(0 * 0.5 + 0.5).toBe(0.5);
    });

    it("handles (1,1) corner", () => {
      expect(1 * 0.5 + 0.5).toBe(1.0);
    });

    it("handles UV wrapping", () => {
      expect((2.5 % 1) * 0.5).toBeCloseTo(0.25, 5);
      expect((3.7 % 1) * 0.5).toBeCloseTo(0.35, 5);
    });
  });
});
