import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import type { SyncProgress } from "@/types";

/** Minimum interval between DB writes (ms) */
const FLUSH_INTERVAL_MS = 1000;

const DEFAULT_PROGRESS: SyncProgress = {
  isRunning: false,
  status: "idle",
  sources: [],
  errors: [],
};

// ---------------------------------------------------------------------------
// In-memory cache – avoids DB round-trips on every progress update.
// Writes are throttled: at most one DB write per FLUSH_INTERVAL_MS.
// ---------------------------------------------------------------------------
let cachedProgress: SyncProgress | null = null;
let dirty = false;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let lastFlushTime = 0;

/** Ensure AppSettings row exists (singleton id=1). */
async function ensureRow(): Promise<void> {
  await db.appSettings.upsert({
    where: { id: 1 },
    create: { id: 1 },
    update: {},
  });
}

/** Flush cached progress to DB immediately. */
async function flushToDB(): Promise<void> {
  if (!cachedProgress) return;
  dirty = false;
  lastFlushTime = Date.now();

  // Preserve cancelRequested flag that may have been set by another
  // serverless invocation (the cancel endpoint). Without this merge the
  // flush would overwrite the flag with whatever is in the local cache.
  // BUT: if the cache explicitly has cancelRequested === false (e.g. at
  // sync start), honour that — don't re-inherit a stale true from DB.
  const row = await db.appSettings.findUnique({ where: { id: 1 } });
  const dbRaw = row?.syncProgress as Record<string, unknown> | null;
  if (dbRaw?.cancelRequested === true && cachedProgress.cancelRequested !== false) {
    cachedProgress.cancelRequested = true;
  }

  // Also preserve the __lock field managed by lock.ts
  const lockData = dbRaw?.__lock;
  const toWrite: Record<string, unknown> = {
    ...(cachedProgress as unknown as Record<string, unknown>),
  };
  if (lockData) {
    toWrite.__lock = lockData;
  }

  await db.appSettings.update({
    where: { id: 1 },
    data: { syncProgress: toWrite as unknown as Prisma.InputJsonValue },
  });
}

/** Schedule a deferred flush if one isn't already pending. */
function scheduleFlush(): void {
  if (flushTimer) return;
  const elapsed = Date.now() - lastFlushTime;
  const delay = Math.max(0, FLUSH_INTERVAL_MS - elapsed);
  flushTimer = setTimeout(async () => {
    flushTimer = null;
    if (dirty) {
      await flushToDB();
    }
  }, delay);
}

/**
 * Get the current sync progress.
 * Returns the in-memory cache if available, otherwise reads from DB.
 * Pass `force: true` to always read from DB (used by polling endpoints).
 */
export async function getSyncProgress(options?: { force?: boolean }): Promise<SyncProgress> {
  if (cachedProgress && !options?.force) return { ...cachedProgress };
  await ensureRow();
  const row = await db.appSettings.findUnique({ where: { id: 1 } });
  const raw = row?.syncProgress as Record<string, unknown> | null;
  // Strip internal __lock field from the progress data
  if (raw) {
    const { __lock: _, ...rest } = raw;
    const progress = rest as unknown as SyncProgress;
    cachedProgress = progress;
    return { ...progress };
  }
  const progress = { ...DEFAULT_PROGRESS };
  cachedProgress = progress;
  return { ...progress };
}

/**
 * Update sync progress (partial update).
 * Writes are throttled – the in-memory state is always current
 * and DB is flushed at most once per FLUSH_INTERVAL_MS.
 * Pass `{ immediate: true }` in the options to force an immediate DB write
 * (used for start/end events where the client must see the change right away).
 */
export async function updateSyncProgress(
  update: Partial<SyncProgress>,
  options?: { immediate?: boolean }
): Promise<void> {
  if (!cachedProgress) {
    await getSyncProgress(); // populate cache
  }
  cachedProgress = { ...cachedProgress!, ...update };
  dirty = true;

  if (options?.immediate) {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    await flushToDB();
  } else {
    scheduleFlush();
  }
}

/**
 * Reset sync progress to idle.
 */
export async function resetSyncProgress(): Promise<void> {
  cachedProgress = { ...DEFAULT_PROGRESS };
  dirty = false;
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  await ensureRow();
  await db.appSettings.update({
    where: { id: 1 },
    data: { syncProgress: DEFAULT_PROGRESS as unknown as Prisma.InputJsonValue },
  });
}

/**
 * Add an error to the sync progress.
 */
export async function addSyncError(error: string): Promise<void> {
  if (!cachedProgress) {
    await getSyncProgress();
  }
  cachedProgress!.errors.push(error);
  dirty = true;
  scheduleFlush();
}

/**
 * Ensure any pending progress is flushed to DB.
 * Call this at the very end of a sync run.
 */
export async function flushSyncProgress(): Promise<void> {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (dirty) {
    await flushToDB();
  }
  cachedProgress = null;
}

/**
 * Request cancellation of the currently running sync.
 * Sets the cancelRequested flag directly in the DB so the
 * sync engine (possibly in another serverless invocation) can see it.
 */
export async function requestSyncCancel(): Promise<void> {
  await ensureRow();
  const row = await db.appSettings.findUnique({ where: { id: 1 } });
  const raw = (row?.syncProgress as Record<string, unknown>) || {};
  raw.cancelRequested = true;
  await db.appSettings.update({
    where: { id: 1 },
    data: { syncProgress: raw as unknown as Prisma.InputJsonValue },
  });
  // Also update in-memory cache if present
  if (cachedProgress) {
    cachedProgress.cancelRequested = true;
  }
}

/**
 * Check if cancellation has been requested.
 * Reads directly from DB to get the latest state (not cached).
 * Also syncs the flag into the in-memory cache so subsequent
 * flushToDB() calls will preserve it.
 */
export async function isCancelRequested(): Promise<boolean> {
  const row = await db.appSettings.findUnique({ where: { id: 1 } });
  const raw = row?.syncProgress as Record<string, unknown> | null;
  const cancelled = raw?.cancelRequested === true;
  if (cancelled && cachedProgress) {
    cachedProgress.cancelRequested = true;
  }
  return cancelled;
}
