import type { Metadata } from 'next'
import Link from 'next/link'

import { PostCard, type PostCardData } from '@/components/blog/PostCard'
import { Section } from '@/components/sections/Section'
import { getPayloadClient } from '@/lib/payload'
import { faNumber } from '@/lib/utils'

export const metadata: Metadata = {
  title: 'بینش‌ها',
  description: 'نوشته‌هایی دربارهٔ هوش مصنوعی، معماری سامانه‌ها و اجرای مدل‌های متن‌باز.',
}

// Content changes rarely and the pages are read constantly; revalidate on a
// timer rather than rendering per request.
export const revalidate = 300

type SearchParams = Promise<{ page?: string; category?: string }>

const PER_PAGE = 9

export default async function BlogIndexPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  const page = Math.max(1, Number(params.page ?? 1) || 1)

  const payload = await getPayloadClient()

  const [posts, categories] = await Promise.all([
    payload.find({
      collection: 'posts',
      where: {
        _status: { equals: 'published' },
        ...(params.category ? { 'category.slug': { equals: params.category } } : {}),
      },
      sort: '-publishedAt',
      limit: PER_PAGE,
      page,
      depth: 1,
    }),
    payload.find({ collection: 'categories', limit: 50, sort: 'title' }),
  ])

  return (
    <Section
      eyebrow="بینش‌ها"
      title="آنچه یاد گرفته‌ایم،"
      titleTail="بی‌پرده می‌نویسیم"
      lead="یادداشت‌های فنی دربارهٔ ساخت و اجرای سامانه‌های هوش مصنوعی — همراه با جزئیاتی که معمولاً گفته نمی‌شود."
    >
      {categories.docs.length > 0 ? (
        <nav aria-label="فیلتر دسته‌ها" className="mb-10 flex flex-wrap gap-2">
          <FilterLink href="/blog" active={!params.category}>
            همه
          </FilterLink>
          {categories.docs.map((category) => (
            <FilterLink
              key={category.id}
              href={`/blog?category=${encodeURIComponent(String(category.slug))}`}
              active={params.category === category.slug}
            >
              {category.title}
            </FilterLink>
          ))}
        </nav>
      ) : null}

      {posts.docs.length === 0 ? (
        <p className="text-text-300">هنوز نوشته‌ای منتشر نشده است.</p>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {posts.docs.map((post, index) => (
            <PostCard key={post.id} post={post as unknown as PostCardData} priority={index < 3} />
          ))}
        </div>
      )}

      {posts.totalPages > 1 ? (
        <nav
          aria-label="صفحه‌بندی"
          className="mt-14 flex items-center justify-center gap-3 text-sm"
        >
          {posts.hasPrevPage ? (
            <Link
              href={`/blog?page=${posts.page! - 1}`}
              className="rounded-full border border-hairline px-5 py-2 text-text-200 transition-colors hover:border-accent hover:text-accent"
            >
              تازه‌تر
            </Link>
          ) : null}
          <span className="text-text-400">
            صفحهٔ {faNumber(posts.page ?? 1)} از {faNumber(posts.totalPages)}
          </span>
          {posts.hasNextPage ? (
            <Link
              href={`/blog?page=${posts.page! + 1}`}
              className="rounded-full border border-hairline px-5 py-2 text-text-200 transition-colors hover:border-accent hover:text-accent"
            >
              قدیمی‌تر
            </Link>
          ) : null}
        </nav>
      ) : null}
    </Section>
  )
}

function FilterLink({
  href,
  active,
  children,
}: {
  href: string
  active: boolean
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={
        active
          ? 'rounded-full border border-accent/50 bg-accent/10 px-4 py-1.5 text-xs text-accent'
          : 'rounded-full border border-hairline px-4 py-1.5 text-xs text-text-300 transition-colors hover:border-hairline-strong hover:text-text-100'
      }
    >
      {children}
    </Link>
  )
}
