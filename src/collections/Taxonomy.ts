import type { CollectionConfig, Field } from 'payload'

import { faSlug } from '@/lib/utils'

import { adminOnly, publicRead, staffOnly } from './access'

/**
 * Slugs keep their Persian characters rather than being transliterated.
 * `/blog/هوش-مصنوعی` is readable, indexes well in Persian search, and every
 * modern browser displays it decoded. `faSlug` normalises the Arabic/Persian
 * character variants that would otherwise silently produce two slugs for what
 * an author sees as one word.
 */
const slugField = (from: string): Field => ({
  name: 'slug',
  type: 'text',
  unique: true,
  index: true,
  label: { fa: 'نشانی', en: 'Slug' },
  admin: {
    position: 'sidebar',
    description: {
      fa: 'در صورت خالی بودن، از عنوان ساخته می‌شود. حروف فارسی مجاز است.',
      en: 'Generated from the title when left empty. Persian characters are allowed.',
    },
  },
  hooks: {
    beforeValidate: [
      ({ value, data }) => {
        if (typeof value === 'string' && value.trim()) return faSlug(value)
        const source = (data as Record<string, unknown> | undefined)?.[from]
        return typeof source === 'string' ? faSlug(source) : value
      },
    ],
  },
})

export const Categories: CollectionConfig = {
  slug: 'categories',
  labels: {
    singular: { fa: 'دسته', en: 'Category' },
    plural: { fa: 'دسته‌ها', en: 'Categories' },
  },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'slug'],
    group: { fa: 'محتوا', en: 'Content' },
  },
  access: {
    read: publicRead,
    create: staffOnly,
    update: staffOnly,
    delete: adminOnly,
  },
  fields: [
    { name: 'title', type: 'text', required: true, label: { fa: 'عنوان', en: 'Title' } },
    slugField('title'),
    { name: 'description', type: 'textarea', label: { fa: 'توضیح', en: 'Description' } },
  ],
}

export const Tags: CollectionConfig = {
  slug: 'tags',
  labels: {
    singular: { fa: 'برچسب', en: 'Tag' },
    plural: { fa: 'برچسب‌ها', en: 'Tags' },
  },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'slug'],
    group: { fa: 'محتوا', en: 'Content' },
  },
  access: {
    read: publicRead,
    create: staffOnly,
    update: staffOnly,
    delete: adminOnly,
  },
  fields: [
    { name: 'title', type: 'text', required: true, label: { fa: 'عنوان', en: 'Title' } },
    slugField('title'),
  ],
}
