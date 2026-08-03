<div align="right">

# نمودارهای معماری — NEURAI

</div>

# Architecture diagrams

Every diagram here describes what is actually in the repository, not an
intended future state. Where something is not yet built it is marked as such.

Diagrams are Mermaid, so they render directly on GitHub.

---

## 1. Deployment topology

The whole product is containers you own. Nothing here depends on a service that
sanctions could sever, which is the constraint the entire stack was chosen
around.

```mermaid
graph TB
    visitor["بازدیدکننده<br/>Visitor"]

    subgraph edge["Edge · profile: edge"]
        caddy["Caddy 2<br/>TLS termination<br/>flush_interval -1 for streaming"]
    end

    subgraph app["Application"]
        next["Next.js 16.2 · React 19.2<br/>RSC + streaming<br/>Payload 3.87 embedded"]
    end

    subgraph data["Data · always on"]
        pg[("PostgreSQL 17<br/>pgvector · pg_trgm · unaccent<br/>ICU locale fa-IR")]
        minio[("MinIO<br/>S3-compatible<br/>media + uploads")]
    end

    subgraph ai["AI · profile: ai · needs NVIDIA 24GB+"]
        vllm["vLLM<br/>Qwen3-14B-AWQ<br/>OpenAI-compatible :8000"]
        hakim["Hakim embeddings<br/>MCINext/Hakim<br/>FastAPI :8080"]
    end

    visitor -->|HTTPS| caddy
    caddy -->|reverse proxy| next

    next -->|"content, members,<br/>vectors, events"| pg
    next -->|"media via S3 API"| minio
    next -.->|"chat completions<br/>streamed"| vllm
    next -.->|"embed query"| hakim
    hakim -.->|"768-dim vectors"| pg

    classDef optional stroke-dasharray: 5 5
    class ai,vllm,hakim optional
```

**Why the `ai` profile is opt-in.** A laptop with no GPU runs the entire site —
CMS, blog, accounts, admin — with `docker compose up -d`. Only the assistant
needs the GPU, and it degrades to an honest "unavailable" message rather than
erroring. `/api/health` reports the AI services but never fails on them, so a
down GPU box can't pull the site out of a load balancer.

---

## 2. Data model

Two distinct halves, deliberately separated.

```mermaid
erDiagram
    USERS ||--o{ POSTS : authors
    POSTS }o--|| CATEGORIES : "belongs to"
    POSTS }o--o{ TAGS : tagged
    POSTS }o--o| MEDIA : "cover image"
    MEMBERS }o--o{ POSTS : saved
    MEMBERS }o--o{ CATEGORIES : interests
    POSTS ||--o{ CONTENT_CHUNKS : "indexed into"
    MEMBERS ||--o{ MEMBER_MEMORIES : remembers
    MEMBERS ||--o{ MEMBER_EVENTS : generates

    USERS {
        int id PK
        string email "auth · admin panel"
        string role "admin | editor"
    }
    MEMBERS {
        int id PK
        string email "auth · public site only"
        bool consentPersonalization "gates ALL of the below"
        date interestVectorUpdatedAt
    }
    POSTS {
        int id PK
        string title
        string slug "Persian characters preserved"
        text excerpt
        json content "Lexical rich text"
        string _status "draft | published"
        int readingTime "computed"
    }
    CONTENT_CHUNKS {
        bigint id PK
        string source_type
        string source_id
        int chunk_index
        text text
        vector embedding "768 · HNSW cosine"
    }
    MEMBER_MEMORIES {
        bigint id PK
        string member_id
        text fact "AI-extracted"
        real salience
        vector embedding
    }
    MEMBER_EVENTS {
        bigint id PK
        string member_id "null when anonymous"
        string anon_id "first-party cookie"
        string type
        jsonb meta
    }
    RATE_LIMITS {
        string key PK "member:id | ip:addr"
        timestamp window_start PK
        int count
    }
```

**Payload owns** `users`, `members`, `posts`, `categories`, `tags`, `media`, and
the two globals. Its schema is generated from collection configs.

**Raw SQL owns** `content_chunks`, `member_memories`, `member_events`, and
`rate_limits`. These stay out of the CMS on purpose: pgvector columns, HNSW
indexes and high-write event tables would clutter the admin UI and fight
Payload's migration generator. They live in `docker/initdb/02-app-tables.sql`
and are applied by `pnpm db:setup`.

---

## 3. Publish → retrieval index

Indexing hangs off the publish lifecycle, so the index is a pure function of
what is currently published. No cron job to drift out of sync, no manual
reindex step for an editor to forget.

```mermaid
flowchart TB
    edit["Editor saves a post<br/>/admin"] --> hook{"afterChange hook"}

    hook -->|"_status = draft"| remove["removeFromIndex()"]
    hook -->|"_status = published"| plain["lexicalToPlainText()<br/>walks the node tree,<br/>keeps heading boundaries"]

    plain --> chunk["chunkText()<br/>~1100 chars, 160 overlap<br/>splits on paragraphs"]
    chunk --> prefix["Prefix each chunk<br/>with the post title"]
    prefix --> embed["POST /embed<br/>Hakim, kind=passage"]
    embed --> txn[["BEGIN<br/>DELETE old chunks<br/>INSERT new + vectors<br/>COMMIT"]]
    txn --> done[("content_chunks")]
    remove --> done

    hook -.->|"on failure"| log["Log and continue.<br/>A failed index must never<br/>block a publish."]

    style txn fill:#1c2c58,stroke:#3556a0,color:#e9e4dc
    style log fill:#7a3226,stroke:#a54735,color:#e9e4dc
```

Two decisions worth knowing:

- **Delete-then-insert in a transaction**, not a diff. Edits reshuffle chunk
  boundaries, so matching old chunks to new is more work than rebuilding — and
  the transaction means retrieval never sees a half-indexed document.
- **Every chunk is prefixed with the post title.** A mid-article chunk that
  never repeats the subject noun is otherwise invisible to search.

---

## 4. The chat request

```mermaid
sequenceDiagram
    autonumber
    participant U as بازدیدکننده
    participant W as ChatWidget
    participant R as /api/chat
    participant P as Payload
    participant DB as Postgres
    participant H as Hakim
    participant L as vLLM

    U->>W: پرسش فارسی
    W->>R: POST { messages }

    R->>R: zod validate · max 24 turns
    R->>P: auth(headers)
    P-->>R: member | anonymous

    R->>DB: checkRateLimit(key, limit)
    Note over R,DB: Atomic UPSERT.<br/>60/h member · 10/h anonymous
    alt over quota
        R-->>W: 429 + retry-after
    end

    par availability probes
        R->>L: GET /models
    and
        R->>H: GET /health
    end
    alt LLM down
        R-->>W: 503 · honest Persian message
    end

    R->>H: embed(question, kind=query)
    H-->>R: vector(768)

    par hybrid retrieval
        R->>DB: ORDER BY embedding <=> query
    and
        R->>DB: word_similarity(query, text)
    end
    R->>R: reciprocal rank fusion<br/>dense ×1.0 · lexical ×0.65

    R->>P: findGlobal(ai-assistant)
    P-->>R: persona · grounding rule · topK

    R->>L: streamText(system + context + messages)
    R-->>W: 200 + x-neurai-sources (base64)
    Note over W: Citations render immediately,<br/>before the body finishes
    L-->>W: token stream
    W-->>U: پاسخ + منابع
```

**Why citations travel in a header.** The client can render source links the
moment the stream opens rather than waiting for the body. Base64 because HTTP
headers are not safe for raw Persian UTF-8.

**Why hybrid retrieval.** Neither arm is sufficient for Persian. Vectors miss
exact tokens — product names, version numbers, Latin acronyms inside Persian
text. Lexical misses paraphrase, and Postgres ships no Persian stemmer, so
"سامانه" and "سامانه‌ها" don't match. RRF fuses them because cosine distance
and trigram similarity aren't on comparable scales, and rank is robust to that.

---

## 5. Privacy: where consent is enforced

Consent is checked **server-side**, not left to the client to honour. A member
who has not opted in is silently ignored and still receives `204`, so the
response can't be used to probe consent state.

```mermaid
flowchart TB
    beacon["ReadTracker beacon<br/>dwell &gt; 20s AND scroll &gt; 55%"] --> dnt{"DNT: 1 ?"}
    dnt -->|yes| drop204["204 · discard"]
    dnt -->|no| who{"Signed in?"}

    who -->|"member"| consent{"consentPersonalization"}
    who -->|"anonymous"| anon["first-party anon_id cookie<br/>httpOnly · 180 days"]

    consent -->|false| drop204
    consent -->|true| write[("member_events")]
    anon --> write

    write --> vector["interest vector<br/>NOT YET BUILT"]
    vector --> recs["recommendations<br/>NOT YET BUILT"]

    write --> memory["memory extraction<br/>NOT YET BUILT"]
    memory --> mem[("member_memories")]
    mem --> inject["injected into chat system prompt"]
    mem --> del["member deletes a fact<br/>/dashboard/privacy · NOT YET BUILT"]

    style drop204 fill:#333134,stroke:#6b6672,color:#e9e4dc
    style vector stroke-dasharray: 5 5
    style recs stroke-dasharray: 5 5
    style memory stroke-dasharray: 5 5
    style del stroke-dasharray: 5 5
```

Dashed nodes are **not implemented yet**. The capture side and the schema exist;
the consumption side does not.

---

## 6. The cosmos: one scene, three formations

The background is a single WebGL2 scene mounted **once** in the root layout,
outside the page slot. Navigation retargets the camera instead of rebuilding the
context, which is what makes moving through the site read as one continuous shot
rather than a sequence of page loads.

Five layers, drawn back to front: nebula → galaxy → star shells → girih ring.

```mermaid
flowchart LR
    subgraph build["Build once, on boot"]
        girih["buildGirihTorus()<br/>ten-pointed shamseh lattice<br/>wrapped on a torus"]
        forms["buildFormations()<br/>column + terrain targets<br/>from the same u,v,seed"]
        gal["buildGalaxy()<br/>polar coords: radius, angle, height<br/>4 logarithmic arms + bulge"]
        girih --> forms
    end

    gal --> galshader["Galaxy vertex shader<br/>angle += time · spin / (radius + k)<br/>differential rotation"]

    subgraph gpu["Vertex shader · every frame"]
        blend["pos = ring·w0 + column·w1 + terrain·w2<br/>weights always sum to 1"]
        turb["3-octave fbm turbulence<br/>displaced along the tube normal"]
        blend --> turb
    end

    forms --> blend
    scroll["--journey<br/>0 → 1"] --> weights["formationWeights()"]
    weights --> blend
    scroll --> css["CSS bloom layers<br/>same variable"]

    turb --> frag["Fragment shader<br/>hue = dot(pos, colourAxis)<br/>axis rotates with formation"]
```

Formation handover across the scroll, from `FORMATION_SCHEDULE` in
`src/components/cosmos/engine.ts`:

```mermaid
stateDiagram-v2
    direction LR

    [*] --> Ring

    Ring: Ring · حلقه
    Ring: scroll 0 – 26%
    Ring: girih torus, spinning, full turbulence

    RingToColumn: cross-fade
    RingToColumn: 26 – 42%
    RingToColumn: smoothstep, rotation winds down

    Column: Column · ستون
    Column: 42 – 60%
    Column: vertical plume, turbulence ×0.55

    ColumnToTerrain: cross-fade
    ColumnToTerrain: 60 – 78%
    ColumnToTerrain: camera lifts and pitches down

    Terrain: Terrain · چشم‌انداز
    Terrain: 78 – 100%
    Terrain: wave landscape, no rotation, turbulence ×0.3

    Ring --> RingToColumn
    RingToColumn --> Column
    Column --> ColumnToTerrain
    ColumnToTerrain --> Terrain
    Terrain --> [*]
```

| Scroll | ring | column | terrain | Colour axis |
|---|---|---|---|---|
| 0 – 26% | 1.00 | 0.00 | 0.00 | diagonal `(0.42, 1)` |
| 42 – 60% | 0.00 | 1.00 | 0.00 | vertical `(0.15, 1)` |
| 78 – 100% | 0.00 | 0.00 | 1.00 | horizontal `(1, 0.12)` |

The plateaus matter as much as the transitions. A formation needs a stretch
where it is simply itself and the reader can look at it — without them the page
reads as one continuous unresolved morph.

**Why one particle buffer instead of three systems.** Each point's destination
in every formation derives from the same `(ringAngle, tubeAngle, seed)` triple,
so neighbours stay neighbours through the morph — the ring visibly unravels into
the column. Cross-fading three independent systems would read as one thing
vanishing while another appears.

**Why the weights must sum to 1.** They are interpolation coefficients. If they
are allowed to under-sum, every point drifts toward the origin mid-transition
and the whole field collapses inward.

---

## 7. Graceful degradation

Each layer fails to a still-usable state rather than to an error. This matters
more than usual here: the target host is inside Iran, on hardware that may not
have a GPU on day one.

```mermaid
flowchart TB
    subgraph cosmos["Cosmos background"]
        c1["WebGL2 + high tier<br/>40k points, bloom"]
        c2["medium / low tier<br/>fewer points, no bloom"]
        c3["prefers-reduced-motion<br/>one static frame"]
        c4["no WebGL2 or Save-Data<br/>pre-rendered WebP + CSS starfield"]
        c1 --> c2 --> c3 --> c4
    end

    subgraph assistant["AI assistant"]
        a1["vLLM + Hakim up<br/>grounded answers with citations"]
        a2["embeddings down<br/>persona only, no invented facts"]
        a3["LLM down<br/>503 + honest Persian message"]
        a1 --> a2 --> a3
    end

    subgraph site["Site"]
        s1["Postgres up<br/>everything works"]
        s2["Postgres down<br/>503 · this is the one hard dependency"]
        s1 --> s2
    end
```

The static fallback image is generated **from the real geometry** by
`scripts/preview-cosmos.ts`, so it can never drift from the live scene the way a
hand-taken screenshot would.

---

## 8. Repository shape

```mermaid
flowchart TB
    root["neurai/"]

    root --> compose["docker-compose.yml<br/>Dockerfile · Caddyfile"]
    root --> services["services/embeddings/<br/>Hakim FastAPI wrapper"]
    root --> scripts["scripts/<br/>verify-girih · preview-cosmos<br/>preview-formations · setup-db"]
    root --> docs["docs/<br/>ARCHITECTURE · DIAGRAMS"]
    root --> src["src/"]

    src --> app["app/"]
    app --> fe["(frontend)/<br/>site · api/chat · api/events · api/health"]
    app --> pl["(payload)/<br/>admin · REST · GraphQL"]

    src --> coll["collections/ · globals/<br/>content model + access rules"]
    src --> comp["components/"]
    comp --> cos["cosmos/<br/>engine · girih · tier · canvas"]
    comp --> ui["ui/ · layout/ · sections/<br/>blog/ · chat/ · personalization/"]

    src --> lib["lib/<br/>ai/ · content/ · db · rate-limit · utils"]
    src --> cfg["config/brand.ts<br/>single source of brand identity"]
    src --> styles["styles/globals.css<br/>design tokens · 60:30:10"]
```

Two route groups, two root layouts. The admin panel never loads the cosmos
canvas or the site fonts, and the site never loads Payload's admin CSS.
