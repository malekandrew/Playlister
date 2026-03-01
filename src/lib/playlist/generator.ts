import { db } from "@/lib/db";

/**
 * Generate an M3U8 playlist string for a sublist.
 */
export async function generatePlaylist(
  sublistId: number,
  options?: {
    /** Use local proxy URLs instead of upstream URLs */
    useProxyUrls?: boolean;
    baseUrl?: string;
    username?: string;
    password?: string;
  }
): Promise<string> {
  // Get all channels that belong to the sublist's selected categories
  const sublist = await db.sublist.findUnique({
    where: { id: sublistId },
    include: {
      categories: {
        include: {
          category: true,
        },
      },
    },
  });

  if (!sublist) {
    throw new Error("Sublist not found");
  }

  const categoryIds = sublist.categories.map((sc) => sc.categoryId);

  if (categoryIds.length === 0) {
    return "#EXTM3U\n";
  }

  const channels = await db.channel.findMany({
    where: {
      categoryId: { in: categoryIds },
    },
    include: {
      category: true,
    },
    orderBy: [{ groupTitle: "asc" }, { name: "asc" }],
  });

  // Build M3U content
  let m3u = "#EXTM3U\n";

  for (const ch of channels) {
    // Build EXTINF line
    const attrs: string[] = [];

    if (ch.tvgId) attrs.push(`tvg-id="${ch.tvgId}"`);
    if (ch.tvgName) attrs.push(`tvg-name="${ch.tvgName}"`);
    if (ch.tvgLogo) attrs.push(`tvg-logo="${ch.tvgLogo}"`);
    const group = ch.groupTitle || ch.category?.categoryName || "";
    if (group) attrs.push(`group-title="${group}"`);

    const attrStr = attrs.length > 0 ? " " + attrs.join(" ") : "";
    const duration = ch.duration ?? -1;

    m3u += `#EXTINF:${duration}${attrStr},${ch.name}\n`;

    // URL — either use proxy URL or direct upstream
    if (options?.useProxyUrls && options.baseUrl) {
      const streamType = ch.category?.categoryType || "live";
      const streamPath =
        streamType === "live"
          ? "live"
          : streamType === "movie"
            ? "movie"
            : "series";
      const ext = streamType === "live" ? "ts" : "mp4";
      m3u += `${options.baseUrl}/${streamPath}/${options.username}/${options.password}/${ch.id}.${ext}\n`;
    } else {
      m3u += `${ch.url}\n`;
    }
  }

  // Update lastUsedAt
  await db.sublist.update({
    where: { id: sublistId },
    data: { lastUsedAt: new Date() },
  });

  return m3u;
}
