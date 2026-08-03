import Link from 'next/link'
import { ArrowUpLeft } from 'lucide-react'
import type { ComponentProps, ReactNode } from 'react'

import { cn } from '@/lib/utils'

type Variant = 'primary' | 'ghost' | 'quiet'
type Size = 'sm' | 'md' | 'lg'

const VARIANTS: Record<Variant, string> = {
  // Glass pill with a circular icon badge — the reference hero's primary CTA.
  // Cyan is the single interactive accent in the whole design system.
  primary:
    'bg-glass-2 text-text-100 border-hairline-strong hover:border-accent/50 hover:bg-accent/10 hover:text-white',
  ghost: 'bg-transparent text-text-200 border-hairline hover:border-hairline-strong hover:text-text-100',
  quiet: 'bg-transparent text-text-300 border-transparent hover:text-accent',
}

const SIZES: Record<Size, string> = {
  sm: 'h-9 ps-4 pe-3 text-sm gap-2',
  md: 'h-11 ps-6 pe-4 text-sm gap-3',
  lg: 'h-13 ps-8 pe-5 text-base gap-3',
}

type BaseProps = {
  variant?: Variant
  size?: Size
  /** Show the circular arrow badge. Automatically mirrored in RTL. */
  withArrow?: boolean
  children: ReactNode
  className?: string
}

function inner(children: ReactNode, withArrow: boolean, size: Size) {
  return (
    <>
      <span>{children}</span>
      {withArrow ? (
        <span
          aria-hidden="true"
          className={cn(
            'grid place-items-center rounded-full border border-hairline-strong bg-glass-2 transition-transform duration-300 group-hover:-translate-y-0.5',
            size === 'lg' ? 'size-8' : 'size-7',
          )}
        >
          {/* ArrowUpLeft already points "forward" for RTL reading order. */}
          <ArrowUpLeft className="size-3.5" strokeWidth={1.75} />
        </span>
      ) : null}
    </>
  )
}

const base =
  'group inline-flex items-center justify-center rounded-full border font-normal transition-all duration-300 ease-[var(--ease-cinematic)] backdrop-blur-md disabled:pointer-events-none disabled:opacity-40'

export function Button({
  variant = 'primary',
  size = 'md',
  withArrow = false,
  className,
  children,
  ...props
}: BaseProps & ComponentProps<'button'>) {
  return (
    <button className={cn(base, VARIANTS[variant], SIZES[size], className)} {...props}>
      {inner(children, withArrow, size)}
    </button>
  )
}

export function ButtonLink({
  variant = 'primary',
  size = 'md',
  withArrow = false,
  className,
  children,
  href,
  ...props
}: BaseProps & ComponentProps<typeof Link>) {
  return (
    <Link href={href} className={cn(base, VARIANTS[variant], SIZES[size], className)} {...props}>
      {inner(children, withArrow, size)}
    </Link>
  )
}
