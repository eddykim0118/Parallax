import { InferSelectModel, InferInsertModel } from 'drizzle-orm';
import {
  outlets,
  articles,
  events,
  narrativeScores,
  outletAlignments,
} from '../db/schema';

// ============================================================================
// Database Model Types
// ============================================================================

// Outlets
export type Outlet = InferSelectModel<typeof outlets>;
export type NewOutlet = InferInsertModel<typeof outlets>;

// Articles
export type Article = InferSelectModel<typeof articles>;
export type NewArticle = InferInsertModel<typeof articles>;

// Events
export type Event = InferSelectModel<typeof events>;
export type NewEvent = InferInsertModel<typeof events>;

// Narrative Scores
export type NarrativeScore = InferSelectModel<typeof narrativeScores>;
export type NewNarrativeScore = InferInsertModel<typeof narrativeScores>;

// Outlet Alignments
export type OutletAlignment = InferSelectModel<typeof outletAlignments>;
export type NewOutletAlignment = InferInsertModel<typeof outletAlignments>;

// ============================================================================
// API Response Types
// ============================================================================

export interface EventWithArticles extends Event {
  articles: ArticleSummary[];
}

export interface ArticleSummary {
  id: string;
  title: string;
  url: string;
  outletId: string;
  outletName: string;
  outletCountry: string;
  publishedAt: Date | null;
  language: string | null;
  extractionStatus: 'full' | 'partial' | 'failed';
}

export interface OutletWithStats extends Outlet {
  articleCount: number;
  lastArticleAt: Date | null;
}

// ============================================================================
// Ingestion Types
// ============================================================================

export interface RSSFeedItem {
  title: string;
  link: string;
  pubDate?: string;
  content?: string;
  contentSnippet?: string;
  creator?: string;
  categories?: string[];
}

export interface ParsedArticle {
  url: string;
  title: string;
  content: string | null;
  summary: string | null;
  publishedAt: Date | null;
  authors: string[];
  language: string | null;
  extractionStatus: 'full' | 'partial' | 'failed';
}

export interface GDELTEvent {
  globalEventId: string;
  dateAdded: Date;
  sourceUrl: string;
  title: string;
  actors: string[];
  location: {
    name: string;
    latitude: number;
    longitude: number;
  } | null;
  topics: string[];
}

// ============================================================================
// Clustering Types
// ============================================================================

export interface ClusteringResult {
  articleId: string;
  eventId: string | null; // null = new event created
  similarity: number;
  isNewEvent: boolean;
}

export interface EmbeddingResult {
  embedding: number[];
  model: string;
  tokenCount: number;
}

// ============================================================================
// Configuration Types
// ============================================================================

export interface OutletConfig {
  name: string;
  slug: string;
  country: string;
  region: 'north_america' | 'east_asia' | 'europe' | 'middle_east';
  language: string;
  rssFeeds: string[];
  website: string;
  biasLabel?: string;
  active?: boolean;
}

export interface ClusteringConfig {
  sameLanguageThreshold: number;
  crossLanguageThreshold: number;
  maxEventAgeDays: number;
}

// ============================================================================
// Job Types (BullMQ)
// ============================================================================

export interface FetchFeedsJobData {
  outletId?: string; // if provided, only fetch this outlet
}

export interface ProcessArticleJobData {
  url: string;
  outletId: string;
  rssSummary?: string;
  rssPublishedAt?: string;
}

export interface ClusterEventsJobData {
  articleIds?: string[]; // if provided, only cluster these articles
}

export interface FetchGDELTJobData {
  query?: string; // optional filter
  since?: string; // ISO date
}
