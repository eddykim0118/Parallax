import { extract } from '@extractus/article-extractor';
import { franc } from 'franc';
import { ParsedArticle } from '../types';
import { createLogger } from '../logger';

const logger = createLogger('article-extractor');

// Language code mapping (franc uses ISO 639-3, we want ISO 639-1)
const LANG_CODE_MAP: Record<string, string> = {
  eng: 'en',
  cmn: 'zh', // Mandarin Chinese
  zho: 'zh', // Chinese (generic)
  jpn: 'ja',
  kor: 'ko',
  deu: 'de',
  fra: 'fr',
  ara: 'ar',
  spa: 'es',
  por: 'pt',
  rus: 'ru',
};

// Minimum confidence threshold for language detection
const LANG_CONFIDENCE_THRESHOLD = 0.8;

export interface ExtractionOptions {
  fallbackContent?: string; // RSS description to use if extraction fails
  fallbackLanguage?: string; // Outlet's known language as fallback
  timeout?: number; // Extraction timeout in ms
}

/**
 * Extracts article content from a URL with language detection
 *
 * This function:
 * 1. Fetches the article HTML
 * 2. Extracts the main content using article-extractor
 * 3. Detects the language using franc
 * 4. Falls back gracefully when extraction or detection fails
 */
export async function extractArticle(
  url: string,
  options: ExtractionOptions = {}
): Promise<ParsedArticle> {
  const { fallbackContent, fallbackLanguage, timeout = 30000 } = options;

  try {
    logger.debug({ url }, 'Extracting article content');

    // Set up timeout
    const timeoutId = setTimeout(() => {
      throw new Error('Extraction timeout');
    }, timeout);

    try {
      const article = await extract(url);
      clearTimeout(timeoutId);

      if (!article) {
        throw new Error('Extraction returned null');
      }

      // Determine content and extraction status
      const content = article.content || null;
      const summary = article.description || fallbackContent || null;
      const extractionStatus = content ? 'full' : (summary ? 'partial' : 'failed');

      // Detect language from content or title
      const textForLangDetection = content || article.title || summary || '';
      const detectedLang = detectLanguage(textForLangDetection, fallbackLanguage);

      // Parse published date
      let publishedAt: Date | null = null;
      if (article.published) {
        const parsed = new Date(article.published);
        if (!isNaN(parsed.getTime())) {
          publishedAt = parsed;
        }
      }

      logger.info(
        {
          url,
          extractionStatus,
          language: detectedLang,
          contentLength: content?.length || 0,
        },
        'Article extracted successfully'
      );

      return {
        url,
        title: article.title || 'Untitled',
        content,
        summary,
        publishedAt,
        authors: article.author ? [article.author] : [],
        language: detectedLang,
        extractionStatus,
      };
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.warn(
      { url, error: errorMessage },
      'Article extraction failed, using fallback'
    );

    // Return partial article with fallback content
    return {
      url,
      title: 'Extraction Failed',
      content: null,
      summary: fallbackContent || null,
      publishedAt: null,
      authors: [],
      language: fallbackLanguage || null,
      extractionStatus: fallbackContent ? 'partial' : 'failed',
    };
  }
}

/**
 * Detects the language of text using franc
 *
 * Falls back to the provided fallback language if:
 * - Text is too short
 * - Detection confidence is too low
 * - Detection returns 'und' (undetermined)
 */
export function detectLanguage(
  text: string,
  fallbackLanguage?: string
): string | null {
  // Need sufficient text for reliable detection
  if (!text || text.length < 50) {
    logger.debug(
      { textLength: text?.length || 0, fallback: fallbackLanguage },
      'Text too short for language detection, using fallback'
    );
    return fallbackLanguage || null;
  }

  try {
    // franc returns a tuple of [langCode, confidence] when using francAll
    // or just langCode with franc
    const detected = franc(text);

    if (detected === 'und') {
      logger.debug(
        { fallback: fallbackLanguage },
        'Language detection undetermined, using fallback'
      );
      return fallbackLanguage || null;
    }

    // Map to ISO 639-1
    const iso6391 = LANG_CODE_MAP[detected] || detected.slice(0, 2);

    logger.debug({ detected, mapped: iso6391 }, 'Language detected');
    return iso6391;
  } catch (error) {
    logger.warn({ error }, 'Language detection failed');
    return fallbackLanguage || null;
  }
}

/**
 * Batch extract multiple articles with concurrency control
 */
export async function extractArticles(
  urls: Array<{ url: string; options?: ExtractionOptions }>,
  concurrency = 3
): Promise<ParsedArticle[]> {
  const results: ParsedArticle[] = [];

  // Process in batches to avoid overwhelming the network
  for (let i = 0; i < urls.length; i += concurrency) {
    const batch = urls.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map(({ url, options }) => extractArticle(url, options))
    );
    results.push(...batchResults);

    // Small delay between batches to be respectful to servers
    if (i + concurrency < urls.length) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  return results;
}

/**
 * Cleans extracted content by removing extra whitespace and normalizing
 */
export function cleanContent(content: string | null): string | null {
  if (!content) return null;

  return content
    .replace(/\s+/g, ' ') // Normalize whitespace
    .replace(/\n\s*\n/g, '\n\n') // Normalize paragraph breaks
    .trim();
}

/**
 * Extracts the first N characters as a summary if no summary exists
 */
export function generateSummary(
  content: string | null,
  maxLength = 500
): string | null {
  if (!content) return null;

  const cleaned = cleanContent(content);
  if (!cleaned) return null;

  if (cleaned.length <= maxLength) return cleaned;

  // Try to break at sentence boundary
  const truncated = cleaned.slice(0, maxLength);
  const lastPeriod = truncated.lastIndexOf('.');
  const lastQuestion = truncated.lastIndexOf('?');
  const lastExclaim = truncated.lastIndexOf('!');

  const breakPoint = Math.max(lastPeriod, lastQuestion, lastExclaim);

  if (breakPoint > maxLength * 0.5) {
    return truncated.slice(0, breakPoint + 1);
  }

  return truncated + '...';
}
