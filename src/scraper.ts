import Parser from "rss-parser";
import type { RSSSource, RawItem } from "./types.js";

const parser = new Parser({
  headers: {
    "User-Agent": "modelsentry/1.0",
  },
  timeout: 30_000,
});

export async function fetchFeed(source: RSSSource): Promise<RawItem[]> {
  try {
    const feed = await parser.parseURL(source.url);
    return feed.items.map((item) => {
      const raw: RawItem = {
        title: item.title ?? "",
        link: item.link ?? "",
        published: item.isoDate ?? item.pubDate ?? "",
        source: source.name,
      };
      if (item.contentSnippet !== undefined) {
        raw.content = item.contentSnippet;
      }
      return raw;
    });
  } catch {
    return [];
  }
}

async function fetchFeedWithHealth(
  source: RSSSource
): Promise<{ source: RSSSource; items: RawItem[]; success: boolean }> {
  try {
    const feed = await parser.parseURL(source.url);
    const items = feed.items.map((item) => {
      const raw: RawItem = {
        title: item.title ?? "",
        link: item.link ?? "",
        published: item.isoDate ?? item.pubDate ?? "",
        source: source.name,
      };
      if (item.contentSnippet !== undefined) {
        raw.content = item.contentSnippet;
      }
      return raw;
    });
    return { source, items, success: true };
  } catch {
    return { source, items: [], success: false };
  }
}

export async function fetchAllFeeds(
  sources: RSSSource[]
): Promise<{ items: RawItem[]; health: Record<string, boolean> }> {
  const results = await Promise.allSettled(
    sources.map((source) => fetchFeedWithHealth(source))
  );

  const items: RawItem[] = [];
  const health: Record<string, boolean> = {};

  for (let i = 0; i < sources.length; i++) {
    const result = results[i];
    const source = sources[i];

    if (result.status === "fulfilled") {
      items.push(...result.value.items);
      health[source.name] = result.value.success;
    } else {
      health[source.name] = false;
    }
  }

  return { items, health };
}
