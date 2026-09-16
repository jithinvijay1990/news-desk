const IST_OFFSET = 5.5 * 60 * 60 * 1000;
const PAGE_SIZE = 60;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'india', label: 'India Markets' },
  { id: 'global', label: 'Global Markets' },
  { id: 'geo', label: 'Geopolitics' },
  { id: 'crude', label: 'Crude & Commodities' },
  { id: 'macro', label: 'Macro & Policy' },
  { id: 'health', label: 'Health & Emerging Risks' },
];

const $ = (id) => document.getElementById(id);

const state = {
  cat: 'all',
  date: istToday(),
  page: 1,
  hideZero: localStorage.getItem('hideZero') === '1',
  highOnly: localStorage.getItem('highOnly') === '1',
  groupDupes: localStorage.getItem('groupDupes') !== '0', // on by default
  query: '',
  items: [],
  updated: 0,     // when the server last polled the feeds
  fetchedAt: 0,   // when this page last read the server
};

function istToday() {
  return new Date(Date.now() + IST_OFFSET).toISOString().slice(0, 10);
}
function shiftDay(key, delta) {
  return new Date(Date.parse(`${key}T00:00:00Z`) + delta * 86400000).toISOString().slice(0, 10);
}
function istStamp(ts) {
  const d = new Date(ts + IST_OFFSET);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}, ${hh}:${mm}`;
}
function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function scoreClass(sc) {
  if (sc >= 12) return 'sc-hi';
  if (sc >= 6) return 'sc-mid';
  return 'sc0';
}

// ------------------------------------------------------------------ render
function renderTabs() {
  $('tabs').innerHTML = CATEGORIES.map(
    (c) => `<button class="tab${c.id === state.cat ? ' active' : ''}" data-cat="${c.id}">${c.label}</button>`
  ).join('');
}

/**
 * Collapse the same story carried by several outlets into one row, keeping the
 * highest-scoring copy and listing the other sources on it.
 */
function collapse(items) {
  if (!state.groupDupes) return items;
  const by = new Map();
  for (const i of items) {
    const key = i.h || i.id;
    const seen = by.get(key);
    if (!seen) {
      by.set(key, { ...i, dupes: [] });
      continue;
    }
    const better = i.sc > seen.sc || (i.sc === seen.sc && i.ts > seen.ts);
    if (better) by.set(key, { ...i, dupes: [...new Set([...seen.dupes, seen.s])] });
    else if (i.s !== seen.s) seen.dupes = [...new Set([...seen.dupes, i.s])];
  }
  return [...by.values()].sort((a, b) => b.ts - a.ts);
}

function visibleItems() {
  const q = state.query.trim().toLowerCase();
  return collapse(state.items).filter((i) => {
    if (state.cat !== 'all' && !i.c.includes(state.cat)) return false;
    if (state.highOnly && i.sc < 12) return false;
    else if (state.hideZero && i.sc === 0) return false;
    if (q && !(`${i.t} ${i.d || ''} ${i.s} ${(i.tg || []).join(' ')}`.toLowerCase().includes(q))) return false;
    return true;
  });
}

function renderList() {
  const all = visibleItems();
  const pages = Math.max(1, Math.ceil(all.length / PAGE_SIZE));
  if (state.page > pages) state.page = pages;
  const slice = all.slice((state.page - 1) * PAGE_SIZE, state.page * PAGE_SIZE);

  $('list').innerHTML = slice.length
    ? slice.map(rowHtml).join('')
    : `<div class="empty">No stories for these filters on ${state.date}.</div>`;

  const pager = `
    ${state.page > 1 ? '<button data-page="prev">&larr; Newer</button>' : ''}
    <span>Page ${state.page} of ${pages} &middot; ${all.length} stories</span>
    ${state.page < pages ? '<button data-page="next">Older &rarr;</button>' : ''}`;
  $('pagerTop').innerHTML = pager;
  $('pagerBottom').innerHTML = pager;
}

function rowHtml(i) {
  const assets = (i.a || []).map((a) => `<span class="asset">${esc(a)}</span>`).join('');
  const why = (i.w || []).length ? ` &middot; <span class="why">${esc(i.w.join(', '))}</span>` : '';
  const dupes = (i.dupes || []).length
    ? `<span class="dupes" title="Also carried by: ${esc(i.dupes.join(', '))}">+${i.dupes.length}</span>`
    : '';
  return `<article class="row">
    <div class="time">${istStamp(i.ts)}</div>
    <div class="sc ${scoreClass(i.sc)}">${i.sc}</div>
    <div>
      <a class="headline" href="${esc(i.u || '#')}" target="_blank" rel="noopener noreferrer"
         title="${esc(i.d || '')}">${esc(i.t)}</a>
      <div class="sub">${assets}<span class="${i.se}">${i.se}</span> &middot; ${i.cf}%${why}</div>
    </div>
    <div class="src">${esc(i.s)}${dupes}</div>
  </article>`;
}

function renderImportant(data) {
  const items = collapse(data.items || []);
  $('importantList').innerHTML = items.length
    ? items
        .map(
          (i) => `<div class="imp-row">
            <span class="sc">${i.sc}</span>
            <div>
              <a href="${esc(i.u || '#')}" target="_blank" rel="noopener noreferrer">${esc(i.t)}</a>
              ${(i.a || []).length ? `<div class="imp-assets">${i.a.map((a) => `<span class="asset">${esc(a)}</span>`).join('')}</div>` : ''}
              <div class="imp-meta">${esc(i.s)}${(i.dupes || []).length ? ` +${i.dupes.length}` : ''} &middot; ${istStamp(i.ts)}${i.d ? ` &middot; ${esc(i.d.slice(0, 110))}` : ''}</div>
            </div>
          </div>`
        )
        .join('')
    : '<div class="empty">Nothing above the impact threshold since the last close.</div>';
}

function ago(ts) {
  if (!ts) return 'never';
  const mins = Math.round((Date.now() - ts) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return hrs < 24 ? `${hrs}h ago` : `${Math.floor(hrs / 24)}d ago`;
}

/**
 * Two different clocks, and conflating them made a working page look stuck: the
 * feeds are polled hourly, so that timestamp only moves once an hour however
 * often the page reloads. Show when this page last checked as well.
 */
function renderUpdated() {
  $('updated').textContent = state.updated
    ? `UPDATED · ${istStamp(state.updated)} IST · checked ${ago(state.fetchedAt)}`
    : 'UPDATED · never';
  $('todayFlag').textContent = state.date === istToday() ? 'Today' : '';
}

/**
 * Days the app was not running were reconstructed from news archives, which
 * sample rather than mirror the feeds. Say so rather than letting a thin day
 * look like a quiet one.
 */
function renderDayNote() {
  const note = $('dayNote');
  const items = state.items;
  const bf = items.filter((i) => i.bf).length;
  if (!items.length || bf / items.length < 0.8) {
    note.hidden = true;
    return;
  }
  note.innerHTML =
    `<b>Backfilled day.</b> The app was not running on ${state.date}; these ${bf} stories were `
    + 'reconstructed afterwards from dated news-archive searches, so coverage is a sample rather '
    + 'than the full feed stream, and summaries are missing.';
  note.hidden = false;
}

// -------------------------------------------------------------------- data
async function loadDay() {
  $('list').innerHTML = '<div class="empty">Loading…</div>';
  const res = await fetch(`/api/day?date=${state.date}`);
  const data = await res.json();
  state.items = data.items || [];
  state.updated = data.updated || state.updated;
  state.fetchedAt = Date.now();
  state.page = 1;
  renderUpdated();
  renderDayNote();
  renderList();
}

async function loadImportant() {
  const res = await fetch('/api/important');
  renderImportant(await res.json());
}

async function showHealth() {
  const res = await fetch('/api/health');
  const meta = await res.json();
  $('healthBody').innerHTML =
    `<div class="hrow"><span>${meta.okCount}/${meta.total} feeds OK</span>` +
    `<span>last poll ${meta.updated ? istStamp(meta.updated) + ' IST' : 'never'}</span></div>` +
    (meta.previousRun
      ? `<div class="hrow"><span>gap since previous run</span><span class="${
          meta.updated - meta.previousRun > 100 * 60000 ? 'bad' : 'good'
        }">${Math.round((meta.updated - meta.previousRun) / 60000)} min</span></div>`
      : '') +
    (meta.feeds || [])
      .map(
        (f) => `<div class="hrow"><span>${esc(f.name)}</span>
          <span class="${f.ok ? 'good' : 'bad'}">${
            f.ok
              ? `${f.count} items · ${f.ms}ms`
              : `${esc((f.error || 'failed').slice(0, 60))}${f.lastOk ? ` · last good ${istStamp(f.lastOk)}` : ' · never succeeded'}`
          }</span></div>`
      )
      .join('');
  $('healthDialog').showModal();
}

// ------------------------------------------------------------------ events
function wire() {
  $('tabs').addEventListener('click', (e) => {
    const btn = e.target.closest('.tab');
    if (!btn) return;
    state.cat = btn.dataset.cat;
    state.page = 1;
    renderTabs();
    renderList();
  });

  $('dateInput').value = state.date;
  $('dateInput').addEventListener('change', (e) => {
    state.date = e.target.value || istToday();
    loadDay();
  });
  $('prevDay').addEventListener('click', () => {
    state.date = shiftDay(state.date, -1);
    $('dateInput').value = state.date;
    loadDay();
  });
  $('nextDay').addEventListener('click', () => {
    if (state.date >= istToday()) return;
    state.date = shiftDay(state.date, 1);
    $('dateInput').value = state.date;
    loadDay();
  });

  const bindChk = (id, key) => {
    const el = $(id);
    el.checked = state[key];
    el.addEventListener('change', () => {
      state[key] = el.checked;
      localStorage.setItem(key, el.checked ? '1' : '0');
      state.page = 1;
      renderList();
    });
  };
  bindChk('hideZero', 'hideZero');
  bindChk('highOnly', 'highOnly');
  bindChk('groupDupes', 'groupDupes');

  let searchTimer;
  $('search').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.query = e.target.value;
      state.page = 1;
      renderList();
    }, 180);
  });

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-page]');
    if (!btn) return;
    state.page += btn.dataset.page === 'next' ? 1 : -1;
    renderList();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  $('healthBtn').addEventListener('click', showHealth);
  $('closeHealth').addEventListener('click', () => $('healthDialog').close());

  $('refreshBtn').addEventListener('click', async () => {
    const btn = $('refreshBtn');
    btn.disabled = true;
    try {
      // Ingestion is split into batches server-side (Workers subrequest limit),
      // so a manual refresh has to walk them.
      const first = await (await fetch('/api/refresh?batch=0')).json();
      const batches = first.batches || 1;
      for (let b = 1; b < batches; b++) {
        btn.textContent = `refreshing ${b + 1}/${batches}…`;
        await fetch(`/api/refresh?batch=${b}`);
      }
      await Promise.all([loadDay(), loadImportant()]);
    } finally {
      btn.disabled = false;
      btn.textContent = 'refresh feeds';
    }
  });
}

// -------------------------------------------------------------------- boot
renderTabs();
wire();
loadDay();
loadImportant();
// Auto-refresh.
//
// A bare setInterval was not enough: mobile browsers suspend timers in a
// backgrounded tab, so reopening the app (or restoring it from the back/forward
// cache) could show stale data indefinitely — the tick that would have refreshed
// it never ran. Refresh on every event that means "the user is looking at this
// again", throttled so the events cannot stampede.
let refreshing = false;
async function refreshIfStale(maxAgeMs) {
  if (refreshing) return;
  if (state.date !== istToday()) return;          // past days never change
  if (Date.now() - state.fetchedAt < maxAgeMs) return;
  refreshing = true;
  try {
    await Promise.all([loadDay(), loadImportant()]);
  } catch {
    /* offline or a blip: the next trigger tries again */
  } finally {
    refreshing = false;
  }
}

setInterval(() => refreshIfStale(4.5 * 60 * 1000), 5 * 60 * 1000);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') refreshIfStale(60 * 1000);
});
window.addEventListener('focus', () => refreshIfStale(60 * 1000));
window.addEventListener('pageshow', (e) => refreshIfStale(e.persisted ? 0 : 60 * 1000));
window.addEventListener('online', () => refreshIfStale(0));

// Keep the "checked Nm ago" label honest between refreshes.
setInterval(renderUpdated, 30 * 1000);

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}
