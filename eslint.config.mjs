import coreWebVitals from 'eslint-config-next/core-web-vitals'
import typescriptConfig from 'eslint-config-next/typescript'

/**
 * The RTL rule below is the important one.
 *
 * This site is Persian-first and right-to-left. Physical direction utilities
 * (`ml-4`, `text-left`, `left-0`) silently produce a mirrored layout: nothing
 * errors, it just looks subtly wrong to a Persian reader and perfectly correct
 * to anyone reviewing it in English. Logical properties (`ms-4`, `text-start`,
 * `start-0`) follow the document direction and are the only correct choice.
 *
 * Enforcing this in the linter rather than in review is deliberate — it is
 * exactly the class of mistake that stays invisible until a native reader sees
 * it, by which point it is everywhere.
 */
const RTL_PATTERN = String.raw`(^|[\s"'\`{])-?(ml|mr|pl|pr|border-l|border-r|rounded-l|rounded-r)-|(^|[\s"'\`{])text-(left|right)($|[\s"'\`}])`

const config = [
  ...coreWebVitals,
  ...typescriptConfig,
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'src/payload-types.ts',
      'src/app/(payload)/**',
      'public/**',
    ],
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: `Literal[value=/${RTL_PATTERN}/]`,
          message:
            'RTL: use logical properties — ms-/me- not ml-/mr-, ps-/pe- not pl-/pr-, text-start/text-end not text-left/text-right. Physical directions silently mirror on this site.',
        },
        {
          selector: `TemplateElement[value.raw=/${RTL_PATTERN}/]`,
          message: 'RTL: use logical properties, not physical ones. See the rule above.',
        },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // Shaders and the offline renderer use `left`/`right` mathematically, not
    // as layout directions.
    files: ['src/components/cosmos/**'],
    rules: { 'no-restricted-syntax': 'off' },
  },
]

export default config
