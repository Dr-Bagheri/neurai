import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

/**
 * Girih glass: a translucent surface over the cosmos, lifted by inset
 * hairlines rather than a drop shadow. Shadows read as "card lying on paper";
 * inset light reads as "surface floating in space", which is the whole premise
 * of this design.
 *
 * The corner carries a girih rosette etched at very low opacity — visible when
 * you look for it, invisible when you don't.
 */
export function GlassCard({
  children,
  className,
  etch = true,
  interactive = false,
}: {
  children: ReactNode
  className?: string
  etch?: boolean
  interactive?: boolean
}) {
  return (
    <div
      className={cn(
        'glass-panel relative overflow-hidden rounded-2xl p-7',
        interactive &&
          'transition-all duration-500 ease-[var(--ease-cinematic)] hover:border-hairline-strong hover:bg-glass-2',
        className,
      )}
    >
      {etch ? <GirihEtch /> : null}
      <div className="relative">{children}</div>
    </div>
  )
}

function GirihEtch() {
  const points = 10
  const outer = 40
  const inner = outer * 0.42
  const star = Array.from({ length: points * 2 }, (_, index) => {
    const angle = (index / (points * 2)) * Math.PI * 2 - Math.PI / 2
    const radius = index % 2 === 0 ? outer : inner
    return `${(Math.cos(angle) * radius).toFixed(2)},${(Math.sin(angle) * radius).toFixed(2)}`
  }).join(' ')

  return (
    <svg
      viewBox="-50 -50 100 100"
      aria-hidden="true"
      // `start-` keeps the etch in the corner the reader's eye reaches last,
      // which in RTL is the left. Physical `left-` would break in LTR contexts.
      className="pointer-events-none absolute -top-8 -start-8 size-32 text-text-100 opacity-[0.045]"
    >
      <polygon points={star} fill="none" stroke="currentColor" strokeWidth="1" />
      <polygon
        points={star}
        fill="none"
        stroke="currentColor"
        strokeWidth="0.5"
        transform="rotate(18) scale(0.62)"
      />
    </svg>
  )
}
