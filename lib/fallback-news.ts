import type { NewsItem } from "@/app/news-stream";

export const fallbackNewsItems: NewsItem[] = [
  {
    id: "fallback-techcrunch-startups",
    sourceName: "TechCrunch",
    feedName: "Startups",
    title: "TechCrunch Startups latest news",
    url: "https://techcrunch.com/category/startups/",
    author: null,
    primaryCategory: "Startups",
    publishedAt: null,
    firstSeenAt: new Date(0).toISOString(),
  },
  {
    id: "fallback-techcrunch-latest",
    sourceName: "TechCrunch",
    feedName: "Latest",
    title: "TechCrunch latest news",
    url: "https://techcrunch.com/",
    author: null,
    primaryCategory: "Latest",
    publishedAt: null,
    firstSeenAt: new Date(0).toISOString(),
  },
];
