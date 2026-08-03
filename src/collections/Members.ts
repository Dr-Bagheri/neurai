import type { CollectionConfig } from 'payload'

/**
 * Site visitors with accounts.
 *
 * Deliberately separate from `Users`: members authenticate against the public
 * site, never the admin panel, and no member field can grant CMS access.
 *
 * Privacy posture — memory and behavioural personalization are OFF by default
 * and only run when the member opts in. `consentPersonalization` is read on
 * every personalization path; if it is false the site behaves like a plain
 * anonymous visit and stored memories are never injected into chat context.
 */
export const Members: CollectionConfig = {
  slug: 'members',
  labels: {
    singular: { fa: 'عضو', en: 'Member' },
    plural: { fa: 'اعضا', en: 'Members' },
  },
  auth: {
    verify: true,
    maxLoginAttempts: 5,
    lockTime: 15 * 60 * 1000,
    tokenExpiration: 60 * 60 * 24 * 30,
    cookies: {
      sameSite: 'Lax',
      secure: process.env.NODE_ENV === 'production',
    },
  },
  admin: {
    useAsTitle: 'email',
    defaultColumns: ['email', 'name', 'consentPersonalization', 'createdAt'],
    group: { fa: 'مخاطبان', en: 'Audience' },
  },
  access: {
    // Staff can see the list; a member can only ever read or edit themselves.
    read: ({ req }) => {
      if (req.user?.collection === 'users') return true
      if (req.user?.collection === 'members') return { id: { equals: req.user.id } }
      return false
    },
    update: ({ req, id }) => {
      if (req.user?.collection === 'users') return req.user.role === 'admin'
      return req.user?.collection === 'members' && req.user.id === id
    },
    delete: ({ req, id }) => {
      // Members may delete their own account — this is what makes the privacy
      // controls in /dashboard/privacy real rather than decorative.
      if (req.user?.collection === 'members') return req.user.id === id
      return req.user?.collection === 'users' && req.user.role === 'admin'
    },
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
      label: { fa: 'نام', en: 'Name' },
    },
    {
      name: 'organization',
      type: 'text',
      label: { fa: 'سازمان', en: 'Organization' },
    },
    {
      name: 'interests',
      type: 'relationship',
      relationTo: 'categories',
      hasMany: true,
      label: { fa: 'حوزه‌های مورد علاقه', en: 'Interests' },
      admin: {
        description: {
          fa: 'انتخاب صریح عضو. مکمل بردار علاقه‌ای است که از رفتار مطالعه ساخته می‌شود.',
          en: 'Explicitly chosen. Complements the interest vector derived from reading behaviour.',
        },
      },
    },
    {
      name: 'consentPersonalization',
      type: 'checkbox',
      defaultValue: false,
      label: { fa: 'رضایت به شخصی‌سازی', en: 'Personalization consent' },
      admin: {
        description: {
          fa: 'اگر خاموش باشد، هیچ رفتاری ثبت نمی‌شود و حافظهٔ دستیار خالی می‌ماند.',
          en: 'When off, no behaviour is recorded and assistant memory stays empty.',
        },
      },
    },
    {
      name: 'savedPosts',
      type: 'relationship',
      relationTo: 'posts',
      hasMany: true,
      label: { fa: 'ذخیره‌شده‌ها', en: 'Saved posts' },
    },
    {
      // Written by the nightly interest job, not by hand. Hidden from the admin
      // UI because a 768-float array is noise for a human editor.
      name: 'interestVectorUpdatedAt',
      type: 'date',
      admin: { readOnly: true, position: 'sidebar' },
      label: { fa: 'آخرین به‌روزرسانی علایق', en: 'Interests updated' },
    },
  ],
}
