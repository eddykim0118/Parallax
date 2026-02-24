import { Job } from 'bullmq';
import { db } from '../../src/lib/db/client';
import { outlets } from '../../src/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { fetchFeed } from '../../src/lib/ingestion/rss-parser';
import { filterNewUrls, normalizeUrl } from '../../src/lib/ingestion/deduplicator';
import { queueArticleForProcessing } from '../queue';
import { FetchFeedsJobData } from '../../src/lib/types';
import { createLogger } from '../../src/lib/logger';

const logger = createLogger('job:fetch-feeds');

/**
 * Fetch Feeds Job Handler
 *
 * This job:
 * 1. Gets all active outlets (or a specific one)
 * 2. Fetches all RSS feeds for each outlet
 * 3. Identifies new articles (not already in DB)
 * 4. Queues new articles for processing
 */
export async function fetchFeedsHandler(
  job: Job<FetchFeedsJobData>
): Promise<{ fetched: number; newArticles: number }> {
  const { outletId } = job.data;

  logger.info({ outletId }, 'Starting feed fetch job');

  // Get outlets to process
  const outletsToFetch = outletId
    ? await db.query.outlets.findMany({
        where: and(eq(outlets.id, outletId), eq(outlets.active, 1)),
      })
    : await db.query.outlets.findMany({
        where: eq(outlets.active, 1),
      });

  logger.info({ count: outletsToFetch.length }, 'Fetching feeds for outlets');

  let totalFetched = 0;
  let totalNew = 0;

  for (const outlet of outletsToFetch) {
    const feeds = outlet.rssFeeds as string[];
    if (!feeds || feeds.length === 0) {
      logger.debug({ outlet: outlet.slug }, 'No RSS feeds configured');
      continue;
    }

    for (const feedUrl of feeds) {
      try {
        const result = await fetchFeed(feedUrl);

        if (!result.success) {
          logger.warn(
            { outlet: outlet.slug, feedUrl, error: result.error },
            'Feed fetch failed'
          );
          continue;
        }

        totalFetched += result.items.length;

        // Extract and normalize URLs
        const urls = result.items
          .map((item) => item.link)
          .filter((url): url is string => !!url)
          .map(normalizeUrl);

        // Filter to only new URLs
        const newUrls = await filterNewUrls(urls);

        logger.debug(
          {
            outlet: outlet.slug,
            feedUrl,
            total: result.items.length,
            new: newUrls.length,
          },
          'Feed processed'
        );

        // Queue new articles for processing
        for (const url of newUrls) {
          const item = result.items.find(
            (i) => normalizeUrl(i.link || '') === url
          );

          await queueArticleForProcessing({
            url,
            outletId: outlet.id,
            rssSummary: item?.contentSnippet || item?.content,
            rssPublishedAt: item?.pubDate,
          });

          totalNew++;
        }

        // Update progress
        await job.updateProgress({
          outlet: outlet.slug,
          feedUrl,
          fetched: result.items.length,
          new: newUrls.length,
        });
      } catch (error) {
        logger.error(
          { outlet: outlet.slug, feedUrl, error },
          'Unexpected error processing feed'
        );
      }
    }
  }

  logger.info(
    { totalFetched, totalNew },
    'Feed fetch job completed'
  );

  return { fetched: totalFetched, newArticles: totalNew };
}
