'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

import type { CosmosEngine, SceneName } from './engine'
import { budgetFor, detectTier, prefersReducedMotion } from './tier'

/**
 * Mounts the cosmos exactly once, in the root layout, outside the page slot.
 *
 * This placement is the whole trick: because the component never unmounts,
 * navigation does not rebuild the WebGL context. Routes only retarget the
 * camera, so moving through the site is a continuous shot rather than a
 * sequence of separate scenes. Tearing this down and remounting per route
 * would cost ~200ms of context creation and a visible black flash every time.
 */

function sceneForPath(pathname: string): SceneName {
  if (pathname === '/') return 'home'
  // Long-form reading needs the background to recede furthest.
  if (/^\/(blog|insights)\/[^/]+$/.test(pathname)) return 'reading'
  return 'inner'
}

/** Broadcast when the visitor clicks the galactic core. ChatWidget listens. */
export const OPEN_ASSISTANT_EVENT = 'neurai:open-assistant'

export function CosmosCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const engineRef = useRef<CosmosEngine | null>(null)
  const overCore = useRef(false)
  const pathname = usePathname()
  const [enabled, setEnabled] = useState(true)
  const [coreHover, setCoreHover] = useState(false)

  // ── Boot ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const tier = detectTier()
    const budget = budgetFor(tier)

    if (!budget || !canvasRef.current) {
      setEnabled(false)
      return
    }

    let engine: CosmosEngine | null = null
    let disposed = false

    // Dynamically imported so Three.js never lands in the initial bundle and
    // can't delay the headline paint.
    void import('./engine').then(({ CosmosEngine: Engine }) => {
      if (disposed || !canvasRef.current) return

      engine = new Engine(canvasRef.current, budget, prefersReducedMotion())
      engineRef.current = engine
      engine.setScene(sceneForPath(window.location.pathname))
      engine.start()
    })

    return () => {
      disposed = true
      engine?.dispose()
      engineRef.current = null
    }
  }, [])

  // ── Route → camera ──────────────────────────────────────────────────────
  useEffect(() => {
    engineRef.current?.setScene(sceneForPath(pathname))
  }, [pathname])

  // ── Scroll, pointer, resize, visibility ─────────────────────────────────
  useEffect(() => {
    if (!enabled) return

    const root = document.documentElement
    let frame = 0
    let pendingScroll = false

    const readScroll = () => {
      pendingScroll = false
      const max = document.body.scrollHeight - window.innerHeight
      const progress = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0

      // One shared value: the CSS blooms behind the content and the WebGL
      // scene read the same number, so they can never drift apart.
      root.style.setProperty('--journey', progress.toFixed(4))
      engineRef.current?.setJourney(progress)
    }

    const onScroll = () => {
      if (pendingScroll) return
      pendingScroll = true
      frame = requestAnimationFrame(readScroll)
    }

    const onPointerMove = (event: PointerEvent) => {
      const x = (event.clientX / window.innerWidth) * 2 - 1
      const y = -((event.clientY / window.innerHeight) * 2 - 1)

      root.style.setProperty('--pointer-x', (event.clientX / window.innerWidth).toFixed(4))
      root.style.setProperty('--pointer-y', (event.clientY / window.innerHeight).toFixed(4))
      engineRef.current?.setPointer(x, y, true)

      // The core has no button and no visible affordance — brightening is the
      // only signal that it is interactive, so the cursor has to carry the rest.
      const onCore = engineRef.current?.isPointerOnCore() ?? false
      if (onCore !== overCore.current) {
        overCore.current = onCore
        root.dataset.coreHover = onCore ? 'true' : 'false'
        setCoreHover(onCore)
      }
    }

    const onPointerLeave = () => {
      engineRef.current?.setPointer(0, 0, false)
      overCore.current = false
      root.dataset.coreHover = 'false'
      setCoreHover(false)
    }

    const onPointerDown = (event: PointerEvent) => {
      // Clicking a control should do what the control does, not disturb the
      // scene behind it.
      const target = event.target as HTMLElement | null
      if (target?.closest('a, button, input, textarea, select, [role="button"], [role="dialog"]')) {
        return
      }

      const x = (event.clientX / window.innerWidth) * 2 - 1
      const y = -((event.clientY / window.innerHeight) * 2 - 1)

      if (engineRef.current?.isPointerOnCore()) {
        // The core is the assistant. Opening is broadcast as an event rather
        // than lifted into shared state, because the canvas and the chat panel
        // are siblings under a server-rendered layout with no common client
        // provider between them.
        window.dispatchEvent(new CustomEvent(OPEN_ASSISTANT_EVENT))
        return
      }

      engineRef.current?.pulse(x, y)
    }

    const onResize = () => engineRef.current?.resize()

    // Pause entirely in a background tab. There is no reason to burn a
    // visitor's battery animating a canvas nobody is looking at.
    const onVisibility = () => engineRef.current?.setVisible(!document.hidden)

    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('pointermove', onPointerMove, { passive: true })
    window.addEventListener('pointerdown', onPointerDown, { passive: true })
    window.addEventListener('pointerleave', onPointerLeave, { passive: true })
    window.addEventListener('resize', onResize)
    document.addEventListener('visibilitychange', onVisibility)

    readScroll()

    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('pointerleave', onPointerLeave)
      window.removeEventListener('resize', onResize)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [enabled])

  return (
    <>
      <div
        className={
          'fixed inset-0 -z-10 overflow-hidden ' +
          (coreHover ? 'cursor-pointer' : 'pointer-events-none')
        }
        aria-hidden="true"
        data-cosmos={enabled ? 'live' : 'static'}
      >
        {/* Static base. Always painted, so the page has depth from the very
            first frame and stays finished-looking if WebGL never starts. */}
        <div className="cosmos-fallback absolute inset-0" />
        {enabled ? <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" /> : null}
      </div>

      {/*
        The core is a light source with no button, which is beautiful and
        completely invisible to a screen reader or a keyboard. This gives the
        same action a real, focusable control — visually hidden until focused,
        then rendered as a normal button. The pointer affordance and this are
        two routes to one behaviour, not a fallback.
      */}
      <button
        type="button"
        onClick={() => window.dispatchEvent(new CustomEvent(OPEN_ASSISTANT_EVENT))}
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:end-4 focus:z-50 focus:rounded-full focus:border focus:border-accent/50 focus:bg-void-950 focus:px-5 focus:py-2 focus:text-sm focus:text-accent"
      >
        گفت‌وگو با دستیار هوشمند
      </button>
    </>
  )
}
