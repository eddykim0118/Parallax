import { Job } from 'bullmq';
import { db } from '../../src/lib/db/client';
import { articles, outlets } from '../../src/lib/db/schema';
import { eq } from 'drizzle-orm';
import { extractArticle } from '../../src/lib/ingestion/article-extractor';
import { normalizeUrl, urlExists } from '../../src/lib/ingestion/deduplicator';
import {
  generateEmbedding,
  prepareTextForEmbedding,
} from '../../src/lib/clustering/embeddings';
import { ProcessArticleJobData } from '../../src/lib/types';
import { createLogger } from '../../src/lib/logger';

const logger = createLogger('job:process-article');

/**
 * Process Article Job Handler
 *
 * This job:
 * 1. Checks if article already exists (dedup)
 * 2. Extracts full article content
 * 3. Detects language
 * 4. Generates embedding
 * 5. Stores in database
 */
export async function processArticleHandler(
  job: Job<ProcessArticleJobData>
): Promise<{ articleId: string | null; status: string }> {
  const { url, outletId, rssSummary, rssPublishedAt } = job.data;
  const normalizedUrl = normalizeUrl(url);

  logger.debug({ url: normalizedUrl, outletId }, 'Processing article');

  // Double-check for duplicates (may have been added since queuing)
  const exists = await urlExists(normalizedUrl);
  if (exists) {
    logger.debug({ url: normalizedUrl }, 'Article already exists, skipping');
    return { articleId: null, status: 'duplicate' };
  }

  // Get outlet for language fallback
  const outlet = await db.query.outlets.findFirst({
    where: eq(outlets.id, outletId),
    columns: { language: true },
  });

  // Extract article content
  const parsed = await extractArticle(normalizedUrl, {
    fallbackContent: rssSummary,
    fallbackLanguage: outlet?.language,
  });

  // Parse published date from RSS if extraction didn't get it
  let publishedAt = parsed.publishedAt;
  if (!publishedAt && rssPublishedAt) {
    const rssDate = new Date(rssPublishedAt);
    if (!isNaN(rssDate.getTime())) {
      publishedAt = rssDate;
    }
  }

  // Generate embedding if we have enough content
  let embedding: number[] | null = null;
  const textForEmbedding = prepareTextForEmbedding(
    parsed.title,
    parsed.content,
    parsed.summary
  );

  if (textForEmbedding.length >= 50) {
    try {
      const result = await generateEmbedding(textForEmbedding);
      embedding = result.embedding;

      await job.updateProgress({
        step: 'embedding',
        tokens: result.tokenCount,
      });
    } catch (error) {
      logger.error(
        { url: normalizedUrl, error },
        'Failed to generate embedding, continuing without'
      );
    }
  } else {
    logger.warn(
      { url: normalizedUrl, textLength: textForEmbedding.length },
      'Insufficient text for embedding'
    );
  }

  // Store in database
  try {
    const [inserted] = await db
      .insert(articles)
      .values({
        outletId,
        url: normalizedUrl,
        title: parsed.title,
        content: parsed.content,
        summary: parsed.summary,
        language: parsed.language,
        publishedAt,
        extractionStatus: parsed.extractionStatus,
        embedding,
        metadata: {
          authors: parsed.authors,
        },
      })
      .returning({ id: articles.id });

    logger.info(
      {
        articleId: inserted.id,
        url: normalizedUrl,
        extractionStatus: parsed.extractionStatus,
        hasEmbedding: !!embedding,
      },
      'Article processed and stored'
    );

    return { articleId: inserted.id, status: 'success' };
  } catch (error) {
    // Handle unique constraint violation (race condition)
    if (
      error instanceof Error &&
      error.message.includes('unique constraint')
    ) {
      logger.debug(
        { url: normalizedUrl },
        'Article already exists (race condition)'
      );
      return { articleId: null, status: 'duplicate' };
    }

    throw error;
  }
}
