/**
 * Parallax Worker
 *
 * Background job processor for the news ingestion pipeline.
 * Handles feed fetching, article processing, and event clustering.
 *
 * Run with: npm run worker (development)
 *           npm run worker:prod (production)
 */

import 'dotenv/config';
import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import {
  QUEUE_NAMES,
  setupScheduledJobs,
  connection,
} from './queue';
import { fetchFeedsHandler } from './jobs/fetch-feeds';
import { processArticleHandler } from './jobs/process-article';
import { clusterEventsHandler } from './jobs/cluster-events';
import { fetchGDELTHandler } from './jobs/fetch-gdelt';
import { createLogger } from '../src/lib/logger';

const logger = createLogger('worker');

// Track workers for graceful shutdown
const workers: Worker[] = [];

/**
 * Creates and starts all worker processes
 */
async function startWorkers(): Promise<void> {
  logger.info('Starting Parallax worker...');

  // Verify Redis connection
  try {
    await connection.ping();
    logger.info('Redis connection established');
  } catch (error) {
    logger.error({ error }, 'Failed to connect to Redis');
    process.exit(1);
  }

  // Create workers
  const fetchFeedsWorker = new Worker(
    QUEUE_NAMES.FETCH_FEEDS,
    fetchFeedsHandler,
    {
      connection,
      concurrency: 1, // Only one feed fetch at a time
    }
  );

  const processArticleWorker = new Worker(
    QUEUE_NAMES.PROCESS_ARTICLE,
    processArticleHandler,
    {
      connection,
      concurrency: 5, // Process 5 articles concurrently
    }
  );

  const clusterEventsWorker = new Worker(
    QUEUE_NAMES.CLUSTER_EVENTS,
    clusterEventsHandler,
    {
      connection,
      concurrency: 1, // Clustering should be sequential
    }
  );

  const fetchGDELTWorker = new Worker(
    QUEUE_NAMES.FETCH_GDELT,
    fetchGDELTHandler,
    {
      connection,
      concurrency: 1,
    }
  );

  workers.push(
    fetchFeedsWorker,
    processArticleWorker,
    clusterEventsWorker,
    fetchGDELTWorker
  );

  // Set up event handlers for all workers
  for (const worker of workers) {
    worker.on('completed', (job) => {
      logger.debug(
        { queue: worker.name, jobId: job.id },
        'Job completed'
      );
    });

    worker.on('failed', (job, error) => {
      logger.error(
        {
          queue: worker.name,
          jobId: job?.id,
          error: error.message,
        },
        'Job failed'
      );
    });

    worker.on('error', (error) => {
      logger.error(
        { queue: worker.name, error: error.message },
        'Worker error'
      );
    });
  }

  // Set up scheduled jobs
  await setupScheduledJobs();

  logger.info(
    { workers: workers.map((w) => w.name) },
    'All workers started successfully'
  );

  // Log startup banner
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║                    PARALLAX WORKER                        ║
╠═══════════════════════════════════════════════════════════╣
║  Status: RUNNING                                          ║
║  Workers: ${workers.length}                                               ║
║  - fetch-feeds (every 15 min)                             ║
║  - process-article (concurrent: 5)                        ║
║  - cluster-events (every 30 min)                          ║
║  - fetch-gdelt (every 15 min)                             ║
╚═══════════════════════════════════════════════════════════╝
  `);
}

/**
 * Graceful shutdown handler
 */
async function shutdown(): Promise<void> {
  logger.info('Shutting down workers...');

  // Close all workers gracefully
  await Promise.all(workers.map((w) => w.close()));

  // Close Redis connection
  await connection.quit();

  logger.info('Workers shut down successfully');
  process.exit(0);
}

// Handle shutdown signals
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  logger.error({ error: error.message }, 'Uncaught exception');
  shutdown();
});

process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'Unhandled rejection');
  shutdown();
});

// Start the workers
startWorkers().catch((error) => {
  logger.error({ error: error.message }, 'Failed to start workers');
  process.exit(1);
});
