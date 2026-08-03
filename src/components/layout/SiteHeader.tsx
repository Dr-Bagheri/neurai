'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Menu, X } from 'lucide-react'
import { useEffect, useState } from 'react'

import { BrandName } from '@/components/ui/BrandName'
import { ButtonLink } from '@/components/ui/Button'
import { cn } from '@/lib/utils'

const NAV = [
  { href: '/services', label: 'خدمات' },
  { href: '/about', label: 'دربارهٔ ما' },
  { href: '/blog', label: 'بینش‌ها' },
  { href: '/contact', label: 'تماس' },
] as const

export function SiteHeader() {
  const pathname = usePathname()
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])


  return (
    <header
      className={cn(
        'sticky top-0 z-40 transition-all duration-500 ease-[var(--ease-cinematic)]',
        scrolled
          ? 'border-b border-hairline bg-void-1000/70 backdrop-blur-xl'
          : 'border-b border-transparent',
      )}
    >
      <div className="mx-auto flex h-18 max-w-7xl items-center justify-between gap-6 px-6">
        <Link
          href="/"
          className="flex items-center gap-3 text-lg text-text-100 transition-colors hover:text-white"
        >
          <CoreMark />
          <BrandName variant="mark" className="text-base" />
        </Link>

        <nav aria-label="ناوبری اصلی" className="hidden items-center gap-1 md:flex">
          {NAV.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`)
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'rounded-full px-4 py-2 text-sm transition-colors duration-300',
                  active ? 'text-accent' : 'text-text-300 hover:text-text-100',
                )}
              >
                {item.label}
              </Link>
            )
          })}
        </nav>

        <div className="flex items-center gap-3">
          <ButtonLink href="/login" variant="ghost" size="sm" className="hidden sm:inline-flex">
            ورود
          </ButtonLink>
          <ButtonLink href="/signup" size="sm" withArrow className="hidden sm:inline-flex">
            شروع کنید
          </ButtonLink>

          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={open ? 'بستن منو' : 'باز کردن منو'}
            className="grid size-10 place-items-center rounded-full border border-hairline bg-glass-2 text-text-100 md:hidden"
          >
            {open ? <X className="size-4" /> : <Menu className="size-4" />}
          </button>
        </div>
      </div>

      {open ? (
        <nav
          id="mobile-nav"
          aria-label="ناوبری موبایل"
          className="border-t border-hairline bg-void-1000/95 px-6 py-4 backdrop-blur-xl md:hidden"
        >
          {/* Each link closes the sheet on click rather than an effect watching
              `pathname` — closing is a consequence of the interaction, and
              driving it from an effect causes a cascading re-render. */}
          <ul className="flex flex-col gap-1" onClick={() => setOpen(false)}>
            {NAV.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="block rounded-xl px-4 py-3 text-text-200 transition-colors hover:bg-glass-1 hover:text-text-100"
                >
                  {item.label}
                </Link>
              </li>
            ))}
            <li className="mt-2 flex gap-3 px-1">
              <ButtonLink href="/login" variant="ghost" size="sm" className="flex-1">
                ورود
              </ButtonLink>
              <ButtonLink href="/signup" size="sm" className="flex-1">
                ثبت‌نام
              </ButtonLink>
            </li>
          </ul>
        </nav>
      ) : null}
    </header>
  )
}

/**
 * The mark: a bright core inside a tilted orbit — the galaxy, reduced to the
 * two things that make it legible at 24px. It deliberately echoes the hero,
 * so the logo reads as the same object the visitor just clicked.
 */
function CoreMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-6" aria-hidden="true">
      <ellipse
        cx="12"
        cy="12"
        rx="10.5"
        ry="4.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="0.9"
        className="text-accent/45"
        transform="rotate(-22 12 12)"
      />
      <circle cx="12" cy="12" r="2.6" className="fill-accent/25" />
      <circle cx="12" cy="12" r="1.35" className="fill-core-100" />
    </svg>
  )
}
