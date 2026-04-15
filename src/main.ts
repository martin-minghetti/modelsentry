import { runPipeline } from "./pipeline.js";

async function main(): Promise<void> {
  // Read environment variables
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    console.error("[modelsentry] Fatal: GOOGLE_API_KEY environment variable is required");
    process.exit(1);
  }

  const siteUrl =
    process.env.SITE_URL ?? "https://martin-minghetti.github.io/modelsentry";
  const configPath = process.env.CONFIG_PATH ?? "config.yaml";
  const dataDir = process.env.DATA_DIR ?? "data";

  try {
    console.log("[modelsentry] Starting scan...");
    console.log(`[modelsentry]   config: ${configPath}`);
    console.log(`[modelsentry]   dataDir: ${dataDir}`);
    console.log(`[modelsentry]   siteUrl: ${siteUrl}`);

    const result = await runPipeline({ configPath, dataDir, apiKey, siteUrl });

    // Log summary
    const itemCount = result.items.length;
    console.log(`[modelsentry] Scan complete at ${result.timestamp}`);
    console.log(`[modelsentry] Items processed: ${itemCount}`);

    // Feed health
    const feedEntries = Object.entries(result.feedHealth);
    if (feedEntries.length > 0) {
      const healthy = feedEntries.filter(([, ok]) => ok).length;
      console.log(
        `[modelsentry] Feed health: ${healthy}/${feedEntries.length} sources OK`
      );
      for (const [name, ok] of feedEntries) {
        if (!ok) {
          console.warn(`[modelsentry]   WARN feed unhealthy: ${name}`);
        }
      }
    }

    // Diff health
    const diffEntries = Object.entries(result.diffHealth);
    if (diffEntries.length > 0) {
      const healthy = diffEntries.filter(([, ok]) => ok).length;
      console.log(
        `[modelsentry] Diff health: ${healthy}/${diffEntries.length} pages OK`
      );
      for (const [name, ok] of diffEntries) {
        if (!ok) {
          console.warn(`[modelsentry]   WARN diff page unhealthy: ${name}`);
        }
      }
    }

    process.exit(0);
  } catch (err) {
    console.error("[modelsentry] Fatal error during scan:", err);
    process.exit(1);
  }
}

main();
