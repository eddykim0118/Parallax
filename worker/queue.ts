import { Queue, Worker, QueueEvents } from 'bullmq';
import IORedis from 'ioredis';
import {
  FetchFeedsJobData,
  ProcessArticleJobData,
  ClusterEventsJobData,
  FetchGDELTJobData,
} from '../src/lib/types';

// Redis connection
const connection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

// Queue names
export const QUEUE_NAMES = {
  FETCH_FEEDS: 'fetch-feeds',
  PROCESS_ARTICLE: 'process-article',
  CLUSTER_EVENTS: 'cluster-events',
  FETCH_GDELT: 'fetch-gdelt',
} as const;

// Default job options
const defaultJobOptions = {
  attempts: 3,
  backoff: {
    type: 'exponential' as const,
    delay: 1000,
  },
  removeOnComplete: {
    age: 24 * 60 * 60, // Keep completed jobs for 24 hours
    count: 1000,
  },
  removeOnFail: {
    age: 7 * 24 * 60 * 60, // Keep failed jobs for 7 days
  },
};

// ============================================================================
// Queue Definitions
// ============================================================================

/**
 * Fetch Feeds Queue
 * Scheduled job that polls RSS feeds from all active outlets
 */
export const fetchFeedsQueue = new Queue<FetchFeedsJobData>(
  QUEUE_NAMES.FETCH_FEEDS,
  {
    connection,
    defaultJobOptions,
  }
);

/**
 * Process Article Queue
 * Handles individual article extraction, embedding, and storage
 * Note: Rate limiting is handled at the worker level via concurrency
 */
export const processArticleQueue = new Queue<ProcessArticleJobData>(
  QUEUE_NAMES.PROCESS_ARTICLE,
  {
    connection,
    defaultJobOptions,
  }
);

/**
 * Cluster Events Queue
 * Groups articles into events based on embedding similarity
 */
export const clusterEventsQueue = new Queue<ClusterEventsJobData>(
  QUEUE_NAMES.CLUSTER_EVENTS,
  {
    connection,
    defaultJobOptions,
  }
);

/**
 * Fetch GDELT Queue
 * Fetches events and articles from GDELT API
 */
export const fetchGDELTQueue = new Queue<FetchGDELTJobData>(
  QUEUE_NAMES.FETCH_GDELT,
  {
    connection,
    defaultJobOptions,
  }
);

// ============================================================================
// Queue Events (for monitoring)
// ============================================================================

export const fetchFeedsEvents = new QueueEvents(QUEUE_NAMES.FETCH_FEEDS, {
  connection,
});

export const processArticleEvents = new QueueEvents(QUEUE_NAMES.PROCESS_ARTICLE, {
  connection,
});

export const clusterEventsEvents = new QueueEvents(QUEUE_NAMES.CLUSTER_EVENTS, {
  connection,
});

// ============================================================================
// Scheduler Setup
// ============================================================================

/**
 * Sets up recurring jobs
 * Call this once when the worker starts
 */
export async function setupScheduledJobs(): Promise<void> {
  // Clear any existing repeatable jobs
  const existingJobs = await fetchFeedsQueue.getRepeatableJobs();
  for (const job of existingJobs) {
    await fetchFeedsQueue.removeRepeatableByKey(job.key);
  }

  const existingClusterJobs = await clusterEventsQueue.getRepeatableJobs();
  for (const job of existingClusterJobs) {
    await clusterEventsQueue.removeRepeatableByKey(job.key);
  }

  const existingGDELTJobs = await fetchGDELTQueue.getRepeatableJobs();
  for (const job of existingGDELTJobs) {
    await fetchGDELTQueue.removeRepeatableByKey(job.key);
  }

  // Schedule feed fetching every 15 minutes
  await fetchFeedsQueue.add(
    'scheduled-fetch',
    {},
    {
      repeat: {
        every: 15 * 60 * 1000, // 15 minutes
      },
    }
  );

  // Schedule clustering every 30 minutes
  await clusterEventsQueue.add(
    'scheduled-cluster',
    {},
    {
      repeat: {
        every: 30 * 60 * 1000, // 30 minutes
      },
    }
  );

  // Schedule GDELT fetch every 15 minutes
  await fetchGDELTQueue.add(
    'scheduled-gdelt',
    { since: '1h' },
    {
      repeat: {
        every: 15 * 60 * 1000, // 15 minutes
      },
    }
  );

  console.log('✅ Scheduled jobs configured');
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Adds an article to the processing queue
 */
export async function queueArticleForProcessing(
  data: ProcessArticleJobData
): Promise<void> {
  await processArticleQueue.add('process', data, {
    jobId: `article-${Buffer.from(data.url).toString('base64').slice(0, 32)}`,
  });
}

/**
 * Triggers an immediate feed fetch (useful for testing)
 */
export async function triggerFeedFetch(outletId?: string): Promise<void> {
  await fetchFeedsQueue.add('manual-fetch', { outletId }, { priority: 1 });
}

/**
 * Triggers immediate clustering (useful for testing)
 */
export async function triggerClustering(articleIds?: string[]): Promise<void> {
  await clusterEventsQueue.add('manual-cluster', { articleIds }, { priority: 1 });
}

/**
 * Gets queue statistics
 */
export async function getQueueStats() {
  const [
    feedsWaiting,
    feedsActive,
    feedsCompleted,
    feedsFailed,
    articlesWaiting,
    articlesActive,
    articlesCompleted,
    articlesFailed,
    clusterWaiting,
    clusterActive,
    clusterCompleted,
    clusterFailed,
  ] = await Promise.all([
    fetchFeedsQueue.getWaitingCount(),
    fetchFeedsQueue.getActiveCount(),
    fetchFeedsQueue.getCompletedCount(),
    fetchFeedsQueue.getFailedCount(),
    processArticleQueue.getWaitingCount(),
    processArticleQueue.getActiveCount(),
    processArticleQueue.getCompletedCount(),
    processArticleQueue.getFailedCount(),
    clusterEventsQueue.getWaitingCount(),
    clusterEventsQueue.getActiveCount(),
    clusterEventsQueue.getCompletedCount(),
    clusterEventsQueue.getFailedCount(),
  ]);

  return {
    fetchFeeds: {
      waiting: feedsWaiting,
      active: feedsActive,
      completed: feedsCompleted,
      failed: feedsFailed,
    },
    processArticle: {
      waiting: articlesWaiting,
      active: articlesActive,
      completed: articlesCompleted,
      failed: articlesFailed,
    },
    clusterEvents: {
      waiting: clusterWaiting,
      active: clusterActive,
      completed: clusterCompleted,
      failed: clusterFailed,
    },
  };
}

// Export connection for cleanup
export { connection };
