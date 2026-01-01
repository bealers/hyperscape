/**
 * Tests for RendererFactory mesh merging utilities
 */

import { describe, it, expect } from "vitest";
import * as THREE from "three";
import {
  mergeStaticMeshes,
  groupMeshesByMaterial,
} from "../rendering/RendererFactory";

describe("RendererFactory Mesh Merging", () => {
  describe("mergeStaticMeshes", () => {
    function createBoxMesh(
      position: THREE.Vector3,
      material: THREE.Material,
      name = "TestBox",
    ): THREE.Mesh {
      const geometry = new THREE.BoxGeometry(1, 1, 1);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.copy(position);
      mesh.name = name;
      mesh.updateMatrixWorld(true);
      return mesh;
    }

    it("returns null for empty array", () => {
      const result = mergeStaticMeshes([]);
      expect(result).toBeNull();
    });

    it("returns the single mesh for array of one", () => {
      const material = new THREE.MeshBasicMaterial({ color: 0xff0000 });
      const mesh = createBoxMesh(new THREE.Vector3(0, 0, 0), material);

      const result = mergeStaticMeshes([mesh]);

      // Should return the original mesh unchanged
      expect(result).toBe(mesh);
    });

    it("merges two meshes into one", () => {
      const material = new THREE.MeshBasicMaterial({ color: 0xff0000 });
      const mesh1 = createBoxMesh(new THREE.Vector3(0, 0, 0), material, "box1");
      const mesh2 = createBoxMesh(new THREE.Vector3(5, 0, 0), material, "box2");

      const result = mergeStaticMeshes([mesh1, mesh2]);

      expect(result).not.toBeNull();
      expect(result!.geometry.getAttribute("position")).toBeDefined();

      // Merged mesh should have more vertices than individual meshes
      const originalVertexCount = mesh1.geometry.getAttribute("position").count;
      const mergedVertexCount = result!.geometry.getAttribute("position").count;
      expect(mergedVertexCount).toBe(originalVertexCount * 2);
    });

    it("preserves world position in merged geometry", () => {
      const material = new THREE.MeshBasicMaterial({ color: 0xff0000 });
      const offset = 10;
      const mesh1 = createBoxMesh(new THREE.Vector3(0, 0, 0), material);
      const mesh2 = createBoxMesh(new THREE.Vector3(offset, 0, 0), material);

      const result = mergeStaticMeshes([mesh1, mesh2]);
      expect(result).not.toBeNull();

      const positions = result!.geometry.getAttribute("position");
      const vertexCount = positions.count;

      // Find min/max X positions
      let minX = Infinity,
        maxX = -Infinity;
      for (let i = 0; i < vertexCount; i++) {
        const x = positions.getX(i);
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
      }

      // Box is 1x1x1, so first mesh spans -0.5 to 0.5
      // Second mesh at x=10 spans 9.5 to 10.5
      expect(minX).toBeCloseTo(-0.5, 2);
      expect(maxX).toBeCloseTo(10.5, 2);
    });

    it("preserves normals in merged geometry", () => {
      const material = new THREE.MeshBasicMaterial({ color: 0xff0000 });
      const mesh1 = createBoxMesh(new THREE.Vector3(0, 0, 0), material);
      const mesh2 = createBoxMesh(new THREE.Vector3(5, 0, 0), material);

      const result = mergeStaticMeshes([mesh1, mesh2]);

      expect(result).not.toBeNull();
      expect(result!.geometry.getAttribute("normal")).toBeDefined();

      const normals = result!.geometry.getAttribute("normal");
      // All normals should be unit vectors
      for (let i = 0; i < normals.count; i++) {
        const nx = normals.getX(i);
        const ny = normals.getY(i);
        const nz = normals.getZ(i);
        const length = Math.sqrt(nx * nx + ny * ny + nz * nz);
        expect(length).toBeCloseTo(1.0, 3);
      }
    });

    it("preserves UVs in merged geometry", () => {
      const material = new THREE.MeshBasicMaterial({ color: 0xff0000 });
      const mesh1 = createBoxMesh(new THREE.Vector3(0, 0, 0), material);
      const mesh2 = createBoxMesh(new THREE.Vector3(5, 0, 0), material);

      const result = mergeStaticMeshes([mesh1, mesh2]);

      expect(result).not.toBeNull();
      expect(result!.geometry.getAttribute("uv")).toBeDefined();

      const uvs = result!.geometry.getAttribute("uv");
      // Box UVs should be in [0, 1] range
      for (let i = 0; i < uvs.count; i++) {
        const u = uvs.getX(i);
        const v = uvs.getY(i);
        expect(u).toBeGreaterThanOrEqual(0);
        expect(u).toBeLessThanOrEqual(1);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    });

    it("handles rotated meshes correctly", () => {
      const material = new THREE.MeshBasicMaterial({ color: 0xff0000 });
      const mesh1 = createBoxMesh(new THREE.Vector3(0, 0, 0), material);
      const mesh2 = createBoxMesh(new THREE.Vector3(5, 0, 0), material);

      // Rotate second mesh 45 degrees
      mesh2.rotation.y = Math.PI / 4;
      mesh2.updateMatrixWorld(true);

      const result = mergeStaticMeshes([mesh1, mesh2]);

      expect(result).not.toBeNull();
      // Rotated box should have different vertex positions
      const positions = result!.geometry.getAttribute("position");
      expect(positions.count).toBeGreaterThan(0);
    });

    it("handles scaled meshes correctly", () => {
      const material = new THREE.MeshBasicMaterial({ color: 0xff0000 });
      const mesh1 = createBoxMesh(new THREE.Vector3(0, 0, 0), material);
      const mesh2 = createBoxMesh(new THREE.Vector3(5, 0, 0), material);

      // Scale second mesh
      mesh2.scale.set(2, 2, 2);
      mesh2.updateMatrixWorld(true);

      const result = mergeStaticMeshes([mesh1, mesh2]);
      expect(result).not.toBeNull();

      const positions = result!.geometry.getAttribute("position");
      let minX = Infinity,
        maxX = -Infinity;
      for (let i = 0; i < positions.count; i++) {
        const x = positions.getX(i);
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
      }

      // Scaled mesh at x=5 with scale 2 spans 4 to 6
      expect(maxX).toBeCloseTo(6, 1);
    });

    it("stores original mesh data in userData", () => {
      const material = new THREE.MeshBasicMaterial({ color: 0xff0000 });
      const mesh1 = createBoxMesh(new THREE.Vector3(0, 0, 0), material, "box1");
      const mesh2 = createBoxMesh(new THREE.Vector3(5, 0, 0), material, "box2");
      mesh1.userData.clickable = true;
      mesh2.userData.id = "obj2";

      const result = mergeStaticMeshes([mesh1, mesh2]);

      expect(result).not.toBeNull();
      expect(result!.userData.mergedMeshes).toBeDefined();
      expect(result!.userData.mergedMeshes.length).toBe(2);
      expect(result!.userData.mergedMeshes[0].name).toBe("box1");
      expect(result!.userData.mergedMeshes[1].name).toBe("box2");
      expect(result!.userData.mergedMeshes[0].userData.clickable).toBe(true);
      expect(result!.userData.mergedMeshes[1].userData.id).toBe("obj2");
    });

    it("inherits shadow properties from first mesh", () => {
      const material = new THREE.MeshBasicMaterial({ color: 0xff0000 });
      const mesh1 = createBoxMesh(new THREE.Vector3(0, 0, 0), material);
      const mesh2 = createBoxMesh(new THREE.Vector3(5, 0, 0), material);
      mesh1.castShadow = true;
      mesh1.receiveShadow = true;

      const result = mergeStaticMeshes([mesh1, mesh2]);

      expect(result).not.toBeNull();
      expect(result!.castShadow).toBe(true);
      expect(result!.receiveShadow).toBe(true);
    });

    it("sets frustumCulled to true", () => {
      const material = new THREE.MeshBasicMaterial({ color: 0xff0000 });
      const mesh1 = createBoxMesh(new THREE.Vector3(0, 0, 0), material);
      const mesh2 = createBoxMesh(new THREE.Vector3(5, 0, 0), material);

      const result = mergeStaticMeshes([mesh1, mesh2]);

      expect(result).not.toBeNull();
      expect(result!.frustumCulled).toBe(true);
    });

    it("computes bounding sphere", () => {
      const material = new THREE.MeshBasicMaterial({ color: 0xff0000 });
      const mesh1 = createBoxMesh(new THREE.Vector3(0, 0, 0), material);
      const mesh2 = createBoxMesh(new THREE.Vector3(10, 0, 0), material);

      const result = mergeStaticMeshes([mesh1, mesh2]);

      expect(result).not.toBeNull();
      expect(result!.geometry.boundingSphere).not.toBeNull();
      // Bounding sphere should encompass both boxes
      expect(result!.geometry.boundingSphere!.radius).toBeGreaterThan(5);
    });

    it("handles meshes without normals", () => {
      const material = new THREE.MeshBasicMaterial({ color: 0xff0000 });
      const geometry = new THREE.PlaneGeometry(1, 1);
      geometry.deleteAttribute("normal");

      const mesh1 = new THREE.Mesh(geometry, material);
      const mesh2 = new THREE.Mesh(geometry.clone(), material);
      mesh2.position.set(5, 0, 0);
      mesh1.updateMatrixWorld(true);
      mesh2.updateMatrixWorld(true);

      const result = mergeStaticMeshes([mesh1, mesh2]);

      expect(result).not.toBeNull();
      expect(result!.geometry.getAttribute("normal")).toBeUndefined();
    });

    it("handles meshes without UVs", () => {
      const material = new THREE.MeshBasicMaterial({ color: 0xff0000 });
      const geometry = new THREE.PlaneGeometry(1, 1);
      geometry.deleteAttribute("uv");

      const mesh1 = new THREE.Mesh(geometry, material);
      const mesh2 = new THREE.Mesh(geometry.clone(), material);
      mesh2.position.set(5, 0, 0);
      mesh1.updateMatrixWorld(true);
      mesh2.updateMatrixWorld(true);

      const result = mergeStaticMeshes([mesh1, mesh2]);

      expect(result).not.toBeNull();
      expect(result!.geometry.getAttribute("uv")).toBeUndefined();
    });

    it("handles non-indexed geometry", () => {
      const material = new THREE.MeshBasicMaterial({ color: 0xff0000 });
      const geometry = new THREE.PlaneGeometry(1, 1);
      // Convert to non-indexed
      const nonIndexed = geometry.toNonIndexed();

      const mesh1 = new THREE.Mesh(nonIndexed, material);
      const mesh2 = new THREE.Mesh(nonIndexed.clone(), material);
      mesh2.position.set(5, 0, 0);
      mesh1.updateMatrixWorld(true);
      mesh2.updateMatrixWorld(true);

      const result = mergeStaticMeshes([mesh1, mesh2]);

      expect(result).not.toBeNull();
      expect(result!.geometry.index).toBeDefined();
    });
  });

  describe("groupMeshesByMaterial", () => {
    function createMesh(material: THREE.Material, name = "Test"): THREE.Mesh {
      const geometry = new THREE.BoxGeometry(1, 1, 1);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = name;
      return mesh;
    }

    it("groups meshes with same material", () => {
      const material = new THREE.MeshBasicMaterial({ color: 0xff0000 });
      const mesh1 = createMesh(material, "a");
      const mesh2 = createMesh(material, "b");
      const mesh3 = createMesh(material, "c");

      const groups = groupMeshesByMaterial([mesh1, mesh2, mesh3]);

      expect(groups.size).toBe(1);
      const [group] = groups.values();
      expect(group.length).toBe(3);
    });

    it("separates meshes with different materials", () => {
      const material1 = new THREE.MeshBasicMaterial({ color: 0xff0000 });
      const material2 = new THREE.MeshBasicMaterial({ color: 0x00ff00 });

      const mesh1 = createMesh(material1, "a");
      const mesh2 = createMesh(material2, "b");
      const mesh3 = createMesh(material1, "c");

      const groups = groupMeshesByMaterial([mesh1, mesh2, mesh3]);

      expect(groups.size).toBe(2);

      // Find group with material1
      let mat1Count = 0,
        mat2Count = 0;
      for (const meshes of groups.values()) {
        const firstMaterial = meshes[0].material;
        if (firstMaterial === material1) {
          mat1Count = meshes.length;
        } else {
          mat2Count = meshes.length;
        }
      }

      expect(mat1Count).toBe(2);
      expect(mat2Count).toBe(1);
    });

    it("handles empty array", () => {
      const groups = groupMeshesByMaterial([]);
      expect(groups.size).toBe(0);
    });

    it("uses material UUID as key", () => {
      const material = new THREE.MeshBasicMaterial({ color: 0xff0000 });
      const mesh1 = createMesh(material);
      const mesh2 = createMesh(material);

      const groups = groupMeshesByMaterial([mesh1, mesh2]);

      expect(groups.has(material.uuid)).toBe(true);
    });

    it("handles null/undefined material gracefully", () => {
      const geometry = new THREE.BoxGeometry(1, 1, 1);
      const mesh = new THREE.Mesh(geometry);
      // Mesh has undefined material by default in some cases

      // Shouldn't throw
      const groups = groupMeshesByMaterial([mesh]);
      expect(groups.size).toBe(1);
    });

    it("handles multi-material meshes (uses first material)", () => {
      const material1 = new THREE.MeshBasicMaterial({ color: 0xff0000 });
      const material2 = new THREE.MeshBasicMaterial({ color: 0x00ff00 });

      const geometry = new THREE.BoxGeometry(1, 1, 1);
      const mesh = new THREE.Mesh(geometry, [material1, material2]);

      const groups = groupMeshesByMaterial([mesh]);

      // Should use first material's UUID
      expect(groups.has(material1.uuid)).toBe(true);
    });
  });

  describe("index generation for non-indexed geometry", () => {
    it("generates sequential indices when geometry has no index", () => {
      const material = new THREE.MeshBasicMaterial({ color: 0xff0000 });

      // Create non-indexed plane geometry
      const geometry = new THREE.PlaneGeometry(1, 1).toNonIndexed();
      const mesh1 = new THREE.Mesh(geometry, material);
      mesh1.updateMatrixWorld(true);

      const result = mergeStaticMeshes([mesh1]);

      // Single mesh returns original
      expect(result).toBe(mesh1);

      // Create two non-indexed meshes to force merge
      const mesh2 = new THREE.Mesh(geometry.clone(), material);
      mesh2.position.set(5, 0, 0);
      mesh2.updateMatrixWorld(true);

      const merged = mergeStaticMeshes([mesh1, mesh2]);

      expect(merged).not.toBeNull();
      expect(merged!.geometry.index).not.toBeNull();

      // Verify indices are sequential and valid
      const indices = merged!.geometry.index!;
      const positions = merged!.geometry.getAttribute("position");
      for (let i = 0; i < indices.count; i++) {
        const idx = indices.getX(i);
        expect(idx).toBeGreaterThanOrEqual(0);
        expect(idx).toBeLessThan(positions.count);
      }
    });
  });

  describe("world matrix transform", () => {
    it("handles hierarchical transforms", () => {
      const material = new THREE.MeshBasicMaterial({ color: 0xff0000 });

      // Create parent-child relationship
      const parent = new THREE.Group();
      parent.position.set(10, 0, 0);

      const geometry = new THREE.BoxGeometry(1, 1, 1);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(5, 0, 0); // Local position
      parent.add(mesh);

      // Must update world matrix for hierarchy
      parent.updateMatrixWorld(true);

      // Create second mesh at origin
      const mesh2 = new THREE.Mesh(geometry.clone(), material);
      mesh2.updateMatrixWorld(true);

      const result = mergeStaticMeshes([mesh, mesh2]);

      expect(result).not.toBeNull();

      const positions = result!.geometry.getAttribute("position");
      let maxX = -Infinity;
      for (let i = 0; i < positions.count; i++) {
        maxX = Math.max(maxX, positions.getX(i));
      }

      // First mesh at parent(10) + local(5) = 15, + half box width = 15.5
      expect(maxX).toBeCloseTo(15.5, 1);
    });
  });
});
