import { db } from "@/lib/db";
import { XtreamClient } from "./xtream-client";
import { fetchAndParseM3U, extractGroups } from "./m3u-parser";
import { updateSyncProgress, addSyncError, resetSyncProgress, getSyncProgress, flushSyncProgress, isCancelRequested } from "./progress";
import { acquireSyncLock, releaseSyncLock } from "./lock";
import { randomUUID } from "crypto";
import type { SourceSyncStatus } from "@/types";

/** Thrown when user requests cancellation. */
class SyncCancelledError extends Error {
  constructor() {
    super("Sync cancelled by user");
    this.name = "SyncCancelledError";
  }
}

/** Check cancel flag from DB; throw if requested. */
async function throwIfCancelled(): Promise<void> {
  if (await isCancelRequested()) {
    throw new SyncCancelledError();
  }
}

/** Concurrency limit for parallel API fetches */
const XTREAM_CONCURRENCY = 5;
/** Concurrency limit for series info fetches */
const SERIES_CONCURRENCY = 10;

interface SyncResult {
  success: boolean;
  sourcesProcessed: number;
  totalChannels: number;
  errors: string[];
}

/**
 * Run tasks with bounded concurrency.
 * Returns results in the same order as the input items.
 */
async function parallelMap<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const i = nextIndex++;
      results[i] = await fn(items[i], i);
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => worker()
  );
  await Promise.all(workers);
  return results;
}

/**
 * Run a full sync for all enabled sources.
 * Acquires a distributed lock, fetches channels from all enabled sources,
 * performs an atomic DB swap per source.
 */
export async function runFullSync(): Promise<SyncResult> {
  const lockId = randomUUID();
  const errors: string[] = [];
  let sourcesProcessed = 0;
  let totalChannels = 0;

  // Try to acquire the sync lock
  const locked = await acquireSyncLock(lockId);
  if (!locked) {
    return {
      success: false,
      sourcesProcessed: 0,
      totalChannels: 0,
      errors: ["Another sync is already running"],
    };
  }

  try {
    // Get all enabled sources
    const sources = await db.sourcePlaylist.findMany({
      where: { isEnabled: true },
      include: {
        categories: { where: { isEnabled: true } },
      },
    });

    // Build per-source status list
    const sourceStatuses: SourceSyncStatus[] = sources.map((s) => ({
      sourceId: s.id,
      sourceName: s.name,
      status: "pending" as const,
      categoriesTotal: s.categories.length,
      categoriesProcessed: 0,
      channelsFetched: 0,
    }));

    const totalCats = sources.reduce((sum, s) => sum + s.categories.length, 0);

    await updateSyncProgress({
      isRunning: true,
      status: "syncing",
      currentStep: `Starting sync of ${sources.length} source(s)`,
      startedAt: new Date().toISOString(),
      totalSources: sources.length,
      processedSources: 0,
      totalCategories: totalCats,
      processedCategories: 0,
      totalChannels: 0,
      sources: sourceStatuses,
      errors: [],
    }, { immediate: true });

    if (sources.length === 0) {
      await updateSyncProgress({
        isRunning: false,
        status: "completed",
        completedAt: new Date().toISOString(),
        currentStep: "No enabled sources found",
        sources: [],
        errors: ["No enabled sources found"],
      }, { immediate: true });
      return {
        success: true,
        sourcesProcessed: 0,
        totalChannels: 0,
        errors: ["No enabled sources found"],
      };
    }

    /** Derive global processed categories from all source statuses. */
    const getGlobalProcessedCats = () =>
      sourceStatuses.reduce((sum, s) => sum + s.categoriesProcessed, 0);

    // Process each source
    for (let si = 0; si < sources.length; si++) {
      // Check for cancellation before starting each source
      await throwIfCancelled();
      const source = sources[si];
      const srcStatus = sourceStatuses[si];

      try {
        srcStatus.status = "syncing";
        srcStatus.startedAt = new Date().toISOString();
        await updateSyncProgress({
          currentStep: `Syncing ${source.name}`,
          processedSources: si,
          sources: sourceStatuses,
        });

        let channelCount = 0;

        // Progress callback for per-category updates
        const onCategoryDone = async (catsDone: number, channelsSoFar: number) => {
          srcStatus.categoriesProcessed = catsDone;
          srcStatus.channelsFetched = channelsSoFar;
          await updateSyncProgress({
            processedCategories: getGlobalProcessedCats(),
            sources: sourceStatuses,
          });
        };

        if (source.type === "xtream") {
          channelCount = await syncXtreamSource(source, onCategoryDone);
        } else if (source.type === "m3u") {
          channelCount = await syncM3USource(source);
          srcStatus.categoriesProcessed = srcStatus.categoriesTotal;
          srcStatus.channelsFetched = channelCount;
        }

        totalChannels += channelCount;
        sourcesProcessed++;

        srcStatus.status = "completed";
        srcStatus.channelsFetched = channelCount;
        srcStatus.completedAt = new Date().toISOString();

        await updateSyncProgress({
          processedSources: si + 1,
          processedCategories: getGlobalProcessedCats(),
          totalChannels,
          sources: sourceStatuses,
          currentStep: `Completed ${source.name} (${channelCount} channels)`,
        });

        // Update source record
        await db.sourcePlaylist.update({
          where: { id: source.id },
          data: {
            lastSyncedAt: new Date(),
            lastSyncChannelCount: channelCount,
            lastSyncError: null,
          },
        });
      } catch (err) {
        const errMsg = `Error syncing ${source.name}: ${err instanceof Error ? err.message : String(err)}`;
        errors.push(errMsg);
        await addSyncError(errMsg);

        srcStatus.status = "error";
        srcStatus.error = err instanceof Error ? err.message : String(err);
        srcStatus.completedAt = new Date().toISOString();
        srcStatus.categoriesProcessed = srcStatus.categoriesTotal;

        await updateSyncProgress({
          processedSources: si + 1,
          processedCategories: getGlobalProcessedCats(),
          sources: sourceStatuses,
        });

        await db.sourcePlaylist.update({
          where: { id: source.id },
          data: {
            lastSyncError:
              err instanceof Error ? err.message : String(err),
          },
        });
      }
    }

    await updateSyncProgress({
      isRunning: false,
      status: errors.length > 0 ? "completed_with_errors" : "completed",
      currentStep: `Done. ${sourcesProcessed} sources, ${totalChannels} channels`,
      totalChannels,
      processedChannels: totalChannels,
      processedSources: sources.length,
      completedAt: new Date().toISOString(),
      sources: sourceStatuses,
    }, { immediate: true });
  } catch (err) {
    if (err instanceof SyncCancelledError) {
      await updateSyncProgress({
        isRunning: false,
        status: "cancelled",
        currentStep: "Sync cancelled by user",
        completedAt: new Date().toISOString(),
        cancelRequested: false,
      }, { immediate: true });
    } else {
      const errMsg = `Sync failed: ${err instanceof Error ? err.message : String(err)}`;
      errors.push(errMsg);
      await updateSyncProgress({
        isRunning: false,
        status: "error",
        completedAt: new Date().toISOString(),
        errors: [errMsg],
        cancelRequested: false,
      }, { immediate: true });
    }
  } finally {
    await flushSyncProgress();
    await releaseSyncLock(lockId);
  }

  return {
    success: errors.length === 0,
    sourcesProcessed,
    totalChannels,
    errors,
  };
}

// ---------------------------------------------------------------------------
// Xtream sync
// ---------------------------------------------------------------------------

async function syncXtreamSource(source: {
  id: number;
  name: string;
  xtreamHost: string | null;
  xtreamUsername: string | null;
  xtreamPassword: string | null;
  categories: { id: number; categoryId: string; categoryType: string }[];
}, onCategoryDone?: (catsDone: number, channelsSoFar: number) => Promise<void>): Promise<number> {
  if (!source.xtreamHost || !source.xtreamUsername || !source.xtreamPassword) {
    throw new Error("Missing Xtream credentials");
  }

  const client = new XtreamClient(
    source.xtreamHost,
    source.xtreamUsername,
    source.xtreamPassword
  );

  // Verify auth
  const auth = await client.authenticate();
  if (auth.user_info.auth === 0) {
    throw new Error("Xtream authentication failed");
  }

  // Collect all channels across enabled categories
  const channels: {
    sourcePlaylistId: number;
    categoryId: number | null;
    name: string;
    url: string;
    groupTitle: string;
    tvgId: string;
    tvgName: string;
    tvgLogo: string;
  }[] = [];

  // Track completed categories using a Set (safe across parallel workers
  // since JS is single-threaded between awaits and Set.add is synchronous)
  const completedCatIds = new Set<string>();
  const totalCatCount = source.categories.length;

  const markCategoryDone = async (categoryId: string) => {
    completedCatIds.add(categoryId);
    if (onCategoryDone) {
      await onCategoryDone(completedCatIds.size, channels.length);
    }
  };

  // Group categories by type for smarter batching
  const liveCategories = source.categories.filter(c => c.categoryType === "live");
  const movieCategories = source.categories.filter(c => c.categoryType === "movie");
  const seriesCategories = source.categories.filter(c => c.categoryType === "series");

  // --- Fetch all live streams in parallel batches ---
  if (liveCategories.length > 0) {
    await parallelMap(liveCategories, XTREAM_CONCURRENCY, async (category) => {
      await throwIfCancelled();
      try {
        const streams = await client.getLiveStreams(category.categoryId);
        for (const stream of streams) {
          channels.push({
            sourcePlaylistId: source.id,
            categoryId: category.id,
            name: stream.name,
            url: client.buildLiveStreamUrl(
              stream.stream_id,
              stream.container_extension || "ts"
            ),
            groupTitle: stream.category_name || "",
            tvgId: stream.epg_channel_id || "",
            tvgName: stream.name,
            tvgLogo: stream.stream_icon || "",
          });
        }
        await markCategoryDone(category.categoryId);
      } catch (err) {
        await addSyncError(
          `Category ${category.categoryId} (live): ${err instanceof Error ? err.message : String(err)}`
        );
        await markCategoryDone(category.categoryId);
      }
    });
  }

  await throwIfCancelled();

  // --- Fetch all VOD streams in parallel batches ---
  if (movieCategories.length > 0) {
    await parallelMap(movieCategories, XTREAM_CONCURRENCY, async (category) => {
      await throwIfCancelled();
      try {
        const streams = await client.getVodStreams(category.categoryId);
        for (const stream of streams) {
          channels.push({
            sourcePlaylistId: source.id,
            categoryId: category.id,
            name: stream.name,
            url: client.buildVodStreamUrl(
              stream.stream_id,
              stream.container_extension || "mp4"
            ),
            groupTitle: stream.category_name || "",
            tvgId: "",
            tvgName: stream.name,
            tvgLogo: stream.stream_icon || "",
          });
        }
        await markCategoryDone(category.categoryId);
      } catch (err) {
        await addSyncError(
          `Category ${category.categoryId} (movie): ${err instanceof Error ? err.message : String(err)}`
        );
        await markCategoryDone(category.categoryId);
      }
    });
  }

  await throwIfCancelled();

  // --- Fetch series with parallel category + parallel episode info ---
  if (seriesCategories.length > 0) {
    await parallelMap(seriesCategories, XTREAM_CONCURRENCY, async (category) => {
      await throwIfCancelled();
      try {
        const seriesList = await client.getSeries(category.categoryId);

        // Fetch all series info in parallel with bounded concurrency
        await parallelMap(seriesList, SERIES_CONCURRENCY, async (series) => {
          try {
            const info = await client.getSeriesInfo(series.series_id);
            if (info.episodes) {
              for (const [, episodes] of Object.entries(info.episodes)) {
                for (const ep of episodes) {
                  channels.push({
                    sourcePlaylistId: source.id,
                    categoryId: category.id,
                    name: `${series.name} - S${ep.season}E${ep.episode_num} - ${ep.title}`,
                    url: client.buildSeriesStreamUrl(
                      parseInt(ep.id),
                      ep.container_extension || "mp4"
                    ),
                    groupTitle: series.category_name || "",
                    tvgId: "",
                    tvgName: series.name,
                    tvgLogo: series.cover || "",
                  });
                }
              }
            }
          } catch {
            // Skip individual series that fail
          }
        });

        await markCategoryDone(category.categoryId);
      } catch (err) {
        await addSyncError(
          `Category ${category.categoryId} (series): ${err instanceof Error ? err.message : String(err)}`
        );
        await markCategoryDone(category.categoryId);
      }
    });
  }

  // Abort if no channels found
  if (channels.length === 0) {
    throw new Error("Zero channels fetched — aborting to prevent data loss");
  }

  // Atomic swap: delete old channels then insert new ones in a transaction
  await atomicChannelSwap(source.id, channels);

  return channels.length;
}

// ---------------------------------------------------------------------------
// M3U sync
// ---------------------------------------------------------------------------

async function syncM3USource(source: {
  id: number;
  name: string;
  m3uUrl: string | null;
  categories: { id: number; categoryId: string; categoryType: string }[];
}): Promise<number> {
  if (!source.m3uUrl) {
    throw new Error("Missing M3U URL");
  }

  const result = await fetchAndParseM3U(source.m3uUrl);

  if (result.entries.length === 0) {
    throw new Error("Zero entries parsed from M3U — aborting");
  }

  // Build a lookup from category ID (group name) to DB category
  const categoryMap = new Map<string, number>();
  for (const cat of source.categories) {
    categoryMap.set(cat.categoryId, cat.id);
  }

  // Auto-create any new categories from M3U groups — batch upsert
  const groups = extractGroups(result.entries);
  const newGroups = groups.filter((g) => !categoryMap.has(g));

  if (newGroups.length > 0) {
    // Upsert in parallel batches
    await parallelMap(newGroups, 10, async (group) => {
      const newCat = await db.category.upsert({
        where: {
          sourcePlaylistId_categoryId_categoryType: {
            sourcePlaylistId: source.id,
            categoryId: group,
            categoryType: "live",
          },
        },
        create: {
          sourcePlaylistId: source.id,
          categoryId: group,
          categoryName: group,
          categoryType: "live",
        },
        update: { categoryName: group },
      });
      categoryMap.set(group, newCat.id);
    });
  }

  const channels = result.entries.map((entry) => ({
    sourcePlaylistId: source.id,
    categoryId: categoryMap.get(entry.groupTitle) || null,
    name: entry.name,
    url: entry.url,
    groupTitle: entry.groupTitle,
    tvgId: entry.tvgId,
    tvgName: entry.tvgName,
    tvgLogo: entry.tvgLogo,
  }));

  await atomicChannelSwap(source.id, channels);

  return channels.length;
}

// ---------------------------------------------------------------------------
// Atomic DB swap
// ---------------------------------------------------------------------------

async function atomicChannelSwap(
  sourcePlaylistId: number,
  channels: {
    sourcePlaylistId: number;
    categoryId: number | null;
    name: string;
    url: string;
    groupTitle?: string;
    tvgId?: string;
    tvgName?: string;
    tvgLogo?: string;
  }[]
): Promise<void> {
  // Use raw SQL with unnest for bulk inserts — much faster than Prisma createMany
  // for large datasets (avoids per-row ORM overhead).
  const RAW_BATCH = 5000; // rows per INSERT statement

  await db.$transaction(async (tx) => {
    // Delete all existing channels for this source
    await tx.$executeRawUnsafe(
      `DELETE FROM "Channel" WHERE "sourcePlaylistId" = $1`,
      sourcePlaylistId
    );

    // Batch insert using raw SQL with unnest arrays
    for (let i = 0; i < channels.length; i += RAW_BATCH) {
      const batch = channels.slice(i, i + RAW_BATCH);

      const sourceIds: number[] = [];
      const categoryIds: (number | null)[] = [];
      const names: string[] = [];
      const urls: string[] = [];
      const groupTitles: (string | null)[] = [];
      const tvgIds: (string | null)[] = [];
      const tvgNames: (string | null)[] = [];
      const tvgLogos: (string | null)[] = [];

      for (const ch of batch) {
        sourceIds.push(ch.sourcePlaylistId);
        categoryIds.push(ch.categoryId ?? null);
        names.push(ch.name);
        urls.push(ch.url);
        groupTitles.push(ch.groupTitle ?? null);
        tvgIds.push(ch.tvgId ?? null);
        tvgNames.push(ch.tvgName ?? null);
        tvgLogos.push(ch.tvgLogo ?? null);
      }

      await tx.$executeRawUnsafe(
        `INSERT INTO "Channel" ("sourcePlaylistId", "categoryId", "name", "url", "groupTitle", "tvgId", "tvgName", "tvgLogo", "createdAt", "updatedAt")
         SELECT * FROM unnest(
           $1::int[], $2::int[], $3::text[], $4::text[],
           $5::text[], $6::text[], $7::text[], $8::text[],
           $9::timestamp[], $10::timestamp[]
         )`,
        sourceIds,
        categoryIds,
        names,
        urls,
        groupTitles,
        tvgIds,
        tvgNames,
        tvgLogos,
        batch.map(() => new Date()),
        batch.map(() => new Date())
      );
    }
  }, { timeout: 30000 });
}

/**
 * Sync a single source by ID.
 */
export async function syncSingleSource(sourceId: number): Promise<{
  success: boolean;
  channelCount: number;
  error?: string;
}> {
  const source = await db.sourcePlaylist.findUnique({
    where: { id: sourceId },
    include: {
      categories: { where: { isEnabled: true } },
    },
  });

  if (!source) {
    return { success: false, channelCount: 0, error: "Source not found" };
  }

  try {
    let channelCount = 0;

    if (source.type === "xtream") {
      channelCount = await syncXtreamSource(source);
    } else if (source.type === "m3u") {
      channelCount = await syncM3USource(source);
    }

    await db.sourcePlaylist.update({
      where: { id: source.id },
      data: {
        lastSyncedAt: new Date(),
        lastSyncChannelCount: channelCount,
        lastSyncError: null,
      },
    });

    return { success: true, channelCount };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    await db.sourcePlaylist.update({
      where: { id: source.id },
      data: { lastSyncError: error },
    });
    return { success: false, channelCount: 0, error };
  }
}
