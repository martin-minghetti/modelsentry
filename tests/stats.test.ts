import { mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { generateStats, resolveProvider } from "../src/stats.js";
import type { ProcessedItem } from "../src/types.js";

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), "modelsentry-stats-test-"));
}

function makeItem(overrides: Partial<ProcessedItem> = {}): ProcessedItem {
  return {
    title: "Test Item",
    summary: "A summary",
    category: "novedad",
    entities: ["Anthropic"],
    event_type: "release",
    key_numbers: [],
    signal: "positive",
    impact: "medium",
    why_included: "relevant",
    source_url: "https://example.com/article",
    published_at: "2026-04-14T12:00:00.000Z",
    confidence: 0.9,
    ...overrides,
  };
}

function writeNdjson(dir: string, filename: string, items: ProcessedItem[]): void {
  const content = items.map(i => JSON.stringify(i)).join("\n") + "\n";
  writeFileSync(join(dir, filename), content, "utf-8");
}

const NOW = new Date("2026-04-16T12:00:00.000Z");

describe("generateStats", () => {
  it("returns 12 zero-week buckets and empty providers for empty archive", () => {
    const dir = makeTempDir();
    const stats = generateStats(dir, [], NOW);

    expect(stats.weekly).toHaveLength(12);
    for (const week of stats.weekly) {
      expect(week.alerts).toBe(0);
      expect(week.updates).toBe(0);
    }
    expect(stats.providers).toEqual([]);
    expect(stats.totals.unique_events).toBe(0);
    expect(stats.totals.last_30_days).toBe(0);
  });

  it("places a single item in the correct week bucket and provider", () => {
    const dir = makeTempDir();
    const item = makeItem({
      published_at: "2026-04-14T12:00:00.000Z",
      entities: ["Anthropic"],
      category: "novedad",
    });
    writeNdjson(dir, "2026-04.ndjson", [item]);

    const stats = generateStats(dir, [], NOW);

    const apr13 = stats.weekly.find(w => w.week_start === "2026-04-13");
    expect(apr13).toBeDefined();
    expect(apr13!.updates).toBe(1);
    expect(apr13!.alerts).toBe(0);

    expect(stats.providers).toHaveLength(1);
    expect(stats.providers[0].provider).toBe("Anthropic");
    expect(stats.providers[0].count).toBe(1);

    expect(stats.totals.unique_events).toBe(1);
    expect(stats.totals.last_30_days).toBe(1);
    expect(stats.totals.sources.rss).toBe(1);
  });

  it("deduplicates rows with same source_url and published_at, keeps longest title", () => {
    const dir = makeTempDir();
    const short = makeItem({
      source_url: "https://example.com/dup",
      published_at: "2026-04-14T12:00:00.000Z",
      title: "Short",
    });
    const long = makeItem({
      source_url: "https://example.com/dup",
      published_at: "2026-04-14T12:00:00.000Z",
      title: "Much longer and more descriptive title",
    });
    writeNdjson(dir, "2026-04.ndjson", [short, long]);

    const stats = generateStats(dir, [], NOW);
    expect(stats.totals.unique_events).toBe(1);
  });

  it("counts same source_url with different published_at as separate events", () => {
    const dir = makeTempDir();
    const first = makeItem({
      source_url: "https://example.com/page",
      published_at: "2026-04-10T12:00:00.000Z",
    });
    const second = makeItem({
      source_url: "https://example.com/page",
      published_at: "2026-04-14T12:00:00.000Z",
    });
    writeNdjson(dir, "2026-04.ndjson", [first, second]);

    const stats = generateStats(dir, [], NOW);
    expect(stats.totals.unique_events).toBe(2);
  });

  it("includes zero-activity weeks with alerts=0 and updates=0", () => {
    const dir = makeTempDir();
    const item = makeItem({ published_at: "2026-04-14T12:00:00.000Z" });
    writeNdjson(dir, "2026-04.ndjson", [item]);

    const stats = generateStats(dir, [], NOW);
    const zeroWeeks = stats.weekly.filter(w => w.alerts === 0 && w.updates === 0);
    expect(zeroWeeks.length).toBe(11);
  });

  it("formats week labels as 'Mon D' not ISO date", () => {
    const dir = makeTempDir();
    const stats = generateStats(dir, [], NOW);

    for (const week of stats.weekly) {
      expect(week.week).toMatch(/^[A-Z][a-z]{2} \d{1,2}$/);
    }

    const lastWeek = stats.weekly[stats.weekly.length - 1];
    expect(lastWeek.week).toBe("Apr 13");
    expect(lastWeek.week_start).toBe("2026-04-13");
  });

  it("only includes last 12 weeks in weekly, older data in totals only", () => {
    const dir = makeTempDir();
    const oldItem = makeItem({
      published_at: "2026-01-20T12:00:00.000Z",
      source_url: "https://example.com/old",
    });
    const recentItem = makeItem({
      published_at: "2026-04-14T12:00:00.000Z",
      source_url: "https://example.com/recent",
    });
    writeNdjson(dir, "2026-01.ndjson", [oldItem]);
    writeNdjson(dir, "2026-04.ndjson", [recentItem]);

    const stats = generateStats(dir, [], NOW);

    expect(stats.totals.unique_events).toBe(2);

    const weeklyTotal = stats.weekly.reduce((sum, w) => sum + w.alerts + w.updates, 0);
    expect(weeklyTotal).toBe(1);
  });

  it("sorts providers by count descending", () => {
    const dir = makeTempDir();
    const items = [
      makeItem({ entities: ["OpenAI"], source_url: "https://a.com/1", published_at: "2026-04-10T00:00:00.000Z" }),
      makeItem({ entities: ["OpenAI"], source_url: "https://a.com/2", published_at: "2026-04-11T00:00:00.000Z" }),
      makeItem({ entities: ["OpenAI"], source_url: "https://a.com/3", published_at: "2026-04-12T00:00:00.000Z" }),
      makeItem({ entities: ["Anthropic"], source_url: "https://b.com/1", published_at: "2026-04-13T00:00:00.000Z" }),
      makeItem({ entities: ["Google Gemini"], source_url: "https://c.com/1", published_at: "2026-04-14T00:00:00.000Z" }),
      makeItem({ entities: ["Google Gemini"], source_url: "https://c.com/2", published_at: "2026-04-15T00:00:00.000Z" }),
    ];
    writeNdjson(dir, "2026-04.ndjson", items);

    const stats = generateStats(dir, [], NOW);
    expect(stats.providers[0].provider).toBe("OpenAI");
    expect(stats.providers[0].count).toBe(3);
    expect(stats.providers[1].provider).toBe("Google");
    expect(stats.providers[1].count).toBe(2);
    expect(stats.providers[2].provider).toBe("Anthropic");
    expect(stats.providers[2].count).toBe(1);
  });

  it("counts diff page sources separately from RSS", () => {
    const dir = makeTempDir();
    const rssItem = makeItem({
      source_url: "https://blog.example.com/post",
      published_at: "2026-04-14T12:00:00.000Z",
    });
    const diffItem = makeItem({
      source_url: "https://openai.com/pricing",
      published_at: "2026-04-14T13:00:00.000Z",
      category: "alerta",
    });
    writeNdjson(dir, "2026-04.ndjson", [rssItem, diffItem]);

    const stats = generateStats(dir, ["https://openai.com/pricing"], NOW);
    expect(stats.totals.sources.rss).toBe(1);
    expect(stats.totals.sources.diff_pages).toBe(1);
  });
});

describe("resolveProvider", () => {
  it("resolves Claude Code to Anthropic", () => {
    expect(resolveProvider(["Claude Code"])).toBe("Anthropic");
  });

  it("resolves Gemini API to Google", () => {
    expect(resolveProvider(["Gemini API"])).toBe("Google");
  });

  it("resolves Grok 3 to xAI", () => {
    expect(resolveProvider(["Grok 3"])).toBe("xAI");
  });

  it("resolves GPT-4o to OpenAI", () => {
    expect(resolveProvider(["GPT-4o"])).toBe("OpenAI");
  });

  it("resolves Llama 3 to Meta", () => {
    expect(resolveProvider(["Llama 3"])).toBe("Meta");
  });

  it("returns Other for unknown entities", () => {
    expect(resolveProvider(["Mistral Large"])).toBe("Other");
  });

  it("returns Other for empty entities", () => {
    expect(resolveProvider([])).toBe("Other");
  });

  it("uses first matching entity when multiple present", () => {
    expect(resolveProvider(["Some random", "Claude 4"])).toBe("Anthropic");
  });
});

describe("generateStats — provider in output", () => {
  it("maps unknown entity to Other provider in stats", () => {
    const dir = makeTempDir();
    const item = makeItem({
      entities: ["Mistral Large"],
      published_at: "2026-04-14T12:00:00.000Z",
    });
    writeNdjson(dir, "2026-04.ndjson", [item]);

    const stats = generateStats(dir, [], NOW);
    expect(stats.providers).toHaveLength(1);
    expect(stats.providers[0].provider).toBe("Other");
  });
});
