import Image from 'next/image'
import Link from 'next/link'

import { GlassCard } from '@/components/ui/GlassCard'
import { faDate, faReadingTime, isoDate } from '@/lib/utils'

export type PostCardData = {
  id: string | number
  title: string
  slug: string
  excerpt: string
  publishedAt?: string | null
  readingTime?: number | null
  category?: { title?: string; slug?: string } | string | number | null
  coverImage?: { url?: string | null; alt?: string | null } | string | number | null
}

function categoryTitle(category: PostCardData['category']): string | null {
  return category && typeof category === 'object' ? (category.title ?? null) : null
}

function coverUrl(cover: PostCardData['coverImage']) {
  return cover && typeof cover === 'object' && cover.url
    ? { url: cover.url, alt: cover.alt ?? '' }
    : null
}

export function PostCard({ post, priority = false }: { post: PostCardData; priority?: boolean }) {
  const cover = coverUrl(post.coverImage)
  const category = categoryTitle(post.category)

  return (
    <GlassCard interactive className="group p-0">
      <Link href={`/blog/${post.slug}`} className="flex h-full flex-col">
        {cover ? (
          <div className="relative aspect-[16/10] overflow-hidden rounded-t-2xl">
            <Image
              src={cover.url}
              alt={cover.alt}
              fill
              // Two columns on tablet, three on desktop — tells the browser to
              // fetch a ~400px image for a card instead of the full-width original.
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
              className="object-cover transition-transform duration-700 ease-[var(--ease-cinematic)] group-hover:scale-105"
              priority={priority}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-void-1000/80 to-transparent" />
          </div>
        ) : null}

        <div className="flex flex-1 flex-col p-7">
          {category ? <p className="text-xs text-accent">{category}</p> : null}

          <h3 className="mt-3 font-display text-xl leading-fa-tight font-normal text-text-100 transition-colors group-hover:text-white">
            {post.title}
          </h3>

          <p className="mt-3 line-clamp-3 flex-1 text-sm leading-fa-normal text-text-300">
            {post.excerpt}
          </p>

          <div className="mt-6 flex items-center gap-3 text-xs text-text-400">
            {post.publishedAt ? (
              <time dateTime={isoDate(post.publishedAt)}>{faDate(post.publishedAt)}</time>
            ) : null}
            {post.readingTime ? (
              <>
                <span aria-hidden="true">·</span>
                <span>{faReadingTime(post.readingTime)}</span>
              </>
            ) : null}
          </div>
        </div>
      </Link>
    </GlassCard>
  )
}
