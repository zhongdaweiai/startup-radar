import fs from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import Parser from "rss-parser";

const { Pool } = pg;

const feeds = (process.env.TECHCRUNCH_FEEDS ?? "")
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

if (feeds.length === 0) {
  feeds.push(
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
  );
}

if (!process.env.DATABASE_URL) {
  console.log("DATABASE_URL is not set; skipping TechCrunch ingestion.");
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

async function applySchema() {
  const schemaPath = path.join(process.cwd(), "db", "schema.sql");
  const schema = await fs.readFile(schemaPath, "utf8");
  await pool.query(schema);
}

async function sourceId() {
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
    ["techcrunch", "TechCrunch", "https://techcrunch.com/"],
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

async function ingestFeed(source, feed) {
  const currentFeedId = await feedId(source, feed);
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
      const result = await pool.query(
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
          source,
          currentFeedId,
          clean(item.guid ?? item.id),
          title,
          url,
          authorFor(item),
          categories[0] ?? feed.category,
          dateOrNull(item.isoDate ?? item.pubDate),
          JSON.stringify(item),
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

    throw error;
  }
}

try {
  await applySchema();
  const source = await sourceId();
  let fetched = 0;
  let upserted = 0;

  for (const feed of feeds) {
    try {
      const result = await ingestFeed(source, feed);
      fetched += result.fetched;
      upserted += result.upserted;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error(`TechCrunch feed failed: ${feed.url} (${message})`);
    }
  }

  console.log(`TechCrunch ingestion complete: fetched=${fetched}, upserted=${upserted}`);
} finally {
  await pool.end();
}
