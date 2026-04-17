import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import type { ProcessedItem, StatsFile, WeekBucket, ProviderStat } from "./types.js";

export const PROVIDER_MAP: Record<string, string[]> = {
  "Anthropic": ["Anthropic", "Claude"],
  "Google":    ["Google", "Gemini"],
  "OpenAI":    ["OpenAI", "GPT", "ChatGPT", "o1", "o3", "o4", "Codex"],
  "xAI":       ["xAI", "X.ai", "Grok"],
  "Meta":      ["Meta", "Llama"],
};

export function resolveProvider(entities: string[]): string {
  for (const entity of entities) {
    const lower = entity.toLowerCase();
    for (const [provider, keywords] of Object.entries(PROVIDER_MAP)) {
      for (const keyword of keywords) {
        if (lower.startsWith(keyword.toLowerCase())) {
          return provider;
        }
      }
    }
  }
  return "Other";
}

function readArchive(archiveDir: string): ProcessedItem[] {
  let files: string[];
  try {
    files = readdirSync(archiveDir).filter(f => f.endsWith(".ndjson"));
  } catch {
    return [];
  }

  const items: ProcessedItem[] = [];
  for (const file of files) {
    const content = readFileSync(join(archiveDir, file), "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (trimmed) {
        try {
          items.push(JSON.parse(trimmed));
        } catch {
          // Skip malformed lines
        }
      }
    }
  }
  return items;
}

function deduplicateItems(items: ProcessedItem[]): ProcessedItem[] {
  const map = new Map<string, ProcessedItem>();
  for (const item of items) {
    const key = `${item.source_url}|${item.published_at}`;
    const existing = map.get(key);
    if (!existing || item.title.length > existing.title.length) {
      map.set(key, item);
    }
  }
  return Array.from(map.values());
}

function getMonday(date: Date): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d;
}

function formatWeekLabel(monday: Date): string {
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${months[monday.getUTCMonth()]} ${monday.getUTCDate()}`;
}

function toISODate(date: Date): string {
  return date.toISOString().split("T")[0];
}

function computeWeeklyBuckets(items: ProcessedItem[], now: Date): WeekBucket[] {
  const currentMonday = getMonday(now);

  const buckets: WeekBucket[] = [];
  for (let i = 11; i >= 0; i--) {
    const monday = new Date(currentMonday);
    monday.setUTCDate(monday.getUTCDate() - i * 7);
    buckets.push({
      week: formatWeekLabel(monday),
      week_start: toISODate(monday),
      alerts: 0,
      updates: 0,
    });
  }

  const firstMonday = new Date(buckets[0].week_start + "T00:00:00.000Z");
  const endOfWindow = new Date(currentMonday);
  endOfWindow.setUTCDate(endOfWindow.getUTCDate() + 7);

  for (const item of items) {
    const pubDate = new Date(item.published_at);
    if (pubDate < firstMonday || pubDate >= endOfWindow) continue;

    const itemMonday = getMonday(pubDate);
    const weekStart = toISODate(itemMonday);
    const bucket = buckets.find(b => b.week_start === weekStart);
    if (bucket) {
      if (item.category === "alerta") bucket.alerts++;
      else bucket.updates++;
    }
  }

  return buckets;
}

function computeProviderStats(items: ProcessedItem[], now: Date): ProviderStat[] {
  const cutoff = new Date(now);
  cutoff.setUTCDate(cutoff.getUTCDate() - 30);

  const recentItems = items.filter(i => new Date(i.published_at) >= cutoff);

  const stats = new Map<string, { count: number; alerts: number; updates: number }>();

  for (const item of recentItems) {
    const provider = resolveProvider(item.entities);
    const existing = stats.get(provider) ?? { count: 0, alerts: 0, updates: 0 };
    existing.count++;
    if (item.category === "alerta") existing.alerts++;
    else existing.updates++;
    stats.set(provider, existing);
  }

  return Array.from(stats.entries())
    .map(([provider, s]) => ({ provider, ...s }))
    .sort((a, b) => b.count - a.count);
}

export function generateStats(
  archiveDir: string,
  diffPageUrls: string[] = [],
  now?: Date,
): StatsFile {
  const ref = now ?? new Date();
  const allItems = readArchive(archiveDir);
  const unique = deduplicateItems(allItems);

  const cutoff30 = new Date(ref);
  cutoff30.setUTCDate(cutoff30.getUTCDate() - 30);
  const last30 = unique.filter(i => new Date(i.published_at) >= cutoff30);

  const diffSet = new Set(diffPageUrls.map(u => u.toLowerCase()));
  let rssCount = 0;
  let diffCount = 0;
  for (const item of unique) {
    if (diffSet.has(item.source_url.toLowerCase())) {
      diffCount++;
    } else {
      rssCount++;
    }
  }

  let minTs = Infinity;
  let maxTs = -Infinity;
  for (const item of unique) {
    const ts = new Date(item.published_at).getTime();
    if (ts < minTs) minTs = ts;
    if (ts > maxTs) maxTs = ts;
  }
  const coverageStart = unique.length > 0 ? toISODate(new Date(minTs)) : toISODate(ref);
  const coverageEnd = unique.length > 0 ? toISODate(new Date(maxTs)) : toISODate(ref);

  return {
    generated_at: ref.toISOString(),
    coverage_start: coverageStart,
    coverage_end: coverageEnd,
    weekly: computeWeeklyBuckets(unique, ref),
    providers: computeProviderStats(unique, ref),
    totals: {
      unique_events: unique.length,
      last_30_days: last30.length,
      sources: { rss: rssCount, diff_pages: diffCount },
    },
  };
}
