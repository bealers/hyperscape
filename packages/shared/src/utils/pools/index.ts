/**
 * Object Pools
 *
 * Reusable object pools to eliminate allocations in hot paths.
 */

export { quaternionPool, type PooledQuaternion } from "./QuaternionPool";
export { tilePool, type PooledTile } from "./TilePool";
export {
  EntityPool,
  createPoolableWrapper,
  type PoolableEntity,
  type EntityPoolConfig,
  type PoolStats,
} from "./EntityPool";
