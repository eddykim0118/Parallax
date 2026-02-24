import Parser from 'rss-parser';
import { RSSFeedItem } from '../types';
import { createLogger } from '../logger';

const logger = createLogger('rss-parser');

// Custom RSS parser with timeout and encoding handling
const parser = new Parser({
  timeout: 30000, // 30 second timeout
  headers: {
    'User-Agent': 'Parallax News Aggregator/1.0',
    'Accept': 'application/rss+xml, application/xml, text/xml, */*',
  },
  customFields: {
    item: [
      ['dc:creator', 'creator'],
      ['content:encoded', 'contentEncoded'],
      ['media:content', 'mediaContent'],
    ],
  },
});

export interface FetchFeedResult {
  success: boolean;
  feedUrl: string;
  items: RSSFeedItem[];
  error?: string;
  fetchedAt: Date;
}

/**
 * Fetches and parses an RSS feed
 *
 * This function handles various RSS/Atom formats and normalizes the output.
 * It includes error handling for common issues like timeouts, malformed XML, etc.
 */
export async function fetchFeed(feedUrl: string): Promise<FetchFeedResult> {
  const fetchedAt = new Date();

  try {
    logger.info({ feedUrl }, 'Fetching RSS feed');
    const feed = await parser.parseURL(feedUrl);

    const items: RSSFeedItem[] = feed.items.map((item) => ({
      title: item.title || 'Untitled',
      link: normalizeUrl(item.link || ''),
      pubDate: item.pubDate || item.isoDate,
      content: item.contentEncoded || item.content,
      contentSnippet: item.contentSnippet,
      creator: item.creator,
      categories: item.categories,
    }));

    logger.info(
      { feedUrl, itemCount: items.length },
      'Successfully parsed RSS feed'
    );

    return {
      success: true,
      feedUrl,
      items,
      fetchedAt,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error({ feedUrl, error: errorMessage }, 'Failed to fetch RSS feed');

    return {
      success: false,
      feedUrl,
      items: [],
      error: errorMessage,
      fetchedAt,
    };
  }
}

/**
 * Fetches multiple feeds in parallel with concurrency control
 */
export async function fetchFeeds(
  feedUrls: string[],
  concurrency = 5
): Promise<FetchFeedResult[]> {
  const results: FetchFeedResult[] = [];

  // Process in batches
  for (let i = 0; i < feedUrls.length; i += concurrency) {
    const batch = feedUrls.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map(fetchFeed));
    results.push(...batchResults);
  }

  return results;
}

/**
 * Normalizes a URL by removing tracking parameters and standardizing format
 */
function normalizeUrl(url: string): string {
  if (!url) return '';

  try {
    const parsed = new URL(url);

    // Remove common tracking parameters
    const trackingParams = [
      'utm_source',
      'utm_medium',
      'utm_campaign',
      'utm_term',
      'utm_content',
      'fbclid',
      'gclid',
      'ref',
      'source',
      'ncid',
    ];

    trackingParams.forEach((param) => {
      parsed.searchParams.delete(param);
    });

    // Remove trailing slashes
    let normalized = parsed.toString();
    if (normalized.endsWith('/') && !normalized.endsWith('//')) {
      normalized = normalized.slice(0, -1);
    }

    return normalized;
  } catch {
    // If URL parsing fails, return as-is
    return url;
  }
}

/**
 * Extracts the domain from a URL for deduplication purposes
 */
export function extractDomain(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}
