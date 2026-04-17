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
});
