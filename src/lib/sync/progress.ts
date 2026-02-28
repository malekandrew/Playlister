import { redis } from "@/lib/redis";
import { SYNC_PROGRESS_KEY, SYNC_PROGRESS_TTL } from "@/lib/constants";
import type { SyncProgress } from "@/types";

/** Minimum interval between KV writes (ms) */
const FLUSH_INTERVAL_MS = 500;

const DEFAULT_PROGRESS: SyncProgress = {
  isRunning: false,
  status: "idle",
  sources: [],
  errors: [],
};

// ---------------------------------------------------------------------------
// In-memory cache – avoids GET+SET round-trips on every progress update.
// Writes are throttled: at most one KV SET per FLUSH_INTERVAL_MS.
// ---------------------------------------------------------------------------
let cachedProgress: SyncProgress | null = null;
let dirty = false;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let lastFlushTime = 0;

/** Flush cached progress to KV immediately. */
async function flushToKV(): Promise<void> {
  if (!cachedProgress) return;
  dirty = false;
  lastFlushTime = Date.now();
  await redis.set(SYNC_PROGRESS_KEY, cachedProgress, { ex: SYNC_PROGRESS_TTL });
}

/** Schedule a deferred flush if one isn't already pending. */
function scheduleFlush(): void {
  if (flushTimer) return;
  const elapsed = Date.now() - lastFlushTime;
  const delay = Math.max(0, FLUSH_INTERVAL_MS - elapsed);
  flushTimer = setTimeout(async () => {
    flushTimer = null;
    if (dirty) {
      await flushToKV();
    }
  }, delay);
}

/**
 * Get the current sync progress.
 * Returns the in-memory cache if available, otherwise reads from KV.
 */
export async function getSyncProgress(): Promise<SyncProgress> {
  if (cachedProgress) return { ...cachedProgress };
  const data = await redis.get<SyncProgress>(SYNC_PROGRESS_KEY);
  const progress = data || { ...DEFAULT_PROGRESS };
  cachedProgress = progress;
  return { ...progress };
}

/**
 * Update sync progress (partial update).
 * Writes are throttled – the in-memory state is always current
 * and KV is flushed at most once per FLUSH_INTERVAL_MS.
 * Pass `{ immediate: true }` in the options to force an immediate KV write
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
    await flushToKV();
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
  await redis.set(SYNC_PROGRESS_KEY, cachedProgress, {
    ex: SYNC_PROGRESS_TTL,
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
 * Ensure any pending progress is flushed to KV.
 * Call this at the very end of a sync run.
 */
export async function flushSyncProgress(): Promise<void> {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (dirty) {
    await flushToKV();
  }
  cachedProgress = null;
}
