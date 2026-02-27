/**
 * model.ts — Model catalog and routing
 *
 * Users pick a logical model (e.g. "MiniMax M2.5"). YokeBot routes to
 * the best available backend provider (DeepInfra, fal.ai, Ollama).
 *
 * Backend providers:
 *   - DeepInfra: all text/chat models (OpenAI-compatible)
 *   - fal.ai:    image, video, 3D generation (queue-based)
 *   - Ollama:    local models (self-hosted only, auto-discovered)
 */

import type { Db } from './db/types.ts'

// ---- Core types ----

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

// ---- Logical Model Catalog ----

export type ModelType = 'chat' | 'image' | 'video' | '3d'
export type ModelCategory = 'frontier' | 'efficient' | 'reasoning' | 'image' | 'video' | '3d' | 'local'

export interface BackendRoute {
  providerId: 'deepinfra' | 'fal' | 'ollama'
  providerModelId: string
  priority: number
}

export interface LogicalModel {
  id: string
  name: string
  description: string
  type: ModelType
  category: ModelCategory
  contextWindow?: number
  backends: BackendRoute[]
}

/**
 * The model catalog — all models YokeBot offers.
 * Each model has one or more backend routes in priority order.
 * Users see this list. Providers are invisible.
 */
export const MODEL_CATALOG: LogicalModel[] = [
  // ---- Text/Chat (via DeepInfra) ----
  {
    id: 'minimax-m2.5',
    name: 'MiniMax M2.5',
    description: 'Top-tier coding and reasoning, 1M context',
    type: 'chat',
    category: 'frontier',
    contextWindow: 1000000,
    backends: [{ providerId: 'deepinfra', providerModelId: 'MiniMaxAI/MiniMax-M2.5', priority: 1 }],
  },
  {
    id: 'qwen-3.5',
    name: 'Qwen 3.5',
    description: 'Alibaba\'s flagship MoE model, 1M context',
    type: 'chat',
    category: 'frontier',
    contextWindow: 1000000,
    backends: [{ providerId: 'deepinfra', providerModelId: 'Qwen/Qwen3.5-397B-A17B', priority: 1 }],
  },
  {
    id: 'kimi-k2.5',
    name: 'Kimi K2.5',
    description: 'Moonshot AI\'s agentic model with vision',
    type: 'chat',
    category: 'frontier',
    backends: [{ providerId: 'deepinfra', providerModelId: 'moonshotai/Kimi-K2.5', priority: 1 }],
  },
  {
    id: 'llama-4-maverick',
    name: 'Llama 4 Maverick',
    description: 'Meta\'s frontier MoE model, 1M context',
    type: 'chat',
    category: 'frontier',
    contextWindow: 1000000,
    backends: [{ providerId: 'deepinfra', providerModelId: 'meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8', priority: 1 }],
  },
  {
    id: 'llama-4-scout',
    name: 'Llama 4 Scout',
    description: 'Lightweight Llama 4 for speed-sensitive tasks',
    type: 'chat',
    category: 'efficient',
    contextWindow: 524288,
    backends: [{ providerId: 'deepinfra', providerModelId: 'meta-llama/Llama-4-Scout-17B-16E-Instruct', priority: 1 }],
  },
  {
    id: 'deepseek-r1',
    name: 'DeepSeek R1',
    description: 'Strong reasoning with chain-of-thought',
    type: 'chat',
    category: 'reasoning',
    contextWindow: 64000,
    backends: [{ providerId: 'deepinfra', providerModelId: 'deepseek-ai/DeepSeek-R1', priority: 1 }],
  },
  {
    id: 'deepseek-v3',
    name: 'DeepSeek V3',
    description: 'Efficient general-purpose model',
    type: 'chat',
    category: 'efficient',
    contextWindow: 64000,
    backends: [{ providerId: 'deepinfra', providerModelId: 'deepseek-ai/DeepSeek-V3', priority: 1 }],
  },

  // ---- Image Generation (via fal.ai) ----
  {
    id: 'nano-banana-pro',
    name: 'Nano Banana Pro',
    description: 'Google\'s image generation model, up to 4K',
    type: 'image',
    category: 'image',
    backends: [{ providerId: 'fal', providerModelId: 'fal-ai/nano-banana-pro', priority: 1 }],
  },

  // ---- Video Generation (via fal.ai) ----
  {
    id: 'kling-3.0',
    name: 'Kling 3.0',
    description: 'Kuaishou video generation, 4K 60fps, native audio',
    type: 'video',
    category: 'video',
    backends: [{ providerId: 'fal', providerModelId: 'fal-ai/kling-video/v3.0/standard/text-to-video', priority: 1 }],
  },
  {
    id: 'seedance-2.0',
    name: 'Seedance 2.0',
    description: 'ByteDance video generation with native audio',
    type: 'video',
    category: 'video',
    backends: [{ providerId: 'fal', providerModelId: 'fal-ai/bytedance/seedance/v2.0/pro/text-to-video', priority: 1 }],
  },

  // ---- 3D Generation (via fal.ai) ----
  {
    id: 'hunyuan-3d',
    name: 'Hunyuan 3D 3.1',
    description: 'Tencent 3D asset generation with PBR materials',
    type: '3d',
    category: '3d',
    backends: [{ providerId: 'fal', providerModelId: 'fal-ai/hunyuan-3d/v3.1/pro/image-to-3d', priority: 1 }],
  },
]

export function getLogicalModel(id: string): LogicalModel | undefined {
  return MODEL_CATALOG.find((m) => m.id === id)
}

// ---- Backend Provider Registry (internal — not user-facing) ----

export interface ProviderDef {
  id: string
  name: string
  endpoint: string
  requiresKey: boolean
}

export const PROVIDERS: ProviderDef[] = [
  {
    id: 'ollama',
    name: 'Ollama (Local)',
    endpoint: 'http://localhost:11434/v1',
    requiresKey: false,
  },
  {
    id: 'deepinfra',
    name: 'DeepInfra',
    endpoint: 'https://api.deepinfra.com/v1/openai',
    requiresKey: true,
  },
  {
    id: 'fal',
    name: 'fal.ai',
    endpoint: 'https://queue.fal.run',
    requiresKey: true,
  },
]

export function getProvider(id: string): ProviderDef | undefined {
  return PROVIDERS.find((p) => p.id === id)
}

// ---- Provider API key storage (self-hosted users configure via Settings) ----

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

// ---- Model Routing ----

/**
 * Hook point for /ee hosted routing override.
 * If set, this function handles model resolution instead of the default.
 */
let _hostedResolver: ((db: Db, logicalModelId: string) => Promise<ModelConfig>) | null = null

export function setHostedResolver(resolver: (db: Db, logicalModelId: string) => Promise<ModelConfig>): void {
  _hostedResolver = resolver
}

/**
 * Resolve a logical model ID to a concrete ModelConfig for making API calls.
 *
 * Open source routing (simple):
 *   1. Look up model in catalog
 *   2. For each backend, check DB for provider API key
 *   3. Ollama: check local connection
 *   4. Legacy fallback for pre-migration agents
 *
 * Hosted routing (/ee override):
 *   If setHostedResolver() was called, delegates entirely to that function.
 */
export async function resolveModelConfig(db: Db, logicalModelId: string): Promise<ModelConfig> {
  // /ee hosted override takes priority
  if (_hostedResolver) {
    return _hostedResolver(db, logicalModelId)
  }

  const logical = getLogicalModel(logicalModelId)

  // Legacy fallback: if this is an old-style provider ID (e.g. "deepinfra", "ollama"),
  // treat it as the old (endpoint, model) pair for backward compat
  if (!logical) {
    return resolveLegacyModelConfig(db, logicalModelId)
  }

  // Iterate backends by priority
  const sortedBackends = [...logical.backends].sort((a, b) => a.priority - b.priority)

  for (const backend of sortedBackends) {
    const provider = getProvider(backend.providerId)
    if (!provider) continue

    // Ollama: check if running locally
    if (backend.providerId === 'ollama') {
      const detection = await detectOllama()
      if (detection.connected) {
        return { endpoint: provider.endpoint, model: backend.providerModelId }
      }
      continue
    }

    // Cloud providers: check DB for API key (self-hosted users enter keys in Settings)
    const stored = await getStoredProvider(db, backend.providerId)
    if (stored?.enabled && stored.apiKey) {
      return { endpoint: provider.endpoint, model: backend.providerModelId, apiKey: stored.apiKey }
    }
  }

  throw new Error(
    `No provider available for model "${logical.name}". ` +
    `Configure a provider API key in Settings → Model Providers.`,
  )
}

/**
 * Legacy resolver for pre-migration agents that store (model_endpoint, model_name).
 * Handles old-style provider IDs like "deepinfra", "ollama", "together", "openai".
 */
async function resolveLegacyModelConfig(db: Db, endpointOrId: string): Promise<ModelConfig> {
  const provider = getProvider(endpointOrId)
  if (provider) {
    if (!provider.requiresKey) {
      return { endpoint: provider.endpoint, model: endpointOrId }
    }
    const stored = await getStoredProvider(db, provider.id)
    return { endpoint: provider.endpoint, model: endpointOrId, apiKey: stored?.apiKey || undefined }
  }

  // Old Together/OpenAI references — check DB
  const legacyProviders: Record<string, string> = {
    together: 'https://api.together.xyz/v1',
    openai: 'https://api.openai.com/v1',
  }
  if (legacyProviders[endpointOrId]) {
    const stored = await getStoredProvider(db, endpointOrId)
    return { endpoint: legacyProviders[endpointOrId], model: endpointOrId, apiKey: stored?.apiKey || undefined }
  }

  // Raw URL fallback
  return { endpoint: endpointOrId, model: endpointOrId }
}

// ---- Available Models (what users see in the model picker) ----

/**
 * Returns the flat list of models available for agent configuration.
 * Only includes models that have at least one working backend.
 * Ollama models are auto-discovered and merged in.
 */
export async function getAvailableModels(db: Db): Promise<LogicalModel[]> {
  const available: LogicalModel[] = []

  // Check which cloud providers have keys configured
  const providerKeys = new Map<string, boolean>()
  for (const provider of PROVIDERS) {
    if (!provider.requiresKey) continue
    const stored = await getStoredProvider(db, provider.id)
    providerKeys.set(provider.id, !!(stored?.enabled && stored.apiKey))
  }

  // Filter catalog to models with at least one available backend
  for (const model of MODEL_CATALOG) {
    const hasBackend = model.backends.some((b) => {
      if (b.providerId === 'ollama') return false // Ollama checked separately
      return providerKeys.get(b.providerId) === true
    })
    if (hasBackend) {
      available.push(model)
    }
  }

  // Auto-discover Ollama models
  const ollama = await detectOllama()
  if (ollama.connected) {
    for (const modelName of ollama.models) {
      available.push({
        id: `ollama:${modelName}`,
        name: `${modelName} (Local)`,
        description: 'Running locally via Ollama',
        type: 'chat',
        category: 'local',
        backends: [{ providerId: 'ollama', providerModelId: modelName, priority: 1 }],
      })
    }
  }

  return available
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
