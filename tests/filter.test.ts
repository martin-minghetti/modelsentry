import { describe, it, expect } from "vitest";
import {
  matchesKeywords,
  normalizeUrl,
  titleSimilarity,
  filterItems,
} from "../src/filter.js";
import type { RawItem, SeenUrls } from "../src/types.js";

// ─── matchesKeywords ────────────────────────────────────────────────────────

describe("matchesKeywords", () => {
  it("returns true when text contains an include keyword (case-insensitive)", () => {
    expect(matchesKeywords("Claude launches new model", ["claude"], [])).toBe(true);
    expect(matchesKeywords("CLAUDE launches new model", ["claude"], [])).toBe(true);
    expect(matchesKeywords("OpenAI pricing update", ["OPENAI"], [])).toBe(true);
  });

  it("returns false when text contains none of the include keywords", () => {
    expect(matchesKeywords("Random blog post", ["claude", "openai"], [])).toBe(false);
  });

  it("returns true when include list is empty (match everything)", () => {
    expect(matchesKeywords("Any text at all", [], [])).toBe(true);
    expect(matchesKeywords("", [], [])).toBe(true);
  });

  it("returns false when text contains an exclude keyword", () => {
    expect(matchesKeywords("Claude crypto wallet", ["claude"], ["crypto"])).toBe(false);
    expect(matchesKeywords("OpenAI blockchain", ["openai"], ["BLOCKCHAIN"])).toBe(false);
  });

  it("returns false when include list is empty but exclude keyword present", () => {
    expect(matchesKeywords("Bitcoin crypto news", [], ["crypto"])).toBe(false);
  });

  it("returns false when both include and exclude keywords match", () => {
    expect(matchesKeywords("Claude crypto feature", ["claude"], ["crypto"])).toBe(false);
  });

  it("returns true when include matches and no exclude keywords present", () => {
    expect(matchesKeywords("Claude releases new API", ["claude"], ["crypto", "blockchain"])).toBe(true);
  });

  it("matches partial words within text", () => {
    // "claude" found inside "claudeai" or as a substring
    expect(matchesKeywords("claudeai is great", ["claude"], [])).toBe(true);
  });
});

// ─── normalizeUrl ────────────────────────────────────────────────────────────

describe("normalizeUrl", () => {
  it("strips URL fragments", () => {
    expect(normalizeUrl("https://example.com/page#section")).toBe("https://example.com/page");
    expect(normalizeUrl("https://example.com/page#")).toBe("https://example.com/page");
  });

  it("removes UTM parameters", () => {
    expect(normalizeUrl("https://example.com/page?utm_source=twitter")).toBe("https://example.com/page");
    expect(normalizeUrl("https://example.com/page?utm_medium=cpc")).toBe("https://example.com/page");
    expect(normalizeUrl("https://example.com/page?utm_campaign=launch")).toBe("https://example.com/page");
    expect(normalizeUrl("https://example.com/page?utm_content=ad1")).toBe("https://example.com/page");
    expect(normalizeUrl("https://example.com/page?utm_term=ai")).toBe("https://example.com/page");
  });

  it("removes all UTM params while keeping non-UTM params", () => {
    const url = "https://example.com/page?ref=home&utm_source=twitter&utm_medium=cpc";
    expect(normalizeUrl(url)).toBe("https://example.com/page?ref=home");
  });

  it("removes trailing slash", () => {
    expect(normalizeUrl("https://example.com/page/")).toBe("https://example.com/page");
    expect(normalizeUrl("https://example.com/")).toBe("https://example.com");
  });

  it("handles fragment + UTM params + trailing slash together", () => {
    const url = "https://example.com/page/?utm_source=twitter&utm_campaign=q1#section";
    expect(normalizeUrl(url)).toBe("https://example.com/page");
  });

  it("leaves clean URLs unchanged", () => {
    expect(normalizeUrl("https://example.com/article")).toBe("https://example.com/article");
    expect(normalizeUrl("https://example.com/article?page=2")).toBe("https://example.com/article?page=2");
  });
});

// ─── titleSimilarity ─────────────────────────────────────────────────────────

describe("titleSimilarity", () => {
  it("returns 1.0 for identical titles", () => {
    expect(titleSimilarity("OpenAI releases GPT-5", "OpenAI releases GPT-5")).toBe(1);
  });

  it("returns 1.0 for identical titles regardless of case", () => {
    expect(titleSimilarity("openai releases gpt-5", "OPENAI RELEASES GPT-5")).toBe(1);
  });

  it("returns 0 for completely different titles", () => {
    expect(titleSimilarity("OpenAI releases new model", "Anthropic funding round")).toBe(0);
  });

  it("returns value between 0 and 1 for partially overlapping titles", () => {
    const score = titleSimilarity("OpenAI releases new model", "OpenAI new pricing model");
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(1);
  });

  it("returns 0 for empty strings", () => {
    expect(titleSimilarity("", "")).toBe(0);
    expect(titleSimilarity("some words", "")).toBe(0);
    expect(titleSimilarity("", "some words")).toBe(0);
  });

  it("is symmetric", () => {
    const a = "Claude 3.5 Sonnet new features";
    const b = "Anthropic Claude 3.5 release";
    expect(titleSimilarity(a, b)).toBeCloseTo(titleSimilarity(b, a), 10);
  });

  it("computes Jaccard correctly for known word sets", () => {
    // a = {the, cat, sat, on, mat}; b = {the, cat, sat, on, a, mat}
    // intersection = 5, union = 6 → 5/6
    const score = titleSimilarity("the cat sat on mat", "the cat sat on a mat");
    expect(score).toBeCloseTo(5 / 6, 5);
  });
});

// ─── filterItems ─────────────────────────────────────────────────────────────

function makeItem(overrides: Partial<RawItem> = {}): RawItem {
  return {
    title: "Claude releases new API",
    link: "https://example.com/article",
    published: "2024-01-01T00:00:00Z",
    source: "test",
    ...overrides,
  };
}

describe("filterItems", () => {
  const keywords = { include: ["claude"], exclude: ["crypto"] };

  it("returns items that match include keywords", () => {
    const items = [makeItem(), makeItem({ title: "Random news", link: "https://example.com/random" })];
    const result = filterItems(items, keywords, {});
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("Claude releases new API");
  });

  it("excludes items whose title matches exclude keywords", () => {
    const items = [makeItem({ title: "Claude crypto wallet" })];
    const result = filterItems(items, keywords, {});
    expect(result).toHaveLength(0);
  });

  it("also checks content for keyword matching", () => {
    const items = [
      makeItem({
        title: "Interesting AI news",
        content: "claude was mentioned deep in the article",
        link: "https://example.com/ai-news",
      }),
    ];
    const result = filterItems(items, keywords, {});
    expect(result).toHaveLength(1);
  });

  it("excludes items whose normalized URL is already in seenUrls", () => {
    const seenUrls: SeenUrls = { "https://example.com/article": "2024-01-01T00:00:00Z" };
    const items = [makeItem()];
    const result = filterItems(items, keywords, seenUrls);
    expect(result).toHaveLength(0);
  });

  it("normalizes URL before checking seenUrls", () => {
    const seenUrls: SeenUrls = { "https://example.com/article": "2024-01-01T00:00:00Z" };
    const items = [makeItem({ link: "https://example.com/article/?utm_source=twitter#section" })];
    const result = filterItems(items, keywords, seenUrls);
    expect(result).toHaveLength(0);
  });

  it("skips items with title similarity > 0.8 to already-accepted items", () => {
    // 5 shared words, union = 6 → Jaccard = 5/6 ≈ 0.833 > 0.8
    const items = [
      makeItem({ title: "Claude new AI model release", link: "https://example.com/a" }),
      makeItem({ title: "Claude new AI model release today", link: "https://example.com/b" }),
    ];
    const result = filterItems(items, keywords, {});
    expect(result).toHaveLength(1);
  });

  it("does not skip items with title similarity <= 0.8", () => {
    const items = [
      makeItem({ title: "Claude releases new API", link: "https://example.com/a" }),
      makeItem({ title: "Anthropic announces major funding round", link: "https://example.com/b" }),
    ];
    // "Anthropic announces major funding round" doesn't match "claude" keyword, so actually 1 item
    const keywordsEmpty = { include: [], exclude: [] };
    const result = filterItems(items, keywordsEmpty, {});
    expect(result).toHaveLength(2);
  });

  it("passes empty include list to accept all items", () => {
    const items = [
      makeItem({ title: "Random news", link: "https://example.com/random" }),
      makeItem({ title: "Another story", link: "https://example.com/another" }),
    ];
    const result = filterItems(items, { include: [], exclude: [] }, {});
    expect(result).toHaveLength(2);
  });

  it("returns empty array for empty input", () => {
    expect(filterItems([], keywords, {})).toEqual([]);
  });

  it("deduplicates within result set by URL", () => {
    const items = [
      makeItem({ link: "https://example.com/article" }),
      makeItem({ title: "Claude releases new API v2", link: "https://example.com/article" }),
    ];
    const result = filterItems(items, keywords, {});
    expect(result).toHaveLength(1);
  });
});
