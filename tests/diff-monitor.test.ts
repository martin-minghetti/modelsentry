import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { extractText, detectChanges, checkPage } from "../src/diff-monitor.js";

// ─── extractText ─────────────────────────────────────────────────────────────

describe("extractText", () => {
  it("returns text content from body when no selector given", () => {
    const html = "<html><body><p>Hello world</p></body></html>";
    expect(extractText(html)).toBe("Hello world");
  });

  it("strips script tags", () => {
    const html = "<html><body><p>Visible</p><script>alert('hidden')</script></body></html>";
    expect(extractText(html)).not.toContain("hidden");
    expect(extractText(html)).toContain("Visible");
  });

  it("strips style tags", () => {
    const html = "<html><body><p>Content</p><style>.foo { color: red; }</style></body></html>";
    expect(extractText(html)).not.toContain("color");
    expect(extractText(html)).toContain("Content");
  });

  it("strips nav elements", () => {
    const html = "<html><body><nav>Nav links</nav><main>Main content</main></body></html>";
    expect(extractText(html)).not.toContain("Nav links");
    expect(extractText(html)).toContain("Main content");
  });

  it("strips footer elements", () => {
    const html = "<html><body><p>Body text</p><footer>Footer info</footer></body></html>";
    expect(extractText(html)).not.toContain("Footer info");
    expect(extractText(html)).toContain("Body text");
  });

  it("strips header elements", () => {
    const html = "<html><body><header>Header text</header><p>Page content</p></body></html>";
    expect(extractText(html)).not.toContain("Header text");
    expect(extractText(html)).toContain("Page content");
  });

  it("extracts text from a CSS selector when provided", () => {
    const html = "<html><body><div id='main'><p>Main section</p></div><aside>Aside text</aside></body></html>";
    expect(extractText(html, "#main")).toBe("Main section");
  });

  it("falls back to body when selector does not match", () => {
    const html = "<html><body><p>Fallback text</p></body></html>";
    expect(extractText(html, "#nonexistent")).toBe("Fallback text");
  });

  it("normalizes whitespace - collapses multiple spaces to single space", () => {
    const html = "<html><body><p>Hello   world</p></body></html>";
    expect(extractText(html)).toBe("Hello world");
  });

  it("normalizes whitespace - collapses newlines to single space", () => {
    const html = "<html><body><p>Hello\n\nworld\n</p></body></html>";
    expect(extractText(html)).toBe("Hello world");
  });

  it("trims the result", () => {
    const html = "<html><body>  <p>  trimmed  </p>  </body></html>";
    const result = extractText(html);
    expect(result).toBe(result.trim());
  });

  it("returns empty string for empty body", () => {
    const html = "<html><body></body></html>";
    expect(extractText(html)).toBe("");
  });
});

// ─── detectChanges ───────────────────────────────────────────────────────────

describe("detectChanges", () => {
  it("returns null when texts are identical", () => {
    expect(detectChanges("Hello world", "Hello world")).toBeNull();
  });

  it("returns null when texts are identical after whitespace normalization", () => {
    expect(detectChanges("Hello  world", "Hello world")).toBeNull();
    expect(detectChanges("Hello\n\nworld", "Hello world")).toBeNull();
    expect(detectChanges("  trimmed  ", "trimmed")).toBeNull();
  });

  it("returns snippets when texts differ", () => {
    const result = detectChanges("old content", "new content");
    expect(result).not.toBeNull();
    expect(result!.old_snippet).toBe("old content");
    expect(result!.new_snippet).toBe("new content");
  });

  it("truncates snippets to ~500 chars", () => {
    const longOld = "a".repeat(600);
    const longNew = "b".repeat(600);
    const result = detectChanges(longOld, longNew);
    expect(result).not.toBeNull();
    expect(result!.old_snippet.length).toBeLessThanOrEqual(500);
    expect(result!.new_snippet.length).toBeLessThanOrEqual(500);
  });

  it("returns the first 500 chars of each text as snippets", () => {
    const oldText = "x".repeat(600);
    const newText = "y".repeat(600);
    const result = detectChanges(oldText, newText);
    expect(result!.old_snippet).toBe("x".repeat(500));
    expect(result!.new_snippet).toBe("y".repeat(500));
  });

  it("returns object with old_snippet and new_snippet keys", () => {
    const result = detectChanges("foo", "bar");
    expect(result).toHaveProperty("old_snippet");
    expect(result).toHaveProperty("new_snippet");
  });
});

// ─── checkPage ───────────────────────────────────────────────────────────────

describe("checkPage", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "modelsentry-test-"));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(tmpDir, { recursive: true });
  });

  const mockFetch = (html: string) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      text: () => Promise.resolve(html),
    }));
  };

  it("saves snapshot and returns null on first run", async () => {
    const html = "<html><body><p>First visit</p></body></html>";
    mockFetch(html);

    const page = { url: "https://example.com", name: "example" };
    const result = await checkPage(page, tmpDir);

    expect(result).toBeNull();
    const snapshot = readFileSync(join(tmpDir, "example.txt"), "utf-8");
    expect(snapshot).toContain("First visit");
  });

  it("returns null when content is unchanged", async () => {
    const html = "<html><body><p>Same content</p></body></html>";
    mockFetch(html);

    const page = { url: "https://example.com", name: "example" };
    // First run - saves snapshot
    await checkPage(page, tmpDir);
    // Second run - same content
    const result = await checkPage(page, tmpDir);

    expect(result).toBeNull();
  });

  it("returns DiffAlert when content changes", async () => {
    const page = { url: "https://example.com", name: "example" };

    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce({ text: () => Promise.resolve("<html><body><p>Old content</p></body></html>") })
      .mockResolvedValueOnce({ text: () => Promise.resolve("<html><body><p>New content</p></body></html>") })
    );

    // First run
    await checkPage(page, tmpDir);
    // Second run with changed content
    const result = await checkPage(page, tmpDir);

    expect(result).not.toBeNull();
    expect(result!.page).toBe("example");
    expect(result!.url).toBe("https://example.com");
    expect(result!.old_snippet).toContain("Old content");
    expect(result!.new_snippet).toContain("New content");
    expect(result!.detected_at).toBeDefined();
  });

  it("updates snapshot after detecting a change", async () => {
    const page = { url: "https://example.com", name: "example" };

    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce({ text: () => Promise.resolve("<html><body><p>Version 1</p></body></html>") })
      .mockResolvedValueOnce({ text: () => Promise.resolve("<html><body><p>Version 2</p></body></html>") })
    );

    await checkPage(page, tmpDir);
    await checkPage(page, tmpDir);

    const snapshot = readFileSync(join(tmpDir, "example.txt"), "utf-8");
    expect(snapshot).toContain("Version 2");
  });

  it("slugifies page name for snapshot filename", async () => {
    const html = "<html><body><p>Content</p></body></html>";
    mockFetch(html);

    const page = { url: "https://example.com", name: "My Page Name" };
    await checkPage(page, tmpDir);

    const snapshot = readFileSync(join(tmpDir, "my-page-name.txt"), "utf-8");
    expect(snapshot).toContain("Content");
  });

  it("uses page selector when provided", async () => {
    const html = "<html><body><div id='content'><p>Selected</p></div><aside>Ignored</aside></body></html>";
    mockFetch(html);

    const page = { url: "https://example.com", name: "example", selector: "#content" };
    await checkPage(page, tmpDir);

    const snapshot = readFileSync(join(tmpDir, "example.txt"), "utf-8");
    expect(snapshot).toBe("Selected");
    expect(snapshot).not.toContain("Ignored");
  });

  it("detected_at is an ISO date string", async () => {
    const page = { url: "https://example.com", name: "example" };

    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce({ text: () => Promise.resolve("<html><body><p>Old</p></body></html>") })
      .mockResolvedValueOnce({ text: () => Promise.resolve("<html><body><p>New</p></body></html>") })
    );

    await checkPage(page, tmpDir);
    const result = await checkPage(page, tmpDir);

    expect(result).not.toBeNull();
    expect(() => new Date(result!.detected_at)).not.toThrow();
    expect(new Date(result!.detected_at).toISOString()).toBe(result!.detected_at);
  });
});
