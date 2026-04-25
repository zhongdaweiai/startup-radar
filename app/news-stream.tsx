"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

export type NewsItem = {
  id: string;
  sourceName: string;
  feedName: string;
  title: string;
  url: string;
  author: string | null;
  primaryCategory: string | null;
  publishedAt: string | null;
  firstSeenAt: string;
};

type NewsStreamProps = {
  initialItems: NewsItem[];
  initialQuery: string;
};

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

function formatTimestamp(value: string | null) {
  if (!value) {
    return "new";
  }

  return dateFormatter.format(new Date(value));
}

function itemKey(item: NewsItem) {
  return `${item.sourceName}:${item.id}:${item.url}`;
}

export function NewsStream({ initialItems, initialQuery }: NewsStreamProps) {
  const [query, setQuery] = useState(initialQuery);
  const [items, setItems] = useState(initialItems);
  const [isLoading, setIsLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [visibleCount, setVisibleCount] = useState(30);

  const normalizedQuery = query.trim();

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setIsLoading(true);

      try {
        const params = new URLSearchParams();
        if (normalizedQuery) {
          params.set("q", normalizedQuery);
        }
        params.set("limit", "60");

        const response = await fetch(`/api/news?${params.toString()}`, {
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error("Unable to refresh news");
        }

        const payload = (await response.json()) as { items: NewsItem[] };
        setItems(payload.items);
        setVisibleCount(30);
        setLastUpdated(new Date());
      } catch (error) {
        if (!controller.signal.aborted) {
          console.error(error);
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }, 250);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [normalizedQuery]);

  useEffect(() => {
    if (normalizedQuery) {
      return;
    }

    const interval = window.setInterval(async () => {
      try {
        const response = await fetch("/api/news?limit=60");
        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as { items: NewsItem[] };
        setItems(payload.items);
        setLastUpdated(new Date());
      } catch (error) {
        console.error(error);
      }
    }, 60000);

    return () => window.clearInterval(interval);
  }, [normalizedQuery]);

  const visibleItems = useMemo(
    () => items.slice(0, visibleCount),
    [items, visibleCount],
  );

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-4 pb-16 pt-10 sm:px-6 lg:px-8">
      <header className="mx-auto flex w-full max-w-3xl flex-col items-center gap-5 pb-10 pt-8 text-center sm:pt-14">
        <p className="text-sm font-medium text-[#5f6368]">Startup Radar</p>
        <form className="w-full" onSubmit={handleSubmit}>
          <label className="sr-only" htmlFor="news-search">
            Search news
          </label>
          <div className="flex h-14 w-full items-center rounded-full border border-[#dfe1e5] bg-white px-5 shadow-sm transition focus-within:border-[#c7cacf] focus-within:shadow-md">
            <svg
              aria-hidden="true"
              className="mr-3 h-5 w-5 flex-none text-[#9aa0a6]"
              fill="none"
              viewBox="0 0 24 24"
            >
              <path
                d="m21 21-4.35-4.35m1.35-5.65a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.8"
              />
            </svg>
            <input
              autoComplete="off"
              className="h-full min-w-0 flex-1 bg-transparent text-base text-[#202124] outline-none placeholder:text-[#80868b]"
              id="news-search"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search startups, founders, markets, signals..."
              type="search"
              value={query}
            />
          </div>
        </form>
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-xs text-[#70757a]">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[#1a73e8]" />
            Live TechCrunch feed
          </span>
          <span>{items.length} links loaded</span>
          <span>Updated {dateFormatter.format(lastUpdated)}</span>
          {isLoading ? <span>Searching...</span> : null}
        </div>
      </header>

      <section className="mx-auto w-full max-w-4xl">
        <div className="border-y border-[#e8eaed] bg-white/60">
          {visibleItems.length > 0 ? (
            <ol className="divide-y divide-[#e8eaed]">
              {visibleItems.map((item) => (
                <li className="px-1 py-4 sm:px-3" key={itemKey(item)}>
                  <article className="grid gap-1.5">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#70757a]">
                      <span>{formatTimestamp(item.publishedAt)}</span>
                      <span>·</span>
                      <span>{item.sourceName}</span>
                      {item.primaryCategory ? (
                        <>
                          <span>·</span>
                          <span>{item.primaryCategory}</span>
                        </>
                      ) : null}
                      {item.author ? (
                        <>
                          <span>·</span>
                          <span>{item.author}</span>
                        </>
                      ) : null}
                    </div>
                    <a
                      className="text-[17px] font-medium leading-6 text-[#1a0dab] underline-offset-2 hover:underline"
                      href={item.url}
                      rel="noreferrer"
                      target="_blank"
                    >
                      {item.title}
                    </a>
                  </article>
                </li>
              ))}
            </ol>
          ) : (
            <div className="px-4 py-16 text-center text-sm text-[#70757a]">
              No matching links yet.
            </div>
          )}
        </div>

        {visibleCount < items.length ? (
          <div className="flex justify-center pt-6">
            <button
              className="rounded-full border border-[#dadce0] bg-white px-5 py-2 text-sm font-medium text-[#3c4043] transition hover:bg-[#f1f3f4]"
              onClick={() => setVisibleCount((count) => count + 30)}
              type="button"
            >
              Show more
            </button>
          </div>
        ) : null}
      </section>
    </div>
  );
}
