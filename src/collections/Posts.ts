import type { CollectionConfig } from 'payload'

import { lexicalToPlainText } from '@/lib/content/lexical'
import { faSlug } from '@/lib/utils'

import { adminOnly, staffOnly } from './access'

/** Persian prose runs ~200 words/minute for an average reader. */
const WORDS_PER_MINUTE = 200

export const Posts: CollectionConfig = {
  slug: 'posts',
  labels: {
    singular: { fa: 'نوشته', en: 'Post' },
    plural: { fa: 'بینش‌ها', en: 'Insights' },
  },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'category', 'publishedAt', '_status'],
    group: { fa: 'محتوا', en: 'Content' },
    livePreview: {
      url: ({ data }) =>
        `${process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'}/blog/${data?.slug ?? ''}`,
    },
  },
  versions: {
    drafts: { autosave: { interval: 800 } },
    maxPerDoc: 20,
  },
  access: {
    // The public only ever sees published posts; drafts stay internal.
    read: ({ req }) => {
      if (req.user?.collection === 'users') return true
      return { _status: { equals: 'published' } }
    },
    create: staffOnly,
    update: staffOnly,
    delete: adminOnly,
  },
  hooks: {
    afterChange: [
      async ({ doc, req, operation }) => {
        // Index for retrieval whenever a published post changes. Drafts are
        // deliberately not indexed — the assistant must never quote unpublished
        // material back to a visitor.
        const { indexPost, removeFromIndex } = await import('@/lib/ai/indexer')
        try {
          if (doc._status === 'published') {
            await indexPost(doc, req.payload)
          } else if (operation === 'update') {
            await removeFromIndex('posts', String(doc.id), req.payload)
          }
        } catch (error) {
          // Indexing must never block publishing. A failed index is recoverable
          // by re-saving or by running the reindex script; a failed save is not.
          req.payload.logger.error({ err: error }, 'Failed to index post for retrieval')
        }
        return doc
      },
    ],
    afterDelete: [
      async ({ doc, req }) => {
        const { removeFromIndex } = await import('@/lib/ai/indexer')
        try {
          await removeFromIndex('posts', String(doc.id), req.payload)
        } catch (error) {
          req.payload.logger.error({ err: error }, 'Failed to remove post from index')
        }
      },
    ],
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
      label: { fa: 'عنوان', en: 'Title' },
    },
    {
      name: 'slug',
      type: 'text',
      unique: true,
      index: true,
      label: { fa: 'نشانی', en: 'Slug' },
      admin: { position: 'sidebar' },
      hooks: {
        beforeValidate: [
          ({ value, data }) => {
            if (typeof value === 'string' && value.trim()) return faSlug(value)
            return typeof data?.title === 'string' ? faSlug(data.title) : value
          },
        ],
      },
    },
    {
      name: 'excerpt',
      type: 'textarea',
      required: true,
      maxLength: 280,
      label: { fa: 'چکیده', en: 'Excerpt' },
      admin: {
        description: {
          fa: 'در کارت‌ها، نتایج جست‌وجو و توضیحات متا استفاده می‌شود.',
          en: 'Used in cards, search results, and meta descriptions.',
        },
      },
    },
    {
      name: 'content',
      type: 'richText',
      required: true,
      label: { fa: 'متن', en: 'Content' },
    },
    {
      name: 'coverImage',
      type: 'upload',
      relationTo: 'media',
      label: { fa: 'تصویر شاخص', en: 'Cover image' },
    },
    {
      name: 'category',
      type: 'relationship',
      relationTo: 'categories',
      required: true,
      label: { fa: 'دسته', en: 'Category' },
      admin: { position: 'sidebar' },
    },
    {
      name: 'tags',
      type: 'relationship',
      relationTo: 'tags',
      hasMany: true,
      label: { fa: 'برچسب‌ها', en: 'Tags' },
      admin: { position: 'sidebar' },
    },
    {
      name: 'author',
      type: 'relationship',
      relationTo: 'users',
      required: true,
      label: { fa: 'نویسنده', en: 'Author' },
      admin: { position: 'sidebar' },
    },
    {
      name: 'publishedAt',
      type: 'date',
      label: { fa: 'تاریخ انتشار', en: 'Published at' },
      admin: {
        position: 'sidebar',
        date: { pickerAppearance: 'dayAndTime' },
      },
      hooks: {
        beforeChange: [
          ({ value, data }) =>
            // Stamp on first publish so the date reflects publication rather
            // than whenever the draft happened to be created.
            !value && data?._status === 'published' ? new Date().toISOString() : value,
        ],
      },
    },
    {
      name: 'readingTime',
      type: 'number',
      label: { fa: 'زمان مطالعه (دقیقه)', en: 'Reading time (min)' },
      admin: { position: 'sidebar', readOnly: true },
      hooks: {
        beforeChange: [
          ({ data }) => {
            const text = lexicalToPlainText(data?.content)
            const words = text.split(/\s+/).filter(Boolean).length
            return Math.max(1, Math.round(words / WORDS_PER_MINUTE))
          },
        ],
      },
    },
    {
      name: 'seo',
      type: 'group',
      label: { fa: 'سئو', en: 'SEO' },
      fields: [
        { name: 'title', type: 'text', label: { fa: 'عنوان سئو', en: 'SEO title' } },
        { name: 'description', type: 'textarea', label: { fa: 'توضیح سئو', en: 'SEO description' } },
        {
          name: 'image',
          type: 'upload',
          relationTo: 'media',
          label: { fa: 'تصویر اشتراک‌گذاری', en: 'Share image' },
        },
      ],
    },
  ],
}
