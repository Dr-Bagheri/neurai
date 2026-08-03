/**
 * Device tiering for the cosmos.
 *
 * The background is the single largest performance risk in this design, so the
 * budget is decided up front from device signals rather than discovered by
 * dropping frames on a mid-range phone. Every tier must still look finished —
 * `low` is a quieter scene, not a broken one.
 */

import type { FormationOptions } from './formations'

export type TierName = 'off' | 'low' | 'medium' | 'high'

export type CosmosBudget = {
  tier: TierName
  /** Striation lines × points per line. This is the main cost knob. */
  formation: FormationOptions
  /** Stars per depth shell, far → near. */
  starCounts: readonly number[]
  /** Device pixel ratio ceiling. Above ~2 the gain is invisible and the cost quadratic. */
  maxPixelRatio: number
  targetFps: number
  interactive: boolean
}

const BUDGETS: Record<Exclude<TierName, 'off'>, Omit<CosmosBudget, 'tier'>> = {
  high: {
    // Enough lines that the striations read as continuous curves rather than
    // dotted ones — that continuity is the whole look.
    formation: { lines: 280, pointsPerLine: 180 },
    starCounts: [2400, 1200],
    maxPixelRatio: 2,
    targetFps: 60,
    interactive: true,
  },
  medium: {
    formation: { lines: 190, pointsPerLine: 130 },
    starCounts: [1400, 700],
    maxPixelRatio: 1.75,
    targetFps: 60,
    interactive: true,
  },
  low: {
    formation: { lines: 120, pointsPerLine: 90 },
    starCounts: [700, 0],
    maxPixelRatio: 1.25,
    targetFps: 30,
    interactive: false,
  },
}

type NavigatorWithHints = Navigator & {
  deviceMemory?: number
  connection?: { saveData?: boolean; effectiveType?: string }
}

/** True when the browser cannot or should not run the animated cosmos at all. */
export function shouldDisableCosmos(): boolean {
  if (typeof window === 'undefined') return true

  const nav = navigator as NavigatorWithHints
  if (nav.connection?.saveData) return true

  try {
    const canvas = document.createElement('canvas')
    if (!canvas.getContext('webgl2')) return true
  } catch {
    return true
  }

  return false
}

export function detectTier(): TierName {
  if (typeof window === 'undefined') return 'off'
  if (shouldDisableCosmos()) return 'off'

  const nav = navigator as NavigatorWithHints
  const cores = nav.hardwareConcurrency ?? 4
  const memory = nav.deviceMemory ?? 4
  const coarsePointer = window.matchMedia('(pointer: coarse)').matches
  const smallViewport = Math.min(window.innerWidth, window.innerHeight) < 700
  const slowNetwork = /(^|-)2g$/.test(nav.connection?.effectiveType ?? '')

  if (slowNetwork || cores <= 2 || memory <= 2) return 'low'
  // Phones and tablets: capable silicon, but thermally limited and on battery.
  if (coarsePointer || smallViewport) return cores >= 6 && memory >= 4 ? 'medium' : 'low'
  if (cores >= 8 && memory >= 8) return 'high'
  return 'medium'
}

export function budgetFor(tier: TierName): CosmosBudget | null {
  if (tier === 'off') return null
  return { tier, ...BUDGETS[tier] }
}

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
