/**
 * Single source of truth for brand identity.
 *
 * ⚠️  PLACEHOLDER — «کیهان / Kayhan AI» is a stand-in chosen to fit the cosmic
 *     design direction (کیهان = "cosmos"). Replace the values below with the
 *     real company details; nothing else in the codebase hardcodes them.
 */

export const brand = {
  /** Persian name, as it appears in the UI. */
  nameFa: 'کیهان',
  /** Latin name, for `lang="en"` contexts, OG tags, and the repo. */
  nameEn: 'Kayhan AI',
  /** One line, under ~60 chars — used in the hero and the <title> suffix. */
  taglineFa: 'هوش مصنوعی، از پایه تا افق',
  taglineEn: 'AI, from foundation to horizon',
  /** Two sentences max — meta description and OG description. */
  descriptionFa:
    'کیهان یک شرکت هوش مصنوعی‌بنیاد است. سامانه‌هایی می‌سازیم که در تقاطع داده، انرژی و هوش قرار می‌گیرند.',

  email: 'hello@example.com',
  phone: '',
  addressFa: '',

  social: {
    linkedin: '',
    github: '',
    x: '',
    telegram: '',
  },

  /** Feeds JSON-LD `Organization` and the OG image. */
  foundingYear: 1403, // Jalali
  locale: 'fa-IR',
  direction: 'rtl',
} as const

export type Brand = typeof brand
