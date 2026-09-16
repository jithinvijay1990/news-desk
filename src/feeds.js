// Feed registry.
// weight: source credibility / market-relevance contribution (0-4)
// region: 'in' | 'world'
// hint:   category nudge applied to every item from this feed
export const FEEDS = [
  // ---------- India: markets & economy ----------
  { name: 'ET Markets',            url: 'https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms',      weight: 4, region: 'in',    hint: 'india' },
  { name: 'ET Economy',            url: 'https://economictimes.indiatimes.com/news/economy/rssfeeds/1373380680.cms', weight: 4, region: 'in',    hint: 'macro' },
  { name: 'ET Industry',           url: 'https://economictimes.indiatimes.com/industry/rssfeeds/13352306.cms',       weight: 3, region: 'in',    hint: 'india' },
  { name: 'Business Standard Markets', url: 'https://www.business-standard.com/rss/markets-106.rss',                 weight: 4, region: 'in',    hint: 'india' },
  { name: 'Business Standard Economy', url: 'https://www.business-standard.com/rss/economy-102.rss',                 weight: 4, region: 'in',    hint: 'macro' },
  { name: 'Mint Markets',          url: 'https://www.livemint.com/rss/markets',                                      weight: 4, region: 'in',    hint: 'india' },
  { name: 'Mint Economy',          url: 'https://www.livemint.com/rss/economy',                                      weight: 4, region: 'in',    hint: 'macro' },
  { name: 'Mint Companies',        url: 'https://www.livemint.com/rss/companies',                                    weight: 3, region: 'in',    hint: 'india' },
  { name: 'CNBC-TV18 Markets',     url: 'https://www.cnbctv18.com/commonfeeds/v1/cne/rss/market.xml',                 weight: 4, region: 'in',    hint: 'india' },
  { name: 'BusinessLine Economy',  url: 'https://www.thehindubusinessline.com/economy/feeder/default.rss',            weight: 3, region: 'in',    hint: 'macro' },
  { name: 'BusinessLine Markets',  url: 'https://www.thehindubusinessline.com/markets/feeder/default.rss',           weight: 3, region: 'in',    hint: 'india' },
  { name: 'RBI Press Releases',    url: 'https://www.rbi.org.in/pressreleases_rss.xml',                              weight: 4, region: 'in',    hint: 'macro' },

  // ---------- Global: markets & macro ----------
  { name: 'Yahoo Finance',         url: 'https://finance.yahoo.com/news/rssindex',                                   weight: 3, region: 'world', hint: 'global' },
  { name: 'CNBC Top News',         url: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100003114', weight: 4, region: 'world', hint: 'global' },
  { name: 'CNBC World Markets',    url: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=15839135',  weight: 4, region: 'world', hint: 'global' },
  { name: 'CNBC Economy',          url: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=20910258',  weight: 4, region: 'world', hint: 'macro' },
  { name: 'MarketWatch Top Stories', url: 'https://feeds.content.dowjones.io/public/rss/mw_topstories',              weight: 4, region: 'world', hint: 'global' },
  { name: 'MarketWatch Real-time', url: 'https://feeds.content.dowjones.io/public/rss/mw_realtimeheadlines',         weight: 3, region: 'world', hint: 'global' },
  { name: 'FT Home',               url: 'https://www.ft.com/rss/home',                                                weight: 4, region: 'world', hint: 'global' },
  { name: 'Investing.com',         url: 'https://www.investing.com/rss/news.rss',                                    weight: 2, region: 'world', hint: 'global' },
  { name: 'Federal Reserve',       url: 'https://www.federalreserve.gov/feeds/press_all.xml',                        weight: 4, region: 'world', hint: 'macro' },
  { name: 'ECB Press',             url: 'https://www.ecb.europa.eu/rss/press.html',                                  weight: 3, region: 'world', hint: 'macro' },

  // ---------- Commodities / energy ----------
  { name: 'OilPrice.com',          url: 'https://oilprice.com/rss/main',                                             weight: 3, region: 'world', hint: 'crude' },
  { name: 'Mining.com',            url: 'https://www.mining.com/feed/',                                              weight: 2, region: 'world', hint: 'crude' },

  // ---------- Geopolitics / world ----------
  { name: 'Al Jazeera',            url: 'https://www.aljazeera.com/xml/rss/all.xml',                                 weight: 3, region: 'world', hint: 'geo' },
  { name: 'BBC World',             url: 'https://feeds.bbci.co.uk/news/world/rss.xml',                               weight: 3, region: 'world', hint: 'geo' },
  { name: 'BBC Business',          url: 'https://feeds.bbci.co.uk/news/business/rss.xml',                            weight: 3, region: 'world', hint: 'global' },
  { name: 'Guardian World',        url: 'https://www.theguardian.com/world/rss',                                     weight: 2, region: 'world', hint: 'geo' },

  // ---------- Added after probing which feeds Cloudflare's IPs can reach ----------
  { name: 'ET Stocks',             url: 'https://economictimes.indiatimes.com/markets/stocks/rssfeeds/2146842.cms',    weight: 4, region: 'in',    hint: 'india' },
  { name: 'The Hindu Business',    url: 'https://www.thehindu.com/business/feeder/default.rss',                        weight: 3, region: 'in',    hint: 'india' },
  { name: 'WSJ Markets',           url: 'https://feeds.content.dowjones.io/public/rss/RSSMarketsMain',                 weight: 4, region: 'world', hint: 'global' },
  { name: 'WSJ World News',        url: 'https://feeds.content.dowjones.io/public/rss/RSSWorldNews',                   weight: 3, region: 'world', hint: 'geo' },
  { name: 'CNBC Finance',          url: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=10000664', weight: 3, region: 'world', hint: 'global' },
  { name: 'CNBC Investing',        url: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=15839069', weight: 3, region: 'world', hint: 'global' },
  { name: 'Nikkei Asia',           url: 'https://asia.nikkei.com/rss/feed/nar',                                        weight: 3, region: 'world', hint: 'geo' },
  { name: 'Seeking Alpha',         url: 'https://seekingalpha.com/market_currents.xml',                                weight: 2, region: 'world', hint: 'global' },
  { name: 'ZeroHedge',             url: 'https://feeds.feedburner.com/zerohedge/feed',                                 weight: 2, region: 'world', hint: 'global' },
  // ---------- Wire services (Reuters has no public RSS since 2020 - syndicators instead) ----------
  { name: 'Bloomberg Markets',     url: 'https://feeds.bloomberg.com/markets/news.rss',                               weight: 4, region: 'world', hint: 'global' },
  { name: 'Bloomberg Economics',   url: 'https://feeds.bloomberg.com/economics/news.rss',                             weight: 4, region: 'world', hint: 'macro' },
  { name: 'Bloomberg Politics',    url: 'https://feeds.bloomberg.com/politics/news.rss',                              weight: 3, region: 'world', hint: 'geo' },
  { name: 'Bloomberg Industries',  url: 'https://feeds.bloomberg.com/industries/news.rss',                            weight: 3, region: 'world', hint: 'global' },
  { name: 'Bloomberg Technology',  url: 'https://feeds.bloomberg.com/technology/news.rss',                            weight: 3, region: 'world', hint: 'global' },
  { name: 'Reuters via CNA',       url: 'https://www.channelnewsasia.com/api/v1/rss-outbound-feed?_format=xml',        weight: 3, region: 'world', hint: 'geo' },
  { name: 'Reuters via Straits Times', url: 'https://www.straitstimes.com/news/business/rss.xml',                      weight: 3, region: 'world', hint: 'global' },
  { name: 'SCMP Business',         url: 'https://www.scmp.com/rss/92/feed',                                           weight: 2, region: 'world', hint: 'global' },
];
