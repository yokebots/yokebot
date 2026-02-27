/**
 * knowledge-base.ts — Document upload, chunking, embedding, and hybrid search
 *
 * Implements L0/L1/L2 tiered retrieval:
 *   L0: ~100 token document summary (stored on kb_documents)
 *   L1: ~2000 token document overview (stored on kb_documents)
 *   L2: Full chunked content with embeddings (stored in kb_chunks)
 *
 * Search uses hybrid approach: vector similarity + BM25 keyword, merged via RRF.
 * Works on both SQLite (brute-force cosine sim) and Postgres (pgvector HNSW).
 */

import { randomUUID } from 'crypto'
import type { Db } from './db/types.ts'
import { parseDocument } from './document-parser.ts'
import { chatCompletion, resolveModelConfig, type ChatMessage as LLMMessage } from './model.ts'

// ---- Types ----

export interface KbDocument {
  id: string
  teamId: string
  title: string
  fileName: string
  fileType: string
  fileSize: number
  status: 'pending' | 'processing' | 'ready' | 'failed'
  l0Summary: string | null
  l1Overview: string | null
  chunkCount: number
  error: string | null
  createdAt: string
}

export interface KbChunk {
  id: string
  documentId: string
  teamId: string
  chunkIndex: number
  content: string
  tokenCount: number
  createdAt: string
}

export interface KbMemory {
  id: string
  teamId: string
  agentId: string | null
  content: string
  sourceChannelId: string | null
  createdAt: string
}

export interface SearchResult {
  chunkId: string
  documentId: string
  documentTitle: string
  content: string
  score: number
  l0Summary: string | null
}

// ---- Document CRUD ----

export async function uploadDocument(
  db: Db,
  teamId: string,
  opts: { title?: string; fileName: string; fileType: string; fileSize: number; contentBase64: string },
): Promise<KbDocument> {
  const id = randomUUID()
  const title = opts.title || opts.fileName.replace(/\.[^.]+$/, '')

  await db.run(
    `INSERT INTO kb_documents (id, team_id, title, file_name, file_type, file_size, status, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, 'pending', ${db.now()})`,
    [id, teamId, title, opts.fileName, opts.fileType, opts.fileSize],
  )

  // Fire-and-forget processing
  const buffer = Buffer.from(opts.contentBase64, 'base64')
  processDocument(db, id, teamId, buffer, opts.fileName, opts.fileType).catch((err) => {
    console.error(`[kb] Document processing failed for ${id}:`, err)
  })

  return {
    id, teamId, title, fileName: opts.fileName, fileType: opts.fileType,
    fileSize: opts.fileSize, status: 'pending', l0Summary: null, l1Overview: null,
    chunkCount: 0, error: null, createdAt: new Date().toISOString(),
  }
}

export async function listDocuments(db: Db, teamId: string): Promise<KbDocument[]> {
  const rows = await db.query<Record<string, unknown>>(
    `SELECT id, team_id, title, file_name, file_type, file_size, status, l0_summary, l1_overview, chunk_count, error, created_at
     FROM kb_documents WHERE team_id = $1 ORDER BY created_at DESC`,
    [teamId],
  )
  return rows.map(rowToDocument)
}

export async function getDocument(db: Db, id: string, teamId: string): Promise<KbDocument | null> {
  const row = await db.queryOne<Record<string, unknown>>(
    `SELECT id, team_id, title, file_name, file_type, file_size, status, l0_summary, l1_overview, chunk_count, error, created_at
     FROM kb_documents WHERE id = $1 AND team_id = $2`,
    [id, teamId],
  )
  return row ? rowToDocument(row) : null
}

export async function deleteDocument(db: Db, id: string, teamId: string): Promise<boolean> {
  // Chunks cascade via ON DELETE CASCADE (Postgres) or manual delete (SQLite)
  if (db.driver === 'sqlite') {
    await db.run('DELETE FROM kb_chunks WHERE document_id = $1', [id])
  }
  await db.run('DELETE FROM kb_documents WHERE id = $1 AND team_id = $2', [id, teamId])
  return true
}

export async function getDocumentChunks(db: Db, documentId: string, teamId: string): Promise<KbChunk[]> {
  const rows = await db.query<Record<string, unknown>>(
    `SELECT id, document_id, team_id, chunk_index, content, token_count, created_at
     FROM kb_chunks WHERE document_id = $1 AND team_id = $2 ORDER BY chunk_index`,
    [documentId, teamId],
  )
  return rows.map((r) => ({
    id: r.id as string,
    documentId: r.document_id as string,
    teamId: r.team_id as string,
    chunkIndex: r.chunk_index as number,
    content: r.content as string,
    tokenCount: r.token_count as number,
    createdAt: r.created_at as string,
  }))
}

// ---- Document Processing Pipeline ----

async function processDocument(
  db: Db,
  documentId: string,
  teamId: string,
  buffer: Buffer,
  fileName: string,
  fileType: string,
): Promise<void> {
  try {
    await db.run("UPDATE kb_documents SET status = 'processing' WHERE id = $1", [documentId])

    // 1. Parse document to text
    const text = await parseDocument(buffer, fileName, fileType)

    // 2. Chunk the text
    const chunks = chunkText(text)

    // 3. Generate L0 summary (~100 tokens)
    const l0 = await generateSummary(db, text, 'l0')

    // 4. Generate L1 overview (~2000 tokens)
    const l1 = await generateSummary(db, text, 'l1')

    // 5. Embed all chunks (batch 32 at a time)
    const chunkTexts = chunks.map((c) => c.content)
    const embeddings = await embedTextsInBatches(chunkTexts, 32)

    // 6. Store chunks with embeddings
    for (let i = 0; i < chunks.length; i++) {
      const chunkId = randomUUID()
      const embeddingValue = formatEmbeddingForDb(db, embeddings[i])

      if (db.driver === 'postgres') {
        await db.run(
          `INSERT INTO kb_chunks (id, document_id, team_id, chunk_index, content, token_count, embedding, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7::vector, NOW())`,
          [chunkId, documentId, teamId, i, chunks[i].content, chunks[i].tokenCount, embeddingValue],
        )
      } else {
        await db.run(
          `INSERT INTO kb_chunks (id, document_id, team_id, chunk_index, content, token_count, embedding, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, datetime('now'))`,
          [chunkId, documentId, teamId, i, chunks[i].content, chunks[i].tokenCount, embeddingValue],
        )
      }
    }

    // 7. Update document status
    await db.run(
      `UPDATE kb_documents SET status = 'ready', l0_summary = $1, l1_overview = $2, chunk_count = $3 WHERE id = $4`,
      [l0, l1, chunks.length, documentId],
    )

    console.log(`[kb] Document ${documentId} processed: ${chunks.length} chunks`)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[kb] Processing failed for ${documentId}:`, message)
    await db.run(
      "UPDATE kb_documents SET status = 'failed', error = $1 WHERE id = $2",
      [message.slice(0, 1000), documentId],
    )
  }
}

// ---- Text Chunking ----

interface TextChunk {
  content: string
  tokenCount: number
}

const TARGET_CHUNK_TOKENS = 500
const OVERLAP_TOKENS = 50
const CHARS_PER_TOKEN = 4

function chunkText(text: string): TextChunk[] {
  const targetChars = TARGET_CHUNK_TOKENS * CHARS_PER_TOKEN
  const overlapChars = OVERLAP_TOKENS * CHARS_PER_TOKEN

  // Split into paragraphs first
  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim().length > 0)

  const chunks: TextChunk[] = []
  let current = ''

  for (const para of paragraphs) {
    if (current.length + para.length > targetChars && current.length > 0) {
      chunks.push(makeChunk(current))
      // Keep overlap from end of current chunk
      const overlap = current.slice(-overlapChars)
      current = overlap + '\n\n' + para
    } else {
      current = current ? current + '\n\n' + para : para
    }
  }

  if (current.trim().length > 0) {
    chunks.push(makeChunk(current))
  }

  // Handle single very long paragraphs by splitting on sentences
  const result: TextChunk[] = []
  for (const chunk of chunks) {
    if (chunk.content.length > targetChars * 2) {
      result.push(...splitLongChunk(chunk.content, targetChars, overlapChars))
    } else {
      result.push(chunk)
    }
  }

  return result.length > 0 ? result : [makeChunk(text.slice(0, targetChars) || '(empty document)')]
}

function splitLongChunk(text: string, targetChars: number, overlapChars: number): TextChunk[] {
  const sentences = text.split(/(?<=[.!?])\s+/)
  const chunks: TextChunk[] = []
  let current = ''

  for (const sentence of sentences) {
    if (current.length + sentence.length > targetChars && current.length > 0) {
      chunks.push(makeChunk(current))
      const overlap = current.slice(-overlapChars)
      current = overlap + ' ' + sentence
    } else {
      current = current ? current + ' ' + sentence : sentence
    }
  }

  if (current.trim().length > 0) {
    chunks.push(makeChunk(current))
  }

  return chunks
}

function makeChunk(content: string): TextChunk {
  const trimmed = content.trim()
  return { content: trimmed, tokenCount: Math.ceil(trimmed.length / CHARS_PER_TOKEN) }
}

// ---- L0/L1 Summary Generation ----

async function generateSummary(db: Db, text: string, level: 'l0' | 'l1'): Promise<string> {
  try {
    // Use a cheap model for summarization
    const modelConfig = await resolveModelConfig(db, 'llama-4-scout')

    const maxInputChars = level === 'l0' ? 8000 : 16000
    const truncatedText = text.slice(0, maxInputChars)

    const prompt = level === 'l0'
      ? `Summarize this document in exactly 1-2 sentences (under 100 words). Focus on what the document is about and its key purpose.\n\nDocument:\n${truncatedText}`
      : `Create a detailed overview of this document in 300-500 words. Cover the main topics, key points, important entities, and document structure. This will be used for search relevance ranking.\n\nDocument:\n${truncatedText}`

    const messages: LLMMessage[] = [
      { role: 'system', content: 'You are a document summarizer. Be concise and factual.' },
      { role: 'user', content: prompt },
    ]

    const response = await chatCompletion(modelConfig, messages)
    return response.content ?? '(summary generation failed)'
  } catch (err) {
    console.error(`[kb] ${level} summary generation failed:`, err)
    return level === 'l0'
      ? text.slice(0, 200).trim() + '...'
      : text.slice(0, 2000).trim() + '...'
  }
}

// ---- Embedding ----

async function embedTextsInBatches(texts: string[], batchSize: number): Promise<number[][]> {
  const apiKey = process.env.DEEPINFRA_API_KEY
  if (!apiKey) throw new Error('DEEPINFRA_API_KEY not configured — cannot generate embeddings')

  const allEmbeddings: number[][] = []

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize)
    const embeddings = await callEmbeddingApi(apiKey, batch)
    allEmbeddings.push(...embeddings)
  }

  return allEmbeddings
}

async function callEmbeddingApi(apiKey: string, texts: string[]): Promise<number[][]> {
  const res = await fetch('https://api.deepinfra.com/v1/openai/embeddings', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'Qwen/Qwen3-Embedding-8B', input: texts }),
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Embedding API error ${res.status}: ${errText}`)
  }

  const data = await res.json() as {
    data: Array<{ embedding: number[]; index: number }>
  }

  // Sort by index to maintain order
  return data.data.sort((a, b) => a.index - b.index).map((d) => d.embedding)
}

function formatEmbeddingForDb(db: Db, embedding: number[] | undefined): string | null {
  if (!embedding) return null
  if (db.driver === 'postgres') {
    // pgvector format: [0.1,0.2,0.3,...]
    return `[${embedding.join(',')}]`
  }
  // SQLite: JSON array string
  return JSON.stringify(embedding)
}

// ---- Hybrid Search ----

export async function searchKb(
  db: Db,
  teamId: string,
  query: string,
  topK = 5,
  documentIds?: string[],
): Promise<SearchResult[]> {
  const apiKey = process.env.DEEPINFRA_API_KEY
  if (!apiKey) return keywordSearchOnly(db, teamId, query, topK, documentIds)

  // 1. Embed the query
  let queryEmbedding: number[]
  try {
    const embeddings = await callEmbeddingApi(apiKey, [query])
    queryEmbedding = embeddings[0]
  } catch {
    return keywordSearchOnly(db, teamId, query, topK, documentIds)
  }

  // 2. Vector search
  const vectorResults = await vectorSearch(db, teamId, queryEmbedding, topK * 2, documentIds)

  // 3. Keyword search
  const keywordResults = await keywordSearch(db, teamId, query, topK * 2, documentIds)

  // 4. Merge via Reciprocal Rank Fusion
  return reciprocalRankFusion(vectorResults, keywordResults, topK)
}

async function vectorSearch(
  db: Db,
  teamId: string,
  queryEmbedding: number[],
  limit: number,
  documentIds?: string[],
): Promise<SearchResult[]> {
  if (db.driver === 'postgres') {
    const embStr = `[${queryEmbedding.join(',')}]`
    const docFilter = documentIds?.length
      ? `AND c.document_id = ANY($4::text[])`
      : ''
    const params: unknown[] = [embStr, teamId, limit]
    if (documentIds?.length) params.push(documentIds)

    const rows = await db.query<Record<string, unknown>>(
      `SELECT c.id as chunk_id, c.document_id, c.content,
              d.title as document_title, d.l0_summary,
              1 - (c.embedding <=> $1::vector) as similarity
       FROM kb_chunks c
       JOIN kb_documents d ON d.id = c.document_id
       WHERE c.team_id = $2 AND c.embedding IS NOT NULL AND d.status = 'ready' ${docFilter}
       ORDER BY c.embedding <=> $1::vector
       LIMIT $3`,
      params,
    )

    return rows.map((r) => ({
      chunkId: r.chunk_id as string,
      documentId: r.document_id as string,
      documentTitle: r.document_title as string,
      content: r.content as string,
      score: r.similarity as number,
      l0Summary: r.l0_summary as string | null,
    }))
  }

  // SQLite: brute-force cosine similarity in JS
  const docFilter = documentIds?.length
    ? `AND c.document_id IN (${documentIds.map((_, i) => `$${i + 2}`).join(',')})`
    : ''
  const params: unknown[] = [teamId, ...(documentIds ?? [])]

  const rows = await db.query<Record<string, unknown>>(
    `SELECT c.id as chunk_id, c.document_id, c.content, c.embedding,
            d.title as document_title, d.l0_summary
     FROM kb_chunks c
     JOIN kb_documents d ON d.id = c.document_id
     WHERE c.team_id = $1 AND c.embedding IS NOT NULL AND d.status = 'ready' ${docFilter}`,
    params,
  )

  const scored = rows
    .map((r) => {
      const embedding = JSON.parse(r.embedding as string) as number[]
      const similarity = cosineSimilarity(queryEmbedding, embedding)
      return {
        chunkId: r.chunk_id as string,
        documentId: r.document_id as string,
        documentTitle: r.document_title as string,
        content: r.content as string,
        score: similarity,
        l0Summary: r.l0_summary as string | null,
      }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)

  return scored
}

async function keywordSearch(
  db: Db,
  teamId: string,
  query: string,
  limit: number,
  documentIds?: string[],
): Promise<SearchResult[]> {
  // Split query into terms and search with LIKE
  const terms = query.toLowerCase().split(/\s+/).filter((t) => t.length > 2)
  if (terms.length === 0) return []

  const docFilter = documentIds?.length
    ? `AND c.document_id IN (${documentIds.map((_, i) => `$${i + 2 + terms.length}`).join(',')})`
    : ''

  // Build LIKE conditions — match any term
  const likeConditions = terms.map((_, i) => `LOWER(c.content) LIKE $${i + 2}`).join(' OR ')
  const likeParams = terms.map((t) => `%${t}%`)

  const params: unknown[] = [teamId, ...likeParams, ...(documentIds ?? [])]

  const rows = await db.query<Record<string, unknown>>(
    `SELECT c.id as chunk_id, c.document_id, c.content,
            d.title as document_title, d.l0_summary
     FROM kb_chunks c
     JOIN kb_documents d ON d.id = c.document_id
     WHERE c.team_id = $1 AND d.status = 'ready' AND (${likeConditions}) ${docFilter}
     LIMIT $${params.length + 1}`,
    [...params, limit],
  )

  // Score by number of matching terms
  return rows.map((r) => {
    const content = (r.content as string).toLowerCase()
    const matchCount = terms.filter((t) => content.includes(t)).length
    return {
      chunkId: r.chunk_id as string,
      documentId: r.document_id as string,
      documentTitle: r.document_title as string,
      content: r.content as string,
      score: matchCount / terms.length,
      l0Summary: r.l0_summary as string | null,
    }
  })
}

async function keywordSearchOnly(
  db: Db,
  teamId: string,
  query: string,
  topK: number,
  documentIds?: string[],
): Promise<SearchResult[]> {
  return keywordSearch(db, teamId, query, topK, documentIds)
}

function reciprocalRankFusion(
  vectorResults: SearchResult[],
  keywordResults: SearchResult[],
  topK: number,
  k = 60,
): SearchResult[] {
  const scores = new Map<string, { result: SearchResult; score: number }>()

  // Score vector results by rank
  vectorResults.forEach((r, i) => {
    const rrf = 1 / (k + i + 1)
    const existing = scores.get(r.chunkId)
    if (existing) {
      existing.score += rrf
    } else {
      scores.set(r.chunkId, { result: r, score: rrf })
    }
  })

  // Score keyword results by rank
  keywordResults.forEach((r, i) => {
    const rrf = 1 / (k + i + 1)
    const existing = scores.get(r.chunkId)
    if (existing) {
      existing.score += rrf
    } else {
      scores.set(r.chunkId, { result: r, score: rrf })
    }
  })

  return [...scores.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map((s) => ({ ...s.result, score: s.score }))
}

// ---- Memory ----

export async function addMemory(
  db: Db,
  teamId: string,
  agentId: string | null,
  content: string,
  channelId?: string,
): Promise<void> {
  const id = randomUUID()

  let embeddingValue: string | null = null
  try {
    const apiKey = process.env.DEEPINFRA_API_KEY
    if (apiKey) {
      const embeddings = await callEmbeddingApi(apiKey, [content])
      embeddingValue = formatEmbeddingForDb(db, embeddings[0])
    }
  } catch (err) {
    console.error('[kb] Memory embedding failed:', err)
  }

  if (db.driver === 'postgres') {
    await db.run(
      `INSERT INTO kb_memories (id, team_id, agent_id, content, source_channel_id, embedding, created_at)
       VALUES ($1, $2, $3, $4, $5, $6::vector, NOW())`,
      [id, teamId, agentId, content, channelId ?? null, embeddingValue],
    )
  } else {
    await db.run(
      `INSERT INTO kb_memories (id, team_id, agent_id, content, source_channel_id, embedding, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, datetime('now'))`,
      [id, teamId, agentId, content, channelId ?? null, embeddingValue],
    )
  }
}

export async function searchMemories(
  db: Db,
  teamId: string,
  query: string,
  topK = 5,
): Promise<KbMemory[]> {
  const apiKey = process.env.DEEPINFRA_API_KEY

  if (apiKey && db.driver === 'postgres') {
    try {
      const embeddings = await callEmbeddingApi(apiKey, [query])
      const embStr = `[${embeddings[0].join(',')}]`

      const rows = await db.query<Record<string, unknown>>(
        `SELECT id, team_id, agent_id, content, source_channel_id, created_at
         FROM kb_memories
         WHERE team_id = $1 AND embedding IS NOT NULL
         ORDER BY embedding <=> $2::vector
         LIMIT $3`,
        [teamId, embStr, topK],
      )

      return rows.map(rowToMemory)
    } catch {
      // Fall through to keyword search
    }
  }

  if (apiKey && db.driver === 'sqlite') {
    try {
      const embeddings = await callEmbeddingApi(apiKey, [query])
      const queryEmbedding = embeddings[0]

      const rows = await db.query<Record<string, unknown>>(
        `SELECT id, team_id, agent_id, content, source_channel_id, embedding, created_at
         FROM kb_memories WHERE team_id = $1 AND embedding IS NOT NULL`,
        [teamId],
      )

      return rows
        .map((r) => ({
          ...rowToMemory(r),
          score: cosineSimilarity(queryEmbedding, JSON.parse(r.embedding as string)),
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, topK)
    } catch {
      // Fall through to keyword search
    }
  }

  // Keyword fallback
  const terms = query.toLowerCase().split(/\s+/).filter((t) => t.length > 2)
  if (terms.length === 0) {
    const rows = await db.query<Record<string, unknown>>(
      'SELECT id, team_id, agent_id, content, source_channel_id, created_at FROM kb_memories WHERE team_id = $1 ORDER BY created_at DESC LIMIT $2',
      [teamId, topK],
    )
    return rows.map(rowToMemory)
  }

  const likeConditions = terms.map((_, i) => `LOWER(content) LIKE $${i + 2}`).join(' OR ')
  const rows = await db.query<Record<string, unknown>>(
    `SELECT id, team_id, agent_id, content, source_channel_id, created_at
     FROM kb_memories WHERE team_id = $1 AND (${likeConditions})
     ORDER BY created_at DESC LIMIT $${terms.length + 2}`,
    [teamId, ...terms.map((t) => `%${t}%`), topK],
  )
  return rows.map(rowToMemory)
}

// ---- Helpers ----

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0
  const len = Math.min(a.length, b.length)
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB)
  return denom === 0 ? 0 : dot / denom
}

function rowToDocument(r: Record<string, unknown>): KbDocument {
  return {
    id: r.id as string,
    teamId: r.team_id as string,
    title: r.title as string,
    fileName: r.file_name as string,
    fileType: r.file_type as string,
    fileSize: r.file_size as number,
    status: r.status as KbDocument['status'],
    l0Summary: (r.l0_summary as string) ?? null,
    l1Overview: (r.l1_overview as string) ?? null,
    chunkCount: (r.chunk_count as number) ?? 0,
    error: (r.error as string) ?? null,
    createdAt: r.created_at as string,
  }
}

function rowToMemory(r: Record<string, unknown>): KbMemory {
  return {
    id: r.id as string,
    teamId: r.team_id as string,
    agentId: (r.agent_id as string) ?? null,
    content: r.content as string,
    sourceChannelId: (r.source_channel_id as string) ?? null,
    createdAt: r.created_at as string,
  }
}
