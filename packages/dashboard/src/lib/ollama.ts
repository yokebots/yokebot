export interface OllamaModel {
  name: string
  size: number
  modified_at: string
}

export interface OllamaStatus {
  connected: boolean
  models: OllamaModel[]
}

export async function detectOllama(): Promise<OllamaStatus> {
  try {
    const response = await fetch('http://localhost:11434/api/tags', {
      signal: AbortSignal.timeout(3000),
    })
    if (!response.ok) {
      return { connected: false, models: [] }
    }
    const data = await response.json()
    return {
      connected: true,
      models: data.models ?? [],
    }
  } catch {
    return { connected: false, models: [] }
  }
}
