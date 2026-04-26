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

Startup Radar stores feed-provided metadata and a first-pass event analysis layer: title, URL, author, category, timestamps, raw feed payload, and story-level company/industry/event signals.

## Code Map

- `app/page.tsx`: server entry for the homepage.
- `app/news-stream.tsx`: client search box and scrolling link stream.
- `app/api/news/route.ts`: JSON endpoint for news search.
- `lib/news.ts`: Postgres read path, first-run schema setup, RSS preview fallback, story clustering, throttled feed refresh, and server-side ingestion helper.
- `lib/signal-extraction.mjs`: shared heuristic extraction for companies, industries, and event types.
- `lib/signal-types.ts`: TypeScript shape for extracted story signals.
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

`story_signals` stores extracted story tags. `signal_type` is one of `company`, `industry`, or `event`; `slug` is stable for search/dedupe; `confidence` records rule strength; `evidence` keeps the title/category text that triggered the signal.

`fetch_runs` records every ingestion attempt, including failure messages.

## Event Signal Extraction

The current extractor is deliberately lightweight and deterministic. It uses headline and category text to identify:

- companies: capitalized company-like phrases and known large technology company names
- industries: AI agents, AI infrastructure, database, developer tools, fintech, cybersecurity, health tech, robotics, mobility, climate tech, enterprise SaaS, chips, and venture capital
- event types: funding, acquisition, IPO, product launch, partnership, layoffs, regulation, legal, and security incident

The extractor runs in both ingestion paths:

- the Render Cron/script path writes signals into `story_signals`
- the no-database RSS preview path derives signals in memory for the homepage

Merged stories accumulate signals from each source link. The frontend exposes the merged article count as `heat`; duplicate articles increment that number even when the displayed story remains one row.

## Refresh Strategy

The Render Blueprint provisions a paid cron service and keeps web-service fallbacks:

- cron ingestion: `startup-radar-feed-cron` runs `npm run db:schema && npm run ingest:feeds` every 30 minutes
- startup ingestion: `npm run db:schema && npm run ingest:feeds`
- request-triggered refresh: API/page requests ingest again when the oldest configured feed is more than 30 minutes stale
- in-process refresh: once the web service is awake, a lightweight timer checks the same 30-minute throttle

The homepage and `/api/news` expose `refreshStatus.lastAttemptAt`, which updates after each feed run even if no new article is inserted.

## Next Step

The next natural layer is a stronger analysis pipeline:

- LLM-backed entity normalization
- company profile enrichment
- market and sector ontology
- signal scoring
- embedding-based duplicate story clustering
- summary and investment memo generation
