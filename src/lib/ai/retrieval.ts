import { pool, toVectorLiteral } from '@/lib/db'

import { embedOne } from './embeddings'

/**
 * Hybrid retrieval: dense vectors ∪ lexical match, fused by reciprocal rank.
 *
 * Neither half is sufficient on its own for Persian:
 *   • Vectors alone miss exact tokens — product names, version numbers, and
 *     Latin acronyms embedded in Persian text all embed poorly.
 *   • Lexical alone misses paraphrase, and Postgres ships no Persian stemmer,
 *     so morphological variants ("سامانه" / "سامانه‌ها") don't match.
 *
 * RRF is used rather than score normalisation because cosine distance and
 * trigram similarity aren't on comparable scales, and rank is robust to that.
 */

export type RetrievedChunk = {
  id: number
  sourceType: string
  sourceId: string
  sourceSlug: string
  sourceTitle: string
  text: string
  score: number
}

const TOP_K = Number(process.env.RAG_TOP_K ?? 6)
/** RRF damping. 60 is the value from the original paper and behaves well here. */
const RRF_K = 60

type Row = {
  id: number
  source_type: string
  source_id: string
  source_slug: string
  source_title: string
  text: string
}

export async function retrieve(query: string, limit = TOP_K): Promise<RetrievedChunk[]> {
  const trimmed = query.trim()
  if (!trimmed) return []

  // Over-fetch each arm so the fusion has enough candidates to reorder. Fusing
  // two lists of exactly `limit` items mostly just returns the vector list.
  const candidates = Math.max(limit * 4, 20)

  const [dense, lexical] = await Promise.all([
    denseSearch(trimmed, candidates),
    lexicalSearch(trimmed, candidates),
  ])

  const scores = new Map<number, { row: Row; score: number }>()

  const fuse = (rows: Row[], weight: number) => {
    rows.forEach((row, index) => {
      const contribution = weight / (RRF_K + index + 1)
      const existing = scores.get(row.id)
      if (existing) existing.score += contribution
      else scores.set(row.id, { row, score: contribution })
    })
  }

  // Dense is weighted higher: on Persian paraphrase — which is what visitors
  // actually type — it is the more reliable arm. Lexical is the safety net.
  fuse(dense, 1)
  fuse(lexical, 0.65)

  return [...scores.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ row, score }) => ({
      id: row.id,
      sourceType: row.source_type,
      sourceId: row.source_id,
      sourceSlug: row.source_slug,
      sourceTitle: row.source_title,
      text: row.text,
      score,
    }))
}

async function denseSearch(query: string, limit: number): Promise<Row[]> {
  const vector = await embedOne(query, 'query')
  const { rows } = await pool.query<Row>(
    `SELECT id, source_type, source_id, source_slug, source_title, text
       FROM content_chunks
      ORDER BY embedding <=> $1::vector
      LIMIT $2`,
    [toVectorLiteral(vector), limit],
  )
  return rows
}

async function lexicalSearch(query: string, limit: number): Promise<Row[]> {
  // `word_similarity` finds the best-matching *substring*, which suits long
  // chunks far better than whole-string `similarity` — the latter is dominated
  // by chunk length and effectively always returns near-zero.
  const { rows } = await pool.query<Row>(
    `SELECT id, source_type, source_id, source_slug, source_title, text
       FROM content_chunks
      WHERE text %> $1
      ORDER BY word_similarity($1, text) DESC
      LIMIT $2`,
    [query, limit],
  )
  return rows
}

/**
 * Render retrieved chunks into the prompt.
 *
 * Each block is numbered so the model can cite it as [۱], [۲], … and the UI can
 * turn those markers back into links. Without stable numbering the model
 * invents its own citation scheme and the links can't be resolved.
 */
export function formatContext(chunks: RetrievedChunk[]): string {
  if (chunks.length === 0) return ''
  return chunks
    .map(
      (chunk, index) =>
        `[${index + 1}] عنوان: ${chunk.sourceTitle}\nنشانی: /blog/${chunk.sourceSlug}\n${chunk.text}`,
    )
    .join('\n\n---\n\n')
}
