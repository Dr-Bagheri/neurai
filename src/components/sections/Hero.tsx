import { Sparkles } from 'lucide-react'

import { ButtonLink } from '@/components/ui/Button'
import { Pill } from '@/components/ui/Pill'

/**
 * The hero sits over the galaxy — nothing here paints a backdrop, the fixed
 * canvas in the root layout shows through and this contributes only type.
 *
 * The layout leaves the vertical centre clear on purpose. That is where the
 * galactic core sits, and the core is the assistant: pointing at it makes it
 * brighten, clicking it opens the conversation. Putting a headline across the
 * middle would bury the one interactive object on the page.
 */
export function Hero() {
  return (
    <section className="relative flex min-h-dvh flex-col items-center justify-between px-6 py-28 text-center">
      <div className="flex flex-col items-center">
        <Pill icon={<Sparkles />}>به عصر تازه خوش آمدید</Pill>

        {/* Two-tone: the sentence opens bright and its final clause recedes.
            Persian puts the verb last, so the dimmed tail lands on the
            resolution — it reads as cadence, not as a fade. */}
        <h1 className="mt-8 max-w-4xl font-display text-4xl leading-fa-tight font-light text-text-100 sm:text-6xl lg:text-7xl">
          فناوری‌ای که ماهیت تعامل را{' '}
          <span className="heading-tail">از نو تعریف می‌کند</span>
        </h1>

        <p className="mt-8 max-w-xl text-base leading-fa-normal text-text-300 sm:text-lg">
          سامانه‌هایی می‌سازیم در تقاطع داده، انرژی و هوش — جایی که چیزی بنیادین و تازه
          شکل می‌گیرد.
        </p>
      </div>

      {/*
        The invitation to the core. It is the only signal that the light at the
        centre of the galaxy is interactive, so it has to be explicit — an
        affordance nobody notices is not an affordance. Kept quiet and low so it
        reads as a caption on the scene rather than as a call to action
        competing with the buttons.
      */}
      <p className="pointer-events-none mt-16 flex items-center gap-2 text-xs text-text-400">
        <span className="inline-block size-1.5 animate-pulse rounded-full bg-accent" />
        هستهٔ کهکشان را لمس کنید تا با دستیار گفت‌وگو کنید
      </p>

      <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row">
        <ButtonLink href="/services" size="lg" withArrow>
          خدمات ما
        </ButtonLink>
        <ButtonLink href="/blog" variant="ghost" size="lg">
          بینش‌ها
        </ButtonLink>
      </div>
    </section>
  )
}
