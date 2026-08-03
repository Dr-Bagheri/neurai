import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/* ── Persian formatting ──────────────────────────────────────────────────────
   All of this is native Intl. Persian digits and the Jalali calendar are built
   into the platform, so there is no date library in this project at all —
   `Intl.DateTimeFormat('fa-IR-u-ca-persian')` is both correct and free.
   ────────────────────────────────────────────────────────────────────────── */

const PERSIAN_LOCALE = 'fa-IR'
const JALALI_LOCALE = 'fa-IR-u-ca-persian'

/** 1402 → «۱۴۰۲». Numbers in Persian UI should always be Persian-numeraled. */
export function faNumber(value: number, options?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(PERSIAN_LOCALE, options).format(value)
}

/** Full Jalali date: «۱۴ مرداد ۱۴۰۴». */
export function faDate(date: Date | string): string {
  const value = typeof date === 'string' ? new Date(date) : date
  if (Number.isNaN(value.getTime())) return ''
  return new Intl.DateTimeFormat(JALALI_LOCALE, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(value)
}

/** Machine-readable ISO date for <time dateTime>, kept Gregorian on purpose. */
export function isoDate(date: Date | string): string {
  const value = typeof date === 'string' ? new Date(date) : date
  return Number.isNaN(value.getTime()) ? '' : value.toISOString()
}

/** «۳ دقیقه مطالعه» */
export function faReadingTime(minutes: number): string {
  return `${faNumber(Math.max(1, Math.round(minutes)))} دقیقه مطالعه`
}

/** Relative time in Persian: «۳ روز پیش». */
export function faRelative(date: Date | string): string {
  const value = typeof date === 'string' ? new Date(date) : date
  if (Number.isNaN(value.getTime())) return ''

  const seconds = (value.getTime() - Date.now()) / 1000
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['year', 31_536_000],
    ['month', 2_592_000],
    ['day', 86_400],
    ['hour', 3600],
    ['minute', 60],
  ]

  const formatter = new Intl.RelativeTimeFormat(PERSIAN_LOCALE, { numeric: 'auto' })
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) {
      return formatter.format(Math.round(seconds / size), unit)
    }
  }
  return formatter.format(Math.round(seconds), 'second')
}

/**
 * Slugify while *keeping* Persian characters.
 *
 * Transliterating Persian titles to Latin produces unreadable slugs and hurts
 * search; Persian URLs are well supported and display decoded in every modern
 * browser. We only normalise the characters that have multiple Unicode forms —
 * Arabic yeh/kaf vs Persian yeh/kaf — because those silently produce two
 * different slugs for what an author sees as the same word.
 */
export function faSlug(input: string): string {
  return input
    .trim()
    .replace(/ي/g, 'ی') // Arabic yeh → Persian yeh
    .replace(/ك/g, 'ک') // Arabic kaf → Persian keheh
    .replace(/[ً-ْ]/g, '') // strip harakat/diacritics
    .replace(/[‌‏‎]/g, '-') // ZWNJ and bidi marks → hyphen
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
}
