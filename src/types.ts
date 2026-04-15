export interface RSSSource {
  url: string;
  name: string;
}

export interface DiffPage {
  url: string;
  name: string;
  selector?: string;
}

export interface Config {
  sources: {
    rss: RSSSource[];
    diff_pages: DiffPage[];
  };
  keywords: {
    include: string[];
    exclude: string[];
  };
  llm: {
    provider: string;
    model: string;
  };
  retention: {
    latest_days: number;
    seen_urls_days: number;
  };
}

export interface RawItem {
  title: string;
  link: string;
  published: string;
  content?: string;
  source: string;
}

export interface DiffAlert {
  page: string;
  url: string;
  old_snippet: string;
  new_snippet: string;
  detected_at: string;
}

export interface ProcessedItem {
  title: string;
  summary: string;
  category: "novedad" | "alerta";
  entities: string[];
  event_type:
    | "release"
    | "pricing_change"
    | "deprecation"
    | "outage"
    | "funding"
    | "partnership"
    | "other";
  key_numbers: string[];
  signal: "positive" | "negative" | "neutral";
  impact: "high" | "medium" | "low";
  why_included: string;
  source_url: string;
  published_at: string;
  confidence: number;
}

export interface ScanResult {
  items: ProcessedItem[];
  feedHealth: Record<string, boolean>;
  diffHealth: Record<string, boolean>;
  timestamp: string;
}

export type SeenUrls = Record<string, string>;
