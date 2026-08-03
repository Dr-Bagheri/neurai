-- Tables Payload does not own: retrieval vectors, assistant memory,
-- behavioural events, and rate-limit counters.
--
-- These are kept out of the CMS deliberately. Payload generates its schema from
-- collection configs; pgvector columns, HNSW indexes and high-write event
-- tables don't belong in a content model and would clutter the admin UI.
--
-- Idempotent, so it is safe to re-run. Applied automatically on first container
-- start, or manually against an existing database with `pnpm db:setup`.

-- ── Retrieval ───────────────────────────────────────────────────────────────
-- vector(768) matches MCINext/Hakim. If you change EMBEDDINGS_MODEL to one with
-- a different width, change EMBEDDINGS_DIM and this column together — the
-- embedding client asserts they agree and will refuse to write a mismatch.
CREATE TABLE IF NOT EXISTS content_chunks (
  id            BIGSERIAL PRIMARY KEY,
  source_type   TEXT        NOT NULL,
  source_id     TEXT        NOT NULL,
  source_slug   TEXT        NOT NULL DEFAULT '',
  source_title  TEXT        NOT NULL DEFAULT '',
  chunk_index   INTEGER     NOT NULL,
  text          TEXT        NOT NULL,
  embedding     vector(768) NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source_type, source_id, chunk_index)
);

-- HNSW with cosine distance. Chosen over IVFFlat because it needs no training
-- pass and stays accurate as rows are added one article at a time, which is
-- exactly this workload.
CREATE INDEX IF NOT EXISTS content_chunks_embedding_idx
  ON content_chunks USING hnsw (embedding vector_cosine_ops);

-- Backs the lexical half of hybrid retrieval.
CREATE INDEX IF NOT EXISTS content_chunks_text_trgm_idx
  ON content_chunks USING gin (text gin_trgm_ops);

CREATE INDEX IF NOT EXISTS content_chunks_source_idx
  ON content_chunks (source_type, source_id);

-- ── Assistant memory ────────────────────────────────────────────────────────
-- Durable facts about a member, extracted from conversation. Only ever written
-- when the member has consented to personalization; deleting a row here is what
-- makes the "forget this" control in /dashboard/privacy real.
CREATE TABLE IF NOT EXISTS member_memories (
  id          BIGSERIAL PRIMARY KEY,
  member_id   TEXT        NOT NULL,
  kind        TEXT        NOT NULL DEFAULT 'fact',
  fact        TEXT        NOT NULL,
  salience    REAL        NOT NULL DEFAULT 0.5,
  embedding   vector(768),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS member_memories_member_idx
  ON member_memories (member_id, salience DESC);

-- ── Behavioural events ──────────────────────────────────────────────────────
-- Feeds the interest vector. `member_id` is null for anonymous visitors, who
-- are identified by a first-party anon_id cookie until they sign up.
CREATE TABLE IF NOT EXISTS member_events (
  id          BIGSERIAL PRIMARY KEY,
  member_id   TEXT,
  anon_id     TEXT,
  type        TEXT        NOT NULL,
  path        TEXT,
  meta        JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT member_events_identified CHECK (member_id IS NOT NULL OR anon_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS member_events_member_idx  ON member_events (member_id, created_at DESC);
CREATE INDEX IF NOT EXISTS member_events_anon_idx    ON member_events (anon_id, created_at DESC);

-- ── Rate limits ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rate_limits (
  key           TEXT        NOT NULL,
  window_start  TIMESTAMPTZ NOT NULL,
  count         INTEGER     NOT NULL DEFAULT 0,
  PRIMARY KEY (key, window_start)
);

-- Old windows are never read again; this index makes the sweep cheap.
CREATE INDEX IF NOT EXISTS rate_limits_window_idx ON rate_limits (window_start);
