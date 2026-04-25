# Startup Radar

Startup Radar is a live startup intelligence surface. The current version is a Google-like search page backed by a merged startup news stream.

## What It Does Now

- Shows a restrained search-first homepage.
- Pulls TechCrunch and VentureBeat RSS feeds.
- Clusters similar article titles into one story with multiple source links.
- Stores news links, metadata, fetch runs, and categories in Postgres.
- Serves news through `/api/news` for live search and refresh.
- Refreshes feeds on startup and through a 10-minute request/background fallback while the Render web instance is awake.

## Local Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) after the development server starts.

Without `DATABASE_URL`, the app falls back to live RSS preview mode. To use Postgres locally:

```bash
export DATABASE_URL="postgres://USER:PASSWORD@HOST:PORT/DATABASE"
npm run db:schema
npm run ingest:feeds
```

## Render Deployment

`render.yaml` defines:

- `startup-radar-live`: Next.js web service
- `startup-radar-db`: Postgres database

The web service runs schema setup and one ingestion pass on startup, then serves the Next.js app.

The app keeps a request-triggered fallback as well. If the web service is awake and sees stale feed data, it can refresh configured feeds at most once every 10 minutes.

Refresh paths:

- startup ingestion pass
- in-process/request-triggered 10-minute refresh once the web service is awake

A paid Render Cron Job is planned but not currently provisioned. See `docs/render-cron-plan.md` for the exact `render.yaml` block to enable after billing/account setup is ready.
## Data Model

The database schema is in `db/schema.sql`.

Main tables:

- `sources`
- `source_feeds`
- `stories`
- `articles`
- `article_categories`
- `fetch_runs`

See `docs/news-ingestion.md` for the implementation notes.
