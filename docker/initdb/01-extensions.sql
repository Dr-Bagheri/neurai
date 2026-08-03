-- Runs once, on first initialisation of the Postgres data volume.
--
-- pgvector powers RAG retrieval and the per-member interest vectors.
-- pg_trgm backs the lexical half of hybrid search: Persian has rich morphology
-- and no bundled Postgres stemmer, so trigram similarity carries the fuzzy
-- keyword matching that a language-specific FTS dictionary would otherwise do.
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- A text search configuration for Persian. Postgres ships no `persian`
-- dictionary, so we build a 'simple'-based config: no stemming, but unaccent
-- normalises Arabic/Persian character variants (ي/ی, ك/ک) that otherwise cause
-- silent retrieval misses.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_ts_config WHERE cfgname = 'persian') THEN
    CREATE TEXT SEARCH CONFIGURATION persian (COPY = simple);
    ALTER TEXT SEARCH CONFIGURATION persian
      ALTER MAPPING FOR hword, hword_part, word
      WITH unaccent, simple;
  END IF;
END
$$;
