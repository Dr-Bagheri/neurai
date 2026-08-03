/**
 * Single source of truth for brand identity.
 *
 * NEURAI is a coined Latin-alphabet name, so it stays in Latin even inside
 * Persian copy — the same convention most Iranian technology companies use for
 * invented names. It is rendered with the Latin face (Onest) and wrapped in
 * `<bdi class="latin">` wherever it sits inside a Persian sentence, so the
 * bidirectional algorithm can't reorder it against neighbouring punctuation.
 *
 * If you'd rather it appear as a Persian transliteration, set `nameFa` to that
 * form and everything follows — it is read from here and nowhere else.
 */

export const brand = {
  /** Displayed in Persian UI. Latin by design — see note above. */
  nameFa: 'NEURAI',
  /** Latin name, for `lang="en"` contexts, OG tags, and the repo. */
  nameEn: 'NEURAI',
  /** True when the display name is Latin script and needs bidi isolation. */
  nameIsLatin: true,

  /** One line, under ~60 chars — used in the hero and the <title> suffix. */
  taglineFa: 'هوش مصنوعی، از پایه تا افق',
  taglineEn: 'AI, from foundation to horizon',

  /** Two sentences max — meta description and OG description. */
  descriptionFa:
    'NEURAI یک شرکت هوش مصنوعی‌بنیاد است. سامانه‌هایی می‌سازیم که در تقاطع داده، انرژی و هوش قرار می‌گیرند.',

  // TODO: replace with real contact details before launch.
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
