import { NextResponse } from 'next/server'

import { embeddingsAvailable } from '@/lib/ai/embeddings'
import { llmAvailable } from '@/lib/ai/provider'
import { pool } from '@/lib/db'

export const dynamic = 'force-dynamic'

/**
 * Health probe for the container and for ops.
 *
 * The database is the only hard dependency: without it the site cannot render.
 * The AI services are reported but never gate the status — the site is designed
 * to run perfectly well with the `ai` compose profile switched off, and a
 * health check that fails when the GPU box is down would take the whole site
 * out of the load balancer for no reason.
 */
export async function GET() {
  const checks: Record<string, 'ok' | 'down'> = {}

  try {
    await pool.query('SELECT 1')
    checks.database = 'ok'
  } catch {
    checks.database = 'down'
  }

  const [llm, embeddings] = await Promise.all([llmAvailable(), embeddingsAvailable()])
  checks.llm = llm ? 'ok' : 'down'
  checks.embeddings = embeddings ? 'ok' : 'down'

  const healthy = checks.database === 'ok'

  return NextResponse.json(
    { status: healthy ? 'ok' : 'degraded', checks },
    { status: healthy ? 200 : 503 },
  )
}
