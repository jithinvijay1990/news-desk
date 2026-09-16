// One-off migration: old market-news-desk D1 archive -> news-desk KV day keys.
// Re-scores every row with the CURRENT scoring code so the imported history
// ranks consistently with new stories, rather than mixing two scoring systems.
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { FEEDS } from 'file:///D:/news/src/feeds.js';
import { analyse } from 'file:///D:/news/src/score.js';
import { decodeEntities } from 'file:///D:/news/src/rss.js';

const DIR = process.argv[2];
const OUT = `${DIR}/days`;
const IST_OFFSET = 5.5 * 60 * 60 * 1000;
const MAX_ITEMS_PER_DAY = 2500;

// Old source names -> the current registry, for weight/region/hint.
const ALIAS = {
  'Livemint Markets': 'Mint Markets',
  'Hindu BusinessLine Markets': 'BusinessLine Markets',
};
const byName = new Map(FEEDS.map((f) => [f.name, f]));
function feedFor(source) {
  const f = byName.get(ALIAS[source] || source);
  if (f) return f;
  return { name: source, weight: 3, region: /india|mint|ET |Business Standard|RBI/i.test(source) ? 'in' : 'world', hint: null };
}

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

// ---- load exported pages ----
const rows = [];
for (const f of readdirSync(DIR).filter((f) => f.startsWith('page-'))) {
  const raw = readFileSync(`${DIR}/${f}`, 'utf8');
  const json = JSON.parse(raw.slice(raw.indexOf('[')));
  rows.push(...(json[0].results || []));
}
console.log('rows loaded:', rows.length);

// ---- transform ----
const byDay = new Map();
let skipped = 0;
for (const r of rows) {
  const ts = Date.parse(r.published_utc || r.fetched_utc || '');
  if (!Number.isFinite(ts) || !r.title || !r.link) { skipped++; continue; }
  const feed = feedFor(r.source);
  // The old DB stored titles without decoding entities (&#x2019; etc).
  const title = decodeEntities(r.title).replace(/\s+/g, ' ').trim();
  const summary = decodeEntities(r.summary || '').replace(/\s+/g, ' ').trim();
  const entry = { title, description: summary };
  const { score, cats, sentiment, confidence, tags, assets, why } = analyse(entry, feed);
  const item = {
    id: hashId(r.link),
    h: storyHash(title),
    t: title.slice(0, 300),
    d: summary.slice(0, 180),
    u: r.link,
    s: r.source,
    ts,
    sc: score,
    c: cats,
    se: sentiment,
    cf: confidence,
    tg: tags,
    a: assets,
    w: why,
  };
  const day = istDayKey(ts);
  if (!byDay.has(day)) byDay.set(day, new Map());
  byDay.get(day).set(item.id, item); // dedupe by link within the day
}

mkdirSync(OUT, { recursive: true });
const manifest = [];
for (const [day, map] of [...byDay.entries()].sort()) {
  const list = [...map.values()].sort((a, b) => b.ts - a.ts).slice(0, MAX_ITEMS_PER_DAY);
  if (list.length < 20) continue; // skip the stale-feed noise days (1-19 rows)
  writeFileSync(`${OUT}/${day}.json`, JSON.stringify(list));
  manifest.push({ day, n: list.length });
}
writeFileSync(`${DIR}/manifest.json`, JSON.stringify(manifest, null, 1));
console.log('skipped (no date/title/link):', skipped);
console.log('days written:', manifest.length, '| items:', manifest.reduce((a, b) => a + b.n, 0));
console.log(manifest.map((m) => `${m.day}:${m.n}`).join('  '));
