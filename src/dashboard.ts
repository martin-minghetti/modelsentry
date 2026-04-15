import { mkdirSync, existsSync, copyFileSync, writeFileSync } from "fs";
import { join, dirname, resolve } from "path";
import { fileURLToPath } from "url";
import type { ScanResult } from "./types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface DashboardOptions {
  dataDir: string;
  distDir: string;
  siteUrl: string;
  scanResult: ScanResult;
}

/**
 * Builds the static dashboard:
 * - Copies template.html → distDir/index.html
 * - Copies latest.json and feed.xml from dataDir
 * - Writes scan_meta.json with health and item count
 */
export function buildDashboard(options: DashboardOptions): void {
  const { dataDir, distDir, siteUrl, scanResult } = options;

  // Ensure dist directory exists
  if (!existsSync(distDir)) {
    mkdirSync(distDir, { recursive: true });
  }

  // Resolve template path relative to this file's location (src/) → ../dashboard/template.html
  const templatePath = resolve(__dirname, "..", "dashboard", "template.html");
  copyFileSync(templatePath, join(distDir, "index.html"));

  // Copy latest.json
  const latestSrc = join(dataDir, "latest.json");
  if (existsSync(latestSrc)) {
    copyFileSync(latestSrc, join(distDir, "latest.json"));
  }

  // Copy feed.xml
  const feedSrc = join(dataDir, "feed.xml");
  if (existsSync(feedSrc)) {
    copyFileSync(feedSrc, join(distDir, "feed.xml"));
  }

  // Write scan_meta.json
  const meta = {
    feedHealth: scanResult.feedHealth,
    diffHealth: scanResult.diffHealth,
    timestamp: scanResult.timestamp,
    itemCount: scanResult.items.length,
  };
  writeFileSync(join(distDir, "scan_meta.json"), JSON.stringify(meta, null, 2), "utf-8");
}
