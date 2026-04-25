# Startup Radar

Startup Radar is a live startup intelligence surface. The current version is a Google-like search page backed by a merged startup news stream.

## What It Does Now

- Shows a restrained search-first homepage.
- Pulls TechCrunch and VentureBeat RSS feeds.
- Clusters similar article titles into one story with multiple source links.
- Stores news links, metadata, fetch runs, and categories in Postgres.
- Serves news through `/api/news` for live search and refresh.
- Refreshes feeds on the server with a 10-minute throttle and a lightweight background interval while the Render instance is awake.

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

The web service runs schema setup and one ingestion pass on startup, then serves the Next.js app. Runtime API requests refresh configured feeds at most once every 10 minutes.

Render free web services can spin down after inactivity and the Blueprint does not create a paid cron service. The app therefore uses two refresh paths:

- a startup ingestion pass
- an in-process/request-triggered 10-minute refresh once the service is awake

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
