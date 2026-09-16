# News Desk

Market-impact news aggregator for Indian equity traders — India + global feeds, scored,
categorised and archived by IST trading day.

**Live:** https://news-desk.jithinvijay1990.workers.dev

## How it works

- A Cloudflare **Worker** (`src/index.js`) polls 45 RSS/Atom feeds **hourly between 06:00 and
  22:00 IST** (cron `30 0-16 * * *`). Nothing is polled between 23:00 and 06:00 IST.
- Each headline is scored 0–25 for likely impact on the Indian market, tagged with
  categories, the **instruments it plausibly moves** (Nifty/Sensex, Bank Nifty, Rupee,
  Crude/OMCs, Gold, Bond yields, IT, Metals, Pharma, Auto, US equities), a
  bullish/bearish/neutral read, a confidence number, and **the keywords that produced the
  score** so a ranking can be argued with (`src/score.js`). All deterministic keyword
  matching — no API keys, no LLM calls, no npm dependencies.
- The same story from several outlets is collapsed into one row (`+N` badge lists the other
  sources) via a word-order-independent story hash. Toggle it off with "Merge same story".
- Items are stored in **Workers KV** under one key per IST day (`d:YYYY-MM-DD`, 45-day TTL),
  which is what powers the date navigation.
- The static UI in `public/` is served by the Worker's assets binding, installable as a PWA.

## Layout

| Path | Purpose |
| --- | --- |
| `src/index.js` | Worker: ingest loop, cron handler, JSON API |
| `src/feeds.js` | Feed registry (name, url, weight, region, category hint) |
| `src/rss.js` | Dependency-free RSS 2.0 / Atom parser |
| `src/score.js` | Impact score, categories, sentiment, tags |
| `public/` | UI (`index.html`, `app.js`, `styles.css`), manifest, service worker |

## API

| Endpoint | Returns |
| --- | --- |
| `GET /api/day?date=YYYY-MM-DD` | All stories for that IST day (defaults to today) |
| `GET /api/important` | Score ≥ 10 since the previous 15:30 IST market close |
| `GET /api/health` | Per-feed status from the last poll, plus when each feed last succeeded |
| `GET /api/refresh?batch=N` | Forces a poll of one batch (no-op if that batch ran under 30s ago) |

## Development

```bash
npm install
npx wrangler dev          # http://127.0.0.1:8788, local KV
npx wrangler deploy
npx wrangler tail         # live logs
```

KV namespace: `NEWS` (`d4cfb328b8fc49628e9cc585b064ff0c`), bound in `wrangler.jsonc`.

## Why ingestion is batched

The free Workers plan allows **50 subrequests per invocation** (every feed fetch and every KV
operation counts) and **5 cron triggers per account** — and this account's other Workers
already hold four. So there is a single cron, which ingests batch 0 and then calls the Worker
back through the `SELF` service binding for batch 1; that call starts a fresh invocation with
its own subrequest budget. Raise `BATCHES` in `src/index.js` if the feed list grows past ~80.

## Deployment

Pushes to `main` deploy automatically via `.github/workflows/deploy.yml`
(`cloudflare/wrangler-action`), which then smoke-tests the live URL and prints the feed
health count. Two repository secrets are required:

| Secret | Value |
| --- | --- |
| `CLOUDFLARE_ACCOUNT_ID` | the account id shown by `wrangler whoami` |
| `CLOUDFLARE_API_TOKEN` | a Cloudflare API token using the **Edit Cloudflare Workers** template (needs Workers Scripts: Edit and Workers KV Storage: Edit) |

Create the token at **dash.cloudflare.com → My Profile → API Tokens**, then
`gh secret set CLOUDFLARE_API_TOKEN`. `wrangler deploy` still works by hand for anything
urgent.

## Feed notes

**Reuters retired public RSS in 2020** — every `reuters.com` feed path returns 404 or 401, and
the openrss.org and rsshub mirrors are empty or blocked. Reuters copy comes in via
syndicators instead (Channel NewsAsia, Straits Times). **Bloomberg's own feeds work**
(`feeds.bloomberg.com/{markets,economics,politics,industries,technology}/news.rss`).

Some publishers block Cloudflare's egress IPs even though they work from a home
connection — Google News RSS returns 503, Bing News returns an empty document, NDTV Profit
and MarketScreener return 403, and Moneycontrol's RSS files are frozen in 2024. `GET /api/health` is the quickest way to
spot a feed that has started failing; drop or replace it in `src/feeds.js`.

## Ported from the original (`market-news-desk`)

The July 2026 version of this app still runs at `market-news-desk.jithinvijay1990.workers.dev`
on D1 (21.5k archived articles). Its script can't be downloaded through an OAuth token, but
four ideas from its schema are now here: `matched_keywords` → the "why" line, `assets` → the
instrument chips, `story_hash` → cross-source merging, and `feed_status.last_success_utc` →
"last good …" in the health dialog.

## Tuning the score

`src/score.js` holds the keyword lists. `HIGH` terms are worth 4 points each (capped at 3
hits), `MEDIUM` 2, `LOW` 1, plus the source weight, +3 for direct India relevance and +2
when a high-impact term is in the headline rather than the body. Matching is on whole-word
1–3 grams, so "against" no longer counts as "gain".
