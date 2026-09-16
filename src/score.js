// Market-impact scoring, categorisation, sentiment and tagging.
// Everything is keyword-driven and deterministic — no LLM call, no API key.

const HIGH = [
  // Central banks & rates
  'rate cut', 'rate hike', 'rate decision', 'repo rate', 'interest rate', 'fomc', 'federal reserve',
  // Headlines nearly always say "Fed", not "Federal Reserve" — and name the chair.
  'fed', 'the fed', 'fed chair', 'jerome powell', 'powell', 'warsh', 'fed official', 'fed governor',
  'rbi', 'monetary policy', 'quantitative', 'bond yield', 'yields',
  'treasury yield', 'basis points', 'bps',
  // Inflation & growth
  'inflation', 'cpi inflation', 'wholesale price', 'wpi', 'core inflation', 'gdp', 'recession',
  'stagflation', 'slowdown', 'stimulus',
  // India market core
  'nifty', 'sensex', 'bank nifty', 'sebi', 'fii', 'dii', 'foreign investors', 'rupee', 'inr',
  'union budget', 'gst council', 'fiscal deficit', 'current account deficit',
  // Global market core
  'dollar index', 'wall street', 's&p 500', 'nasdaq', 'dow jones', 'bond market', 'circuit breaker',
  'selloff', 'sell-off', 'market crash', 'flash crash',
  // Trade & policy shocks
  'tariff', 'trade war', 'export ban', 'import duty', 'sanctions', 'embargo', 'price cap',
  // Geopolitical shocks
  'missile', 'airstrike', 'air strike', 'ceasefire', 'invasion', 'nuclear', 'strait of hormuz',
  'red sea', 'blockade', 'coup', 'martial law',
  // Energy shocks
  'opec', 'crude oil', 'oil price', 'brent', 'wti', 'supply disruption', 'production cut',
  // Credit events
  'default', 'bankruptcy', 'bailout', 'downgrade of', 'debt ceiling', 'credit crisis',
];

const MEDIUM = [
  'earnings', 'quarterly results', 'q1 results', 'q2 results', 'q3 results', 'q4 results',
  'profit', 'revenue', 'guidance', 'margin', 'order book', 'dividend', 'buyback',
  'ipo', 'listing', 'merger', 'acquisition', 'stake sale', 'block deal', 'open offer', 'fundraise',
  'upgrade', 'downgrade', 'price target', 'rating', 'brokerage', 'analyst',
  'layoffs', 'job cuts', 'payrolls', 'jobless', 'unemployment', 'pmi', 'factory output',
  'iip', 'trade deficit', 'exports', 'imports', 'fdi', 'capex', 'infrastructure',
  'semiconductor', 'chips', 'artificial intelligence', 'data centre', 'data center',
  'gold price', 'silver', 'copper', 'lithium', 'natural gas', 'coal', 'fertiliser', 'fertilizer',
  'monsoon', 'rainfall', 'drought', 'crop', 'food prices',
  'election', 'parliament', 'regulation', 'ban', 'probe', 'raid', 'fraud', 'scam', 'penalty',
  // Geopolitical actors move risk appetite even without an explicit shock word.
  'iran', 'israel', 'gaza', 'ukraine', 'russia', 'china', 'taiwan', 'north korea', 'pakistan',
  'trump', 'putin', 'xi jinping', 'netanyahu', 'middle east', 'opec+', 'nato', 'brics',
  'pandemic', 'outbreak', 'virus', 'cyberattack', 'data breach', 'earthquake', 'hurricane',
  'shipping', 'freight', 'container', 'supply chain', 'visa', 'immigration', 'h-1b',
];

const LOW = [
  'stock', 'stocks', 'shares', 'market', 'markets', 'index', 'investors', 'trading', 'traders',
  'bank', 'banks', 'economy', 'economic', 'fund', 'funds', 'bonds', 'currency', 'commodity',
  'company', 'firm', 'deal', 'growth', 'demand', 'output', 'sales',
];

const INDIA = [
  'india', 'indian', 'nifty', 'sensex', 'rbi', 'sebi', 'rupee', 'mumbai', 'delhi', 'bengaluru',
  'modi', 'nirmala sitharaman', 'dalal street', 'nse', 'bse', 'gst', 'reliance', 'tata', 'adani',
  'infosys', 'hdfc', 'icici', 'sbi', 'tcs', 'bharti airtel', 'wipro', 'maruti', 'l&t',
];

const CATEGORY_RULES = [
  ['india',  ['india', 'indian', 'nifty', 'sensex', 'rbi', 'sebi', 'rupee', 'dalal street', 'nse', 'bse', 'gst', 'reliance', 'tata', 'adani', 'infosys', 'hdfc', 'icici', 'sbi', 'tcs']],
  ['crude',  ['oil', 'crude', 'opec', 'brent', 'wti', 'gas', 'lng', 'gold', 'silver', 'copper', 'metal', 'commodity', 'commodities', 'coal', 'lithium', 'mining', 'wheat', 'sugar', 'palm oil']],
  ['macro',  ['inflation', 'cpi', 'gdp', 'fed', 'fomc', 'central bank', 'monetary policy', 'rate', 'yield', 'budget', 'fiscal', 'tariff', 'trade deal', 'payrolls', 'unemployment', 'pmi', 'tax', 'imf', 'treasury', 'debt']],
  ['geo',    ['war', 'strike', 'missile', 'attack', 'military', 'troops', 'sanctions', 'ceasefire', 'conflict', 'nuclear', 'border', 'election', 'coup', 'protest', 'terror', 'israel', 'iran', 'ukraine', 'russia', 'china', 'taiwan', 'gaza', 'pakistan']],
  ['health', ['virus', 'outbreak', 'pandemic', 'covid', 'flu', 'disease', 'vaccine', 'who ', 'cyberattack', 'ransomware', 'data breach', 'earthquake', 'hurricane', 'flood', 'wildfire', 'heatwave', 'climate']],
  ['global', ['wall street', 's&p', 'nasdaq', 'dow', 'stocks', 'shares', 'earnings', 'ipo', 'merger', 'acquisition', 'bank', 'etf', 'bitcoin', 'crypto', 'nvidia', 'apple', 'tesla', 'microsoft', 'amazon', 'meta', 'google']],
];

const BULLISH = [
  'rally', 'rallies', 'surge', 'surges', 'soar', 'soars', 'jump', 'jumps', 'gain', 'gains', 'rise',
  'rises', 'climb', 'climbs', 'record high', 'all-time high', 'beats estimates', 'beats', 'upgrade',
  'upgrades', 'raises guidance', 'boost', 'boosts', 'recovery', 'rebound', 'rebounds', 'stimulus',
  'rate cut', 'cools', 'eases', 'easing', 'ceasefire', 'trade deal', 'breakthrough', 'approval',
  'expansion', 'strong demand', 'outperform', 'buy rating', 'bullish', 'inflows',
];

const BEARISH = [
  'slump', 'slumps', 'plunge', 'plunges', 'crash', 'crashes', 'tumble', 'tumbles', 'fall', 'falls',
  'drop', 'drops', 'slide', 'slides', 'sink', 'sinks', 'selloff', 'sell-off', 'worst', 'losses',
  'miss estimates', 'misses', 'downgrade', 'downgrades', 'cuts guidance', 'warning', 'warns',
  'recession', 'slowdown', 'layoffs', 'job cuts', 'default', 'bankruptcy', 'fraud', 'probe', 'raid',
  'tariff', 'sanctions', 'war', 'strike', 'attack', 'missile', 'ban', 'penalty', 'protest',
  'inflation rises', 'rate hike', 'bearish', 'outflows', 'sell rating', 'risk-off', 'fears',
  'decline', 'declines', 'slip', 'slips', 'weakens', 'depreciates', 'shrinks', 'contraction',
  'deficit widens', 'shutdown', 'halt', 'halts', 'delay', 'delays', 'curbs', 'crackdown',
];

// Which instruments a story plausibly moves — ported from the old version's
// `assets` column, which was more actionable than the entity tags alone.
const ASSET_RULES = [
  ['Nifty/Sensex', ['nifty', 'sensex', 'dalal street', 'indian equities', 'nse', 'bse', 'india vix', 'fii', 'dii', 'foreign investors']],
  ['Bank Nifty',   ['bank nifty', 'rbi', 'repo rate', 'hdfc bank', 'icici bank', 'sbi', 'axis bank', 'kotak', 'nbfc', 'credit growth', 'npa', 'lending']],
  ['Rupee',        ['rupee', 'inr', 'dollar index', 'forex reserves', 'current account deficit', 'remittances']],
  ['Crude/OMCs',   ['crude oil', 'brent', 'wti', 'opec', 'oil price', 'refinery', 'petrol', 'diesel', 'strait of hormuz', 'lng', 'natural gas']],
  ['Gold',         ['gold', 'gold price', 'bullion', 'silver', 'safe haven']],
  ['Bond yields',  ['bond yield', 'yields', 'treasury yield', 'g-sec', 'basis points', 'fomc', 'federal reserve', 'rate cut', 'rate hike', 'inflation', 'cpi inflation']],
  ['IT stocks',    ['infosys', 'tcs', 'wipro', 'hcl', 'it services', 'h-1b', 'visa', 'outsourcing', 'nasdaq', 'artificial intelligence', 'semiconductor', 'chips']],
  ['Metals',       ['copper', 'aluminium', 'aluminum', 'steel', 'iron ore', 'zinc', 'lithium', 'mining', 'tata steel', 'jsw', 'hindalco']],
  ['Pharma',       ['pharma', 'drug', 'usfda', 'fda', 'generic', 'vaccine', 'sun pharma', 'cipla', 'dr reddy']],
  ['Auto',         ['auto', 'car sales', 'ev', 'electric vehicle', 'maruti', 'tata motors', 'mahindra', 'hero motocorp', 'bajaj auto', 'chip shortage']],
  ['US equities',  ['wall street', 's&p 500', 'nasdaq', 'dow jones', 'nvidia', 'apple', 'tesla', 'microsoft', 'amazon', 'meta']],
];

const ENTITIES = [
  'trump', 'putin', 'modi', 'powell', 'xi jinping', 'netanyahu', 'zelensky', 'opec', 'fed', 'rbi',
  'sebi', 'ecb', 'imf', 'boj', 'iran', 'israel', 'gaza', 'russia', 'ukraine', 'china', 'taiwan',
  'pakistan', 'saudi', 'usa', 'india', 'japan', 'nifty', 'sensex', 'crude', 'gold', 'rupee',
  'dollar', 'bitcoin', 'nvidia', 'tesla', 'apple', 'reliance', 'tata', 'adani', 'infosys', 'hdfc',
  'tcs', 'tariff', 'inflation', 'recession',
];

// ---------------------------------------------------------------- matching
// Substring matching produced false positives ("against" -> "gain", "bank" ->
// "ban"), so match on whole-word n-grams instead: normalise text and keywords
// the same way, then test set membership.
function normalise(str) {
  return String(str || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
}

function gramSet(text) {
  const words = normalise(text);
  const set = new Set();
  for (let i = 0; i < words.length; i++) {
    set.add(words[i]);
    if (i + 1 < words.length) set.add(`${words[i]} ${words[i + 1]}`);
    if (i + 2 < words.length) set.add(`${words[i]} ${words[i + 1]} ${words[i + 2]}`);
  }
  return set;
}

const prep = (list) => [...new Set(list.map((k) => normalise(k).join(' ')).filter(Boolean))];

const P_HIGH = prep(HIGH);
const P_MEDIUM = prep(MEDIUM);
const P_LOW = prep(LOW);
const P_INDIA = prep(INDIA);
const P_BULLISH = prep(BULLISH);
const P_BEARISH = prep(BEARISH);
const P_ENTITIES = prep(ENTITIES);
const P_ASSET_RULES = ASSET_RULES.map(([asset, words]) => [asset, prep(words)]);
const P_CATEGORY_RULES = CATEGORY_RULES.map(([cat, words]) => [cat, prep(words)]);

function countHits(grams, list) {
  const found = [];
  for (const k of list) if (grams.has(k)) found.push(k);
  return found;
}

/**
 * Score an item 0-25 for likely impact on the Indian stock market.
 */
export function analyse(item, feed) {
  const grams = gramSet(`${item.title} ${item.description || ''}`);
  const titleGrams = gramSet(item.title);

  const high = countHits(grams, P_HIGH);
  const med = countHits(grams, P_MEDIUM);
  const low = countHits(grams, P_LOW);
  const indiaHits = countHits(grams, P_INDIA);

  let score = 0;
  if (high.length || med.length) {
    score += Math.min(3, high.length) * 4;
    score += Math.min(3, med.length) * 2;
    score += Math.min(2, low.length);
    score += feed.weight;                                        // source credibility
    if (indiaHits.length) score += 3;                            // direct India relevance
    if (feed.region === 'in') score += 1;
    if (countHits(titleGrams, P_HIGH).length) score += 2;        // headline, not just body
  } else if (low.length >= 2) {
    score = Math.min(4, low.length + Math.floor(feed.weight / 2));
  }
  score = Math.max(0, Math.min(25, Math.round(score)));

  // ---- categories ----
  const cats = new Set();
  for (const [cat, words] of P_CATEGORY_RULES) {
    if (countHits(grams, words).length) cats.add(cat);
  }
  if (feed.hint) cats.add(feed.hint);
  if (indiaHits.length) cats.add('india');
  if (!cats.size) cats.add(feed.region === 'in' ? 'india' : 'global');

  // ---- sentiment ----
  const bull = countHits(grams, P_BULLISH).length;
  const bear = countHits(grams, P_BEARISH).length;
  let sentiment = 'neutral';
  if (bull > bear) sentiment = 'bullish';
  else if (bear > bull) sentiment = 'bearish';
  const spread = Math.abs(bull - bear);
  const confidence = Math.min(95, 45 + spread * 12 + Math.min(3, high.length) * 4);

  // ---- tags ----
  const tags = countHits(grams, P_ENTITIES).slice(0, 4);

  // ---- affected instruments ----
  const assets = [];
  for (const [asset, words] of P_ASSET_RULES) {
    if (countHits(grams, words).length) assets.push(asset);
  }

  // ---- why this scored what it did (high-impact terms first) ----
  const why = [...high, ...med].slice(0, 5);

  return { score, cats: [...cats], sentiment, confidence, tags, assets: assets.slice(0, 4), why };
}

export const CATEGORIES = [
  { id: 'all',    label: 'All' },
  { id: 'india',  label: 'India Markets' },
  { id: 'global', label: 'Global Markets' },
  { id: 'geo',    label: 'Geopolitics' },
  { id: 'crude',  label: 'Crude & Commodities' },
  { id: 'macro',  label: 'Macro & Policy' },
  { id: 'health', label: 'Health & Emerging Risks' },
];
