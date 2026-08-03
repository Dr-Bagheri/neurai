/**
 * Lexical → plain text.
 *
 * Used for reading-time estimation and, more importantly, for producing the
 * text that gets embedded for retrieval. We walk the node tree rather than
 * stripping tags from rendered HTML so that structure survives: headings are
 * kept on their own lines, which lets the chunker split on semantic boundaries
 * instead of arbitrary character offsets.
 */

type LexicalNode = {
  type?: string
  text?: string
  tag?: string
  children?: LexicalNode[]
  [key: string]: unknown
}

type LexicalRoot = { root?: LexicalNode } | null | undefined

const BLOCK_TYPES = new Set(['paragraph', 'heading', 'quote', 'listitem', 'list'])

export function lexicalToPlainText(value: unknown): string {
  const root = (value as LexicalRoot)?.root
  if (!root) return ''

  const lines: string[] = []
  let current = ''

  const flush = () => {
    const trimmed = current.trim()
    if (trimmed) lines.push(trimmed)
    current = ''
  }

  const walk = (node: LexicalNode) => {
    if (typeof node.text === 'string') {
      current += node.text
      return
    }

    if (Array.isArray(node.children)) {
      for (const child of node.children) walk(child)
    }

    if (node.type && BLOCK_TYPES.has(node.type)) flush()
  }

  walk(root)
  flush()

  return lines.join('\n')
}

/**
 * Split text into overlapping chunks for embedding.
 *
 * Sized in characters rather than tokens on purpose: Persian tokenises very
 * unevenly across models, so a character budget is the more predictable
 * proxy, and the embedding model truncates anything overlong anyway.
 *
 * Chunks are built from whole paragraphs where possible. A retrieved fragment
 * that starts mid-sentence reads badly when the assistant quotes it back, and
 * paragraph boundaries are where Persian prose actually changes subject.
 */
export function chunkText(
  text: string,
  { maxChars = 1100, overlapChars = 160 }: { maxChars?: number; overlapChars?: number } = {},
): string[] {
  const paragraphs = text
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean)

  const chunks: string[] = []
  let buffer = ''

  const push = () => {
    const trimmed = buffer.trim()
    if (trimmed) chunks.push(trimmed)
  }

  for (const paragraph of paragraphs) {
    // A single paragraph longer than the budget gets hard-split on sentence
    // boundaries — Persian uses «.» and «؟» and «!» like Latin does.
    if (paragraph.length > maxChars) {
      push()
      buffer = ''
      const sentences = paragraph.split(/(?<=[.؟!])\s+/)
      let sentenceBuffer = ''
      for (const sentence of sentences) {
        if ((sentenceBuffer + ' ' + sentence).length > maxChars) {
          if (sentenceBuffer.trim()) chunks.push(sentenceBuffer.trim())
          sentenceBuffer = sentence
        } else {
          sentenceBuffer += (sentenceBuffer ? ' ' : '') + sentence
        }
      }
      if (sentenceBuffer.trim()) chunks.push(sentenceBuffer.trim())
      continue
    }

    if ((buffer + '\n' + paragraph).length > maxChars) {
      push()
      // Carry the tail of the previous chunk forward so a fact spanning a
      // paragraph break is still retrievable from either side of it.
      buffer = buffer.slice(-overlapChars) + '\n' + paragraph
    } else {
      buffer += (buffer ? '\n' : '') + paragraph
    }
  }

  push()
  return chunks
}
