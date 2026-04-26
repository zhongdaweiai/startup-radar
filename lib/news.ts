import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { Pool } from "pg";
import Parser from "rss-parser";
import type { NewsItem, NewsSourceLink, StorySignal } from "@/app/news-stream";
import { fallbackNewsItems } from "./fallback-news";
import { extractStorySignals as extractStorySignalsUntyped } from "./signal-extraction.mjs";
import type { ExtractedStorySignal } from "./signal-types";

type FeedDefinition = {
  name: string;
  category: string;
  url: string;
};

type SourceDefinition = {
  slug: string;
  name: string;
  homepageUrl: string;
  envName: string;
  feeds: FeedDefinition[];
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

export type NewsRefreshStatus = {
  lastAttemptAt: string | null;
  lastSuccessfulAttemptAt: string | null;
  latestStatus: "success" | "failed" | "running" | "preview" | null;
  lastError: string | null;
  configuredFeedCount: number;
  staleFeedCount: number;
  oldestFeedFetchAt: string | null;
};

type ArticlePreview = NewsSourceLink & {
  categories: string[];
};

type StoryArticleRow = {
  storyId: string | null;
  articleId: string;
  storyTitle: string | null;
  storyCategory: string | null;
  storySignals: unknown;
  heat: string | number | null;
  sourceName: string;
  feedName: string;
  title: string;
  url: string;
  author: string | null;
  primaryCategory: string | null;
  publishedAt: Date | string | null;
  firstSeenAt: Date | string;
};

type StoryCandidateRow = {
  id: number;
  canonicalTitle: string;
  storyTerms: string[] | null;
};

const FEED_REFRESH_INTERVAL_MS = 30 * 60 * 1000;
const FEED_FETCH_TIMEOUT_MS = 30 * 1000;
const STORY_LOOKBACK_DAYS = 7;

const extractSignals = extractStorySignalsUntyped as (input: {
  title: string | null | undefined;
  categories?: string[];
}) => ExtractedStorySignal[];

const DEFAULT_SOURCES: SourceDefinition[] = [
  {
    slug: "techcrunch",
    name: "TechCrunch",
    homepageUrl: "https://techcrunch.com/",
    envName: "TECHCRUNCH_FEEDS",
    feeds: [
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
    ],
  },
  {
    slug: "venturebeat",
    name: "VentureBeat",
    homepageUrl: "https://venturebeat.com/",
    envName: "VENTUREBEAT_FEEDS",
    feeds: [
      {
        name: "Latest",
        category: "Latest",
        url: "https://venturebeat.com/feed/",
      },
      {
        name: "AI",
        category: "AI",
        url: "https://venturebeat.com/category/ai/feed/",
      },
      {
        name: "Business",
        category: "Business",
        url: "https://venturebeat.com/category/business/feed/",
      },
    ],
  },
];

const STOP_WORDS = new Set([
  "a",
  "about",
  "after",
  "all",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "but",
  "by",
  "can",
  "for",
  "from",
  "has",
  "have",
  "how",
  "in",
  "into",
  "is",
  "it",
  "its",
  "new",
  "of",
  "on",
  "or",
  "over",
  "says",
  "startup",
  "startups",
  "that",
  "the",
  "their",
  "this",
  "to",
  "up",
  "what",
  "why",
  "will",
  "with",
  "your",
]);

const SHORT_TERMS = new Set(["ai", "ar", "vr", "vc", "ipo", "llm", "aws", "ios"]);

let pool: Pool | null = null;
let schemaReady = false;
let feedRefresh: Promise<IngestResult> | null = null;
let refreshTimer: ReturnType<typeof setInterval> | null = null;

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

function stableId(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 24);
}

function inferFeed(url: string, fallbackFeeds: FeedDefinition[]): FeedDefinition {
  const fallback = fallbackFeeds.find((feed) => feed.url === url);
  if (fallback) {
    return fallback;
  }

  if (url.includes("/category/startups")) {
    return { name: "Startups", category: "Startups", url };
  }

  if (url.includes("/category/business")) {
    return { name: "Business", category: "Business", url };
  }

  if (url.includes("/category/ai")) {
    return { name: "AI", category: "AI", url };
  }

  return { name: "Latest", category: "Latest", url };
}

function getSourceDefinitions() {
  return DEFAULT_SOURCES.map((source) => {
    const configuredFeeds = process.env[source.envName];

    if (!configuredFeeds) {
      return source;
    }

    const feeds = configuredFeeds
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((url) => inferFeed(url, source.feeds));

    return {
      ...source,
      feeds: feeds.length > 0 ? feeds : source.feeds,
    };
  });
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

async function parseFeedUrl(url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FEED_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: {
        "user-agent": "Startup Radar feed ingestion (+https://startup-radar-live.onrender.com/)",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Feed request failed with ${response.status}`);
    }

    const xml = await response.text();
    const parser = new Parser();
    return parser.parseString(xml);
  } finally {
    clearTimeout(timeout);
  }
}

function itemAuthor(item: RssItem) {
  return (
    normalizeText(item.creator) ??
    normalizeText(item["dc:creator"]) ??
    normalizeText(item.author)
  );
}

function stemTerm(value: string) {
  if (value.length > 5 && value.endsWith("ing")) {
    return value.slice(0, -3);
  }

  if (value.length > 4 && value.endsWith("es")) {
    return value.slice(0, -2);
  }

  if (value.length > 4 && value.endsWith("s")) {
    return value.slice(0, -1);
  }

  return value;
}

function titleTerms(title: string) {
  const normalized = title
    .toLowerCase()
    .replace(/['’]s\b/g, "")
    .replace(/[^a-z0-9]+/g, " ");

  const terms = normalized
    .split(" ")
    .map((term) => stemTerm(term.trim()))
    .filter((term) => {
      if (!term || STOP_WORDS.has(term)) {
        return false;
      }

      return term.length > 2 || SHORT_TERMS.has(term);
    });

  return Array.from(new Set(terms));
}

function storyKeyForTitle(title: string) {
  const terms = titleTerms(title);

  if (terms.length === 0) {
    return stableId(title);
  }

  return terms.sort().slice(0, 14).join(":");
}

function termsAreSimilar(left: string[], right: string[]) {
  if (left.length === 0 || right.length === 0) {
    return false;
  }

  const leftSet = new Set(left);
  const rightSet = new Set(right);
  const shared = Array.from(leftSet).filter((term) => rightSet.has(term)).length;
  const smaller = Math.min(leftSet.size, rightSet.size);
  const larger = Math.max(leftSet.size, rightSet.size);
  const containment = shared / smaller;
  const balance = shared / larger;

  return shared >= 2 && containment >= 0.4 && balance >= 0.18;
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

  const feedUrls = getSourceDefinitions().flatMap((source) =>
    source.feeds.map((feed) => feed.url),
  );

  const result = await activePool.query<{
    oldestFetchedAt: Date | string | null;
    feedCount: string;
    missingFetchCount: string;
  }>(
    `
      SELECT
        min(source_feeds.last_fetched_at) AS "oldestFetchedAt",
        count(source_feeds.id)::text AS "feedCount",
        count(source_feeds.id) FILTER (WHERE source_feeds.last_fetched_at IS NULL)::text AS "missingFetchCount"
      FROM source_feeds
      WHERE source_feeds.feed_url = ANY($1)
        AND source_feeds.active = true
    `,
    [feedUrls],
  );

  const row = result.rows[0];
  if (!row || Number(row.feedCount) < feedUrls.length) {
    return true;
  }

  if (Number(row.missingFetchCount) > 0 || !row.oldestFetchedAt) {
    return true;
  }

  const oldestFetchedAt = new Date(row.oldestFetchedAt).getTime();
  return Date.now() - oldestFetchedAt > FEED_REFRESH_INTERVAL_MS;
}

async function refreshFeedsIfDue() {
  if (await isFeedRefreshDue()) {
    await refreshFeedsOnce();
  }
}

async function refreshFeedsOnce() {
  if (!feedRefresh) {
    feedRefresh = ingestNewsFeeds().finally(() => {
      feedRefresh = null;
    });
  }

  return feedRefresh;
}

function startBackgroundRefresh() {
  if (refreshTimer || !getPool()) {
    return;
  }

  refreshTimer = setInterval(() => {
    void refreshFeedsIfDue().catch((error) => {
      console.error(error);
    });
  }, FEED_REFRESH_INTERVAL_MS);

  if (typeof refreshTimer === "object" && "unref" in refreshTimer) {
    refreshTimer.unref();
  }
}

async function fetchFeedPreview(source: SourceDefinition, feed: FeedDefinition) {
  const parsed = await parseFeedUrl(feed.url);

  return parsed.items
    .map((item) => {
      const typedItem = item as RssItem;
      const title = normalizeText(typedItem.title);
      const url = normalizeText(typedItem.link);

      if (!title || !url) {
        return null;
      }

      const categories = normalizeCategories(typedItem, feed);

      const previewItem: ArticlePreview = {
        id: stableId(url),
        sourceName: source.name,
        feedName: feed.name,
        title,
        url,
        author: itemAuthor(typedItem),
        primaryCategory: categories[0] ?? feed.category,
        publishedAt: normalizeDate(typedItem.isoDate ?? typedItem.pubDate),
        firstSeenAt: new Date().toISOString(),
        categories,
      };

      return previewItem;
    })
    .filter((item): item is ArticlePreview => Boolean(item));
}

function storyMatchesQuery(item: NewsItem, query: string) {
  const haystack = [
    item.title,
    item.primaryCategory,
    ...item.signals.flatMap((signal) => [signal.type, signal.label, signal.slug]),
    ...item.sources.flatMap((source) => [
      source.sourceName,
      source.feedName,
      source.title,
      source.author,
      source.primaryCategory,
    ]),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return haystack.includes(query.toLowerCase());
}

function previewSource(article: ArticlePreview): NewsSourceLink {
  return {
    id: article.id,
    sourceName: article.sourceName,
    feedName: article.feedName,
    title: article.title,
    url: article.url,
    author: article.author,
    primaryCategory: article.primaryCategory,
    publishedAt: article.publishedAt,
    firstSeenAt: article.firstSeenAt,
  };
}

function storySignalsFor(title: string, categories: string[]) {
  return extractSignals({ title, categories });
}

function mergeSignals(left: StorySignal[], right: ExtractedStorySignal[]) {
  const byKey = new Map<string, StorySignal>();

  for (const signal of [...left, ...right]) {
    const key = `${signal.type}:${signal.slug}`;
    const existing = byKey.get(key);

    if (!existing || signal.confidence > existing.confidence) {
      byKey.set(key, signal);
    }
  }

  return Array.from(byKey.values()).sort((leftSignal, rightSignal) => {
    const rank = { event: 0, company: 1, industry: 2 };
    const byType = rank[leftSignal.type] - rank[rightSignal.type];
    if (byType !== 0) {
      return byType;
    }

    return (
      rightSignal.confidence - leftSignal.confidence ||
      leftSignal.label.localeCompare(rightSignal.label)
    );
  });
}

function normalizeStorySignals(value: unknown): StorySignal[] {
  if (typeof value === "string") {
    try {
      return normalizeStorySignals(JSON.parse(value));
    } catch {
      return [];
    }
  }

  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }

      const record = entry as Record<string, unknown>;
      const type = record.type;
      const label = record.label;
      const slug = record.slug;

      if (
        (type !== "company" && type !== "industry" && type !== "event") ||
        typeof label !== "string" ||
        typeof slug !== "string"
      ) {
        return null;
      }

      const confidence = Number(record.confidence);

      return {
        type,
        label,
        slug,
        confidence: Number.isFinite(confidence) ? confidence : 0.5,
        evidence:
          typeof record.evidence === "string" ? record.evidence : null,
      } satisfies StorySignal;
    })
    .filter((signal): signal is StorySignal => Boolean(signal));
}

function clusterPreviewArticles(articles: ArticlePreview[]) {
  const sortedArticles = [...articles].sort((a, b) => {
    const left = new Date(a.publishedAt ?? a.firstSeenAt).getTime();
    const right = new Date(b.publishedAt ?? b.firstSeenAt).getTime();
    return right - left;
  });

  const stories: Array<NewsItem & { terms: string[] }> = [];

  for (const article of sortedArticles) {
    const terms = titleTerms(article.title);
    const existingStory = stories.find((story) =>
      termsAreSimilar(story.terms, terms),
    );

    if (existingStory) {
      if (!existingStory.sources.some((source) => source.url === article.url)) {
        existingStory.sources.push(previewSource(article));
      }
      existingStory.heat += 1;
      existingStory.signals = mergeSignals(
        existingStory.signals,
        storySignalsFor(article.title, article.categories),
      );
      continue;
    }

    stories.push({
      id: stableId(storyKeyForTitle(article.title)),
      title: article.title,
      primaryCategory: article.primaryCategory,
      publishedAt: article.publishedAt,
      firstSeenAt: article.firstSeenAt,
      heat: 1,
      signals: storySignalsFor(article.title, article.categories),
      sources: [previewSource(article)],
      terms,
    });
  }

  return stories.map((story) => ({
    id: story.id,
    title: story.title,
    primaryCategory: story.primaryCategory,
    publishedAt: story.publishedAt,
    firstSeenAt: story.firstSeenAt,
    heat: story.heat,
    signals: story.signals,
    sources: story.sources,
  }));
}

async function getLivePreview({ query, limit = 40 }: NewsQuery) {
  try {
    const sources = getSourceDefinitions();
    const feedRequests = sources.flatMap((source) =>
      source.feeds.map((feed) => fetchFeedPreview(source, feed)),
    );
    const results = await Promise.allSettled(feedRequests);
    const articles = results
      .flatMap((result) => (result.status === "fulfilled" ? result.value : []))
      .filter((item, index, all) => {
        const firstIndex = all.findIndex((candidate) => candidate.url === item.url);
        return firstIndex === index;
      });

    const normalizedQuery = normalizeText(query);
    const stories = clusterPreviewArticles(articles);
    const filtered = normalizedQuery
      ? stories.filter((item) => storyMatchesQuery(item, normalizedQuery))
      : stories;

    return filtered.slice(0, limit);
  } catch (error) {
    console.error(error);
    return fallbackNewsItems;
  }
}

async function getSourceId(source: SourceDefinition) {
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
    [source.slug, source.name, source.homepageUrl],
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

async function findSimilarStory(
  activePool: Pool,
  title: string,
  publishedAt: string | null,
) {
  const terms = titleTerms(title);
  const cutoffDate = new Date(
    (publishedAt ? new Date(publishedAt).getTime() : Date.now()) -
      STORY_LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  const candidates = await activePool.query<StoryCandidateRow>(
    `
      SELECT
        id,
        canonical_title AS "canonicalTitle",
        story_terms AS "storyTerms"
      FROM stories
      WHERE COALESCE(published_at, first_seen_at) >= $1
      ORDER BY COALESCE(published_at, first_seen_at) DESC
      LIMIT 300
    `,
    [cutoffDate],
  );

  return candidates.rows.find((candidate) =>
    termsAreSimilar(candidate.storyTerms ?? titleTerms(candidate.canonicalTitle), terms),
  );
}

async function upsertStory(
  activePool: Pool,
  title: string,
  primaryCategory: string | null,
  publishedAt: string | null,
) {
  const storyKey = storyKeyForTitle(title);
  const exact = await activePool.query<{ id: number }>(
    `
      SELECT id
      FROM stories
      WHERE story_key = $1
      LIMIT 1
    `,
    [storyKey],
  );

  const existingStory = exact.rows[0] ?? (await findSimilarStory(activePool, title, publishedAt));

  if (existingStory) {
    await activePool.query(
      `
        UPDATE stories
        SET
          primary_category = COALESCE(stories.primary_category, $2),
          published_at = CASE
            WHEN $3::timestamptz IS NULL THEN stories.published_at
            ELSE GREATEST(COALESCE(stories.published_at, $3::timestamptz), $3::timestamptz)
          END,
          updated_at = now()
        WHERE id = $1
      `,
      [existingStory.id, primaryCategory, publishedAt],
    );

    return existingStory.id;
  }

  const result = await activePool.query<{ id: number }>(
    `
      INSERT INTO stories (
        story_key,
        canonical_title,
        story_terms,
        primary_category,
        published_at
      )
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (story_key)
      DO UPDATE SET
        primary_category = COALESCE(stories.primary_category, EXCLUDED.primary_category),
        published_at = COALESCE(GREATEST(stories.published_at, EXCLUDED.published_at), stories.published_at, EXCLUDED.published_at),
        updated_at = now()
      RETURNING id
    `,
    [storyKey, title, titleTerms(title), primaryCategory, publishedAt],
  );

  return result.rows[0]?.id ?? null;
}

function mergeExtractedSignalRows(
  rows: Array<{ title: string; categories: string[] | null }>,
) {
  let signals: StorySignal[] = [];

  for (const row of rows) {
    signals = mergeSignals(signals, storySignalsFor(row.title, row.categories ?? []));
  }

  return signals;
}

async function replaceStorySignals(
  activePool: Pool,
  storyId: number | null,
  signals: StorySignal[],
) {
  if (!storyId) {
    return;
  }

  const client = await activePool.connect();

  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM story_signals WHERE story_id = $1", [storyId]);

    for (const signal of signals) {
      await client.query(
        `
          INSERT INTO story_signals (
            story_id,
            signal_type,
            slug,
            label,
            confidence,
            evidence
          )
          VALUES ($1, $2, $3, $4, $5, $6)
        `,
        [
          storyId,
          signal.type,
          signal.slug,
          signal.label,
          signal.confidence,
          signal.evidence,
        ],
      );
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function rebuildStorySignals(activePool: Pool, storyIds: Set<number>) {
  for (const storyId of storyIds) {
    const result = await activePool.query<{
      title: string;
      categories: string[] | null;
    }>(
      `
        SELECT
          articles.title,
          COALESCE(
            array_remove(array_agg(DISTINCT article_categories.category), NULL),
            ARRAY[]::text[]
          ) AS categories
        FROM articles
        LEFT JOIN article_categories
          ON article_categories.article_id = articles.id
        WHERE articles.story_id = $1
        GROUP BY articles.id
      `,
      [storyId],
    );

    await replaceStorySignals(
      activePool,
      storyId,
      mergeExtractedSignalRows(result.rows),
    );
  }
}

async function recordFeedRun(
  activePool: Pool,
  feedId: number,
  callback: (runId: number | null) => Promise<IngestResult>,
) {
  const run = await activePool.query<{ id: number }>(
    `
      INSERT INTO fetch_runs (source_feed_id, status, started_at)
      VALUES ($1, 'running', now())
      RETURNING id
    `,
    [feedId],
  );

  return callback(run.rows[0]?.id ?? null);
}

async function ingestFeed(
  activePool: Pool,
  sourceId: number,
  source: SourceDefinition,
  feed: FeedDefinition,
  touchedStoryIds: Set<number>,
) {
  const feedId = await upsertFeed(sourceId, feed);
  if (!feedId) {
    return { fetched: 0, insertedOrUpdated: 0 };
  }

  return recordFeedRun(activePool, feedId, async (runId) => {
    let feedInsertedOrUpdated = 0;

    try {
      const parsed = await parseFeedUrl(feed.url);

      for (const item of parsed.items as RssItem[]) {
        const title = normalizeText(item.title);
        const url = normalizeText(item.link);

        if (!title || !url) {
          continue;
        }

        const categories = normalizeCategories(item, feed);
        const primaryCategory = categories[0] ?? feed.category;
        const publishedAt = normalizeDate(item.isoDate ?? item.pubDate);
        const storyId = await upsertStory(
          activePool,
          title,
          primaryCategory,
          publishedAt,
        );

        const result = await activePool.query<{ id: number }>(
          `
            INSERT INTO articles (
              story_id,
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
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            ON CONFLICT (url)
            DO UPDATE SET
              story_id = COALESCE(EXCLUDED.story_id, articles.story_id),
              source_id = EXCLUDED.source_id,
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
            storyId,
            sourceId,
            feedId,
            normalizeText(item.guid ?? item.id),
            title,
            url,
            itemAuthor(item),
            primaryCategory,
            publishedAt,
            JSON.stringify({ ...item, source: source.slug, feed: feed.name }),
          ],
        );

        const articleId = result.rows[0]?.id;
        if (!articleId) {
          continue;
        }

        if (storyId) {
          touchedStoryIds.add(storyId);
        }

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

      return {
        fetched: parsed.items.length,
        insertedOrUpdated: feedInsertedOrUpdated,
      };
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

      console.error(`${source.name} feed failed: ${feed.url} (${message})`);
      return { fetched: 0, insertedOrUpdated: 0 };
    }
  });
}

export async function ingestNewsFeeds() {
  const activePool = getPool();

  if (!activePool) {
    return { fetched: 0, insertedOrUpdated: 0 } satisfies IngestResult;
  }

  await ensureSchema();

  let fetched = 0;
  let insertedOrUpdated = 0;
  const touchedStoryIds = new Set<number>();

  for (const source of getSourceDefinitions()) {
    const sourceId = await getSourceId(source);
    if (!sourceId) {
      continue;
    }

    for (const feed of source.feeds) {
      const result = await ingestFeed(
        activePool,
        sourceId,
        source,
        feed,
        touchedStoryIds,
      );
      fetched += result.fetched;
      insertedOrUpdated += result.insertedOrUpdated;
    }
  }

  await rebuildStorySignals(activePool, touchedStoryIds);

  return { fetched, insertedOrUpdated } satisfies IngestResult;
}

export async function ingestTechCrunchFeeds() {
  return ingestNewsFeeds();
}

export async function getNewsRefreshStatus(): Promise<NewsRefreshStatus> {
  const activePool = getPool();
  const configuredFeedCount = getSourceDefinitions().reduce(
    (count, source) => count + source.feeds.length,
    0,
  );

  if (!activePool) {
    return {
      lastAttemptAt: new Date().toISOString(),
      lastSuccessfulAttemptAt: new Date().toISOString(),
      latestStatus: "preview",
      lastError: null,
      configuredFeedCount,
      staleFeedCount: 0,
      oldestFeedFetchAt: null,
    };
  }

  await ensureSchema();

  const feedUrls = getSourceDefinitions().flatMap((source) =>
    source.feeds.map((feed) => feed.url),
  );

  const [runResult, feedResult] = await Promise.all([
    activePool.query<{
      lastAttemptAt: Date | string | null;
      lastSuccessfulAttemptAt: Date | string | null;
      latestStatus: "success" | "failed" | "running" | null;
      lastError: string | null;
    }>(
      `
        WITH latest_run AS (
          SELECT status, error_message
          FROM fetch_runs
          ORDER BY started_at DESC
          LIMIT 1
        )
        SELECT
          max(fetch_runs.finished_at) AS "lastAttemptAt",
          max(fetch_runs.finished_at) FILTER (WHERE fetch_runs.status = 'success') AS "lastSuccessfulAttemptAt",
          (SELECT latest_run.status FROM latest_run) AS "latestStatus",
          (SELECT latest_run.error_message FROM latest_run) AS "lastError"
        FROM fetch_runs
      `,
    ),
    activePool.query<{
      staleFeedCount: string;
      oldestFeedFetchAt: Date | string | null;
    }>(
      `
        SELECT
          count(*) FILTER (
            WHERE source_feeds.last_fetched_at IS NULL
              OR source_feeds.last_fetched_at < now() - interval '30 minutes'
          )::text AS "staleFeedCount",
          min(source_feeds.last_fetched_at) AS "oldestFeedFetchAt"
        FROM source_feeds
        WHERE source_feeds.feed_url = ANY($1)
          AND source_feeds.active = true
      `,
      [feedUrls],
    ),
  ]);

  const run = runResult.rows[0];
  const feeds = feedResult.rows[0];

  return {
    lastAttemptAt: iso(run?.lastAttemptAt ?? null),
    lastSuccessfulAttemptAt: iso(run?.lastSuccessfulAttemptAt ?? null),
    latestStatus: run?.latestStatus ?? null,
    lastError: run?.lastError ?? null,
    configuredFeedCount,
    staleFeedCount: Number(feeds?.staleFeedCount ?? 0),
    oldestFeedFetchAt: iso(feeds?.oldestFeedFetchAt ?? null),
  };
}

function iso(value: Date | string | null) {
  return value ? new Date(value).toISOString() : null;
}

function rowTime(row: StoryArticleRow) {
  return new Date(row.publishedAt ?? row.firstSeenAt).getTime();
}

function serializeStoryRows(rows: StoryArticleRow[]) {
  const stories = new Map<string, NewsItem>();

  for (const row of rows) {
    const storyId = row.storyId ? `story-${row.storyId}` : `article-${row.articleId}`;
    const source: NewsSourceLink = {
      id: row.articleId,
      sourceName: row.sourceName,
      feedName: row.feedName,
      title: row.title,
      url: row.url,
      author: row.author,
      primaryCategory: row.primaryCategory,
      publishedAt: iso(row.publishedAt),
      firstSeenAt: new Date(row.firstSeenAt).toISOString(),
    };

    const existing = stories.get(storyId);
    if (!existing) {
      stories.set(storyId, {
        id: storyId,
        title: row.storyTitle ?? row.title,
        primaryCategory: row.storyCategory ?? row.primaryCategory,
        publishedAt: iso(row.publishedAt),
        firstSeenAt: new Date(row.firstSeenAt).toISOString(),
        heat: Number(row.heat ?? 1),
        signals: normalizeStorySignals(row.storySignals),
        sources: [source],
      });
      continue;
    }

    existing.heat = Math.max(existing.heat, Number(row.heat ?? 1));
    existing.signals = mergeSignals(existing.signals, normalizeStorySignals(row.storySignals));

    if (!existing.sources.some((candidate) => candidate.url === source.url)) {
      existing.sources.push(source);
    }

    const currentTime = existing.publishedAt
      ? new Date(existing.publishedAt).getTime()
      : 0;
    const nextTime = rowTime(row);
    if (nextTime > currentTime) {
      existing.publishedAt = iso(row.publishedAt);
    }
  }

  return Array.from(stories.values()).sort((a, b) => {
    const left = new Date(a.publishedAt ?? a.firstSeenAt).getTime();
    const right = new Date(b.publishedAt ?? b.firstSeenAt).getTime();
    return right - left;
  });
}

async function queryStoryRows(
  activePool: Pool,
  normalizedQuery: string | null,
  limit: number,
) {
  const rowLimit = Math.max(limit * 8, 80);
  const params = normalizedQuery
    ? [`%${normalizedQuery}%`, rowLimit]
    : [rowLimit];

  const sql = normalizedQuery
    ? `
        SELECT
          stories.id::text AS "storyId",
          articles.id::text AS "articleId",
          stories.canonical_title AS "storyTitle",
          stories.primary_category AS "storyCategory",
          COALESCE(
            (
              SELECT jsonb_agg(
                jsonb_build_object(
                  'type', story_signals.signal_type,
                  'label', story_signals.label,
                  'slug', story_signals.slug,
                  'confidence', story_signals.confidence::float,
                  'evidence', story_signals.evidence
                )
                ORDER BY
                  CASE story_signals.signal_type
                    WHEN 'event' THEN 1
                    WHEN 'company' THEN 2
                    ELSE 3
                  END,
                  story_signals.confidence DESC,
                  story_signals.label
              )
              FROM story_signals
              WHERE story_signals.story_id = stories.id
            ),
            '[]'::jsonb
          ) AS "storySignals",
          COALESCE(
            (
              SELECT count(*)::text
              FROM articles AS story_articles
              WHERE story_articles.story_id = stories.id
            ),
            '1'
          ) AS "heat",
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
        LEFT JOIN stories ON stories.id = articles.story_id
        WHERE
          COALESCE(stories.canonical_title, '') ILIKE $1
          OR articles.title ILIKE $1
          OR sources.name ILIKE $1
          OR COALESCE(articles.author, '') ILIKE $1
          OR COALESCE(articles.primary_category, '') ILIKE $1
          OR EXISTS (
            SELECT 1
            FROM story_signals
            WHERE story_signals.story_id = stories.id
              AND (
                story_signals.label ILIKE $1
                OR story_signals.signal_type ILIKE $1
              )
          )
        ORDER BY
          COALESCE(stories.published_at, articles.published_at, articles.first_seen_at) DESC,
          COALESCE(articles.published_at, articles.first_seen_at) DESC
        LIMIT $2
      `
    : `
        SELECT
          stories.id::text AS "storyId",
          articles.id::text AS "articleId",
          stories.canonical_title AS "storyTitle",
          stories.primary_category AS "storyCategory",
          COALESCE(
            (
              SELECT jsonb_agg(
                jsonb_build_object(
                  'type', story_signals.signal_type,
                  'label', story_signals.label,
                  'slug', story_signals.slug,
                  'confidence', story_signals.confidence::float,
                  'evidence', story_signals.evidence
                )
                ORDER BY
                  CASE story_signals.signal_type
                    WHEN 'event' THEN 1
                    WHEN 'company' THEN 2
                    ELSE 3
                  END,
                  story_signals.confidence DESC,
                  story_signals.label
              )
              FROM story_signals
              WHERE story_signals.story_id = stories.id
            ),
            '[]'::jsonb
          ) AS "storySignals",
          COALESCE(
            (
              SELECT count(*)::text
              FROM articles AS story_articles
              WHERE story_articles.story_id = stories.id
            ),
            '1'
          ) AS "heat",
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
        LEFT JOIN stories ON stories.id = articles.story_id
        ORDER BY
          COALESCE(stories.published_at, articles.published_at, articles.first_seen_at) DESC,
          COALESCE(articles.published_at, articles.first_seen_at) DESC
        LIMIT $1
      `;

  return activePool.query<StoryArticleRow>(sql, params);
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
  startBackgroundRefresh();

  if (await isFeedRefreshDue()) {
    await refreshFeedsOnce();
  }

  const result = await queryStoryRows(activePool, normalizedQuery, limit);
  const stories = serializeStoryRows(result.rows).slice(0, limit);

  if (stories.length > 0) {
    return stories;
  }

  await ingestNewsFeeds();
  const refreshedResult = await queryStoryRows(activePool, normalizedQuery, limit);
  const refreshedStories = serializeStoryRows(refreshedResult.rows).slice(0, limit);

  if (refreshedStories.length > 0) {
    return refreshedStories;
  }

  const preview = await getLivePreview({ query: normalizedQuery ?? "", limit });

  if (preview.length > 0) {
    return preview;
  }

  return normalizedQuery ? [] : fallbackNewsItems;
}
