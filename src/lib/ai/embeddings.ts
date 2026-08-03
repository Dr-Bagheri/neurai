/**
 * Embedding client — talks to the self-hosted Hakim service.
 *
 * Hakim (MCINext) is a Persian-specific embedding model that outperforms the
 * multilingual alternatives (multilingual-e5, BGE-m3, Jina) on the FaMTEB
 * Persian benchmark by a meaningful margin. Since it runs in our own container
 * there is no per-token cost and no external dependency that sanctions could
 * sever — the same reasoning that drove the whole stack.
 *
 * The service exposes a deliberately small HTTP surface so it can be swapped
 * for any other embedding backend by changing EMBEDDINGS_BASE_URL alone.
 */

const BASE_URL = process.env.EMBEDDINGS_BASE_URL ?? 'http://localhost:8080'
export const EMBEDDING_DIM = Number(process.env.EMBEDDINGS_DIM ?? 768)

/** Hakim is asymmetric: queries and documents are prefixed differently. */
export type EmbeddingKind = 'query' | 'passage'

type EmbedResponse = { embeddings: number[][] }

export async function embed(
  texts: string[],
  kind: EmbeddingKind = 'passage',
  signal?: AbortSignal,
): Promise<number[][]> {
  if (texts.length === 0) return []

  const response = await fetch(`${BASE_URL}/embed`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ texts, kind }),
    signal,
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(`Embedding service returned ${response.status}: ${detail.slice(0, 200)}`)
  }

  const data = (await response.json()) as EmbedResponse

  if (!Array.isArray(data.embeddings) || data.embeddings.length !== texts.length) {
    throw new Error('Embedding service returned a malformed response')
  }

  const width = data.embeddings[0]?.length
  if (width !== EMBEDDING_DIM) {
    // Caught here rather than at INSERT time, where Postgres would reject the
    // whole batch with a much less obvious error.
    throw new Error(
      `Embedding width ${width} does not match EMBEDDINGS_DIM=${EMBEDDING_DIM}. ` +
        'Update the env var and the vector(N) column together.',
    )
  }

  return data.embeddings
}

export async function embedOne(
  text: string,
  kind: EmbeddingKind = 'query',
  signal?: AbortSignal,
): Promise<number[]> {
  const [vector] = await embed([text], kind, signal)
  if (!vector) throw new Error('Embedding service returned no vector')
  return vector
}

/** Health probe, used by the chat route to degrade gracefully. */
export async function embeddingsAvailable(): Promise<boolean> {
  try {
    const response = await fetch(`${BASE_URL}/health`, {
      signal: AbortSignal.timeout(2000),
    })
    return response.ok
  } catch {
    return false
  }
}
