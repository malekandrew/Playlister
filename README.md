# Playlister

A self-hosted IPTV playlist manager that aggregates, filters, and redistributes channels from multiple providers via M3U8 and Xtream Codes API.

## Features

- **Multi-source aggregation** — Import channels from Xtream Codes API or M3U/M3U8 playlists
- **Category filtering** — Select which Live TV, Movie, and Series categories to keep per source
- **Sublists** — Create curated playlists scoped to a single source with hand-picked categories
- **Xtream Codes API emulation** — Serve playlists to apps like TiviMate and IPTV Smarters via a fully emulated Xtream API
- **M3U8 output** — Standard playlist endpoint for any M3U-compatible player
- **API key access control** — Each sublist gets its own API key and Xtream credentials
- **Live sync progress** — Real-time per-source progress tracking with parallel fetching
- **Admin dashboard** — Manage sources, categories, sublists, and settings from a clean UI

## Tech Stack

- **Framework:** Next.js 16 (App Router)
- **Database:** PostgreSQL 16 + Prisma 7
- **Auth:** NextAuth v5 (Credentials)
- **UI:** shadcn/ui, Tailwind CSS 4, Radix UI
- **Cache/KV:** Upstash Redis (with in-memory fallback for local dev)
- **Runtime:** Node.js, pnpm

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm
- PostgreSQL 16 (or Docker)

### Setup

```bash
# Clone the repo
git clone https://github.com/malekandrew/Playlister.git
cd Playlister

# Install dependencies
pnpm install

# Copy env file and configure
cp .env.example .env

# Start PostgreSQL (Docker)
docker run -d --name playlister-db \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=playlister \
  -p 5432:5432 postgres:16-alpine

# Run migrations & seed
pnpm db:migrate
pnpm db:seed

# Start dev server
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) and log in with the admin credentials from your `.env` file.

### Environment Variables

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `AUTH_SECRET` | NextAuth secret (min 32 chars) |
| `ADMIN_USERNAME` | Initial admin username |
| `ADMIN_PASSWORD` | Initial admin password |
| `KV_REST_API_URL` | Upstash Redis URL (optional for local dev) |
| `KV_REST_API_TOKEN` | Upstash Redis token (optional for local dev) |

See [.env.example](.env.example) for the full list.

## Scripts

| Command | Description |
|---|---|
| `pnpm dev` | Start development server |
| `pnpm build` | Build for production |
| `pnpm start` | Start production server |
| `pnpm db:migrate` | Run Prisma migrations |
| `pnpm db:seed` | Seed admin user |
| `pnpm db:studio` | Open Prisma Studio |
| `pnpm type-check` | Run TypeScript type checking |

## Architecture

```
Upstream Providers          Playlister              IPTV Players
┌──────────────┐     sync    ┌───────────┐   serve   ┌──────────┐
│ Xtream API   │ ──────────► │  Sources  │ ────────► │ TiviMate │
│ M3U Playlist │             │  Sublists │           │ Smarters │
└──────────────┘             │  Channels │           │ VLC      │
                             └───────────┘           └──────────┘
```

Sources are synced into the database with parallel fetching and atomic channel swaps. Sublists filter channels by category and are served as M3U8 playlists or via Xtream Codes API emulation with per-sublist credentials.

## License

Private

