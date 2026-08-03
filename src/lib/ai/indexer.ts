import type { Payload } from 'payload'

import { chunkText, lexicalToPlainText } from '@/lib/content/lexical'
import { pool, toVectorLiteral } from '@/lib/db'

import { embed } from './embeddings'

/**
 * Keeps the retrieval index in step with published content.
 *
 * Called from the Posts collection's afterChange/afterDelete hooks, so the
 * index is a pure function of what is currently published — no cron job to
 * drift out of sync, no manual reindex step for editors to forget.
 */

export type IndexSource = 'posts' | 'pages'

type IndexableDoc = {
  id: string | number
  title?: string
  excerpt?: string
  slug?: string
  content?: unknown
}

/**
 * Replace every chunk for one document.
 *
 * Delete-then-insert inside a transaction rather than diffing: content edits
 * reshuffle chunk boundaries, so matching old chunks to new ones is more work
 * than rebuilding, and the transaction means retrieval never observes a
 * half-indexed document.
 */
export async function indexDocument(
  source: IndexSource,
  doc: IndexableDoc,
  payload: Payload,
): Promise<number> {
  const body = lexicalToPlainText(doc.content)
  const title = doc.title ?? ''
  const excerpt = doc.excerpt ?? ''

  const full = [title, excerpt, body].filter(Boolean).join('\n\n')
  const chunks = chunkText(full)

  if (chunks.length === 0) {
    await removeFromIndex(source, String(doc.id), payload)
    return 0
  }

  // Prefixing each chunk with the title gives an isolated middle-of-article
  // chunk enough context to be retrievable on its own — without it, a chunk
  // that never repeats the subject noun is effectively invisible to search.
  const embeddable = chunks.map((chunk) => (title ? `${title}\n\n${chunk}` : chunk))
  const vectors = await embed(embeddable, 'passage')

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query('DELETE FROM content_chunks WHERE source_type = $1 AND source_id = $2', [
      source,
      String(doc.id),
    ])

    for (let index = 0; index < chunks.length; index++) {
      await client.query(
        `INSERT INTO content_chunks
           (source_type, source_id, source_slug, source_title, chunk_index, text, embedding)
         VALUES ($1, $2, $3, $4, $5, $6, $7::vector)`,
        [
          source,
          String(doc.id),
          doc.slug ?? '',
          title,
          index,
          chunks[index]!,
          toVectorLiteral(vectors[index]!),
        ],
      )
    }

    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }

  payload.logger.info(`Indexed ${chunks.length} chunk(s) for ${source}/${doc.id}`)
  return chunks.length
}

export const indexPost = (doc: IndexableDoc, payload: Payload) =>
  indexDocument('posts', doc, payload)

export async function removeFromIndex(source: IndexSource, id: string, payload: Payload) {
  const result = await pool.query(
    'DELETE FROM content_chunks WHERE source_type = $1 AND source_id = $2',
    [source, id],
  )
  if (result.rowCount) {
    payload.logger.info(`Removed ${result.rowCount} chunk(s) for ${source}/${id}`)
  }
}
