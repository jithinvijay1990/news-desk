/**
 * Backfills days the app was not running, from two public news archives.
 *
 * Run from a home connection, NOT from the Worker: Google News answers a
 * residential IP but returns 503 to Cloudflare's egress. Results are thinner
 * than a live day (these indexes are samples, not the full feed firehose), so
 * every item is flagged `bf: 1` and the UI labels the day as backfilled.
 *
 *   node scripts/backfill-gap.mjs <out-dir> <first-day> <last-day>
 */
import { writeFileSync, mkdirSync, appendFileSync } from 'node:fs';
import { parseFeed, decodeEntities } from '../src/rss.js';
import { analyse } from '../src/score.js';

const [OUT, FIRST, LAST] = process.argv.slice(2);
if (!OUT || !FIRST || !LAST) {
  console.error('usage: node scripts/backfill-gap.mjs <out-dir> <YYYY-MM-DD> <YYYY-MM-DD>');
  process.exit(1);
}

const IST_OFFSET = 5.5 * 60 * 60 * 1000;
const UA = {
  'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
};

// Topic queries mirroring the app's categories.
const QUERIES = [
  { q: 'nifty OR sensex',                                  region: 'in',    hint: 'india', w: 4 },
  { q: '"stock market" India OR "Indian equities"',        region: 'in',    hint: 'india', w: 3 },
  { q: 'RBI OR "monetary policy" India',                   region: 'in',    hint: 'macro', w: 4 },
  { q: 'rupee OR "foreign investors" OR FII India',        region: 'in',    hint: 'india', w: 3 },
  { q: 'India tariff OR "trade deal" OR exports',          region: 'in',    hint: 'macro', w: 3 },
  { q: '"Federal Reserve" OR "US inflation" OR rate cut',  region: 'world', hint: 'macro', w: 4 },
  { q: '"crude oil" OR OPEC OR brent',                     region: 'world', hint: 'crude', w: 3 },
  { q: '"gold price" OR bullion OR silver',                region: 'world', hint: 'crude', w: 2 },
  { q: 'Wall Street OR Nasdaq OR "S&P 500"',               region: 'world', hint: 'global', w: 3 },
  { q: 'Israel OR Iran OR Ukraine OR Taiwan tensions',     region: 'world', hint: 'geo',   w: 2 },
];

// Domain -> the publisher label shown in the UI.
const DOMAINS = {
  'economictimes.indiatimes.com': 'ET Markets',
  'livemint.com': 'Mint',
  'business-standard.com': 'Business Standard',
  'thehindubusinessline.com': 'BusinessLine',
  'moneycontrol.com': 'Moneycontrol',
  'cnbctv18.com': 'CNBC-TV18',
  'ndtvprofit.com': 'NDTV Profit',
  'financialexpress.com': 'Financial Express',
  'thehindu.com': 'The Hindu',
  'timesofindia.indiatimes.com': 'Times of India',
  'reuters.com': 'Reuters',
  'bloomberg.com': 'Bloomberg',
  'cnbc.com': 'CNBC',
  'marketwatch.com': 'MarketWatch',
  'finance.yahoo.com': 'Yahoo Finance',
  'investing.com': 'Investing.com',
  'oilprice.com': 'OilPrice.com',
  'aljazeera.com': 'Al Jazeera',
  'bbc.com': 'BBC',
  'bbc.co.uk': 'BBC',
  'theguardian.com': 'Guardian',
  'ft.com': 'FT',
  'wsj.com': 'WSJ',
  'scmp.com': 'SCMP',
  'channelnewsasia.com': 'Channel NewsAsia',
  'straitstimes.com': 'Straits Times',
  'asia.nikkei.com': 'Nikkei Asia',
};
const label = (domain) => DOMAINS[domain] || domain.replace(/^www\./, '');

function hashId(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}
const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'on', 'for', 'at', 'as', 'by', 'is', 'are',
  'was', 'were', 'be', 'been', 'it', 'its', 'this', 'that', 'with', 'from', 'after', 'over',
  'says', 'say', 'said', 'new', 'up', 'down', 'not', 'but', 'has', 'have', 'will', 'live',
  'update', 'updates', 'today', 'latest', 'amid', 'ahead', 'more', 'than', 'his', 'her', 'their',
]);
function storyHash(title) {
  const words = title.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
  const key = [...new Set(words)].sort((a, b) => b.length - a.length).slice(0, 6).sort().join(' ');
  return hashId(key || title.toLowerCase());
}
const istDayKey = (ts) => new Date(ts + IST_OFFSET).toISOString().slice(0, 10);
const shift = (day, n) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url, tries = 2, timeout = 20000) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(timeout) });
      if (res.ok) return await res.text();
      if (res.status === 429 || res.status >= 500) await sleep(1500 * (i + 1));
      else return null;
    } catch {
      if (i + 1 < tries) await sleep(1000);
    }
  }
  return null;
}

// GDELT throttles hard after a burst and then just hangs. Treat it as a bonus:
// give up on it entirely once it has failed repeatedly.
let gdeltFails = 0;
let gdeltEnabled = true;

function progress(line) {
  console.log(line);
  appendFileSync(`${OUT}/progress.log`, `${line}
`); // console.log is block-buffered to a file
}

/** GDELT indexes the full article stream and accepts an explicit UTC window. */
async function gdelt(query, day) {
  const start = day.replace(/-/g, '') + '000000';
  const end = shift(day, 1).replace(/-/g, '') + '000000';
  const url = 'https://api.gdeltproject.org/api/v2/doc/doc'
    + `?query=${encodeURIComponent(`${query} sourcelang:eng`)}`
    + `&mode=artlist&maxrecords=250&format=json&startdatetime=${start}&enddatetime=${end}`;
  if (!gdeltEnabled) return [];
  const body = await get(url, 1, 12000);
  if (!body) {
    if (++gdeltFails >= 5) {
      gdeltEnabled = false;
      progress('  (gdelt throttled - continuing with google news only)');
    }
    return [];
  }
  gdeltFails = 0;
  let json;
  try { json = JSON.parse(body); } catch { return []; }
  return (json.articles || []).map((a) => {
    // GDELT timestamps look like 20260815T174500Z.
    const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(a.seendate || '');
    const ts = m ? Date.parse(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`) : NaN;
    return {
      title: decodeEntities(a.title || '').replace(/\s+([,.:;!?])/g, '$1').replace(/\s+/g, ' ').trim(),
      link: a.url,
      source: label(a.domain || ''),
      ts,
    };
  });
}

/** Google News accepts after:/before: in the query, but honours them loosely. */
async function googleNews(query, day) {
  const url = 'https://news.google.com/rss/search'
    + `?q=${encodeURIComponent(`${query} after:${shift(day, -1)} before:${shift(day, 2)}`)}`
    + '&hl=en-IN&gl=IN&ceid=IN:en';
  const body = await get(url);
  if (!body) return [];
  const items = parseFeed(body);
  // <source url="...">Publisher</source> sits alongside each item.
  const sources = [...body.matchAll(/<source[^>]*>([^<]+)<\/source>/gi)].map((m) => decodeEntities(m[1]));
  return items.map((i, idx) => {
    const publisher = sources[idx] || '';
    // Google appends " - Publisher" to every headline.
    const title = publisher && i.title.endsWith(` - ${publisher}`)
      ? i.title.slice(0, -(publisher.length + 3))
      : i.title;
    return { title: title.trim(), link: i.link, source: publisher || 'Google News', ts: i.published };
  });
}

const days = [];
for (let d = FIRST; d <= LAST; d = shift(d, 1)) days.push(d);
console.log(`backfilling ${days.length} days: ${FIRST} → ${LAST}`);
mkdirSync(OUT, { recursive: true });

// Both archives honour the date window loosely, so a request for day D also
// returns items from D-1 and D+1. Keep everything and file it under its own day
// rather than discarding it and asking again later.
const wanted = new Set(days);
const collected = new Map(); // day -> Map(id -> item)
const seenStory = new Map(); // day -> Set(storyHash)

function absorb(raw, spec) {
  if (!raw.title || !raw.link || !Number.isFinite(raw.ts)) return;
  const day = istDayKey(raw.ts);
  if (!wanted.has(day)) return;
  if (!collected.has(day)) { collected.set(day, new Map()); seenStory.set(day, new Set()); }
  const byId = collected.get(day);
  const id = hashId(raw.link);
  if (byId.has(id)) return;
  const h = storyHash(raw.title);
  if (seenStory.get(day).has(h)) return; // same story, other archive or other query
  seenStory.get(day).add(h);
  const feed = { name: raw.source, weight: spec.w, region: spec.region, hint: spec.hint };
  const { score, cats, sentiment, confidence, tags, assets, why } = analyse(
    { title: raw.title, description: '' }, feed
  );
  byId.set(id, {
    id, h,
    t: raw.title.slice(0, 300),
    d: '',
    u: raw.link,
    s: raw.source,
    ts: raw.ts,
    sc: score, c: cats, se: sentiment, cf: confidence, tg: tags, a: assets, w: why,
    bf: 1, // backfilled from an index, not captured live
  });
}

for (const day of days) {
  for (const spec of QUERIES) {
    const [g, n] = await Promise.all([gdelt(spec.q, day), googleNews(spec.q, day)]);
    for (const raw of [...g, ...n]) absorb(raw, spec);
    await sleep(250);
  }
  progress(`  ${day}  ${String(collected.get(day)?.size || 0).padStart(4)} items so far`);
}

const manifest = [];
for (const day of days) {
  const list = [...(collected.get(day)?.values() || [])].sort((a, b) => b.ts - a.ts);
  if (!list.length) continue;
  writeFileSync(`${OUT}/${day}.json`, JSON.stringify(list));
  manifest.push({ day, n: list.length });
}
writeFileSync(`${OUT}/manifest.json`, JSON.stringify(manifest, null, 1));
const total = manifest.reduce((a, b) => a + b.n, 0);
progress(`done: ${manifest.length} days, ${total} items (avg ${Math.round(total / (manifest.length || 1))}/day)`);
