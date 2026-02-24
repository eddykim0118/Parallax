import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

// Connection string from environment
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is not set');
}

// Create postgres client
// For queries: max 10 connections
const queryClient = postgres(connectionString, { max: 10 });

// Create Drizzle client with schema
export const db = drizzle(queryClient, { schema });

// Export schema for use in queries
export { schema };

// Type helper for transactions
export type Database = typeof db;
