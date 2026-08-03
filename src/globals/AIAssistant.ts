import type { GlobalConfig } from 'payload'

import { adminOnly, publicRead } from '@/collections/access'

/**
 * The assistant's behaviour, editable from the admin panel.
 *
 * Prompt text lives here rather than in code on purpose: tuning an assistant's
 * tone and refusal behaviour is editorial work, and requiring a deploy for
 * every wording change guarantees it never gets tuned.
 */
export const AIAssistant: GlobalConfig = {
  slug: 'ai-assistant',
  label: { fa: 'دستیار هوشمند', en: 'AI Assistant' },
  admin: { group: { fa: 'سامانه', en: 'System' } },
  access: {
    read: publicRead,
    update: adminOnly,
  },
  fields: [
    {
      name: 'enabled',
      type: 'checkbox',
      defaultValue: true,
      label: { fa: 'فعال', en: 'Enabled' },
    },
    {
      name: 'greeting',
      type: 'textarea',
      required: true,
      defaultValue:
        'سلام! من دستیار NEURAI هستم. دربارهٔ خدمات، معماری فنی یا نوشته‌های ما بپرسید.',
      label: { fa: 'پیام خوش‌آمد', en: 'Greeting' },
    },
    {
      name: 'persona',
      type: 'textarea',
      required: true,
      defaultValue:
        'تو دستیار رسمی شرکت NEURAI هستی؛ دقیق، مختصر و بی‌اغراق. لحن حرفه‌ای و محترمانه اما ساده است.',
      label: { fa: 'شخصیت', en: 'Persona' },
      admin: {
        description: {
          fa: 'به ابتدای پیام سیستمی افزوده می‌شود.',
          en: 'Prepended to the system message.',
        },
      },
    },
    {
      name: 'groundingRule',
      type: 'textarea',
      required: true,
      defaultValue:
        'فقط بر پایهٔ «منابع» زیر پاسخ بده. اگر پاسخ در منابع نبود، صریح بگو که نمی‌دانی و کاربر را به صفحهٔ تماس راهنمایی کن. هرگز دربارهٔ شرکت چیزی از خودت نساز.',
      label: { fa: 'قاعدهٔ استناد', en: 'Grounding rule' },
      admin: {
        description: {
          fa: 'مهم‌ترین بخش. جلوی پاسخ‌های ساختگی دربارهٔ شرکت را می‌گیرد.',
          en: 'The critical part. Prevents fabricated claims about the company.',
        },
      },
    },
    {
      name: 'temperature',
      type: 'number',
      defaultValue: 0.6,
      min: 0,
      max: 1.5,
      label: { fa: 'دمای تولید', en: 'Temperature' },
    },
    {
      name: 'topK',
      type: 'number',
      defaultValue: 6,
      min: 1,
      max: 20,
      label: { fa: 'تعداد منابع بازیابی‌شده', en: 'Retrieved chunks' },
    },
    {
      name: 'suggestions',
      type: 'array',
      label: { fa: 'پرسش‌های پیشنهادی', en: 'Suggested questions' },
      admin: {
        description: {
          fa: 'در شروع گفت‌وگو نمایش داده می‌شوند.',
          en: 'Shown as starters at the beginning of a conversation.',
        },
      },
      fields: [{ name: 'question', type: 'text', required: true, label: { fa: 'پرسش', en: 'Question' } }],
    },
  ],
}
