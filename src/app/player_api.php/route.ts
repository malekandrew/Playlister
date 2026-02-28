import { NextRequest, NextResponse } from "next/server";
import { authenticateXtream } from "@/lib/xtream/auth";
import { db } from "@/lib/db";

/**
 * GET /player_api.php?username=<user>&password=<pass>&action=<action>
 * Xtream Codes API emulation.
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const username = searchParams.get("username");
  const password = searchParams.get("password");

  if (!username || !password) {
    return NextResponse.json({ error: "Missing credentials" }, { status: 401 });
  }

  const sublist = await authenticateXtream(username, password);
  if (!sublist) {
    return NextResponse.json(
      { user_info: { auth: 0, message: "Invalid credentials" } },
      { status: 403 }
    );
  }

  const action = searchParams.get("action") || "";
  const protocol = request.headers.get("x-forwarded-proto") || "http";
  const host = request.headers.get("host") || "localhost:3000";
  const baseUrl = `${protocol}://${host}`;

  // Get sublist's category IDs
  const sublistCategories = await db.sublistCategory.findMany({
    where: { sublistId: sublist.id },
    select: { categoryId: true },
  });
  const categoryIds = sublistCategories.map((sc) => sc.categoryId);

  switch (action) {
    case "get_live_categories":
      return handleGetCategories(categoryIds, "live");

    case "get_vod_categories":
      return handleGetCategories(categoryIds, "movie");

    case "get_series_categories":
      return handleGetCategories(categoryIds, "series");

    case "get_live_streams": {
      const catId = searchParams.get("category_id");
      return handleGetStreams(categoryIds, "live", catId, baseUrl, username, password);
    }

    case "get_vod_streams": {
      const catId = searchParams.get("category_id");
      return handleGetStreams(categoryIds, "movie", catId, baseUrl, username, password);
    }

    case "get_series": {
      const catId = searchParams.get("category_id");
      return handleGetSeries(categoryIds, catId);
    }

    case "get_series_info": {
      const seriesId = searchParams.get("series_id");
      return handleGetSeriesInfo(seriesId, categoryIds, baseUrl, username, password);
    }

    case "get_short_epg":
    case "get_simple_data_table":
      return NextResponse.json({ epg_listings: [] });

    default:
      // Default action: return server info + user info
      return handleServerInfo(sublist, baseUrl);
  }
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

async function handleServerInfo(
  sublist: { id: number; xtreamUsername: string },
  baseUrl: string
) {
  return NextResponse.json({
    user_info: {
      username: sublist.xtreamUsername,
      password: "***",
      message: "Playlister",
      auth: 1,
      status: "Active",
      exp_date: Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60, // 1 year from now
      is_trial: "0",
      active_cons: "0",
      created_at: Math.floor(Date.now() / 1000),
      max_connections: "1",
      allowed_output_formats: ["m3u8", "ts", "rtmp"],
    },
    server_info: {
      url: baseUrl,
      port: "80",
      https_port: "443",
      server_protocol: "http",
      rtmp_port: "8880",
      timezone: "UTC",
      timestamp_now: Math.floor(Date.now() / 1000),
      time_now: new Date().toISOString(),
    },
  });
}

async function handleGetCategories(
  categoryIds: number[],
  categoryType: string
) {
  const categories = await db.category.findMany({
    where: {
      id: { in: categoryIds },
      categoryType,
    },
    orderBy: { categoryName: "asc" },
  });

  return NextResponse.json(
    categories.map((cat) => ({
      category_id: String(cat.id),
      category_name: cat.categoryName,
      parent_id: 0,
    }))
  );
}

async function handleGetStreams(
  categoryIds: number[],
  categoryType: string,
  filterCategoryId: string | null,
  baseUrl: string,
  username: string,
  password: string
) {
  const where: Record<string, unknown> = {
    categoryId: { in: categoryIds },
    category: { categoryType },
  };

  if (filterCategoryId) {
    // Filter by the specific internal category ID
    where.categoryId = parseInt(filterCategoryId);
  }

  const channels = await db.channel.findMany({
    where,
    include: { category: true },
    orderBy: { name: "asc" },
  });

  const streamType =
    categoryType === "live"
      ? "live"
      : categoryType === "movie"
        ? "movie"
        : "series";
  const ext = categoryType === "live" ? "ts" : "mp4";

  return NextResponse.json(
    channels.map((ch) => ({
      num: ch.id,
      name: ch.name,
      stream_type: streamType,
      stream_id: ch.id,
      stream_icon: ch.tvgLogo || "",
      epg_channel_id: ch.tvgId || "",
      added: Math.floor(ch.createdAt.getTime() / 1000),
      category_id: String(ch.categoryId || ""),
      category_name: ch.category?.categoryName || ch.groupTitle || "",
      container_extension: ext,
      custom_sid: "",
      tv_archive: 0,
      direct_source: "",
      tv_archive_duration: 0,
    }))
  );
}

async function handleGetSeries(
  categoryIds: number[],
  filterCategoryId: string | null
) {
  // Group channels by seriesName for series-type categories
  const where: Record<string, unknown> = {
    categoryId: { in: categoryIds },
    category: { categoryType: "series" },
    seriesName: { not: null },
  };

  if (filterCategoryId) {
    where.categoryId = parseInt(filterCategoryId);
  }

  const channels = await db.channel.findMany({
    where,
    include: { category: true },
    orderBy: { name: "asc" },
  });

  // Group by seriesName
  const seriesMap = new Map<
    string,
    { name: string; cover: string; categoryId: string; channels: typeof channels }
  >();

  for (const ch of channels) {
    const seriesKey = ch.seriesName || ch.name;
    if (!seriesMap.has(seriesKey)) {
      seriesMap.set(seriesKey, {
        name: seriesKey,
        cover: ch.tvgLogo || "",
        categoryId: String(ch.categoryId || ""),
        channels: [],
      });
    }
    seriesMap.get(seriesKey)!.channels.push(ch);
  }

  let seriesId = 1;
  return NextResponse.json(
    Array.from(seriesMap.values()).map((s) => ({
      num: seriesId,
      name: s.name,
      series_id: seriesId++,
      cover: s.cover,
      plot: "",
      cast: "",
      director: "",
      genre: "",
      releaseDate: "",
      last_modified: Math.floor(Date.now() / 1000),
      rating: "",
      rating_5based: 0,
      backdrop_path: [],
      youtube_trailer: "",
      episode_run_time: "",
      category_id: s.categoryId,
    }))
  );
}

async function handleGetSeriesInfo(
  seriesId: string | null,
  categoryIds: number[],
  baseUrl: string,
  username: string,
  password: string
) {
  if (!seriesId) {
    return NextResponse.json({ episodes: {} });
  }

  // We use seriesName as the series identifier
  // For simplicity, get channels that match series categories
  const channels = await db.channel.findMany({
    where: {
      categoryId: { in: categoryIds },
      category: { categoryType: "series" },
    },
    include: { category: true },
    orderBy: { name: "asc" },
  });

  // Build episodes grouped by season
  const episodes: Record<string, Array<Record<string, unknown>>> = {};
  let epNum = 1;

  for (const ch of channels) {
    const season = "1"; // Default season
    if (!episodes[season]) {
      episodes[season] = [];
    }

    episodes[season].push({
      id: String(ch.id),
      episode_num: epNum++,
      title: ch.name,
      container_extension: "mp4",
      info: { name: ch.name, duration_secs: ch.duration || 0 },
      custom_sid: "",
      added: Math.floor(ch.createdAt.getTime() / 1000),
      season: parseInt(season),
      direct_source: `${baseUrl}/series/${username}/${password}/${ch.id}.mp4`,
    });
  }

  return NextResponse.json({
    seasons: [],
    info: { name: "Series" },
    episodes,
  });
}
