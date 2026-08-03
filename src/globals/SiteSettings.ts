import type { GlobalConfig } from 'payload'

/**
 * Editorial site-wide settings. Anything an editor should be able to change
 * without a deploy belongs here; anything structural stays in src/config/brand.ts.
 */
export const SiteSettings: GlobalConfig = {
  slug: 'site-settings',
  label: { fa: 'تنظیمات سایت', en: 'Site settings' },
  admin: { group: { fa: 'سامانه', en: 'System' } },
  access: {
    read: () => true,
    update: ({ req }) => req.user?.collection === 'users',
  },
  fields: [
    {
      name: 'announcement',
      type: 'group',
      label: { fa: 'نوار اعلان', en: 'Announcement bar' },
      fields: [
        { name: 'enabled', type: 'checkbox', defaultValue: false, label: { fa: 'فعال', en: 'Enabled' } },
        { name: 'text', type: 'text', label: { fa: 'متن', en: 'Text' } },
        { name: 'href', type: 'text', label: { fa: 'پیوند', en: 'Link' } },
      ],
    },
    {
      name: 'contact',
      type: 'group',
      label: { fa: 'اطلاعات تماس', en: 'Contact' },
      fields: [
        { name: 'email', type: 'email', label: { fa: 'رایانامه', en: 'Email' } },
        { name: 'phone', type: 'text', label: { fa: 'تلفن', en: 'Phone' } },
        { name: 'address', type: 'textarea', label: { fa: 'نشانی', en: 'Address' } },
      ],
    },
    {
      name: 'social',
      type: 'array',
      label: { fa: 'شبکه‌های اجتماعی', en: 'Social links' },
      fields: [
        { name: 'platform', type: 'text', required: true, label: { fa: 'پلتفرم', en: 'Platform' } },
        { name: 'url', type: 'text', required: true, label: { fa: 'نشانی', en: 'URL' } },
      ],
    },
    {
      name: 'defaultSeoImage',
      type: 'upload',
      relationTo: 'media',
      label: { fa: 'تصویر پیش‌فرض اشتراک‌گذاری', en: 'Default share image' },
    },
  ],
}
