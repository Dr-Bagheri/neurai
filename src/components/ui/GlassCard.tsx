import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

/**
 * A translucent surface over the galaxy, lifted by inset hairlines rather than
 * a drop shadow. Shadows read as "card lying on paper"; inset light reads as
 * "surface floating in space", which is the whole premise of this design.
 *
 * `glow` adds a faint warm rim, as though the card is catching light from the
 * core. Used sparingly — on everything it stops meaning anything.
 */
export function GlassCard({
  children,
  className,
  interactive = false,
  glow = false,
}: {
  children: ReactNode
  className?: string
  interactive?: boolean
  glow?: boolean
}) {
  return (
    <div
      className={cn(
        'glass-panel relative overflow-hidden rounded-2xl p-7',
        interactive &&
          'transition-all duration-500 ease-[var(--ease-cinematic)] hover:border-hairline-strong hover:bg-glass-2',
        glow && 'shadow-[0_0_60px_-30px_var(--color-gold-400)]',
        className,
      )}
    >
      {children}
    </div>
  )
}
