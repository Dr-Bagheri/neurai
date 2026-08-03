import type { ReactNode } from 'react'

import { Pill } from '@/components/ui/Pill'
import { cn } from '@/lib/utils'

/**
 * The standard section: an asymmetric split, never a centred column.
 *
 * The heading sits on one side and the body copy and actions on the other, with
 * a wide gap between them and neither block centred in the viewport. That
 * asymmetry is the point — a centred stack reads as a document, while an
 * off-balance split reads as elements floating in the same space as the
 * particles behind them.
 *
 * In RTL the heading takes the right — the side the reader starts from — which
 * mirrors the reference's left-heading layout rather than copying its physical
 * position.
 */
export function Section({
  eyebrow,
  title,
  titleTail,
  lead,
  actions,
  children,
  className,
  id,
  align = 'top',
}: {
  eyebrow?: string
  title: string
  /** Trailing clause, rendered dimmed. In Persian this is usually the verb. */
  titleTail?: string
  lead?: string
  actions?: ReactNode
  children?: ReactNode
  className?: string
  id?: string
  /** Where the content block sits vertically, leaving room for the formation. */
  align?: 'top' | 'center'
}) {
  return (
    // `min-h-dvh` gives each section enough scroll distance for its reveal to
    // play out and the background to complete a morph. Packed tighter, sections
    // would arrive and leave at the same time.
    <section
      id={id}
      className={cn(
        'relative flex min-h-dvh px-6 py-32 sm:px-10',
        align === 'center' ? 'items-center' : 'items-start pt-40',
        className,
      )}
    >
      <div className="reveal mx-auto w-full max-w-7xl">
        <div className="reveal-out grid gap-x-16 gap-y-10 lg:grid-cols-2">
          <header>
            {eyebrow ? <Pill className="mb-7">{eyebrow}</Pill> : null}
            <h2 className="font-display text-4xl leading-fa-tight font-light text-text-100 sm:text-5xl lg:text-6xl">
              {title} {titleTail ? <span className="heading-tail">{titleTail}</span> : null}
            </h2>
          </header>

          {/* Offset down from the heading so the two columns don't align into a
              tidy row — the misalignment is what makes it read as unstructured. */}
          <div className="lg:pt-20">
            {lead ? (
              <p className="max-w-md text-base leading-fa-normal text-text-300 sm:text-lg">
                {lead}
              </p>
            ) : null}
            {actions ? <div className="mt-8 flex flex-wrap gap-4">{actions}</div> : null}
          </div>

          {children ? <div className="lg:col-span-2">{children}</div> : null}
        </div>
      </div>
    </section>
  )
}
