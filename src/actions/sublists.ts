"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { randomUUID } from "crypto";

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export async function createSublist(data: {
  name: string;
  sourcePlaylistId: number;
  xtreamUsername?: string;
  xtreamPassword?: string;
  categoryIds: number[];
}) {
  if (!data.name?.trim()) {
    throw new Error("Sublist name is required");
  }
  if (!data.sourcePlaylistId) {
    throw new Error("Source playlist is required");
  }

  // Generate credentials if not provided
  const xtreamUsername =
    data.xtreamUsername?.trim() || `user_${randomUUID().slice(0, 8)}`;
  const xtreamPassword =
    data.xtreamPassword?.trim() || randomUUID().slice(0, 12);

  const sublist = await db.sublist.create({
    data: {
      name: data.name,
      sourcePlaylistId: data.sourcePlaylistId,
      xtreamUsername,
      xtreamPassword,
      categories: {
        create: data.categoryIds.map((categoryId) => ({
          categoryId,
        })),
      },
    },
  });

  revalidatePath("/sublists");
  return { success: true, id: sublist.id };
}

export async function updateSublist(
  id: number,
  data: {
    name: string;
    xtreamUsername?: string;
    xtreamPassword?: string;
    isEnabled?: boolean;
    categoryIds: number[];
  }
) {
  if (!data.name?.trim()) {
    throw new Error("Sublist name is required");
  }

  // Update sublist and replace categories in a transaction
  await db.$transaction(async (tx) => {
    await tx.sublist.update({
      where: { id },
      data: {
        name: data.name,
        xtreamUsername: data.xtreamUsername,
        xtreamPassword: data.xtreamPassword,
        isEnabled: data.isEnabled,
      },
    });

    // Replace all category associations
    await tx.sublistCategory.deleteMany({ where: { sublistId: id } });
    if (data.categoryIds.length > 0) {
      await tx.sublistCategory.createMany({
        data: data.categoryIds.map((categoryId) => ({
          sublistId: id,
          categoryId,
        })),
      });
    }
  });

  revalidatePath("/sublists");
  revalidatePath(`/sublists/${id}`);
  return { success: true };
}

export async function deleteSublist(id: number) {
  await db.sublist.delete({ where: { id } });
  revalidatePath("/sublists");
  return { success: true };
}

export async function toggleSublist(id: number, isEnabled: boolean) {
  await db.sublist.update({
    where: { id },
    data: { isEnabled },
  });
  revalidatePath("/sublists");
  return { success: true };
}

export async function getSublist(id: number) {
  return db.sublist.findUnique({
    where: { id },
    include: {
      sourcePlaylist: { select: { id: true, name: true } },
      categories: {
        include: {
          category: {
            include: { sourcePlaylist: { select: { name: true } } },
          },
        },
      },
    },
  });
}

export async function getSublists() {
  return db.sublist.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      sourcePlaylist: { select: { id: true, name: true } },
      _count: { select: { categories: true } },
    },
  });
}

export async function regenerateApiKey(id: number) {
  const newKey = randomUUID();
  await db.sublist.update({
    where: { id },
    data: { apiKey: newKey },
  });
  revalidatePath(`/sublists/${id}`);
  return { success: true, apiKey: newKey };
}

// ---------------------------------------------------------------------------
// Category picker data
// ---------------------------------------------------------------------------

export async function getSources() {
  return db.sourcePlaylist.findMany({
    where: { isEnabled: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
}

export async function getCategoriesForSource(sourcePlaylistId: number) {
  const categories = await db.category.findMany({
    where: { sourcePlaylistId, isEnabled: true },
    orderBy: [{ categoryType: "asc" }, { categoryName: "asc" }],
    include: {
      _count: { select: { channels: true } },
    },
  });

  return categories;
}
