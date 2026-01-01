/**
 * Renderer Factory
 *
 * Creates WebGPU renderers for Hyperscape.
 * WebGPU-only implementation - no WebGL fallback.
 */

import THREE from "../../extras/three/three";
import { Logger } from "../Logger";

/**
 * WebGPU Renderer type definition
 * Provides the interface for the WebGPU renderer from three/webgpu
 */
export type WebGPURenderer = {
  init: () => Promise<void>;
  setSize: (w: number, h: number, updateStyle?: boolean) => void;
  setPixelRatio: (r: number) => void;
  render: (scene: THREE.Scene, camera: THREE.Camera) => void;
  renderAsync: (scene: THREE.Scene, camera: THREE.Camera) => Promise<void>;
  toneMapping: THREE.ToneMapping;
  toneMappingExposure: number;
  outputColorSpace: THREE.ColorSpace;
  domElement: HTMLCanvasElement;
  setAnimationLoop: (cb: ((time: number) => void) | null) => void;
  dispose: () => void;
  info: {
    render: { triangles: number; calls: number };
    memory: { geometries: number; textures: number };
  };
  shadowMap: {
    enabled: boolean;
    type: THREE.ShadowMapType;
  };
  capabilities: {
    maxAnisotropy: number;
  };
  backend: {
    device?: { features: Set<string> };
  };
  outputNode: unknown;
};

export type UniversalRenderer = WebGPURenderer;

export interface RendererOptions {
  antialias?: boolean;
  alpha?: boolean;
  powerPreference?: "high-performance" | "low-power" | "default";
  preserveDrawingBuffer?: boolean;
  canvas?: HTMLCanvasElement;
}

export interface RendererCapabilities {
  supportsWebGPU: boolean;
  maxAnisotropy: number;
  backend: "webgpu";
}

/**
 * Check if WebGPU is available in the current browser
 */
export async function isWebGPUAvailable(): Promise<boolean> {
  if (typeof navigator === "undefined") return false;

  // Access gpu property safely
  const gpuApi = (
    navigator as { gpu?: { requestAdapter: () => Promise<unknown | null> } }
  ).gpu;
  if (!gpuApi) return false;

  const adapter = await gpuApi.requestAdapter();
  return adapter !== null;
}

/**
 * Detect rendering capabilities
 */
export async function detectRenderingCapabilities(): Promise<RendererCapabilities> {
  const supportsWebGPU = await isWebGPUAvailable();

  if (!supportsWebGPU) {
    throw new Error(
      "WebGPU is not supported in this browser. " +
        "Please use Chrome 113+, Edge 113+, or Safari 17+.",
    );
  }

  return {
    supportsWebGPU: true,
    maxAnisotropy: 16, // WebGPU default
    backend: "webgpu",
  };
}

/**
 * Create a WebGPU renderer
 */
export async function createRenderer(
  options: RendererOptions = {},
): Promise<WebGPURenderer> {
  const { antialias = true, canvas } = options;

  // Verify WebGPU support
  await detectRenderingCapabilities();

  // Create WebGPU renderer using Three.js WebGPU build
  // The THREE namespace from three/webgpu includes WebGPURenderer
  const WebGPURendererClass = (
    THREE as unknown as {
      WebGPURenderer: new (params: {
        canvas?: HTMLCanvasElement;
        antialias?: boolean;
      }) => WebGPURenderer;
    }
  ).WebGPURenderer;

  const renderer = new WebGPURendererClass({
    canvas,
    antialias,
  });

  // Initialize WebGPU backend
  await renderer.init();

  return renderer;
}

/**
 * Check if renderer is WebGPU (always true in this implementation)
 */
export function isWebGPURenderer(
  renderer: UniversalRenderer,
): renderer is WebGPURenderer {
  return typeof renderer.init === "function";
}

/**
 * Get renderer backend type (always webgpu)
 */
export function getRendererBackend(_renderer: UniversalRenderer): "webgpu" {
  return "webgpu";
}

/**
 * Configure renderer with common settings
 */
export function configureRenderer(
  renderer: UniversalRenderer,
  options: {
    clearColor?: number;
    clearAlpha?: number;
    pixelRatio?: number;
    width?: number;
    height?: number;
    toneMapping?: THREE.ToneMapping;
    toneMappingExposure?: number;
    outputColorSpace?: THREE.ColorSpace;
  },
): void {
  const {
    pixelRatio = 1,
    width,
    height,
    toneMapping = THREE.ACESFilmicToneMapping,
    toneMappingExposure = 1,
    outputColorSpace = THREE.SRGBColorSpace,
  } = options;

  // Pixel ratio
  renderer.setPixelRatio(pixelRatio);

  // Size
  if (width && height) {
    renderer.setSize(width, height);
  }

  // Tone mapping
  renderer.toneMapping = toneMapping;
  renderer.toneMappingExposure = toneMappingExposure;

  // Output color space
  renderer.outputColorSpace = outputColorSpace;
}

/**
 * Configure shadow maps
 */
export function configureShadowMaps(
  renderer: UniversalRenderer,
  options: {
    enabled?: boolean;
    type?: THREE.ShadowMapType;
  } = {},
): void {
  const { enabled = true, type = THREE.PCFSoftShadowMap } = options;

  renderer.shadowMap.enabled = enabled;
  renderer.shadowMap.type = type;
}

/**
 * Get max anisotropy
 */
export function getMaxAnisotropy(renderer: UniversalRenderer): number {
  return renderer.capabilities?.maxAnisotropy ?? 16;
}

/**
 * Get WebGPU capabilities for logging and debugging
 */
export function getWebGPUCapabilities(renderer: UniversalRenderer): {
  backend: string;
  features: string[];
} {
  const device = renderer.backend?.device;
  const features: string[] = [];

  if (device?.features) {
    device.features.forEach((feature: string) => features.push(feature));
  }

  return {
    backend: "webgpu",
    features,
  };
}

/**
 * Log WebGPU info for debugging
 */
export function logWebGPUInfo(renderer: UniversalRenderer): void {
  const caps = getWebGPUCapabilities(renderer);
  Logger.info("[RendererFactory] WebGPU initialized", {
    features: caps.features.length,
  });
}

/**
 * Optimize materials for WebGPU rendering
 */
export function optimizeMaterialForWebGPU(material: THREE.Material): void {
  if (!material) return;

  type MaterialWithTextureProps = THREE.Material &
    Partial<
      Record<
        "map" | "normalMap" | "roughnessMap" | "metalnessMap" | "emissiveMap",
        THREE.Texture | undefined
      >
    >;

  // Enable anisotropic filtering on textures
  const textureProps: Array<keyof MaterialWithTextureProps> = [
    "map",
    "normalMap",
    "roughnessMap",
    "metalnessMap",
    "emissiveMap",
  ];
  for (const prop of textureProps) {
    const tex = (material as MaterialWithTextureProps)[prop];
    if (tex instanceof THREE.Texture) {
      tex.anisotropy = 16;
    }
  }
}

/**
 * Create optimized instanced mesh
 */
export function createOptimizedInstancedMesh(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  count: number,
): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.frustumCulled = true;
  return mesh;
}

/**
 * Merge multiple meshes with the same material into a single mesh
 * Reduces draw calls for static geometry
 *
 * This implements geometry merging manually since BufferGeometryUtils
 * is not available in the three/webgpu namespace.
 *
 * @param meshes Array of meshes to merge (must share same material)
 * @returns Single merged mesh, or null if merging failed
 */
export function mergeStaticMeshes(meshes: THREE.Mesh[]): THREE.Mesh | null {
  if (meshes.length === 0) return null;
  if (meshes.length === 1) return meshes[0];

  // Collect all geometry data
  const allPositions: number[] = [];
  const allNormals: number[] = [];
  const allUvs: number[] = [];
  const allIndices: number[] = [];
  let indexOffset = 0;

  // Pre-allocate temporaries outside loop
  const tempVec = new THREE.Vector3();
  const tempNormal = new THREE.Vector3();
  const normalMatrix = new THREE.Matrix3();

  for (const mesh of meshes) {
    const geometry = mesh.geometry;
    mesh.updateWorldMatrix(true, false);

    const positions = geometry.getAttribute("position");
    const normals = geometry.getAttribute("normal");
    const uvs = geometry.getAttribute("uv");
    const indices = geometry.getIndex();

    if (!positions) continue;

    // Get normal matrix for this mesh
    normalMatrix.getNormalMatrix(mesh.matrixWorld);

    for (let i = 0; i < positions.count; i++) {
      // Transform position
      tempVec.fromBufferAttribute(positions, i);
      tempVec.applyMatrix4(mesh.matrixWorld);
      allPositions.push(tempVec.x, tempVec.y, tempVec.z);

      // Transform normal
      if (normals) {
        tempNormal.fromBufferAttribute(normals, i);
        tempNormal.applyMatrix3(normalMatrix).normalize();
        allNormals.push(tempNormal.x, tempNormal.y, tempNormal.z);
      }

      // Copy UVs
      if (uvs) {
        allUvs.push(uvs.getX(i), uvs.getY(i));
      }
    }

    // Copy indices with offset
    if (indices) {
      for (let i = 0; i < indices.count; i++) {
        allIndices.push(indices.getX(i) + indexOffset);
      }
    } else {
      // Generate indices for non-indexed geometry
      for (let i = 0; i < positions.count; i++) {
        allIndices.push(i + indexOffset);
      }
    }

    indexOffset += positions.count;
  }

  // Create merged geometry
  const mergedGeometry = new THREE.BufferGeometry();
  mergedGeometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(allPositions, 3),
  );

  if (allNormals.length > 0) {
    mergedGeometry.setAttribute(
      "normal",
      new THREE.Float32BufferAttribute(allNormals, 3),
    );
  }

  if (allUvs.length > 0) {
    mergedGeometry.setAttribute(
      "uv",
      new THREE.Float32BufferAttribute(allUvs, 2),
    );
  }

  mergedGeometry.setIndex(allIndices);
  mergedGeometry.computeBoundingSphere();

  // Create the merged mesh using the first mesh's material
  const material = meshes[0].material;
  const mergedMesh = new THREE.Mesh(mergedGeometry, material);

  mergedMesh.frustumCulled = true;
  mergedMesh.receiveShadow = meshes[0].receiveShadow;
  mergedMesh.castShadow = meshes[0].castShadow;
  mergedMesh.name = "MergedStaticMesh";

  // Store original mesh data for interaction (click detection, etc.)
  mergedMesh.userData.mergedMeshes = meshes.map((m) => ({
    name: m.name,
    position: m.position.clone(),
    userData: { ...m.userData },
  }));

  return mergedMesh;
}

/**
 * Group meshes by material for efficient merging
 * Returns a map of material UUID to array of meshes using that material
 */
export function groupMeshesByMaterial(
  meshes: THREE.Mesh[],
): Map<string, THREE.Mesh[]> {
  const groups = new Map<string, THREE.Mesh[]>();

  for (const mesh of meshes) {
    const materialUuid = Array.isArray(mesh.material)
      ? mesh.material[0]?.uuid || "default"
      : mesh.material?.uuid || "default";

    if (!groups.has(materialUuid)) {
      groups.set(materialUuid, []);
    }
    groups.get(materialUuid)!.push(mesh);
  }

  return groups;
}

/**
 * Merge all static meshes in a scene/group by material
 * Replaces original meshes with merged versions
 *
 * @param parent The parent object containing meshes to merge
 * @param minMeshesToMerge Minimum meshes with same material before merging (default: 3)
 */
export function mergeStaticMeshesInGroup(
  parent: THREE.Object3D,
  minMeshesToMerge = 3,
): void {
  // Collect all meshes
  const meshes: THREE.Mesh[] = [];
  parent.traverse((child) => {
    if (
      child instanceof THREE.Mesh &&
      child.userData.static !== false && // Skip if explicitly marked non-static
      !(child instanceof THREE.InstancedMesh) // Skip instanced meshes
    ) {
      meshes.push(child);
    }
  });

  // Group by material
  const groups = groupMeshesByMaterial(meshes);

  // Merge groups with enough meshes
  for (const [, groupMeshes] of groups) {
    if (groupMeshes.length >= minMeshesToMerge) {
      const mergedMesh = mergeStaticMeshes(groupMeshes);

      if (mergedMesh) {
        // Add merged mesh to parent
        parent.add(mergedMesh);

        // Remove original meshes
        for (const mesh of groupMeshes) {
          mesh.removeFromParent();
          mesh.geometry.dispose();
        }

        console.log(
          `[RendererFactory] Merged ${groupMeshes.length} meshes into 1`,
        );
      }
    }
  }
}
