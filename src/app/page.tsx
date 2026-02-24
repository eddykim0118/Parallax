export default function Home() {
  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <main className="container mx-auto px-6 py-16 max-w-4xl">
        {/* Header */}
        <div className="mb-16">
          <h1 className="text-5xl font-bold tracking-tight mb-4">
            Parallax
          </h1>
          <p className="text-xl text-zinc-400 max-w-2xl">
            Real-time media narrative divergence tracker. See how different news
            outlets across the US, China, South Korea, Japan, and Taiwan cover
            the same geopolitical events.
          </p>
        </div>

        {/* Status */}
        <div className="mb-16">
          <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wider mb-4">
            System Status
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <StatusCard
              title="API"
              status="operational"
              href="/api/health"
            />
            <StatusCard
              title="Database"
              status="pending"
              note="Run: docker-compose up -d"
            />
            <StatusCard
              title="Worker"
              status="pending"
              note="Run: npm run worker"
            />
          </div>
        </div>

        {/* API Endpoints */}
        <div className="mb-16">
          <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wider mb-4">
            API Endpoints
          </h2>
          <div className="space-y-3">
            <Endpoint method="GET" path="/api/events" description="List clustered events with articles" />
            <Endpoint method="GET" path="/api/events/[id]" description="Get a single event with all articles" />
            <Endpoint method="GET" path="/api/articles" description="List articles with filtering" />
            <Endpoint method="GET" path="/api/outlets" description="List news outlets with stats" />
            <Endpoint method="GET" path="/api/health" description="Health check endpoint" />
          </div>
        </div>

        {/* Quick Start */}
        <div className="mb-16">
          <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wider mb-4">
            Quick Start
          </h2>
          <div className="bg-zinc-900 rounded-lg p-6 font-mono text-sm">
            <pre className="text-zinc-300">
{`# 1. Start the database and Redis
docker-compose up -d

# 2. Run database migrations
npm run db:push

# 3. Seed the outlet registry
npm run seed

# 4. Start the worker (in another terminal)
npm run worker

# 5. Start the dev server
npm run dev`}
            </pre>
          </div>
        </div>

        {/* Coverage */}
        <div>
          <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wider mb-4">
            Coverage
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <CountryCard country="US" outlets={6} />
            <CountryCard country="China" outlets={4} />
            <CountryCard country="South Korea" outlets={6} />
            <CountryCard country="Japan" outlets={6} />
            <CountryCard country="Taiwan" outlets={5} />
          </div>
          <p className="text-zinc-500 text-sm mt-4">
            + 8 international outlets (BBC, Al Jazeera, DW, SCMP, etc.)
          </p>
        </div>
      </main>
    </div>
  );
}

function StatusCard({ title, status, href, note }: {
  title: string;
  status: 'operational' | 'pending' | 'error';
  href?: string;
  note?: string;
}) {
  const statusColors = {
    operational: 'bg-green-500',
    pending: 'bg-yellow-500',
    error: 'bg-red-500',
  };

  const content = (
    <div className="bg-zinc-900 rounded-lg p-4 border border-zinc-800 hover:border-zinc-700 transition-colors">
      <div className="flex items-center justify-between mb-2">
        <span className="font-medium">{title}</span>
        <span className={`w-2 h-2 rounded-full ${statusColors[status]}`} />
      </div>
      {note && <p className="text-xs text-zinc-500">{note}</p>}
    </div>
  );

  if (href) {
    return <a href={href}>{content}</a>;
  }
  return content;
}

function Endpoint({ method, path, description }: {
  method: string;
  path: string;
  description: string;
}) {
  return (
    <div className="flex items-center gap-4 text-sm">
      <span className="bg-zinc-800 text-zinc-300 px-2 py-1 rounded font-mono text-xs w-12 text-center">
        {method}
      </span>
      <code className="text-blue-400 font-mono">{path}</code>
      <span className="text-zinc-500 hidden md:inline">— {description}</span>
    </div>
  );
}

function CountryCard({ country, outlets }: { country: string; outlets: number }) {
  return (
    <div className="bg-zinc-900 rounded-lg p-4 border border-zinc-800 text-center">
      <div className="text-2xl font-bold">{outlets}</div>
      <div className="text-sm text-zinc-500">{country}</div>
    </div>
  );
}
