// Shared app types

export type SourceType = "xtream" | "m3u";
export type CategoryType = "live" | "movie" | "series";

export interface SourceSyncStatus {
  sourceId: number;
  sourceName: string;
  status: "pending" | "syncing" | "completed" | "error";
  categoriesTotal: number;
  categoriesProcessed: number;
  channelsFetched: number;
  error?: string;
  startedAt?: string;
  completedAt?: string;
}

export interface SyncProgress {
  isRunning: boolean;
  status: string;
  currentStep?: string;
  totalSources?: number;
  processedSources?: number;
  totalCategories?: number;
  processedCategories?: number;
  totalChannels?: number;
  processedChannels?: number;
  sources: SourceSyncStatus[];
  errors: string[];
  startedAt?: string;
  completedAt?: string;
}

export interface SourceFormData {
  name: string;
  type: SourceType;
  xtreamHost?: string;
  xtreamUsername?: string;
  xtreamPassword?: string;
  m3uUrl?: string;
  isEnabled: boolean;
  refreshIntervalMin: number;
}
