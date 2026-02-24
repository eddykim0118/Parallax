/**
 * Seed Outlets Script
 *
 * Run with: npm run seed
 *
 * This script populates the outlets table with all configured news sources.
 * It's safe to run multiple times - existing outlets are updated, not duplicated.
 */

import 'dotenv/config';
import { db } from '../src/lib/db/client';
import { outlets } from '../src/lib/db/schema';
import { outletRegistry, outletStats } from '../src/lib/outlets/registry';
import { eq } from 'drizzle-orm';

async function seedOutlets() {
  console.log('🌱 Seeding outlets...\n');
  console.log(`Found ${outletStats.total} outlets in registry:`);
  console.log('  By country:', outletStats.byCountry);
  console.log('  By region:', outletStats.byRegion);
  console.log('');

  let created = 0;
  let updated = 0;

  for (const config of outletRegistry) {
    // Check if outlet exists
    const existing = await db.query.outlets.findFirst({
      where: eq(outlets.slug, config.slug),
    });

    if (existing) {
      // Update existing outlet
      await db
        .update(outlets)
        .set({
          name: config.name,
          country: config.country,
          region: config.region,
          language: config.language,
          rssFeeds: config.rssFeeds,
          website: config.website,
          biasLabel: config.biasLabel,
          active: config.active === false ? 0 : 1,
          updatedAt: new Date(),
        })
        .where(eq(outlets.slug, config.slug));
      updated++;
      console.log(`  ✓ Updated: ${config.name} (${config.slug})`);
    } else {
      // Create new outlet
      await db.insert(outlets).values({
        name: config.name,
        slug: config.slug,
        country: config.country,
        region: config.region,
        language: config.language,
        rssFeeds: config.rssFeeds,
        website: config.website,
        biasLabel: config.biasLabel,
        active: config.active === false ? 0 : 1,
      });
      created++;
      console.log(`  + Created: ${config.name} (${config.slug})`);
    }
  }

  console.log('');
  console.log(`✅ Done! Created ${created}, updated ${updated}`);
  process.exit(0);
}

seedOutlets().catch((error) => {
  console.error('❌ Seeding failed:', error);
  process.exit(1);
});
