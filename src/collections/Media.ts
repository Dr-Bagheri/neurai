import type { CollectionConfig } from 'payload'

export const Media: CollectionConfig = {
  slug: 'media',
  labels: {
    singular: { fa: 'رسانه', en: 'Media' },
    plural: { fa: 'رسانه‌ها', en: 'Media' },
  },
  admin: { group: { fa: 'محتوا', en: 'Content' } },
  access: {
    read: () => true,
    create: ({ req }) => req.user?.collection === 'users',
    update: ({ req }) => req.user?.collection === 'users',
    delete: ({ req }) => req.user?.collection === 'users',
  },
  upload: {
    // Sizes are generated on upload and served from MinIO. The `card` and
    // `thumbnail` widths match the actual layout breakpoints so the browser
    // never downloads a 2000px image to paint a 400px card.
    imageSizes: [
      { name: 'thumbnail', width: 400, height: 300, position: 'centre' },
      { name: 'card', width: 800, height: 600, position: 'centre' },
      { name: 'hero', width: 1920, height: 1080, position: 'centre' },
      { name: 'og', width: 1200, height: 630, position: 'centre' },
    ],
    mimeTypes: ['image/*', 'application/pdf'],
  },
  fields: [
    {
      name: 'alt',
      type: 'text',
      required: true,
      label: { fa: 'متن جایگزین', en: 'Alt text' },
      admin: {
        description: {
          fa: 'برای صفحه‌خوان‌ها ضروری است. تصویر را توصیف کنید، نه اینکه بنویسید «تصویر».',
          en: 'Required for screen readers. Describe the image; do not write "image".',
        },
      },
    },
    {
      name: 'caption',
      type: 'text',
      label: { fa: 'شرح', en: 'Caption' },
    },
  ],
}
