import { brand } from '@/config/brand'
import { cn } from '@/lib/utils'

/**
 * Renders the company name inside Persian copy.
 *
 * NEURAI is Latin script sitting in a right-to-left document, which needs two
 * things that are easy to get wrong:
 *
 *   1. `<bdi>` — bidirectional isolation. Without it, Latin text adjacent to
 *      Persian punctuation gets reordered by the bidi algorithm, so a trailing
 *      «.» or «،» jumps to the wrong side of the word.
 *   2. The Latin face. Vazirmatn's Latin glyphs exist but are secondary; Onest
 *      is the face the design system pairs with it.
 *
 * Six uppercase letters is a gift for a wordmark, so `variant="mark"` gives it
 * the wide tracking that treatment wants. Inline mentions in body copy stay at
 * normal tracking — letterspaced text inside a sentence reads as shouting.
 */
export function BrandName({
  variant = 'inline',
  className,
}: {
  variant?: 'inline' | 'mark'
  className?: string
}) {
  if (!brand.nameIsLatin) {
    return <span className={className}>{brand.nameFa}</span>
  }

  return (
    <bdi
      className={cn(
        'latin',
        variant === 'mark' && 'font-medium tracking-[0.22em] uppercase',
        className,
      )}
    >
      {brand.nameFa}
    </bdi>
  )
}
