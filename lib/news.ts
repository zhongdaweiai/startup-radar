import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { Pool } from "pg";
import Parser from "rss-parser";
import type { NewsItem } from "@/app/news-stream";
import { fallbackNewsItems } from "./fallback-news";

type FeedDefinition = {
  name: string;
  category: string;
  url: string;
};

type RssCustomFields = {
  creator?: string;
  "dc:creator"?: string;
  author?: string;
  id?: string;
};

type RssItem = Parser.Item & RssCustomFields;

type NewsQuery = {
  query?: string;
  limit?: number;
};

type IngestResult = {
  fetched: number;
  insertedOrUpdated: number;
};

type NewsRow = NewsItem;

const FEED_REFRESH_INTERVAL_MS = 10 * 60 * 1000;

const DEFAULT_FEEDS: FeedDefinition[] = [
  {
    name: "Latest",
    category: "Latest",
    url: "https://techcrunch.com/feed/",
  },
  {
    name: "Startups",
    category: "Startups",
    url: "https://techcrunch.com/category/startups/feed/",
  },
];

let pool: Pool | null = null;
let schemaReady = false;
let feedRefresh: Promise<IngestResult> | null = null;

function getPool() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    return null;
  }

  if (!pool) {
    pool = new Pool({
      connectionString: databaseUrl,
      max: 5,
      ssl: databaseUrl.includes("localhost")
        ? false
        : {
            rejectUnauthorized: false,
          },
    });
  }

  return pool;
}

function getFeedDefinitions() {
  const configuredFeeds = process.env.TECHCRUNCH_FEEDS;

  if (!configuredFeeds) {
    return DEFAULT_FEEDS;
  }

  return configuredFeeds
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((url) => {
      const isStartups = url.includes("/category/startups");

      return {
        name: isStartups ? "Startups" : "Latest",
        category: isStartups ? "Startups" : "Latest",
        url,
      };
    });
}

async function ensureSchema() {
  const activePool = getPool();

  if (!activePool || schemaReady) {
    return;
  }

  const schemaPath = path.join(process.cwd(), "db", "schema.sql");
  const schema = await fs.readFile(schemaPath, "utf8");
  await activePool.query(schema);
  schemaReady = true;
}

async function isFeedRefreshDue() {
  const activePool = getPool();

  if (!activePool) {
    return false;
  }

  const result = await activePool.query<{
    lastFetchedAt: Date | string | null;
    feedCount: string;
  }>(
    `
      SELECT
        max(source_feeds.last_fetched_at) AS "lastFetchedAt",
        count(source_feeds.id)::text AS "feedCount"
      FROM sources
      LEFT JOIN source_feeds ON source_feeds.source_id = sources.id
      WHERE sources.slug = 'techcrunch'
    `,
  );

  const row = result.rows[0];
  if (!row || row.feedCount === "0" || !row.lastFetchedAt) {
    return true;
  }

  const lastFetchedAt = new Date(row.lastFetchedAt).getTime();
  return Date.now() - lastFetchedAt > FEED_REFRESH_INTERVAL_MS;
}

async function refreshFeedsOnce() {
  if (!feedRefresh) {
    feedRefresh = ingestTechCrunchFeeds().finally(() => {
      feedRefresh = null;
    });
  }

  return feedRefresh;
}

function normalizeText(value: string | undefined | null) {
  if (!value) {
    return null;
  }

  return value.replace(/\s+/g, " ").trim() || null;
}

function normalizeDate(value: string | undefined | null) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizeCategories(item: RssItem, feed: FeedDefinition) {
  const categories = new Set<string>([feed.category]);

  for (const category of item.categories ?? []) {
    const normalized = normalizeText(category);
    if (normalized) {
      categories.add(normalized);
    }
  }

  return Array.from(categories);
}

function itemAuthor(item: RssItem) {
  return (
    normalizeText(item.creator) ??
    normalizeText(item["dc:creator"]) ??
    normalizeText(item.author)
  );
}

function stableArticleId(url: string) {
  return createHash("sha256").update(url).digest("hex").slice(0, 24);
}

async function fetchFeedPreview(feed: FeedDefinition) {
  const parser = new Parser();
  const parsed = await parser.parseURL(feed.url);

  return parsed.items
    .map((item) => {
      const typedItem = item as RssItem;
      const title = normalizeText(typedItem.title);
      const url = normalizeText(typedItem.link);

      if (!title || !url) {
        return null;
      }

      const categories = normalizeCategories(typedItem, feed);

      const previewItem: NewsItem = {
        id: stableArticleId(url),
        sourceName: "TechCrunch",
        feedName: feed.name,
        title,
        url,
        author: itemAuthor(typedItem),
        primaryCategory: categories[0] ?? feed.category,
        publishedAt: normalizeDate(typedItem.isoDate ?? typedItem.pubDate),
        firstSeenAt: new Date().toISOString(),
      };

      return previewItem;
    })
    .filter((item): item is NewsItem => Boolean(item));
}

async function getLivePreview({ query, limit = 40 }: NewsQuery) {
  try {
    const feeds = getFeedDefinitions();
    const results = await Promise.allSettled(feeds.map(fetchFeedPreview));
    const merged = results
      .flatMap((result) => (result.status === "fulfilled" ? result.value : []))
      .filter((item, index, all) => {
        const firstIndex = all.findIndex((candidate) => candidate.url === item.url);
        return firstIndex === index;
      })
      .sort((a, b) => {
        const left = new Date(a.publishedAt ?? a.firstSeenAt).getTime();
        const right = new Date(b.publishedAt ?? b.firstSeenAt).getTime();
        return right - left;
      });

    const normalizedQuery = normalizeText(query)?.toLowerCase();
    const filtered = normalizedQuery
      ? merged.filter((item) =>
          [item.title, item.author, item.primaryCategory]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(normalizedQuery),
        )
      : merged;

    return filtered.slice(0, limit);
  } catch (error) {
    console.error(error);
    return fallbackNewsItems;
  }
}

async function getSourceId() {
  const activePool = getPool();

  if (!activePool) {
    return null;
  }

  const result = await activePool.query<{ id: number }>(
    `
      INSERT INTO sources (slug, name, homepage_url)
      VALUES ($1, $2, $3)
      ON CONFLICT (slug)
      DO UPDATE SET
        name = EXCLUDED.name,
        homepage_url = EXCLUDED.homepage_url,
        updated_at = now()
      RETURNING id
    `,
    ["techcrunch", "TechCrunch", "https://techcrunch.com/"],
  );

  return result.rows[0]?.id ?? null;
}

async function upsertFeed(sourceId: number, feed: FeedDefinition) {
  const activePool = getPool();

  if (!activePool) {
    return null;
  }

  const result = await activePool.query<{ id: number }>(
    `
      INSERT INTO source_feeds (source_id, name, category, feed_url)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (source_id, feed_url)
      DO UPDATE SET
        name = EXCLUDED.name,
        category = EXCLUDED.category,
        active = true,
        updated_at = now()
      RETURNING id
    `,
    [sourceId, feed.name, feed.category, feed.url],
  );

  return result.rows[0]?.id ?? null;
}

export async function ingestTechCrunchFeeds() {
  const activePool = getPool();

  if (!activePool) {
    return { fetched: 0, insertedOrUpdated: 0 } satisfies IngestResult;
  }

  await ensureSchema();

  const sourceId = await getSourceId();
  if (!sourceId) {
    return { fetched: 0, insertedOrUpdated: 0 } satisfies IngestResult;
  }

  const parser = new Parser();
  let fetched = 0;
  let insertedOrUpdated = 0;

  for (const feed of getFeedDefinitions()) {
    const feedId = await upsertFeed(sourceId, feed);
    if (!feedId) {
      continue;
    }

    const run = await activePool.query<{ id: number }>(
      `
        INSERT INTO fetch_runs (source_feed_id, status, started_at)
        VALUES ($1, 'running', now())
        RETURNING id
      `,
      [feedId],
    );
    const runId = run.rows[0]?.id;
    let feedInsertedOrUpdated = 0;

    try {
      const parsed = await parser.parseURL(feed.url);
      fetched += parsed.items.length;

      for (const item of parsed.items as RssItem[]) {
        const title = normalizeText(item.title);
        const url = normalizeText(item.link);

        if (!title || !url) {
          continue;
        }

        const categories = normalizeCategories(item, feed);
        const publishedAt = normalizeDate(item.isoDate ?? item.pubDate);
        const result = await activePool.query<{ id: number }>(
          `
            INSERT INTO articles (
              source_id,
              source_feed_id,
              guid,
              title,
              url,
              author,
              primary_category,
              published_at,
              raw_payload
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            ON CONFLICT (url)
            DO UPDATE SET
              source_feed_id = EXCLUDED.source_feed_id,
              guid = COALESCE(EXCLUDED.guid, articles.guid),
              title = EXCLUDED.title,
              author = EXCLUDED.author,
              primary_category = EXCLUDED.primary_category,
              published_at = COALESCE(EXCLUDED.published_at, articles.published_at),
              raw_payload = EXCLUDED.raw_payload,
              updated_at = now()
            RETURNING id
          `,
          [
            sourceId,
            feedId,
            normalizeText(item.guid ?? item.id),
            title,
            url,
            itemAuthor(item),
            categories[0] ?? feed.category,
            publishedAt,
            JSON.stringify(item),
          ],
        );

        const articleId = result.rows[0]?.id;
        if (!articleId) {
          continue;
        }

        insertedOrUpdated += 1;
        feedInsertedOrUpdated += 1;

        for (const category of categories) {
          await activePool.query(
            `
              INSERT INTO article_categories (article_id, category)
              VALUES ($1, $2)
              ON CONFLICT (article_id, category) DO NOTHING
            `,
            [articleId, category],
          );
        }
      }

      await activePool.query(
        `
          UPDATE source_feeds
          SET last_fetched_at = now(), last_error = null, updated_at = now()
          WHERE id = $1
        `,
        [feedId],
      );

      if (runId) {
        await activePool.query(
          `
            UPDATE fetch_runs
            SET status = 'success',
                finished_at = now(),
                fetched_count = $2,
                inserted_count = $3
            WHERE id = $1
          `,
          [runId, parsed.items.length, feedInsertedOrUpdated],
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";

      await activePool.query(
        `
          UPDATE source_feeds
          SET last_error = $2, updated_at = now()
          WHERE id = $1
        `,
        [feedId, message],
      );

      if (runId) {
        await activePool.query(
          `
            UPDATE fetch_runs
            SET status = 'failed', finished_at = now(), error_message = $2
            WHERE id = $1
          `,
          [runId, message],
        );
      }
    }
  }

  return { fetched, insertedOrUpdated } satisfies IngestResult;
}

function serializeNewsRows(rows: NewsRow[]) {
  return rows.map((item) => ({
    ...item,
    publishedAt: item.publishedAt
      ? new Date(item.publishedAt).toISOString()
      : null,
    firstSeenAt: new Date(item.firstSeenAt).toISOString(),
  }));
}

export async function getNewsItems({
  query = "",
  limit = 40,
}: NewsQuery = {}): Promise<NewsItem[]> {
  const activePool = getPool();
  const normalizedQuery = normalizeText(query);

  if (!activePool) {
    return getLivePreview({ query: normalizedQuery ?? "", limit });
  }

  await ensureSchema();

  if (await isFeedRefreshDue()) {
    await refreshFeedsOnce();
  }

  const params = normalizedQuery
    ? [`%${normalizedQuery}%`, limit]
    : [limit];

  const sql = normalizedQuery
    ? `
        SELECT
          articles.id::text AS id,
          sources.name AS "sourceName",
          source_feeds.name AS "feedName",
          articles.title,
          articles.url,
          articles.author,
          articles.primary_category AS "primaryCategory",
          articles.published_at AS "publishedAt",
          articles.first_seen_at AS "firstSeenAt"
        FROM articles
        INNER JOIN sources ON sources.id = articles.source_id
        INNER JOIN source_feeds ON source_feeds.id = articles.source_feed_id
        WHERE
          articles.title ILIKE $1
          OR COALESCE(articles.author, '') ILIKE $1
          OR COALESCE(articles.primary_category, '') ILIKE $1
        ORDER BY COALESCE(articles.published_at, articles.first_seen_at) DESC
        LIMIT $2
      `
    : `
        SELECT
          articles.id::text AS id,
          sources.name AS "sourceName",
          source_feeds.name AS "feedName",
          articles.title,
          articles.url,
          articles.author,
          articles.primary_category AS "primaryCategory",
          articles.published_at AS "publishedAt",
          articles.first_seen_at AS "firstSeenAt"
        FROM articles
        INNER JOIN sources ON sources.id = articles.source_id
        INNER JOIN source_feeds ON source_feeds.id = articles.source_feed_id
        ORDER BY COALESCE(articles.published_at, articles.first_seen_at) DESC
        LIMIT $1
      `;

  const result = await activePool.query<NewsRow>(sql, params);

  if (result.rows.length > 0) {
    return serializeNewsRows(result.rows);
  }

  await ingestTechCrunchFeeds();
  const refreshedResult = await activePool.query<NewsRow>(sql, params);

  if (refreshedResult.rows.length > 0) {
    return serializeNewsRows(refreshedResult.rows);
  }

  const preview = await getLivePreview({ query: normalizedQuery ?? "", limit });

  if (preview.length > 0) {
    return preview;
  }

  return normalizedQuery ? [] : fallbackNewsItems;
}
