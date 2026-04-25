# News Ingestion Notes

## Product Surface

The homepage is intentionally simple:

- A single search box at the top.
- A link-first news stream below.
- No dashboard cards, charts, or decorative radar UI.
- Search runs against the local API and refreshes the stream in place.

## Current Sources

The first sources are TechCrunch and VentureBeat.

Configured TechCrunch feeds:

- `https://techcrunch.com/feed/`
- `https://techcrunch.com/category/startups/feed/`

Configured VentureBeat feeds:

- `https://venturebeat.com/feed/`
- `https://venturebeat.com/category/ai/feed/`
- `https://venturebeat.com/category/business/feed/`

Startup Radar stores and displays feed-provided metadata only: title, URL, author, category, timestamps, and raw feed payload for auditability.

## Code Map

- `app/page.tsx`: server entry for the homepage.
- `app/news-stream.tsx`: client search box and scrolling link stream.
- `app/api/news/route.ts`: JSON endpoint for news search.
- `lib/news.ts`: Postgres read path, first-run schema setup, RSS preview fallback, story clustering, throttled feed refresh, and server-side ingestion helper.
- `scripts/apply-schema.mjs`: applies `db/schema.sql`.
- `scripts/ingest-feeds.mjs`: deployment-safe multi-source RSS ingestion script.
- `db/schema.sql`: database schema and indexes.
- `render.yaml`: Render web service and Postgres database.

## Database Shape

`sources` stores publishers such as TechCrunch.

`source_feeds` stores individual feeds such as Latest and Startups, plus fetch status fields.

`stories` stores clustered story records. It keeps a canonical title, a normalized title-term key, and the latest observed publication timestamp.

`articles` stores deduplicated links. `url` is the unique key. Each article can point to a `story_id`, allowing multiple publishers or multiple RSS entries to show as one story with multiple source links.

`article_categories` stores many-to-one category tags from RSS.

`fetch_runs` records every ingestion attempt, including failure messages.

## Refresh Strategy

The current Render Blueprint intentionally does not provision a paid cron service yet. The web service uses these refresh paths:

- startup ingestion: `npm run db:schema && npm run ingest:feeds`
- request-triggered refresh: API/page requests ingest again when the oldest configured feed is more than 10 minutes stale
- in-process refresh: once the web service is awake, a lightweight timer checks the same 10-minute throttle

A paid Render Cron Job should be added later when billing/account setup is ready. The planned service is documented in `docs/render-cron-plan.md`.

## Next Step

The next natural layer is an analysis pipeline:

- company/entity extraction
- market and sector classification
- signal scoring
- duplicate story clustering
- summary and investment memo generation
