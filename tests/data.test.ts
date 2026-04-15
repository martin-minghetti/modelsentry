import { mkdtempSync, writeFileSync, readFileSync, mkdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  loadSeenUrls,
  saveSeenUrls,
  pruneSeenUrls,
  loadLatest,
  saveLatest,
  appendArchive,
} from "../src/data.js";
import type { SeenUrls, ProcessedItem } from "../src/types.js";

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), "modelsentry-data-test-"));
}

function makeItem(overrides: Partial<ProcessedItem> = {}): ProcessedItem {
  return {
    title: "Test Item",
    summary: "A summary",
    category: "novedad",
    entities: ["EntityA"],
    event_type: "release",
    key_numbers: [],
    signal: "positive",
    impact: "medium",
    why_included: "relevant",
    source_url: "https://example.com/article",
    published_at: new Date().toISOString(),
    confidence: 0.9,
    ...overrides,
  };
}

// ─── loadSeenUrls ────────────────────────────────────────────────────────────

describe("loadSeenUrls", () => {
  it("returns empty object when file does not exist", () => {
    const dir = makeTempDir();
    const result = loadSeenUrls(join(dir, "nonexistent.json"));
    expect(result).toEqual({});
  });

  it("returns parsed SeenUrls when file exists", () => {
    const dir = makeTempDir();
    const filePath = join(dir, "seen_urls.json");
    const data: SeenUrls = {
      "https://example.com/a": "2026-04-01T00:00:00.000Z",
      "https://example.com/b": "2026-04-10T00:00:00.000Z",
    };
    writeFileSync(filePath, JSON.stringify(data), "utf-8");
    const result = loadSeenUrls(filePath);
    expect(result).toEqual(data);
  });
});

// ─── saveSeenUrls ────────────────────────────────────────────────────────────

describe("saveSeenUrls", () => {
  it("writes SeenUrls to file and roundtrips correctly", () => {
    const dir = makeTempDir();
    const filePath = join(dir, "seen_urls.json");
    const data: SeenUrls = {
      "https://example.com/x": "2026-04-12T00:00:00.000Z",
    };
    saveSeenUrls(filePath, data);
    const result = loadSeenUrls(filePath);
    expect(result).toEqual(data);
  });

  it("overwrites existing file", () => {
    const dir = makeTempDir();
    const filePath = join(dir, "seen_urls.json");
    saveSeenUrls(filePath, { "https://old.com": "2026-01-01T00:00:00.000Z" });
    const newData: SeenUrls = { "https://new.com": "2026-04-15T00:00:00.000Z" };
    saveSeenUrls(filePath, newData);
    const result = loadSeenUrls(filePath);
    expect(result).toEqual(newData);
  });
});

// ─── pruneSeenUrls ───────────────────────────────────────────────────────────

describe("pruneSeenUrls", () => {
  it("keeps entries within maxDays", () => {
    const now = new Date();
    const recent = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString();
    const urls: SeenUrls = { "https://recent.com": recent };
    const result = pruneSeenUrls(urls, 30);
    expect(result).toEqual(urls);
  });

  it("removes entries older than maxDays", () => {
    const now = new Date();
    const old = new Date(now.getTime() - 40 * 24 * 60 * 60 * 1000).toISOString();
    const urls: SeenUrls = { "https://old.com": old };
    const result = pruneSeenUrls(urls, 30);
    expect(result).toEqual({});
  });

  it("handles a mix of old and recent entries", () => {
    const now = new Date();
    const recent = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString();
    const old = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString();
    const urls: SeenUrls = {
      "https://keep.com": recent,
      "https://drop.com": old,
    };
    const result = pruneSeenUrls(urls, 30);
    expect(result).toEqual({ "https://keep.com": recent });
  });

  it("returns empty object when input is empty", () => {
    expect(pruneSeenUrls({}, 30)).toEqual({});
  });
});

// ─── loadLatest ──────────────────────────────────────────────────────────────

describe("loadLatest", () => {
  it("returns empty array when file does not exist", () => {
    const dir = makeTempDir();
    const result = loadLatest(join(dir, "latest.json"));
    expect(result).toEqual([]);
  });

  it("returns parsed array when file exists", () => {
    const dir = makeTempDir();
    const filePath = join(dir, "latest.json");
    const items = [makeItem(), makeItem({ title: "Another" })];
    writeFileSync(filePath, JSON.stringify(items), "utf-8");
    const result = loadLatest(filePath);
    expect(result).toEqual(items);
  });
});

// ─── saveLatest ──────────────────────────────────────────────────────────────

describe("saveLatest", () => {
  it("writes and roundtrips items correctly", () => {
    const dir = makeTempDir();
    const filePath = join(dir, "latest.json");
    const items = [makeItem()];
    saveLatest(filePath, items, 30);
    const result = loadLatest(filePath);
    expect(result).toEqual(items);
  });

  it("filters out items older than retentionDays", () => {
    const dir = makeTempDir();
    const filePath = join(dir, "latest.json");
    const now = new Date();
    const recentDate = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString();
    const oldDate = new Date(now.getTime() - 40 * 24 * 60 * 60 * 1000).toISOString();
    const recent = makeItem({ published_at: recentDate, title: "Recent" });
    const old = makeItem({ published_at: oldDate, title: "Old" });
    saveLatest(filePath, [recent, old], 30);
    const result = loadLatest(filePath);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("Recent");
  });

  it("writes empty array when all items are older than retentionDays", () => {
    const dir = makeTempDir();
    const filePath = join(dir, "latest.json");
    const oldDate = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString();
    saveLatest(filePath, [makeItem({ published_at: oldDate })], 30);
    const result = loadLatest(filePath);
    expect(result).toEqual([]);
  });
});

// ─── appendArchive ───────────────────────────────────────────────────────────

describe("appendArchive", () => {
  it("creates an NDJSON file for the correct month", () => {
    const dir = makeTempDir();
    const item = makeItem({ published_at: "2026-04-10T12:00:00.000Z" });
    appendArchive(dir, [item]);
    const content = readFileSync(join(dir, "2026-04.ndjson"), "utf-8");
    const parsed = JSON.parse(content.trim());
    expect(parsed).toEqual(item);
  });

  it("appends multiple items to the same monthly file", () => {
    const dir = makeTempDir();
    const item1 = makeItem({ published_at: "2026-04-01T00:00:00.000Z", title: "First" });
    const item2 = makeItem({ published_at: "2026-04-20T00:00:00.000Z", title: "Second" });
    appendArchive(dir, [item1, item2]);
    const content = readFileSync(join(dir, "2026-04.ndjson"), "utf-8");
    const lines = content.trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]).title).toBe("First");
    expect(JSON.parse(lines[1]).title).toBe("Second");
  });

  it("appends to an existing NDJSON file", () => {
    const dir = makeTempDir();
    const item1 = makeItem({ published_at: "2026-04-05T00:00:00.000Z", title: "Existing" });
    appendArchive(dir, [item1]);
    const item2 = makeItem({ published_at: "2026-04-06T00:00:00.000Z", title: "Appended" });
    appendArchive(dir, [item2]);
    const content = readFileSync(join(dir, "2026-04.ndjson"), "utf-8");
    const lines = content.trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]).title).toBe("Existing");
    expect(JSON.parse(lines[1]).title).toBe("Appended");
  });

  it("creates separate files for different months", () => {
    const dir = makeTempDir();
    const aprilItem = makeItem({ published_at: "2026-04-15T00:00:00.000Z", title: "April" });
    const marchItem = makeItem({ published_at: "2026-03-20T00:00:00.000Z", title: "March" });
    appendArchive(dir, [aprilItem, marchItem]);
    const aprilContent = readFileSync(join(dir, "2026-04.ndjson"), "utf-8");
    const marchContent = readFileSync(join(dir, "2026-03.ndjson"), "utf-8");
    expect(JSON.parse(aprilContent.trim()).title).toBe("April");
    expect(JSON.parse(marchContent.trim()).title).toBe("March");
  });

  it("does nothing when items array is empty", () => {
    const dir = makeTempDir();
    expect(() => appendArchive(dir, [])).not.toThrow();
  });
});
