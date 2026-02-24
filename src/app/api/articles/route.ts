import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { articles, outlets } from '@/lib/db/schema';
import { eq, desc, gte, and, sql } from 'drizzle-orm';

/**
 * GET /api/articles
 *
 * Returns a list of articles.
 *
 * Query params:
 * - outlet: Filter by outlet slug
 * - event_id: Filter by event ID
 * - since: ISO date string, only articles after this time
 * - language: Filter by language code
 * - limit: Number of articles to return (default: 50, max: 100)
 * - offset: Pagination offset
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // Parse query params
    const outletSlug = searchParams.get('outlet');
    const eventId = searchParams.get('event_id');
    const since = searchParams.get('since');
    const language = searchParams.get('language');
    const limit = Math.min(
      parseInt(searchParams.get('limit') || '50'),
      100
    );
    const offset = parseInt(searchParams.get('offset') || '0');

    // Build conditions
    const conditions = [];

    if (outletSlug) {
      // Need to join with outlets to filter by slug
      const outlet = await db.query.outlets.findFirst({
        where: eq(outlets.slug, outletSlug),
        columns: { id: true },
      });

      if (outlet) {
        conditions.push(eq(articles.outletId, outlet.id));
      } else {
        // No matching outlet, return empty
        return NextResponse.json({
          articles: [],
          pagination: { limit, offset, hasMore: false },
        });
      }
    }

    if (eventId) {
      conditions.push(eq(articles.eventId, eventId));
    }

    if (since) {
      const sinceDate = new Date(since);
      if (!isNaN(sinceDate.getTime())) {
        conditions.push(gte(articles.fetchedAt, sinceDate));
      }
    }

    if (language) {
      conditions.push(eq(articles.language, language));
    }

    // Query articles with outlet info
    const articleList = await db
      .select({
        id: articles.id,
        title: articles.title,
        url: articles.url,
        summary: articles.summary,
        outletId: articles.outletId,
        outletName: outlets.name,
        outletSlug: outlets.slug,
        outletCountry: outlets.country,
        publishedAt: articles.publishedAt,
        fetchedAt: articles.fetchedAt,
        language: articles.language,
        extractionStatus: articles.extractionStatus,
        eventId: articles.eventId,
        metadata: articles.metadata,
      })
      .from(articles)
      .innerJoin(outlets, eq(articles.outletId, outlets.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(articles.publishedAt))
      .limit(limit)
      .offset(offset);

    return NextResponse.json({
      articles: articleList,
      pagination: {
        limit,
        offset,
        hasMore: articleList.length === limit,
      },
    });
  } catch (error) {
    console.error('Error fetching articles:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
