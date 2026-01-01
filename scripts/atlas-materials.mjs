#!/usr/bin/env node
/**
 * Material Atlas & Merger Script
 * 
 * Automatically creates texture atlases and merges materials in GLB files.
 * Reduces to maximum 2 materials: one opaque, one transparent.
 * 
 * This dramatically reduces draw calls by:
 * 1. Packing all diffuse textures into atlases (2K or 4K)
 * 2. Remapping UVs to atlas coordinates  
 * 3. Merging all opaque meshes into one material
 * 4. Merging all transparent meshes into one material
 * 
 * Usage: node scripts/atlas-materials.mjs <input.glb> [output.glb]
 *        node scripts/atlas-materials.mjs --dir <directory> [--recursive]
 * 
 * Options:
 *   --atlas-size <size>   Atlas texture size (default: 2048)
 *   --verbose             Show detailed output
 *   --dry-run             Preview without changes
 *   --dir <path>          Process all GLB files in directory
 *   --recursive           Process subdirectories too
 */

import { Document, NodeIO, PropertyType } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { 
  dedup, 
  prune, 
  weld, 
  join as joinMeshes,
  palette,
  flatten,
  quantize,
  instance,
  meshopt 
} from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync, readFileSync } from 'fs';
import { basename, dirname, extname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configuration
const CONFIG = {
  atlasSize: 2048,        // Default atlas size
  maxAtlasSize: 4096,     // Maximum atlas size
  padding: 2,             // Padding between atlas entries (pixels)
  jpegQuality: 90,        // JPEG quality for atlas output
  webpQuality: 85,        // WebP quality for atlas output
};

// Parse arguments
const args = process.argv.slice(2);
const options = {
  verbose: args.includes('--verbose'),
  dryRun: args.includes('--dry-run'),
  recursive: args.includes('--recursive'),
  atlasSize: args.includes('--atlas-size') 
    ? parseInt(args[args.indexOf('--atlas-size') + 1]) 
    : CONFIG.atlasSize,
  dirMode: args.includes('--dir'),
  inputPath: args.includes('--dir') 
    ? args[args.indexOf('--dir') + 1]
    : args.find(a => !a.startsWith('--')),
  outputPath: args.filter(a => !a.startsWith('--'))[1],
};

function log(msg, level = 'info') {
  const prefix = {
    info: '\x1b[36mℹ\x1b[0m',
    warn: '\x1b[33m⚠\x1b[0m',
    error: '\x1b[31m✗\x1b[0m',
    success: '\x1b[32m✓\x1b[0m',
    debug: '\x1b[90m·\x1b[0m',
  }[level] || 'ℹ';
  
  if (level === 'debug' && !options.verbose) return;
  console.log(`${prefix} ${msg}`);
}

/**
 * Atlas entry representing a texture slot in the atlas
 */
class AtlasEntry {
  constructor(texture, material, slot, isTransparent) {
    this.texture = texture;        // Original texture
    this.material = material;      // Parent material
    this.slot = slot;              // Slot name (baseColorTexture, etc.)
    this.isTransparent = isTransparent;
    this.atlasRegion = null;       // { x, y, width, height } in atlas
  }
}

/**
 * Pack rectangles into an atlas using simple shelf algorithm
 */
function packRectangles(entries, atlasSize) {
  // Sort by height (tallest first) for better packing
  const sorted = [...entries].sort((a, b) => {
    const hA = a.texture?.getSize()?.[1] || 256;
    const hB = b.texture?.getSize()?.[1] || 256;
    return hB - hA;
  });
  
  const padding = CONFIG.padding;
  let currentX = padding;
  let currentY = padding;
  let rowHeight = 0;
  
  for (const entry of sorted) {
    const size = entry.texture?.getSize() || [256, 256];
    const width = Math.min(size[0], atlasSize / 2); // Cap individual texture size
    const height = Math.min(size[1], atlasSize / 2);
    
    // Check if we need a new row
    if (currentX + width + padding > atlasSize) {
      currentX = padding;
      currentY += rowHeight + padding;
      rowHeight = 0;
    }
    
    // Check if we've exceeded atlas height
    if (currentY + height + padding > atlasSize) {
      log(`Atlas overflow - some textures won't fit in ${atlasSize}x${atlasSize}`, 'warn');
      break;
    }
    
    entry.atlasRegion = {
      x: currentX,
      y: currentY,
      width,
      height,
      // UV coordinates (0-1 range)
      u0: currentX / atlasSize,
      v0: currentY / atlasSize,
      u1: (currentX + width) / atlasSize,
      v1: (currentY + height) / atlasSize,
    };
    
    currentX += width + padding;
    rowHeight = Math.max(rowHeight, height);
  }
  
  return sorted.filter(e => e.atlasRegion !== null);
}

/**
 * Create an atlas image from packed entries
 */
async function createAtlasImage(entries, atlasSize) {
  // Create a blank atlas with sharp
  const atlas = sharp({
    create: {
      width: atlasSize,
      height: atlasSize,
      channels: 4,
      background: { r: 128, g: 128, b: 128, alpha: 255 }
    }
  });
  
  const compositeOps = [];
  
  for (const entry of entries) {
    if (!entry.atlasRegion || !entry.texture) continue;
    
    const imageData = entry.texture.getImage();
    if (!imageData) continue;
    
    const { x, y, width, height } = entry.atlasRegion;
    
    try {
      // Resize texture to fit its atlas slot
      const resized = await sharp(imageData)
        .resize(width, height, { fit: 'fill' })
        .toBuffer();
      
      compositeOps.push({
        input: resized,
        left: Math.round(x),
        top: Math.round(y),
      });
    } catch (err) {
      log(`Failed to process texture: ${err.message}`, 'warn');
    }
  }
  
  if (compositeOps.length === 0) {
    return null;
  }
  
  // Composite all textures onto the atlas
  const result = await atlas
    .composite(compositeOps)
    .webp({ quality: CONFIG.webpQuality })
    .toBuffer();
  
  return result;
}

/**
 * Transform UV coordinates from original to atlas space
 */
function transformUV(uv, region) {
  // Original UV (0-1) maps to region in atlas
  const u = region.u0 + uv[0] * (region.u1 - region.u0);
  const v = region.v0 + uv[1] * (region.v1 - region.v0);
  return [u, v];
}

/**
 * Remap mesh UVs to atlas coordinates
 */
function remapMeshUVs(mesh, uvRemapping) {
  for (const primitive of mesh.listPrimitives()) {
    const material = primitive.getMaterial();
    if (!material) continue;
    
    const region = uvRemapping.get(material);
    if (!region) continue;
    
    const texcoord = primitive.getAttribute('TEXCOORD_0');
    if (!texcoord) continue;
    
    // Get UV data
    const uvArray = texcoord.getArray();
    if (!uvArray) continue;
    
    // Transform each UV coordinate
    for (let i = 0; i < uvArray.length; i += 2) {
      const [newU, newV] = transformUV([uvArray[i], uvArray[i + 1]], region);
      uvArray[i] = newU;
      uvArray[i + 1] = newV;
    }
    
    // Mark as updated
    texcoord.setArray(uvArray);
  }
}

/**
 * Main material merging function
 */
async function mergeModelMaterials(inputPath, outputPath, atlasSize) {
  log(`Processing: ${inputPath}`, 'info');
  
  // Initialize gltf-transform with meshopt encoder and decoder
  await MeshoptEncoder.ready;
  await MeshoptDecoder.ready;
  
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({
      'meshopt.decoder': MeshoptDecoder,
      'meshopt.encoder': MeshoptEncoder,
    });
  
  // Read the document
  const document = await io.read(inputPath);
  const root = document.getRoot();
  
  // Collect all materials and their textures
  const materials = root.listMaterials();
  const opaqueMaterials = [];
  const transparentMaterials = [];
  
  for (const material of materials) {
    const alphaMode = material.getAlphaMode();
    if (alphaMode === 'BLEND' || alphaMode === 'MASK') {
      transparentMaterials.push(material);
    } else {
      opaqueMaterials.push(material);
    }
  }
  
  log(`Found ${opaqueMaterials.length} opaque, ${transparentMaterials.length} transparent materials`, 'debug');
  
  // Skip if already optimized (2 or fewer materials)
  if (materials.length <= 2) {
    log(`Already optimized (${materials.length} materials)`, 'debug');
    
    // Still apply other optimizations
    await document.transform(
      dedup(),
      prune(),
      weld({ tolerance: 0.0001 }),
      meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
    );
    
    await io.write(outputPath, document);
    return { merged: false, materialCount: materials.length };
  }
  
  // Collect textures for atlasing
  const opaqueEntries = [];
  const transparentEntries = [];
  
  for (const material of opaqueMaterials) {
    const baseColor = material.getBaseColorTexture();
    if (baseColor) {
      opaqueEntries.push(new AtlasEntry(baseColor, material, 'baseColor', false));
    }
  }
  
  for (const material of transparentMaterials) {
    const baseColor = material.getBaseColorTexture();
    if (baseColor) {
      transparentEntries.push(new AtlasEntry(baseColor, material, 'baseColor', true));
    }
  }
  
  log(`Atlasing ${opaqueEntries.length} opaque, ${transparentEntries.length} transparent textures`, 'debug');
  
  // Pack textures into atlases
  const packedOpaque = packRectangles(opaqueEntries, atlasSize);
  const packedTransparent = packRectangles(transparentEntries, atlasSize);
  
  // Create atlas images
  let opaqueAtlasBuffer = null;
  let transparentAtlasBuffer = null;
  
  if (packedOpaque.length > 0) {
    opaqueAtlasBuffer = await createAtlasImage(packedOpaque, atlasSize);
  }
  
  if (packedTransparent.length > 0) {
    transparentAtlasBuffer = await createAtlasImage(packedTransparent, atlasSize);
  }
  
  // Create new atlas textures in the document
  let opaqueAtlasTexture = null;
  let transparentAtlasTexture = null;
  
  if (opaqueAtlasBuffer) {
    opaqueAtlasTexture = document.createTexture('atlas_opaque')
      .setMimeType('image/webp')
      .setImage(opaqueAtlasBuffer);
  }
  
  if (transparentAtlasBuffer) {
    transparentAtlasTexture = document.createTexture('atlas_transparent')
      .setMimeType('image/webp')
      .setImage(transparentAtlasBuffer);
  }
  
  // Create UV remapping from material to atlas region
  const opaqueUVMap = new Map();
  const transparentUVMap = new Map();
  
  for (const entry of packedOpaque) {
    opaqueUVMap.set(entry.material, entry.atlasRegion);
  }
  
  for (const entry of packedTransparent) {
    transparentUVMap.set(entry.material, entry.atlasRegion);
  }
  
  // Remap UVs on all meshes
  for (const mesh of root.listMeshes()) {
    remapMeshUVs(mesh, opaqueUVMap);
    remapMeshUVs(mesh, transparentUVMap);
  }
  
  // Create merged materials
  let mergedOpaqueMaterial = null;
  let mergedTransparentMaterial = null;
  
  if (opaqueAtlasTexture && opaqueMaterials.length > 0) {
    mergedOpaqueMaterial = document.createMaterial('merged_opaque')
      .setBaseColorTexture(opaqueAtlasTexture)
      .setAlphaMode('OPAQUE')
      .setDoubleSided(false)
      .setRoughnessFactor(0.8)
      .setMetallicFactor(0.0);
  }
  
  if (transparentAtlasTexture && transparentMaterials.length > 0) {
    mergedTransparentMaterial = document.createMaterial('merged_transparent')
      .setBaseColorTexture(transparentAtlasTexture)
      .setAlphaMode('MASK')
      .setAlphaCutoff(0.5)
      .setDoubleSided(true)
      .setRoughnessFactor(0.8)
      .setMetallicFactor(0.0);
  }
  
  // Replace materials on primitives
  for (const mesh of root.listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      const oldMaterial = primitive.getMaterial();
      if (!oldMaterial) continue;
      
      if (opaqueUVMap.has(oldMaterial) && mergedOpaqueMaterial) {
        primitive.setMaterial(mergedOpaqueMaterial);
      } else if (transparentUVMap.has(oldMaterial) && mergedTransparentMaterial) {
        primitive.setMaterial(mergedTransparentMaterial);
      }
    }
  }
  
  // Apply final optimizations
  await document.transform(
    dedup(),
    prune(),        // Remove unused textures/materials
    weld({ tolerance: 0.0001 }),
    quantize(),
    meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
  );
  
  // Write output
  if (!options.dryRun) {
    await io.write(outputPath, document);
  }
  
  const finalMaterialCount = document.getRoot().listMaterials().length;
  log(`Merged to ${finalMaterialCount} material(s)`, 'success');
  
  return {
    merged: true,
    originalMaterialCount: materials.length,
    materialCount: finalMaterialCount,
  };
}

/**
 * Process a directory of GLB files
 */
async function processDirectory(dirPath, recursive = false) {
  const results = {
    processed: 0,
    merged: 0,
    errors: 0,
  };
  
  const files = readdirSync(dirPath);
  
  for (const file of files) {
    const fullPath = join(dirPath, file);
    const stat = statSync(fullPath);
    
    if (stat.isDirectory() && recursive) {
      const subResults = await processDirectory(fullPath, recursive);
      results.processed += subResults.processed;
      results.merged += subResults.merged;
      results.errors += subResults.errors;
    } else if (extname(file).toLowerCase() === '.glb') {
      try {
        const result = await mergeModelMaterials(fullPath, fullPath, options.atlasSize);
        results.processed++;
        if (result.merged) results.merged++;
      } catch (err) {
        log(`Error processing ${file}: ${err.message}`, 'error');
        results.errors++;
      }
    }
  }
  
  return results;
}

/**
 * Main entry point
 */
async function main() {
  console.log('\n\x1b[36m╔═══════════════════════════════════════════════════════════════════╗\x1b[0m');
  console.log('\x1b[36m║           🎨 MATERIAL ATLAS & MERGER                              ║\x1b[0m');
  console.log('\x1b[36m╚═══════════════════════════════════════════════════════════════════╝\x1b[0m\n');
  
  if (!options.inputPath) {
    console.log('Usage: node scripts/atlas-materials.mjs <input.glb> [output.glb]');
    console.log('       node scripts/atlas-materials.mjs --dir <directory> [--recursive]');
    console.log('\nOptions:');
    console.log('  --atlas-size <size>   Atlas texture size (default: 2048)');
    console.log('  --verbose             Show detailed output');
    console.log('  --dry-run             Preview without changes');
    console.log('  --dir <path>          Process all GLB files in directory');
    console.log('  --recursive           Process subdirectories too');
    process.exit(1);
  }
  
  if (options.dirMode) {
    log(`Processing directory: ${options.inputPath}`, 'info');
    log(`Atlas size: ${options.atlasSize}x${options.atlasSize}`, 'info');
    if (options.dryRun) log('DRY RUN - no files will be modified', 'warn');
    
    const results = await processDirectory(options.inputPath, options.recursive);
    
    console.log('\n\x1b[36m═══════════════════════════════════════════════════════════════════\x1b[0m');
    console.log(`  📊 Results:`);
    console.log(`     Processed: ${results.processed} files`);
    console.log(`     Merged:    ${results.merged} files`);
    console.log(`     Errors:    ${results.errors}`);
    console.log('\x1b[36m═══════════════════════════════════════════════════════════════════\x1b[0m\n');
  } else {
    const inputPath = resolve(options.inputPath);
    const outputPath = options.outputPath ? resolve(options.outputPath) : inputPath;
    
    if (!existsSync(inputPath)) {
      log(`File not found: ${inputPath}`, 'error');
      process.exit(1);
    }
    
    log(`Input:  ${inputPath}`, 'info');
    log(`Output: ${outputPath}`, 'info');
    log(`Atlas size: ${options.atlasSize}x${options.atlasSize}`, 'info');
    if (options.dryRun) log('DRY RUN - no files will be modified', 'warn');
    
    try {
      const result = await mergeModelMaterials(inputPath, outputPath, options.atlasSize);
      
      if (result.merged) {
        log(`Merged ${result.originalMaterialCount} → ${result.materialCount} materials`, 'success');
      } else {
        log(`Already optimized (${result.materialCount} materials)`, 'info');
      }
    } catch (err) {
      log(`Error: ${err.message}`, 'error');
      if (options.verbose) console.error(err.stack);
      process.exit(1);
    }
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
