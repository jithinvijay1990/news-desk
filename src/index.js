import { FEEDS } from './feeds.js';
import { parseFeed } from './rss.js';
import { analyse } from './score.js';

const IST_OFFSET = 5.5 * 60 * 60 * 1000;
const MARKET_CLOSE_MIN = 15 * 60 + 30; // 15:30 IST
const DAY_TTL_SECONDS = 60 * 60 * 24 * 45;
const MAX_ITEMS_PER_DAY = 2500;
const FETCH_TIMEOUT_MS = 12000;
const CONCURRENCY = 8;

// A Worker invocation on the free plan may make 50 subrequests, and every feed
// fetch plus every KV operation counts. So the feed list is ingested in batches,
// one per cron trigger, staggered five minutes apart.
const BATCHES = 2;
const QUIET_FROM_IST_HOUR = 23; // no scheduled polling 23:00-06:00 IST
const QUIET_TO_IST_HOUR = 6;

function feedsForBatch(batch) {
  return FEEDS.filter((_, i) => i % BATCHES === batch);
}

function inQuietHours(ts) {
  const hour = istDate(ts).getUTCHours();
  return hour >= QUIET_FROM_IST_HOUR || hour < QUIET_TO_IST_HOUR;
}

// ---------------------------------------------------------------- time utils
export function istDate(ts) {
  return new Date(ts + IST_OFFSET); // read UTC getters off this = IST wall clock
}
export function istDayKey(ts) {
  return istDate(ts).toISOString().slice(0, 10);
}
function istMinutesOfDay(ts) {
  const d = istDate(ts);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}
function addDays(dayKey, delta) {
  const t = Date.parse(`${dayKey}T00:00:00Z`) + delta * 86400000;
  return new Date(t).toISOString().slice(0, 10);
}
/** Start (epoch ms) of the most recent completed market close, 15:30 IST. */
function previousMarketClose(now) {
  const today = istDayKey(now);
  const day = istMinutesOfDay(now) >= MARKET_CLOSE_MIN ? today : addDays(today, -1);
  return Date.parse(`${day}T00:00:00Z`) - IST_OFFSET + MARKET_CLOSE_MIN * 60000;
}

// ---------------------------------------------------------------- misc utils
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

/**
 * Identifies the same story carried by several outlets: drop stopwords, keep the
 * six most distinctive words, sort them so word order does not matter.
 */
function storyHash(title) {
  const words = title
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
  const key = [...new Set(words)].sort((a, b) => b.length - a.length).slice(0, 6).sort().join(' ');
  return hashId(key || title.toLowerCase());
}

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...extra,
    },
  });
}

async function pool(items, limit, worker) {
  const results = [];
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await worker(items[i]);
    }
  });
  await Promise.all(runners);
  return results;
}

// ---------------------------------------------------------------- ingestion
async function fetchFeed(feed) {
  const started = Date.now();
  try {
    const res = await fetch(feed.url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
      },
      cf: { cacheTtl: 120, cacheEverything: true },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xml = await res.text();
    const entries = parseFeed(xml);
    if (!entries.length) throw new Error('no items parsed');
    return { feed, entries, ok: true, ms: Date.now() - started };
  } catch (err) {
    return { feed, entries: [], ok: false, error: String(err.message || err), ms: Date.now() - started };
  }
}

function toItem(entry, feed, now) {
  const ts = entry.published && entry.published < now + 3600000 ? entry.published : now;
  const { score, cats, sentiment, confidence, tags, assets, why } = analyse(entry, feed);
  return {
    id: hashId(entry.link || `${feed.name}|${entry.title}`),
    h: storyHash(entry.title),
    t: entry.title.slice(0, 300),
    d: (entry.description || '').slice(0, 180),
    u: entry.link,
    s: feed.name,
    ts,
    sc: score,
    c: cats,
    se: sentiment,
    cf: confidence,
    tg: tags,
    a: assets,
    w: why,
  };
}

export async function ingest(env, batch = 0) {
  const now = Date.now();
  const results = await pool(feedsForBatch(batch), CONCURRENCY, fetchFeed);

  const byDay = new Map();
  const health = {};
  const validDays = new Set([istDayKey(now), addDays(istDayKey(now), -1), addDays(istDayKey(now), -2)]);

  for (const r of results) {
    health[r.feed.name] = {
      name: r.feed.name,
      ok: r.ok,
      count: r.entries.length,
      ms: r.ms,
      error: r.ok ? null : r.error,
      at: now,
      lastOk: r.ok ? now : null, // filled in from the previous record below
    };
    for (const entry of r.entries) {
      const item = toItem(entry, r.feed, now);
      const day = istDayKey(item.ts);
      if (!validDays.has(day)) continue;
      if (!byDay.has(day)) byDay.set(day, []);
      byDay.get(day).push(item);
    }
  }

  let written = 0;
  for (const [day, items] of byDay) {
    const existing = await readDay(env, day);
    const merged = new Map();
    for (const it of existing) merged.set(it.id, it);
    for (const it of items) if (!merged.has(it.id)) merged.set(it.id, it);
    const list = [...merged.values()]
      .sort((a, b) => b.ts - a.ts)
      .slice(0, MAX_ITEMS_PER_DAY);
    await env.NEWS.put(`d:${day}`, JSON.stringify(list), { expirationTtl: DAY_TTL_SECONDS });
    written += list.length;
  }

  // Each batch only knows about its own feeds, so merge into the stored health map,
  // keyed by name and pruned to feeds that still exist in the registry.
  const prev = await readMetaRaw(env);
  const known = new Set(FEEDS.map((f) => f.name));
  const prevFeeds = normaliseFeedHealth(prev.feeds);
  for (const [name, entry] of Object.entries(health)) {
    if (!entry.ok) entry.lastOk = prevFeeds[name]?.lastOk ?? null;
  }
  const merged = { ...prevFeeds, ...health };
  const feeds = {};
  for (const [name, entry] of Object.entries(merged)) if (known.has(name)) feeds[name] = entry;
  const all = Object.values(feeds);
  const meta = {
    updated: now,
    batch,
    batches: BATCHES,
    batchUpdated: { ...(prev.batchUpdated || {}), [batch]: now },
    feeds,
    okCount: all.filter((h) => h.ok).length,
    total: all.length,
    days: [...byDay.keys()],
    stored: written,
  };
  await env.NEWS.put('meta', JSON.stringify(meta));
  return meta;
}

async function readDay(env, day) {
  const raw = await env.NEWS.get(`d:${day}`, 'json');
  return Array.isArray(raw) ? raw : [];
}

async function readMetaRaw(env) {
  return (await env.NEWS.get('meta', 'json')) || {};
}

/** Tolerates the older array-shaped health record. */
function normaliseFeedHealth(feeds) {
  if (Array.isArray(feeds)) return Object.fromEntries(feeds.map((f) => [f.name, f]));
  return feeds && typeof feeds === 'object' ? feeds : {};
}

/** Public shape: feeds as a sorted array, failures first. */
async function readMeta(env) {
  const raw = await readMetaRaw(env);
  const feeds = Object.values(normaliseFeedHealth(raw.feeds)).sort(
    (a, b) => Number(a.ok) - Number(b.ok) || a.name.localeCompare(b.name)
  );
  return {
    updated: raw.updated || 0,
    batches: raw.batches || BATCHES,
    batchUpdated: raw.batchUpdated || {},
    okCount: feeds.filter((f) => f.ok).length,
    total: feeds.length || FEEDS.length,
    feeds,
  };
}

// ---------------------------------------------------------------- HTTP API
async function handleApi(url, env, ctx) {
  const path = url.pathname;

  if (path === '/api/day') {
    const now = Date.now();
    const day = /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get('date') || '')
      ? url.searchParams.get('date')
      : istDayKey(now);
    const [items, meta] = await Promise.all([readDay(env, day), readMeta(env)]);
    return json({ day, updated: meta.updated, count: items.length, items });
  }

  if (path === '/api/important') {
    const now = Date.now();
    const since = previousMarketClose(now);
    const days = new Set([istDayKey(now), istDayKey(since)]);
    const all = (await Promise.all([...days].map((d) => readDay(env, d)))).flat();
    const seen = new Set();
    const items = all
      .filter((i) => i.ts >= since && i.sc >= 10)
      .filter((i) => (seen.has(i.id) ? false : seen.add(i.id)))
      .sort((a, b) => b.ts - a.ts)
      .slice(0, 80);
    const meta = await readMeta(env);
    return json({ since, updated: meta.updated, items });
  }

  if (path === '/api/health') {
    const meta = await readMeta(env);
    return json(meta);
  }

  if (path === '/api/refresh') {
    const batch = Math.min(BATCHES - 1, Math.max(0, Number(url.searchParams.get('batch')) || 0));
    const prev = await readMetaRaw(env);
    const last = (prev.batchUpdated || {})[batch] || 0;
    if (Date.now() - last < 30000) {
      return json({ skipped: true, batch, batches: BATCHES, reason: 'this batch refreshed under 30s ago' });
    }
    const fresh = await ingest(env, batch);
    return json({
      ok: true,
      batch,
      batches: BATCHES,
      updated: fresh.updated,
      stored: fresh.stored,
      okCount: fresh.okCount,
      total: fresh.total,
    });
  }

  return json({ error: 'not found' }, 404);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      try {
        return await handleApi(url, env, ctx);
      } catch (err) {
        return json({ error: String(err.message || err) }, 500);
      }
    }
    return env.ASSETS.fetch(request);
  },

  async scheduled(event, env, ctx) {
    // The cron expression never fires during quiet hours; this is a belt-and-braces
    // guard in case the schedule is edited without updating the constants.
    if (inQuietHours(event.scheduledTime || Date.now())) return;
    ctx.waitUntil(
      (async () => {
        await ingest(env, 0);
        // Remaining batches run as separate invocations so each gets its own
        // subrequest budget. One service-binding call costs a single subrequest here.
        for (let b = 1; b < BATCHES; b++) {
          if (!env.SELF) break;
          await env.SELF.fetch(`https://news-desk.internal/api/refresh?batch=${b}`);
        }
      })()
    );
  },
};
