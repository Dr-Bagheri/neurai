import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { postgresAdapter } from '@payloadcms/db-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { s3Storage } from '@payloadcms/storage-s3'
import { en } from '@payloadcms/translations/languages/en'
import { fa } from '@payloadcms/translations/languages/fa'
import { buildConfig } from 'payload'
import sharp from 'sharp'

import { Media } from '@/collections/Media'
import { Members } from '@/collections/Members'
import { Posts } from '@/collections/Posts'
import { Categories, Tags } from '@/collections/Taxonomy'
import { Users } from '@/collections/Users'
import { AIAssistant } from '@/globals/AIAssistant'
import { SiteSettings } from '@/globals/SiteSettings'

const dirname = path.dirname(fileURLToPath(import.meta.url))

export default buildConfig({
  admin: {
    user: Users.slug,
    meta: {
      titleSuffix: ' — کیهان',
    },
  },

  // Persian is the default admin language. Payload resolves `dir="rtl"` from
  // its own rtlLanguages list, so the admin panel is right-to-left out of the
  // box — no custom CSS, no patched layout.
  i18n: {
    fallbackLanguage: 'fa',
    supportedLanguages: { fa, en },
  },

  collections: [Posts, Categories, Tags, Media, Users, Members],
  globals: [SiteSettings, AIAssistant],

  editor: lexicalEditor(),

  db: postgresAdapter({
    pool: { connectionString: process.env.DATABASE_URI ?? '' },
    // Always migrations, never implicit push — including in development.
    //
    // Two reasons: schema changes stay reviewable in a diff and behave
    // identically in dev and production; and drizzle's push prompts for
    // confirmation on an interactive TTY, so it hangs forever in a background
    // process or a container. Run `pnpm migrate:create` then `pnpm migrate`.
    push: false,
  }),

  plugins: [
    s3Storage({
      collections: { media: true },
      bucket: process.env.S3_BUCKET ?? 'kayhan-media',
      config: {
        endpoint: process.env.S3_ENDPOINT ?? 'http://localhost:9000',
        region: process.env.S3_REGION ?? 'us-east-1',
        // MinIO serves buckets as a path segment, not a subdomain.
        forcePathStyle: true,
        credentials: {
          accessKeyId: process.env.S3_ACCESS_KEY_ID ?? '',
          secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? '',
        },
      },
    }),
  ],

  // Used for the upload image sizes in the Media collection.
  sharp,

  secret: process.env.PAYLOAD_SECRET ?? '',
  typescript: { outputFile: path.resolve(dirname, 'payload-types.ts') },

  // Persian content is UTF-8 heavy; the default 100kb limit is reached faster
  // than you would expect on long articles with embedded upload references.
  upload: { limits: { fileSize: 10_000_000 } },
})
