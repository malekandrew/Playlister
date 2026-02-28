# Playlister — Implementation Plan

> **Project**: Playlister  
> **Repository**: Public GitHub repo  
> **Deployment**: Vercel  
> **Date**: February 27, 2026

---

## Table of Contents

1. [Tech Stack](#1-tech-stack)
2. [Architecture Overview](#2-architecture-overview)
3. [Business Logic Adaptations for Vercel](#3-business-logic-adaptations-for-vercel)
4. [Data Model (Prisma Schema)](#4-data-model-prisma-schema)
5. [Project Structure](#5-project-structure)
6. [Implementation Phases](#6-implementation-phases)
7. [API Route Design](#7-api-route-design)
8. [Authentication & Middleware](#8-authentication--middleware)
9. [Sync Engine (Adapted for Serverless)](#9-sync-engine-adapted-for-serverless)
10. [Frontend Pages & Components](#10-frontend-pages--components)
11. [Deployment & Infrastructure](#11-deployment--infrastructure)
12. [Environment Variables](#12-environment-variables)
13. [Testing Strategy](#13-testing-strategy)
14. [Milestones & Timeline](#14-milestones--timeline)

---

## 1. Tech Stack

| Layer | Technology | Rationale |
|---|---|---|
| **Framework** | Next.js 15 (App Router) | First-class Vercel support, API routes + SSR in one project |
| **Language** | TypeScript | Type safety, better DX, aligns with Next.js ecosystem |
| **Database** | PostgreSQL (Vercel Postgres / Neon) | Vercel-native managed Postgres; relational model fits the data well |
| **ORM** | Prisma | Type-safe queries, migrations, works seamlessly with Vercel Postgres |
| **Authentication** | NextAuth.js v5 (Auth.js) | Session management, credentials provider for admin login |
| **UI Framework** | React 19 + Tailwind CSS v4 | Modern styling, fast iteration, small bundle |
| **UI Components** | shadcn/ui | High-quality, accessible, copy-paste components built on Radix UI |
| **State/Fetching** | React Server Components + Server Actions | Minimize client JS; use server actions for mutations |
| **Background Jobs** | Vercel Cron + Vercel Functions (60s) / QStash (long-running) | Vercel Cron for scheduling; QStash from Upstash for long-running sync tasks that exceed the 60s function limit |
| **Caching** | Vercel KV (Redis via Upstash) | Cache generated playlists, sync locks, progress tracking |
| **HTTP Client** | `undici` / native `fetch` | Built-in retry/timeout handling for upstream API calls |
| **Logging** | Vercel Logs + `pino` | Structured JSON logging, viewable in Vercel dashboard |
| **Package Manager** | pnpm | Fast, disk-efficient |

### Why This Stack?

- **Vercel-optimized**: Next.js App Router is Vercel's flagship. Vercel Postgres, KV, and Cron are first-party integrations requiring zero infra management.
- **Serverless-friendly**: The app is primarily a CRUD admin panel + API endpoints — fits the serverless model well.
- **Long-running sync workaround**: The sync engine can process thousands of API calls. Vercel Functions have a 60s limit (300s on Pro). We use **QStash** (Upstash's HTTP-based task queue) to chunk the sync into multiple invocations, or run the heavy sync via a Vercel Function with streaming/background execution.

---

## 2. Architecture Overview

```
┌────────────-─────────────────────────────────────────────────────┐
│                        Vercel Edge Network                       │
├───────────-──────────────────────────────────────────────────────┤
│                                                                  │
│  ┌────────-──────┐   ┌──────────────┐   ┌─────────────────────┐  │
│  │  Admin UI     │   │  M3U/Xtream  │   │  Stream Redirect    │  │
│  │  (App Router) │   │  API Routes  │   │  API Routes         │  │
│  │  /dashboard   │   │  /playlist   │   │  /live, /movie,     │  │
│  │  /sources     │   │  /get.php    │   │  /series            │  │
│  │  /sublists    │   │  /player_api │   │                     │  │
│  └──────┬───-────┘   └──────┬───────┘   └───-───┬─────────────┘  │
│         │                   │                   │                │
│         ▼                   ▼                   ▼                │
│  ┌─────────────────────────────────────────────────────────┐     │
│  │              Shared Service Layer (lib/)                │     │
│  │  - auth.ts       - sync-engine.ts    - playlist-gen.ts  │     │
│  │  - sources.ts    - categories.ts     - sublists.ts      │     │
│  └──────────────────────┬──────────────────────────────────┘     │
│                         │                                        │
│         ┌───────────────┼───────────────┐                        │
│         ▼               ▼               ▼                        │
│  ┌───────-─────┐  ┌────────────┐  ┌────────────┐                 │
│  │  Prisma     │  │  Vercel KV │  │  QStash    │                 │
│  │  (Postgres) │  │  (Redis)   │  │  (Jobs)    │                 │
│  └───-─────────┘  └────────────┘  └────────────┘                 │
│                                                                  │
└──────-───────────────────────────────────────────────────────────┘
         │                                    ▲
         ▼                                    │
┌──────────────────┐                 ┌──────────────────┐
│  Upstream IPTV   │                 │  IPTV Players    │
│  Providers       │                 │  (TiviMate, etc) │
└──────────────────┘                 └──────────────────┘
```

---

## 3. Business Logic Adaptations for Vercel

The original spec assumes a long-running server process. Vercel's serverless model requires these adaptations:

### 3.1 Sync Engine → Chunked Execution

**Problem**: Syncing a provider can take minutes (thousands of API calls). Vercel Functions time out at 60s (Hobby) / 300s (Pro).

**Solution**: Split the sync into discrete tasks orchestrated by **QStash**:

1. **Trigger** (`POST /api/sync/start`): Validates, acquires lock in Vercel KV, enqueues the first chunk via QStash.
2. **Fetch Categories** (`POST /api/sync/categories`): Fetches categories for one source, stores them, enqueues channel-fetch tasks.
3. **Fetch Channels** (`POST /api/sync/channels`): Fetches channels for a batch of categories (e.g., 5 at a time). If more categories remain, enqueues the next batch.
4. **Finalize** (`POST /api/sync/finalize`): Runs the atomic DB swap, updates sync status, releases lock.

Each step is an independent serverless function invocation, chained via QStash callbacks. Progress is tracked in Vercel KV.

### 3.2 Sync Lock → Vercel KV

**Problem**: Original uses an in-memory semaphore — doesn't work across serverless invocations.

**Solution**: Use a Redis key in Vercel KV with a TTL (e.g., `sync:lock` with 10-minute expiry) to prevent concurrent syncs.

### 3.3 Sync Progress → Vercel KV

**Problem**: Original uses an in-memory singleton for progress tracking.

**Solution**: Store progress data in Vercel KV. Admin dashboard polls `GET /api/sync/progress` which reads from KV.

### 3.4 Playlist Caching → Vercel KV + Edge Cache

Generated M3U playlists are cached in Vercel KV with a 5-minute TTL, keyed by sublist ID. Additionally, use `Cache-Control` headers for Vercel's edge CDN.

### 3.5 Background Refresh → Vercel Cron

Replace the background service with a Vercel Cron job:
```json
// vercel.json
{
  "crons": [
    {
      "path": "/api/cron/sync",
      "schedule": "0 */6 * * *"
    }
  ]
}
```

### 3.6 Stream Redirect — No Change Needed

Stream proxying is already a simple 302 redirect — perfect for serverless. Each request is stateless.

---

## 4. Data Model (Prisma Schema)

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_DATABASE_URL")
}

model AdminUser {
  id           Int      @id @default(autoincrement())
  username     String   @unique
  passwordHash String
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
}

model SourcePlaylist {
  id                   Int        @id @default(autoincrement())
  name                 String
  type                 String     // "xtream" | "m3u"
  xtreamHost           String?
  xtreamUsername       String?
  xtreamPassword       String?
  m3uUrl               String?
  isEnabled            Boolean    @default(true)
  lastSyncedAt         DateTime?
  lastSyncChannelCount Int?
  lastSyncError        String?
  refreshIntervalMin   Int        @default(360)
  createdAt            DateTime   @default(now())
  updatedAt            DateTime   @updatedAt

  categories Category[]
  channels   Channel[]
}

model Category {
  id               Int             @id @default(autoincrement())
  sourcePlaylistId Int
  categoryId       String          // provider's original category ID
  categoryName     String
  categoryType     String          // "live" | "movie" | "series"
  isEnabled        Boolean         @default(true)
  createdAt        DateTime        @default(now())
  updatedAt        DateTime        @updatedAt

  sourcePlaylist   SourcePlaylist  @relation(fields: [sourcePlaylistId], references: [id], onDelete: Cascade)
  sublists         SublistCategory[]
  channels         Channel[]

  @@unique([sourcePlaylistId, categoryId, categoryType])
}

model Channel {
  id               Int             @id @default(autoincrement())
  sourcePlaylistId Int
  categoryId       Int?
  name             String
  url              String
  groupTitle       String?
  tvgId            String?
  tvgName          String?
  tvgLogo          String?
  language         String?
  duration         Int             @default(-1)
  seriesName       String?
  createdAt        DateTime        @default(now())
  updatedAt        DateTime        @updatedAt

  sourcePlaylist   SourcePlaylist  @relation(fields: [sourcePlaylistId], references: [id], onDelete: Cascade)
  category         Category?       @relation(fields: [categoryId], references: [id], onDelete: SetNull)

  @@index([sourcePlaylistId])
  @@index([categoryId])
  @@index([groupTitle])
  @@index([tvgId])
  @@index([seriesName])
}

model Sublist {
  id               Int               @id @default(autoincrement())
  name             String
  apiKey           String            @unique @default(uuid())
  xtreamUsername   String            @unique
  xtreamPassword   String
  isEnabled        Boolean           @default(true)
  lastUsedAt       DateTime?
  createdAt        DateTime          @default(now())
  updatedAt        DateTime          @updatedAt

  categories       SublistCategory[]
}

model SublistCategory {
  sublistId  Int
  categoryId Int

  sublist    Sublist   @relation(fields: [sublistId], references: [id], onDelete: Cascade)
  category   Category  @relation(fields: [categoryId], references: [id], onDelete: Cascade)

  @@id([sublistId, categoryId])
}

model AppSettings {
  id                    Int      @id @default(1)
  refreshIntervalMin    Int      @default(360)
  updatedAt             DateTime @updatedAt
}
```

### Key Design Decisions

- **Channel → Category FK**: Added a direct `categoryId` FK on Channel to enable efficient joins when building playlists from sublists. The `groupTitle` field is kept for M3U output compatibility.
- **Cascade deletes**: Deleting a source cascades to its categories and channels. Deleting a category removes it from sublists (via SublistCategory cascade).
- **Indexes**: Added indexes on frequently queried columns for playlist generation performance.

---

## 5. Project Structure

```
playlister/
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts                    # Seed admin user
├── src/
│   ├── app/
│   │   ├── layout.tsx             # Root layout (providers, fonts)
│   │   ├── page.tsx               # Redirect to /dashboard
│   │   ├── login/
│   │   │   └── page.tsx           # Login form
│   │   ├── (admin)/               # Route group — protected by auth
│   │   │   ├── layout.tsx         # Admin shell (sidebar, header)
│   │   │   ├── dashboard/
│   │   │   │   └── page.tsx       # Stats, sync trigger, progress
│   │   │   ├── sources/
│   │   │   │   ├── page.tsx       # List sources
│   │   │   │   ├── new/page.tsx   # Add source form
│   │   │   │   └── [id]/
│   │   │   │       ├── page.tsx   # Edit source
│   │   │   │       └── categories/page.tsx  # View/manage categories
│   │   │   ├── sublists/
│   │   │   │   ├── page.tsx       # List sublists
│   │   │   │   ├── new/page.tsx   # Create sublist
│   │   │   │   └── [id]/
│   │   │   │       └── page.tsx   # Edit sublist + category picker
│   │   │   └── settings/
│   │   │       └── page.tsx       # Change password, app settings
│   │   ├── api/
│   │   │   ├── auth/[...nextauth]/route.ts  # Auth.js handler
│   │   │   ├── sync/
│   │   │   │   ├── start/route.ts
│   │   │   │   ├── categories/route.ts
│   │   │   │   ├── channels/route.ts
│   │   │   │   ├── finalize/route.ts
│   │   │   │   └── progress/route.ts
│   │   │   ├── sources/
│   │   │   │   └── [id]/
│   │   │   │       └── fetch-categories/route.ts
│   │   │   └── cron/
│   │   │       └── sync/route.ts
│   │   ├── playlist.m3u8/
│   │   │   └── route.ts           # M3U playlist endpoint
│   │   ├── get.php/
│   │   │   └── route.ts           # Xtream M3U endpoint
│   │   ├── player_api.php/
│   │   │   └── route.ts           # Xtream API emulation
│   │   ├── xmltv.php/
│   │   │   └── route.ts           # EPG endpoint
│   │   ├── live/[...path]/
│   │   │   └── route.ts           # Live stream redirect
│   │   ├── movie/[...path]/
│   │   │   └── route.ts           # Movie stream redirect
│   │   └── series/[...path]/
│   │       └── route.ts           # Series stream redirect
│   ├── lib/
│   │   ├── db.ts                  # Prisma client singleton
│   │   ├── auth.ts                # Auth.js config & helpers
│   │   ├── password.ts            # Hashing utilities (bcrypt)
│   │   ├── sync/
│   │   │   ├── engine.ts          # Core sync orchestration
│   │   │   ├── xtream-client.ts   # Xtream API client
│   │   │   ├── m3u-parser.ts      # M3U file parser
│   │   │   ├── progress.ts        # KV-based progress tracking
│   │   │   └── lock.ts            # KV-based sync lock
│   │   ├── playlist/
│   │   │   ├── generator.ts       # M3U8 playlist generation
│   │   │   └── cache.ts           # KV-based playlist cache
│   │   ├── xtream/
│   │   │   ├── auth.ts            # Sublist credential lookup
│   │   │   ├── categories.ts      # Category list handlers
│   │   │   ├── streams.ts         # Stream list handlers
│   │   │   ├── series.ts          # Series grouping logic
│   │   │   └── server-info.ts     # Server info response
│   │   ├── redis.ts               # Vercel KV client
│   │   └── constants.ts           # App-wide constants
│   ├── components/
│   │   ├── ui/                    # shadcn/ui components
│   │   ├── admin/
│   │   │   ├── sidebar.tsx
│   │   │   ├── sync-progress.tsx
│   │   │   ├── source-form.tsx
│   │   │   ├── sublist-form.tsx
│   │   │   ├── category-picker.tsx
│   │   │   └── stats-cards.tsx
│   │   └── login-form.tsx
│   ├── actions/                   # Server Actions
│   │   ├── auth.ts
│   │   ├── sources.ts
│   │   ├── sublists.ts
│   │   ├── categories.ts
│   │   └── sync.ts
│   └── types/
│       ├── xtream.ts              # Xtream API response types
│       ├── m3u.ts                 # M3U parse types
│       └── index.ts               # Shared app types
├── public/
│   └── favicon.ico
├── .env.local                     # Local env vars
├── .env.example                   # Documented env template
├── next.config.ts
├── vercel.json                    # Cron config, rewrites
├── tailwind.config.ts
├── tsconfig.json
├── package.json
├── pnpm-lock.yaml
├── BUSINESS_LOGIC.md
├── IMPLEMENTATION_PLAN.md
└── README.md
```

---

## 6. Implementation Phases

The project is divided into **6 phases**, each delivering a working increment.

---

### Phase 1: Project Scaffolding & Auth (Days 1–2)

**Goal**: Bootable app with login, database, and deployment pipeline.

| # | Task | Details |
|---|---|---|
| 1.1 | Initialize Next.js project | `pnpm create next-app@latest playlister --typescript --tailwind --app --src-dir` |
| 1.2 | Install dependencies | `prisma`, `@prisma/client`, `next-auth`, `bcryptjs`, `@upstash/redis`, `@upstash/qstash`, shadcn/ui setup |
| 1.3 | Configure Prisma | Schema (AdminUser only initially), connect to Vercel Postgres |
| 1.4 | Seed admin user | `prisma/seed.ts` — create admin from env vars if not exists |
| 1.5 | Implement Auth.js | Credentials provider, session config, protected route middleware |
| 1.6 | Build login page | Email/password form with error handling |
| 1.7 | Build admin layout shell | Sidebar nav, header, logout, responsive design |
| 1.8 | Set up Vercel project | Link GitHub repo, configure env vars, verify deployment |
| 1.9 | Configure Vercel Postgres | Provision database, run initial migration |

**Deliverable**: Deployed app with working login and empty dashboard.

---

### Phase 2: Source Playlist Management (Days 3–5)

**Goal**: CRUD for upstream IPTV providers with category fetching.

| # | Task | Details |
|---|---|---|
| 2.1 | Add Prisma models | SourcePlaylist, Category — run migration |
| 2.2 | Build Sources list page | Table with name, type, status, last sync, enable/disable toggle |
| 2.3 | Build Add/Edit Source form | Type selector (Xtream/M3U), conditional fields, validation |
| 2.4 | Implement Xtream API client | `lib/sync/xtream-client.ts` — methods for fetching categories and streams |
| 2.5 | Implement M3U parser | `lib/sync/m3u-parser.ts` — parse #EXTINF lines, extract group-title |
| 2.6 | Build "Fetch Categories" action | Server Action that calls the provider and upserts categories |
| 2.7 | Build Categories view | Per-source category list with type tabs, enable/disable toggles |
| 2.8 | Implement delete source | Cascade delete categories/channels, confirm dialog |

**Deliverable**: Admin can add providers, fetch their categories, and manage them.

---

### Phase 3: Sync Engine (Days 6–9)

**Goal**: Full sync pipeline that fetches channels from all sources.

| # | Task | Details |
|---|---|---|
| 3.1 | Add Channel model | Prisma migration |
| 3.2 | Set up Vercel KV | Provision KV store, configure `@upstash/redis` client |
| 3.3 | Implement sync lock | KV-based mutex with TTL |
| 3.4 | Implement progress tracking | KV get/set for sync progress model |
| 3.5 | Build sync engine — Xtream | Fetch live/movie/series channels per enabled category |
| 3.6 | Build sync engine — M3U | Download, parse, create channels + auto-derive categories |
| 3.7 | Implement atomic DB swap | Transaction: delete old channels for source → batch insert new |
| 3.8 | Implement chunked execution | QStash-based task chaining for long syncs |
| 3.9 | Build sync progress UI | Dashboard component with progress bar, status text, auto-refresh |
| 3.10 | Build "Sync Now" trigger | Dashboard button → server action → start sync |
| 3.11 | Handle validation guards | Zero-channel abort, partial sync warnings |

**Deliverable**: Admin can trigger sync and watch real-time progress. Channels are stored in DB.

---

### Phase 4: Sublists & Playlist Serving (Days 10–13)

**Goal**: Create sublists and serve M3U playlists.

| # | Task | Details |
|---|---|---|
| 4.1 | Add Sublist + SublistCategory models | Prisma migration |
| 4.2 | Build Sublists list page | Table with name, API key, Xtream creds, enable/disable, connection URLs |
| 4.3 | Build Create/Edit Sublist form | Name, auto-generated credentials, editable username/password |
| 4.4 | Build Category Picker component | Multi-source, multi-type, select all, search, checkbox tree |
| 4.5 | Implement M3U playlist generator | Build M3U8 string from channels matching sublist's categories |
| 4.6 | Implement `/playlist.m3u8` endpoint | API key validation → generate/cache → return playlist |
| 4.7 | Implement `/get.php` endpoint | Xtream credential validation → generate M3U with local proxy URLs |
| 4.8 | Implement playlist caching | KV cache with 5-min TTL per sublist |
| 4.9 | Build sublist detail view | Show connection URLs, copy-to-clipboard, QR code |

**Deliverable**: Admin can create sublists, pick categories, and consumers can load M3U playlists.

---

### Phase 5: Xtream API Emulation & Stream Redirect (Days 14–17)

**Goal**: Full Xtream Codes API compatibility for IPTV player apps.

| # | Task | Details |
|---|---|---|
| 5.1 | Implement sublist auth middleware | Lookup sublist by Xtream username + password |
| 5.2 | `/player_api.php` — server info | Default action: return user_info + server_info JSON |
| 5.3 | `/player_api.php` — categories | `get_live_categories`, `get_vod_categories`, `get_series_categories` |
| 5.4 | `/player_api.php` — streams | `get_live_streams`, `get_vod_streams` with optional category filter |
| 5.5 | `/player_api.php` — series | `get_series` (grouping), `get_series_info` (seasons/episodes) |
| 5.6 | `/player_api.php` — EPG stubs | `get_short_epg`, `get_simple_data_table` → empty |
| 5.7 | `/xmltv.php` endpoint | Return empty XMLTV document |
| 5.8 | `/live/[...path]` redirect | Parse path, validate credentials, 302 redirect to upstream URL |
| 5.9 | `/movie/[...path]` redirect | Same as live |
| 5.10 | `/series/[...path]` redirect | Same as live |
| 5.11 | End-to-end testing with TiviMate | Verify a real IPTV player can connect and play |

**Deliverable**: IPTV players can connect via Xtream API and play streams.

---

### Phase 6: Polish, Cron & Production Hardening (Days 18–21)

**Goal**: Production-ready application.

| # | Task | Details |
|---|---|---|
| 6.1 | Implement Vercel Cron auto-sync | Cron job triggers sync on schedule |
| 6.2 | Dashboard stats | Channel counts by type, source status, sublist count |
| 6.3 | Change password page | Current password + new password form |
| 6.4 | Error handling & edge cases | 401/404 pages, rate limiting, input validation |
| 6.5 | Responsive design pass | Mobile-friendly admin UI |
| 6.6 | Loading states & optimistic UI | Skeleton loaders, toast notifications |
| 6.7 | README documentation | Setup guide, env vars, usage instructions |
| 6.8 | Security audit | CSRF protection, header hardening, credential encryption at rest |
| 6.9 | Performance optimization | Query optimization, connection pooling, edge caching |
| 6.10 | Final deployment & smoke test | Full end-to-end test on production |

**Deliverable**: Production-ready, documented, deployed application.

---

## 7. API Route Design

### 7.1 Admin API (Protected — requires auth session)

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/sources` | List all sources |
| POST | `/api/sources` | Create source |
| PUT | `/api/sources/[id]` | Update source |
| DELETE | `/api/sources/[id]` | Delete source |
| POST | `/api/sources/[id]/fetch-categories` | Fetch categories from provider |
| PUT | `/api/categories/[id]` | Toggle category isEnabled |
| GET | `/api/sublists` | List all sublists |
| POST | `/api/sublists` | Create sublist |
| PUT | `/api/sublists/[id]` | Update sublist (name, creds, categories) |
| DELETE | `/api/sublists/[id]` | Delete sublist |
| POST | `/api/sync/start` | Trigger sync |
| GET | `/api/sync/progress` | Get sync progress |
| PUT | `/api/settings` | Update app settings |
| PUT | `/api/auth/password` | Change admin password |

### 7.2 Consumer API (Public — auth via API key or Xtream credentials)

| Method | Route | Purpose |
|---|---|---|
| GET | `/playlist.m3u8` | M3U playlist (auth: `?key=`) |
| GET | `/get.php` | Xtream M3U (auth: username/password params) |
| GET | `/player_api.php` | Xtream API (auth: username/password params) |
| GET | `/xmltv.php` | XMLTV EPG (auth: username/password params) |
| GET | `/live/[user]/[pass]/[streamId].[ext]` | Live stream redirect |
| GET | `/movie/[user]/[pass]/[streamId].[ext]` | Movie stream redirect |
| GET | `/series/[user]/[pass]/[streamId].[ext]` | Series stream redirect |

### 7.3 Internal API (Called by QStash — verified via signature)

| Method | Route | Purpose |
|---|---|---|
| POST | `/api/sync/categories` | Fetch categories for a source (QStash callback) |
| POST | `/api/sync/channels` | Fetch channels for a category batch (QStash callback) |
| POST | `/api/sync/finalize` | Commit synced data to DB (QStash callback) |
| GET | `/api/cron/sync` | Vercel Cron trigger for auto-sync |

---

## 8. Authentication & Middleware

### 8.1 Admin Auth (NextAuth.js)

```typescript
// Credentials provider config (simplified)
{
  providers: [
    Credentials({
      credentials: {
        username: { label: "Username" },
        password: { label: "Password", type: "password" }
      },
      authorize: async (credentials) => {
        const user = await db.adminUser.findUnique({
          where: { username: credentials.username }
        });
        if (!user) return null;
        const valid = await bcrypt.compare(credentials.password, user.passwordHash);
        return valid ? { id: user.id, name: user.username } : null;
      }
    })
  ],
  session: { strategy: "jwt", maxAge: 24 * 60 * 60 }, // 24 hours
  pages: { signIn: "/login" }
}
```

### 8.2 Middleware (Route Protection)

```typescript
// middleware.ts
export { auth as middleware } from "@/lib/auth";

export const config = {
  matcher: ["/(admin)/:path*", "/api/sources/:path*", "/api/sublists/:path*", "/api/sync/:path*"]
};
```

### 8.3 Consumer Auth (Sublist Lookup)

```typescript
// lib/xtream/auth.ts
async function resolveSublistByApiKey(key: string): Promise<Sublist | null> {
  return db.sublist.findFirst({ where: { apiKey: key, isEnabled: true } });
}

async function resolveSublistByXtream(username: string, password: string): Promise<Sublist | null> {
  return db.sublist.findFirst({
    where: { xtreamUsername: username, xtreamPassword: password, isEnabled: true }
  });
}
```

---

## 9. Sync Engine (Adapted for Serverless)

### 9.1 Execution Flow (QStash-Orchestrated)

```
Admin clicks "Sync Now"
        │
        ▼
POST /api/sync/start
  ├── Acquire lock in KV
  ├── Set progress = { isRunning: true, status: "Starting..." }
  ├── Load all enabled sources
  └── For each source → enqueue via QStash:
        POST /api/sync/categories?sourceId={id}
              │
              ▼
        Fetch categories from provider
        Upsert categories in DB
        Split enabled categories into batches
        For each batch → enqueue via QStash:
              POST /api/sync/channels?sourceId={id}&batch={n}
                    │
                    ▼
              Fetch channels for this category batch
              Store in temp staging table (or KV)
              Update progress in KV
              If last batch → enqueue:
                    POST /api/sync/finalize?sourceId={id}
                          │
                          ▼
                    Atomic DB swap (transaction)
                    Update source lastSyncedAt
                    Clear progress
                    Release lock
```

### 9.2 Fallback: Direct Execution (for small providers)

For sources with few categories (< 20), skip QStash and execute the sync directly within a single function invocation (if it completes within the timeout). The sync engine detects this and chooses the appropriate strategy.

### 9.3 Retry & Error Handling

- Each QStash task is automatically retried 3 times on failure.
- Per-category errors are logged and tracked in progress.
- If > 5% of channel batches fail → rollback (keep old data).
- Sync lock has a 10-minute TTL to auto-release on stuck syncs.

---

## 10. Frontend Pages & Components

### 10.1 Page Breakdown

| Page | Key Components | Data Fetching |
|---|---|---|
| `/login` | `LoginForm` | Client-side form → `signIn()` |
| `/dashboard` | `StatsCards`, `SyncProgress`, `SyncButton` | Server Component (stats), Client polling (progress) |
| `/sources` | `SourcesTable`, `EnableToggle` | Server Component |
| `/sources/new` | `SourceForm` | Server Action on submit |
| `/sources/[id]` | `SourceForm`, `CategoryTabs` | Server Component + Server Action |
| `/sublists` | `SublistsTable`, `ConnectionInfo` | Server Component |
| `/sublists/new` | `SublistForm` | Server Action on submit |
| `/sublists/[id]` | `SublistForm`, `CategoryPicker` | Server Component + Server Action |
| `/settings` | `PasswordForm`, `AppSettingsForm` | Server Action |

### 10.2 Key Interactive Components

#### `CategoryPicker`
- Renders all available categories grouped by source → type.
- Accordion/tree structure: Source Name > Live TV / Movies / Series > Categories.
- Features: search filter, select all per group, badge counts.
- State managed client-side; submitted via server action.

#### `SyncProgress`
- Client component that polls `/api/sync/progress` every 2 seconds.
- Displays: progress bar, status text, counts (live/movies/series), failed categories.
- Auto-hides when sync completes.

#### `ConnectionInfo`
- Displays sublist connection details:
  - M3U URL with API key
  - Xtream server URL, username, password
  - Copy-to-clipboard buttons

---

## 11. Deployment & Infrastructure

### 11.1 Vercel Configuration

```json
// vercel.json
{
  "crons": [
    {
      "path": "/api/cron/sync",
      "schedule": "0 */6 * * *"
    }
  ],
  "headers": [
    {
      "source": "/playlist.m3u8",
      "headers": [
        { "key": "Cache-Control", "value": "public, s-maxage=300, stale-while-revalidate=60" }
      ]
    }
  ]
}
```

### 11.2 Required Vercel Add-ons

| Service | Purpose | Plan |
|---|---|---|
| **Vercel Postgres** | Primary database | Hobby (free: 256MB) or Pro |
| **Vercel KV** | Sync lock, progress, playlist cache | Hobby (free: 3,000 requests/day) or Pro |
| **QStash** (Upstash) | Long-running sync task orchestration | Free tier: 500 messages/day |

### 11.3 GitHub Actions (Optional)

```yaml
# .github/workflows/ci.yml
name: CI
on: [push, pull_request]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: "20" }
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm type-check
      - run: pnpm test
```

---

## 12. Environment Variables

```bash
# .env.example

# --- Database ---
DATABASE_URL="postgres://..."           # Vercel Postgres pooled connection
DIRECT_DATABASE_URL="postgres://..."    # Vercel Postgres direct connection (for migrations)

# --- Auth ---
NEXTAUTH_SECRET="random-secret-min-32-chars"
NEXTAUTH_URL="https://playlister.vercel.app"

# --- Admin Seed ---
ADMIN_USERNAME="admin"
ADMIN_PASSWORD="ChangeMe123!"

# --- Vercel KV (Upstash Redis) ---
KV_REST_API_URL="https://..."
KV_REST_API_TOKEN="..."

# --- QStash (Upstash) ---
QSTASH_URL="https://qstash.upstash.io"
QSTASH_TOKEN="..."
QSTASH_CURRENT_SIGNING_KEY="..."
QSTASH_NEXT_SIGNING_KEY="..."

# --- App ---
NEXT_PUBLIC_APP_URL="https://playlister.vercel.app"
```

---

## 13. Testing Strategy

| Layer | Tool | Coverage |
|---|---|---|
| **Unit Tests** | Vitest | M3U parser, Xtream client response mapping, playlist generator, password hashing |
| **Integration Tests** | Vitest + Prisma (test DB) | Sync engine database operations, sublist resolution, category filtering |
| **API Tests** | Vitest + `next/test-utils` | Xtream API endpoints return correct JSON structure, auth rejection |
| **E2E Tests** | Playwright (optional, Phase 6) | Login flow, source creation, sync trigger, playlist download |

### Key Test Cases

- M3U parser handles malformed files gracefully
- Xtream client retries on transient errors
- Sync aborts when zero channels fetched
- Sublist API key lookup returns only enabled sublists
- Playlist generation includes only categories assigned to the sublist
- Stream redirect resolves channel by tvgId, falling back to DB id
- Xtream `get_series` correctly groups episodes by SeriesName
- Disabled sublist returns 401

---

## 14. Milestones & Timeline

| Milestone | Phase | Target | Key Deliverable |
|---|---|---|---|
| **M1: Foundation** | Phase 1 | Day 2 | App deployed on Vercel with auth |
| **M2: Sources** | Phase 2 | Day 5 | Admin can manage providers and categories |
| **M3: Sync** | Phase 3 | Day 9 | Channels sync from upstream providers |
| **M4: Playlists** | Phase 4 | Day 13 | Consumers can load M3U playlists via sublists |
| **M5: Xtream** | Phase 5 | Day 17 | Full Xtream API compatibility |
| **M6: Production** | Phase 6 | Day 21 | Production-hardened, documented, fully tested |

### Risk Mitigation

| Risk | Mitigation |
|---|---|
| Vercel function timeout during sync | QStash chunked execution; direct mode for small providers |
| Vercel Postgres connection limits | Prisma connection pooling via `?pgbouncer=true`; use `@vercel/postgres` adapter |
| KV rate limits on free tier | Batch KV operations; reduce polling frequency; upgrade if needed |
| Large channel counts (100k+) | Batch inserts (10k per batch); streaming M3U generation; pagination in admin UI |
| Xtream API rate limiting by upstream | Configurable concurrency limits; exponential backoff |
| QStash message limits on free tier | Optimize batch sizes to reduce message count; upgrade if needed |

---

## Summary

**Playlister** is built as a Next.js 15 App Router application deployed on Vercel, using Vercel Postgres for persistence, Vercel KV for caching/coordination, and QStash for orchestrating long-running sync operations. The architecture embraces serverless constraints — stateless request handlers, external state stores, and chunked background processing — while delivering the full feature set described in the business logic spec: multi-source aggregation, per-sublist filtering, M3U/Xtream API serving, and stream redirection.
