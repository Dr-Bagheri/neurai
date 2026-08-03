import type { CollectionConfig } from 'payload'

import { isAdmin } from './access'

/**
 * Staff. This is the collection the admin panel authenticates against.
 * Site visitors live in `Members` instead — keeping the two separate means a
 * visitor account can never accidentally inherit CMS access.
 */
export const Users: CollectionConfig = {
  slug: 'users',
  labels: {
    singular: { fa: 'کاربر', en: 'User' },
    plural: { fa: 'کاربران', en: 'Users' },
  },
  auth: {
    tokenExpiration: 60 * 60 * 8,
    maxLoginAttempts: 5,
    lockTime: 10 * 60 * 1000,
  },
  admin: {
    useAsTitle: 'name',
    defaultColumns: ['name', 'email', 'role'],
    group: { fa: 'سامانه', en: 'System' },
  },
  access: {
    // Only admins may create or delete staff accounts.
    create: ({ req }) => isAdmin(req.user),
    delete: ({ req }) => isAdmin(req.user),
    update: ({ req, id }) => isAdmin(req.user) || req.user?.id === id,
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
      label: { fa: 'نام', en: 'Name' },
    },
    {
      name: 'role',
      type: 'select',
      required: true,
      defaultValue: 'editor',
      label: { fa: 'نقش', en: 'Role' },
      options: [
        { label: { fa: 'مدیر', en: 'Admin' }, value: 'admin' },
        { label: { fa: 'ویراستار', en: 'Editor' }, value: 'editor' },
      ],
      access: {
        // A user must not be able to promote themselves.
        update: ({ req }) => isAdmin(req.user),
      },
    },
    {
      name: 'bio',
      type: 'textarea',
      label: { fa: 'معرفی کوتاه', en: 'Short bio' },
      admin: { description: { fa: 'در صفحهٔ نویسنده نمایش داده می‌شود.', en: 'Shown on author pages.' } },
    },
    {
      name: 'avatar',
      type: 'upload',
      relationTo: 'media',
      label: { fa: 'تصویر', en: 'Avatar' },
    },
  ],
}
