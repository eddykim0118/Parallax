import { NextResponse } from 'next/server';
import { db } from '@/lib/db/client';
import { sql } from 'drizzle-orm';

/**
 * GET /api/health
 *
 * Health check endpoint for monitoring.
 * Returns database connectivity status and basic stats.
 */
export async function GET() {
  const checks = {
    status: 'healthy' as 'healthy' | 'unhealthy',
    timestamp: new Date().toISOString(),
    database: false,
    version: process.env.npm_package_version || '0.1.0',
  };

  try {
    // Check database connectivity
    await db.execute(sql`SELECT 1`);
    checks.database = true;
  } catch (error) {
    checks.status = 'unhealthy';
    checks.database = false;
  }

  const statusCode = checks.status === 'healthy' ? 200 : 503;

  return NextResponse.json(checks, { status: statusCode });
}
