import type { ReactNode } from 'react'

import { Pill } from '@/components/ui/Pill'
import { cn } from '@/lib/utils'

/**
 * Standard section shell: eyebrow pill, two-tone heading, optional lead, then
 * content. The `bloom-layer` child continues the ember → firouzeh journey
 * behind the content, driven by the same `--journey` variable the WebGL scene
 * reads — so the CSS and the canvas can never drift out of step.
 */
export function Section({
  eyebrow,
  title,
  titleTail,
  lead,
  children,
  className,
  id,
}: {
  eyebrow?: string
  title: string
  /** Trailing clause, rendered dimmed. In Persian this is usually the verb. */
  titleTail?: string
  lead?: string
  children?: ReactNode
  className?: string
  id?: string
}) {
  return (
    <section id={id} className={cn('relative px-6 py-28', className)}>
      <div className="bloom-layer" />
      <div className="mx-auto max-w-7xl">
        <header className="max-w-3xl">
          {eyebrow ? <Pill className="mb-6">{eyebrow}</Pill> : null}
          <h2 className="font-display text-3xl leading-fa-tight font-light text-text-100 sm:text-5xl">
            {title} {titleTail ? <span className="heading-tail">{titleTail}</span> : null}
          </h2>
          {lead ? (
            <p className="mt-6 text-base leading-fa-normal text-text-300 sm:text-lg">{lead}</p>
          ) : null}
        </header>

        {children ? <div className="mt-14">{children}</div> : null}
      </div>
    </section>
  )
}
