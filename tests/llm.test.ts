import { describe, it, expect } from "vitest";
import {
  buildPrompt,
  validateItem,
  parseResponse,
} from "../src/llm.js";
import type { RawItem, DiffAlert, ProcessedItem } from "../src/types.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRawItem(overrides: Partial<RawItem> = {}): RawItem {
  return {
    title: "OpenAI releases GPT-5",
    link: "https://openai.com/blog/gpt-5",
    published: "2025-06-01T00:00:00Z",
    source: "OpenAI Blog",
    ...overrides,
  };
}

function makeDiffAlert(overrides: Partial<DiffAlert> = {}): DiffAlert {
  return {
    page: "OpenAI Pricing",
    url: "https://openai.com/pricing",
    old_snippet: "gpt-4o: $5 per 1M tokens",
    new_snippet: "gpt-4o: $8 per 1M tokens",
    detected_at: "2025-06-01T12:00:00Z",
    ...overrides,
  };
}

function makeProcessedItem(overrides: Partial<ProcessedItem> = {}): ProcessedItem {
  return {
    title: "OpenAI releases GPT-5",
    summary: "OpenAI has released GPT-5, a major new language model.",
    category: "novedad",
    entities: ["OpenAI", "GPT-5"],
    event_type: "release",
    key_numbers: [],
    signal: "positive",
    impact: "high",
    why_included: "Major model release",
    source_url: "https://openai.com/blog/gpt-5",
    published_at: "2025-06-01T00:00:00Z",
    confidence: 0.95,
    ...overrides,
  };
}

// ─── buildPrompt ──────────────────────────────────────────────────────────────

describe("buildPrompt", () => {
  it("returns a non-empty string", () => {
    const prompt = buildPrompt([], []);
    expect(typeof prompt).toBe("string");
    expect(prompt.length).toBeGreaterThan(0);
  });

  it("includes the severity rubric for high impact items", () => {
    const prompt = buildPrompt([], []);
    const lower = prompt.toLowerCase();
    expect(lower).toMatch(/high/);
    expect(lower).toMatch(/deprecation|pricing|breaking|security/);
  });

  it("includes the severity rubric for medium impact items", () => {
    const prompt = buildPrompt([], []);
    const lower = prompt.toLowerCase();
    expect(lower).toMatch(/medium/);
    expect(lower).toMatch(/release|sdk|feature|funding/);
  });

  it("includes the severity rubric for low impact items", () => {
    const prompt = buildPrompt([], []);
    const lower = prompt.toLowerCase();
    expect(lower).toMatch(/low/);
    expect(lower).toMatch(/blog|tutorial|community|minor/);
  });

  it("instructs LLM to return a JSON array", () => {
    const prompt = buildPrompt([], []);
    expect(prompt).toMatch(/json/i);
    expect(prompt).toMatch(/array|\[/i);
  });

  it("includes RawItem data in the prompt", () => {
    const item = makeRawItem({ title: "Unique title XYZ-9876" });
    const prompt = buildPrompt([item], []);
    expect(prompt).toContain("Unique title XYZ-9876");
    expect(prompt).toContain(item.link);
    expect(prompt).toContain(item.source);
  });

  it("includes DiffAlert data in the prompt", () => {
    const diff = makeDiffAlert({ page: "SpecialPage-4321" });
    const prompt = buildPrompt([], [diff]);
    expect(prompt).toContain("SpecialPage-4321");
    expect(prompt).toContain(diff.url);
  });

  it("handles multiple items and diffs", () => {
    const items = [
      makeRawItem({ title: "Item One", link: "https://a.com" }),
      makeRawItem({ title: "Item Two", link: "https://b.com" }),
    ];
    const diffs = [
      makeDiffAlert({ page: "Page A" }),
      makeDiffAlert({ page: "Page B" }),
    ];
    const prompt = buildPrompt(items, diffs);
    expect(prompt).toContain("Item One");
    expect(prompt).toContain("Item Two");
    expect(prompt).toContain("Page A");
    expect(prompt).toContain("Page B");
  });

  it("includes all required ProcessedItem field names in the schema description", () => {
    const prompt = buildPrompt([], []);
    const fields = [
      "title", "summary", "category", "entities", "event_type",
      "key_numbers", "signal", "impact", "why_included",
      "source_url", "published_at", "confidence",
    ];
    for (const field of fields) {
      expect(prompt).toContain(field);
    }
  });
});

// ─── validateItem ─────────────────────────────────────────────────────────────

describe("validateItem", () => {
  it("returns true for a valid ProcessedItem", () => {
    expect(validateItem(makeProcessedItem())).toBe(true);
  });

  it("returns false for non-object values", () => {
    expect(validateItem(null)).toBe(false);
    expect(validateItem(undefined)).toBe(false);
    expect(validateItem("string")).toBe(false);
    expect(validateItem(42)).toBe(false);
    expect(validateItem([])).toBe(false);
  });

  it("returns false when required fields are missing", () => {
    const required = [
      "title", "summary", "category", "entities", "event_type",
      "key_numbers", "signal", "impact", "why_included",
      "source_url", "published_at", "confidence",
    ];
    for (const field of required) {
      const item = makeProcessedItem() as Record<string, unknown>;
      delete item[field];
      expect(validateItem(item)).toBe(false);
    }
  });

  it("returns false for invalid category enum", () => {
    expect(validateItem(makeProcessedItem({ category: "invalid" as "novedad" }))).toBe(false);
  });

  it("returns true for all valid category values", () => {
    expect(validateItem(makeProcessedItem({ category: "novedad" }))).toBe(true);
    expect(validateItem(makeProcessedItem({ category: "alerta" }))).toBe(true);
  });

  it("returns false for invalid event_type enum", () => {
    expect(validateItem(makeProcessedItem({ event_type: "unknown" as "release" }))).toBe(false);
  });

  it("returns true for all valid event_type values", () => {
    const validTypes: ProcessedItem["event_type"][] = [
      "release", "pricing_change", "deprecation", "outage", "funding", "partnership", "other",
    ];
    for (const et of validTypes) {
      expect(validateItem(makeProcessedItem({ event_type: et }))).toBe(true);
    }
  });

  it("returns false for invalid signal enum", () => {
    expect(validateItem(makeProcessedItem({ signal: "bad" as "positive" }))).toBe(false);
  });

  it("returns true for all valid signal values", () => {
    const signals: ProcessedItem["signal"][] = ["positive", "negative", "neutral"];
    for (const s of signals) {
      expect(validateItem(makeProcessedItem({ signal: s }))).toBe(true);
    }
  });

  it("returns false for invalid impact enum", () => {
    expect(validateItem(makeProcessedItem({ impact: "extreme" as "high" }))).toBe(false);
  });

  it("returns true for all valid impact values", () => {
    const impacts: ProcessedItem["impact"][] = ["high", "medium", "low"];
    for (const i of impacts) {
      expect(validateItem(makeProcessedItem({ impact: i }))).toBe(true);
    }
  });

  it("returns false when confidence is not a number", () => {
    expect(validateItem(makeProcessedItem({ confidence: "0.9" as unknown as number }))).toBe(false);
  });

  it("returns false when confidence is out of range", () => {
    expect(validateItem(makeProcessedItem({ confidence: -0.1 }))).toBe(false);
    expect(validateItem(makeProcessedItem({ confidence: 1.1 }))).toBe(false);
  });

  it("returns true for confidence at boundary values 0 and 1", () => {
    expect(validateItem(makeProcessedItem({ confidence: 0 }))).toBe(true);
    expect(validateItem(makeProcessedItem({ confidence: 1 }))).toBe(true);
  });

  it("returns false when entities is not an array", () => {
    expect(validateItem(makeProcessedItem({ entities: "OpenAI" as unknown as string[] }))).toBe(false);
  });

  it("returns false when key_numbers is not an array", () => {
    expect(validateItem(makeProcessedItem({ key_numbers: 42 as unknown as string[] }))).toBe(false);
  });
});

// ─── parseResponse ────────────────────────────────────────────────────────────

describe("parseResponse", () => {
  const validItem = makeProcessedItem();

  it("parses a raw JSON array string", () => {
    const text = JSON.stringify([validItem]);
    const result = parseResponse(text);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe(validItem.title);
  });

  it("parses JSON array wrapped in markdown code block", () => {
    const text = "Here is your result:\n```json\n" + JSON.stringify([validItem]) + "\n```\nDone.";
    const result = parseResponse(text);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe(validItem.title);
  });

  it("parses JSON array wrapped in plain code block (no language tag)", () => {
    const text = "```\n" + JSON.stringify([validItem]) + "\n```";
    const result = parseResponse(text);
    expect(result).toHaveLength(1);
  });

  it("extracts array when embedded in surrounding text", () => {
    const text = "Some preamble text\n" + JSON.stringify([validItem]) + "\nsome trailing text";
    const result = parseResponse(text);
    expect(result).toHaveLength(1);
  });

  it("returns empty array for invalid JSON", () => {
    expect(parseResponse("this is not json at all")).toHaveLength(0);
    expect(parseResponse("{not valid}")).toHaveLength(0);
  });

  it("filters out invalid items and keeps valid ones", () => {
    const invalidItem = { title: "Bad item" }; // missing many required fields
    const text = JSON.stringify([validItem, invalidItem]);
    const result = parseResponse(text);
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe(validItem.title);
  });

  it("returns empty array when all items are invalid", () => {
    const text = JSON.stringify([{ bad: "data" }, { also: "bad" }]);
    expect(parseResponse(text)).toHaveLength(0);
  });

  it("returns empty array for empty JSON array", () => {
    expect(parseResponse("[]")).toHaveLength(0);
  });

  it("returns empty array for empty string", () => {
    expect(parseResponse("")).toHaveLength(0);
  });

  it("handles multiple valid items", () => {
    const item2 = makeProcessedItem({
      title: "Anthropic pricing change",
      event_type: "pricing_change",
      source_url: "https://anthropic.com/pricing",
    });
    const text = JSON.stringify([validItem, item2]);
    const result = parseResponse(text);
    expect(result).toHaveLength(2);
  });
});
