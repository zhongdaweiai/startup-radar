import fs from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import Parser from "rss-parser";

const { Pool } = pg;

const DEFAULT_SOURCES = [
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
const STORY_LOOKBACK_DAYS = 7;

if (!process.env.DATABASE_URL) {
  console.log("DATABASE_URL is not set; skipping feed ingestion.");
  process.exit(0);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes("localhost")
    ? false
    : {
        rejectUnauthorized: false,
      },
});

const parser = new Parser();

function clean(value) {
  return value?.replace(/\s+/g, " ").trim() || null;
}

function dateOrNull(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function inferFeed(url, fallbackFeeds) {
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

function configuredSources() {
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

function categoriesFor(item, feed) {
  const categories = new Set([feed.category]);

  for (const category of item.categories ?? []) {
    const normalized = clean(category);
    if (normalized) {
      categories.add(normalized);
    }
  }

  return Array.from(categories);
}

function authorFor(item) {
  return clean(item.creator) ?? clean(item["dc:creator"]) ?? clean(item.author);
}

function stemTerm(value) {
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

function titleTerms(title) {
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

function storyKeyForTitle(title) {
  const terms = titleTerms(title);
  if (terms.length === 0) {
    return title.toLowerCase().replace(/\s+/g, "-").slice(0, 128);
  }

  return terms.sort().slice(0, 14).join(":");
}

function termsAreSimilar(left, right) {
  if (left.length === 0 || right.length === 0) {
    return false;
  }

  const leftSet = new Set(left);
  const rightSet = new Set(right);
  const shared = Array.from(leftSet).filter((term) => rightSet.has(term)).length;
  const smaller = Math.min(leftSet.size, rightSet.size);
  const larger = Math.max(leftSet.size, rightSet.size);

  return shared >= 2 && shared / smaller >= 0.4 && shared / larger >= 0.18;
}

async function applySchema() {
  const schemaPath = path.join(process.cwd(), "db", "schema.sql");
  const schema = await fs.readFile(schemaPath, "utf8");
  await pool.query(schema);
}

async function sourceId(source) {
  const result = await pool.query(
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

  return result.rows[0].id;
}

async function feedId(source, feed) {
  const result = await pool.query(
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
    [source, feed.name, feed.category, feed.url],
  );

  return result.rows[0].id;
}

async function similarStory(title, publishedAt) {
  const terms = titleTerms(title);
  const cutoffDate = new Date(
    (publishedAt ? new Date(publishedAt).getTime() : Date.now()) -
      STORY_LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  const result = await pool.query(
    `
      SELECT id, canonical_title, story_terms
      FROM stories
      WHERE COALESCE(published_at, first_seen_at) >= $1
      ORDER BY COALESCE(published_at, first_seen_at) DESC
      LIMIT 300
    `,
    [cutoffDate],
  );

  return result.rows.find((candidate) =>
    termsAreSimilar(candidate.story_terms ?? titleTerms(candidate.canonical_title), terms),
  );
}

async function storyId(title, primaryCategory, publishedAt) {
  const key = storyKeyForTitle(title);
  const exact = await pool.query(
    `
      SELECT id
      FROM stories
      WHERE story_key = $1
      LIMIT 1
    `,
    [key],
  );

  const existing = exact.rows[0] ?? (await similarStory(title, publishedAt));
  if (existing) {
    await pool.query(
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
      [existing.id, primaryCategory, publishedAt],
    );

    return existing.id;
  }

  const result = await pool.query(
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
    [key, title, titleTerms(title), primaryCategory, publishedAt],
  );

  return result.rows[0].id;
}

async function ingestFeed(source, sourceRecordId, feed) {
  const currentFeedId = await feedId(sourceRecordId, feed);
  const run = await pool.query(
    `
      INSERT INTO fetch_runs (source_feed_id, status, started_at)
      VALUES ($1, 'running', now())
      RETURNING id
    `,
    [currentFeedId],
  );
  const runId = run.rows[0].id;

  try {
    const parsed = await parser.parseURL(feed.url);
    let upserted = 0;

    for (const item of parsed.items) {
      const title = clean(item.title);
      const url = clean(item.link);

      if (!title || !url) {
        continue;
      }

      const categories = categoriesFor(item, feed);
      const primaryCategory = categories[0] ?? feed.category;
      const publishedAt = dateOrNull(item.isoDate ?? item.pubDate);
      const currentStoryId = await storyId(title, primaryCategory, publishedAt);
      const result = await pool.query(
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
          currentStoryId,
          sourceRecordId,
          currentFeedId,
          clean(item.guid ?? item.id),
          title,
          url,
          authorFor(item),
          primaryCategory,
          publishedAt,
          JSON.stringify({ ...item, source: source.slug, feed: feed.name }),
        ],
      );

      const articleId = result.rows[0]?.id;
      if (!articleId) {
        continue;
      }

      upserted += 1;

      for (const category of categories) {
        await pool.query(
          `
            INSERT INTO article_categories (article_id, category)
            VALUES ($1, $2)
            ON CONFLICT (article_id, category) DO NOTHING
          `,
          [articleId, category],
        );
      }
    }

    await pool.query(
      `
        UPDATE source_feeds
        SET last_fetched_at = now(), last_error = null, updated_at = now()
        WHERE id = $1
      `,
      [currentFeedId],
    );

    await pool.query(
      `
        UPDATE fetch_runs
        SET status = 'success',
            finished_at = now(),
            fetched_count = $2,
            inserted_count = $3
        WHERE id = $1
      `,
      [runId, parsed.items.length, upserted],
    );

    return { fetched: parsed.items.length, upserted };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";

    await pool.query(
      `
        UPDATE source_feeds
        SET last_error = $2, updated_at = now()
        WHERE id = $1
      `,
      [currentFeedId, message],
    );

    await pool.query(
      `
        UPDATE fetch_runs
        SET status = 'failed', finished_at = now(), error_message = $2
        WHERE id = $1
      `,
      [runId, message],
    );

    console.error(`${source.name} feed failed: ${feed.url} (${message})`);
    return { fetched: 0, upserted: 0 };
  }
}

let exitCode = 0;

try {
  await applySchema();
  let fetched = 0;
  let upserted = 0;

  for (const source of configuredSources()) {
    const currentSourceId = await sourceId(source);

    for (const feed of source.feeds) {
      const result = await ingestFeed(source, currentSourceId, feed);
      fetched += result.fetched;
      upserted += result.upserted;
    }
  }

  console.log(`Feed ingestion complete: fetched=${fetched}, upserted=${upserted}`);
} catch (error) {
  exitCode = 1;
  console.error(error instanceof Error ? (error.stack ?? error.message) : error);
} finally {
  await Promise.race([
    pool.end(),
    new Promise((resolve) => {
      setTimeout(resolve, 5000);
    }),
  ]);
  process.exit(exitCode);
}
