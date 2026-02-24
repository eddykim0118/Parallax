import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { events, articles, outlets } from '@/lib/db/schema';
import { eq, desc, gte, and, sql } from 'drizzle-orm';

/**
 * GET /api/events
 *
 * Returns a list of events with their article summaries.
 *
 * Query params:
 * - status: 'active' | 'stale' | 'archived' (default: 'active')
 * - region: Filter by outlet region
 * - since: ISO date string, only events updated after this time
 * - limit: Number of events to return (default: 50, max: 100)
 * - offset: Pagination offset
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // Parse query params
    const status = searchParams.get('status') || 'active';
    const region = searchParams.get('region');
    const since = searchParams.get('since');
    const limit = Math.min(
      parseInt(searchParams.get('limit') || '50'),
      100
    );
    const offset = parseInt(searchParams.get('offset') || '0');

    // Build conditions
    const conditions = [];

    if (status) {
      conditions.push(eq(events.status, status as 'active' | 'stale' | 'archived'));
    }

    if (since) {
      const sinceDate = new Date(since);
      if (!isNaN(sinceDate.getTime())) {
        conditions.push(gte(events.lastUpdatedAt, sinceDate));
      }
    }

    // Query events
    const eventList = await db
      .select({
        id: events.id,
        title: events.title,
        summary: events.summary,
        location: events.location,
        latitude: events.latitude,
        longitude: events.longitude,
        firstSeenAt: events.firstSeenAt,
        lastUpdatedAt: events.lastUpdatedAt,
        articleCount: events.articleCount,
        status: events.status,
        source: events.source,
        topics: events.topics,
      })
      .from(events)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(events.lastUpdatedAt))
      .limit(limit)
      .offset(offset);

    // Get article summaries for each event
    const eventsWithArticles = await Promise.all(
      eventList.map(async (event) => {
        const eventArticles = await db
          .select({
            id: articles.id,
            title: articles.title,
            url: articles.url,
            outletId: articles.outletId,
            outletName: outlets.name,
            outletCountry: outlets.country,
            publishedAt: articles.publishedAt,
            language: articles.language,
            extractionStatus: articles.extractionStatus,
          })
          .from(articles)
          .innerJoin(outlets, eq(articles.outletId, outlets.id))
          .where(eq(articles.eventId, event.id))
          .orderBy(desc(articles.publishedAt))
          .limit(10); // Max 10 articles per event in list view

        // Filter by region if specified
        if (region) {
          const filteredArticles = eventArticles.filter(
            (a) => a.outletCountry === region
          );
          if (filteredArticles.length === 0) return null;
          return { ...event, articles: filteredArticles };
        }

        return { ...event, articles: eventArticles };
      })
    );

    // Filter out null events (no articles in region)
    const filteredEvents = eventsWithArticles.filter((e) => e !== null);

    return NextResponse.json({
      events: filteredEvents,
      pagination: {
        limit,
        offset,
        hasMore: eventList.length === limit,
      },
    });
  } catch (error) {
    console.error('Error fetching events:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
