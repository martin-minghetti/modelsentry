import type { ProcessedItem } from "./types.js";

/**
 * Escape XML special characters: &, <, >, ", '
 */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Convert an ISO 8601 date string to RFC 2822 format required by RSS pubDate.
 * e.g. "2024-06-01T12:00:00Z" → "Sat, 01 Jun 2024 12:00:00 +0000"
 */
function toRfc2822(isoDate: string): string {
  const date = new Date(isoDate);
  if (isNaN(date.getTime())) return isoDate;
  return date.toUTCString();
}

/**
 * Build the <description> CDATA content for an item.
 * Combines summary, impact badge, signal badge, and why_included.
 */
function buildDescription(item: ProcessedItem): string {
  const summary = escapeXml(item.summary);
  const impact = escapeXml(item.impact);
  const signal = escapeXml(item.signal);
  const whyIncluded = escapeXml(item.why_included);

  return [
    summary,
    `Impact: ${impact}`,
    `Signal: ${signal}`,
    `Why included: ${whyIncluded}`,
  ].join(" | ");
}

/**
 * Generate an RSS 2.0 feed from an array of ProcessedItems.
 *
 * @param items    Array of processed items to include (capped at 50)
 * @param siteUrl  Base URL of the site (used for channel link and atom:link)
 * @returns        RSS 2.0 XML string
 */
export function generateFeed(items: ProcessedItem[], siteUrl: string): string {
  const cappedItems = items.slice(0, 50);

  const itemsXml = cappedItems
    .map((item) => {
      const title = escapeXml(item.title);
      const description = buildDescription(item);
      const pubDate = toRfc2822(item.published_at);

      return [
        "    <item>",
        `      <title>${title}</title>`,
        `      <link>${escapeXml(item.source_url)}</link>`,
        `      <guid>${escapeXml(item.source_url)}</guid>`,
        `      <pubDate>${pubDate}</pubDate>`,
        `      <description>${description}</description>`,
        `      <category>${item.category}</category>`,
        "    </item>",
      ].join("\n");
    })
    .join("\n");

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    "  <channel>",
    "    <title>modelsentry — AI Early Warning System</title>",
    `    <link>${escapeXml(siteUrl)}</link>`,
    "    <description>Automated AI news and alerts for developers</description>",
    `    <atom:link href="${escapeXml(siteUrl)}/feed.xml" rel="self" type="application/rss+xml" />`,
    itemsXml,
    "  </channel>",
    "</rss>",
  ]
    .filter((line) => line !== "")
    .join("\n");
}
