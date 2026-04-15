import * as cheerio from "cheerio";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import type { DiffPage, DiffAlert } from "./types.js";

/**
 * Extracts clean text from HTML.
 * Removes script, style, nav, footer, header elements.
 * If selector is provided, extract from that element; otherwise from body.
 * Normalizes whitespace and trims.
 */
export function extractText(html: string, selector?: string): string {
  const $ = cheerio.load(html);

  // Remove noise elements
  $("script, style, nav, footer, header").remove();

  let text: string;
  if (selector) {
    const el = $(selector);
    text = el.length > 0 ? el.text() : $("body").text();
  } else {
    text = $("body").text();
  }

  // Normalize whitespace: collapse multiple spaces/newlines to a single space, trim
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Compares two text strings after whitespace normalization.
 * Returns null if identical, or { old_snippet, new_snippet } with first ~500 chars each.
 */
export function detectChanges(
  oldText: string,
  newText: string
): { old_snippet: string; new_snippet: string } | null {
  const normalizeWs = (s: string) => s.replace(/\s+/g, " ").trim();

  const normOld = normalizeWs(oldText);
  const normNew = normalizeWs(newText);

  if (normOld === normNew) return null;

  return {
    old_snippet: normOld.slice(0, 500),
    new_snippet: normNew.slice(0, 500),
  };
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

/**
 * Fetches a page, extracts text, compares to stored snapshot.
 * On first run saves snapshot and returns null.
 * On subsequent runs updates snapshot and returns DiffAlert if changed, null if same.
 */
export async function checkPage(
  page: DiffPage,
  snapshotsDir: string
): Promise<DiffAlert | null> {
  const response = await fetch(page.url);
  const html = await response.text();
  const currentText = extractText(html, page.selector);

  const slug = slugify(page.name);
  const snapshotPath = join(snapshotsDir, `${slug}.txt`);

  // Ensure directory exists
  if (!existsSync(snapshotsDir)) {
    mkdirSync(snapshotsDir, { recursive: true });
  }

  // No snapshot yet: first run
  if (!existsSync(snapshotPath)) {
    writeFileSync(snapshotPath, currentText, "utf-8");
    return null;
  }

  const previousText = readFileSync(snapshotPath, "utf-8");
  const diff = detectChanges(previousText, currentText);

  // Always update snapshot
  writeFileSync(snapshotPath, currentText, "utf-8");

  if (!diff) return null;

  return {
    page: page.name,
    url: page.url,
    old_snippet: diff.old_snippet,
    new_snippet: diff.new_snippet,
    detected_at: new Date().toISOString(),
  };
}

/**
 * Runs checkPage sequentially for all pages (to avoid rate limiting).
 * Returns alerts and health status per page.
 */
export async function checkAllPages(
  pages: DiffPage[],
  snapshotsDir: string
): Promise<{ alerts: DiffAlert[]; health: Record<string, boolean> }> {
  const alerts: DiffAlert[] = [];
  const health: Record<string, boolean> = {};

  for (const page of pages) {
    try {
      const alert = await checkPage(page, snapshotsDir);
      health[page.name] = true;
      if (alert) alerts.push(alert);
    } catch {
      health[page.name] = false;
    }
  }

  return { alerts, health };
}
