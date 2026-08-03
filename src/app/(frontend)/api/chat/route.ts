import { streamText } from 'ai'
import { headers as nextHeaders } from 'next/headers'
import { NextResponse } from 'next/server'
import { z } from 'zod'

import { embeddingsAvailable } from '@/lib/ai/embeddings'
import { generationSettings, languageModel, llmAvailable } from '@/lib/ai/provider'
import { formatContext, retrieve } from '@/lib/ai/retrieval'
import { getPayloadClient } from '@/lib/payload'
import { checkRateLimit, rateLimitKey } from '@/lib/rate-limit'

// Streaming + pg + Payload's local API all need Node, not Edge.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const bodySchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().min(1).max(4000),
      }),
    )
    .min(1)
    // Cap history so a long conversation can't grow the prompt without bound
    // and blow past the model's context window.
    .max(24),
})

const UNAVAILABLE =
  'دستیار در حال حاضر در دسترس نیست. لطفاً کمی بعد دوباره تلاش کنید یا از صفحهٔ تماس با ما در ارتباط باشید.'

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'درخواست نامعتبر است.' }, { status: 400 })
  }

  const payload = await getPayloadClient()

  // ── Who is asking ────────────────────────────────────────────────────────
  let memberId: string | null = null
  try {
    const { user } = await payload.auth({ headers: await nextHeaders() })
    if (user?.collection === 'members') memberId = String(user.id)
  } catch {
    // Not signed in. Anonymous visitors may still chat, at a lower quota.
  }

  // ── Rate limit ───────────────────────────────────────────────────────────
  const limit = Number(
    memberId
      ? (process.env.CHAT_RATE_LIMIT_PER_HOUR_MEMBER ?? 60)
      : (process.env.CHAT_RATE_LIMIT_PER_HOUR_ANON ?? 10),
  )

  const rate = await checkRateLimit(rateLimitKey(memberId, request), limit)
  if (!rate.allowed) {
    return NextResponse.json(
      {
        error: memberId
          ? 'به سقف گفت‌وگوی این ساعت رسیده‌اید. کمی بعد دوباره تلاش کنید.'
          : 'به سقف گفت‌وگوی مهمان رسیده‌اید. برای ادامه وارد شوید یا ثبت‌نام کنید.',
      },
      {
        status: 429,
        headers: {
          'retry-after': String(Math.max(1, Math.ceil((rate.resetAt.getTime() - Date.now()) / 1000))),
        },
      },
    )
  }

  // ── Availability ─────────────────────────────────────────────────────────
  // The site is designed to run with the `ai` compose profile switched off, so
  // this is an expected state, not an error.
  const [llmUp, embeddingsUp] = await Promise.all([llmAvailable(), embeddingsAvailable()])
  if (!llmUp) {
    return NextResponse.json({ error: UNAVAILABLE }, { status: 503 })
  }

  const settings = await payload
    .findGlobal({ slug: 'ai-assistant' })
    .catch(() => null)

  if (settings && settings.enabled === false) {
    return NextResponse.json({ error: UNAVAILABLE }, { status: 503 })
  }

  const messages = parsed.data.messages
  const question = messages.filter((m) => m.role === 'user').at(-1)?.content ?? ''

  // ── Retrieve ─────────────────────────────────────────────────────────────
  // Without embeddings we still answer, but strictly from persona — never from
  // invented company facts. The grounding rule below covers that case.
  const chunks = embeddingsUp
    ? await retrieve(question, Number(settings?.topK ?? 6)).catch(() => [])
    : []

  const context = formatContext(chunks)

  const system = [
    settings?.persona ??
      'تو دستیار رسمی شرکت کیهان هستی؛ دقیق، مختصر و بی‌اغراق.',
    '',
    settings?.groundingRule ??
      'فقط بر پایهٔ «منابع» زیر پاسخ بده. اگر پاسخ در منابع نبود، صریح بگو که نمی‌دانی.',
    '',
    'قواعد پاسخ‌دهی:',
    '- همیشه فارسی پاسخ بده، مگر آنکه کاربر به زبان دیگری بپرسد.',
    '- هنگام استفاده از یک منبع، شمارهٔ آن را به شکل [۱] در متن بیاور.',
    '- اگر منابع خالی است یا ربطی به پرسش ندارد، همین را صادقانه بگو.',
    '- چیزی دربارهٔ قیمت، قرارداد یا تعهد زمانی وعده نده؛ کاربر را به تماس با تیم ارجاع بده.',
    '',
    context ? `منابع:\n${context}` : 'منابع: (هیچ منبع مرتبطی یافت نشد)',
  ].join('\n')

  const result = streamText({
    model: languageModel,
    system,
    messages,
    temperature: Number(settings?.temperature ?? generationSettings.temperature),
    maxOutputTokens: generationSettings.maxOutputTokens,
  })

  const response = result.toTextStreamResponse()

  // Citations travel in a header so the client can render source links as soon
  // as the stream opens, rather than waiting for the body to finish. Base64
  // because HTTP headers are not safe for raw Persian UTF-8.
  const sources = chunks.map((chunk, index) => ({
    n: index + 1,
    title: chunk.sourceTitle,
    href: `/blog/${chunk.sourceSlug}`,
  }))

  response.headers.set(
    'x-kayhan-sources',
    Buffer.from(JSON.stringify(sources), 'utf8').toString('base64'),
  )
  response.headers.set('x-kayhan-remaining', String(rate.remaining))

  return response
}
