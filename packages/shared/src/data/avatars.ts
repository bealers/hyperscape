/**
 * Avatar Definitions
 *
 * Defines available VRM avatar models for character creation.
 * These models are loaded from the asset server at runtime.
 */

export interface AvatarOption {
  id: string;
  name: string;
  url: string; // asset:// URL for in-game use
  previewUrl: string; // HTTP URL for character preview
  description?: string;
}

/**
 * Available avatar models
 *
 * - `url`: Uses asset:// protocol which is resolved by the ClientLoader for in-game rendering
 * - `previewUrl`: HTTP URL used by CharacterPreview component during character creation
 *
 * The actual files are served from packages/server/world/assets/
 */
export const AVATAR_OPTIONS: AvatarOption[] = [
  {
    id: "male-01",
    name: "Male Avatar 01",
    url: "asset://avatars/avatar-male-01.vrm",
    previewUrl: "http://localhost:8080/avatars/avatar-male-01.vrm",
    description: "Standard male humanoid avatar",
  },
  {
    id: "male-02",
    name: "Male Avatar 02",
    url: "asset://avatars/avatar-male-02.vrm",
    previewUrl: "http://localhost:8080/avatars/avatar-male-02.vrm",
    description: "Standard male humanoid avatar",
  },
  {
    id: "female-01",
    name: "Female Avatar 01",
    url: "asset://avatars/avatar-female-01.vrm",
    previewUrl: "http://localhost:8080/avatars/avatar-female-01.vrm",
    description: "Standard female humanoid avatar",
  },
  {
    id: "female-02",
    name: "Female Avatar 02",
    url: "asset://avatars/avatar-female-02.vrm",
    previewUrl: "http://localhost:8080/avatars/avatar-female-02.vrm",
    description: "Standard female humanoid avatar",
  },
  {
    id: "meebit-3672",
    name: "Meebit #3672",
    url: "asset://avatars/meebit-3672.vrm",
    // Cache-buster added to bypass stale 404 cached before permissions fix
    previewUrl: "http://localhost:8080/avatars/meebit-3672.vrm?v=1",
    description: "Meebit 3672",
  },
];

/**
 * Get avatar by ID
 */
export function getAvatarById(id: string): AvatarOption | undefined {
  return AVATAR_OPTIONS.find((avatar) => avatar.id === id);
}

/**
 * Get avatar by URL (checks both url and previewUrl)
 */
export function getAvatarByUrl(url: string): AvatarOption | undefined {
  return AVATAR_OPTIONS.find(
    (avatar) => avatar.url === url || avatar.previewUrl === url,
  );
}
