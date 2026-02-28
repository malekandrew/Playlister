import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { SYNC_LOCK_TTL } from "@/lib/constants";

/**
 * Sync lock stored as a JSON field on AppSettings.
 * Shape: { ownerId: string, expiresAt: number (epoch ms) }
 */
interface LockData {
  ownerId: string;
  expiresAt: number;
}

async function ensureRow(): Promise<void> {
  await db.appSettings.upsert({
    where: { id: 1 },
    create: { id: 1 },
    update: {},
  });
}

async function getLock(): Promise<LockData | null> {
  const row = await db.appSettings.findUnique({ where: { id: 1 } });
  const progress = row?.syncProgress as Record<string, unknown> | null;
  const lock = progress?.__lock as LockData | undefined;
  if (!lock) return null;
  if (Date.now() > lock.expiresAt) return null; // expired
  return lock;
}

async function setLock(lock: LockData | null): Promise<void> {
  const row = await db.appSettings.findUnique({ where: { id: 1 } });
  const progress = (row?.syncProgress as Record<string, unknown>) || {};
  if (lock) {
    progress.__lock = lock;
  } else {
    delete progress.__lock;
  }
  await db.appSettings.update({
    where: { id: 1 },
    data: { syncProgress: progress as unknown as Prisma.InputJsonValue },
  });
}

/**
 * Try to acquire the global sync lock.
 * Returns true if the lock was acquired, false if another sync is running.
 */
export async function acquireSyncLock(ownerId: string): Promise<boolean> {
  await ensureRow();
  const existing = await getLock();
  if (existing) return false; // lock held by someone else
  await setLock({ ownerId, expiresAt: Date.now() + SYNC_LOCK_TTL * 1000 });
  return true;
}

/**
 * Release the sync lock, but only if we own it.
 */
export async function releaseSyncLock(ownerId: string): Promise<boolean> {
  const existing = await getLock();
  if (existing?.ownerId === ownerId) {
    await setLock(null);
    return true;
  }
  return false;
}

/**
 * Extend the sync lock TTL (heartbeat).
 */
export async function extendSyncLock(ownerId: string): Promise<boolean> {
  const existing = await getLock();
  if (existing?.ownerId === ownerId) {
    await setLock({ ownerId, expiresAt: Date.now() + SYNC_LOCK_TTL * 1000 });
    return true;
  }
  return false;
}

/**
 * Check if a sync is currently running.
 */
export async function isSyncLocked(): Promise<boolean> {
  await ensureRow();
  const existing = await getLock();
  return existing !== null;
}
