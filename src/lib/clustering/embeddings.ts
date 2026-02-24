import OpenAI from 'openai';
import { EmbeddingResult } from '../types';
import { createLogger } from '../logger';

const logger = createLogger('embeddings');

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Model configuration
const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMENSIONS = 1536;
const MAX_INPUT_TOKENS = 8191; // Model limit
const MAX_INPUT_CHARS = 8000 * 4; // Rough character estimate (4 chars per token average)

// Rate limiting configuration
const MAX_CONCURRENT_REQUESTS = 3;
const RETRY_DELAYS = [1000, 2000, 4000]; // Exponential backoff

// Simple semaphore for concurrency control
class Semaphore {
  private queue: (() => void)[] = [];
  private running = 0;

  constructor(private maxConcurrent: number) {}

  async acquire(): Promise<void> {
    if (this.running < this.maxConcurrent) {
      this.running++;
      return;
    }

    return new Promise<void>((resolve) => {
      this.queue.push(resolve);
    });
  }

  release(): void {
    this.running--;
    const next = this.queue.shift();
    if (next) {
      this.running++;
      next();
    }
  }
}

const semaphore = new Semaphore(MAX_CONCURRENT_REQUESTS);

/**
 * Generates an embedding for the given text
 *
 * This function:
 * - Truncates input to model limits
 * - Handles rate limiting with retries
 * - Returns a 1536-dimensional vector
 */
export async function generateEmbedding(
  text: string
): Promise<EmbeddingResult> {
  // Truncate to max length
  const truncated = truncateText(text, MAX_INPUT_CHARS);

  await semaphore.acquire();

  try {
    logger.debug(
      { textLength: truncated.length, originalLength: text.length },
      'Generating embedding'
    );

    const result = await retryWithBackoff(async () => {
      const response = await openai.embeddings.create({
        model: EMBEDDING_MODEL,
        input: truncated,
      });

      return response;
    });

    const embedding = result.data[0].embedding;
    const tokenCount = result.usage?.total_tokens || 0;

    logger.debug(
      { tokens: tokenCount, dimensions: embedding.length },
      'Embedding generated successfully'
    );

    return {
      embedding,
      model: EMBEDDING_MODEL,
      tokenCount,
    };
  } finally {
    semaphore.release();
  }
}

/**
 * Generates embeddings for multiple texts in batch
 *
 * OpenAI's API supports batching, which is more efficient than
 * individual calls. However, we still need to respect rate limits.
 */
export async function generateEmbeddings(
  texts: string[]
): Promise<EmbeddingResult[]> {
  // Process in batches of 10 (API limit)
  const batchSize = 10;
  const results: EmbeddingResult[] = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const truncated = batch.map((t) => truncateText(t, MAX_INPUT_CHARS));

    await semaphore.acquire();

    try {
      const response = await retryWithBackoff(async () => {
        return openai.embeddings.create({
          model: EMBEDDING_MODEL,
          input: truncated,
        });
      });

      const batchResults = response.data.map((d, idx) => ({
        embedding: d.embedding,
        model: EMBEDDING_MODEL,
        tokenCount: Math.floor(
          (response.usage?.total_tokens || 0) / batch.length
        ),
      }));

      results.push(...batchResults);
    } finally {
      semaphore.release();
    }
  }

  return results;
}

/**
 * Prepares article content for embedding
 *
 * Combines title and content with appropriate weighting.
 * Title is more important for topic clustering, so we include it prominently.
 */
export function prepareTextForEmbedding(
  title: string,
  content: string | null,
  summary: string | null
): string {
  const parts: string[] = [];

  // Title is most important - include twice for emphasis
  if (title) {
    parts.push(title);
    parts.push(''); // separator
  }

  // Content is primary source
  if (content) {
    parts.push(content);
  } else if (summary) {
    // Fall back to summary if no content
    parts.push(summary);
  }

  return parts.join('\n').trim();
}

/**
 * Calculates cosine similarity between two embeddings
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Embeddings must have same dimensions');
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  normA = Math.sqrt(normA);
  normB = Math.sqrt(normB);

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dotProduct / (normA * normB);
}

/**
 * Calculates the centroid (average) of multiple embeddings
 * Used for event clustering - represents the "center" of an event
 */
export function calculateCentroid(embeddings: number[][]): number[] {
  if (embeddings.length === 0) {
    throw new Error('Cannot calculate centroid of empty array');
  }

  const dimensions = embeddings[0].length;
  const centroid = new Array(dimensions).fill(0);

  for (const embedding of embeddings) {
    for (let i = 0; i < dimensions; i++) {
      centroid[i] += embedding[i];
    }
  }

  for (let i = 0; i < dimensions; i++) {
    centroid[i] /= embeddings.length;
  }

  return centroid;
}

/**
 * Updates a centroid with a new embedding using running average
 * More efficient than recalculating from scratch
 */
export function updateCentroid(
  currentCentroid: number[],
  newEmbedding: number[],
  currentCount: number
): number[] {
  const newCount = currentCount + 1;
  const updated = new Array(currentCentroid.length);

  for (let i = 0; i < currentCentroid.length; i++) {
    // Running average formula: new_avg = old_avg + (new_value - old_avg) / n
    updated[i] = currentCentroid[i] + (newEmbedding[i] - currentCentroid[i]) / newCount;
  }

  return updated;
}

// Helper functions

function truncateText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;

  // Try to truncate at a sentence boundary
  const truncated = text.slice(0, maxChars);
  const lastPeriod = truncated.lastIndexOf('.');
  const lastNewline = truncated.lastIndexOf('\n');

  const breakPoint = Math.max(lastPeriod, lastNewline);
  if (breakPoint > maxChars * 0.8) {
    return truncated.slice(0, breakPoint + 1);
  }

  return truncated;
}

async function retryWithBackoff<T>(fn: () => Promise<T>): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      // Check if it's a rate limit error
      if (error instanceof OpenAI.RateLimitError && attempt < RETRY_DELAYS.length) {
        const delay = RETRY_DELAYS[attempt];
        logger.warn(
          { attempt: attempt + 1, delay },
          'Rate limited, retrying after delay'
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      // For other errors, throw immediately
      throw error;
    }
  }

  throw lastError;
}
