import { GoogleGenerativeAI } from "@google/generative-ai";
import type { RawItem, DiffAlert, ProcessedItem } from "./types.js";

// ─── buildPrompt ──────────────────────────────────────────────────────────────

export function buildPrompt(items: RawItem[], diffs: DiffAlert[]): string {
  const itemsSection =
    items.length === 0
      ? "(none)"
      : items
          .map(
            (item, i) =>
              `[Item ${i + 1}]
Title: ${item.title}
URL: ${item.link}
Source: ${item.source}
Published: ${item.published}
${item.content ? `Content: ${item.content}` : ""}`.trim()
          )
          .join("\n\n");

  const diffsSection =
    diffs.length === 0
      ? "(none)"
      : diffs
          .map(
            (diff, i) =>
              `[Diff ${i + 1}]
Page: ${diff.page}
URL: ${diff.url}
Old: ${diff.old_snippet}
New: ${diff.new_snippet}
Detected at: ${diff.detected_at}`
          )
          .join("\n\n");

  return `You are an AI analyst monitoring the LLM/AI industry. Your task is to analyze the following news items and website diff alerts, then return structured intelligence.

## Severity Rubric

**High impact:**
- Deprecation with a concrete end-of-life date
- Pricing increase for an existing product
- Breaking API change
- Security vulnerability

**Medium impact:**
- New model release
- SDK update or significant feature launch
- Funding round

**Low impact:**
- Blog post or tutorial
- Community discussion
- Minor update or patch

## Output Schema

Return a JSON array of objects. Each object must have ALL of the following fields:

- title (string): concise title
- summary (string): 1-2 sentence summary
- category (string): "novedad" or "alerta"
- entities (array of strings): companies, models, or products mentioned
- event_type (string): one of "release", "pricing_change", "deprecation", "outage", "funding", "partnership", "other"
- key_numbers (array of strings): important figures or metrics
- signal (string): "positive", "negative", or "neutral"
- impact (string): "high", "medium", or "low" (use the rubric above)
- why_included (string): one sentence explaining why this is relevant
- source_url (string): the source URL
- published_at (string): ISO 8601 datetime
- confidence (number): float between 0 and 1

## News Items

${itemsSection}

## Website Diff Alerts

${diffsSection}

## Instructions

Analyze each item and diff alert above. Return ONLY a JSON array (no markdown, no explanation outside the array) with one object per relevant item. If an item is not relevant to the AI/LLM industry, omit it. Apply the severity rubric to assign the correct impact level.`;
}

// ─── validateItem ─────────────────────────────────────────────────────────────

const VALID_CATEGORY = new Set<string>(["novedad", "alerta"]);
const VALID_EVENT_TYPE = new Set<string>([
  "release",
  "pricing_change",
  "deprecation",
  "outage",
  "funding",
  "partnership",
  "other",
]);
const VALID_SIGNAL = new Set<string>(["positive", "negative", "neutral"]);
const VALID_IMPACT = new Set<string>(["high", "medium", "low"]);

export function validateItem(obj: unknown): obj is ProcessedItem {
  if (obj === null || typeof obj !== "object" || Array.isArray(obj)) {
    return false;
  }

  const item = obj as Record<string, unknown>;

  const requiredStringFields = [
    "title",
    "summary",
    "why_included",
    "source_url",
    "published_at",
  ];
  for (const field of requiredStringFields) {
    if (typeof item[field] !== "string") return false;
  }

  if (!VALID_CATEGORY.has(item["category"] as string)) return false;
  if (!VALID_EVENT_TYPE.has(item["event_type"] as string)) return false;
  if (!VALID_SIGNAL.has(item["signal"] as string)) return false;
  if (!VALID_IMPACT.has(item["impact"] as string)) return false;

  if (!Array.isArray(item["entities"])) return false;
  if (!Array.isArray(item["key_numbers"])) return false;

  const confidence = item["confidence"];
  if (typeof confidence !== "number") return false;
  if (confidence < 0 || confidence > 1) return false;

  return true;
}

// ─── parseResponse ────────────────────────────────────────────────────────────

export function parseResponse(text: string): ProcessedItem[] {
  if (!text || text.trim() === "") return [];

  // Attempt 1: direct JSON parse
  try {
    const parsed = JSON.parse(text.trim());
    if (Array.isArray(parsed)) {
      return parsed.filter(validateItem);
    }
  } catch {
    // fall through
  }

  // Attempt 2: extract from markdown code block (```json ... ``` or ``` ... ```)
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (codeBlockMatch) {
    try {
      const parsed = JSON.parse(codeBlockMatch[1].trim());
      if (Array.isArray(parsed)) {
        return parsed.filter(validateItem);
      }
    } catch {
      // fall through
    }
  }

  // Attempt 3: find [ ... ] array in the text
  const arrayMatch = text.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    try {
      const parsed = JSON.parse(arrayMatch[0]);
      if (Array.isArray(parsed)) {
        return parsed.filter(validateItem);
      }
    } catch {
      // fall through
    }
  }

  return [];
}

// ─── processWithLLM ───────────────────────────────────────────────────────────

export async function processWithLLM(
  items: RawItem[],
  diffs: DiffAlert[],
  apiKey: string,
  model: string
): Promise<ProcessedItem[]> {
  try {
    const prompt = buildPrompt(items, diffs);
    const genAI = new GoogleGenerativeAI(apiKey);
    const generativeModel = genAI.getGenerativeModel({ model });
    const result = await generativeModel.generateContent(prompt);
    const text = result.response.text();
    return parseResponse(text);
  } catch (err) {
    console.warn("[llm] processWithLLM failed:", err);
    return [];
  }
}
