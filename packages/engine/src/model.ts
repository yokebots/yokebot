/**
 * model.ts — Model abstraction (any OpenAI-compatible endpoint)
 *
 * Works with Ollama, DeepInfra, Together, OpenAI, or any
 * endpoint that speaks the OpenAI chat completions API.
 */

import type { Db } from './db/types.ts'

export interface ModelConfig {
  endpoint: string
  model: string
  apiKey?: string
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  tool_call_id?: string
  tool_calls?: ToolCall[]
}

export interface ToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

export interface ToolDef {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

export interface CompletionResponse {
  content: string | null
  tool_calls: ToolCall[]
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number }
}

// ---- Provider registry ----

export interface ProviderDef {
  id: string
  name: string
  endpoint: string
  requiresKey: boolean
  models: Array<{ id: string; name: string; contextWindow?: number }>
}

export const PROVIDERS: ProviderDef[] = [
  {
    id: 'ollama',
    name: 'Ollama (Local)',
    endpoint: 'http://localhost:11434/v1',
    requiresKey: false,
    models: [
      { id: 'llama3.2', name: 'Llama 3.2 (3B)', contextWindow: 128000 },
      { id: 'llama3.1', name: 'Llama 3.1 (8B)', contextWindow: 128000 },
      { id: 'deepseek-r1:8b', name: 'DeepSeek R1 (8B)', contextWindow: 64000 },
      { id: 'qwen2.5:7b', name: 'Qwen 2.5 (7B)', contextWindow: 128000 },
      { id: 'mistral', name: 'Mistral (7B)', contextWindow: 32000 },
      { id: 'gemma2', name: 'Gemma 2 (9B)', contextWindow: 8192 },
    ],
  },
  {
    id: 'deepinfra',
    name: 'DeepInfra',
    endpoint: 'https://api.deepinfra.com/v1/openai',
    requiresKey: true,
    models: [
      { id: 'meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8', name: 'Llama 4 Maverick (17B-128E)', contextWindow: 524288 },
      { id: 'meta-llama/Llama-4-Scout-17B-16E-Instruct', name: 'Llama 4 Scout (17B-16E)', contextWindow: 524288 },
      { id: 'meta-llama/Meta-Llama-3.1-70B-Instruct', name: 'Llama 3.1 (70B)', contextWindow: 128000 },
      { id: 'meta-llama/Meta-Llama-3.1-8B-Instruct', name: 'Llama 3.1 (8B)', contextWindow: 128000 },
      { id: 'Qwen/Qwen2.5-72B-Instruct', name: 'Qwen 2.5 (72B)', contextWindow: 128000 },
      { id: 'deepseek-ai/DeepSeek-R1', name: 'DeepSeek R1', contextWindow: 64000 },
      { id: 'deepseek-ai/DeepSeek-V3', name: 'DeepSeek V3', contextWindow: 64000 },
      { id: 'google/gemma-2-27b-it', name: 'Gemma 2 (27B)', contextWindow: 8192 },
      { id: 'mistralai/Mixtral-8x22B-Instruct-v0.1', name: 'Mixtral 8x22B', contextWindow: 65536 },
    ],
  },
  {
    id: 'together',
    name: 'Together AI',
    endpoint: 'https://api.together.xyz/v1',
    requiresKey: true,
    models: [
      { id: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', name: 'Llama 3.3 (70B Turbo)', contextWindow: 128000 },
      { id: 'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo', name: 'Llama 3.1 (8B Turbo)', contextWindow: 128000 },
      { id: 'Qwen/Qwen2.5-72B-Instruct-Turbo', name: 'Qwen 2.5 (72B Turbo)', contextWindow: 128000 },
      { id: 'deepseek-ai/DeepSeek-R1', name: 'DeepSeek R1', contextWindow: 64000 },
      { id: 'deepseek-ai/DeepSeek-V3', name: 'DeepSeek V3', contextWindow: 64000 },
      { id: 'mistralai/Mixtral-8x22B-Instruct-v0.1', name: 'Mixtral 8x22B', contextWindow: 65536 },
    ],
  },
  {
    id: 'openai',
    name: 'OpenAI',
    endpoint: 'https://api.openai.com/v1',
    requiresKey: true,
    models: [
      { id: 'gpt-4o', name: 'GPT-4o', contextWindow: 128000 },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini', contextWindow: 128000 },
      { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', contextWindow: 128000 },
    ],
  },
]

export function getProvider(id: string): ProviderDef | undefined {
  return PROVIDERS.find((p) => p.id === id)
}

// ---- Provider API key storage ----

export interface StoredProvider {
  id: string
  apiKey: string
  enabled: boolean
  updatedAt: string
}

export async function getStoredProvider(db: Db, id: string): Promise<StoredProvider | null> {
  const row = await db.queryOne<Record<string, unknown>>('SELECT * FROM model_providers WHERE id = $1', [id])
  if (!row) return null
  return { id: row.id as string, apiKey: row.api_key as string, enabled: (row.enabled as number) === 1, updatedAt: row.updated_at as string }
}

export async function listStoredProviders(db: Db): Promise<StoredProvider[]> {
  const rows = await db.query<Record<string, unknown>>('SELECT * FROM model_providers ORDER BY id')
  return rows.map((r) => ({ id: r.id as string, apiKey: r.api_key as string, enabled: (r.enabled as number) === 1, updatedAt: r.updated_at as string }))
}

export async function upsertProvider(db: Db, id: string, apiKey: string, enabled: boolean): Promise<void> {
  await db.run(
    `INSERT INTO model_providers (id, api_key, enabled) VALUES ($1, $2, $3)
     ON CONFLICT(id) DO UPDATE SET api_key = excluded.api_key, enabled = excluded.enabled, updated_at = ${db.now()}`,
    [id, apiKey, enabled ? 1 : 0],
  )
}

export async function resolveModelConfig(db: Db, endpoint: string, model: string): Promise<ModelConfig> {
  const provider = getProvider(endpoint)
  if (!provider) return { endpoint, model }
  const stored = await getStoredProvider(db, provider.id)
  return { endpoint: provider.endpoint, model, apiKey: stored?.apiKey || undefined }
}

export async function getAvailableModels(db: Db): Promise<Array<{
  providerId: string; providerName: string; enabled: boolean
  models: Array<{ id: string; name: string; contextWindow?: number }>
}>> {
  const result = []
  for (const provider of PROVIDERS) {
    if (provider.id === 'ollama') {
      const detection = await detectOllama()
      const liveModels = detection.models.map((m) => ({ id: m, name: m }))
      const knownIds = new Set(provider.models.map((m) => m.id))
      const merged = [...provider.models, ...liveModels.filter((m) => !knownIds.has(m.id))]
      result.push({ providerId: provider.id, providerName: provider.name, enabled: detection.connected, models: merged })
    } else {
      const stored = await getStoredProvider(db, provider.id)
      result.push({ providerId: provider.id, providerName: provider.name, enabled: stored?.enabled ?? false, models: provider.models })
    }
  }
  return result
}

// ---- Chat completion ----

export async function chatCompletion(
  config: ModelConfig,
  messages: ChatMessage[],
  tools?: ToolDef[],
): Promise<CompletionResponse> {
  const url = `${config.endpoint}/chat/completions`
  const body: Record<string, unknown> = { model: config.model, messages, stream: false }
  if (tools && tools.length > 0) { body.tools = tools; body.tool_choice = 'auto' }
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (config.apiKey) headers['Authorization'] = `Bearer ${config.apiKey}`

  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) })
  if (!res.ok) { const text = await res.text(); throw new Error(`Model API error ${res.status}: ${text}`) }

  const data = await res.json() as {
    choices: Array<{ message: { content: string | null; tool_calls?: ToolCall[] } }>
    usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number }
  }

  const choice = data.choices[0]
  if (!choice) throw new Error('No choices returned from model API')
  return { content: choice.message.content, tool_calls: choice.message.tool_calls ?? [], usage: data.usage }
}

// ---- Fallback support ----

export interface FallbackConfig { endpoint: string; model: string; apiKey?: string }

let fallbackConfig: FallbackConfig | null = null

export function setFallbackConfig(config: FallbackConfig): void { fallbackConfig = config }
export function getFallbackConfig(): FallbackConfig | null { return fallbackConfig }

export async function chatCompletionWithFallback(
  config: ModelConfig, messages: ChatMessage[], tools?: ToolDef[],
): Promise<CompletionResponse> {
  try {
    return await chatCompletion(config, messages, tools)
  } catch (primaryErr) {
    if (!fallbackConfig) throw primaryErr
    console.log(`[model] Primary model failed, trying fallback: ${fallbackConfig.endpoint}/${fallbackConfig.model}`)
    try {
      return await chatCompletion({ endpoint: fallbackConfig.endpoint, model: fallbackConfig.model, apiKey: fallbackConfig.apiKey }, messages, tools)
    } catch (fallbackErr) {
      throw new Error(`Primary: ${(primaryErr as Error).message}; Fallback: ${(fallbackErr as Error).message}`)
    }
  }
}

export async function detectOllama(
  endpoint = 'http://localhost:11434',
): Promise<{ connected: boolean; models: string[] }> {
  try {
    const res = await fetch(`${endpoint}/api/tags`, { signal: AbortSignal.timeout(3000) })
    if (!res.ok) return { connected: false, models: [] }
    const data = await res.json() as { models?: Array<{ name: string }> }
    return { connected: true, models: data.models?.map((m) => m.name) ?? [] }
  } catch {
    return { connected: false, models: [] }
  }
}
