import { describe, it, expect } from "vitest";
import { writeFileSync, unlinkSync, mkdtempSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { loadConfig } from "../src/config.js";

const VALID_YAML = `
sources:
  rss:
    - name: HN Filtered
      url: https://hnrss.org/newest?q=claude
  diff_pages:
    - name: OpenAI Pricing
      url: https://openai.com/api/pricing/
      selector: main
keywords:
  include:
    - claude
    - openai
  exclude:
    - crypto
llm:
  provider: gemini
  model: gemini-2.5-flash-lite
retention:
  latest_days: 30
  seen_urls_days: 90
`;

describe("loadConfig", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "modelsentry-test-"));
  });

  it("loads a valid YAML config and returns a typed Config object", () => {
    const configPath = join(tmpDir, "config.yaml");
    writeFileSync(configPath, VALID_YAML, "utf-8");

    const config = loadConfig(configPath);

    expect(config.sources.rss).toHaveLength(1);
    expect(config.sources.rss[0].name).toBe("HN Filtered");
    expect(config.sources.rss[0].url).toBe("https://hnrss.org/newest?q=claude");

    expect(config.sources.diff_pages).toHaveLength(1);
    expect(config.sources.diff_pages[0].name).toBe("OpenAI Pricing");
    expect(config.sources.diff_pages[0].selector).toBe("main");

    expect(config.keywords.include).toContain("claude");
    expect(config.keywords.exclude).toContain("crypto");

    expect(config.llm.provider).toBe("gemini");
    expect(config.llm.model).toBe("gemini-2.5-flash-lite");

    expect(config.retention.latest_days).toBe(30);
    expect(config.retention.seen_urls_days).toBe(90);
  });

  it("throws an error when the file does not exist", () => {
    expect(() => loadConfig(join(tmpDir, "nonexistent.yaml"))).toThrow();
  });

  it("throws when 'sources' section is missing", () => {
    const yaml = `
keywords:
  include: [claude]
  exclude: [crypto]
llm:
  provider: gemini
  model: gemini-2.5-flash-lite
retention:
  latest_days: 30
  seen_urls_days: 90
`;
    const p = join(tmpDir, "missing-sources.yaml");
    writeFileSync(p, yaml, "utf-8");
    expect(() => loadConfig(p)).toThrow(/sources/i);
  });

  it("throws when 'keywords' section is missing", () => {
    const yaml = `
sources:
  rss: []
  diff_pages: []
llm:
  provider: gemini
  model: gemini-2.5-flash-lite
retention:
  latest_days: 30
  seen_urls_days: 90
`;
    const p = join(tmpDir, "missing-keywords.yaml");
    writeFileSync(p, yaml, "utf-8");
    expect(() => loadConfig(p)).toThrow(/keywords/i);
  });

  it("throws when 'llm' section is missing", () => {
    const yaml = `
sources:
  rss: []
  diff_pages: []
keywords:
  include: [claude]
  exclude: []
retention:
  latest_days: 30
  seen_urls_days: 90
`;
    const p = join(tmpDir, "missing-llm.yaml");
    writeFileSync(p, yaml, "utf-8");
    expect(() => loadConfig(p)).toThrow(/llm/i);
  });

  it("throws when 'retention' section is missing", () => {
    const yaml = `
sources:
  rss: []
  diff_pages: []
keywords:
  include: [claude]
  exclude: []
llm:
  provider: gemini
  model: gemini-2.5-flash-lite
`;
    const p = join(tmpDir, "missing-retention.yaml");
    writeFileSync(p, yaml, "utf-8");
    expect(() => loadConfig(p)).toThrow(/retention/i);
  });
});
