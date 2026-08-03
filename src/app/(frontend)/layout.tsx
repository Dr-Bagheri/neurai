import '@fontsource-variable/vazirmatn'
import '@fontsource-variable/estedad'
import '@fontsource-variable/space-grotesk'
import '@/styles/globals.css'

import type { Metadata, Viewport } from 'next'

import { ChatMount } from '@/components/chat/ChatMount'
import { CosmosCanvas } from '@/components/cosmos/CosmosCanvas'
import { SiteFooter } from '@/components/layout/SiteFooter'
import { SiteHeader } from '@/components/layout/SiteHeader'
import { brand } from '@/config/brand'

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: `${brand.nameFa} — ${brand.taglineFa}`,
    template: `%s | ${brand.nameFa}`,
  },
  description: brand.descriptionFa,
  applicationName: brand.nameFa,
  openGraph: {
    type: 'website',
    locale: 'fa_IR',
    siteName: brand.nameFa,
    title: `${brand.nameFa} — ${brand.taglineFa}`,
    description: brand.descriptionFa,
  },
  twitter: { card: 'summary_large_image' },
  robots: { index: true, follow: true },
}

export const viewport: Viewport = {
  // The page is a window onto a black universe; matching the browser chrome to
  // it removes the seam at the top of the viewport on mobile.
  themeColor: '#000000',
  colorScheme: 'dark',
  width: 'device-width',
  initialScale: 1,
}

export default function FrontendLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fa" dir="rtl" suppressHydrationWarning>
      <body className="min-h-dvh antialiased">
        {/* Mounted here, outside {children}, so route changes never rebuild the
            WebGL context. See CosmosCanvas for why that matters. */}
        <CosmosCanvas />

        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:start-4 focus:z-50 focus:rounded-full focus:bg-accent focus:px-5 focus:py-2 focus:text-void-1000"
        >
          پرش به محتوای اصلی
        </a>

        <div className="relative flex min-h-dvh flex-col">
          <SiteHeader />
          <main id="main" className="flex-1">
            {children}
          </main>
          <SiteFooter />
        </div>

        <ChatMount />
      </body>
    </html>
  )
}
