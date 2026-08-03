'use client'

import { ArrowUp, Loader2, X } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'

import { OPEN_ASSISTANT_EVENT } from '@/components/cosmos/CosmosCanvas'
import { cn } from '@/lib/utils'

type Message = { role: 'user' | 'assistant'; content: string }
type Source = { n: number; title: string; href: string }

/**
 * The Persian assistant, grounded in site content.
 *
 * Reads the raw text stream rather than a framework-specific streaming
 * protocol, which keeps the client independent of the AI SDK's wire format and
 * makes the whole exchange easy to reason about: one POST, one text stream,
 * citations in a response header.
 */
export function ChatWidget({ greeting, suggestions }: { greeting: string; suggestions: string[] }) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sources, setSources] = useState<Source[]>([])

  const scrollRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLTextAreaElement | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, streaming])

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  // The galactic core is the only way in. There is no floating button: the
  // assistant *is* the light at the centre of the galaxy, and putting a chat
  // bubble in the corner as well would undercut that entirely.
  useEffect(() => {
    const onOpen = () => setOpen(true)
    window.addEventListener(OPEN_ASSISTANT_EVENT, onOpen)
    return () => window.removeEventListener(OPEN_ASSISTANT_EVENT, onOpen)
  }, [])

  // Escape closes the panel — expected for any dialog-like surface.
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  // Abort any in-flight request if the widget unmounts mid-stream.
  useEffect(() => () => abortRef.current?.abort(), [])

  async function send(text: string) {
    const question = text.trim()
    if (!question || streaming) return

    setError(null)
    setSources([])
    setInput('')

    const next: Message[] = [...messages, { role: 'user', content: question }]
    setMessages(next)
    setStreaming(true)

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages: next }),
        signal: controller.signal,
      })

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null
        setError(data?.error ?? 'خطایی رخ داد. لطفاً دوباره تلاش کنید.')
        setStreaming(false)
        return
      }

      const header = response.headers.get('x-neurai-sources')
      if (header) {
        try {
          setSources(JSON.parse(new TextDecoder().decode(base64ToBytes(header))) as Source[])
        } catch {
          // Citations are a nicety; never let a malformed header break the answer.
        }
      }

      // Append an empty assistant message, then fill it as tokens arrive.
      setMessages((current) => [...current, { role: 'assistant', content: '' }])

      const reader = response.body?.getReader()
      if (!reader) throw new Error('no stream')
      const decoder = new TextDecoder()

      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })
        setMessages((current) => {
          const copy = [...current]
          const last = copy[copy.length - 1]
          if (last?.role === 'assistant') {
            copy[copy.length - 1] = { role: 'assistant', content: last.content + chunk }
          }
          return copy
        })
      }
    } catch (caught) {
      if ((caught as Error).name !== 'AbortError') {
        setError('ارتباط با دستیار برقرار نشد.')
      }
    } finally {
      setStreaming(false)
      abortRef.current = null
    }
  }

  if (!open) return null

  return (
    <>
      {/* Scrim. Deliberately light: the galaxy is the reason the visitor is
          here, so it should stay visible behind the conversation rather than
          being blacked out. */}
      <div
        className="fixed inset-0 z-40 bg-void-1000/45 backdrop-blur-[2px]"
        onClick={() => setOpen(false)}
        aria-hidden="true"
      />

      <div
        id="chat-panel"
        role="dialog"
        aria-modal="true"
        aria-label="دستیار هوشمند"
        // Centred, because it opens *out of the core* — anchoring it to a
        // corner would break the causal link between what you clicked and what
        // appeared.
        className="fixed start-1/2 top-1/2 z-50 flex h-[min(32rem,calc(100dvh-6rem))] w-[min(30rem,calc(100vw-2.5rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-3xl border border-hairline-strong bg-void-950/92 shadow-[0_0_120px_-20px_rgba(255,180,84,0.35)] backdrop-blur-2xl rtl:translate-x-1/2"
      >
        <header className="flex items-start justify-between gap-4 border-b border-hairline px-6 py-4">
          <div>
            <p className="text-sm text-text-100">دستیار NEURAI</p>
            <p className="mt-0.5 text-xs text-text-400">پاسخ‌ها بر پایهٔ محتوای همین سایت است</p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="بستن"
            className="grid size-8 shrink-0 place-items-center rounded-full border border-hairline text-text-300 transition-colors hover:border-accent/50 hover:text-accent"
          >
            <X className="size-4" />
          </button>
        </header>

          <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
            {messages.length === 0 ? (
              <>
                <Bubble role="assistant">{greeting}</Bubble>
                {suggestions.length > 0 ? (
                  <div className="flex flex-wrap gap-2 pt-2">
                    {suggestions.map((suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        onClick={() => void send(suggestion)}
                        className="rounded-full border border-hairline px-3 py-1.5 text-xs text-text-300 transition-colors hover:border-accent/50 hover:text-accent"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                ) : null}
              </>
            ) : (
              messages.map((message, index) => (
                <Bubble key={index} role={message.role}>
                  {message.content ||
                    (streaming && index === messages.length - 1 ? (
                      <Loader2 className="size-4 animate-spin text-text-400" />
                    ) : null)}
                </Bubble>
              ))
            )}

            {sources.length > 0 && !streaming ? (
              <div className="border-t border-hairline pt-3">
                <p className="text-xs text-text-400">منابع</p>
                <ul className="mt-2 space-y-1">
                  {sources.map((source) => (
                    <li key={source.n}>
                      <Link
                        href={source.href}
                        className="text-xs text-accent hover:underline"
                        onClick={() => setOpen(false)}
                      >
                        [{source.n}] {source.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {error ? (
              <p role="alert" className="rounded-xl border border-hairline bg-glass-1 p-3 text-xs text-text-200">
                {error}
              </p>
            ) : null}
          </div>

          <form
            onSubmit={(event) => {
              event.preventDefault()
              void send(input)
            }}
            className="border-t border-hairline p-3"
          >
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  // Enter sends, Shift+Enter makes a new line.
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault()
                    void send(input)
                  }
                }}
                rows={1}
                placeholder="پرسش خود را بنویسید…"
                aria-label="پیام"
                className="max-h-28 min-h-10 flex-1 resize-none rounded-xl border border-hairline bg-glass-1 px-3 py-2 text-sm text-text-100 placeholder:text-text-400 focus:border-accent/50 focus:outline-none"
              />
              <button
                type="submit"
                disabled={streaming || !input.trim()}
                aria-label="ارسال"
                className="grid size-10 shrink-0 place-items-center rounded-xl border border-hairline bg-glass-2 text-accent transition-colors hover:border-accent/50 disabled:opacity-40"
              >
                {streaming ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <ArrowUp className="size-4" />
                )}
              </button>
          </div>
        </form>
      </div>
    </>
  )
}

function Bubble({ role, children }: { role: Message['role']; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        'max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-fa-normal',
        role === 'user'
          ? 'ms-auto border border-accent/25 bg-accent/10 text-text-100'
          : 'me-auto border border-hairline bg-glass-1 text-text-200',
      )}
    >
      {children}
    </div>
  )
}

/** atob() mangles multi-byte UTF-8; decode to bytes and let TextDecoder do it. */
function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}
