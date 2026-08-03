/**
 * Device tiering for the cosmos.
 *
 * The background is the single largest performance risk in this design, so the
 * budget is decided up front from device signals rather than discovered by
 * dropping frames on a mid-range phone. Every tier must still look finished —
 * `low` is a quieter universe, not a broken one.
 */

export type TierName = 'off' | 'low' | 'medium' | 'high'

export type CosmosBudget = {
  tier: TierName
  /** Points in the girih ring. */
  girihCells: { cellsU: number; cellsV: number; pointsPerSegment: number }
  /** Stars per depth shell, far → near. */
  starCounts: readonly number[]
  /** Device pixel ratio ceiling. Above ~2 the gain is invisible and the cost quadratic. */
  maxPixelRatio: number
  /** Additive glow pass. First thing to go — it is the most expensive effect. */
  bloom: boolean
  /** Frames per second to target. */
  targetFps: number
  /** Whether pointer interaction (gravity well, ripples) is enabled. */
  interactive: boolean
}

const BUDGETS: Record<Exclude<TierName, 'off'>, Omit<CosmosBudget, 'tier'>> = {
  high: {
    // Dense enough that the strapwork reads as continuous luminous line rather
    // than a dotted outline — that continuity is what makes the ring glow.
    girihCells: { cellsU: 28, cellsV: 6, pointsPerSegment: 11 },
    starCounts: [2600, 1400, 700],
    maxPixelRatio: 2,
    bloom: true,
    targetFps: 60,
    interactive: true,
  },
  medium: {
    girihCells: { cellsU: 22, cellsV: 5, pointsPerSegment: 7 },
    starCounts: [1500, 800, 380],
    maxPixelRatio: 1.75,
    bloom: true,
    targetFps: 60,
    interactive: true,
  },
  low: {
    girihCells: { cellsU: 16, cellsV: 4, pointsPerSegment: 5 },
    starCounts: [700, 380, 0],
    maxPixelRatio: 1.25,
    bloom: false,
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

  // No WebGL2 → we serve the static fallback instead of limping along on a
  // WebGL1 path we would then have to maintain forever.
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
  // Phones and tablets: capable silicon, but thermally limited and running on
  // a battery. Medium is the honest ceiling.
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
