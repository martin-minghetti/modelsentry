# modelsentry

> Zero-cost AI early warning system for developers — runs entirely on GitHub Actions and GitHub Pages.

Never be caught off guard by a model deprecation, pricing change, or breaking SDK release again. modelsentry monitors the AI ecosystem 24/7 and surfaces only the signals that matter, powered by Gemini's free tier.

---

## What It Monitors

**RSS Feeds (8 sources)**
- Hacker News — AI-filtered posts
- r/ClaudeAI subreddit
- Claude Code releases (GitHub)
- Anthropic SDK Python releases (GitHub)
- OpenAI Blog
- Google AI Blog
- Simon Willison's blog
- AI News digest (smol.ai)

**Provider Pages — diff detection (5 pages)**
- OpenAI Pricing
- OpenAI Deprecations
- Anthropic Pricing
- Anthropic Model Deprecations
- Google Gemini Pricing

---

## Quick Start

1. **Fork** this repository
2. Go to **Settings → Secrets and variables → Actions** → add a secret named `GOOGLE_API_KEY` (free key from [Google AI Studio](https://aistudio.google.com/apikey))
3. Go to **Actions** → click *"I understand my workflows, go ahead and enable them"*
4. Go to **Settings → Pages** → set source to **Deploy from a branch**, branch `gh-pages`, folder `/ (root)`
5. Done — your dashboard is live at `https://<your-username>.github.io/modelsentry/`

The workflow runs automatically every day at 08:00 UTC. You can also trigger it manually from the Actions tab.

---

## How It Works

```
┌─────────────────────────────────────────────────────────┐
│                    GitHub Actions (daily)                │
│                                                         │
│  RSS Feeds (8)  ──►  Pre-filter          Gemini LLM     │
│                      (keywords +   ──►  (relevance +    │
│  Provider Pages ──►   dedup)             metadata)      │
│  (5, diff-based)                              │         │
│                                               ▼         │
│                                    Structured JSON       │
│                                         │    │          │
│                                         ▼    ▼          │
│                                    Dashboard  RSS Feed   │
│                                   (gh-pages) (feed.xml) │
└─────────────────────────────────────────────────────────┘
```

1. **Fetch** — RSS feeds are parsed and provider pages are fetched and diffed against the previous snapshot stored in `data/`.
2. **Pre-filter** — Items are matched against include/exclude keywords and deduplicated by URL (seen URLs expire after 90 days).
3. **LLM analysis** — Remaining items are sent to Gemini 2.5 Flash-Lite, which extracts structured metadata: category, severity, affected models, and a one-line summary.
4. **Persist** — Results are committed back to `data/` and the static `dist/` folder (dashboard + RSS feed) is deployed to GitHub Pages.

---

## Configuration

Edit [`config.yaml`](./config.yaml) to customise sources and filtering:

```yaml
keywords:
  include:
    - claude
    - openai
    - model deprecation
    - pricing
  exclude:
    - crypto
    - nft

retention:
  latest_days: 30      # Items shown in dashboard
  seen_urls_days: 90   # Dedup window
```

Add or remove RSS feeds and diff-watched pages under the `sources` key. Each diff page accepts a CSS `selector` to limit the tracked region of the page.

---

## BYOK — Bring Your Own Key

modelsentry uses the **Gemini 2.5 Flash-Lite** model on Google's free tier. You supply your own API key so:

- There is **no cost** for normal usage (well within free-tier limits)
- Your key stays in your own GitHub repository secrets — it is never shared
- You can swap in any other Gemini model by changing `llm.model` in `config.yaml`

Get a free key at [aistudio.google.com/apikey](https://aistudio.google.com/apikey).

---

## RSS Feed

Your deployment exposes a standard RSS feed at:

```
https://<your-username>.github.io/modelsentry/feed.xml
```

Subscribe with any RSS reader (Feedly, NetNewsWire, etc.) to receive AI ecosystem alerts in your existing workflow.

---

## Local Development

```bash
git clone https://github.com/<your-username>/modelsentry
cd modelsentry
npm install

# Run a full scan (writes results to data/ and dist/)
GOOGLE_API_KEY=your-key npm run scan

# Preview the dashboard
npx serve dist
```

Run the test suite:

```bash
npm test
```

**Stack:** TypeScript · Node.js 20 · Vitest · GitHub Actions · GitHub Pages

---

## License

MIT — see [LICENSE](./LICENSE) for details.
