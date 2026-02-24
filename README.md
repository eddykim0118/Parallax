# Parallax

Real-time media narrative divergence tracker. Analyzes how different news outlets across the US, China, South Korea, Japan, and Taiwan cover the same geopolitical events, and visualizes where their framing aligns or diverges.

**Core idea:** Same event, different narratives. Data speaks, not opinion.

## Features

- **Event Detection & Clustering**: Monitors RSS feeds from 35+ outlets across 5 regions, detects when multiple outlets cover the same event, and clusters articles using embedding similarity
- **GDELT Integration**: Supplements RSS with GDELT's global event database for better coverage
- **Language-Aware Clustering**: Different similarity thresholds for same-language (0.80) vs cross-language (0.75) matching
- **AI Narrative Analysis** (Phase 2): Extract factual claims, score framing dimensions, identify word choice patterns
- **Visualization** (Phase 2): World map with event hotspots, divergence wheels, outlet constellation maps

## Tech Stack

- **Frontend**: Next.js 14, TypeScript, Tailwind CSS
- **Backend**: Next.js API routes
- **Database**: PostgreSQL with pgvector for embeddings
- **Queue**: BullMQ with Redis
- **AI**: OpenAI text-embedding-3-small for clustering

## Quick Start

```bash
# 1. Clone and install
git clone <repo>
cd parallax
npm install

# 2. Set up environment
cp .env.example .env
# Edit .env with your OpenAI API key

# 3. Start database and Redis
docker-compose up -d

# 4. Run database migrations
npm run db:push

# 5. Seed outlet registry
npm run seed

# 6. Start the worker (in a separate terminal)
npm run worker

# 7. Start the dev server
npm run dev
```

## Coverage

| Region | Outlets |
|--------|---------|
| US | NYT, WSJ, CNN, Fox News, AP, Reuters |
| China | CGTN, People's Daily, Global Times, Xinhua |
| South Korea | Chosun Ilbo, JoongAng, Hankyoreh, Yonhap, KBS, Korea Herald |
| Japan | NHK, Asahi, Yomiuri, Japan Times, Kyodo, Nikkei |
| Taiwan | Taipei Times, Liberty Times, UDN, Focus Taiwan, Taiwan News |
| International | BBC, Al Jazeera, DW, SCMP, Guardian, France 24, The Diplomat, CNA |

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/events` | List clustered events with articles |
| GET | `/api/events/[id]` | Get a single event with all articles |
| GET | `/api/articles` | List articles with filtering |
| GET | `/api/outlets` | List news outlets with stats |
| GET | `/api/health` | Health check endpoint |

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Next.js App                          │
│  ┌────────────┐  ┌─────────────┐  ┌──────────────────────┐ │
│  │   Pages    │  │ API Routes  │  │     Components       │ │
│  └────────────┘  └─────────────┘  └──────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      Shared Library                         │
│  ┌─────────┐  ┌───────────┐  ┌──────────┐  ┌────────────┐  │
│  │   DB    │  │ Ingestion │  │Clustering│  │   Types    │  │
│  └─────────┘  └───────────┘  └──────────┘  └────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
       ┌──────────────────────┼──────────────────────┐
       ▼                      ▼                      ▼
┌─────────────┐      ┌─────────────┐        ┌─────────────┐
│  PostgreSQL │      │    Redis    │        │   OpenAI    │
│  + pgvector │      │   (BullMQ)  │        │   API       │
└─────────────┘      └─────────────┘        └─────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                       Worker Process                         │
│  ┌─────────────┐  ┌───────────────┐  ┌─────────────────┐   │
│  │ Fetch Feeds │  │Process Article│  │ Cluster Events  │   │
│  │  (15 min)   │  │  (on demand)  │  │    (30 min)     │   │
│  └─────────────┘  └───────────────┘  └─────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm run worker` | Start background worker (dev) |
| `npm run worker:prod` | Start background worker (prod) |
| `npm run db:push` | Push schema to database |
| `npm run db:studio` | Open Drizzle Studio |
| `npm run seed` | Seed outlet registry |

## Environment Variables

```env
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
OPENAI_API_KEY=sk-...
CLUSTER_THRESHOLD_SAME_LANG=0.80
CLUSTER_THRESHOLD_CROSS_LANG=0.75
```

## Phase 2 (Coming)

- [ ] AI narrative analysis with GPT-4
- [ ] Word choice flagging ("reunification" vs "annexation")
- [ ] Outlet alignment scoring over time
- [ ] Map visualization with deck.gl
- [ ] Divergence wheel charts
- [ ] Timeline view for narrative drift

## License

MIT
