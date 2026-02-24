import { db } from '../db/client';
import { articles, events, outlets } from '../db/schema';
import { eq, isNull, and, gte, sql, desc } from 'drizzle-orm';
import {
  cosineSimilarity,
  updateCentroid,
  calculateCentroid,
} from './embeddings';
import { ClusteringResult, ClusteringConfig } from '../types';
import { createLogger } from '../logger';

const logger = createLogger('event-clusterer');

// Default clustering configuration
const DEFAULT_CONFIG: ClusteringConfig = {
  sameLanguageThreshold: parseFloat(
    process.env.CLUSTER_THRESHOLD_SAME_LANG || '0.80'
  ),
  crossLanguageThreshold: parseFloat(
    process.env.CLUSTER_THRESHOLD_CROSS_LANG || '0.75'
  ),
  maxEventAgeDays: 7,
};

/**
 * Main clustering function
 *
 * Assigns unclustered articles to existing events or creates new ones.
 * Uses language-aware similarity thresholds:
 * - Same language: higher threshold (0.80) for stricter matching
 * - Cross language: lower threshold (0.75) to account for translation differences
 */
export async function clusterArticles(
  config: Partial<ClusteringConfig> = {}
): Promise<ClusteringResult[]> {
  const {
    sameLanguageThreshold,
    crossLanguageThreshold,
    maxEventAgeDays,
  } = { ...DEFAULT_CONFIG, ...config };

  logger.info(
    { sameLanguageThreshold, crossLanguageThreshold, maxEventAgeDays },
    'Starting clustering job'
  );

  // Get unclustered articles with embeddings from the last 48 hours
  const unclusteredArticles = await db
    .select({
      id: articles.id,
      title: articles.title,
      language: articles.language,
      embedding: articles.embedding,
      publishedAt: articles.publishedAt,
      outletId: articles.outletId,
    })
    .from(articles)
    .where(
      and(
        isNull(articles.eventId),
        gte(articles.fetchedAt, sql`NOW() - INTERVAL '48 hours'`),
        sql`${articles.embedding} IS NOT NULL`
      )
    )
    .orderBy(articles.publishedAt);

  logger.info(
    { count: unclusteredArticles.length },
    'Found unclustered articles'
  );

  if (unclusteredArticles.length === 0) {
    return [];
  }

  // Get active events from the last N days
  const activeEvents = await db
    .select({
      id: events.id,
      title: events.title,
      centroidEmbedding: events.centroidEmbedding,
      articleCount: events.articleCount,
    })
    .from(events)
    .where(
      and(
        eq(events.status, 'active'),
        gte(
          events.lastUpdatedAt,
          sql`NOW() - INTERVAL '${sql.raw(String(maxEventAgeDays))} days'`
        )
      )
    );

  logger.info({ count: activeEvents.length }, 'Found active events');

  const results: ClusteringResult[] = [];

  // Get language info for each article's outlet (for fallback)
  const outletLanguages = await getOutletLanguages(
    unclusteredArticles.map((a) => a.outletId)
  );

  for (const article of unclusteredArticles) {
    const embedding = article.embedding;
    if (!embedding) continue;

    // Determine article language (fallback to outlet language)
    const articleLang = article.language || outletLanguages[article.outletId];

    // Find the best matching event
    let bestMatch: {
      eventId: string;
      similarity: number;
      eventTitle: string;
    } | null = null;

    for (const event of activeEvents) {
      if (!event.centroidEmbedding) continue;

      const similarity = cosineSimilarity(embedding, event.centroidEmbedding);

      // Determine threshold based on language
      // For now, we assume events don't have a single language
      // so we use the cross-language threshold by default
      // In a more sophisticated implementation, we'd track event languages
      const threshold = crossLanguageThreshold;

      if (similarity >= threshold) {
        if (!bestMatch || similarity > bestMatch.similarity) {
          bestMatch = {
            eventId: event.id,
            similarity,
            eventTitle: event.title,
          };
        }
      }
    }

    if (bestMatch) {
      // Assign to existing event
      await assignArticleToEvent(
        article.id,
        bestMatch.eventId,
        embedding
      );

      logger.debug(
        {
          articleId: article.id,
          eventId: bestMatch.eventId,
          similarity: bestMatch.similarity.toFixed(3),
        },
        'Article assigned to existing event'
      );

      results.push({
        articleId: article.id,
        eventId: bestMatch.eventId,
        similarity: bestMatch.similarity,
        isNewEvent: false,
      });

      // Update local cache of event centroid for subsequent matches
      const eventIdx = activeEvents.findIndex((e) => e.id === bestMatch!.eventId);
      if (eventIdx >= 0) {
        activeEvents[eventIdx].centroidEmbedding = updateCentroid(
          activeEvents[eventIdx].centroidEmbedding!,
          embedding,
          activeEvents[eventIdx].articleCount
        );
        activeEvents[eventIdx].articleCount++;
      }
    } else {
      // Create new event
      const newEvent = await createEventFromArticle(article.id, article.title, embedding);

      logger.debug(
        { articleId: article.id, eventId: newEvent.id },
        'New event created from article'
      );

      results.push({
        articleId: article.id,
        eventId: newEvent.id,
        similarity: 1.0,
        isNewEvent: true,
      });

      // Add to active events for potential matches with remaining articles
      activeEvents.push({
        id: newEvent.id,
        title: newEvent.title,
        centroidEmbedding: embedding,
        articleCount: 1,
      });
    }
  }

  logger.info(
    {
      total: results.length,
      newEvents: results.filter((r) => r.isNewEvent).length,
      assigned: results.filter((r) => !r.isNewEvent).length,
    },
    'Clustering completed'
  );

  return results;
}

/**
 * Assigns an article to an existing event and updates the event's centroid
 */
async function assignArticleToEvent(
  articleId: string,
  eventId: string,
  articleEmbedding: number[]
): Promise<void> {
  // Get current event data
  const event = await db.query.events.findFirst({
    where: eq(events.id, eventId),
    columns: {
      centroidEmbedding: true,
      articleCount: true,
    },
  });

  if (!event || !event.centroidEmbedding) {
    throw new Error(`Event ${eventId} not found or has no centroid`);
  }

  // Calculate new centroid
  const newCentroid = updateCentroid(
    event.centroidEmbedding,
    articleEmbedding,
    event.articleCount
  );

  // Update article and event in transaction
  await db.transaction(async (tx) => {
    // Assign article to event
    await tx
      .update(articles)
      .set({ eventId })
      .where(eq(articles.id, articleId));

    // Update event
    await tx
      .update(events)
      .set({
        centroidEmbedding: newCentroid,
        articleCount: event.articleCount + 1,
        lastUpdatedAt: new Date(),
      })
      .where(eq(events.id, eventId));
  });
}

/**
 * Creates a new event from an article
 */
async function createEventFromArticle(
  articleId: string,
  articleTitle: string,
  articleEmbedding: number[]
): Promise<{ id: string; title: string }> {
  // Generate event title from article title
  const eventTitle = generateEventTitle(articleTitle);

  const [newEvent] = await db.transaction(async (tx) => {
    // Create event
    const [created] = await tx
      .insert(events)
      .values({
        title: eventTitle,
        centroidEmbedding: articleEmbedding,
        articleCount: 1,
        status: 'active',
        source: 'rss',
      })
      .returning({ id: events.id, title: events.title });

    // Assign article to new event
    await tx
      .update(articles)
      .set({ eventId: created.id })
      .where(eq(articles.id, articleId));

    return [created];
  });

  return newEvent;
}

/**
 * Gets outlet languages for fallback language detection
 */
async function getOutletLanguages(
  outletIds: string[]
): Promise<Record<string, string>> {
  const uniqueIds = [...new Set(outletIds)];

  const result = await db
    .select({ id: outlets.id, language: outlets.language })
    .from(outlets)
    .where(sql`${outlets.id} = ANY(${uniqueIds})`);

  return Object.fromEntries(result.map((r) => [r.id, r.language]));
}

/**
 * Generates an event title from an article title
 * Removes outlet-specific prefixes/suffixes and normalizes
 */
function generateEventTitle(articleTitle: string): string {
  // Remove common prefixes like "Breaking:", "BREAKING NEWS:", etc.
  let title = articleTitle
    .replace(/^(breaking|breaking news|update|exclusive):\s*/i, '')
    .replace(/\s*\|\s*[^|]+$/, '') // Remove "| Outlet Name" suffix
    .replace(/\s*-\s*[^-]+$/, '') // Remove "- Outlet Name" suffix
    .trim();

  // Truncate if too long
  if (title.length > 200) {
    const lastSpace = title.lastIndexOf(' ', 200);
    title = title.slice(0, lastSpace > 100 ? lastSpace : 200) + '...';
  }

  return title || articleTitle;
}

/**
 * Marks old events as stale
 * Run periodically to keep the active event list manageable
 */
export async function markStaleEvents(olderThanDays = 7): Promise<number> {
  const result = await db
    .update(events)
    .set({ status: 'stale' })
    .where(
      and(
        eq(events.status, 'active'),
        sql`${events.lastUpdatedAt} < NOW() - INTERVAL '${sql.raw(String(olderThanDays))} days'`
      )
    )
    .returning({ id: events.id });

  logger.info(
    { count: result.length, olderThanDays },
    'Marked events as stale'
  );

  return result.length;
}

/**
 * Re-clusters articles in an event
 * Useful when event boundaries need adjustment
 */
export async function reclusterEvent(eventId: string): Promise<void> {
  // Get all articles in the event
  const eventArticles = await db
    .select({
      id: articles.id,
      embedding: articles.embedding,
    })
    .from(articles)
    .where(eq(articles.eventId, eventId));

  if (eventArticles.length === 0) {
    logger.warn({ eventId }, 'No articles in event to recluster');
    return;
  }

  // Calculate new centroid from all articles
  const embeddings = eventArticles
    .filter((a) => a.embedding)
    .map((a) => a.embedding!);

  if (embeddings.length === 0) {
    logger.warn({ eventId }, 'No embeddings in event articles');
    return;
  }

  const newCentroid = calculateCentroid(embeddings);

  await db
    .update(events)
    .set({
      centroidEmbedding: newCentroid,
      articleCount: eventArticles.length,
      lastUpdatedAt: new Date(),
    })
    .where(eq(events.id, eventId));

  logger.info(
    { eventId, articleCount: eventArticles.length },
    'Event re-clustered'
  );
}
