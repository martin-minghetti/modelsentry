import { describe, it, expect } from "vitest";
import { generateFeed } from "../src/feed.js";
import type { ProcessedItem } from "../src/types.js";

function makeItem(overrides: Partial<ProcessedItem> = {}): ProcessedItem {
  return {
    title: "OpenAI releases GPT-5",
    summary: "OpenAI has released GPT-5 with major improvements.",
    category: "novedad",
    entities: ["OpenAI"],
    event_type: "release",
    key_numbers: [],
    signal: "positive",
    impact: "high",
    why_included: "Major model release affecting all developers.",
    source_url: "https://example.com/gpt5",
    published_at: "2024-06-01T12:00:00Z",
    confidence: 0.95,
    ...overrides,
  };
}

// ─── generateFeed ────────────────────────────────────────────────────────────

describe("generateFeed", () => {
  const siteUrl = "https://modelsentry.example.com";

  it("returns a string containing the RSS 2.0 declaration", () => {
    const xml = generateFeed([makeItem()], siteUrl);
    expect(xml).toContain('version="2.0"');
    expect(xml).toContain("<rss");
    expect(xml).toContain("</rss>");
  });

  it("includes channel metadata", () => {
    const xml = generateFeed([makeItem()], siteUrl);
    expect(xml).toContain("modelsentry — AI Early Warning System");
    expect(xml).toContain("Automated AI news and alerts for developers");
    expect(xml).toContain(siteUrl);
  });

  it("includes atom:link self-reference", () => {
    const xml = generateFeed([makeItem()], siteUrl);
    expect(xml).toContain(`${siteUrl}/feed.xml`);
    expect(xml).toContain('rel="self"');
    expect(xml).toContain('type="application/rss+xml"');
  });

  it("renders one <item> per ProcessedItem", () => {
    const items = [
      makeItem({ source_url: "https://example.com/a", title: "Item A" }),
      makeItem({ source_url: "https://example.com/b", title: "Item B" }),
    ];
    const xml = generateFeed(items, siteUrl);
    const count = (xml.match(/<item>/g) ?? []).length;
    expect(count).toBe(2);
  });

  it("includes title, link, guid, pubDate, and category in each item", () => {
    const item = makeItem();
    const xml = generateFeed([item], siteUrl);
    expect(xml).toContain(`<title>${item.title}</title>`);
    expect(xml).toContain(`<link>${item.source_url}</link>`);
    expect(xml).toContain(`<guid>${item.source_url}</guid>`);
    expect(xml).toContain(`<category>${item.category}</category>`);
    // pubDate should be a non-empty string derived from published_at
    expect(xml).toContain("<pubDate>");
  });

  it("item description includes summary, impact, signal, and why_included", () => {
    const item = makeItem({
      summary: "Big news here.",
      impact: "high",
      signal: "positive",
      why_included: "Very relevant to devs.",
    });
    const xml = generateFeed([item], siteUrl);
    expect(xml).toContain("Big news here.");
    expect(xml).toContain("high");
    expect(xml).toContain("positive");
    expect(xml).toContain("Very relevant to devs.");
  });

  it("escapes & in titles", () => {
    const xml = generateFeed([makeItem({ title: "AT&T buys OpenAI" })], siteUrl);
    expect(xml).toContain("AT&amp;T buys OpenAI");
    expect(xml).not.toContain("<title>AT&T");
  });

  it("escapes < and > in titles", () => {
    const xml = generateFeed([makeItem({ title: "A < B > C" })], siteUrl);
    expect(xml).toContain("A &lt; B &gt; C");
  });

  it("escapes \" and ' in titles", () => {
    const xml = generateFeed(
      [makeItem({ title: 'Say "hello" and it\'s fine' })],
      siteUrl
    );
    expect(xml).toContain("&quot;");
    expect(xml).toContain("&apos;");
  });

  it("escapes special characters in description fields", () => {
    const xml = generateFeed(
      [
        makeItem({
          summary: "Revenue grew <50% & costs rose",
          why_included: 'It\'s "critical" info',
        }),
      ],
      siteUrl
    );
    expect(xml).toContain("&lt;50%");
    expect(xml).toContain("&amp;");
    expect(xml).toContain("&apos;");
    expect(xml).toContain("&quot;");
  });

  it("caps output at 50 items when given more", () => {
    const items = Array.from({ length: 60 }, (_, i) =>
      makeItem({ source_url: `https://example.com/${i}`, title: `Item ${i}` })
    );
    const xml = generateFeed(items, siteUrl);
    const count = (xml.match(/<item>/g) ?? []).length;
    expect(count).toBe(50);
  });

  it("produces valid RSS with no items for an empty array", () => {
    const xml = generateFeed([], siteUrl);
    expect(xml).toContain("<rss");
    expect(xml).toContain("<channel>");
    expect(xml).toContain("</channel>");
    expect(xml).not.toContain("<item>");
  });

  it("converts published_at ISO string to RFC 2822 pubDate", () => {
    const xml = generateFeed([makeItem({ published_at: "2024-06-01T12:00:00Z" })], siteUrl);
    // RFC 2822 dates contain a day-of-week abbreviation and a month abbreviation
    expect(xml).toMatch(/<pubDate>[A-Z][a-z]{2}, \d{1,2} [A-Z][a-z]{2} \d{4}/);
  });
});
