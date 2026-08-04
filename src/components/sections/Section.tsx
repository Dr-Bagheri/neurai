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
      {/*
        Layer order matters and is load-bearing.

        `parallax` must sit OUTSIDE the scroll-driven animation wrappers. When
        it is nested inside them the `translate` property silently resolves to
        0 — verified by probing the live page: an identical element cloned out
        of the animated subtree parallaxes correctly, the original never moves.

        So each column gets its own parallax wrapper (giving per-block depth, so
        the heading and body separate as the cursor moves rather than sliding as
        one plate), and the arrival/departure animations live inside it:

          parallax → drift → reveal → reveal-out → content
      */}
      <div className="mx-auto grid w-full max-w-7xl gap-x-16 gap-y-10 lg:grid-cols-2">
        <div className="parallax" data-depth="1.5">
          <div className="drift">
            <div className="reveal">
              <header className="reveal-out">
                {eyebrow ? <Pill className="mb-7">{eyebrow}</Pill> : null}
                <h2 className="font-display text-4xl leading-fa-tight font-light text-text-100 sm:text-5xl lg:text-6xl">
                  {title} {titleTail ? <span className="heading-tail">{titleTail}</span> : null}
                </h2>
              </header>
            </div>
          </div>
        </div>

        {/* Offset down from the heading so the two columns never align into a
            tidy row — the misalignment is what reads as unstructured. */}
        <div className="parallax lg:pt-20" data-depth="0.7">
          <div className="drift">
            <div className="reveal">
              <div className="reveal-out">
                {lead ? (
                  <p className="max-w-md text-base leading-fa-normal text-text-300 sm:text-lg">
                    {lead}
                  </p>
                ) : null}
                {actions ? <div className="mt-8 flex flex-wrap gap-4">{actions}</div> : null}
              </div>
            </div>
          </div>
        </div>

        {children ? (
          <div className="lg:col-span-2">
            <div className="reveal">
              <div className="reveal-out">{children}</div>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  )
}
