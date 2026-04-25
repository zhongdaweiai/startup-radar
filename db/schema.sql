CREATE TABLE IF NOT EXISTS sources (
  id BIGSERIAL PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  homepage_url TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS source_feeds (
  id BIGSERIAL PRIMARY KEY,
  source_id BIGINT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  feed_url TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  last_fetched_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source_id, feed_url)
);

CREATE TABLE IF NOT EXISTS stories (
  id BIGSERIAL PRIMARY KEY,
  story_key TEXT NOT NULL UNIQUE,
  canonical_title TEXT NOT NULL,
  story_terms TEXT[] NOT NULL DEFAULT '{}',
  primary_category TEXT,
  published_at TIMESTAMPTZ,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS articles (
  id BIGSERIAL PRIMARY KEY,
  story_id BIGINT REFERENCES stories(id) ON DELETE SET NULL,
  source_id BIGINT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  source_feed_id BIGINT NOT NULL REFERENCES source_feeds(id) ON DELETE CASCADE,
  guid TEXT,
  title TEXT NOT NULL,
  url TEXT NOT NULL UNIQUE,
  author TEXT,
  primary_category TEXT,
  published_at TIMESTAMPTZ,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  raw_payload JSONB
);

ALTER TABLE articles
  ADD COLUMN IF NOT EXISTS story_id BIGINT REFERENCES stories(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS article_categories (
  article_id BIGINT NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (article_id, category)
);

CREATE TABLE IF NOT EXISTS fetch_runs (
  id BIGSERIAL PRIMARY KEY,
  source_feed_id BIGINT NOT NULL REFERENCES source_feeds(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('running', 'success', 'failed')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  fetched_count INTEGER NOT NULL DEFAULT 0,
  inserted_count INTEGER NOT NULL DEFAULT 0,
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS articles_published_at_idx
  ON articles (published_at DESC NULLS LAST, first_seen_at DESC);

CREATE INDEX IF NOT EXISTS articles_story_id_idx
  ON articles (story_id);

CREATE INDEX IF NOT EXISTS stories_published_at_idx
  ON stories (published_at DESC NULLS LAST, first_seen_at DESC);

CREATE INDEX IF NOT EXISTS stories_terms_idx
  ON stories USING GIN (story_terms);

CREATE INDEX IF NOT EXISTS articles_primary_category_idx
  ON articles (primary_category);

CREATE INDEX IF NOT EXISTS article_categories_category_idx
  ON article_categories (category);

CREATE INDEX IF NOT EXISTS articles_title_search_idx
  ON articles USING GIN (to_tsvector('english', title));
