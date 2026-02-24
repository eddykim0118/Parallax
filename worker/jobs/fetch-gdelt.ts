import { Job } from 'bullmq';
import { fetchGDELTArticles, isRelevantDomain } from '../../src/lib/ingestion/gdelt';
import { filterNewUrls, normalizeUrl } from '../../src/lib/ingestion/deduplicator';
import { db } from '../../src/lib/db/client';
import { outlets } from '../../src/lib/db/schema';
import { eq, sql } from 'drizzle-orm';
import { queueArticleForProcessing } from '../queue';
import { FetchGDELTJobData } from '../../src/lib/types';
import { createLogger } from '../../src/lib/logger';

const logger = createLogger('job:fetch-gdelt');

/**
 * Fetch GDELT Job Handler
 *
 * This job:
 * 1. Queries GDELT for recent articles about our focus regions
 * 2. Filters to articles from relevant domains
 * 3. Matches articles to known outlets when possible
 * 4. Queues new articles for processing
 */
export async function fetchGDELTHandler(
  job: Job<FetchGDELTJobData>
): Promise<{ fetched: number; queued: number }> {
  const { query, since = '1h' } = job.data;

  logger.info({ query, since }, 'Starting GDELT fetch job');

  // Fetch articles from GDELT
  const gdeltEvents = await fetchGDELTArticles({
    timespan: since,
    customQuery: query,
    maxRecords: 250,
  });

  logger.info({ count: gdeltEvents.length }, 'Fetched events from GDELT');

  if (gdeltEvents.length === 0) {
    return { fetched: 0, queued: 0 };
  }

  // Get all outlet domains for matching
  const allOutlets = await db.query.outlets.findMany({
    where: eq(outlets.active, 1),
    columns: { id: true, website: true },
  });

  // Build domain -> outlet map
  const domainToOutlet = new Map<string, string>();
  for (const outlet of allOutlets) {
    if (outlet.website) {
      try {
        const domain = new URL(outlet.website).hostname.replace(/^www\./, '');
        domainToOutlet.set(domain, outlet.id);
      } catch {
        // Skip invalid URLs
      }
    }
  }

  // Filter and match articles
  const articlesToProcess: Array<{
    url: string;
    outletId: string;
    title: string;
  }> = [];

  for (const event of gdeltEvents) {
    try {
      const url = normalizeUrl(event.sourceUrl);
      const domain = new URL(url).hostname.replace(/^www\./, '');

      // Check if we have this outlet
      let outletId = domainToOutlet.get(domain);

      // Also check partial domain matches (e.g., news.example.com -> example.com)
      if (!outletId) {
        for (const [registeredDomain, id] of domainToOutlet) {
          if (domain.endsWith(registeredDomain) || registeredDomain.endsWith(domain)) {
            outletId = id;
            break;
          }
        }
      }

      // Only process articles from known outlets or relevant domains
      if (outletId || isRelevantDomain(url)) {
        articlesToProcess.push({
          url,
          outletId: outletId || 'unknown', // We'll need to handle unknown outlets
          title: event.title,
        });
      }
    } catch (error) {
      logger.debug({ url: event.sourceUrl, error }, 'Failed to process GDELT event');
    }
  }

  // Filter to only new articles
  const urls = articlesToProcess.map((a) => a.url);
  const newUrls = new Set(await filterNewUrls(urls));

  const newArticles = articlesToProcess.filter((a) => newUrls.has(a.url));

  logger.info(
    { total: articlesToProcess.length, new: newArticles.length },
    'Filtered GDELT articles'
  );

  // Queue new articles for processing
  let queued = 0;
  for (const article of newArticles) {
    // Skip articles from unknown outlets for now
    // In the future, we could auto-create outlets or have an "other" category
    if (article.outletId === 'unknown') {
      continue;
    }

    await queueArticleForProcessing({
      url: article.url,
      outletId: article.outletId,
    });
    queued++;
  }

  logger.info(
    { fetched: gdeltEvents.length, queued },
    'GDELT fetch job completed'
  );

  return { fetched: gdeltEvents.length, queued };
}
