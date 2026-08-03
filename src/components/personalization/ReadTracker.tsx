'use client'

import { useEffect, useRef } from 'react'

/**
 * Records that a visitor genuinely read an article.
 *
 * "Genuinely" is the point: a page view proves nothing about interest, and
 * training the recommendation vector on bounces makes it worse than useless.
 * A read is only recorded once BOTH thresholds are met — the reader stayed
 * past `MIN_DWELL_MS` and scrolled past `MIN_SCROLL`.
 *
 * The event is fired at most once per mount, and the server drops it entirely
 * if the member hasn't consented to personalization.
 */

const MIN_DWELL_MS = 20_000
const MIN_SCROLL = 0.55

export function ReadTracker({ postId, slug }: { postId: string; slug: string }) {
  const sent = useRef(false)

  useEffect(() => {
    // Honour Do Not Track. Cheap to respect and the right default.
    if (navigator.doNotTrack === '1') return

    const start = Date.now()
    let maxScroll = 0

    const onScroll = () => {
      const scrollable = document.body.scrollHeight - window.innerHeight
      if (scrollable <= 0) {
        maxScroll = 1
        return
      }
      maxScroll = Math.max(maxScroll, window.scrollY / scrollable)
    }

    const maybeSend = () => {
      if (sent.current) return
      if (Date.now() - start < MIN_DWELL_MS) return
      if (maxScroll < MIN_SCROLL) return

      sent.current = true
      const payload = JSON.stringify({
        type: 'post_read',
        postId,
        slug,
        dwellMs: Date.now() - start,
        scrollDepth: Number(maxScroll.toFixed(2)),
      })

      // sendBeacon survives the page being closed, which is exactly when a
      // finished read is most likely to be reported.
      if (navigator.sendBeacon) {
        navigator.sendBeacon('/api/events', new Blob([payload], { type: 'application/json' }))
      } else {
        void fetch('/api/events', { method: 'POST', body: payload, keepalive: true })
      }
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    const timer = window.setInterval(maybeSend, 5000)
    document.addEventListener('visibilitychange', maybeSend)
    window.addEventListener('pagehide', maybeSend)

    onScroll()

    return () => {
      maybeSend()
      window.removeEventListener('scroll', onScroll)
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', maybeSend)
      window.removeEventListener('pagehide', maybeSend)
    }
  }, [postId, slug])

  return null
}
