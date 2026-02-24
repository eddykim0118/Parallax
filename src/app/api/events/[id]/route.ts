import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { events, articles, outlets } from '@/lib/db/schema';
import { eq, desc } from 'drizzle-orm';

/**
 * GET /api/events/[id]
 *
 * Returns a single event with all its articles.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Get event
    const event = await db.query.events.findFirst({
      where: eq(events.id, id),
    });

    if (!event) {
      return NextResponse.json(
        { error: 'Event not found' },
        { status: 404 }
      );
    }

    // Get all articles for this event
    const eventArticles = await db
      .select({
        id: articles.id,
        title: articles.title,
        url: articles.url,
        content: articles.content,
        summary: articles.summary,
        outletId: articles.outletId,
        outletName: outlets.name,
        outletSlug: outlets.slug,
        outletCountry: outlets.country,
        outletRegion: outlets.region,
        publishedAt: articles.publishedAt,
        fetchedAt: articles.fetchedAt,
        language: articles.language,
        extractionStatus: articles.extractionStatus,
        metadata: articles.metadata,
      })
      .from(articles)
      .innerJoin(outlets, eq(articles.outletId, outlets.id))
      .where(eq(articles.eventId, id))
      .orderBy(desc(articles.publishedAt));

    // Group articles by country for easy comparison
    const articlesByCountry = eventArticles.reduce((acc, article) => {
      const country = article.outletCountry;
      if (!acc[country]) {
        acc[country] = [];
      }
      acc[country].push(article);
      return acc;
    }, {} as Record<string, typeof eventArticles>);

    // Calculate outlet diversity
    const uniqueOutlets = new Set(eventArticles.map((a) => a.outletId));
    const uniqueCountries = new Set(eventArticles.map((a) => a.outletCountry));

    return NextResponse.json({
      event: {
        ...event,
        // Don't send embeddings to frontend
        centroidEmbedding: undefined,
      },
      articles: eventArticles.map((a) => ({
        ...a,
        // Truncate content for response
        content: a.content?.slice(0, 2000),
      })),
      articlesByCountry,
      stats: {
        totalArticles: eventArticles.length,
        uniqueOutlets: uniqueOutlets.size,
        uniqueCountries: uniqueCountries.size,
        countries: Array.from(uniqueCountries),
      },
    });
  } catch (error) {
    console.error('Error fetching event:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
