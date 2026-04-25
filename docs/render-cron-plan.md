# Planned Render Cron Ingestion

This project is ready for a dedicated Render Cron Job, but the cron service is not active yet because it is a paid Render resource.

## Current Decision

- Do not add the cron service to the active `render.yaml` until the account owner confirms billing is ready.
- Keep using the web service startup ingestion plus request/background refresh fallback.
- Preserve this plan so a future AI agent can enable the cron without rediscovering the Render configuration.

## Why Cron Is Useful

Render free web services can spin down when idle. When the web service is asleep, the in-process refresh timer does not run. A cron service solves this by running feed ingestion independently every 10 minutes and writing directly to the shared Postgres database.

## Planned Service

Add this block under the top-level `services:` list in `render.yaml`, after `startup-radar-live`:

```yaml
  - type: cron
    name: startup-radar-feed-cron
    runtime: node
    plan: starter
    schedule: "*/10 * * * *"
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

The schedule is UTC. `*/10 * * * *` means every 10 minutes.

## Enable Checklist

1. Confirm with the account owner that Render billing is ready for a paid cron service.
2. Add the planned service block to `render.yaml`.
3. Run `ruby -e 'require "yaml"; YAML.load_file("render.yaml"); puts "render.yaml ok"'`.
4. Run `npm run lint` and `npm run build`.
5. Commit and push the change.
6. In the Render Blueprint, sync the latest commit and approve the new cron resource.
7. Open the cron service in Render and trigger one manual run.
8. Verify `/api/news?limit=20` still returns story objects with `sources`, including TechCrunch and VentureBeat links.

## Important Script Detail

`scripts/ingest-feeds.mjs` explicitly exits after closing the Postgres pool. This matters because Render Cron bills while the command is running, and a cron command must finish cleanly after ingestion.
