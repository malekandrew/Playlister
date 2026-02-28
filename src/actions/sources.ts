"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import type { SourceFormData } from "@/types";
import { XtreamClient } from "@/lib/sync/xtream-client";
import { fetchAndParseM3U, extractGroups } from "@/lib/sync/m3u-parser";

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export async function createSource(data: SourceFormData) {
  validateSourceData(data);

  const source = await db.sourcePlaylist.create({
    data: {
      name: data.name,
      type: data.type,
      xtreamHost: data.type === "xtream" ? data.xtreamHost : null,
      xtreamUsername: data.type === "xtream" ? data.xtreamUsername : null,
      xtreamPassword: data.type === "xtream" ? data.xtreamPassword : null,
      m3uUrl: data.type === "m3u" ? data.m3uUrl : null,
      isEnabled: data.isEnabled,
      refreshIntervalMin: data.refreshIntervalMin,
    },
  });

  revalidatePath("/sources");
  return { success: true, id: source.id };
}

export async function updateSource(id: number, data: SourceFormData) {
  validateSourceData(data);

  await db.sourcePlaylist.update({
    where: { id },
    data: {
      name: data.name,
      type: data.type,
      xtreamHost: data.type === "xtream" ? data.xtreamHost : null,
      xtreamUsername: data.type === "xtream" ? data.xtreamUsername : null,
      xtreamPassword: data.type === "xtream" ? data.xtreamPassword : null,
      m3uUrl: data.type === "m3u" ? data.m3uUrl : null,
      isEnabled: data.isEnabled,
      refreshIntervalMin: data.refreshIntervalMin,
    },
  });

  revalidatePath("/sources");
  revalidatePath(`/sources/${id}`);
  return { success: true };
}

export async function deleteSource(id: number) {
  await db.sourcePlaylist.delete({ where: { id } });
  revalidatePath("/sources");
  return { success: true };
}

export async function toggleSource(id: number, isEnabled: boolean) {
  await db.sourcePlaylist.update({
    where: { id },
    data: { isEnabled },
  });
  revalidatePath("/sources");
  return { success: true };
}

export async function getSource(id: number) {
  return db.sourcePlaylist.findUnique({
    where: { id },
    include: {
      _count: { select: { categories: true, channels: true } },
    },
  });
}

export async function getSources() {
  return db.sourcePlaylist.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { categories: true, channels: true } },
    },
  });
}

// ---------------------------------------------------------------------------
// Fetch categories from upstream provider
// ---------------------------------------------------------------------------

export async function fetchCategories(sourceId: number) {
  const source = await db.sourcePlaylist.findUnique({
    where: { id: sourceId },
  });

  if (!source) {
    return { success: false, error: "Source not found" };
  }

  try {
    if (source.type === "xtream") {
      return await fetchXtreamCategories(source);
    } else {
      return await fetchM3UCategories(source);
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    await db.sourcePlaylist.update({
      where: { id: sourceId },
      data: { lastSyncError: errorMsg },
    });
    return { success: false, error: errorMsg };
  }
}

async function fetchXtreamCategories(source: {
  id: number;
  xtreamHost: string | null;
  xtreamUsername: string | null;
  xtreamPassword: string | null;
}) {
  if (!source.xtreamHost || !source.xtreamUsername || !source.xtreamPassword) {
    throw new Error("Missing Xtream credentials");
  }

  const client = new XtreamClient(
    source.xtreamHost,
    source.xtreamUsername,
    source.xtreamPassword
  );

  // Authenticate first
  const auth = await client.authenticate();
  if (auth.user_info.auth === 0) {
    throw new Error("Xtream authentication failed");
  }

  // Fetch all category types in parallel
  const [liveCategories, vodCategories, seriesCategories] = await Promise.all([
    client.getLiveCategories(),
    client.getVodCategories(),
    client.getSeriesCategories(),
  ]);

  // Upsert categories
  let upsertedCount = 0;

  const allCategories = [
    ...liveCategories.map((c) => ({
      categoryId: c.category_id,
      categoryName: c.category_name,
      categoryType: "live" as const,
    })),
    ...vodCategories.map((c) => ({
      categoryId: c.category_id,
      categoryName: c.category_name,
      categoryType: "movie" as const,
    })),
    ...seriesCategories.map((c) => ({
      categoryId: c.category_id,
      categoryName: c.category_name,
      categoryType: "series" as const,
    })),
  ];

  for (const cat of allCategories) {
    await db.category.upsert({
      where: {
        sourcePlaylistId_categoryId_categoryType: {
          sourcePlaylistId: source.id,
          categoryId: cat.categoryId,
          categoryType: cat.categoryType,
        },
      },
      create: {
        sourcePlaylistId: source.id,
        categoryId: cat.categoryId,
        categoryName: cat.categoryName,
        categoryType: cat.categoryType,
      },
      update: {
        categoryName: cat.categoryName,
      },
    });
    upsertedCount++;
  }

  // Remove categories that no longer exist upstream
  const upstreamKeys = new Set(
    allCategories.map((c) => `${c.categoryId}:${c.categoryType}`)
  );

  const existingCategories = await db.category.findMany({
    where: { sourcePlaylistId: source.id },
    select: { id: true, categoryId: true, categoryType: true },
  });

  const toDelete = existingCategories.filter(
    (c) => !upstreamKeys.has(`${c.categoryId}:${c.categoryType}`)
  );

  if (toDelete.length > 0) {
    await db.category.deleteMany({
      where: { id: { in: toDelete.map((c) => c.id) } },
    });
  }

  revalidatePath(`/sources/${source.id}/categories`);
  revalidatePath("/sources");

  return {
    success: true,
    count: upsertedCount,
    removed: toDelete.length,
  };
}

async function fetchM3UCategories(source: {
  id: number;
  m3uUrl: string | null;
}) {
  if (!source.m3uUrl) {
    throw new Error("Missing M3U URL");
  }

  const result = await fetchAndParseM3U(source.m3uUrl);
  const groups = extractGroups(result.entries);

  let upsertedCount = 0;

  for (const group of groups) {
    await db.category.upsert({
      where: {
        sourcePlaylistId_categoryId_categoryType: {
          sourcePlaylistId: source.id,
          categoryId: group, // Use group name as categoryId for M3U
          categoryType: "live",
        },
      },
      create: {
        sourcePlaylistId: source.id,
        categoryId: group,
        categoryName: group,
        categoryType: "live",
      },
      update: {
        categoryName: group,
      },
    });
    upsertedCount++;
  }

  // Remove stale categories
  const existingCategories = await db.category.findMany({
    where: { sourcePlaylistId: source.id },
    select: { id: true, categoryId: true },
  });

  const toDelete = existingCategories.filter(
    (c) => !groups.includes(c.categoryId)
  );

  if (toDelete.length > 0) {
    await db.category.deleteMany({
      where: { id: { in: toDelete.map((c) => c.id) } },
    });
  }

  revalidatePath(`/sources/${source.id}/categories`);
  revalidatePath("/sources");

  return {
    success: true,
    count: upsertedCount,
    removed: toDelete.length,
  };
}

// ---------------------------------------------------------------------------
// Category management
// ---------------------------------------------------------------------------

export async function getCategories(sourceId: number) {
  return db.category.findMany({
    where: { sourcePlaylistId: sourceId },
    orderBy: [{ categoryType: "asc" }, { categoryName: "asc" }],
    include: {
      _count: { select: { channels: true } },
    },
  });
}

export async function toggleCategory(id: number, isEnabled: boolean) {
  await db.category.update({
    where: { id },
    data: { isEnabled },
  });
  revalidatePath("/sources");
  return { success: true };
}

export async function toggleAllCategories(
  sourceId: number,
  categoryType: string,
  isEnabled: boolean
) {
  await db.category.updateMany({
    where: { sourcePlaylistId: sourceId, categoryType },
    data: { isEnabled },
  });
  revalidatePath("/sources");
  return { success: true };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validateSourceData(data: SourceFormData) {
  if (!data.name?.trim()) {
    throw new Error("Source name is required");
  }

  if (data.type === "xtream") {
    if (!data.xtreamHost?.trim()) {
      throw new Error("Xtream host URL is required");
    }
    if (!data.xtreamUsername?.trim()) {
      throw new Error("Xtream username is required");
    }
    if (!data.xtreamPassword?.trim()) {
      throw new Error("Xtream password is required");
    }
  } else if (data.type === "m3u") {
    if (!data.m3uUrl?.trim()) {
      throw new Error("M3U URL is required");
    }
  } else {
    throw new Error("Invalid source type");
  }
}
