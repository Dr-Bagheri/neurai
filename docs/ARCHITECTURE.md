# معماری وب‌سایت شرکت — AI-Native, Persian, RTL, Self-Hosted

## Context

You need a public website for an AI-native company, in Persian with true RTL layout and a
design that doesn't look like a template. It must be *dynamic* — content editable without
code, and it must **interact with each visitor**: accounts, a Persian AI assistant grounded
in your own content, and memory that persists across sessions.

The decisive constraint, established during planning: **the host will be inside Iran, and
the stack must be fully open-source and runnable offline.** No SaaS dependency that
sanctions can sever — no Vercel, no Neon, no OpenAI, no DeepSeek API, no Google Fonts.
Every moving part is a container you own. Marginal inference cost is therefore zero, which
also resolves the original "cheaper API" goal more completely than any paid tier would.

Outcome: one `docker compose up` brings up the entire product — site, CMS, database, LLM,
embeddings, object storage, TLS — on your own hardware, and the same compose file is the
production deploy.

---

## Decisions locked in planning

| Area | Choice | Why |
|---|---|---|
| Framework | Next.js **16.2** + React 19.2 + TypeScript | Payload 3.87 peer-requires `next >=16.2.6 <17`. Next 15.5+ is *not* in its supported range. |
| Styling | Tailwind CSS **v4.3** (CSS-first config) | Logical properties (`ms-`, `pe-`, `start-`) make RTL structural, not a patch. |
| Components | **shadcn/ui** (Radix primitives, copied in) | Accessible, unstyled base — we layer our design tokens on top instead of building primitives from scratch. |
| CMS | **Payload 3.87** + `@payloadcms/db-postgres` | Runs *inside* the Next app. Ships a Persian (`fa`) admin translation and auto-sets `dir="rtl"` via `getLanguageDir` — the admin is RTL out of the box. |
| Database | **Postgres 17 + pgvector** | One database for content, users, and vectors. |
| Auth | **Payload native auth** on a `members` collection | `auth: true` on any collection; httpOnly cookies, email verification, password reset, lockout — all built in. No `better-auth`, one less dependency. |
| LLM | **Qwen3-14B** (or `Qwen3-30B-A3B` MoE) on **vLLM** | Apache 2.0, 100+ languages incl. strong Persian, fits 24GB VRAM with AWQ/FP8, real concurrent batching. |
| Embeddings | **Hakim** (MCINext), Persian-specific | Beats multilingual-e5 / BGE-m3 / Jina on the FaMTEB Persian benchmark by ~8.5%. `Hakim-small` if VRAM is tight. |
| AI plumbing | Vercel **AI SDK v7** + `@ai-sdk/openai-compatible` | vLLM exposes an OpenAI-compatible endpoint, so the provider is one env var. |
| Media | **MinIO** + `@payloadcms/storage-s3` | S3 API, self-hosted. |
| Design | **Girih** — Persian geometric lattice | See design system below. |
| Repo | New **public** repo under `Dr-Bagheri` | `gh` is already authenticated. |

**Deliberate consequence of the offline constraint:** the AI assistant is only as good as
the hardware behind it. Qwen3-14B on a 24GB card is genuinely capable in Persian but is not
frontier-class. The gateway is provider-agnostic, so if you later want to point at a hosted
frontier model you change `AI_BASE_URL` and `AI_MODEL` — no code changes.

---

## System architecture

```
                         ┌──────────── Caddy (TLS, reverse proxy) ────────────┐
                         │                                                    │
   Visitor ──HTTPS──────▶│  /            → Next.js 16 (RSC, streaming)        │
                         │  /admin       → Payload admin (fa, dir=rtl)        │
                         │  /api/*       → Payload REST + custom routes       │
                         └───────────────────────┬────────────────────────────┘
                                                 │
        ┌────────────────────────────────────────┼────────────────────────────────┐
        │                                        │                                │
        ▼                                        ▼                                ▼
┌───────────────┐                    ┌────────────────────┐            ┌──────────────────┐
│ Postgres 17   │                    │  vLLM  (OpenAI-    │            │ Hakim embeddings │
│ + pgvector    │◀── retrieval ──────│  compatible :8000) │            │  (TEI :8080)     │
│               │                    │  Qwen3-14B-AWQ     │            │  Persian vectors │
│ content       │                    └────────────────────┘            └────────┬─────────┘
│ members       │                                                                │
│ interactions  │◀───────────────── embed on publish ─────────────────────────────┘
│ memories      │
│ content_chunks│  vector(768)  HNSW index
└───────┬───────┘
        │
        ▼
┌───────────────┐
│ MinIO (S3)    │  media, CV uploads
└───────────────┘
```

All six services are defined in one `docker-compose.yml`. `vllm` and `embeddings` sit in a
`gpu` profile so a laptop can run the site without them.

---

## Data model

**Payload collections** (`src/collections/`)

- `Users` — staff/admin. Payload's default auth collection.
- `Members` — site visitors. `auth: true`, `verify: true`, `maxLoginAttempts: 5`.
  Fields: `name`, `email`, `interests[]`, `locale`, `consentAnalytics`.
- `Posts` — blog/insights. `title`, `slug` (Persian-safe), `excerpt`, `content` (Lexical
  rich text, RTL), `coverImage`, `category`, `tags[]`, `author`, `publishedAt`,
  `readingTime` (computed), `seo` group. Drafts + versions + live preview enabled.
- `Categories`, `Tags`, `Authors`
- `Media` — S3-backed, with `alt` required for a11y.
- `Pages` — flexible-layout pages built from blocks (Hero, GirihFeature, Stats, CTA,
  RichText, Logos, FAQ) so marketing pages are editable without deploys.

**Globals** — `SiteSettings` (brand, nav, footer, social), `AIAssistant` (system prompt in
Persian, temperature, top-k, refusal rules — tunable from the admin without a deploy).

**Raw tables** (drizzle migrations, outside Payload)

- `content_chunks(id, source_type, source_id, chunk_index, text, embedding vector(768))`
  — HNSW index, cosine distance.
- `member_memories(id, member_id, kind, fact, salience, embedding, created_at)`
  — AI-extracted durable facts about each member.
- `member_events(id, member_id|anon_id, type, path, meta jsonb, created_at)`
  — reading/interaction signal, feeds recommendations.
- `rate_limits(key, window_start, count)` — Postgres token bucket, avoids a Redis service.

---

## The interaction layer (what makes it "interact with each user")

1. **Signal capture** — a lightweight RSC-friendly beacon writes `member_events`
   (article read, scroll depth, chat topic). Anonymous visitors get a first-party
   `anon_id` cookie; on signup the events are back-linked to the member.
2. **Interest vector** — a nightly job (and an on-login refresh) averages the embeddings of
   what a member actually read into a single interest vector on `Members`.
3. **Recommendations** — `/dashboard` and the home page rank `Posts` by cosine similarity
   against that interest vector. Cold start falls back to recency + editorial pinning.
4. **Assistant memory** — after each chat, a cheap extraction pass pulls durable facts
   ("works in fintech", "asked about on-prem deployment") into `member_memories`. The next
   conversation injects the top-N by salience into the system prompt. This is what makes it
   feel like it *knows* them rather than restarting every time.
5. **Adaptive home** — section order and CTA copy shift based on interest cluster.
   Server-rendered, so no layout flash.

**Privacy:** memory is opt-in at signup, visible at `/dashboard/privacy`, and each fact is
individually deletable. Anonymous tracking is consent-gated. This is not optional polish —
it's the difference between personalization and surveillance.

---

## RAG pipeline

- Payload `afterChange` hook on `Posts`/`Pages` → chunk (~500 tokens, 15% overlap,
  heading-aware) → POST to the Hakim service → upsert `content_chunks`. Deletes cascade.
- `/api/chat` (Edge-incompatible, Node runtime):
  1. Rate-limit by member/IP against `rate_limits`.
  2. Embed the question with Hakim.
  3. **Hybrid retrieval** — pgvector cosine top-k *unioned* with Postgres full-text, then
     reciprocal-rank fused. Persian morphology is rough for FTS alone and vectors alone miss
     exact product names; the union covers both.
  4. Build a Persian system prompt: site persona + retrieved chunks + member memories.
  5. Stream via AI SDK v7 `streamText` → vLLM. Citations rendered as links back to sources.
  6. Persist the turn; queue memory extraction.
- **Grounding rule** baked into the prompt: if retrieval returns nothing relevant, the
  assistant says so in Persian and offers the contact form. No hallucinated company facts.

---

## Design system — «از آتش تا فیروزه» / Ember→Firouzeh

**Reference:** the getlayers.ai **"New Era"** template, which you picked. I analysed its
preview render pixel-by-pixel rather than guessing at it. What actually defines it:

- **~47% pure black.** Not dark grey — black. The drama comes from how little is lit.
- **A vertical chromatic journey.** The page migrates top→bottom through three acts:
  warm **ember** across the hero (`#A54735`, `#984134`, `#A04840`) with a hot cream
  highlight (`#EED7B3`) → neutral graphite mid-page (`#1B191D`–`#333134`) → deep **indigo**
  (`#1A264D`, `#1C2C58`) → an electric blue closing band (`#3556A0`, `#374D94`) lit by an
  icy **cyan** source (`#9ADAED`, `#AEEAF5`).
- **Two light sources, never more.** One warm, one cool, each anchored off-canvas, bleeding
  large soft radial blooms into an otherwise unlit page.

> **Licensing, stated plainly:** "New Era" is a paid product (~$199). I am **not** copying
> their prompt, source, or layouts — I don't have them and reproducing them would be a
> licensing problem. I'm using the *visual direction* as reference and building an original
> implementation. If you want their literal template, buy the license and I'll integrate it.

**Why this direction is the right one for you, not just a nice-looking pick:** ember→lapis
*is* the Persian palette. Saffron/ember (زعفران) and lapis/turquoise (لاجورد، فیروزه) are
the two poles of Persian miniature and tilework. The template's chromatic journey and your
cultural identity are the same two colours. So we keep girih geometry as the structural
motif — girih *is* an algorithm (decagonal symmetry from five tiles), an honest argument for
an AI company — and light it with New Era's two-source cinematic lighting. That combination
is unmistakably yours and exists nowhere else.

### Color — strict 60 : 30 : 10

| Share | Role | Tokens |
|---|---|---|
| **60%** | **Void** — canvas, negative space, the unlit majority | `--void-1000 #000000`, `--void-950 #050408`, `--void-900 #0A0810` |
| **30%** | **Structure** — glass surfaces, hairlines, all body text | `--glass-1 rgba(255,255,255,.035)`, `--glass-2 rgba(255,255,255,.055)`, `--hairline rgba(255,255,255,.08)`, `--text-100 #E9E4DC` (warm off-white), `--text-300 #9A94A0`, `--graphite-700 #333134` |
| **10%** | **Signal** — the only saturated pixels, split across two poles | **Ember:** `--ember-600 #A54735`, `--ember-400 #E8874F`, `--ember-100 #EED7B3` · **Firouzeh:** `--lapis-700 #1C2C58`, `--lapis-400 #3556A0`, `--cyan-300 #9ADAED` |

**Discipline that keeps 60:30:10 real:**

- **Ember is ambient only** — radial hero lighting, never text/fill/border. It sets mood.
- **Cyan `#6FD3E8` is the single interactive accent** — links, focus rings, active nav,
  primary CTA, chat send, citation markers. One interactive colour, no exceptions.
- Everything else is void or structure. Nothing else may be saturated.

The ratio is **enforced, not aspirational**: `pnpm check:ratio` rasterises `/`, `/blog`,
and a post page at 1440px, classifies every pixel into void/structure/signal by
luminance+saturation, and fails CI outside 60±8 / 30±8 / 10±4. Without a gate, accent creep
turns any dark theme into soup within a month.

Light mode is a genuine re-composition, not a filter: `--paper-50 #F7F6F3` at 60%, graphite
at 30%, and the ember/lapis pair darkened to `#8A3526` / `#22407A` at 10% for AA contrast.

### The scroll journey (the signature move)

One CSS custom property `--journey` (0→1) is driven by scroll progress on a rAF-throttled
listener. Every ambient bloom in the page interpolates its hue and position from it:
ember-dominant at `0`, lapis/cyan-dominant at `1`. Sections don't each get their own
background — the whole page is one continuous lit environment you travel through. That
single idea is what made "New Era" read as cinematic, and it costs almost nothing to run.

At `prefers-reduced-motion: reduce`, `--journey` snaps to per-section discrete values
instead of interpolating — the palette still shifts, nothing moves.

### The hero — «حلقهٔ گره» / the Girih Torus

The centrepiece, and the thing the whole design hangs on. From the reference screenshot,
New Era's hero is a single **glowing particle torus** filling the viewport, with content
composed *inside* the ring. We build our own version of that object, structured by girih.

**The object:** a WebGL2 (Three.js) particle torus, ~40–60k points, where the particles are
not random — they trace **girih strapwork paths** from the five canonical tiles, wrapped
around the torus surface. Read casually it's a beautiful glowing ring; looked at closely,
it's Persian geometry. Additive blending, soft bloom post-process, slow rotation plus a
gentle noise displacement so the ring breathes.

**The colour:** hue is a function of **angle around the circumference**, not of time —
`--ember-400 #E8874F` at 12 o'clock, through a magenta crossover on the flanks, into
`--lapis-400 #3556A0` and `--cyan-300 #9ADAED` at 6 o'clock. This is where the bulk of the
page's 10% signal budget is spent, concentrated in one object against pure black.

**Content composed inside the ring** (all centred, RTL):
- Glass pill badge — `--glass-2`, hairline border, small icon, e.g. «به عصر تازه خوش آمدید».
- Oversized headline, **light weight** (Estedad 200–300), tight leading, in `--text-100`,
  with the trailing clause dropped to `--text-300` — a two-tone emphasis that carries the
  sentence's rhythm. Reads beautifully in Persian, where the verb lands last.
- Two lines of muted subcopy in `--text-300`.
- Two pill buttons: primary in `--glass-2` with a circular arrow badge (mirrored for RTL),
  secondary ghost with hairline border only.

**Performance budget — non-negotiable, this is the whole risk of the design.** Particle
count and bloom scale down by device tier (`deviceMemory`, `hardwareConcurrency`, DPR).
Mobile gets ~12k particles and no post-processing. The Three.js bundle is dynamically
imported below the fold of the critical path so LCP is the headline text, never the canvas.
On WebGL2 failure or `save-data`, a **pre-rendered static WebP of the torus** is served
instead — and the hero must look finished that way, not broken.

`prefers-reduced-motion: reduce` → one static frame, no rAF loop. Off-screen →
`IntersectionObserver` pauses it. `aria-hidden` throughout; the ring never carries meaning.

### Supporting surfaces

- **Girih glass** — cards are `--glass-1` over a blurred backdrop with a 1px `--hairline`
  border and girih strapwork etched at ~3% opacity in the corner. Elevation from layered
  inset hairlines, never drop shadows.
- **Ambient blooms** — below the hero, two large low-alpha radial gradients per section,
  anchored off-canvas, driven by `--journey` so the ember→firouzeh migration continues down
  the page. The torus states the idea; the rest of the page echoes it quietly.
- **Two-tone headings** — the `--text-100` / `--text-300` split used in the hero becomes the
  standard h2 treatment site-wide.

No autoplaying video backdrops. getlayers.ai's own site ships 8; on Iranian mobile bandwidth
that's a wall. WebGL + CSS gradients give the same cinematic depth at a fraction of the
payload.

### Typography — all self-hosted `woff2`, no CDN

Google Fonts is blocked/unreliable from Iran and is exactly the external dependency we
rejected. Everything ships in `public/fonts/`.

- **Display (fa):** Estedad — geometric, modern, wide weight range. Tight tracking, large.
- **Text/UI (fa):** Vazirmatn Variable — one file, all weights.
- **Latin & numerals:** Onest (SIL OFL) — the geometric grotesque getlayers.ai uses; pairs
  cleanly with Estedad's geometry.
- Persian digits via `Intl.NumberFormat('fa-IR')`; Jalali dates via `date-fns-jalali`.
  Latin strings and code stay LTR inside `<bdi>`.

### RTL rules (enforced, not aspirational)

- `<html lang="fa" dir="rtl">`.
- **Zero** physical direction utilities. An ESLint rule bans `ml-`, `mr-`, `pl-`, `pr-`,
  `left-`, `right-`, `text-left`, `text-right` in `src/**`. Logical properties only.
- Direction-implying icons (arrows, chevrons) flip via `.flip-rtl`.
- The girih lattice and all bloom anchors mirror with `dir`, so the composition's visual
  weight follows Persian reading gravity (right → left) rather than being a flipped LTR
  layout.
- Persian slugs allowed in URLs; encoded on output, decoded for display.

**RTL rules** (enforced, not aspirational)

- `<html lang="fa" dir="rtl">`.
- **Zero** physical direction utilities. An ESLint rule bans `ml-`, `mr-`, `pl-`, `pr-`,
  `left-`, `right-`, `text-left`, `text-right` in `src/**`. Logical only.
- Icons that imply direction (arrows, chevrons) flip via a `.flip-rtl` class.
- Persian slugs allowed in URLs; encoded on output, decoded for display.

---

## Repository layout

```
site/
├─ docker-compose.yml            # web, db, vllm, embeddings, minio, caddy
├─ docker-compose.gpu.yml        # GPU profile overlay
├─ Dockerfile                    # multi-stage, standalone Next output
├─ Caddyfile
├─ .env.example                  # every var documented; .env is gitignored
├─ services/embeddings/          # Hakim FastAPI wrapper + Dockerfile
├─ docs/ARCHITECTURE.md          # this document, expanded
├─ docs/DEPLOY.md                # Iran-host runbook
└─ src/
   ├─ app/(site)/                # public routes, RTL shell
   ├─ app/(auth)/                # login, signup, verify, reset
   ├─ app/(member)/dashboard/    # personalized area
   ├─ app/(payload)/admin/       # Payload admin
   ├─ app/api/chat/route.ts
   ├─ collections/ · globals/ · blocks/
   ├─ components/ui/             # shadcn primitives
   ├─ components/girih/          # torus (three.js), tile geometry, strapwork paths
   ├─ lib/ai/                    # provider gateway, retrieval, memory
   ├─ lib/personalization/
   ├─ config/brand.ts            # ⚠ company name, tagline, contact — single source
   └─ styles/
```

---

## Build phases

1. **Scaffold & infra** — Next 16 + TS strict + Tailwind v4, `docker-compose.yml`,
   Postgres+pgvector, MinIO, Caddy. Verify `docker compose up` and an empty page renders.
2. **Design system** — tokens, self-hosted fonts (Estedad/Vazirmatn/Onest), shadcn init,
   RTL ESLint rule, `--journey` scroll driver, light/dark, `check:ratio` gate. A
   `/styleguide` route renders every token, component, and both palette poles.
3. **Girih Torus** — Three.js particle torus with girih-path point generation, angular
   colour ramp, bloom, device tiering, static WebP fallback, reduced-motion path. Built and
   perf-tuned in isolation on `/styleguide/torus` before it touches the home page, because
   it's the one component that can sink the page's performance.
4. **Payload + content model** — collections, globals, blocks, S3 storage, Persian admin,
   first migration, seed script with realistic Persian sample content.
5. **Public site** — home (torus hero + adaptive sections), about, services, blog
   index/post/category/tag, contact. SEO metadata, OG images, `sitemap.xml`, `rss.xml`,
   JSON-LD.
6. **Auth & member area** — signup/verify/login/reset on Payload auth, `/dashboard`,
   profile, saved posts, privacy controls.
7. **AI services** — vLLM + Hakim containers, provider gateway, embedding-on-publish hook,
   hybrid retrieval, `/api/chat` streaming, Persian chat UI with citations.
8. **Personalization** — event beacon, interest vectors, recommendations, memory
   extraction + injection, adaptive home ordering.
9. **Hardening & ship** — rate limiting, security headers/CSP, a11y pass, Lighthouse,
   `README.md` (Persian + English), `docs/`, GitHub Actions CI (typecheck, lint, build),
   create public repo, push `main`.

---

## Verification

- `docker compose up -d` → all services healthy; `docker compose --profile gpu up` adds
  vLLM + Hakim.
- `pnpm typecheck && pnpm lint && pnpm build` clean. The RTL lint rule must fail on a
  deliberately added `ml-4`.
- `/styleguide` renders correctly in RTL, light and dark, at 375 / 768 / 1440 widths, and
  with `prefers-reduced-motion: reduce` (the torus must go static, not disappear).
- `pnpm check:ratio` passes on `/`, `/blog`, and a post page — the 60:30:10 gate.
- Torus specifically: 60fps at 1440p on desktop; ≤12k particles and no post-processing on a
  throttled mobile profile; forcing WebGL2 off still yields a finished-looking hero via the
  static WebP; LCP element is the headline text, not the canvas.
- `/admin` loads in Persian with `dir="rtl"`; create and publish a post; confirm rows land
  in `content_chunks` with non-null embeddings.
- Ask the assistant a Persian question answerable only from that post → correct answer with
  a citation. Ask something unrelated → explicit "I don't know" in Persian, no fabrication.
- Sign up → verification email → login → read three posts → `/dashboard` recommendations
  reflect them. Delete a memory and confirm it stops appearing in chat context.
- Lighthouse ≥ 90 on Performance / Accessibility / SEO for `/` and a post page.
- `git push` succeeds and `.env` is absent from the repo (`git log -p` grep for secrets).

---

## Required input before Phase 3

`src/config/brand.ts` needs the **company name (Persian + Latin), one-line tagline, and
contact email**. Everything else is placeholder-safe — until then I'll build against a
clearly-marked placeholder, and swapping it is a one-file edit. The repo name will follow
from the Latin name unless you specify otherwise.
