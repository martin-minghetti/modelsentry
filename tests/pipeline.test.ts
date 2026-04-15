import { mergeResults } from "../src/pipeline.js";
import type { ProcessedItem } from "../src/types.js";

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
    published_at: "2024-06-01T12:00:00Z",
    confidence: 0.9,
    ...overrides,
  };
}

describe("mergeResults", () => {
  it("returns new items when existing is empty", () => {
    const newItems = [
      makeItem({ source_url: "https://example.com/a", published_at: "2024-06-01T10:00:00Z" }),
      makeItem({ source_url: "https://example.com/b", published_at: "2024-06-02T10:00:00Z" }),
    ];
    const result = mergeResults([], newItems);
    expect(result).toHaveLength(2);
  });

  it("returns existing items when new is empty", () => {
    const existing = [
      makeItem({ source_url: "https://example.com/a", published_at: "2024-06-01T10:00:00Z" }),
    ];
    const result = mergeResults(existing, []);
    expect(result).toHaveLength(1);
    expect(result[0].source_url).toBe("https://example.com/a");
  });

  it("returns empty array when both are empty", () => {
    expect(mergeResults([], [])).toEqual([]);
  });

  it("deduplicates by source_url, keeping the newer item", () => {
    const existing = [
      makeItem({
        source_url: "https://example.com/a",
        published_at: "2024-05-01T10:00:00Z",
        title: "Old Title",
      }),
    ];
    const newItems = [
      makeItem({
        source_url: "https://example.com/a",
        published_at: "2024-06-01T10:00:00Z",
        title: "New Title",
      }),
    ];
    const result = mergeResults(existing, newItems);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("New Title");
  });

  it("keeps existing item when it is newer than the new duplicate", () => {
    const existing = [
      makeItem({
        source_url: "https://example.com/a",
        published_at: "2024-07-01T10:00:00Z",
        title: "Existing Newer",
      }),
    ];
    const newItems = [
      makeItem({
        source_url: "https://example.com/a",
        published_at: "2024-06-01T10:00:00Z",
        title: "New But Older",
      }),
    ];
    const result = mergeResults(existing, newItems);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("Existing Newer");
  });

  it("sorts by published_at descending (newest first)", () => {
    const existing = [
      makeItem({ source_url: "https://example.com/b", published_at: "2024-06-02T00:00:00Z" }),
    ];
    const newItems = [
      makeItem({ source_url: "https://example.com/c", published_at: "2024-06-03T00:00:00Z" }),
      makeItem({ source_url: "https://example.com/a", published_at: "2024-06-01T00:00:00Z" }),
    ];
    const result = mergeResults(existing, newItems);
    expect(result).toHaveLength(3);
    expect(result[0].source_url).toBe("https://example.com/c");
    expect(result[1].source_url).toBe("https://example.com/b");
    expect(result[2].source_url).toBe("https://example.com/a");
  });

  it("does not mutate input arrays", () => {
    const existing = [
      makeItem({ source_url: "https://example.com/a", published_at: "2024-06-01T00:00:00Z" }),
    ];
    const newItems = [
      makeItem({ source_url: "https://example.com/b", published_at: "2024-06-02T00:00:00Z" }),
    ];
    const existingCopy = [...existing];
    const newItemsCopy = [...newItems];
    mergeResults(existing, newItems);
    expect(existing).toEqual(existingCopy);
    expect(newItems).toEqual(newItemsCopy);
  });
});
