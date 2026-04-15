import { readFileSync, writeFileSync, appendFileSync, existsSync } from "fs";
import { join } from "path";
import type { SeenUrls, ProcessedItem } from "./types.js";

/**
 * Load seen URLs from a JSON file.
 * Returns an empty object if the file does not exist.
 */
export function loadSeenUrls(path: string): SeenUrls {
  if (!existsSync(path)) {
    return {};
  }
  try {
    const raw = readFileSync(path, "utf-8");
    return JSON.parse(raw) as SeenUrls;
  } catch {
    console.warn(`[data] Failed to parse ${path}, starting fresh`);
    return {};
  }
}

/**
 * Save seen URLs as JSON to the given path.
 */
export function saveSeenUrls(path: string, urls: SeenUrls): void {
  writeFileSync(path, JSON.stringify(urls, null, 2), "utf-8");
}

/**
 * Remove entries from SeenUrls that are older than maxDays from now.
 * Returns a new object with only recent entries.
 */
export function pruneSeenUrls(urls: SeenUrls, maxDays: number): SeenUrls {
  const cutoff = Date.now() - maxDays * 24 * 60 * 60 * 1000;
  const pruned: SeenUrls = {};
  for (const [url, dateStr] of Object.entries(urls)) {
    if (new Date(dateStr).getTime() >= cutoff) {
      pruned[url] = dateStr;
    }
  }
  return pruned;
}

/**
 * Load the latest processed items from a JSON file.
 * Returns an empty array if the file does not exist.
 */
export function loadLatest(path: string): ProcessedItem[] {
  if (!existsSync(path)) {
    return [];
  }
  try {
    const raw = readFileSync(path, "utf-8");
    return JSON.parse(raw) as ProcessedItem[];
  } catch {
    console.warn(`[data] Failed to parse ${path}, starting fresh`);
    return [];
  }
}

/**
 * Save items to the latest JSON file, filtering to only those
 * published within retentionDays.
 */
export function saveLatest(
  path: string,
  items: ProcessedItem[],
  retentionDays: number
): void {
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  const filtered = items.filter(
    (item) => new Date(item.published_at).getTime() >= cutoff
  );
  writeFileSync(path, JSON.stringify(filtered, null, 2), "utf-8");
}

/**
 * Append items as NDJSON to monthly archive files in archiveDir.
 * Each item is written to {archiveDir}/YYYY-MM.ndjson based on published_at.
 */
export function appendArchive(archiveDir: string, items: ProcessedItem[]): void {
  for (const item of items) {
    const date = new Date(item.published_at);
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, "0");
    const filename = `${year}-${month}.ndjson`;
    const filePath = join(archiveDir, filename);
    appendFileSync(filePath, JSON.stringify(item) + "\n", "utf-8");
  }
}
