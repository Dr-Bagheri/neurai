import type { Metadata } from 'next'
import Image from 'next/image'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { RichText } from '@payloadcms/richtext-lexical/react'

import { ReadTracker } from '@/components/personalization/ReadTracker'
import { brand } from '@/config/brand'
import { getPayloadClient } from '@/lib/payload'
import { faDate, faReadingTime, isoDate } from '@/lib/utils'

export const revalidate = 300

type Params = Promise<{ slug: string }>

async function findPost(slug: string) {
  const payload = await getPayloadClient()
  const result = await payload.find({
    collection: 'posts',
    // Persian slugs arrive percent-encoded in the URL.
    where: { slug: { equals: decodeURIComponent(slug) }, _status: { equals: 'published' } },
    limit: 1,
    depth: 2,
  })
  return result.docs[0] ?? null
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params
  const post = await findPost(slug)
  if (!post) return { title: 'یافت نشد' }

  const seo = post.seo as { title?: string; description?: string } | undefined
  const cover = post.coverImage as { url?: string } | undefined

  return {
    title: seo?.title || post.title,
    description: seo?.description || post.excerpt,
    openGraph: {
      type: 'article',
      title: seo?.title || post.title,
      description: seo?.description || post.excerpt,
      publishedTime: post.publishedAt ?? undefined,
      images: cover?.url ? [{ url: cover.url }] : undefined,
    },
    alternates: { canonical: `/blog/${post.slug}` },
  }
}

export default async function PostPage({ params }: { params: Params }) {
  const { slug } = await params
  const post = await findPost(slug)
  if (!post) notFound()

  const cover = post.coverImage as { url?: string; alt?: string } | undefined
  const category = post.category as { title?: string; slug?: string } | undefined
  const author = post.author as { name?: string; bio?: string } | undefined
  // `tags` is typed `(number | Tag)[]` because Payload can't know the query's
  // depth at the type level. `depth: 2` above means these are hydrated objects,
  // so narrow to the populated ones and drop any bare ids.
  const tags = (post.tags ?? []).filter((tag) => typeof tag === 'object')

  // Structured data. Persian content benefits disproportionately here — search
  // engines lean on explicit markup where language models of the page are weaker.
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.excerpt,
    datePublished: post.publishedAt ?? undefined,
    dateModified: post.updatedAt,
    inLanguage: 'fa-IR',
    author: author?.name ? { '@type': 'Person', name: author.name } : undefined,
    publisher: { '@type': 'Organization', name: brand.nameFa },
    image: cover?.url,
  }

  return (
    <article className="relative px-6 py-24">
      <div className="bloom-layer" />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <ReadTracker postId={String(post.id)} slug={String(post.slug)} />

      <div className="mx-auto max-w-3xl">
        <header>
          {category?.title ? (
            <Link
              href={`/blog?category=${encodeURIComponent(String(category.slug))}`}
              className="text-xs text-accent hover:underline"
            >
              {category.title}
            </Link>
          ) : null}

          <h1 className="mt-4 font-display text-3xl leading-fa-tight font-light text-text-100 sm:text-5xl">
            {post.title}
          </h1>

          <p className="mt-6 text-lg leading-fa-normal text-text-300">{post.excerpt}</p>

          <div className="mt-8 flex flex-wrap items-center gap-3 text-xs text-text-400">
            {author?.name ? <span>{author.name}</span> : null}
            {post.publishedAt ? (
              <>
                <span aria-hidden="true">·</span>
                <time dateTime={isoDate(post.publishedAt)}>{faDate(post.publishedAt)}</time>
              </>
            ) : null}
            {post.readingTime ? (
              <>
                <span aria-hidden="true">·</span>
                <span>{faReadingTime(post.readingTime)}</span>
              </>
            ) : null}
          </div>
        </header>

        {cover?.url ? (
          <div className="relative mt-12 aspect-[16/9] overflow-hidden rounded-2xl border border-hairline">
            <Image
              src={cover.url}
              alt={cover.alt ?? ''}
              fill
              sizes="(max-width: 768px) 100vw, 768px"
              className="object-cover"
              priority
            />
          </div>
        ) : null}

        <div className="prose-fa mt-14">
          <RichText data={post.content} />
        </div>

        {tags.length > 0 ? (
          <footer className="mt-16 flex flex-wrap gap-2 border-t border-hairline pt-8">
            {tags.map((tag) => (
              <span
                key={tag.id}
                className="rounded-full border border-hairline px-3 py-1 text-xs text-text-400"
              >
                {tag.title}
              </span>
            ))}
          </footer>
        ) : null}
      </div>
    </article>
  )
}
