/**
 * Quick test script for RSS parsing
 * Run with: npx tsx scripts/test-rss.ts
 */

import 'dotenv/config';
import { fetchFeed } from '../src/lib/ingestion/rss-parser';
import { extractArticle } from '../src/lib/ingestion/article-extractor';

async function testRSS() {
  console.log('🔍 Testing RSS Feed Parsing...\n');

  // Test with BBC (reliable feed)
  const feedUrl = 'https://feeds.bbci.co.uk/news/world/asia/rss.xml';

  console.log(`Fetching: ${feedUrl}`);
  const result = await fetchFeed(feedUrl);

  if (!result.success) {
    console.error('❌ Failed to fetch feed:', result.error);
    return;
  }

  console.log(`✅ Fetched ${result.items.length} articles\n`);

  // Show first 3 articles
  console.log('Sample articles:');
  for (const item of result.items.slice(0, 3)) {
    console.log(`  - ${item.title}`);
    console.log(`    ${item.link}`);
    console.log('');
  }

  // Test article extraction on the first article
  if (result.items.length > 0) {
    const firstUrl = result.items[0].link;
    console.log('📄 Testing article extraction...');
    console.log(`URL: ${firstUrl}\n`);

    const article = await extractArticle(firstUrl, {
      fallbackContent: result.items[0].contentSnippet,
    });

    console.log(`Title: ${article.title}`);
    console.log(`Language: ${article.language}`);
    console.log(`Status: ${article.extractionStatus}`);
    console.log(`Content length: ${article.content?.length || 0} chars`);
    console.log(`Summary: ${article.summary?.slice(0, 150)}...`);
  }

  console.log('\n✅ Test complete!');
}

testRSS().catch(console.error);
