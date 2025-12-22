/**
 * Combat Systems
 * Combat mechanics, aggro management, and death handling
 */

export * from "./CombatSystem";
export * from "./AggroSystem";
export * from "./PlayerDeathSystem";
export * from "./MobDeathSystem";

export * from "./CombatStateService";
export * from "./CombatEntityResolver";
export * from "./DamageCalculator";
export * from "./CombatAnimationManager";
export * from "./CombatRotationManager";
export * from "./CombatAnimationSync";
export * from "./CombatAntiCheat";
export * from "./RangeSystem";
export * from "./CombatReplayService";
export * from "./PidManager";

// NOTE: CombatRequestValidator is SERVER-ONLY (uses Node.js crypto)
// Import directly: import { CombatRequestValidator } from "@hyperscape/shared/systems/shared/combat/CombatRequestValidator"
