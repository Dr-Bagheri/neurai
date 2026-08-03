import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

/**
 * The small glass badge that sits above the hero headline, and the same object
 * reused as a section eyebrow. Structure-tier colours only — it must never
 * compete with the cosmos behind it for the 10% signal budget.
 */
export function Pill({
  children,
  icon,
  className,
}: {
  children: ReactNode
  icon?: ReactNode
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 rounded-full border border-hairline bg-glass-2 px-4 py-1.5 text-xs text-text-200 backdrop-blur-md',
        className,
      )}
    >
      {icon ? (
        <span aria-hidden="true" className="text-accent [&>svg]:size-3.5">
          {icon}
        </span>
      ) : null}
      {children}
    </span>
  )
}
