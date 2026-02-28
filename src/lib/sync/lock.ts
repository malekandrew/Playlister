import { redis } from "@/lib/redis";
import { SYNC_LOCK_KEY, SYNC_LOCK_TTL } from "@/lib/constants";

/**
 * Try to acquire the global sync lock.
 * Returns true if the lock was acquired, false if another sync is running.
 */
export async function acquireSyncLock(ownerId: string): Promise<boolean> {
  // SET with NX (only set if not exists) and EX (expiry in seconds)
  const result = await redis.set(SYNC_LOCK_KEY, ownerId, {
    nx: true,
    ex: SYNC_LOCK_TTL,
  });
  return result === "OK";
}

/**
 * Release the sync lock, but only if we own it.
 */
export async function releaseSyncLock(ownerId: string): Promise<boolean> {
  const currentOwner = await redis.get<string>(SYNC_LOCK_KEY);
  if (currentOwner === ownerId) {
    await redis.del(SYNC_LOCK_KEY);
    return true;
  }
  return false;
}

/**
 * Extend the sync lock TTL (heartbeat).
 */
export async function extendSyncLock(ownerId: string): Promise<boolean> {
  const currentOwner = await redis.get<string>(SYNC_LOCK_KEY);
  if (currentOwner === ownerId) {
    await redis.expire(SYNC_LOCK_KEY, SYNC_LOCK_TTL);
    return true;
  }
  return false;
}

/**
 * Check if a sync is currently running.
 */
export async function isSyncLocked(): Promise<boolean> {
  const exists = await redis.exists(SYNC_LOCK_KEY);
  return exists === 1;
}
