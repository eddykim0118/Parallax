/**
 * Integration test for the full ingestion pipeline
 * Run with: npx tsx scripts/test-pipeline.ts
 *
 * This script:
 * 1. Fetches articles from BBC RSS
 * 2. Extracts full text
 * 3. Generates embeddings (requires OPENAI_API_KEY)
 * 4. Stores in database
 * 5. Runs clustering
 */

import 'dotenv/config';
import { db } from '../src/lib/db/client';
import { articles, outlets, events } from '../src/lib/db/schema';
import { eq, count } from 'drizzle-orm';
import { fetchFeed } from '../src/lib/ingestion/rss-parser';
import { extractArticle } from '../src/lib/ingestion/article-extractor';
import { normalizeUrl, urlExists } from '../src/lib/ingestion/deduplicator';
import { generateEmbedding, prepareTextForEmbedding } from '../src/lib/clustering/embeddings';
import { clusterArticles } from '../src/lib/clustering/event-clusterer';

const SKIP_EMBEDDING = !process.env.OPENAI_API_KEY;

async function testPipeline() {
  console.log('🚀 Testing Full Ingestion Pipeline\n');
  console.log('=' .repeat(50));

  if (SKIP_EMBEDDING) {
    console.log('⚠️  OPENAI_API_KEY not set - skipping embedding generation');
    console.log('   (Articles will be stored but not clustered)\n');
  }

  // Step 1: Get BBC outlet from DB
  console.log('\n📡 Step 1: Fetching outlet...');
  const bbc = await db.query.outlets.findFirst({
    where: eq(outlets.slug, 'bbc'),
  });

  if (!bbc) {
    console.error('❌ BBC outlet not found. Run: npm run seed');
    return;
  }
  console.log(`   Found: ${bbc.name} (${bbc.id})`);

  // Step 2: Fetch RSS feed
  console.log('\n📰 Step 2: Fetching RSS feed...');
  const feedUrl = (bbc.rssFeeds as string[])[0];
  const feed = await fetchFeed(feedUrl);

  if (!feed.success) {
    console.error('❌ Failed to fetch feed:', feed.error);
    return;
  }
  console.log(`   Fetched ${feed.items.length} articles`);

  // Step 3: Process first 3 new articles
  console.log('\n📄 Step 3: Processing articles...');
  let processed = 0;
  const maxToProcess = 3;

  for (const item of feed.items) {
    if (processed >= maxToProcess) break;

    const url = normalizeUrl(item.link || '');
    if (!url) continue;

    // Check if exists
    const exists = await urlExists(url);
    if (exists) {
      console.log(`   ⏭️  Skipping (exists): ${item.title?.slice(0, 50)}...`);
      continue;
    }

    console.log(`\n   Processing: ${item.title?.slice(0, 50)}...`);

    // Extract article
    const parsed = await extractArticle(url, {
      fallbackContent: item.contentSnippet,
      fallbackLanguage: bbc.language,
    });

    // Generate embedding (if API key available)
    let embedding: number[] | null = null;
    if (!SKIP_EMBEDDING) {
      try {
        const text = prepareTextForEmbedding(parsed.title, parsed.content, parsed.summary);
        const result = await generateEmbedding(text);
        embedding = result.embedding;
        console.log(`   ✅ Embedding generated (${result.tokenCount} tokens)`);
      } catch (error) {
        console.log(`   ⚠️  Embedding failed: ${error}`);
      }
    }

    // Insert into database
    const [inserted] = await db
      .insert(articles)
      .values({
        outletId: bbc.id,
        url,
        title: parsed.title,
        content: parsed.content,
        summary: parsed.summary,
        language: parsed.language,
        publishedAt: item.pubDate ? new Date(item.pubDate) : null,
        extractionStatus: parsed.extractionStatus,
        embedding,
      })
      .returning({ id: articles.id });

    console.log(`   ✅ Stored in DB (id: ${inserted.id})`);
    processed++;
  }

  console.log(`\n   Processed ${processed} articles`);

  // Step 4: Run clustering (if we have embeddings)
  if (!SKIP_EMBEDDING && processed > 0) {
    console.log('\n🔮 Step 4: Running clustering...');
    const clusterResults = await clusterArticles();
    console.log(`   Clustered ${clusterResults.length} articles`);
    console.log(`   New events: ${clusterResults.filter(r => r.isNewEvent).length}`);
  }

  // Step 5: Show stats
  console.log('\n📊 Step 5: Database stats...');
  const [articleCount] = await db.select({ count: count() }).from(articles);
  const [eventCount] = await db.select({ count: count() }).from(events);

  console.log(`   Articles: ${articleCount.count}`);
  console.log(`   Events: ${eventCount.count}`);

  console.log('\n' + '='.repeat(50));
  console.log('✅ Pipeline test complete!');
  console.log('\nNext steps:');
  console.log('  1. Check API: curl http://localhost:3000/api/articles');
  console.log('  2. Start worker: npm run worker');
  console.log('  3. View events: curl http://localhost:3000/api/events');

  process.exit(0);
}

testPipeline().catch((error) => {
  console.error('❌ Pipeline test failed:', error);
  process.exit(1);
});
