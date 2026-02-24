import { OutletConfig } from '../types';

/**
 * Outlet Registry
 *
 * This file defines all news outlets we monitor. Each outlet includes:
 * - Basic metadata (name, country, region, language)
 * - RSS feed URLs (some outlets have multiple feeds for different sections)
 * - Optional bias label (for reference, not used in analysis)
 *
 * Note: Some RSS feeds may be unreliable or require special handling.
 * Set active: false to disable an outlet without removing it.
 */

export const outletRegistry: OutletConfig[] = [
  // ============================================================================
  // UNITED STATES
  // ============================================================================
  {
    name: 'The New York Times',
    slug: 'nyt',
    country: 'US',
    region: 'north_america',
    language: 'en',
    rssFeeds: [
      'https://rss.nytimes.com/services/xml/rss/nyt/World.xml',
      'https://rss.nytimes.com/services/xml/rss/nyt/Asia.xml',
    ],
    website: 'https://www.nytimes.com',
  },
  {
    name: 'The Wall Street Journal',
    slug: 'wsj',
    country: 'US',
    region: 'north_america',
    language: 'en',
    rssFeeds: [
      'https://feeds.a.dj.com/rss/RSSWorldNews.xml',
    ],
    website: 'https://www.wsj.com',
  },
  {
    name: 'CNN',
    slug: 'cnn',
    country: 'US',
    region: 'north_america',
    language: 'en',
    rssFeeds: [
      'http://rss.cnn.com/rss/cnn_world.rss',
      'http://rss.cnn.com/rss/cnn_asia.rss',
    ],
    website: 'https://www.cnn.com',
  },
  {
    name: 'Fox News',
    slug: 'fox-news',
    country: 'US',
    region: 'north_america',
    language: 'en',
    rssFeeds: [
      'https://moxie.foxnews.com/google-publisher/world.xml',
    ],
    website: 'https://www.foxnews.com',
  },
  {
    name: 'Associated Press',
    slug: 'ap',
    country: 'US',
    region: 'north_america',
    language: 'en',
    rssFeeds: [
      'https://rsshub.app/apnews/topics/world-news',
    ],
    website: 'https://apnews.com',
  },
  {
    name: 'Reuters',
    slug: 'reuters',
    country: 'US',
    region: 'north_america',
    language: 'en',
    rssFeeds: [
      'https://www.reutersagency.com/feed/?best-regions=asia&post_type=best',
    ],
    website: 'https://www.reuters.com',
  },

  // ============================================================================
  // CHINA
  // ============================================================================
  {
    name: 'CGTN',
    slug: 'cgtn',
    country: 'CN',
    region: 'east_asia',
    language: 'en',
    rssFeeds: [
      'https://www.cgtn.com/subscribe/rss/section/world.xml',
      'https://www.cgtn.com/subscribe/rss/section/asia.xml',
    ],
    website: 'https://www.cgtn.com',
    biasLabel: 'state_media',
  },
  {
    name: "People's Daily",
    slug: 'peoples-daily',
    country: 'CN',
    region: 'east_asia',
    language: 'en',
    rssFeeds: [
      'http://en.people.cn/rss/World.xml',
    ],
    website: 'http://en.people.cn',
    biasLabel: 'state_media',
  },
  {
    name: 'Global Times',
    slug: 'global-times',
    country: 'CN',
    region: 'east_asia',
    language: 'en',
    rssFeeds: [
      'https://www.globaltimes.cn/rss/outbrain.xml',
    ],
    website: 'https://www.globaltimes.cn',
    biasLabel: 'state_media',
  },
  {
    name: 'Xinhua',
    slug: 'xinhua',
    country: 'CN',
    region: 'east_asia',
    language: 'en',
    rssFeeds: [
      'http://www.xinhuanet.com/english/rss/worldrss.xml',
    ],
    website: 'http://www.xinhuanet.com/english',
    biasLabel: 'state_media',
  },

  // ============================================================================
  // SOUTH KOREA
  // ============================================================================
  {
    name: 'Chosun Ilbo',
    slug: 'chosun',
    country: 'KR',
    region: 'east_asia',
    language: 'ko',
    rssFeeds: [
      'https://www.chosun.com/arc/outboundfeeds/rss/?outputType=xml',
    ],
    website: 'https://www.chosun.com',
  },
  {
    name: 'JoongAng Ilbo',
    slug: 'joongang',
    country: 'KR',
    region: 'east_asia',
    language: 'en',
    rssFeeds: [
      'https://koreajoongangdaily.joins.com/section/rss/world',
    ],
    website: 'https://koreajoongangdaily.joins.com',
  },
  {
    name: 'Hankyoreh',
    slug: 'hankyoreh',
    country: 'KR',
    region: 'east_asia',
    language: 'en',
    rssFeeds: [
      'https://english.hani.co.kr/rss/',
    ],
    website: 'https://english.hani.co.kr',
  },
  {
    name: 'Yonhap News Agency',
    slug: 'yonhap',
    country: 'KR',
    region: 'east_asia',
    language: 'en',
    rssFeeds: [
      'https://en.yna.co.kr/RSS/news.xml',
    ],
    website: 'https://en.yna.co.kr',
  },
  {
    name: 'KBS World',
    slug: 'kbs',
    country: 'KR',
    region: 'east_asia',
    language: 'en',
    rssFeeds: [
      'https://world.kbs.co.kr/rss/rss_news.htm?lang=e',
    ],
    website: 'https://world.kbs.co.kr',
  },
  {
    name: 'The Korea Herald',
    slug: 'korea-herald',
    country: 'KR',
    region: 'east_asia',
    language: 'en',
    rssFeeds: [
      'http://www.koreaherald.com/rss/020200000000.xml',
    ],
    website: 'http://www.koreaherald.com',
  },

  // ============================================================================
  // JAPAN
  // ============================================================================
  {
    name: 'NHK World',
    slug: 'nhk',
    country: 'JP',
    region: 'east_asia',
    language: 'en',
    rssFeeds: [
      'https://www3.nhk.or.jp/rss/news/cat6.xml', // International
    ],
    website: 'https://www3.nhk.or.jp/nhkworld',
  },
  {
    name: 'The Asahi Shimbun',
    slug: 'asahi',
    country: 'JP',
    region: 'east_asia',
    language: 'en',
    rssFeeds: [
      'https://www.asahi.com/ajw/rss/24hour.rss',
    ],
    website: 'https://www.asahi.com/ajw',
  },
  {
    name: 'The Yomiuri Shimbun',
    slug: 'yomiuri',
    country: 'JP',
    region: 'east_asia',
    language: 'en',
    rssFeeds: [
      'https://japannews.yomiuri.co.jp/rss/',
    ],
    website: 'https://japannews.yomiuri.co.jp',
  },
  {
    name: 'The Japan Times',
    slug: 'japan-times',
    country: 'JP',
    region: 'east_asia',
    language: 'en',
    rssFeeds: [
      'https://www.japantimes.co.jp/feed/',
    ],
    website: 'https://www.japantimes.co.jp',
  },
  {
    name: 'Kyodo News',
    slug: 'kyodo',
    country: 'JP',
    region: 'east_asia',
    language: 'en',
    rssFeeds: [
      'https://english.kyodonews.net/rss/all.xml',
    ],
    website: 'https://english.kyodonews.net',
  },
  {
    name: 'Nikkei Asia',
    slug: 'nikkei',
    country: 'JP',
    region: 'east_asia',
    language: 'en',
    rssFeeds: [
      'https://asia.nikkei.com/rss',
    ],
    website: 'https://asia.nikkei.com',
  },

  // ============================================================================
  // TAIWAN
  // ============================================================================
  {
    name: 'Taipei Times',
    slug: 'taipei-times',
    country: 'TW',
    region: 'east_asia',
    language: 'en',
    rssFeeds: [
      'https://www.taipeitimes.com/xml/index.rss',
    ],
    website: 'https://www.taipeitimes.com',
  },
  {
    name: 'Liberty Times',
    slug: 'liberty-times',
    country: 'TW',
    region: 'east_asia',
    language: 'zh',
    rssFeeds: [
      'https://news.ltn.com.tw/rss/world.xml',
    ],
    website: 'https://www.ltn.com.tw',
  },
  {
    name: 'United Daily News',
    slug: 'udn',
    country: 'TW',
    region: 'east_asia',
    language: 'zh',
    rssFeeds: [
      'https://udn.com/rssfeed/news/2/6644',
    ],
    website: 'https://udn.com',
  },
  {
    name: 'Focus Taiwan',
    slug: 'focus-taiwan',
    country: 'TW',
    region: 'east_asia',
    language: 'en',
    rssFeeds: [
      'https://focustaiwan.tw/rss',
    ],
    website: 'https://focustaiwan.tw',
  },
  {
    name: 'Taiwan News',
    slug: 'taiwan-news',
    country: 'TW',
    region: 'east_asia',
    language: 'en',
    rssFeeds: [
      'https://www.taiwannews.com.tw/en/rss',
    ],
    website: 'https://www.taiwannews.com.tw',
  },

  // ============================================================================
  // INTERNATIONAL
  // ============================================================================
  {
    name: 'BBC News',
    slug: 'bbc',
    country: 'GB',
    region: 'europe',
    language: 'en',
    rssFeeds: [
      'https://feeds.bbci.co.uk/news/world/asia/rss.xml',
      'https://feeds.bbci.co.uk/news/world/rss.xml',
    ],
    website: 'https://www.bbc.com/news',
  },
  {
    name: 'Al Jazeera',
    slug: 'aljazeera',
    country: 'QA',
    region: 'middle_east',
    language: 'en',
    rssFeeds: [
      'https://www.aljazeera.com/xml/rss/all.xml',
    ],
    website: 'https://www.aljazeera.com',
  },
  {
    name: 'Deutsche Welle',
    slug: 'dw',
    country: 'DE',
    region: 'europe',
    language: 'en',
    rssFeeds: [
      'https://rss.dw.com/xml/rss-en-asia',
      'https://rss.dw.com/xml/rss-en-world',
    ],
    website: 'https://www.dw.com',
  },
  {
    name: 'South China Morning Post',
    slug: 'scmp',
    country: 'HK',
    region: 'east_asia',
    language: 'en',
    rssFeeds: [
      'https://www.scmp.com/rss/91/feed',
      'https://www.scmp.com/rss/5/feed', // China
    ],
    website: 'https://www.scmp.com',
  },
  {
    name: 'The Guardian',
    slug: 'guardian',
    country: 'GB',
    region: 'europe',
    language: 'en',
    rssFeeds: [
      'https://www.theguardian.com/world/asia-pacific/rss',
    ],
    website: 'https://www.theguardian.com',
  },
  {
    name: 'France 24',
    slug: 'france24',
    country: 'FR',
    region: 'europe',
    language: 'en',
    rssFeeds: [
      'https://www.france24.com/en/asia-pacific/rss',
    ],
    website: 'https://www.france24.com',
  },
  {
    name: 'The Diplomat',
    slug: 'diplomat',
    country: 'US',
    region: 'north_america',
    language: 'en',
    rssFeeds: [
      'https://thediplomat.com/feed/',
    ],
    website: 'https://thediplomat.com',
  },
  {
    name: 'Channel News Asia',
    slug: 'cna',
    country: 'SG',
    region: 'east_asia',
    language: 'en',
    rssFeeds: [
      'https://www.channelnewsasia.com/rssfeeds/8395986',
    ],
    website: 'https://www.channelnewsasia.com',
  },
];

// Helper functions
export function getOutletBySlug(slug: string): OutletConfig | undefined {
  return outletRegistry.find(o => o.slug === slug);
}

export function getOutletsByCountry(country: string): OutletConfig[] {
  return outletRegistry.filter(o => o.country === country);
}

export function getOutletsByRegion(region: string): OutletConfig[] {
  return outletRegistry.filter(o => o.region === region);
}

export function getActiveOutlets(): OutletConfig[] {
  return outletRegistry.filter(o => o.active !== false);
}

// Stats
export const outletStats = {
  total: outletRegistry.length,
  byCountry: outletRegistry.reduce((acc, o) => {
    acc[o.country] = (acc[o.country] || 0) + 1;
    return acc;
  }, {} as Record<string, number>),
  byRegion: outletRegistry.reduce((acc, o) => {
    acc[o.region] = (acc[o.region] || 0) + 1;
    return acc;
  }, {} as Record<string, number>),
};
