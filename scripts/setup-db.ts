/**
 * Applies the non-Payload schema to an existing database.
 *
 * The SQL in docker/initdb runs automatically only on a *fresh* Postgres data
 * volume. This script applies the same files to a database that already exists,
 * which is the normal case when deploying an update or pointing at managed
 * Postgres rather than the bundled container.
 *
 *   pnpm db:setup
 */

import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { Pool } from 'pg'

const FILES = ['01-extensions.sql', '02-app-tables.sql']

const connectionString = process.env.DATABASE_URI
if (!connectionString) {
  console.error('DATABASE_URI is not set. Copy .env.example to .env first.')
  process.exit(1)
}

const pool = new Pool({ connectionString })

try {
  for (const file of FILES) {
    const sql = await readFile(path.resolve(process.cwd(), 'docker/initdb', file), 'utf8')
    process.stdout.write(`applying ${file} … `)
    await pool.query(sql)
    console.log('ok')
  }

  const { rows } = await pool.query<{ extname: string }>(
    "SELECT extname FROM pg_extension WHERE extname IN ('vector','pg_trgm','unaccent') ORDER BY extname",
  )
  console.log(`extensions: ${rows.map((r) => r.extname).join(', ') || 'none'}`)

  const { rows: tables } = await pool.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('content_chunks','member_memories','member_events','rate_limits')
      ORDER BY table_name`,
  )
  console.log(`tables: ${tables.map((t) => t.table_name).join(', ') || 'none'}`)
  console.log('\nDatabase ready.')
} catch (error) {
  console.error('\nSetup failed:', error instanceof Error ? error.message : error)
  process.exitCode = 1
} finally {
  await pool.end()
}
