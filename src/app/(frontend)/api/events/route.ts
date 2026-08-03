import { randomUUID } from 'node:crypto'

import { cookies, headers as nextHeaders } from 'next/headers'
import { NextResponse } from 'next/server'
import { z } from 'zod'

import { pool } from '@/lib/db'
import { getPayloadClient } from '@/lib/payload'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ANON_COOKIE = 'neurai_anon'

const bodySchema = z.object({
  type: z.enum(['post_read', 'chat_topic', 'cta_click']),
  postId: z.string().max(64).optional(),
  slug: z.string().max(256).optional(),
  dwellMs: z.number().int().min(0).max(86_400_000).optional(),
  scrollDepth: z.number().min(0).max(1).optional(),
})

/**
 * Behavioural signal intake.
 *
 * Consent is enforced here, on the server, rather than being left to the
 * client to honour. A signed-in member who has not opted in is silently
 * ignored — the request still returns 204 so the client has nothing to retry
 * and no way to probe consent state.
 */
export async function POST(request: Request) {
  // Respect Do Not Track at the edge of the system too, not only in the beacon.
  if (request.headers.get('dnt') === '1') {
    return new NextResponse(null, { status: 204 })
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return new NextResponse(null, { status: 204 })

  const payload = await getPayloadClient()

  let memberId: string | null = null
  let consented = false

  try {
    const { user } = await payload.auth({ headers: await nextHeaders() })
    if (user?.collection === 'members') {
      memberId = String(user.id)
      consented = Boolean((user as { consentPersonalization?: boolean }).consentPersonalization)
    }
  } catch {
    // Anonymous.
  }

  if (memberId && !consented) {
    return new NextResponse(null, { status: 204 })
  }

  // Anonymous visitors get a first-party id so reading history can follow them
  // within a session and be linked to an account if they later sign up.
  const cookieStore = await cookies()
  let anonId = memberId ? null : (cookieStore.get(ANON_COOKIE)?.value ?? null)
  let setCookie = false

  if (!memberId && !anonId) {
    anonId = randomUUID()
    setCookie = true
  }

  const { type, postId, slug, dwellMs, scrollDepth } = parsed.data

  try {
    await pool.query(
      `INSERT INTO member_events (member_id, anon_id, type, path, meta)
       VALUES ($1, $2, $3, $4, $5::jsonb)`,
      [
        memberId,
        anonId,
        type,
        slug ? `/blog/${slug}` : null,
        JSON.stringify({ postId, dwellMs, scrollDepth }),
      ],
    )
  } catch {
    // Analytics must never surface as an error to the visitor.
    return new NextResponse(null, { status: 204 })
  }

  const response = new NextResponse(null, { status: 204 })

  if (setCookie && anonId) {
    response.cookies.set(ANON_COOKIE, anonId, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 60 * 60 * 24 * 180,
      path: '/',
    })
  }

  return response
}
