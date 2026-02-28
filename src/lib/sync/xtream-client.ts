import type {
  XtreamAuthResponse,
  XtreamCategory,
  XtreamLiveStream,
  XtreamVodStream,
  XtreamSeriesStream,
  XtreamSeriesInfo,
} from "@/types/xtream";

export class XtreamClient {
  private baseUrl: string;
  private username: string;
  private password: string;

  constructor(host: string, username: string, password: string) {
    // Normalize host URL - remove trailing slash
    this.baseUrl = host.replace(/\/+$/, "");
    this.username = username;
    this.password = password;
  }

  private buildUrl(path: string, params?: Record<string, string>): string {
    const url = new URL(path, this.baseUrl);
    url.searchParams.set("username", this.username);
    url.searchParams.set("password", this.password);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
      }
    }
    return url.toString();
  }

  private async fetchJson<T>(url: string): Promise<T> {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(30000), // 30 second timeout
    });

    if (!response.ok) {
      throw new Error(
        `Xtream API error: ${response.status} ${response.statusText}`
      );
    }

    return response.json() as Promise<T>;
  }

  /** Authenticate and get server + user info */
  async authenticate(): Promise<XtreamAuthResponse> {
    const url = this.buildUrl("/player_api.php");
    return this.fetchJson<XtreamAuthResponse>(url);
  }

  /** Get live TV categories */
  async getLiveCategories(): Promise<XtreamCategory[]> {
    const url = this.buildUrl("/player_api.php", {
      action: "get_live_categories",
    });
    return this.fetchJson<XtreamCategory[]>(url);
  }

  /** Get VOD categories */
  async getVodCategories(): Promise<XtreamCategory[]> {
    const url = this.buildUrl("/player_api.php", {
      action: "get_vod_categories",
    });
    return this.fetchJson<XtreamCategory[]>(url);
  }

  /** Get series categories */
  async getSeriesCategories(): Promise<XtreamCategory[]> {
    const url = this.buildUrl("/player_api.php", {
      action: "get_series_categories",
    });
    return this.fetchJson<XtreamCategory[]>(url);
  }

  /** Get live streams, optionally filtered by category */
  async getLiveStreams(categoryId?: string): Promise<XtreamLiveStream[]> {
    const params: Record<string, string> = {
      action: "get_live_streams",
    };
    if (categoryId) params.category_id = categoryId;
    const url = this.buildUrl("/player_api.php", params);
    return this.fetchJson<XtreamLiveStream[]>(url);
  }

  /** Get VOD streams, optionally filtered by category */
  async getVodStreams(categoryId?: string): Promise<XtreamVodStream[]> {
    const params: Record<string, string> = {
      action: "get_vod_streams",
    };
    if (categoryId) params.category_id = categoryId;
    const url = this.buildUrl("/player_api.php", params);
    return this.fetchJson<XtreamVodStream[]>(url);
  }

  /** Get series, optionally filtered by category */
  async getSeries(categoryId?: string): Promise<XtreamSeriesStream[]> {
    const params: Record<string, string> = {
      action: "get_series",
    };
    if (categoryId) params.category_id = categoryId;
    const url = this.buildUrl("/player_api.php", params);
    return this.fetchJson<XtreamSeriesStream[]>(url);
  }

  /** Get series info with seasons and episodes */
  async getSeriesInfo(seriesId: number): Promise<XtreamSeriesInfo> {
    const url = this.buildUrl("/player_api.php", {
      action: "get_series_info",
      series_id: String(seriesId),
    });
    return this.fetchJson<XtreamSeriesInfo>(url);
  }

  /** Build a stream URL for live content */
  buildLiveStreamUrl(streamId: number, extension: string = "ts"): string {
    return `${this.baseUrl}/live/${this.username}/${this.password}/${streamId}.${extension}`;
  }

  /** Build a stream URL for VOD content */
  buildVodStreamUrl(
    streamId: number,
    extension: string = "mp4"
  ): string {
    return `${this.baseUrl}/movie/${this.username}/${this.password}/${streamId}.${extension}`;
  }

  /** Build a stream URL for series content */
  buildSeriesStreamUrl(
    streamId: number,
    extension: string = "mp4"
  ): string {
    return `${this.baseUrl}/series/${this.username}/${this.password}/${streamId}.${extension}`;
  }
}
