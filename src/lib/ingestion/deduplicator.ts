import { db } from '../db/client';
import { articles } from '../db/schema';
import { eq, or, sql } from 'drizzle-orm';
import { createLogger } from '../logger';

const logger = createLogger('deduplicator');

// Common tracking parameters to strip from URLs
const TRACKING_PARAMS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'utm_id',
  'fbclid',
  'gclid',
  'gclsrc',
  'dclid',
  'msclkid',
  'ref',
  'source',
  'ncid',
  'cmpid',
  'campaign',
  '_ga',
  '__twitter_impression',
  'ns_source',
  'ns_mchannel',
  'ns_campaign',
  'share',
];

/**
 * Normalizes a URL for deduplication
 *
 * This function:
 * - Removes tracking parameters
 * - Removes trailing slashes
 * - Normalizes protocol to https
 * - Removes www prefix (optional)
 * - Sorts remaining query parameters
 */
export function normalizeUrl(url: string): string {
  if (!url) return '';

  try {
    const parsed = new URL(url);

    // Remove tracking parameters
    TRACKING_PARAMS.forEach((param) => {
      parsed.searchParams.delete(param);
    });

    // Sort remaining params for consistency
    const params = Array.from(parsed.searchParams.entries()).sort((a, b) =>
      a[0].localeCompare(b[0])
    );
    parsed.search = '';
    params.forEach(([key, value]) => {
      parsed.searchParams.set(key, value);
    });

    // Normalize to https (most news sites support it)
    parsed.protocol = 'https:';

    // Build normalized URL
    let normalized = parsed.toString();

    // Remove trailing slash (unless it's the root path)
    if (normalized.endsWith('/') && parsed.pathname !== '/') {
      normalized = normalized.slice(0, -1);
    }

    return normalized;
  } catch (error) {
    // If URL parsing fails, return original
    logger.debug({ url, error }, 'URL normalization failed');
    return url;
  }
}

/**
 * Generates a URL fingerprint for quick comparison
 * Uses the path and essential parameters, ignoring protocol and www
 */
export function urlFingerprint(url: string): string {
  try {
    const parsed = new URL(normalizeUrl(url));
    const host = parsed.hostname.replace(/^www\./, '');
    const path = parsed.pathname;
    const params = parsed.searchParams.toString();
    return `${host}${path}${params ? '?' + params : ''}`;
  } catch {
    return url;
  }
}

/**
 * Checks if a URL already exists in the database
 *
 * Uses normalized URL comparison to catch duplicates even with
 * different tracking parameters or protocols.
 */
export async function urlExists(url: string): Promise<boolean> {
  const normalized = normalizeUrl(url);

  try {
    const existing = await db.query.articles.findFirst({
      where: eq(articles.url, normalized),
      columns: { id: true },
    });

    return !!existing;
  } catch (error) {
    logger.error({ url, error }, 'Error checking URL existence');
    throw error;
  }
}

/**
 * Checks multiple URLs for existence in a single query
 * Returns the URLs that don't exist (are new)
 */
export async function filterNewUrls(urls: string[]): Promise<string[]> {
  if (urls.length === 0) return [];

  const normalized = urls.map(normalizeUrl);

  try {
    // Query for existing URLs
    const existing = await db
      .select({ url: articles.url })
      .from(articles)
      .where(sql`${articles.url} = ANY(${normalized})`);

    const existingSet = new Set(existing.map((e) => e.url));

    // Return URLs that don't exist
    const newUrls = normalized.filter((url) => !existingSet.has(url));

    logger.debug(
      { total: urls.length, new: newUrls.length, existing: existing.length },
      'Filtered URLs for new articles'
    );

    return newUrls;
  } catch (error) {
    logger.error({ error }, 'Error filtering new URLs');
    throw error;
  }
}

/**
 * Checks for potential duplicates based on title similarity
 * Useful for catching syndicated content published under different URLs
 *
 * Returns articles with similar titles from the same time period
 */
export async function findSimilarByTitle(
  title: string,
  publishedWithin = 48 // hours
): Promise<Array<{ id: string; title: string; url: string; outletId: string }>> {
  // Normalize title for comparison
  const normalizedTitle = normalizeTitle(title);

  // For now, just return empty array - trigram matching requires pg_trgm extension
  // This can be enabled later when the extension is installed
  // In production, use: SELECT * FROM articles WHERE similarity(title, $1) > 0.5
  logger.debug('Trigram similarity not implemented, skipping duplicate title check');
  return [];
}

/**
 * Normalizes a title for comparison
 */
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w\s]/g, '') // Remove punctuation
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
}

/**
 * Extracts the canonical URL from an article page if available
 * Many sites have both /article/123 and /article/123-slug-here URLs
 */
export function extractCanonicalUrl(html: string, baseUrl: string): string | null {
  // Look for canonical link tag
  const canonicalMatch = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i);
  if (canonicalMatch) {
    try {
      return new URL(canonicalMatch[1], baseUrl).toString();
    } catch {
      return null;
    }
  }

  // Look for og:url meta tag
  const ogUrlMatch = html.match(/<meta[^>]+property=["']og:url["'][^>]+content=["']([^"']+)["']/i);
  if (ogUrlMatch) {
    try {
      return new URL(ogUrlMatch[1], baseUrl).toString();
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * Deduplication result type
 */
export interface DeduplicationResult {
  url: string;
  normalizedUrl: string;
  isNew: boolean;
  existingArticleId?: string;
  similarArticles?: Array<{ id: string; title: string }>;
}
