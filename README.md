<div align="right">

# کیهان — وب‌سایت شرکت هوش مصنوعی

وب‌سایتی پویا، فارسی و کاملاً راست‌به‌چپ، با دستیار هوشمند متن‌باز که **تماماً روی زیرساخت
خودتان** اجرا می‌شود. هیچ سرویس ابری خارجی، هیچ کلید API، و هیچ وابستگی‌ای که تحریم بتواند
قطع کند.

</div>

---

> **⚠️ نام تجاری موقت است.** «کیهان / Kayhan AI» یک نام جایگزین است که با فضای طراحی
> هم‌خوانی دارد (کیهان = cosmos). برای تغییر، فقط [`src/config/brand.ts`](src/config/brand.ts)
> را ویرایش کنید؛ هیچ جای دیگری نام شرکت را hardcode نکرده است.

## Overview

A production-grade, Persian-first, RTL company website for an AI-native business.
Every moving part is open source and self-hosted, so the whole product comes up
with one `docker compose up` on hardware you control — and keeps running with no
outbound internet dependency.

| | |
|---|---|
| **Framework** | Next.js 16.2 · React 19.2 · TypeScript (strict) |
| **Styling** | Tailwind CSS v4 (CSS-first, logical properties throughout) |
| **CMS** | Payload 3.87 — runs *inside* the Next app, Persian admin, RTL out of the box |
| **Database** | Postgres 17 + pgvector + pg_trgm |
| **LLM** | Qwen3-14B on vLLM (Apache 2.0) — swappable via one env var |
| **Embeddings** | [MCINext/Hakim](https://huggingface.co/MCINext/Hakim) — Persian-specific, tops the FaMTEB benchmark |
| **Storage** | MinIO (S3-compatible) |
| **Edge** | Caddy (automatic TLS) |

## What makes it different

### کیهان — a persistent, interactive cosmos

The background is a single WebGL2 scene mounted **once** in the root layout,
outside the page slot. Navigating never rebuilds the context: routes retarget
the camera, so moving through the site is one continuous shot rather than a
sequence of page loads.

It is interactive — pointer parallax, a cursor gravity well that parts the
particles, click ripples that propagate outward — and it responds to scroll via
a single `--journey` variable that the CSS blooms and the GPU scene both read,
so they can never drift apart.

### «حلقهٔ گره» — the Girih Torus

The ring at the centre is not a generic particle torus. Its ~40,000 points trace
a periodic Persian **شمسه** (ten-pointed star rosette) lattice wrapped on a
torus, then displaced by three-octave turbulence into a living plasma ring. From
a distance it reads as a glowing ring; up close it resolves into Persian
ornament.

![The Girih Torus](public/cosmos-preview.png)

That image is generated from the real geometry by
[`scripts/preview-cosmos.ts`](scripts/preview-cosmos.ts), which also emits the
static fallback served to visitors without WebGL2 — so the fallback can never
drift from the live scene.

### Design system — «از آتش تا فیروزه» (Ember → Firouzeh)

Colour is budgeted **60 : 30 : 10** — 60% unlit void, 30% desaturated structure,
10% signal. Ember and firouzeh are the two poles of Persian miniature and
tilework, which is why the palette is culturally rooted rather than borrowed.
Full rationale in [`docs/DESIGN.md`](docs/DESIGN.md).

### RTL is structural, not a patch

`dir="rtl"`, logical properties only (`ms-`, `pe-`, `start-`), Persian digits and
Jalali dates via native `Intl` (zero date dependencies), and Persian slugs kept
in URLs rather than transliterated.

## Quick start

```bash
cp .env.example .env
```

Fill in `.env`, then generate a secret:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Start the infrastructure (Postgres, MinIO — no GPU needed):

```bash
docker compose up -d db storage storage-init
```

Install and run:

```bash
pnpm install && pnpm dev
```

Open <http://localhost:3000> for the site and <http://localhost:3000/admin> to
create the first admin user.

### With the AI services

Requires an NVIDIA GPU with 24GB+ VRAM and the container toolkit:

```bash
docker compose --profile ai up -d
```

First start downloads model weights into `./models` (gitignored) and takes a
while. The site works fine without this — the assistant reports itself
unavailable rather than erroring, and every other feature is unaffected.

### Applying the non-Payload schema

`docker/initdb/*.sql` runs automatically only on a *fresh* Postgres volume. For
an existing database:

```bash
pnpm db:setup
```

## Scripts

| Command | Purpose |
|---|---|
| `pnpm dev` | Development server |
| `pnpm build` / `pnpm start` | Production build and serve |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm lint` | ESLint, including the RTL logical-property rule |
| `pnpm db:setup` | Apply extensions + app tables to an existing database |
| `pnpm verify:girih` | Numerically verify the torus geometry |
| `pnpm cosmos:preview` | Re-render the hero preview and static fallback |
| `pnpm migrate:create` | Generate a Payload migration |

## Architecture

```
Caddy (TLS) ──▶ Next.js 16 ──┬──▶ Postgres 17 + pgvector
                             ├──▶ vLLM        (OpenAI-compatible :8000)
                             ├──▶ Hakim       (embeddings :8080)
                             └──▶ MinIO       (S3 :9000)
```

Full detail, including the data model and the RAG pipeline, in
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

### Swapping the model

The app only ever talks to an OpenAI-compatible endpoint, so the model is a
deployment decision:

```bash
AI_BASE_URL=http://llm:8000/v1
AI_MODEL=Qwen/Qwen3-14B-AWQ
```

Point these anywhere — llama.cpp, Ollama, or a hosted provider — with no code
change.

## Privacy

Personalization and assistant memory are **opt-in**. Until a member consents,
no behavioural events are recorded and no memories are stored or injected into
chat context; consent is enforced server-side, not left to the client. `DNT: 1`
is honoured. Members can delete individual memories or their whole account.

## Licence

Source is MIT. Note that fonts (Vazirmatn, Onest — SIL OFL) and models (Qwen3
Apache-2.0, Hakim) carry their own licences.
