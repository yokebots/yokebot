import { docsContent, type DocEntry } from './docs-content'

export interface SearchResult {
  doc: DocEntry
  score: number
  matchField: 'title' | 'description' | 'keywords'
}

export function searchDocs(query: string): SearchResult[] {
  if (!query.trim()) return []
  const q = query.toLowerCase()
  const results: SearchResult[] = []

  for (const doc of Object.values(docsContent)) {
    if (doc.title.toLowerCase().includes(q)) {
      results.push({ doc, score: 3, matchField: 'title' })
      continue
    }
    if (doc.keywords.some(k => k.toLowerCase().includes(q))) {
      results.push({ doc, score: 2, matchField: 'keywords' })
      continue
    }
    if (doc.description.toLowerCase().includes(q)) {
      results.push({ doc, score: 1, matchField: 'description' })
      continue
    }
  }

  return results.sort((a, b) => b.score - a.score)
}
