import { pool } from '@/lib/db'

/**
 * Fixed-window rate limiter backed by Postgres.
 *
 * Postgres rather than Redis: the whole product is meant to come up with one
 * `docker compose up`, and adding a cache service purely for counters is a
 * service to run, monitor, and back up for no real gain at this traffic level.
 * The single UPSERT is atomic, so concurrent requests can't race past the cap.
 *
 * Fixed windows allow up to 2× the limit across a boundary. That is acceptable
 * here — this protects an expensive GPU endpoint from runaway use, it is not a
 * billing meter.
 */

export type RateLimitResult = {
  allowed: boolean
  remaining: number
  resetAt: Date
}

export async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds = 3600,
): Promise<RateLimitResult> {
  const { rows } = await pool.query<{ count: number; window_start: Date }>(
    `INSERT INTO rate_limits (key, window_start, count)
     VALUES ($1, date_trunc('hour', now()), 1)
     ON CONFLICT (key, window_start)
     DO UPDATE SET count = rate_limits.count + 1
     RETURNING count, window_start`,
    [key],
  )

  const row = rows[0]
  const count = row?.count ?? 1
  const windowStart = row?.window_start ?? new Date()
  const resetAt = new Date(windowStart.getTime() + windowSeconds * 1000)

  return {
    allowed: count <= limit,
    remaining: Math.max(0, limit - count),
    resetAt,
  }
}

/**
 * Identify the caller.
 *
 * Members are limited per account so a shared office IP doesn't punish
 * everyone behind it. Anonymous callers fall back to IP.
 */
export function rateLimitKey(memberId: string | null, request: Request): string {
  if (memberId) return `member:${memberId}`

  const forwarded = request.headers.get('x-forwarded-for')
  const ip = forwarded?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown'
  return `ip:${ip}`
}
