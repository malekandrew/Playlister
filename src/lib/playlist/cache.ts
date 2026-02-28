import { redis } from "@/lib/redis";
import { PLAYLIST_CACHE_PREFIX, PLAYLIST_CACHE_TTL } from "@/lib/constants";

/**
 * Get a cached playlist, or null if not cached.
 */
export async function getCachedPlaylist(
  sublistId: number
): Promise<string | null> {
  const key = `${PLAYLIST_CACHE_PREFIX}${sublistId}`;
  return redis.get<string>(key);
}

/**
 * Cache a generated playlist.
 */
export async function cachePlaylist(
  sublistId: number,
  content: string
): Promise<void> {
  const key = `${PLAYLIST_CACHE_PREFIX}${sublistId}`;
  await redis.set(key, content, { ex: PLAYLIST_CACHE_TTL });
}

/**
 * Invalidate a cached playlist.
 */
export async function invalidatePlaylistCache(
  sublistId: number
): Promise<void> {
  const key = `${PLAYLIST_CACHE_PREFIX}${sublistId}`;
  await redis.del(key);
}

/**
 * Invalidate all cached playlists.
 */
export async function invalidateAllPlaylistCaches(): Promise<void> {
  // Scan for all playlist cache keys and delete them
  let cursor = 0;
  do {
    const result = await redis.scan(cursor, {
      match: `${PLAYLIST_CACHE_PREFIX}*`,
      count: 100,
    });
    const nextCursor = Number(result[0]);
    const keys: string[] = result[1] as string[];
    cursor = nextCursor;
    if (keys.length > 0) {
      await Promise.all(keys.map((key) => redis.del(key)));
    }
  } while (cursor !== 0);
}
