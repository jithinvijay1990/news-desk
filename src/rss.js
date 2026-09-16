// Hand-rolled RSS 2.0 / Atom parser. No dependencies, no DOM.

const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’',
  mdash: '—', ndash: '–', hellip: '…', eacute: 'é',
};

export function decodeEntities(str) {
  if (!str) return '';
  let out = str;
  // Run twice: feeds routinely double-encode (&amp;#x2019;).
  for (let pass = 0; pass < 2; pass++) {
    out = out.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (m, ent) => {
      if (ent[0] === '#') {
        const code = ent[1] === 'x' || ent[1] === 'X'
          ? parseInt(ent.slice(2), 16)
          : parseInt(ent.slice(1), 10);
        return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : m;
      }
      const v = ENTITIES[ent.toLowerCase()];
      return v === undefined ? m : v;
    });
  }
  return out;
}

function stripTags(str) {
  return decodeEntities(String(str || '').replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function unwrap(raw) {
  const cdata = raw.match(/<!\[CDATA\[([\s\S]*?)\]\]>/);
  return stripTags(cdata ? cdata[1] : raw);
}

// First matching child tag value inside a block.
function tag(block, ...names) {
  for (const name of names) {
    const re = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i');
    const m = block.match(re);
    if (m) {
      const v = unwrap(m[1]);
      if (v) return v;
    }
  }
  return '';
}

function atomLink(block) {
  // <link rel="alternate" href="..."/> — prefer alternate, else first href.
  const links = [...block.matchAll(/<link\b([^>]*)\/?>/gi)].map((m) => m[1]);
  const pick = links.find((a) => /rel=["']?alternate/i.test(a)) || links[0];
  if (!pick) return '';
  const href = pick.match(/href=["']([^"']+)["']/i);
  return href ? decodeEntities(href[1]) : '';
}

export function parseDate(str) {
  if (!str) return null;
  const t = Date.parse(str.trim());
  return Number.isFinite(t) ? t : null;
}

/**
 * @returns {Array<{title,link,description,published}>}
 */
export function parseFeed(xml) {
  if (!xml) return [];
  const text = xml.replace(/^﻿/, '');
  const blocks = [
    ...text.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi),
    ...text.matchAll(/<entry(?:\s[^>]*)?>([\s\S]*?)<\/entry>/gi),
  ];

  const out = [];
  for (const [, block] of blocks) {
    const title = tag(block, 'title');
    if (!title) continue;
    const link = tag(block, 'link') || atomLink(block) || tag(block, 'guid');
    const published =
      parseDate(tag(block, 'pubDate', 'published', 'updated', 'dc:date', 'date'));
    out.push({
      title,
      link: link && /^https?:/i.test(link) ? link : '',
      description: tag(block, 'description', 'summary', 'content:encoded', 'content').slice(0, 400),
      published,
    });
  }
  return out;
}
