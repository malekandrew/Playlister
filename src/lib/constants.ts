// App-wide constants

export const SYNC_LOCK_KEY = "sync:lock";
export const SYNC_LOCK_TTL = 90; // 90 seconds – slightly above Vercel's 60s maxDuration

export const SYNC_PROGRESS_KEY = "sync:progress";
export const SYNC_PROGRESS_TTL = 3600; // 1 hour

export const PLAYLIST_CACHE_PREFIX = "playlist:cache:";
export const PLAYLIST_CACHE_TTL = 300; // 5 minutes

export const DEFAULT_REFRESH_INTERVAL_MIN = 360; // 6 hours

export const CHANNEL_BATCH_SIZE = 5; // categories per batch during sync
export const DB_INSERT_BATCH_SIZE = 10000; // channels per batch insert
