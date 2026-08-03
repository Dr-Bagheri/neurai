import Link from 'next/link'

import { BrandName } from '@/components/ui/BrandName'
import { brand } from '@/config/brand'
import { faNumber } from '@/lib/utils'

const COLUMNS = [
  {
    title: 'شرکت',
    links: [
      { href: '/about', label: 'دربارهٔ ما' },
      { href: '/services', label: 'خدمات' },
      { href: '/contact', label: 'تماس با ما' },
    ],
  },
  {
    title: 'منابع',
    links: [
      { href: '/blog', label: 'بینش‌ها' },
      { href: '/rss.xml', label: 'خوراک RSS' },
      { href: '/sitemap.xml', label: 'نقشهٔ سایت' },
    ],
  },
  {
    title: 'حساب کاربری',
    links: [
      { href: '/login', label: 'ورود' },
      { href: '/signup', label: 'ثبت‌نام' },
      { href: '/dashboard', label: 'پیشخوان' },
    ],
  },
] as const

export function SiteFooter() {
  return (
    <footer className="relative border-t border-hairline">
      <div className="mx-auto max-w-7xl px-6 py-16">
        <div className="grid gap-12 md:grid-cols-[1.5fr_repeat(3,1fr)]">
          <div className="max-w-sm">
            <p className="text-2xl text-text-100">
              <BrandName variant="mark" />
            </p>
            <p className="mt-4 text-sm leading-fa-normal text-text-300">{brand.descriptionFa}</p>
          </div>

          {COLUMNS.map((column) => (
            <nav key={column.title} aria-label={column.title}>
              <p className="text-xs tracking-wide text-text-400">{column.title}</p>
              <ul className="mt-4 flex flex-col gap-3">
                {column.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm text-text-300 transition-colors duration-300 hover:text-accent"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-14 flex flex-col gap-4 border-t border-hairline pt-8 text-xs text-text-400 sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {faNumber(brand.foundingYear, { useGrouping: false })}–اکنون · <BrandName /> · تمامی
            حقوق محفوظ است.
          </p>
          <p>
            ساخته‌شده با فناوری‌های متن‌باز، میزبانی‌شده روی زیرساخت خودمان.
          </p>
        </div>
      </div>
    </footer>
  )
}
