import { mkdirSync, existsSync, writeFileSync } from "fs";
import { join } from "path";
import { loadConfig } from "./config.js";
import { fetchAllFeeds } from "./scraper.js";
import { filterItems } from "./filter.js";
import { checkAllPages } from "./diff-monitor.js";
import { processWithLLM } from "./llm.js";
import {
  loadSeenUrls,
  saveSeenUrls,
  pruneSeenUrls,
  loadLatest,
  saveLatest,
  appendArchive,
} from "./data.js";
import { generateFeed } from "./feed.js";
import { buildDashboard } from "./dashboard.js";
import type { ProcessedItem, ScanResult } from "./types.js";

/**
 * Merges existing and new ProcessedItems:
 * - Deduplicates by source_url (keeps the newer published_at)
 * - Sorts by published_at descending (newest first)
 * - Pure function — does not mutate inputs
 */
export function mergeResults(
  existing: ProcessedItem[],
  newItems: ProcessedItem[]
): ProcessedItem[] {
  const map = new Map<string, ProcessedItem>();

  for (const item of existing) {
    map.set(item.source_url, item);
  }

  for (const item of newItems) {
    const current = map.get(item.source_url);
    if (!current) {
      map.set(item.source_url, item);
    } else {
      // Keep the one with the newer published_at
      const currentTime = new Date(current.published_at).getTime();
      const itemTime = new Date(item.published_at).getTime();
      if (itemTime > currentTime) {
        map.set(item.source_url, item);
      }
    }
  }

  return Array.from(map.values()).sort(
    (a, b) =>
      new Date(b.published_at).getTime() - new Date(a.published_at).getTime()
  );
}

export interface PipelineOptions {
  configPath: string;
  dataDir: string;
  apiKey: string;
  siteUrl: string;
}

/**
 * Orchestrates the full modelsentry scan pipeline:
 * 1. Load config
 * 2. Load and prune seen URLs
 * 3. Fetch all RSS feeds
 * 4. Pre-filter items
 * 5. Check all diff pages
 * 6. Process candidates with LLM
 * 7. Update and save seen URLs
 * 8. Merge with existing latest, save latest
 * 9. Append new items to archive
 * 10. Write feed.xml
 * 11. Return ScanResult
 */
export async function runPipeline(options: PipelineOptions): Promise<ScanResult> {
  const { configPath, dataDir, apiKey, siteUrl } = options;

  // Ensure data directory exists
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }

  const snapshotsDir = join(dataDir, "snapshots");
  const archiveDir = join(dataDir, "archive");
  const seenUrlsPath = join(dataDir, "seen_urls.json");
  const latestPath = join(dataDir, "latest.json");

  // Step 1: Load config
  const config = loadConfig(configPath);

  // Step 2: Load and prune seen URLs
  let seenUrls = loadSeenUrls(seenUrlsPath);
  seenUrls = pruneSeenUrls(seenUrls, config.retention.seen_urls_days);

  // Step 3: Fetch all RSS feeds
  const { items: rawItems, health: feedHealth } = await fetchAllFeeds(
    config.sources.rss
  );

  // Step 4: Pre-filter items
  const candidates = filterItems(rawItems, config.keywords, seenUrls);

  // Step 5: Check all diff pages
  const { alerts: diffAlerts, health: diffHealth } = await checkAllPages(
    config.sources.diff_pages,
    snapshotsDir
  );

  // Step 6: Process candidates with LLM (skip if nothing to process)
  const processedItems =
    candidates.length === 0 && diffAlerts.length === 0
      ? []
      : await processWithLLM(candidates, diffAlerts, apiKey, config.llm.model);

  // Step 7: Update seen URLs with new item URLs, then save
  const now = new Date().toISOString();
  for (const item of processedItems) {
    seenUrls[item.source_url] = now;
  }
  // Also mark candidate URLs as seen so they aren't re-fetched next run
  for (const candidate of candidates) {
    if (!(candidate.link in seenUrls)) {
      seenUrls[candidate.link] = now;
    }
  }
  saveSeenUrls(seenUrlsPath, seenUrls);

  // Step 8: Load existing latest, merge, save
  const existingLatest = loadLatest(latestPath);
  const merged = mergeResults(existingLatest, processedItems);

  if (!existsSync(archiveDir)) {
    mkdirSync(archiveDir, { recursive: true });
  }

  saveLatest(latestPath, merged, config.retention.latest_days);

  // Step 9: Append new items to archive
  appendArchive(archiveDir, processedItems);

  // Step 10: Generate and write feed.xml
  const feedXml = generateFeed(merged, siteUrl);
  writeFileSync(join(dataDir, "feed.xml"), feedXml, "utf-8");

  // Step 11: Build static dashboard
  const result: ScanResult = {
    items: processedItems,
    feedHealth,
    diffHealth,
    timestamp: now,
  };

  buildDashboard({
    dataDir: options.dataDir,
    distDir: "dist",
    siteUrl: options.siteUrl,
    scanResult: result,
  });

  return result;
}
