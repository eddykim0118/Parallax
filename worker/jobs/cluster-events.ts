import { Job } from 'bullmq';
import { clusterArticles, markStaleEvents } from '../../src/lib/clustering/event-clusterer';
import { ClusterEventsJobData } from '../../src/lib/types';
import { createLogger } from '../../src/lib/logger';

const logger = createLogger('job:cluster-events');

/**
 * Cluster Events Job Handler
 *
 * This job:
 * 1. Gets all unclustered articles with embeddings
 * 2. For each article, finds matching events or creates new ones
 * 3. Marks old events as stale
 */
export async function clusterEventsHandler(
  job: Job<ClusterEventsJobData>
): Promise<{ processed: number; newEvents: number; assigned: number }> {
  logger.info('Starting clustering job');

  // Run the clustering algorithm
  const results = await clusterArticles();

  const newEvents = results.filter((r) => r.isNewEvent).length;
  const assigned = results.filter((r) => !r.isNewEvent).length;

  await job.updateProgress({
    step: 'clustering',
    processed: results.length,
    newEvents,
    assigned,
  });

  // Mark old events as stale (events not updated in 7 days)
  const staleCount = await markStaleEvents(7);

  logger.info(
    {
      processed: results.length,
      newEvents,
      assigned,
      markedStale: staleCount,
    },
    'Clustering job completed'
  );

  return {
    processed: results.length,
    newEvents,
    assigned,
  };
}
