# News Ingestion Notes

## Product Surface

The homepage is intentionally simple:

- A single search box at the top.
- A link-first news stream below.
- No dashboard cards, charts, or decorative radar UI.
- Search runs against the local API and refreshes the stream in place.

## Current Source

The first source is TechCrunch.

Configured feeds:

- `https://techcrunch.com/feed/`
- `https://techcrunch.com/category/startups/feed/`

TechCrunch's RSS terms allow feed display with attribution and links back to full articles. Startup Radar stores and displays feed-provided metadata only: title, URL, author, category, timestamps, and raw feed payload for auditability.

## Code Map

- `app/page.tsx`: server entry for the homepage.
- `app/news-stream.tsx`: client search box and scrolling link stream.
- `app/api/news/route.ts`: JSON endpoint for news search.
- `lib/news.ts`: Postgres read path, first-run schema setup, RSS preview fallback, throttled feed refresh, and server-side ingestion helper.
- `scripts/apply-schema.mjs`: applies `db/schema.sql`.
- `scripts/ingest-techcrunch.mjs`: deployment-safe TechCrunch RSS ingestion script.
- `db/schema.sql`: database schema and indexes.
- `render.yaml`: Render web service and Postgres database.

## Database Shape

`sources` stores publishers such as TechCrunch.

`source_feeds` stores individual feeds such as Latest and Startups, plus fetch status fields.

`articles` stores deduplicated links. `url` is the unique key. The app uses `published_at` and `first_seen_at` to order the stream.

`article_categories` stores many-to-one category tags from RSS.

`fetch_runs` records every ingestion attempt, including failure messages.

## Next Step

The next natural layer is an analysis pipeline:

- company/entity extraction
- market and sector classification
- signal scoring
- duplicate story clustering
- summary and investment memo generation
