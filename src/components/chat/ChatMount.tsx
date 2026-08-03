import { getPayloadClient } from '@/lib/payload'

import { ChatWidget } from './ChatWidget'

const DEFAULT_GREETING =
  'سلام! من دستیار NEURAI هستم. دربارهٔ خدمات، معماری فنی یا نوشته‌های ما بپرسید.'

const DEFAULT_SUGGESTIONS = [
  'چه خدماتی ارائه می‌دهید؟',
  'مدل‌ها روی زیرساخت خودمان اجرا می‌شوند؟',
  'هزینهٔ راه‌اندازی چقدر است؟',
]

/**
 * Server wrapper that pulls the assistant's editable settings out of Payload.
 *
 * Wrapped in try/catch on purpose: this renders inside the root layout, so an
 * unhandled database error here would take down every page on the site. A
 * missing database should cost you the chat widget, not the whole site.
 */
type AssistantSettings = {
  enabled: boolean
  greeting: string
  suggestions: string[]
}

async function loadSettings(): Promise<AssistantSettings> {
  try {
    const payload = await getPayloadClient()
    const settings = await payload.findGlobal({ slug: 'ai-assistant' })

    const suggestions = ((settings?.suggestions ?? []) as Array<{ question?: string }>)
      .map((item) => item.question)
      .filter((question): question is string => Boolean(question))

    return {
      enabled: settings?.enabled !== false,
      greeting: settings?.greeting ?? DEFAULT_GREETING,
      suggestions: suggestions.length > 0 ? suggestions : DEFAULT_SUGGESTIONS,
    }
  } catch {
    // Fall back to defaults rather than propagating — see the note above.
    return { enabled: true, greeting: DEFAULT_GREETING, suggestions: DEFAULT_SUGGESTIONS }
  }
}

export async function ChatMount() {
  // The fetch is wrapped, not the JSX: constructing elements inside a try/catch
  // swallows render-time errors that belong to an error boundary instead.
  const settings = await loadSettings()
  if (!settings.enabled) return null

  return <ChatWidget greeting={settings.greeting} suggestions={settings.suggestions} />
}
