import { GDELTEvent } from '../types';
import { createLogger } from '../logger';

const logger = createLogger('gdelt');

// GDELT DOC 2.0 API endpoint
const GDELT_DOC_API = 'https://api.gdeltproject.org/api/v2/doc/doc';

// Focus regions for filtering GDELT results
const FOCUS_LOCATIONS = [
  'Taiwan',
  'China',
  'Japan',
  'Korea',
  'South Korea',
  'North Korea',
  'Hong Kong',
  'East China Sea',
  'South China Sea',
  'Taiwan Strait',
];

const FOCUS_THEMES = [
  'MILITARY',
  'PROTEST',
  'CONFLICT',
  'DIPLOMACY',
  'SECURITY',
  'TERRITORY',
];

interface GDELTDocResponse {
  articles?: Array<{
    url: string;
    title: string;
    seendate: string;
    domain: string;
    language: string;
    sourcecountry: string;
  }>;
}

interface GDELTQueryParams {
  query?: string;
  mode?: string;
  maxrecords?: number;
  timespan?: string;
  format?: string;
  sort?: string;
}

/**
 * Fetches recent articles from GDELT that match our focus regions
 *
 * GDELT provides real-time news monitoring across 100+ languages.
 * We use it to discover articles that our RSS feeds might miss,
 * and to seed event candidates for clustering.
 */
export async function fetchGDELTArticles(
  options: {
    timespan?: string; // e.g., '24h', '48h', '7d'
    maxRecords?: number;
    customQuery?: string;
  } = {}
): Promise<GDELTEvent[]> {
  const { timespan = '24h', maxRecords = 250, customQuery } = options;

  // Build query for our focus regions
  const locationQuery = FOCUS_LOCATIONS.map(loc => `"${loc}"`).join(' OR ');
  const baseQuery = customQuery || `(${locationQuery})`;

  const params: GDELTQueryParams = {
    query: baseQuery,
    mode: 'ArtList',
    maxrecords: maxRecords,
    timespan: timespan,
    format: 'json',
    sort: 'DateDesc',
  };

  const url = new URL(GDELT_DOC_API);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined) {
      url.searchParams.append(key, String(value));
    }
  });

  try {
    logger.info({ query: baseQuery, timespan, maxRecords }, 'Fetching GDELT articles');

    const response = await fetch(url.toString(), {
      headers: {
        'User-Agent': 'Parallax News Aggregator/1.0',
      },
    });

    if (!response.ok) {
      throw new Error(`GDELT API returned ${response.status}: ${response.statusText}`);
    }

    const data: GDELTDocResponse = await response.json();

    if (!data.articles || !Array.isArray(data.articles)) {
      logger.warn('GDELT returned no articles or unexpected format');
      return [];
    }

    const events: GDELTEvent[] = data.articles.map((article) => ({
      globalEventId: generateEventId(article.url, article.seendate),
      dateAdded: new Date(article.seendate),
      sourceUrl: article.url,
      title: article.title,
      actors: [], // GDELT DOC API doesn't include actors directly
      location: null, // Would need GKG API for geolocation
      topics: extractTopicsFromTitle(article.title),
    }));

    logger.info(
      { count: events.length, timespan },
      'Successfully fetched GDELT articles'
    );

    return events;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ error: errorMessage, url: url.toString() }, 'Failed to fetch GDELT articles');
    return [];
  }
}

/**
 * Fetches GDELT articles filtered by specific topic
 */
export async function fetchGDELTByTopic(
  topic: 'taiwan' | 'korea' | 'china-japan' | 'south-china-sea',
  timespan = '24h'
): Promise<GDELTEvent[]> {
  const topicQueries: Record<string, string> = {
    taiwan: '("Taiwan" OR "Taiwan Strait" OR "Taipei") AND ("China" OR "PLA" OR "military" OR "tension")',
    korea: '("North Korea" OR "DPRK" OR "Korean Peninsula" OR "THAAD") AND ("military" OR "missile" OR "nuclear")',
    'china-japan': '("China" AND "Japan") AND ("dispute" OR "islands" OR "Senkaku" OR "Diaoyu" OR "military")',
    'south-china-sea': '("South China Sea" OR "Spratly" OR "Paracel" OR "nine-dash line") AND ("China" OR "territorial")',
  };

  return fetchGDELTArticles({
    customQuery: topicQueries[topic],
    timespan,
    maxRecords: 100,
  });
}

/**
 * Generates a deterministic ID for a GDELT event
 */
function generateEventId(url: string, dateStr: string): string {
  // Simple hash for deduplication
  const str = `${url}-${dateStr}`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return `gdelt-${Math.abs(hash).toString(36)}`;
}

/**
 * Extracts potential topics from article title using keyword matching
 */
function extractTopicsFromTitle(title: string): string[] {
  const titleLower = title.toLowerCase();
  const topics: string[] = [];

  const topicKeywords: Record<string, string[]> = {
    'taiwan-strait': ['taiwan', 'taipei', 'strait', 'tsai'],
    'korea': ['korea', 'pyongyang', 'seoul', 'kim jong'],
    'china-military': ['pla', 'chinese military', 'china navy'],
    'south-china-sea': ['south china sea', 'spratly', 'paracel'],
    'japan-china': ['senkaku', 'diaoyu', 'japan china'],
    'territory': ['territorial', 'sovereignty', 'disputed'],
    'military': ['military', 'navy', 'air force', 'exercise', 'missile'],
    'diplomacy': ['summit', 'talks', 'diplomatic', 'minister'],
  };

  for (const [topic, keywords] of Object.entries(topicKeywords)) {
    if (keywords.some((kw) => titleLower.includes(kw))) {
      topics.push(topic);
    }
  }

  return topics;
}

/**
 * Check if an article URL is likely from one of our focus regions
 * based on domain analysis
 */
export function isRelevantDomain(url: string): boolean {
  try {
    const domain = new URL(url).hostname.toLowerCase();

    // Known relevant domains
    const relevantDomains = [
      '.cn', // China
      '.hk', // Hong Kong
      '.tw', // Taiwan
      '.jp', // Japan
      '.kr', // South Korea
      'cgtn.com',
      'xinhua',
      'globaltimes',
      'people.cn',
      'chosun',
      'joongang',
      'hankyoreh',
      'yonhap',
      'nhk',
      'asahi',
      'yomiuri',
      'japantimes',
      'taipeitimes',
      'focustaiwan',
      'scmp.com',
    ];

    return relevantDomains.some((d) => domain.includes(d) || domain.endsWith(d));
  } catch {
    return false;
  }
}
