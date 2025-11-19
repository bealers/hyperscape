/**
 * Hyperscape Components Index
 *
 * Central export file for all Hyperscape-related components.
 * Import these components when integrating Hyperscape functionality
 * into the main ElizaOS frontend.
 */

export { HyperscapeDashboard } from "./HyperscapeDashboard";
export { PlayerStatsPanel } from "./PlayerStatsPanel";
export { InventoryViewer } from "./InventoryViewer";

// Re-export types for convenience
export type {
  HyperscapeAgentStatus,
  PlayerStats,
  PlayerHealth,
  Inventory,
  InventoryItem,
  Equipment,
  WorldPosition,
  NearbyEntity,
  CombatSession,
  PerformanceMetrics,
} from "../../types/hyperscape/index.js";
