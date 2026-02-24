import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { outlets, articles } from '@/lib/db/schema';
import { eq, desc, sql, count, max } from 'drizzle-orm';

/**
 * GET /api/outlets
 *
 * Returns all outlets with article statistics.
 *
 * Query params:
 * - country: Filter by country code
 * - region: Filter by region
 * - active: Filter by active status (default: true)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // Parse query params
    const country = searchParams.get('country');
    const region = searchParams.get('region');
    const activeOnly = searchParams.get('active') !== 'false';

    // Build conditions
    const conditions = [];

    if (country) {
      conditions.push(eq(outlets.country, country));
    }

    if (region) {
      conditions.push(eq(outlets.region, region));
    }

    if (activeOnly) {
      conditions.push(eq(outlets.active, 1));
    }

    // Query outlets with article stats
    const outletList = await db
      .select({
        id: outlets.id,
        name: outlets.name,
        slug: outlets.slug,
        country: outlets.country,
        region: outlets.region,
        language: outlets.language,
        website: outlets.website,
        biasLabel: outlets.biasLabel,
        active: outlets.active,
        rssFeeds: outlets.rssFeeds,
        createdAt: outlets.createdAt,
        // Article stats via subquery
        articleCount: sql<number>`(
          SELECT COUNT(*) FROM ${articles}
          WHERE ${articles.outletId} = ${outlets.id}
        )`.as('article_count'),
        lastArticleAt: sql<Date>`(
          SELECT MAX(${articles.fetchedAt}) FROM ${articles}
          WHERE ${articles.outletId} = ${outlets.id}
        )`.as('last_article_at'),
      })
      .from(outlets)
      .where(conditions.length > 0 ? sql`${sql.join(conditions, sql` AND `)}` : undefined)
      .orderBy(outlets.name);

    // Group by region for easy consumption
    const byRegion = outletList.reduce((acc, outlet) => {
      const reg = outlet.region;
      if (!acc[reg]) {
        acc[reg] = [];
      }
      acc[reg].push(outlet);
      return acc;
    }, {} as Record<string, typeof outletList>);

    // Group by country
    const byCountry = outletList.reduce((acc, outlet) => {
      const ctry = outlet.country;
      if (!acc[ctry]) {
        acc[ctry] = [];
      }
      acc[ctry].push(outlet);
      return acc;
    }, {} as Record<string, typeof outletList>);

    return NextResponse.json({
      outlets: outletList,
      byRegion,
      byCountry,
      stats: {
        total: outletList.length,
        active: outletList.filter((o) => o.active === 1).length,
        withArticles: outletList.filter((o) => Number(o.articleCount) > 0).length,
        totalArticles: outletList.reduce((sum, o) => sum + Number(o.articleCount), 0),
      },
    });
  } catch (error) {
    console.error('Error fetching outlets:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
