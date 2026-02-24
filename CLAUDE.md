# Parallax - Project Guide

This document explains the architecture, decisions, and code patterns in Parallax. It's designed to help you understand not just *what* was built, but *why* each piece exists.

---

## What We're Building

**Parallax** is a media narrative divergence tracker. The core insight: when the same geopolitical event happens, different news outlets frame it differently based on their country, editorial stance, and audience.

For example, if there's a military exercise in the Taiwan Strait:
- **CGTN** (China): "PLA conducts routine training exercises"
- **Taipei Times** (Taiwan): "China escalates military threat"
- **NYT** (US): "US allies express concern over Chinese military activity"

Same event, different narratives. Parallax detects these patterns automatically.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     USER INTERFACE                          │
│                    (Next.js Frontend)                       │
│         localhost:3000 or your-domain.com                   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      API LAYER                              │
│              (Next.js API Routes in /src/app/api)           │
│                                                             │
│   GET /api/events     - List clustered events               │
│   GET /api/events/[id] - Single event with articles         │
│   GET /api/articles   - List articles                       │
│   GET /api/outlets    - List news outlets                   │
│   GET /api/health     - Health check                        │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   SHARED LIBRARY                            │
│                     (/src/lib)                              │
│                                                             │
│   /db          - Database schema & connection               │
│   /ingestion   - RSS parsing, article extraction            │
│   /clustering  - Embeddings, event grouping                 │
│   /outlets     - News source definitions                    │
└─────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
       ┌───────────┐   ┌───────────┐   ┌───────────┐
       │ PostgreSQL│   │   Redis   │   │  OpenAI   │
       │ + pgvector│   │ (BullMQ)  │   │    API    │
       └───────────┘   └───────────┘   └───────────┘
              │               │
              │               ▼
              │    ┌─────────────────────────────────┐
              │    │         WORKER PROCESS          │
              │    │           (/worker)             │
              │    │                                 │
              │    │  • Fetch RSS feeds (15 min)     │
              │    │  • Process articles             │
              │    │  • Cluster into events (30 min) │
              │    │  • Fetch from GDELT (15 min)    │
              │    └─────────────────────────────────┘
              │               │
              └───────────────┘
```

### Why This Architecture?

**Monorepo with separate worker**: The news ingestion is "heavy" work - fetching dozens of RSS feeds, extracting article text, calling OpenAI for embeddings. If we did this in API routes, your server would be slow and could timeout. By separating into a worker process, the API stays fast and the heavy work happens in the background.

**PostgreSQL with pgvector**: We need to store article embeddings (1536-dimensional vectors) and do similarity searches. pgvector lets us do this in Postgres instead of needing a separate vector database like Pinecone. Simpler = better for learning.

**Redis + BullMQ**: Job queues let us schedule recurring work (fetch feeds every 15 min) and handle failures gracefully (retry 3 times with exponential backoff). BullMQ is the standard for Node.js.

---

## Key Concepts Explained

### What is an Embedding?

An embedding is a way to represent text as numbers that capture meaning.

Think of it like coordinates on a map. The sentence "China conducts military exercises" might become `[0.23, -0.45, 0.12, ...]` (1536 numbers). Similar sentences have similar coordinates - they're "close" to each other in this 1536-dimensional space.

We use OpenAI's `text-embedding-3-small` model to convert article text into embeddings. Then we can find similar articles by measuring the distance between their embeddings.

**Code location**: `src/lib/clustering/embeddings.ts`

### What is Cosine Similarity?

Cosine similarity measures how similar two vectors are, from -1 (opposite) to 1 (identical).

```typescript
// From embeddings.ts
export function cosineSimilarity(a: number[], b: number[]): number {
  // Dot product divided by the product of magnitudes
  // Returns 0-1 for our use case (embeddings are normalized)
}
```

We use thresholds:
- **0.80** for same-language articles (stricter match)
- **0.75** for cross-language articles (looser because translation affects similarity)

### What is Event Clustering?

When we get a new article, we ask: "Is this about an event we already know about?"

1. Get the article's embedding
2. Compare to all recent events' "centroid" (average embedding)
3. If similarity > threshold, add to that event
4. If no match, create a new event

**Code location**: `src/lib/clustering/event-clusterer.ts`

### What is a Centroid?

A centroid is the "center" of a cluster - the average of all embeddings in an event.

When we add an article to an event, we update the centroid using a running average:
```typescript
// New average = old average + (new value - old average) / count
newCentroid[i] = oldCentroid[i] + (articleEmbedding[i] - oldCentroid[i]) / newCount;
```

This is more efficient than recalculating from all articles each time.

---

## Database Schema Explained

### Why These Tables?

```
outlets (35 rows)
├── id, name, slug, country, region, language
├── rss_feeds (JSON array of feed URLs)
└── active (can disable without deleting)

articles (grows over time)
├── id, outlet_id (foreign key to outlets)
├── url, title, content, summary
├── language (detected or fallback)
├── embedding (1536-dim vector)
├── event_id (foreign key to events, nullable)
└── extraction_status ('full', 'partial', 'failed')

events (grows over time)
├── id, title, summary
├── location, latitude, longitude (for map display)
├── centroid_embedding (average of article embeddings)
├── article_count
└── status ('active', 'stale', 'archived')

narrative_scores (Phase 2 - empty for now)
└── AI analysis scores per article

outlet_alignments (Phase 2 - empty for now)
└── Which outlets frame things similarly over time
```

**Code location**: `src/lib/db/schema.ts`

### Why pgvector?

PostgreSQL doesn't natively support vector types. pgvector adds:
- `vector(1536)` column type
- Similarity operators: `<=>` (cosine distance), `<->` (L2 distance)
- Efficient indexing for similarity search

We installed it via a custom Docker image (see `Dockerfile.postgres`).

---

## The Ingestion Pipeline

### Step 1: Fetch RSS Feeds

Every 15 minutes, the worker fetches RSS feeds from all active outlets.

```typescript
// src/lib/ingestion/rss-parser.ts
const feed = await parser.parseURL(feedUrl);
// Returns: [{ title, link, pubDate, content }, ...]
```

**Why RSS?** It's the universal standard for news feeds. Every major outlet has one. No API keys needed, no rate limits (usually).

### Step 2: Deduplicate

Before processing, we check if we've seen this URL before.

```typescript
// src/lib/ingestion/deduplicator.ts
const normalized = normalizeUrl(url);  // Remove tracking params
const exists = await urlExists(normalized);
```

**Why normalize URLs?** The same article might have different tracking parameters:
- `nytimes.com/article?utm_source=twitter`
- `nytimes.com/article?utm_source=facebook`
- `nytimes.com/article`

All three are the same article. We strip tracking params to catch duplicates.

### Step 3: Extract Article Content

RSS feeds only give us titles and summaries. We fetch the full article.

```typescript
// src/lib/ingestion/article-extractor.ts
const article = await extract(url);
// Returns: { title, content, description, author, ... }
```

**Why @extractus/article-extractor?** It's better than alternatives (like Readability) at handling news sites, paywalls, and various HTML structures.

**Fallback strategy**: If extraction fails (paywall, timeout), we use the RSS description. Partial data is better than no data.

### Step 4: Detect Language

We detect the article's language for clustering thresholds.

```typescript
// src/lib/ingestion/article-extractor.ts
const detected = franc(text);  // Returns 'eng', 'kor', 'jpn', etc.
const iso6391 = LANG_CODE_MAP[detected];  // Convert to 'en', 'ko', 'ja'
```

**Fallback**: If `franc` confidence is low (short text), we use the outlet's known language.

### Step 5: Generate Embedding

Convert the article text to a 1536-dimensional vector.

```typescript
// src/lib/clustering/embeddings.ts
const response = await openai.embeddings.create({
  model: 'text-embedding-3-small',
  input: title + '\n' + content.slice(0, 8000),
});
```

**Why text-embedding-3-small?** It's cheap ($0.02 per 1M tokens), fast, and handles multilingual text well. Good for MVP.

### Step 6: Cluster into Events

Find or create an event for this article.

```typescript
// src/lib/clustering/event-clusterer.ts
for (const event of activeEvents) {
  const similarity = cosineSimilarity(articleEmbedding, event.centroidEmbedding);
  if (similarity > threshold) {
    // Add to existing event
    await assignArticleToEvent(articleId, eventId);
  }
}
// If no match found, create new event
```

---

## The Worker Process

### Why a Separate Worker?

The worker runs independently from the web server. Benefits:
1. **Long-running tasks** don't block API responses
2. **Scheduled jobs** run reliably (cron-like)
3. **Failures are isolated** - a bad article doesn't crash your server
4. **Scalable** - can run multiple workers in production

### Job Types

```typescript
// worker/queue.ts
FETCH_FEEDS     // Every 15 min - poll all RSS feeds
PROCESS_ARTICLE // On-demand - extract, embed, store one article
CLUSTER_EVENTS  // Every 30 min - group unclustered articles
FETCH_GDELT     // Every 15 min - supplementary event detection
```

### How BullMQ Works

BullMQ uses Redis to store job queues. When you add a job:

1. Job goes into Redis queue
2. Worker picks it up
3. Worker runs your handler function
4. On success: job marked complete
5. On failure: retry with exponential backoff

```typescript
// Adding a job
await processArticleQueue.add('process', { url, outletId });

// Worker handles it
new Worker('process-article', async (job) => {
  const { url, outletId } = job.data;
  // ... do the work
});
```

---

## File Structure Explained

```
parallax/
├── src/
│   ├── app/                      # Next.js App Router
│   │   ├── api/                  # API routes (serverless functions)
│   │   │   ├── events/route.ts   # GET /api/events
│   │   │   ├── articles/route.ts # GET /api/articles
│   │   │   └── ...
│   │   ├── layout.tsx            # Root layout
│   │   └── page.tsx              # Home page
│   │
│   ├── lib/                      # Shared code (used by API + worker)
│   │   ├── db/
│   │   │   ├── schema.ts         # Drizzle ORM table definitions
│   │   │   └── client.ts         # Database connection
│   │   ├── ingestion/
│   │   │   ├── rss-parser.ts     # Fetch & parse RSS feeds
│   │   │   ├── article-extractor.ts  # Get full article text
│   │   │   ├── deduplicator.ts   # URL normalization
│   │   │   └── gdelt.ts          # GDELT API integration
│   │   ├── clustering/
│   │   │   ├── embeddings.ts     # OpenAI embedding calls
│   │   │   └── event-clusterer.ts # Group articles into events
│   │   ├── outlets/
│   │   │   └── registry.ts       # 35 outlet definitions
│   │   ├── types/
│   │   │   └── index.ts          # TypeScript type definitions
│   │   └── logger.ts             # Structured logging with pino
│   │
│   └── components/               # React components (Phase 2)
│
├── worker/                       # Background job processor
│   ├── index.ts                  # Entry point, starts all workers
│   ├── queue.ts                  # Queue definitions & helpers
│   └── jobs/
│       ├── fetch-feeds.ts        # Poll RSS feeds
│       ├── process-article.ts    # Extract & embed one article
│       ├── cluster-events.ts     # Group articles into events
│       └── fetch-gdelt.ts        # Pull from GDELT API
│
├── scripts/
│   ├── seed-outlets.ts           # Populate outlets table
│   ├── test-rss.ts               # Test RSS parsing
│   └── test-pipeline.ts          # Full integration test
│
├── docker-compose.yml            # Postgres + Redis for local dev
├── Dockerfile.postgres           # Custom image with pgvector
├── drizzle.config.ts             # ORM configuration
└── .env.example                  # Environment variables template
```

---

## Running the Project

### Development

```bash
# 1. Start databases
docker compose up -d

# 2. Create tables
npm run db:push

# 3. Load outlets
npm run seed

# 4. Start worker (in one terminal)
npm run worker

# 5. Start web server (in another terminal)
npm run dev

# 6. Test it
curl http://localhost:3000/api/health
curl http://localhost:3000/api/outlets
```

### Testing

```bash
# Test RSS parsing only
npx tsx scripts/test-rss.ts

# Test full pipeline (needs OPENAI_API_KEY in .env)
npx tsx scripts/test-pipeline.ts
```

---

## What's Next (Phase 2)

1. **AI Narrative Analysis**: Use GPT-4 to score articles on:
   - Framing (defensive vs aggressive)
   - Emotional tone (alarming vs reassuring)
   - Actor centering (who's the protagonist/antagonist)
   - Word choice flags ("reunification" vs "annexation")

2. **Visualization**:
   - World map with event hotspots (deck.gl)
   - Divergence wheel showing outlet framing
   - Outlet constellation map (similar outlets cluster together)

3. **Outlet Alignment Scoring**: Track which outlets consistently frame things similarly over time

---

## Questions to Think About

As you explore the code, consider:

1. **Why did we use Drizzle instead of Prisma?** (Hint: raw SQL for pgvector)
2. **Why separate thresholds for same-language vs cross-language?**
3. **What happens if an RSS feed goes down for a week?**
4. **How would you add a new outlet?**
5. **What would break if we removed Redis?**

---

## Useful Commands

```bash
# View database
npm run db:studio

# Check Docker containers
docker compose ps

# View worker logs
npm run worker

# Reset database (careful!)
docker compose down -v
docker compose up -d
npm run db:push
npm run seed
```
