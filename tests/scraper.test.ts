import { describe, it, expect, vi, beforeEach } from "vitest";
import type { RSSSource, RawItem } from "../src/types.js";

// Mock rss-parser at module level
const mockParseURL = vi.fn();

vi.mock("rss-parser", () => {
  function MockParser() {
    return { parseURL: mockParseURL };
  }
  return {
    default: MockParser,
  };
});

// Import after mocking
const { fetchFeed, fetchAllFeeds } = await import("../src/scraper.js");

describe("fetchFeed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("maps parsed feed items to RawItem format", async () => {
    const source: RSSSource = { url: "https://example.com/feed.rss", name: "Example Feed" };

    mockParseURL.mockResolvedValueOnce({
      items: [
        {
          title: "New Model Release",
          link: "https://example.com/article-1",
          isoDate: "2026-04-15T10:00:00.000Z",
          contentSnippet: "A new model was released today.",
        },
        {
          title: "Pricing Update",
          link: "https://example.com/article-2",
          isoDate: "2026-04-14T08:00:00.000Z",
          contentSnippet: undefined,
        },
      ],
    });

    const items = await fetchFeed(source);

    expect(items).toHaveLength(2);

    expect(items[0]).toEqual<RawItem>({
      title: "New Model Release",
      link: "https://example.com/article-1",
      published: "2026-04-15T10:00:00.000Z",
      content: "A new model was released today.",
      source: "Example Feed",
    });

    expect(items[1]).toEqual<RawItem>({
      title: "Pricing Update",
      link: "https://example.com/article-2",
      published: "2026-04-14T08:00:00.000Z",
      source: "Example Feed",
    });
  });

  it("returns empty array when the feed fails to parse", async () => {
    const source: RSSSource = { url: "https://broken.example.com/feed.rss", name: "Broken Feed" };

    mockParseURL.mockRejectedValueOnce(new Error("Network error"));

    const items = await fetchFeed(source);

    expect(items).toEqual([]);
  });

  it("returns empty array when feed has no items", async () => {
    const source: RSSSource = { url: "https://empty.example.com/feed.rss", name: "Empty Feed" };

    mockParseURL.mockResolvedValueOnce({ items: [] });

    const items = await fetchFeed(source);

    expect(items).toEqual([]);
  });
});

describe("fetchAllFeeds", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("aggregates items from multiple feeds and builds correct health map", async () => {
    const sources: RSSSource[] = [
      { url: "https://feed1.example.com/rss", name: "Feed One" },
      { url: "https://feed2.example.com/rss", name: "Feed Two" },
    ];

    mockParseURL
      .mockResolvedValueOnce({
        items: [
          {
            title: "Item A",
            link: "https://feed1.example.com/item-a",
            isoDate: "2026-04-15T09:00:00.000Z",
            contentSnippet: "Content A",
          },
        ],
      })
      .mockResolvedValueOnce({
        items: [
          {
            title: "Item B",
            link: "https://feed2.example.com/item-b",
            isoDate: "2026-04-15T11:00:00.000Z",
            contentSnippet: "Content B",
          },
        ],
      });

    const { items, health } = await fetchAllFeeds(sources);

    expect(items).toHaveLength(2);
    expect(items.find((i) => i.title === "Item A")).toBeDefined();
    expect(items.find((i) => i.title === "Item B")).toBeDefined();

    expect(health).toEqual({
      "Feed One": true,
      "Feed Two": true,
    });
  });

  it("marks failed feeds as false in health map and omits their items", async () => {
    const sources: RSSSource[] = [
      { url: "https://good.example.com/rss", name: "Good Feed" },
      { url: "https://bad.example.com/rss", name: "Bad Feed" },
    ];

    mockParseURL
      .mockResolvedValueOnce({
        items: [
          {
            title: "Good Item",
            link: "https://good.example.com/good-item",
            isoDate: "2026-04-15T07:00:00.000Z",
            contentSnippet: "Good content",
          },
        ],
      })
      .mockRejectedValueOnce(new Error("Connection refused"));

    const { items, health } = await fetchAllFeeds(sources);

    expect(items).toHaveLength(1);
    expect(items[0].title).toBe("Good Item");

    expect(health).toEqual({
      "Good Feed": true,
      "Bad Feed": false,
    });
  });

  it("returns empty items and all-false health map when all feeds fail", async () => {
    const sources: RSSSource[] = [
      { url: "https://fail1.example.com/rss", name: "Fail One" },
      { url: "https://fail2.example.com/rss", name: "Fail Two" },
    ];

    mockParseURL.mockRejectedValue(new Error("Timeout"));

    const { items, health } = await fetchAllFeeds(sources);

    expect(items).toEqual([]);
    expect(health).toEqual({
      "Fail One": false,
      "Fail Two": false,
    });
  });
});
