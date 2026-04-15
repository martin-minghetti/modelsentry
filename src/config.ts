import { readFileSync } from "fs";
import yaml from "js-yaml";
import type { Config } from "./types.js";

export function loadConfig(path: string): Config {
  const raw = readFileSync(path, "utf-8");
  const parsed = yaml.load(raw) as Record<string, unknown>;

  if (!parsed || typeof parsed !== "object") {
    throw new Error("Invalid config: YAML must be an object");
  }

  const requiredSections = ["sources", "keywords", "llm", "retention"] as const;
  for (const section of requiredSections) {
    if (!(section in parsed) || parsed[section] == null) {
      throw new Error(`Invalid config: missing required section '${section}'`);
    }
  }

  return parsed as unknown as Config;
}
