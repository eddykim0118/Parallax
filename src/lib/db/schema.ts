import {
  pgTable,
  uuid,
  text,
  varchar,
  timestamp,
  jsonb,
  integer,
  real,
  pgEnum,
  index,
  uniqueIndex,
  customType,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Custom type for pgvector - stores 1536-dimensional embeddings
const vector = customType<{ data: number[]; driverData: string }>({
  dataType() {
    return 'vector(1536)';
  },
  toDriver(value: number[]): string {
    return `[${value.join(',')}]`;
  },
  fromDriver(value: string): number[] {
    // Parse "[1,2,3]" format from postgres
    return JSON.parse(value);
  },
});

// Enums
export const eventStatusEnum = pgEnum('event_status', ['active', 'stale', 'archived']);
export const extractionStatusEnum = pgEnum('extraction_status', ['full', 'partial', 'failed']);
export const eventSourceEnum = pgEnum('event_source', ['rss', 'gdelt', 'manual']);

// ============================================================================
// OUTLETS - News source definitions
// ============================================================================
export const outlets = pgTable('outlets', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 100 }).notNull().unique(),
  country: varchar('country', { length: 50 }).notNull(),
  region: varchar('region', { length: 50 }).notNull(),
  language: varchar('language', { length: 10 }).notNull(), // ISO 639-1 code
  rssFeeds: jsonb('rss_feeds').$type<string[]>().notNull().default([]),
  website: varchar('website', { length: 500 }),
  biasLabel: varchar('bias_label', { length: 50 }), // optional editorial classification
  active: integer('active').notNull().default(1), // 1 = active, 0 = disabled
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => [
  index('outlets_country_idx').on(table.country),
  index('outlets_region_idx').on(table.region),
  index('outlets_active_idx').on(table.active),
]);

// ============================================================================
// ARTICLES - Individual news articles
// ============================================================================
export const articles = pgTable('articles', {
  id: uuid('id').primaryKey().defaultRandom(),
  outletId: uuid('outlet_id').notNull().references(() => outlets.id),
  url: text('url').notNull().unique(),
  title: text('title').notNull(),
  content: text('content'), // full extracted text (null if extraction failed)
  summary: text('summary'), // RSS description or first paragraph
  language: varchar('language', { length: 10 }), // detected or fallback to outlet language
  publishedAt: timestamp('published_at'),
  fetchedAt: timestamp('fetched_at').notNull().defaultNow(),
  embedding: vector('embedding'), // 1536-dimensional vector from OpenAI
  eventId: uuid('event_id').references(() => events.id),
  extractionStatus: extractionStatusEnum('extraction_status').notNull().default('full'),
  metadata: jsonb('metadata').$type<{
    authors?: string[];
    tags?: string[];
    imageUrl?: string;
    wordCount?: number;
  }>().default({}),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => [
  index('articles_outlet_idx').on(table.outletId),
  index('articles_event_idx').on(table.eventId),
  index('articles_published_idx').on(table.publishedAt),
  index('articles_fetched_idx').on(table.fetchedAt),
  index('articles_language_idx').on(table.language),
]);

// ============================================================================
// EVENTS - Clustered groups of articles about the same topic
// ============================================================================
export const events = pgTable('events', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull(),
  summary: text('summary'),
  location: varchar('location', { length: 255 }), // primary geographic focus
  latitude: real('latitude'),
  longitude: real('longitude'),
  firstSeenAt: timestamp('first_seen_at').notNull().defaultNow(),
  lastUpdatedAt: timestamp('last_updated_at').notNull().defaultNow(),
  articleCount: integer('article_count').notNull().default(1),
  centroidEmbedding: vector('centroid_embedding'), // average of article embeddings
  status: eventStatusEnum('status').notNull().default('active'),
  source: eventSourceEnum('source').notNull().default('rss'),
  topics: jsonb('topics').$type<string[]>().default([]), // derived topics
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => [
  index('events_status_idx').on(table.status),
  index('events_last_updated_idx').on(table.lastUpdatedAt),
  index('events_first_seen_idx').on(table.firstSeenAt),
  index('events_location_idx').on(table.location),
]);

// ============================================================================
// NARRATIVE_SCORES - AI analysis of article framing (Phase 2)
// ============================================================================
export const narrativeScores = pgTable('narrative_scores', {
  id: uuid('id').primaryKey().defaultRandom(),
  articleId: uuid('article_id').notNull().references(() => articles.id),
  eventId: uuid('event_id').notNull().references(() => events.id),
  // Dimensional scores (-1 to 1 scale)
  framingScore: jsonb('framing_score').$type<{
    aggressiveness: number; // -1 = defensive, 1 = aggressive
    emotionalTone: number; // -1 = alarming, 1 = reassuring
    victimhood: number; // -1 = portrays self as victim, 1 = portrays other as victim
    centeringScore: number; // which actors are centered
  }>(),
  // Word choice flags
  languageFlags: jsonb('language_flags').$type<{
    flaggedTerms: Array<{ term: string; alternative: string; context: string }>;
  }>(),
  // Raw LLM output for transparency
  rawAnalysis: jsonb('raw_analysis'),
  modelVersion: varchar('model_version', { length: 50 }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => [
  index('narrative_scores_article_idx').on(table.articleId),
  index('narrative_scores_event_idx').on(table.eventId),
]);

// ============================================================================
// OUTLET_ALIGNMENTS - Cross-outlet similarity over time (Phase 2)
// ============================================================================
export const outletAlignments = pgTable('outlet_alignments', {
  id: uuid('id').primaryKey().defaultRandom(),
  outletAId: uuid('outlet_a_id').notNull().references(() => outlets.id),
  outletBId: uuid('outlet_b_id').notNull().references(() => outlets.id),
  topic: varchar('topic', { length: 100 }), // null = overall alignment
  alignmentScore: real('alignment_score').notNull(), // 0-1, higher = more similar framing
  sampleSize: integer('sample_size').notNull(),
  periodStart: timestamp('period_start').notNull(),
  periodEnd: timestamp('period_end').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => [
  index('outlet_alignments_outlet_a_idx').on(table.outletAId),
  index('outlet_alignments_outlet_b_idx').on(table.outletBId),
  index('outlet_alignments_topic_idx').on(table.topic),
  index('outlet_alignments_period_idx').on(table.periodStart, table.periodEnd),
]);

// ============================================================================
// Relations
// ============================================================================
export const outletsRelations = relations(outlets, ({ many }) => ({
  articles: many(articles),
  alignmentsAsA: many(outletAlignments, { relationName: 'outletA' }),
  alignmentsAsB: many(outletAlignments, { relationName: 'outletB' }),
}));

export const articlesRelations = relations(articles, ({ one, many }) => ({
  outlet: one(outlets, {
    fields: [articles.outletId],
    references: [outlets.id],
  }),
  event: one(events, {
    fields: [articles.eventId],
    references: [events.id],
  }),
  narrativeScores: many(narrativeScores),
}));

export const eventsRelations = relations(events, ({ many }) => ({
  articles: many(articles),
  narrativeScores: many(narrativeScores),
}));

export const narrativeScoresRelations = relations(narrativeScores, ({ one }) => ({
  article: one(articles, {
    fields: [narrativeScores.articleId],
    references: [articles.id],
  }),
  event: one(events, {
    fields: [narrativeScores.eventId],
    references: [events.id],
  }),
}));

export const outletAlignmentsRelations = relations(outletAlignments, ({ one }) => ({
  outletA: one(outlets, {
    fields: [outletAlignments.outletAId],
    references: [outlets.id],
    relationName: 'outletA',
  }),
  outletB: one(outlets, {
    fields: [outletAlignments.outletBId],
    references: [outlets.id],
    relationName: 'outletB',
  }),
}));
