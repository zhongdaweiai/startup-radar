# Render Cron Ingestion

This project uses a dedicated Render Cron Job for feed ingestion. It is a paid Render resource.

## Current Configuration

- service: `startup-radar-feed-cron`
- plan: `starter`
- schedule: `*/30 * * * *`
- command: `npm run db:schema && npm run ingest:feeds`
- cadence: every 30 minutes in UTC

## Why Cron Is Useful

Render free web services can spin down when idle. When the web service is asleep, the in-process refresh timer does not run. A cron service solves this by running feed ingestion independently every 30 minutes and writing directly to the shared Postgres database.

## Service Block

This block belongs under the top-level `services:` list in `render.yaml`, after `startup-radar-live`:

```yaml
  - type: cron
    name: startup-radar-feed-cron
    runtime: node
    plan: starter
    schedule: "*/30 * * * *"
    buildCommand: npm ci
    startCommand: npm run db:schema && npm run ingest:feeds
    autoDeployTrigger: commit
    envVars:
      - key: NODE_VERSION
        value: 22.16.0
      - key: DATABASE_URL
        fromDatabase:
          name: startup-radar-db
          property: connectionString
      - key: TECHCRUNCH_FEEDS
        value: https://techcrunch.com/feed/,https://techcrunch.com/category/startups/feed/
      - key: VENTUREBEAT_FEEDS
        value: https://venturebeat.com/feed/,https://venturebeat.com/category/ai/feed/,https://venturebeat.com/category/business/feed/
```

The schedule is UTC. `*/30 * * * *` means every 30 minutes.

## Deploy Checklist

1. Run `ruby -e 'require "yaml"; YAML.load_file("render.yaml"); puts "render.yaml ok"'`.
2. Run `npm run lint` and `npm run build`.
3. Commit and push the change.
4. In the Render Blueprint, sync the latest commit and approve the new cron resource.
5. Open the cron service in Render and trigger one manual run.
6. Verify `/api/news?limit=20` returns story objects with `sources`, including `refreshStatus.lastAttemptAt`.

## Important Script Detail

`scripts/ingest-feeds.mjs` explicitly exits after closing the Postgres pool. This matters because Render Cron bills while the command is running, and a cron command must finish cleanly after ingestion.

Each feed fetch has a 30-second timeout. With the current five feeds, even a bad network run should finish in a few minutes instead of hanging indefinitely.
