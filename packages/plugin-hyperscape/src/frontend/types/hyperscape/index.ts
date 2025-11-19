/**
 * Hyperscape Game Types for ElizaOS Frontend
 *
 * These types represent game state data for agents playing in Hyperscape.
 * Used for visualizing RPG stats, inventory, skills, and game context.
 */

// ============================================================================
// Core Player Types
// ============================================================================

export interface Position3D {
  x: number;
  y: number;
  z: number;
}

export interface PlayerHealth {
  current: number;
  max: number;
  regenerating: boolean;
}

export interface PlayerStats {
  // Combat Skills
  attack: number;
  strength: number;
  defense: number;
  constitution: number;
  ranged: number;

  // Gathering Skills
  woodcutting: number;
  fishing: number;

  // Processing Skills
  firemaking: number;
  cooking: number;
}

export interface SkillXP {
  skill: keyof PlayerStats;
  level: number;
  currentXP: number;
  nextLevelXP: number;
  percentage: number;
}

export interface CombatStats {
  combatLevel: number;
  attackBonus: number;
  strengthBonus: number;
  defenseBonus: number;
  rangedBonus: number;
}

// ============================================================================
// Inventory & Equipment Types
// ============================================================================

export interface InventoryItem {
  id: string;
  itemId: string;
  name: string;
  quantity: number;
  slot: number;
  stackable: boolean;
  icon?: string;
  value?: number;
}

export interface Equipment {
  head: InventoryItem | null;
  cape: InventoryItem | null;
  neck: InventoryItem | null;
  ammunition: InventoryItem | null;
  weapon: InventoryItem | null;
  body: InventoryItem | null;
  shield: InventoryItem | null;
  legs: InventoryItem | null;
  gloves: InventoryItem | null;
  boots: InventoryItem | null;
  ring: InventoryItem | null;
}

export interface Inventory {
  items: InventoryItem[];
  maxSlots: number;
  usedSlots: number;
  freeSlots: number;
}

// ============================================================================
// World & Position Types
// ============================================================================

export interface WorldPosition {
  position: Position3D;
  region: string;
  areaName: string;
  lastUpdated: string;
}

export interface NearbyEntity {
  id: string;
  type: "player" | "npc" | "mob" | "object" | "item";
  name: string;
  position: Position3D;
  distance: number;
  level?: number;
  hostile?: boolean;
}

// ============================================================================
// Action & Activity Types
// ============================================================================

export interface GameAction {
  id: string;
  timestamp: string;
  action: string;
  target?: string;
  success: boolean;
  context?: string;
  result?: string;
  xpGained?: number;
  itemsGained?: InventoryItem[];
}

export interface AgentActivity {
  currentAction: string | null;
  actionStartTime: string | null;
  actionProgress?: number;
  recentActions: GameAction[];
}

// ============================================================================
// Combat Types
// ============================================================================

export interface CombatEvent {
  id: string;
  timestamp: string;
  type: "attack" | "damage_dealt" | "damage_taken" | "kill" | "death";
  attacker?: string;
  target?: string;
  damage?: number;
  weapon?: string;
  loot?: InventoryItem[];
}

export interface CombatSession {
  id: string;
  startTime: string;
  endTime?: string;
  target: string;
  targetLevel?: number;
  damageDealt: number;
  damageTaken: number;
  kills: number;
  deaths: number;
  lootGained: InventoryItem[];
  xpGained: number;
  active: boolean;
}

// ============================================================================
// Banking Types
// ============================================================================

export interface BankData {
  items: InventoryItem[];
  usedSlots: number;
  maxSlots: number;
  totalValue: number;
}

// ============================================================================
// Performance Metrics Types
// ============================================================================

export interface PerformanceMetrics {
  sessionStart: string;
  sessionDuration: number; // minutes

  // XP Rates (per hour)
  xpRates: Record<keyof PlayerStats, number>;
  totalXPGained: number;

  // Economic
  goldEarned: number;
  goldPerHour: number;
  itemsCollected: number;

  // Efficiency
  actionsPerMinute: number;
  successRate: number; // percentage
  deathCount: number;

  // Resource specific
  logsChopped?: number;
  fishCaught?: number;
  foodCooked?: number;
}

// ============================================================================
// Agent Status Types
// ============================================================================

export interface HyperscapeAgentStatus {
  agentId: string;
  connected: boolean;
  worldId: string | null;
  worldName: string | null;

  // Player State
  health: PlayerHealth;
  stats: PlayerStats;
  combatStats: CombatStats;
  position: WorldPosition | null;

  // Inventory & Equipment
  inventory: Inventory;
  equipment: Equipment;
  bank?: BankData;

  // Activity
  activity: AgentActivity;
  nearbyEntities: NearbyEntity[];

  // Combat
  inCombat: boolean;
  currentCombatSession?: CombatSession;
  combatHistory: CombatEvent[];

  // Performance
  metrics: PerformanceMetrics;

  lastUpdated: string;
}

// ============================================================================
// API Response Types
// ============================================================================

export interface HyperscapeAPIResponse<T> {
  success: boolean;
  data: T;
  error?: string;
  timestamp: string;
}

export interface SkillProgressResponse {
  skills: SkillXP[];
  totalLevel: number;
}

export interface WorldStatusResponse {
  connected: boolean;
  worldId: string;
  worldName: string;
  playerCount: number;
  wsUrl: string;
}

// ============================================================================
// WebSocket Event Types
// ============================================================================

export type HyperscapeEventType =
  | "xp_gained"
  | "item_looted"
  | "combat_started"
  | "combat_ended"
  | "damage_dealt"
  | "damage_taken"
  | "level_up"
  | "death"
  | "teleport"
  | "action_started"
  | "action_completed"
  | "action_failed";

export interface HyperscapeEvent {
  type: HyperscapeEventType;
  timestamp: string;
  data: Record<string, unknown>;
}

// ============================================================================
// UI State Types
// ============================================================================

export interface HyperscapeUIState {
  selectedSkill: keyof PlayerStats | null;
  showInventory: boolean;
  showEquipment: boolean;
  showCombatLog: boolean;
  showMap: boolean;
  autoRefresh: boolean;
  refreshInterval: number; // milliseconds
}
