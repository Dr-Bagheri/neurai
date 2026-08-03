import { Sparkles } from 'lucide-react'

import { ButtonLink } from '@/components/ui/Button'
import { Pill } from '@/components/ui/Pill'

/**
 * The hero sits *inside* the cosmos ring rather than on top of a background
 * image. Nothing here paints a backdrop — the fixed canvas in the root layout
 * shows through, and the section only contributes type.
 *
 * Height is `min-h-dvh` rather than `h-dvh` so that long Persian headlines at
 * large text sizes can push the section taller instead of overflowing it.
 */
export function Hero() {
  return (
    <section className="relative flex min-h-dvh flex-col items-center justify-center px-6 py-32 text-center">
      <Pill icon={<Sparkles />}>به عصر تازه خوش آمدید</Pill>

      {/* The two-tone treatment: the sentence opens bright and its final clause
          recedes. Persian puts the verb last, so the dimmed tail lands on the
          resolution of the sentence — it reads as cadence, not as a fade. */}
      <h1 className="mt-8 max-w-4xl font-display text-4xl leading-fa-tight font-light text-text-100 sm:text-6xl lg:text-7xl">
        فناوری‌ای که ماهیت تعامل را{' '}
        <span className="heading-tail">از نو تعریف می‌کند</span>
      </h1>

      <p className="mt-8 max-w-xl text-base leading-fa-normal text-text-300 sm:text-lg">
        سامانه‌هایی می‌سازیم در تقاطع داده، انرژی و هوش — جایی که چیزی بنیادین و تازه
        شکل می‌گیرد.
      </p>

      <div className="mt-12 flex flex-col items-center gap-4 sm:flex-row">
        <ButtonLink href="/signup" size="lg" withArrow>
          شروع کنید
        </ButtonLink>
        <ButtonLink href="/services" variant="ghost" size="lg">
          ببینید چگونه کار می‌کند
        </ButtonLink>
      </div>

      <p className="mt-16 text-xs text-text-400">
        برای کاوش در NEURAI، نشانگر را حرکت دهید یا روی زمینه کلیک کنید
      </p>
    </section>
  )
}
