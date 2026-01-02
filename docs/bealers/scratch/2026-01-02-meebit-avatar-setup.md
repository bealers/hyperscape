# Meebit Avatar Setup - Discovery Notes

**Date:** 2026-01-02

## Task
Adding a custom Meebit VRM avatar to Hyperscape

## Status: Partially Working (Parked)

The Meebit loads and displays in both preview and in-game, but has some quirks due to its rig structure.

## Steps Completed

1. Placed VRM file at `packages/server/world/assets/avatars/meebit-3672.vrm`
2. Added entry to `packages/shared/src/data/avatars.ts`
3. Fixed file permissions (`chmod 644`)
4. Added cache-buster to previewUrl to bypass browser's cached 404

## Discovery: CDN Restart Required for New Assets

When adding new asset files to `packages/server/world/assets/`, check:

### Symptoms
- File exists on disk
- Other assets serve correctly (200 OK)
- New asset returns 404 Not Found

### Root Causes Found

1. **File permissions** - Files copied from external sources may have restrictive permissions
   - Check: `ls -la` on the file
   - Fix: `chmod 644 <filename>`
   
2. **Browser cache** - CDN has aggressive caching (`max-age=31536000, immutable`)
   - If you got a 404 before fixing permissions, browser caches it!
   - Fix: Add `?v=1` cache-buster to URL, or hard refresh (Cmd+Shift+R)

3. **CDN container cache** - Docker volume mounts should auto-update, but sometimes need a restart
   - Fix: `cd packages/server && docker compose restart cdn`

### Verification
```bash
# Check if CDN can serve the file
curl -I http://localhost:8080/avatars/<filename>.vrm

# Should return: HTTP/1.1 200 OK
# If 404: check permissions and restart CDN
```

## Discovery: Meebit VRM Rig Differences

The Meebit VRM was exported with `saturday06_blender_vrm_exporter_experimental_1.13.0` and has some structural differences from standard Hyperscape avatars:

### Missing Bones
Console warnings when loading in-game:
```
[VRMFactory.getBoneName] Normalized bone not found: upperChest
[VRMFactory.getBoneName] Normalized bone not found: rightToes
[VRMFactory.getBoneName] Normalized bone not found: leftToes
```

The Meebit skeleton doesn't include `upperChest` or toe bones, which the animation retargeting expects.

### Material Type
- Uses `KHR_materials_unlit` extension (self-illuminating, no lighting needed)
- Uses 256x1 palette texture lookup (typical for voxel models)
- Works fine with Hyperscape's material conversion to MeshStandardMaterial (scene has adequate lighting)

### Orientation
- Faces backwards in character preview (shows back to camera)
- VRM 0.x format faces +Z direction
- Would need per-avatar rotation config to fix (decided not to add complexity)

### No Built-in Animations
- The VRM file has no embedded animations
- Relies on Hyperscape's emote system for movement

## Current Minimal Changes

Only changes made to the codebase:

1. **`packages/shared/src/data/avatars.ts`**
   - Added Meebit avatar entry
   - Added `?v=1` cache-buster to previewUrl (can be removed once cache expires)

```typescript
{
  id: "meebit-3672",
  name: "Meebit #3672",
  url: "asset://avatars/meebit-3672.vrm",
  // Cache-buster added to bypass stale 404 cached before permissions fix
  previewUrl: "http://localhost:8080/avatars/meebit-3672.vrm?v=1",
  description: "Meebit 3672",
},
```

## Future Improvements (Not Implemented)

If better Meebit support is desired:
1. Re-export VRM with correct orientation (face -Z or add upperChest bone)
2. Add optional `previewRotation` field to avatar definitions for per-avatar rotation
3. Consider suppressing "bone not found" warnings for optional bones like toes

## Inventory Equipping (Unrelated Note)

**How to equip items:**
1. **Right-click** on an item in inventory
2. Select "Equip" from the context menu
3. Item must be equippable (sword, bow, shield, helmet, body, legs, arrows, chainbody, platebody)

Note: Left-click does NOT equip - it's drag-and-drop for rearranging.
