import type { RawItem, SeenUrls } from "./types.js";

const UTM_PARAMS = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
]);

/**
 * Case-insensitive keyword matching.
 * Returns true if text contains ANY include keyword AND no exclude keywords.
 * An empty include list matches everything (only exclude filtering applies).
 */
export function matchesKeywords(
  text: string,
  include: string[],
  exclude: string[]
): boolean {
  const lower = text.toLowerCase();

  // Check exclude first – any match = reject
  for (const kw of exclude) {
    if (lower.includes(kw.toLowerCase())) {
      return false;
    }
  }

  // Empty include = match everything (exclude already passed above)
  if (include.length === 0) {
    return true;
  }

  // At least one include keyword must be present
  for (const kw of include) {
    if (lower.includes(kw.toLowerCase())) {
      return true;
    }
  }

  return false;
}

/**
 * Normalises a URL:
 * - Strips fragment (#...)
 * - Removes UTM query parameters
 * - Removes trailing slash from path
 */
export function normalizeUrl(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    // Not a valid URL – return as-is stripped of fragment
    return url.split("#")[0];
  }

  // Remove fragment
  parsed.hash = "";

  // Remove UTM params
  for (const key of [...parsed.searchParams.keys()]) {
    if (UTM_PARAMS.has(key)) {
      parsed.searchParams.delete(key);
    }
  }

  let result = parsed.toString();

  // Remove trailing slash (but keep the root slash for bare origins like https://example.com)
  if (result.endsWith("/") && parsed.pathname !== "/") {
    result = result.slice(0, -1);
  } else if (parsed.pathname === "/" && parsed.search === "" && result.endsWith("/")) {
    // bare origin: https://example.com/ → https://example.com
    result = result.slice(0, -1);
  }

  return result;
}

/**
 * Jaccard similarity on word sets (lowercase, split on whitespace).
 * Returns a float between 0 and 1.
 */
export function titleSimilarity(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().split(/\s+/).filter(Boolean));
  const wordsB = new Set(b.toLowerCase().split(/\s+/).filter(Boolean));

  if (wordsA.size === 0 || wordsB.size === 0) {
    return 0;
  }

  let intersection = 0;
  for (const word of wordsA) {
    if (wordsB.has(word)) {
      intersection++;
    }
  }

  const union = wordsA.size + wordsB.size - intersection;
  return intersection / union;
}

/**
 * Filters a list of raw items:
 * 1. Keyword match on title + content
 * 2. URL dedup against seenUrls (after normalisation)
 * 3. Title similarity dedup against already-accepted items (>0.8 = skip)
 */
export function filterItems(
  items: RawItem[],
  keywords: { include: string[]; exclude: string[] },
  seenUrls: SeenUrls
): RawItem[] {
  const accepted: RawItem[] = [];
  // Track normalised URLs seen within this batch to avoid duplicates
  const batchUrls = new Set<string>();

  for (const item of items) {
    // 1. Keyword match
    const text = [item.title, item.content ?? ""].join(" ");
    if (!matchesKeywords(text, keywords.include, keywords.exclude)) {
      continue;
    }

    // 2. URL dedup (against seenUrls from storage + current batch)
    const normUrl = normalizeUrl(item.link);
    if (normUrl in seenUrls || batchUrls.has(normUrl)) {
      continue;
    }

    // 3. Title similarity against already-accepted items
    let tooSimilar = false;
    for (const accepted_item of accepted) {
      if (titleSimilarity(item.title, accepted_item.title) > 0.8) {
        tooSimilar = true;
        break;
      }
    }
    if (tooSimilar) {
      continue;
    }

    batchUrls.add(normUrl);
    accepted.push(item);
  }

  return accepted;
}
