import { Pool } from 'pg'

/**
 * A small connection pool for the tables Payload doesn't own: vector chunks,
 * member memories, behavioural events, and rate limits.
 *
 * These live outside Payload deliberately. Payload's schema is generated from
 * collection configs, and pgvector columns, HNSW indexes, and high-write event
 * tables don't belong in a CMS content model — they'd clutter the admin UI and
 * fight the migration generator.
 *
 * In development, Next's hot reload re-evaluates modules on every edit. Without
 * stashing the pool on globalThis we'd leak a pool per reload and exhaust
 * Postgres connections within a few minutes of editing.
 */

declare global {
  var __kayhanPool: Pool | undefined
}

function createPool() {
  const connectionString = process.env.DATABASE_URI
  if (!connectionString) {
    throw new Error('DATABASE_URI is not set — copy .env.example to .env and fill it in.')
  }

  return new Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  })
}

export const pool: Pool = globalThis.__kayhanPool ?? createPool()

if (process.env.NODE_ENV !== 'production') {
  globalThis.__kayhanPool = pool
}

/** pgvector's text input format: `[0.1,0.2,...]`. */
export function toVectorLiteral(values: number[]): string {
  return `[${values.join(',')}]`
}
