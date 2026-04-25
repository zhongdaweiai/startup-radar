# Startup Radar Agent Handoff

This file is for future AI agents loading the repository cold. It captures the current product state, deployment shape, and the next safe development moves.

## Product Goal

Startup Radar is evolving into a live business and finance intelligence processor. The current milestone is a clean search-first news feed that ingests startup and technology news, clusters similar articles, and displays one merged story with multiple source links.

## Live Deployment

- Public site: `https://startup-radar-live.onrender.com/`
- GitHub repo: `https://github.com/zhongdaweiai/startup-radar`
- Render service: `startup-radar-live`
- Database: Render Postgres `startup-radar-db`
- Active branch used so far: `master`

## Current News Sources

TechCrunch:

- `https://techcrunch.com/feed/`
- `https://techcrunch.com/category/startups/feed/`

VentureBeat:

- `https://venturebeat.com/feed/`
- `https://venturebeat.com/category/ai/feed/`
- `https://venturebeat.com/category/business/feed/`

Feed URLs are configured in `render.yaml` through `TECHCRUNCH_FEEDS` and `VENTUREBEAT_FEEDS`.

## Runtime Behavior

- `npm run db:schema` applies `db/schema.sql`.
- `npm run ingest:feeds` ingests all configured feeds into Postgres.
- The Render web `startCommand` runs schema setup, one ingestion pass, then `next start`.
- The app has a 10-minute stale-data check in the request path and a lightweight in-process background refresh while the web service is awake.
- A paid Render Cron Job is planned but intentionally not active. See `docs/render-cron-plan.md`.

## Data Model

Key tables:

- `sources`: publishers such as TechCrunch and VentureBeat.
- `source_feeds`: individual RSS feeds and fetch status.
- `stories`: clustered story records with canonical title and normalized terms.
- `articles`: unique source links, each optionally attached to a `story_id`.
- `article_categories`: RSS categories.
- `fetch_runs`: ingestion audit log.

Story clustering is currently simple lexical matching in `lib/news.ts` and `scripts/ingest-feeds.mjs`: normalized title terms, stop-word removal, light stemming, and overlap thresholds.

## Frontend Shape

- `app/page.tsx` renders the page.
- `app/news-stream.tsx` owns the search box and scrolling merged story feed.
- The UI is intentionally restrained and Google-like: top search input, then link-first news stream.
- Each story displays a primary title link and one or more source links underneath.

## API Shape

`GET /api/news?limit=20` returns:

```json
{
  "items": [
    {
      "id": "story-1",
      "title": "Example story",
      "primaryCategory": "Latest",
      "publishedAt": "2026-04-25T21:43:37.000Z",
      "firstSeenAt": "2026-04-25T21:55:31.828Z",
      "sources": [
        {
          "id": "1",
          "sourceName": "TechCrunch",
          "feedName": "Latest",
          "title": "Example article",
          "url": "https://example.com/article",
          "author": "Reporter",
          "primaryCategory": "Latest",
          "publishedAt": "2026-04-25T21:43:37.000Z",
          "firstSeenAt": "2026-04-25T21:55:31.828Z"
        }
      ]
    }
  ]
}
```

## Validation Commands

Run these before pushing functional changes:

```bash
npm run lint
npm run build
```

For deployment config changes:

```bash
ruby -e 'require "yaml"; YAML.load_file("render.yaml"); puts "render.yaml ok"'
```

For live verification:

```bash
node -e "fetch('https://startup-radar-live.onrender.com/api/news?limit=20').then(async r => { const body = await r.text(); const data = JSON.parse(body); console.log(r.status); console.log(Object.keys(data.items?.[0] || {})); console.log(body.includes('VentureBeat')); })"
```

## Recent Completed Work

- Rebuilt the homepage into a search-first news stream.
- Added TechCrunch ingestion and Postgres persistence.
- Added VentureBeat ingestion.
- Added story-level clustering and source-link grouping.
- Added deployment-safe ingestion scripts.
- Verified the live site and API return the merged story shape.

## Next Safe Development Ideas

- Add more sources such as The Information, Axios Pro Rata, Crunchbase News, or CNBC TechCheck where RSS/licensing allows.
- Improve dedupe with embeddings or entity extraction.
- Add company/entity extraction and sector tags.
- Add story summaries and signal scoring.
- Add a backstage admin/debug page for fetch runs and source health.
- Enable the paid Render Cron Job after billing is ready.
