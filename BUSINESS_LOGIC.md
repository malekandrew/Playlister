# Malek's IPTV Manager — Business Logic Documentation

> **Purpose**: This document describes the complete business logic of the IPTV Manager application, independent of any technology stack. It is intended to serve as a specification for reimplementing the application in any language or framework.
>
> **Note**: This document also includes the **new multi-source / multi-sublist architecture** that replaces the current single-source model. Sections describing the current behavior are marked **(CURRENT)**, and the new target design is marked **(NEW)**.

---

## Table of Contents

1. [Application Overview](#1-application-overview)
2. [User Roles & Authentication](#2-user-roles--authentication)
3. [Data Model](#3-data-model)
4. [Source Playlists (Providers)](#4-source-playlists-providers)
5. [Categories](#5-categories)
6. [Sublists (Output Playlists)](#6-sublists-output-playlists)
7. [Sync Engine](#7-sync-engine)
8. [Playlist Output / Serving](#8-playlist-output--serving)
9. [Xtream Codes API Emulation](#9-xtream-codes-api-emulation)
10. [Stream Proxying / Redirection](#10-stream-proxying--redirection)
11. [API Key Management](#11-api-key-management)
12. [Admin Dashboard](#12-admin-dashboard)
13. [Background Services](#13-background-services)
14. [Configuration](#14-configuration)
15. [Resilience & Error Handling](#15-resilience--error-handling)
16. [Migration Guide: Current → New Architecture](#16-migration-guide-current--new-architecture)

---

## 1. Application Overview

The IPTV Manager is a self-hosted web application that acts as an **IPTV playlist middleware**. It sits between one or more upstream IPTV providers and downstream IPTV player apps (TiviMate, IPTV Smarters, VLC, etc.).

### Core Value Proposition

1. **Aggregate** — Pull channels from multiple upstream IPTV providers (Xtream Codes API or M3U/M3U8 playlists).
2. **Filter** — Let the admin select which categories (Live TV, Movies, TV Shows) to keep.
3. **Redistribute** — Serve curated, filtered playlists to end users via standard M3U8 endpoints or a fully emulated Xtream Codes API.
4. **Control Access** — Each consumer gets their own API key; the admin can enable/disable access at any time.

### High-Level Flow

```
┌──────────────┐       Sync        ┌─────────────────┐     Serve     ┌──────────────┐
│   Upstream    │ ───────────────►  │   IPTV Manager  │ ────────────► │  IPTV Player  │
│   Provider    │  (Xtream API /   │   (this app)    │  (M3U8 /     │  (TiviMate,   │
│              │   M3U download)  │                 │   Xtream)    │   Smarters…)  │
└──────────────┘                   └─────────────────┘              └──────────────┘
```

---

## 2. User Roles & Authentication

### 2.1 Admin User

- There is exactly one (or more) admin user(s) stored in the database.
- Admins manage all configuration: providers, categories, sublists, API keys, and trigger syncs.
- **Authentication method**: Username + password, validated against a salted hash stored in the database.
- **Session**: Cookie-based with 24-hour sliding expiration. Cookies are HTTP-only.
- **Seeding**: On first startup, if no admin user exists, one is created from configuration (`AdminCredentials:Username` / `AdminCredentials:Password`).

### 2.2 Password Management

- Passwords are hashed using PBKDF2 with SHA-256, 10,000 iterations, a 16-byte random salt, producing a 32-byte hash.
- The salt and hash are concatenated and stored as a base64 string.
- The admin can change their password through the UI (requires current password + new password + confirmation; minimum 6 characters).
- Comparison uses constant-time equality to prevent timing attacks.

### 2.3 Consumer (Playlist User)

- Consumers do not have login credentials for the admin panel.
- **(CURRENT)**: Consumers authenticate via a shared API key — either as a query parameter (`?key=<apikey>`) for M3U endpoints, or as the `password` field in Xtream API requests.
- **(NEW)**: Each **sublist** has its own dedicated API key (or Xtream credentials). A consumer is given the credentials for the specific sublist they're authorized to access. See [Section 6](#6-sublists-output-playlists).

---

## 3. Data Model

### 3.1 Current Data Model

| Entity | Description |
|---|---|
| **AdminUser** | Admin login credentials (username, password hash, timestamps) |
| **AppSettings** | Single row storing Xtream provider credentials, refresh interval, last sync stats |
| **Category** | A content category from the upstream provider (e.g., "Sports", "News"). Has a type (`live`, `movie`, `series`) and an `IsEnabled` toggle |
| **CategoryPreset** | A saved snapshot of which categories are enabled. Stored as a JSON array of `{CategoryId, CategoryType}` pairs |
| **Channel** | An individual stream/content item. Belongs to a category group. For series, has a `SeriesName` field |
| **ApiKey** | An access token (GUID) with a human-readable name and enable/disable toggle |

### 3.2 New Data Model (Multi-Source / Multi-Sublist)

The new architecture introduces two major concepts: **Source Playlists** (multiple upstream providers) and **Sublists** (multiple independent output playlists, each with its own credentials and category selection).

| Entity | Description |
|---|---|
| **AdminUser** | *(unchanged)* |
| **SourcePlaylist** | An upstream IPTV provider. Replaces the single `AppSettings` credentials. Each source has its own Xtream credentials (or M3U URL), sync status, and fetched categories/channels |
| **Category** | *(mostly unchanged)* Now has a `SourcePlaylistId` foreign key linking it to its originating source |
| **Channel** | *(mostly unchanged)* Now has a `SourcePlaylistId` foreign key linking it to its originating source |
| **Sublist** | A curated output playlist. Has its own name, API key (for M3U) or Xtream credentials (username/password), and a selection of categories from one or more sources |
| **SublistCategory** | Junction table linking a Sublist to its selected Categories (many-to-many) |
| **AdminUser** | *(unchanged)* |

> **CategoryPreset is removed** in the new model — its role is fully replaced by Sublists.
> **AppSettings** no longer stores provider credentials — only app-level config (e.g., refresh interval).
> **ApiKey** as a standalone table is removed — each Sublist has its own embedded API key and Xtream credentials.

#### Entity Details

##### SourcePlaylist
| Field | Type | Description |
|---|---|---|
| Id | int (PK) | Auto-increment ID |
| Name | string | Human-readable name (e.g., "Provider A", "My IPTV") |
| Type | string | `"xtream"` or `"m3u"` |
| XtreamHost | string? | Base URL for Xtream API (e.g., `http://provider.com:8080`) |
| XtreamUsername | string? | Xtream login username |
| XtreamPassword | string? | Xtream login password |
| M3uUrl | string? | Direct M3U/M3U8 playlist URL (used when Type = "m3u") |
| IsEnabled | bool | Whether this source is active and should be synced |
| LastSyncedAt | datetime? | Timestamp of last successful sync |
| LastSyncChannelCount | int? | Number of channels fetched in last sync |
| LastSyncError | string? | Error message from last sync attempt (null = success) |
| CreatedAt | datetime | |
| UpdatedAt | datetime | |

##### Category (Updated)
| Field | Type | Description |
|---|---|---|
| Id | int (PK) | |
| SourcePlaylistId | int (FK) | References SourcePlaylist.Id |
| CategoryId | string | The provider's category ID |
| CategoryName | string | Display name |
| CategoryType | string | `"live"`, `"movie"`, or `"series"` |
| IsEnabled | bool | Whether this category is visible/available for sublist selection |
| CreatedAt | datetime | |
| UpdatedAt | datetime | |

> **Note**: `IsEnabled` on a Category controls whether it appears as an option when configuring sublists. Actual inclusion in a sublist is determined by the SublistCategory junction table.

##### Channel (Updated)
| Field | Type | Description |
|---|---|---|
| Id | int (PK) | |
| SourcePlaylistId | int (FK) | References SourcePlaylist.Id |
| Name | string | Channel/stream name |
| Url | string | Direct stream URL from the upstream provider |
| Group | string? | Category name this channel belongs to |
| TvgId | string? | EPG channel ID / stream ID |
| TvgName | string? | Display name for EPG matching |
| TvgLogo | string? | Logo/icon URL |
| Language | string? | Language tag |
| Duration | int | Duration metadata (-1 = live/unknown) |
| SeriesName | string? | For TV series episodes, the parent series name |
| CreatedAt | datetime | |
| UpdatedAt | datetime | |

##### Sublist
| Field | Type | Description |
|---|---|---|
| Id | int (PK) | |
| Name | string | Human-readable name (e.g., "Family TV", "John's Playlist") |
| ApiKey | string | Unique GUID for M3U endpoint access (`?key=<apikey>`) |
| XtreamUsername | string | Username for Xtream API access (e.g., "john") |
| XtreamPassword | string | Password for Xtream API access (equals ApiKey by default, or a custom value) |
| IsEnabled | bool | Enable/disable this entire sublist |
| CreatedAt | datetime | |
| UpdatedAt | datetime | |

##### SublistCategory (Junction Table)
| Field | Type | Description |
|---|---|---|
| SublistId | int (FK) | References Sublist.Id |
| CategoryId | int (FK) | References Category.Id |

> Composite primary key on (SublistId, CategoryId).

---

## 4. Source Playlists (Providers)

### 4.1 Current Behavior

- The app supports exactly **one** upstream provider, configured in the `AppSettings` table.
- The provider is always an **Xtream Codes API** server (host + username + password).
- There is also legacy M3U URL support (`SourceUrl` field) but the sync engine primarily uses the Xtream API.

### 4.2 New Behavior (Multi-Source)

- The app supports **multiple** upstream providers, each stored as a `SourcePlaylist` record.
- Each source can be either:
  - **Xtream Codes API**: Requires host, username, password. The app calls the provider's `player_api.php` to fetch categories and streams.
  - **M3U/M3U8**: Requires a URL pointing to a standard M3U file. The app downloads and parses it.
- Each source can be independently enabled/disabled.
- Each source has its own sync status (last synced, channel count, errors).
- Categories and channels from each source are tagged with their `SourcePlaylistId` to maintain provenance.

### 4.3 Admin Workflows for Sources

1. **Add Source**: Admin provides a name, selects type (Xtream or M3U), enters credentials/URL, and saves.
2. **Edit Source**: Admin can update credentials or the M3U URL.
3. **Fetch Categories**: For Xtream sources, the app calls the provider to retrieve available categories (live, movie, series). For M3U sources, categories are extracted from `group-title` attributes during parsing.
4. **Delete Source**: Removes the source and all associated categories and channels. Any sublists referencing those categories should have their links removed (but the sublist itself persists).
5. **Enable/Disable Source**: A disabled source is skipped during sync.

---

## 5. Categories

### 5.1 Category Types

Categories are classified into three types:
- **`live`** — Live TV channels (continuous streams)
- **`movie`** — Video-on-demand (VOD) movies (single-file streams)
- **`series`** — TV series (hierarchical: series → seasons → episodes)

### 5.2 Category Lifecycle

1. **Fetching**: When the admin clicks "Fetch Categories" for a source:
   - For Xtream sources: The app calls `get_live_categories`, `get_vod_categories`, and `get_series_categories` API endpoints.
   - For M3U sources: Categories are derived from parsing `group-title` attributes in `#EXTINF` lines.
2. **Storage**: Each category is stored with its provider-assigned ID, name, type, and a link to its source.
3. **Idempotent Fetch**: If a category already exists (matched by `CategoryId` + `CategoryType` + `SourcePlaylistId`), it is not duplicated. Only new categories are added.
4. **Default State**: Newly fetched categories default to `IsEnabled = true` (available for sublist selection).

### 5.3 Category Selection (in Sublists)

- **(CURRENT)**: Categories have a global `IsEnabled` toggle. Only enabled categories are included in the sync and the output playlist. Category "presets" let admins save/load different enable/disable configurations, but only one configuration is active at a time.
- **(NEW)**: The global `IsEnabled` flag controls whether a category appears as available in the sublist configuration UI. The actual per-sublist selection is stored in the `SublistCategory` junction table. This means different sublists can include different categories from different sources simultaneously.

---

## 6. Sublists (Output Playlists)

> This is entirely **NEW** functionality replacing the current single-output model.

### 6.1 Concept

A **Sublist** is an independent output playlist that:
- Has its own unique **API key** for M3U access
- Has its own **Xtream credentials** (username + password) for Xtream API access
- Contains a curated selection of categories from any combination of sources
- Can be independently enabled/disabled

### 6.2 Sublist Workflows

1. **Create Sublist**: Admin provides a name. The system auto-generates:
   - An API key (GUID)
   - A default Xtream username (e.g., the sublist name, slugified)
   - A default Xtream password (same as the API key, or custom)
2. **Configure Categories**: Admin selects which categories to include, picking from all available categories across all sources. The UI should allow:
   - Filtering by source
   - Filtering by type (live/movie/series)
   - Select all / deselect all per source or type
   - Search by category name
3. **Edit Sublist**: Admin can rename, change credentials, or modify the category selection.
4. **Delete Sublist**: Removes the sublist and its category associations. Does not affect the underlying channels or categories.
5. **Enable/Disable Sublist**: A disabled sublist returns HTTP 401 for any access attempt.

### 6.3 Access Patterns per Sublist

Each sublist is independently accessible via:

| Access Method | URL Pattern | Auth |
|---|---|---|
| **M3U Playlist** | `GET /playlist.m3u8?key=<sublist_apikey>` | API key in query param |
| **Xtream M3U** | `GET /get.php?username=<xtream_user>&password=<xtream_pass>&type=m3u_plus` | Xtream credentials |
| **Xtream API** | `GET /player_api.php?username=<xtream_user>&password=<xtream_pass>&action=...` | Xtream credentials |
| **Stream Proxy** | `GET /live/<user>/<pass>/<streamId>.ts` | Xtream credentials in URL path |

### 6.4 Sublist Resolution

When a request arrives:
1. Extract the API key (from `?key=` param) or Xtream credentials (from `username`/`password` params or URL path).
2. Look up the matching **Sublist** in the database.
3. If no match or the sublist is disabled → return 401 Unauthorized.
4. Load only the categories and channels that belong to this sublist (via `SublistCategory` join).
5. Serve the filtered content.

---

## 7. Sync Engine

The sync engine fetches content from upstream providers and stores it locally.

### 7.1 Sync Trigger

- **(CURRENT)**: Manual only — admin clicks "Sync Now" on the dashboard. There is a disabled background service that could auto-sync on a configurable interval.
- **(NEW)**: Same manual trigger, but sync runs for **all enabled sources** (or the admin can trigger sync for a specific source). Auto-sync can be enabled per-source with a configurable interval.

### 7.2 Concurrency Control

- Only **one sync** can run at a time (enforced by a semaphore/lock).
- If a sync is already running and another is requested, the request is silently ignored.
- The sync runs asynchronously in the background (non-blocking for the admin UI).

### 7.3 Sync Process (Per Source)

The sync follows a phased approach:

#### Phase 1: Fetch Data

For each source, gather channels from all enabled categories:

**Xtream Sources:**
1. Load enabled categories from the database, grouped by type (live, movie, series).
2. For **live** and **movie** categories:
   - For each category, call `get_live_streams` or `get_vod_streams` with the `category_id` parameter.
   - Process categories in parallel with controlled concurrency (configurable, default: 5 simultaneous).
   - Parse the JSON response and map each stream to a Channel object.
   - Stream URLs are constructed: `{host}/live/{username}/{password}/{streamId}.{extension}` (for live), similar for movie.
3. For **series** categories:
   - **Step A**: Fetch the series list for each category (`get_series` with `category_id`), running up to 50 categories in parallel.
   - **Step B**: For each series found, fetch detailed episode info (`get_series_info` with `series_id`), running with controlled concurrency (configurable, default: 10 simultaneous).
   - Episodes are parsed from the `episodes` object, grouped by season. Each episode becomes a Channel with:
     - `Name` = "{SeriesName} - S{SeasonNum}E{EpisodeTitle}"
     - `SeriesName` = the parent series name
     - URL = `{host}/series/{username}/{password}/{episodeId}.{containerExtension}`

**M3U Sources:**
1. Download the M3U/M3U8 file via HTTP.
2. Parse line by line:
   - Validate the `#EXTM3U` header.
   - For each `#EXTINF:` line, extract metadata using these attributes:
     - `tvg-id`, `tvg-name`, `tvg-logo`, `group-title`, `tvg-language`
     - Duration (the number after `#EXTINF:`)
     - Channel name (text after the last comma on the `#EXTINF` line)
   - The next non-empty, non-comment line is the stream URL.
3. Auto-derive categories from the unique `group-title` values found.

#### Phase 1.5: Validation

Before writing to the database:
- If **zero** channels were fetched despite having enabled categories → **abort** sync entirely (prevents accidental data wipe).
- Check which enabled categories returned no channels — log warnings.
- Track any category types that failed entirely (e.g., all live categories failed).

#### Phase 2: Atomic Database Swap

This is the critical phase where old data is replaced with new data:

1. Begin a database transaction.
2. Delete all existing channels **for this source** (`WHERE SourcePlaylistId = ?`).
3. Insert all newly fetched channels in batches (batch size: 10,000).
4. Each batch insert has up to 3 retry attempts with 5-second delays between retries.
5. **Commit or Rollback**:
   - If zero batch failures → commit.
   - If batch failures < 5% of total → commit with warning (partial sync).
   - If batch failures >= 5% → **rollback** (keep old data).
6. Verify the final database count matches expectations.

#### Phase 3: Finalize

- Update last sync timestamp and channel count on the source.
- Record any errors.
- Mark sync progress as complete.

### 7.4 Progress Tracking

The sync engine reports real-time progress via an in-memory singleton:

| Field | Description |
|---|---|
| IsRunning | Whether a sync is currently active |
| Status | Human-readable status text (e.g., "Fetching Live TV: 3/10 categories (450 channels)") |
| LiveTVLoaded | Number of live channels fetched so far |
| MoviesLoaded | Number of movie streams fetched so far |
| TVShowsLoaded | Number of TV show episodes fetched so far |
| TotalLoaded | Sum of the above |
| LiveCategoriesProcessed | Number of live categories completed |
| MovieCategoriesProcessed | Number of movie categories completed |
| SeriesCategoriesProcessed | Number of series categories completed |
| TotalCategories | Total enabled category count |
| TotalSeries | Total number of individual series to process |
| ProcessedSeries | Series processed so far |
| ProgressPercentage | Calculated: `(completedCategories / totalCategories) * 100`, with partial credit for in-progress series |
| StartedAt / CompletedAt | Timestamps |
| Error | Error message if sync failed |
| FailedCategories | List of category names that failed |
| IsPartialSync | True if some data was lost but sync committed anyway |

The admin dashboard polls for this progress data and displays it in real-time.

---

## 8. Playlist Output / Serving

### 8.1 M3U8 Endpoint

**Endpoint**: `GET /playlist.m3u8?key=<apikey>`

Behavior:
1. Validate the API key via middleware.
   - **(CURRENT)**: Check against the `ApiKeys` table.
   - **(NEW)**: Look up the Sublist by API key.
2. If invalid or disabled → return 401.
3. Load channels from the database:
   - **(CURRENT)**: All channels, ordered by group then name.
   - **(NEW)**: Only channels whose categories are selected in the matched sublist.
4. Generate M3U8 content:
   ```
   #EXTM3U
   #EXTINF:-1 tvg-id="123" tvg-name="ESPN" tvg-logo="http://..." group-title="Sports",ESPN
   http://provider.com/live/user/pass/123.ts
   #EXTINF:-1 tvg-id="456" tvg-name="CNN" tvg-logo="http://..." group-title="News",CNN
   http://provider.com/live/user/pass/456.ts
   ```
5. Cache the generated playlist for 5 minutes (per sublist in the new model).
6. Return with content type `application/vnd.apple.mpegurl`.

### 8.2 Xtream-Style M3U Endpoint

**Endpoint**: `GET /get.php?username=<user>&password=<pass>&type=m3u_plus&output=ts`

Behavior:
1. Validate credentials by looking up the Sublist where `XtreamUsername` = username AND `XtreamPassword` = password.
2. Load channels belonging to that sublist's categories.
3. Generate M3U8 content. In this mode, stream URLs point to the **local proxy** instead of directly to the upstream provider:
   ```
   #EXTINF:-1 tvg-id="123" tvg-name="ESPN" group-title="Sports",ESPN
   http://this-server.com/live/user/pass/123.ts
   ```
4. Return as `application/vnd.apple.mpegurl`.

---

## 9. Xtream Codes API Emulation

The app emulates a subset of the Xtream Codes API so that IPTV player apps can connect as if connecting to an Xtream server.

**Base Endpoint**: `GET /player_api.php?username=<user>&password=<pass>&action=<action>`

### 9.1 Authentication

- The `password` parameter is the Sublist's Xtream password (or API key).
- The `username` is the Sublist's Xtream username.
- **(CURRENT)**: `password` is checked against the `ApiKeys` table; `username` is ignored.
- **(NEW)**: Both `username` and `password` are matched to find the specific Sublist.

### 9.2 Server Info (Default Action)

When no action is specified (or action is unknown), return server info:

```json
{
  "user_info": {
    "username": "<username>",
    "password": "<password>",
    "auth": 1,
    "status": "Active",
    "exp_date": "<10 years from now, unix timestamp>",
    "is_trial": "0",
    "active_cons": "0",
    "max_connections": "100",
    "allowed_output_formats": ["m3u8", "ts", "rtmp"]
  },
  "server_info": {
    "url": "<this server hostname>",
    "port": "<http port>",
    "https_port": "<https port>",
    "server_protocol": "http|https",
    "timestamp_now": "<unix timestamp>",
    "time_now": "<datetime string>"
  }
}
```

### 9.3 Supported Actions

| Action | Description | Returns |
|---|---|---|
| `get_live_categories` | List enabled live TV categories **that have at least one channel** | `[{category_id, category_name, parent_id: "0"}, ...]` |
| `get_vod_categories` | List enabled movie categories **that have at least one channel** | Same format |
| `get_series_categories` | List enabled series categories **that have at least one series** | Same format |
| `get_live_streams` | List live channels, optionally filtered by `category_id` | `[{num, name, stream_type: "live", stream_id, stream_icon, epg_channel_id, category_id, direct_source, ...}, ...]` |
| `get_vod_streams` | List movies, optionally filtered by `category_id` | `[{num, name, stream_type: "movie", stream_id, stream_icon, category_id, container_extension: "mp4", direct_source, ...}, ...]` |
| `get_series` | List unique series, optionally filtered by `category_id`. Groups episodes by `SeriesName` | `[{num, name, series_id, cover, category_id, episode_run_time, ...}, ...]` |
| `get_series_info` | Get detailed info for one series (by `series_id`). Returns seasons and episodes | `{seasons: [...], info: {...}, episodes: {"1": [...], "2": [...]}}` |
| `get_short_epg` | EPG data (currently returns empty) | `{epg_listings: []}` |
| `get_simple_data_table` | EPG data (currently returns empty) | `{epg_listings: []}` |

### 9.4 Important API Behaviors

- **Category filtering for sublists (NEW)**: All category and stream queries are scoped to the categories selected in the authenticated sublist.
- **Categories with no content are hidden**: `get_live_categories` only returns categories that have at least one channel in the database.
- **Series grouping**: `get_series` groups all channels with the same `SeriesName` into one series entry. The `series_id` is the database ID of the first episode.
- **Series info**: `get_series_info` finds the series by looking up a channel by database ID, then fetches all channels with the same `SeriesName`. Episodes are grouped into seasons by parsing "S{num}E{num}" from the channel name.
- **Category ID mapping**: The API returns the provider's original `CategoryId` (not the database ID) to maintain compatibility with IPTV apps that cache category IDs.

### 9.5 XMLTV / EPG Endpoint

**Endpoint**: `GET /xmltv.php?username=<user>&password=<pass>`

Currently returns an empty XMLTV document:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE tv SYSTEM "xmltv.dtd">
<tv generator-info-name="Malek's IPTV">
</tv>
```

---

## 10. Stream Proxying / Redirection

When an IPTV player requests a stream through the Xtream-style URL, the app acts as a redirect layer.

### 10.1 Stream URL Patterns

| Type | URL Pattern |
|---|---|
| Live | `GET /live/{username}/{password}/{streamId}.{ext}` |
| Movie | `GET /movie/{username}/{password}/{streamId}.{ext}` |
| Series | `GET /series/{username}/{password}/{streamId}.{ext}` |

### 10.2 Stream Resolution Process

1. Extract the `password` from the URL path.
2. Validate: look up the Sublist by Xtream credentials (or API key in current model).
3. Find the channel in the database:
   - First try `TvgId = streamId`.
   - If not found, try database `Id = streamId` (numeric).
4. If channel found → **HTTP redirect (302)** to the channel's actual upstream URL.
5. If not found → return 404.

> **Note**: The app does NOT proxy the actual video bytes — it simply redirects the player to the upstream provider's direct stream URL. This means the player connects directly to the upstream for the actual video stream.

---

## 11. API Key Management

### 11.1 Current Model

- API keys are stored in a dedicated `ApiKeys` table.
- Each key is a 32-character hex GUID (e.g., `8291c27a98144a99a866b040c05fb6a8`).
- Keys have: Id, Key (unique), Name (human label), IsEnabled, CreatedAt, LastUsedAt.
- The admin can: create, enable, disable, and delete keys.
- All keys access the **same** playlist content.

### 11.2 New Model

- API keys are embedded in the `Sublist` entity (no separate ApiKeys table).
- Each sublist has:
  - `ApiKey`: for M3U endpoint access
  - `XtreamUsername` + `XtreamPassword`: for Xtream API access
- Different sublists serve different content (based on their category selection).
- The admin manages credentials through the sublist management UI.
- `LastUsedAt` tracking can be on the Sublist itself.

---

## 12. Admin Dashboard

### 12.1 Pages

| Page | Purpose |
|---|---|
| **Login** | Username/password authentication form |
| **Dashboard (Index)** | Overview stats, sync status, manual sync trigger |
| **Settings** | **(CURRENT)**: Xtream credentials + category management + presets. **(NEW)**: Source playlist management |
| **Sources** (NEW) | List/add/edit/delete source playlists, fetch categories per source |
| **Sublists** (NEW) | List/add/edit/delete sublists, configure category selection, view access URLs |
| **API Keys** | **(CURRENT)**: Manage shared API keys. **(NEW)**: Merged into Sublists page |
| **Change Password** | Update admin password |
| **Logout** | End session |

### 12.2 Dashboard Stats

The dashboard displays:
- Number of enabled sources (NEW)
- Total channels in database (broken down by type: live, movies, series)
- Number of categories enabled
- Number of sublists (NEW)
- Last sync time and result
- Sync progress (real-time, with progress bar and status text)

### 12.3 Category Management UI

- **(CURRENT)**: Categories are displayed in three tabs (Live TV, Movies, TV Shows). Each category has a toggle switch. There's a preset system to save/load configurations.
- **(NEW)**: Categories are managed within each sublist's configuration page. The UI shows categories grouped by source and type, with checkboxes. Filter/search capabilities help navigate large category lists.

### 12.4 Sync Trigger

- The dashboard has a "Sync Now" button.
- **(CURRENT)**: Triggers a sync for the single provider.
- **(NEW)**: Triggers a sync for all enabled sources (or optionally for a specific source).
- While syncing, a progress panel shows real-time status with counts of loaded items.

---

## 13. Background Services

### 13.1 Playlist Refresh Service

- **Currently disabled** (code exists but is commented out in DI registration).
- When enabled, runs as a periodic background job:
  1. Waits 10 seconds after app start.
  2. Triggers a sync.
  3. Sleeps for the configured interval (from `AppSettings.RefreshIntervalMinutes`, default: 360 minutes = 6 hours).
  4. Repeats.
- **(NEW)**: Each source can have its own refresh interval.

---

## 14. Configuration

### 14.1 App-Level Configuration

| Setting | Default | Description |
|---|---|---|
| `ConnectionStrings:DefaultConnection` | `Data Source=iptv.db` | Database connection string (SQLite) |
| `AdminCredentials:Username` | `admin` | Initial admin username (used only for seeding) |
| `AdminCredentials:Password` | `ChangeMe123!` | Initial admin password (used only for seeding) |
| `UseHttpsRedirection` | `false` | Enable HTTPS redirect (disable when behind a reverse proxy) |

### 14.2 Sync Tuning Settings

| Setting | Default | Description |
|---|---|---|
| `SyncSettings:MaxConcurrentCategories` | 5 | How many categories to fetch simultaneously |
| `SyncSettings:MaxConcurrentSeries` | 10 | How many series info requests to run simultaneously |
| `SyncSettings:CategoryRetryAttempts` | 3 | Retry count for failed category fetches |
| `SyncSettings:RetryDelayMs` | 1000 | Base delay between retries (multiplied exponentially) |
| `SyncSettings:HttpTimeoutSeconds` | 60 | HTTP request timeout for stream fetching |
| `SyncSettings:BatchSize` | 1000 | Database insert batch size |

### 14.3 HTTP Client Resilience

The application configures HTTP clients with:
- **Retry Policy**: 3 retries on transient errors (503, 429, 408, 500, network failures). Exponential backoff: 1s, 3s, 9s + random jitter.
- **Circuit Breaker**: Opens after 5 consecutive failures, stays open for 30 seconds before half-opening.

---

## 15. Resilience & Error Handling

### 15.1 Sync Resilience

- **Category-level retries**: Each category fetch has configurable retry attempts with exponential backoff.
- **Series-level retries**: Each individual series info fetch retries up to 3 times with 500ms * attempt delay.
- **Batch save retries**: Database batch inserts retry up to 3 times with 5-second delays.
- **Atomic swap**: The entire channel replacement happens in a transaction. If too many failures (>5%), the transaction rolls back preserving old data.
- **Partial sync tracking**: The system tracks which categories failed and reports them in the progress model.

### 15.2 Validation Guards

- Sync aborts if no settings/credentials are configured.
- Sync aborts if no categories are enabled.
- Sync aborts if zero channels were fetched (prevents accidental data wipe).
- Sync commits with warning if some categories produced no channels.

### 15.3 Logging

- Structured logging with Serilog.
- Console output + daily rolling file logs (`logs/iptv-YYYYMMDD.log`).
- Graceful fallback to console-only if file logging fails.

---

## 16. Migration Guide: Current → New Architecture

### What Changes

| Aspect | Current | New |
|---|---|---|
| Source providers | 1 (in AppSettings) | Multiple (SourcePlaylist table) |
| Output playlists | 1 (shared by all API keys) | Multiple (Sublist table, each independent) |
| Category selection | Global IsEnabled toggle + presets (1 active at a time) | Per-sublist selection via junction table |
| API keys | Separate table, all access same content | Embedded in each Sublist, each accesses different content |
| Xtream credentials | N/A for output (password = API key) | Per-sublist username/password |
| CategoryPresets | Saved configurations of enabled categories | Removed — sublists replace this concept |
| Sync | Single provider, all-or-nothing | Per-source, each source synced independently |
| Channel storage | Flat (no source tracking) | Tagged with SourcePlaylistId |

### Data Migration Path

If migrating existing data:
1. Create a `SourcePlaylist` from the existing `AppSettings` Xtream credentials.
2. Add `SourcePlaylistId` to all existing Categories and Channels, pointing to the new source.
3. Create a default `Sublist` with the first existing API key's credentials.
4. Populate `SublistCategory` with all currently-enabled categories.
5. Drop the `AppSettings` provider fields, `ApiKeys` table, and `CategoryPresets` table.

### Key Design Decisions

1. **Sublists are the access boundary**: A consumer can only see channels from categories assigned to their sublist. Two sublists can include the same category — changes to the underlying channel data (via sync) are reflected in both.
2. **Sources are the sync boundary**: Each source is synced independently. Deleting a source removes its categories and channels, which cascades to remove them from any sublists.
3. **Category "IsEnabled" is advisory**: On the Category model, `IsEnabled` controls visibility in the admin UI for sublist configuration, NOT whether channels appear in output. Output is controlled by SublistCategory membership.
4. **Stream URLs point to upstream**: The app does not re-encode or proxy video bytes. It serves as a metadata layer and URL resolver. Stream redirection goes directly to the upstream provider.
5. **Xtream credentials per sublist enable multi-user**: Different family members, friends, or customers can each have their own sublist with custom category selections, all served from the same IPTV Manager instance.
