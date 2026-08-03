import { cn } from '@/lib/utils'
import { faNumber } from '@/lib/utils'

/**
 * A glass stat card that floats *over* the particle formation.
 *
 * In the reference these are not laid out in a row — they sit at different
 * offsets and depths, overlapping the 3D object, some partly off the edge of
 * the viewport. The overlap is the whole effect: it puts the card and the
 * particles in the same space rather than stacking a UI layer on a backdrop.
 *
 * `depth` scales both the size and the translucency, so a card reads as nearer
 * or further rather than merely bigger.
 */
export function FloatingStat({
  label,
  value,
  suffix,
  body,
  className,
  depth = 'near',
}: {
  label: string
  value: number | string
  suffix?: string
  body: string
  className?: string
  depth?: 'near' | 'far'
}) {
  return (
    <figure
      className={cn(
        'pointer-events-none absolute w-[min(21rem,72vw)] rounded-2xl border border-hairline p-6 backdrop-blur-xl',
        depth === 'near'
          ? 'bg-void-950/70 shadow-[0_0_80px_-30px_rgba(180,120,245,0.5)]'
          : 'scale-90 bg-void-950/45 opacity-70',
        className,
      )}
    >
      <figcaption className="text-[0.6875rem] tracking-widest text-text-400">{label}</figcaption>

      <p className="mt-3 font-display text-5xl leading-none font-light text-text-100">
        {typeof value === 'number' ? faNumber(value) : value}
        {suffix ? <span className="text-3xl text-accent">{suffix}</span> : null}
      </p>

      <p className="mt-4 text-sm leading-fa-normal text-text-300">{body}</p>
    </figure>
  )
}
