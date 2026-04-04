/**
 * model.ts — Model catalog and routing
 *
 * Users pick a logical model (e.g. "MiniMax M2.5"). YokeBot routes to
 * the best available backend provider (DeepInfra, fal.ai, Ollama).
 *
 * Backend providers:
 *   - DeepInfra:     text/chat models (OpenAI-compatible)
 *   - OpenAI:        GPT models
 *   - xAI:           Grok models
 *   - Fireworks AI:  Devstral, GLM and other hosted models
 *   - Together AI:   Devstral and other hosted models
 *   - fal.ai:        image, video, 3D generation (queue-based)
 *   - Ollama:        local models (self-hosted only, auto-discovered)
 */

import type { Db } from './db/types.ts'
import { encryptValue, decryptValue } from './credentials.ts'

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

export type ModelType = 'chat' | 'image' | 'video' | '3d' | 'stt' | 'audio' | 'embedding'
export type ModelCategory = 'frontier' | 'efficient' | 'reasoning' | 'image' | 'video' | '3d' | 'local' | 'stt' | 'audio' | 'embedding'

export interface BackendRoute {
  providerId: 'deepinfra' | 'fal' | 'ollama' | 'openai' | 'xai' | 'fireworks' | 'together' | 'openrouter'
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
  // ---- Text/Chat — Frontier tier ----
  {
    id: 'gemma-4-31b',
    name: 'Gemma 4 31B',
    description: 'Google DeepMind flagship — 85% MMLU, 80% LiveCode, 256K context, native function calling, vision, thinking mode, 140 languages. Cheaper than DeepSeek V3.2.',
    type: 'chat',
    category: 'frontier',
    contextWindow: 256000,
    backends: [
      { providerId: 'openrouter', providerModelId: 'google/gemma-4-31b-it', priority: 1 },
    ],
  },

  // ---- Text/Chat — Mid tier ----
  {
    id: 'llama-4-maverick',
    name: 'Llama 4 Maverick',
    description: 'Versatile workhorse for creative content',
    type: 'chat',
    category: 'frontier',
    contextWindow: 1000000,
    backends: [{ providerId: 'deepinfra', providerModelId: 'meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8', priority: 1 }],
  },
  {
    id: 'deepseek-v3.2',
    name: 'DeepSeek V3.2',
    description: 'Bargain genius — gold-medal reasoning at budget price',
    type: 'chat',
    category: 'frontier',
    contextWindow: 128000,
    backends: [{ providerId: 'deepinfra', providerModelId: 'deepseek-ai/DeepSeek-V3.2', priority: 1 }],
  },
  {
    id: 'nemotron-3-super',
    name: 'Nemotron 3 Super',
    description: 'NVIDIA agentic powerhouse — 12B active params, 1M context, 5x throughput, built for multi-step tool calling',
    type: 'chat',
    category: 'efficient',
    contextWindow: 1000000,
    backends: [
      { providerId: 'deepinfra', providerModelId: 'nvidia/NVIDIA-Nemotron-3-Super-120B-A12B', priority: 1 },
      { providerId: 'openrouter', providerModelId: 'nvidia/nemotron-3-super-120b-a12b', priority: 2 },
    ],
  },
  {
    id: 'minimax-m2.5',
    name: 'MiniMax M2.5',
    description: 'Orchestrator for complex multi-step workflows',
    type: 'chat',
    category: 'frontier',
    contextWindow: 1000000,
    backends: [{ providerId: 'deepinfra', providerModelId: 'MiniMaxAI/MiniMax-M2.5', priority: 1 }],
  },

  // ---- Text/Chat — Mid tier ----
  {
    id: 'qwen-3.5-27b',
    name: 'Qwen 3.5 27B',
    description: 'Strong coder and reasoner — SWE-bench 72.4, 262K context, Apache 2.0, cheaper than DeepSeek V3.2',
    type: 'chat',
    category: 'frontier',
    contextWindow: 262000,
    backends: [
      { providerId: 'openrouter', providerModelId: 'qwen/qwen3.5-27b', priority: 1 },
    ],
  },

  // ---- Text/Chat — Efficient tier (budget-friendly, fast) ----
  {
    id: 'qwen-3.5-9b',
    name: 'Qwen 3.5 9B',
    description: 'Budget powerhouse — 80% cheaper than DeepSeek V3.2, great for simple agent tasks',
    type: 'chat',
    category: 'efficient',
    contextWindow: 262000,
    backends: [
      { providerId: 'openrouter', providerModelId: 'qwen/qwen3.5-9b', priority: 1 },
      { providerId: 'together', providerModelId: 'Qwen/Qwen3.5-9B', priority: 2 },
    ],
  },
  {
    id: 'step-3.5-flash',
    name: 'Step 3.5 Flash',
    description: 'Best price-to-performance — 66% cheaper than DS V3.2, faster, 256K context, strong tool calling',
    type: 'chat',
    category: 'efficient',
    contextWindow: 256000,
    backends: [
      { providerId: 'openrouter', providerModelId: 'stepfun/step-3.5-flash', priority: 1 },
    ],
  },
  {
    id: 'mimo-v2-flash',
    name: 'MiMo-V2-Flash',
    description: '#1 open-source on SWE-bench — 309B MoE (15B active), hybrid reasoning, 262K context, 3.5% the cost of Sonnet',
    type: 'chat',
    category: 'reasoning',
    contextWindow: 262000,
    backends: [
      { providerId: 'openrouter', providerModelId: 'xiaomi/mimo-v2-flash', priority: 1 },
    ],
  },
  {
    id: 'mimo-v2-pro',
    name: 'MiMo-V2-Pro',
    description: 'Xiaomi flagship — 1T+ MoE (42B active), 78% SWE-bench, #3 ClawEval, fine-tuned for agentic tool calling, 1M context',
    type: 'chat',
    category: 'reasoning',
    contextWindow: 1000000,
    backends: [
      { providerId: 'openrouter', providerModelId: 'xiaomi/mimo-v2-pro', priority: 1 },
    ],
  },
  {
    id: 'qwen-3.6-plus',
    name: 'Qwen 3.6 Plus',
    description: 'Alibaba flagship — hybrid linear attention + sparse MoE, 78.8% SWE-bench, 1M context, optimized for agentic coding',
    type: 'chat',
    category: 'frontier',
    contextWindow: 1000000,
    backends: [
      { providerId: 'openrouter', providerModelId: 'qwen/qwen3.6-plus:free', priority: 1 },
    ],
  },
  {
    id: 'mercury-2',
    name: 'Mercury 2',
    description: 'Speed king — 1000 tokens/sec, diffusion-based architecture, great for real-time interactions',
    type: 'chat',
    category: 'efficient',
    contextWindow: 128000,
    backends: [
      { providerId: 'openrouter', providerModelId: 'inception/mercury-2', priority: 1 },
    ],
  },
  {
    id: 'grok-4.1-fast',
    name: 'Grok 4.1 Fast',
    description: 'xAI agentic model — 2M context window, optimized for tool calling',
    type: 'chat',
    category: 'frontier',
    contextWindow: 2000000,
    backends: [
      { providerId: 'openrouter', providerModelId: 'x-ai/grok-4.1-fast', priority: 1 },
    ],
  },

  // ---- Text/Chat — Frontier tier ----
  {
    id: 'glm-5',
    name: 'GLM-5',
    description: 'Frontier powerhouse for research and agentic work',
    type: 'chat',
    category: 'frontier',
    contextWindow: 200000,
    backends: [
      { providerId: 'deepinfra', providerModelId: 'zai-org/GLM-5', priority: 1 },
      { providerId: 'fireworks', providerModelId: 'accounts/fireworks/models/glm-5', priority: 2 },
      { providerId: 'openrouter', providerModelId: 'z-ai/glm-5', priority: 3 },
    ],
  },
  {
    id: 'kimi-k2.5',
    name: 'Kimi K2.5',
    description: 'Deep thinker for research and long-document analysis',
    type: 'chat',
    category: 'frontier',
    backends: [{ providerId: 'deepinfra', providerModelId: 'moonshotai/Kimi-K2.5', priority: 1 }],
  },
  {
    id: 'qwen-3.5',
    name: 'Qwen 3.5',
    description: 'Ultimate brain for the hardest tasks',
    type: 'chat',
    category: 'frontier',
    contextWindow: 1000000,
    backends: [
      { providerId: 'deepinfra', providerModelId: 'Qwen/Qwen3.5-397B-A17B', priority: 1 },
      { providerId: 'openrouter', providerModelId: 'qwen/qwen3.5-397b-a17b', priority: 2 },
    ],
  },

  // ---- Image Generation (via fal.ai) ----
  {
    id: 'flux-schnell',
    name: 'Flux Schnell',
    description: 'Fast budget image generation',
    type: 'image',
    category: 'image',
    backends: [{ providerId: 'fal', providerModelId: 'fal-ai/flux/schnell', priority: 1 }],
  },
  {
    id: 'flux-2-dev',
    name: 'FLUX.2 [dev]',
    description: 'High-quality image generation at mid-range price',
    type: 'image',
    category: 'image',
    backends: [{ providerId: 'fal', providerModelId: 'fal-ai/flux-2/dev', priority: 1 }],
  },
  {
    id: 'seedream-5.0-lite',
    name: 'Seedream 5.0 Lite',
    description: 'ByteDance image gen with web search and reasoning',
    type: 'image',
    category: 'image',
    backends: [{ providerId: 'fal', providerModelId: 'fal-ai/bytedance/seedream/v5.0/text-to-image', priority: 1 }],
  },
  {
    id: 'nano-banana-pro',
    name: 'Nano Banana Pro',
    description: 'Premium image generation, up to 4K',
    type: 'image',
    category: 'image',
    backends: [{ providerId: 'fal', providerModelId: 'fal-ai/nano-banana-pro', priority: 1 }],
  },
  {
    id: 'nano-banana-2',
    name: 'Nano Banana 2',
    description: 'Pro-quality image gen at Flash speed — excellent text rendering, character consistency, native 4K',
    type: 'image',
    category: 'image',
    backends: [{ providerId: 'fal', providerModelId: 'fal-ai/nano-banana-2', priority: 1 }],
  },

  {
    id: 'flux-2-klein',
    name: 'FLUX.2 Klein',
    description: 'Ultra-cheap image generation — great for prototyping and batch work',
    type: 'image',
    category: 'image',
    backends: [{ providerId: 'fal', providerModelId: 'fal-ai/flux-2/klein/4b', priority: 1 }],
  },
  {
    id: 'qwen-image-2.0',
    name: 'Qwen Image 2.0',
    description: 'Affordable high-quality image generation + editing in one model',
    type: 'image',
    category: 'image',
    backends: [{ providerId: 'fal', providerModelId: 'fal-ai/qwen-image-2/text-to-image', priority: 1 }],
  },
  {
    id: 'seedream-4.5',
    name: 'Seedream 4.5',
    description: 'ByteDance mid-tier image gen — solid quality at a fair price',
    type: 'image',
    category: 'image',
    backends: [{ providerId: 'fal', providerModelId: 'fal-ai/bytedance/seedream/v4.5/text-to-image', priority: 1 }],
  },

  // ---- Image Editing (via fal.ai) ----
  {
    id: 'firered-image-edit',
    name: 'FireRed Image Edit',
    description: 'Instruction-based image editing — style transfer, object removal, text overlay',
    type: 'image',
    category: 'image',
    backends: [{ providerId: 'fal', providerModelId: 'fal-ai/firered-image-edit', priority: 1 }],
  },
  {
    id: 'qwen-multi-angles',
    name: 'Qwen Multi-Angles',
    description: 'Render any image from 96 camera angles — product photography, e-commerce multi-view',
    type: 'image',
    category: 'image',
    backends: [{ providerId: 'fal', providerModelId: 'fal-ai/qwen-image-edit-2511-multiple-angles', priority: 1 }],
  },

  // ---- Video Generation (via fal.ai) ----
  {
    id: 'kling-3.0',
    name: 'Kling 3.0 Pro',
    description: 'Multi-shot cinematic sequences (up to 6 shots), character consistency — premium quality',
    type: 'video',
    category: 'video',
    backends: [{ providerId: 'fal', providerModelId: 'fal-ai/kling-video/v3.0/pro/text-to-video', priority: 1 }],
  },
  {
    id: 'wan-2.6',
    name: 'Wan 2.6',
    description: 'Alibaba open-source video gen — budget option, 15s clips, native audio',
    type: 'video',
    category: 'video',
    backends: [{ providerId: 'fal', providerModelId: 'fal-ai/wan/v2.6/image-to-video', priority: 1 }],
  },

  // ---- 3D Generation (via fal.ai) ----
  {
    id: 'hunyuan-3d-v3.1-pro',
    name: 'Hunyuan 3D 3.1',
    description: 'Tencent 3D asset generation with PBR materials',
    type: '3d',
    category: '3d',
    backends: [{ providerId: 'fal', providerModelId: 'fal-ai/hunyuan-3d/v3.1/pro/image-to-3d', priority: 1 }],
  },

  // ---- Speech-to-Text ----
  {
    id: 'voxtral-mini-realtime',
    name: 'Voxtral Mini 4B Realtime',
    description: 'Real-time streaming speech-to-text, <500ms latency, 13 languages',
    type: 'stt',
    category: 'stt',
    backends: [{ providerId: 'deepinfra', providerModelId: 'mistralai/Voxtral-Mini-4B-Realtime-2602', priority: 1 }],
  },

  // ---- Audio Generation (via fal.ai) ----
  {
    id: 'ace-step',
    name: 'ACE-Step 1.5',
    description: 'AI music generation — full songs with lyrics, any genre',
    type: 'audio',
    category: 'audio',
    backends: [{ providerId: 'fal', providerModelId: 'fal-ai/ace-step', priority: 1 }],
  },
  {
    id: 'mirelo-sfx',
    name: 'Mirelo SFX',
    description: 'Premium sound effects and foley — 70% win rate over competitors in blind tests',
    type: 'audio',
    category: 'audio',
    backends: [{ providerId: 'fal', providerModelId: 'mirelo-ai/sfx-v1/video-to-audio', priority: 1 }],
  },

  // ---- Embeddings ----
  {
    id: 'qwen3-embedding-8b',
    name: 'Qwen3 Embedding 8B',
    description: 'MTEB #1 multilingual embeddings for semantic search and knowledge base',
    type: 'embedding',
    category: 'embedding',
    backends: [{ providerId: 'deepinfra', providerModelId: 'Qwen/Qwen3-Embedding-8B', priority: 1 }],
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
  {
    id: 'openai',
    name: 'OpenAI',
    endpoint: 'https://api.openai.com/v1',
    requiresKey: true,
  },
  {
    id: 'xai',
    name: 'xAI',
    endpoint: 'https://api.x.ai/v1',
    requiresKey: true,
  },
  {
    id: 'fireworks',
    name: 'Fireworks AI',
    endpoint: 'https://api.fireworks.ai/inference/v1',
    requiresKey: true,
  },
  {
    id: 'together',
    name: 'Together AI',
    endpoint: 'https://api.together.xyz/v1',
    requiresKey: true,
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    endpoint: 'https://openrouter.ai/api/v1',
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
  const rawKey = row.api_key as string
  const apiKey = (rawKey.startsWith('enc:') || rawKey.startsWith('plain:')) ? decryptValue(rawKey) : rawKey
  return { id: row.id as string, apiKey, enabled: (row.enabled as number) === 1, updatedAt: row.updated_at as string }
}

export async function listStoredProviders(db: Db): Promise<StoredProvider[]> {
  const rows = await db.query<Record<string, unknown>>('SELECT * FROM model_providers ORDER BY id')
  return rows.map((r) => {
    const rawKey = r.api_key as string
    const apiKey = (rawKey.startsWith('enc:') || rawKey.startsWith('plain:')) ? decryptValue(rawKey) : rawKey
    return { id: r.id as string, apiKey, enabled: (r.enabled as number) === 1, updatedAt: r.updated_at as string }
  })
}

export async function upsertProvider(db: Db, id: string, apiKey: string, enabled: boolean): Promise<void> {
  const encryptedKey = apiKey ? encryptValue(apiKey) : ''
  await db.run(
    `INSERT INTO model_providers (id, api_key, enabled) VALUES ($1, $2, $3)
     ON CONFLICT(id) DO UPDATE SET api_key = excluded.api_key, enabled = excluded.enabled, updated_at = ${db.now()}`,
    [id, encryptedKey, enabled ? 1 : 0],
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

    // Cloud providers: check env var first, then DB fallback
    const envKey = process.env[`${backend.providerId.toUpperCase()}_API_KEY`]
    if (envKey) {
      return { endpoint: provider.endpoint, model: backend.providerModelId, apiKey: envKey }
    }
    const stored = await getStoredProvider(db, backend.providerId)
    if (stored?.enabled && stored.apiKey) {
      return { endpoint: provider.endpoint, model: backend.providerModelId, apiKey: stored.apiKey }
    }
  }

  throw new Error(
    `No provider available for model "${logical.name}". ` +
    `Set a provider API key via environment variable (e.g. DEEPINFRA_API_KEY).`,
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

  // Check which cloud providers have keys configured (env var first, DB fallback)
  const providerKeys = new Map<string, boolean>()
  for (const provider of PROVIDERS) {
    if (!provider.requiresKey) continue
    const envKey = `${provider.id.toUpperCase()}_API_KEY`
    if (process.env[envKey]) {
      providerKeys.set(provider.id, true)
    } else {
      const stored = await getStoredProvider(db, provider.id)
      providerKeys.set(provider.id, !!(stored?.enabled && stored.apiKey))
    }
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

const LLM_TIMEOUT_MS = 120_000  // 120s — large context + many tools can take a while
const LLM_MAX_RETRIES = 3     // 3 retries with exponential backoff
const LLM_BASE_DELAY_MS = 2_000  // 2s → 4s → 8s

function retryDelay(attempt: number): number {
  return LLM_BASE_DELAY_MS * Math.pow(2, attempt) // exponential backoff
}

function isRetryableStatus(status: number): boolean {
  return status >= 500 || status === 429 || status === 408
}

export async function chatCompletion(
  config: ModelConfig,
  messages: ChatMessage[],
  tools?: ToolDef[],
): Promise<CompletionResponse> {
  const url = `${config.endpoint}/chat/completions`

  // Check for native tool format adapter (e.g. Qwen 3.5, DeepSeek DSML)
  const adapter = getToolAdapter(config.model)
  let actualMessages = messages
  let useNativeTools = true // true = send tools in OpenAI API format

  if (adapter && tools && tools.length > 0) {
    const result = applyNativeToolFormat(adapter, messages, tools)
    actualMessages = result.messages
    useNativeTools = result.useNativeTools
    if (!useNativeTools) {
      console.log(`[model] Using native tool format adapter: ${adapter.id} for ${config.model}`)
    }
  }

  const body: Record<string, unknown> = { model: config.model, messages: actualMessages, stream: false }
  if (tools && tools.length > 0 && useNativeTools) {
    body.tools = tools
    // OpenRouter: many providers don't support tool_choice 'required' — use 'auto'
    body.tool_choice = config.endpoint.includes('openrouter.ai') ? 'auto' : 'required'
  }
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (config.apiKey) headers['Authorization'] = `Bearer ${config.apiKey}`
  // OpenRouter requires HTTP-Referer and X-Title for rate limit attribution
  // Also set provider preferences to avoid overloaded providers
  if (config.endpoint.includes('openrouter.ai')) {
    headers['HTTP-Referer'] = 'https://yokebot.com'
    headers['X-Title'] = 'YokeBot'
    // Provider routing available if needed: body.provider = { order: ['Novita'], allow_fallbacks: true }
  }

  let lastErr: Error | null = null
  for (let attempt = 0; attempt <= LLM_MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(LLM_TIMEOUT_MS) })

      // Retry on 5xx, 429 (rate limit), 408 (timeout)
      if (isRetryableStatus(res.status) && attempt < LLM_MAX_RETRIES) {
        const text = await res.text()
        const delay = retryDelay(attempt)
        console.log(`[model] Retry ${attempt + 1}/${LLM_MAX_RETRIES} after ${res.status} (waiting ${delay}ms): ${text.slice(0, 100)}`)
        await new Promise(r => setTimeout(r, delay))
        continue
      }

      if (!res.ok) { const text = await res.text(); throw new Error(`Model API error ${res.status}: ${text}`) }

      const data = await res.json() as {
        choices: Array<{ message: { content: string | null; tool_calls?: ToolCall[] } }>
        usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number }
      }

      const choice = data.choices[0]
      if (!choice) throw new Error('No choices returned from model API')

      let content = choice.message.content
      let toolCalls = choice.message.tool_calls ?? []

      // Try to recover tool calls from text content using the adapter's parser
      if (adapter && content && toolCalls.length === 0) {
        const parsed = adapter.parseToolCalls(content)
        if (parsed.length > 0) {
          toolCalls = parsed
          content = adapter.stripMarkup(content) || null
          console.log(`[model] ${adapter.id} adapter recovered ${parsed.length} tool call(s) from text content`)
        }
      }

      // Safety net: strip any leaked XML tool markup from content before returning
      // This prevents raw tags like <function=think> from appearing in chat
      if (content && (content.includes('<function=') || content.includes('<tool_call>') || content.includes('<parameter='))) {
        if (toolCalls.length === 0) {
          console.log(`[model] WARNING: Content has tool markup but no tool calls parsed. Raw content (first 500 chars): ${content.slice(0, 500)}`)
        }
        if (adapter) {
          content = adapter.stripMarkup(content) || null
        } else {
          // Generic cleanup for models without an adapter
          content = content
            .replace(/<tool_call>[\s\S]*?<\/tool_call>/g, '')
            .replace(/<function=[^>]*>[\s\S]*?<\/function>/g, '')
            .replace(/<function=[^>]*>/g, '')
            .replace(/<\/function>/g, '')
            .replace(/<tool_call>/g, '')
            .replace(/<\/tool_call>/g, '')
            .trim() || null
        }
      }

      return { content, tool_calls: toolCalls, usage: data.usage }
    } catch (err) {
      lastErr = err as Error
      const isTimeout = lastErr.name === 'TimeoutError' || lastErr.name === 'AbortError'
      if (isTimeout && attempt < LLM_MAX_RETRIES) {
        const delay = retryDelay(attempt)
        console.log(`[model] Retry ${attempt + 1}/${LLM_MAX_RETRIES} after timeout (waiting ${delay}ms)`)
        await new Promise(r => setTimeout(r, delay))
        continue
      }
      throw lastErr
    }
  }
  throw lastErr ?? new Error('Chat completion failed')
}

// ---- Native Tool Format Adapters ----
// Many models are trained on specific tool-call formats (Hermes, Qwen3-Coder XML, DSML, etc.)
// that differ from the OpenAI standard. When these models are served through proxies like
// OpenRouter, the provider may not translate correctly — causing tool calls to fail silently.
//
// Adapters solve this by:
//   1. Injecting tool definitions into the system prompt in the model's native format
//   2. Sending the request WITHOUT the OpenAI `tools` parameter (plain text completion)
//   3. Parsing tool calls from the model's text output back into standard ToolCall[]
//
// This gives us reliable tool calling on cheap models that otherwise choke on OpenAI format.

interface ToolFormatAdapter {
  id: string
  /** Returns true if this adapter should handle the given provider model ID */
  matches(providerModelId: string): boolean
  /** Build a system prompt section describing available tools in the model's native format */
  formatToolPrompt(tools: ToolDef[]): string
  /** Format a single tool call in this adapter's native format (for conversation history) */
  formatToolCall(name: string, args: Record<string, unknown>): string
  /** Parse tool calls from model text output; returns parsed calls and cleaned content */
  parseToolCalls(text: string): ToolCall[]
  /** Regex or marker to strip parsed tool call markup from content */
  stripMarkup(text: string): string
}

// ---- YokeBot Adapter (JSON-in-tags format) ----
// Universal tool format for models that don't support OpenAI tool calling natively.
// Uses JSON inside <tool_call> tags — simpler and more reliable than XML parameter formats,
// especially for complex nested arguments (file arrays, code content, etc.).
// Format: <tool_call>{"name": "tool_name", "arguments": {"key": "value"}}</tool_call>

/** Parse <parameter name="key">value</parameter> or <parameter=key>value</parameter> from an XML body */
function parseXmlParams(body: string): Record<string, unknown> {
  const params: Record<string, unknown> = {}
  // Match both <parameter name="key"> and <parameter=key> formats
  const paramRegex = /<parameter(?:\s+name="([^"]+)"|=([^>]+))>([\s\S]*?)<\/parameter>/g
  let paramMatch
  while ((paramMatch = paramRegex.exec(body)) !== null) {
    const paramName = (paramMatch[1] || paramMatch[2]).trim()
    let paramValue: unknown = paramMatch[3].trim()
    if (typeof paramValue === 'string') {
      if (paramValue.startsWith('{') || paramValue.startsWith('[')) {
        try { paramValue = JSON.parse(paramValue) } catch { /* keep as string */ }
      } else if (paramValue === 'true') { paramValue = true }
      else if (paramValue === 'false') { paramValue = false }
      else if (/^-?\d+(\.\d+)?$/.test(paramValue)) { paramValue = Number(paramValue) }
    }
    params[paramName] = paramValue
  }
  return params
}

const yokebotAdapter: ToolFormatAdapter = {
  id: 'yokebot',

  matches(modelId: string): boolean {
    const id = modelId.toLowerCase()
    // Models that need native tool format (don't support OpenAI tools reliably via proxy)
    // NOTE: Nemotron removed — it uses Qwen3-Coder XML format natively, and DeepInfra/OpenRouter
    // handle the translation via their tool parsers. Our JSON-in-tags format caused 36x duplicate spam.
    return id.includes('qwen3.5') || id.includes('qwen3-5')
  },

  formatToolPrompt(tools: ToolDef[]): string {
    // Describe tools in JSON schema format inside <tools> block
    const toolSchemas = tools.map((t) => ({
      type: 'function',
      function: {
        name: t.function.name,
        description: t.function.description,
        parameters: t.function.parameters,
      },
    }))

    return `You are a function calling AI model. You are provided with function signatures within <tools></tools> XML tags. You may call one or more functions to assist with the user query. Don't make assumptions about what values to plug into functions.

<tools>
${JSON.stringify(toolSchemas, null, 2)}
</tools>

For each function call, return a JSON object with the function name and arguments within <tool_call></tool_call> XML tags:
<tool_call>
{"name": "<function-name>", "arguments": <args-dict>}
</tool_call>

RULES:
1. ALWAYS call at least one tool when you have a task to do. Never describe what you would do — ACT by calling tools.
2. You MUST respond to the user by calling the "respond" tool with a "message" argument. Do NOT write a plain text response. Only call respond when you have FULLY completed the task.
3. You may call multiple tools by outputting multiple <tool_call> blocks.
4. The "arguments" value must be a valid JSON object with the correct parameter names and types.
5. ALWAYS use the "think" tool first to plan your approach before taking action.
6. Do NOT claim you cannot use a tool. You have full access to ALL listed tools. If a tool exists in the list above, you CAN use it.
7. For multi-step tasks, keep calling tools until the task is FULLY complete. Do NOT respond after just 1-2 steps.

## Example: Browsing a website (multi-step)

User: "Check out example.com and tell me what's on it"

Step 1 — Think and navigate:
<tool_call>
{"name": "think", "arguments": {"thought": "I need to navigate to example.com, explore the site, then report my findings."}}
</tool_call>
<tool_call>
{"name": "browser_navigate", "arguments": {"url": "https://example.com"}}
</tool_call>

Step 2 — After seeing the page snapshot, click to explore more:
<tool_call>
{"name": "browser_click", "arguments": {"ref": "About Us"}}
</tool_call>

Step 3 — After exploring multiple pages, respond with findings:
<tool_call>
{"name": "respond", "arguments": {"message": "Here's what I found on example.com: ..."}}
</tool_call>

## Example: Writing code

User: "Build a hello world app"

Step 1 — Think and check existing files:
<tool_call>
{"name": "think", "arguments": {"thought": "I need to scaffold a new app. Let me check what exists first."}}
</tool_call>
<tool_call>
{"name": "sandbox_list_files", "arguments": {"directory": "/home/daytona/app"}}
</tool_call>

Step 2 — Write the code:
<tool_call>
{"name": "sandbox_write_file", "arguments": {"path": "/home/daytona/app/src/App.tsx", "content": "export default function App() { return <h1>Hello World</h1> }"}}
</tool_call>

Step 3 — Respond when done:
<tool_call>
{"name": "respond", "arguments": {"message": "I've built the hello world app! Check the preview."}}
</tool_call>`
  },

  formatToolCall(name: string, args: Record<string, unknown>): string {
    return `<tool_call>\n${JSON.stringify({ name, arguments: args })}\n</tool_call>`
  },

  parseToolCalls(text: string): ToolCall[] {
    const calls: ToolCall[] = []

    // Primary: match <tool_call>{...}</tool_call> blocks
    const blockRegex = /<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/g
    let match
    while ((match = blockRegex.exec(text)) !== null) {
      const jsonStr = match[1].trim()
      try {
        const parsed = JSON.parse(jsonStr) as { name: string; arguments: Record<string, unknown> }
        if (parsed.name) {
          calls.push({
            id: `yokebot-${Date.now()}-${calls.length}`,
            type: 'function',
            function: {
              name: parsed.name,
              arguments: JSON.stringify(parsed.arguments ?? {}),
            },
          })
        }
      } catch {
        // JSON parse failed — try to extract name and arguments with regex fallback
        const nameMatch = jsonStr.match(/"name"\s*:\s*"([^"]+)"/)
        const argsMatch = jsonStr.match(/"arguments"\s*:\s*(\{[\s\S]*\})/)
        if (nameMatch) {
          calls.push({
            id: `yokebot-${Date.now()}-${calls.length}`,
            type: 'function',
            function: {
              name: nameMatch[1],
              arguments: argsMatch?.[1] ?? '{}',
            },
          })
        }
      }
    }

    // Fallback: catch qwen3-coder XML format — <function=NAME><parameter=NAME>value</parameter></function>
    if (calls.length === 0) {
      const funcRegex = /<function=([^>]+)>([\s\S]*?)(?:<\/function>|<\/tool_call>)/g
      while ((match = funcRegex.exec(text)) !== null) {
        const toolName = match[1].trim()
        const body = match[2]
        const params = parseXmlParams(body)
        calls.push({
          id: `yokebot-fallback-${Date.now()}-${calls.length}`,
          type: 'function',
          function: { name: toolName, arguments: JSON.stringify(params) },
        })
      }
    }

    // Fallback: catch Claude/invoke XML format — <invoke name="NAME"><parameter name="NAME">value</parameter></invoke>
    // Also catches <function name="NAME"><parameter name="NAME">value</parameter></function>
    if (calls.length === 0) {
      const invokeRegex = /<(?:invoke|function)\s+name="([^"]+)">([\s\S]*?)<\/(?:invoke|function)>/g
      while ((match = invokeRegex.exec(text)) !== null) {
        const toolName = match[1].trim()
        const body = match[2]
        const params = parseXmlParams(body)
        calls.push({
          id: `yokebot-fallback-${Date.now()}-${calls.length}`,
          type: 'function',
          function: { name: toolName, arguments: JSON.stringify(params) },
        })
      }
    }

    return calls
  },

  stripMarkup(text: string): string {
    return text
      .replace(/<tool_call>[\s\S]*?<\/tool_call>/g, '')  // closed JSON blocks
      .replace(/<tool_call>[\s\S]*$/g, '')                // unclosed trailing block
      .replace(/<function=[^>]*>[\s\S]*?<\/function>/g, '') // qwen3-coder fallback blocks
      .replace(/<function=[^>]*>[\s\S]*$/g, '')           // unclosed fallback
      .replace(/<invoke\s+name="[^"]*">[\s\S]*?<\/invoke>/g, '') // claude/invoke blocks
      .replace(/<invoke\s+name="[^"]*">[\s\S]*$/g, '')    // unclosed invoke
      .replace(/<function\s+name="[^"]*">[\s\S]*?<\/function>/g, '') // named function blocks
      .replace(/<function\s+name="[^"]*">[\s\S]*$/g, '')  // unclosed named function
      .replace(/<function_calls>[\s\S]*?<\/function_calls>/g, '') // function_calls wrapper
      .replace(/<function_calls>[\s\S]*$/g, '')            // unclosed wrapper
      .replace(/<\/function>/g, '')
      .replace(/<\/tool_call>/g, '')
      .replace(/<\/invoke>/g, '')
      .replace(/<\/function_calls>/g, '')
      .replace(/<parameter[^>]*>[\s\S]*?<\/parameter>/g, '')
      .replace(/<\/parameter>/g, '')
      .trim()
  },
}

// ---- DSML Adapter (DeepSeek internal format) ----
// DeepSeek models sometimes output their internal function-call format (DSML tags) as text
// instead of proper OpenAI-compatible tool_calls. This parser recovers them.
// Unlike Qwen 3.5, DeepSeek DOES support OpenAI tools natively — DSML is just a fallback
// for when it glitches and dumps internal format as text. So this adapter only parses responses,
// it doesn't inject tools into the system prompt.

const dsmlAdapter: ToolFormatAdapter = {
  id: 'dsml',

  matches(modelId: string): boolean {
    return modelId.toLowerCase().includes('deepseek')
  },

  formatToolPrompt(_tools: ToolDef[]): string {
    // DeepSeek supports OpenAI tools natively — no system prompt injection needed
    return ''
  },

  formatToolCall(name: string, args: Record<string, unknown>): string {
    // DeepSeek uses native OpenAI format — this shouldn't be called (formatToolPrompt returns empty)
    return `<tool_call>\n${JSON.stringify({ name, arguments: args })}\n</tool_call>`
  },

  parseToolCalls(text: string): ToolCall[] {
    const calls: ToolCall[] = []
    const invokeRegex = /<[｜|]DSML[｜|]invoke\s+name="([^"]+)"[^>]*>([\s\S]*?)(?:<[｜|]DSML[｜|]\/invoke>|<\/[｜|]DSML[｜|]invoke>|$)/g
    let match
    while ((match = invokeRegex.exec(text)) !== null) {
      const toolName = match[1]
      const body = match[2]
      const params: Record<string, unknown> = {}

      const paramRegex = /<[｜|]DSML[｜|]parameter\s+name="([^"]+)"[^>]*>([\s\S]*?)(?:<[｜|]DSML[｜|]\/parameter>|<\/[｜|]DSML[｜|]parameter>)/g
      let paramMatch
      while ((paramMatch = paramRegex.exec(body)) !== null) {
        const paramName = paramMatch[1]
        let paramValue: unknown = paramMatch[2].trim()
        if (typeof paramValue === 'string' && (paramValue.startsWith('{') || paramValue.startsWith('['))) {
          try { paramValue = JSON.parse(paramValue) } catch { /* keep as string */ }
        }
        params[paramName] = paramValue
      }

      calls.push({
        id: `dsml-recovery-${Date.now()}-${calls.length}`,
        type: 'function',
        function: { name: toolName, arguments: JSON.stringify(params) },
      })
    }
    return calls
  },

  stripMarkup(text: string): string {
    return text.replace(/<[｜|]DSML[｜|][^>]*>[\s\S]*$/g, '').trim()
  },
}

// ---- MiMo adapter (Qwen3 XML format) ----
// MiMo-V2 models are trained on Qwen3-style XML tool calling format.
// They expect: <tool_call><function=name><parameter=key>value</parameter></function></tool_call>

const mimoAdapter: ToolFormatAdapter = {
  id: 'mimo',

  matches(modelId: string): boolean {
    return modelId.toLowerCase().includes('mimo')
  },

  formatToolPrompt(tools: ToolDef[]): string {
    const toolDefs = tools.map(t => {
      const params = t.function.parameters as { properties?: Record<string, { type: string; description?: string }>; required?: string[] }
      const paramLines = Object.entries(params?.properties ?? {}).map(([name, schema]) => {
        const req = (params?.required ?? []).includes(name) ? ' (required)' : ' (optional)'
        return `  - ${name}: ${schema.type}${req}${schema.description ? ' — ' + schema.description : ''}`
      })
      return `### ${t.function.name}\n${t.function.description}\nParameters:\n${paramLines.join('\n')}`
    }).join('\n\n')

    return `You have access to the following tools. To call a tool, use this EXACT format:

<tool_call>
<function=tool_name>
<parameter=param_name>value</parameter>
</function>
</tool_call>

You may call multiple tools by outputting multiple <tool_call> blocks.

## Available Tools

${toolDefs}

## Rules
1. ALWAYS call tools to take action. Never describe what you would do — just do it.
2. To respond to the user, call the "respond" tool: <tool_call><function=respond><parameter=message>Your response here</parameter></function></tool_call>
3. Use the "think" tool first to plan your approach.
4. For multi-step tasks, keep calling tools until fully complete.
5. The "arguments" must use <parameter=name>value</parameter> format, NOT JSON.
6. Do NOT write code blocks or pseudo-code. Call the actual tools.`
  },

  formatToolCall(name: string, args: Record<string, unknown>): string {
    const params = Object.entries(args).map(([k, v]) => {
      const val = typeof v === 'string' ? v : JSON.stringify(v)
      return `<parameter=${k}>${val}</parameter>`
    }).join('\n')
    return `<tool_call>\n<function=${name}>\n${params}\n</function>\n</tool_call>`
  },

  parseToolCalls(text: string): ToolCall[] {
    const calls: ToolCall[] = []
    let match: RegExpExecArray | null

    // Primary: <tool_call><function=NAME>...</function></tool_call>
    // Also handle missing <tool_call> wrapper (common edge case ~15% of responses)
    const funcRegex = /<function=([^>]+)>([\s\S]*?)(?:<\/function>|<\/tool_call>)/g
    while ((match = funcRegex.exec(text)) !== null) {
      const toolName = match[1].trim()
      const body = match[2]
      const params = parseXmlParams(body)
      calls.push({
        id: `mimo-${Date.now()}-${calls.length}`,
        type: 'function',
        function: { name: toolName, arguments: JSON.stringify(params) },
      })
    }

    // Fallback: <tool_call>{"name":"...","arguments":{...}}</tool_call> (JSON-in-tags)
    if (calls.length === 0) {
      const blockRegex = /<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/g
      while ((match = blockRegex.exec(text)) !== null) {
        const jsonStr = match[1].trim()
        try {
          const parsed = JSON.parse(jsonStr) as { name: string; arguments: Record<string, unknown> }
          if (parsed.name) {
            calls.push({
              id: `mimo-json-${Date.now()}-${calls.length}`,
              type: 'function',
              function: { name: parsed.name, arguments: JSON.stringify(parsed.arguments ?? {}) },
            })
          }
        } catch { /* not JSON */ }
      }
    }

    return calls
  },

  stripMarkup(text: string): string {
    return text
      .replace(/<tool_call>[\s\S]*?<\/tool_call>/g, '')
      .replace(/<tool_call>[\s\S]*$/g, '')
      .replace(/<function=[^>]*>[\s\S]*?<\/function>/g, '')
      .replace(/<function=[^>]*>[\s\S]*$/g, '')
      .replace(/<\/function>/g, '')
      .replace(/<\/tool_call>/g, '')
      .replace(/<parameter[^>]*>[\s\S]*?<\/parameter>/g, '')
      .replace(/<\/parameter>/g, '')
      .trim()
  },
}

// ---- Nemotron adapter (Qwen3 XML format, same as MiMo) ----
// Nemotron models use Qwen3-Coder XML format natively.
// Shares parse/strip logic with MiMo but has its own match rule.

const nemotronAdapter: ToolFormatAdapter = {
  id: 'nemotron',
  matches(modelId: string): boolean {
    return modelId.toLowerCase().includes('nemotron')
  },
  formatToolPrompt: mimoAdapter.formatToolPrompt,
  formatToolCall: mimoAdapter.formatToolCall,
  parseToolCalls: mimoAdapter.parseToolCalls,
  stripMarkup: mimoAdapter.stripMarkup,
}

// ---- Step 3.5 adapter (special token format) ----
// Step 3.5 Flash uses special Unicode tokens for tool calls:
// <｜tool▁call▁begin｜>function<｜tool▁sep｜>function_name\n```json\n{args}\n```<｜tool▁call▁end｜>

const step3p5Adapter: ToolFormatAdapter = {
  id: 'step3p5',
  matches(modelId: string): boolean {
    return modelId.toLowerCase().includes('step-3') || modelId.toLowerCase().includes('step3')
  },

  formatToolPrompt(tools: ToolDef[]): string {
    const toolDefs = tools.map(t => {
      const params = t.function.parameters as { properties?: Record<string, { type: string; description?: string }>; required?: string[] }
      const paramLines = Object.entries(params?.properties ?? {}).map(([name, schema]) => {
        const req = (params?.required ?? []).includes(name) ? ' (required)' : ' (optional)'
        return `  - ${name}: ${schema.type}${req}${schema.description ? ' — ' + schema.description : ''}`
      })
      return `### ${t.function.name}\n${t.function.description}\nParameters:\n${paramLines.join('\n')}`
    }).join('\n\n')

    return `You have access to the following tools. To call a tool, use this format:

<｜tool▁call▁begin｜>function<｜tool▁sep｜>tool_name
\`\`\`json
{"param": "value"}
\`\`\`<｜tool▁call▁end｜>

## Available Tools

${toolDefs}

## Rules
1. ALWAYS call tools to take action. Never describe what you would do — just do it.
2. To respond to the user, call the "respond" tool with {"message": "your response"}.
3. Use the "think" tool first to plan your approach.
4. For multi-step tasks, keep calling tools until fully complete.
5. Do NOT write code blocks or pseudo-code. Call the actual tools.`
  },

  formatToolCall(name: string, args: Record<string, unknown>): string {
    return `<｜tool▁call▁begin｜>function<｜tool▁sep｜>${name}\n\`\`\`json\n${JSON.stringify(args)}\n\`\`\`<｜tool▁call▁end｜>`
  },

  parseToolCalls(text: string): ToolCall[] {
    const calls: ToolCall[] = []
    // Match Step 3.5 special token format (Unicode chars ｜ and ▁)
    const stepRegex = /<[｜|]tool[▁_]call[▁_]begin[｜|]>(?:function)?<[｜|]tool[▁_]sep[｜|]>([^\n]+)\n```(?:json)?\n([\s\S]*?)\n```(?:<[｜|]tool[▁_]call[▁_]end[｜|]>)?/g
    let match: RegExpExecArray | null
    while ((match = stepRegex.exec(text)) !== null) {
      const toolName = match[1].trim()
      try {
        const args = JSON.parse(match[2].trim())
        calls.push({
          id: `step3p5-${Date.now()}-${calls.length}`,
          type: 'function',
          function: { name: toolName, arguments: JSON.stringify(args) },
        })
      } catch { /* JSON parse failed */ }
    }

    // Fallback: also try Qwen3 XML format (Step models sometimes mix formats)
    if (calls.length === 0) {
      const funcRegex = /<function=([^>]+)>([\s\S]*?)(?:<\/function>|<\/tool_call>)/g
      while ((match = funcRegex.exec(text)) !== null) {
        const toolName = match[1].trim()
        const params = parseXmlParams(match[2])
        calls.push({
          id: `step3p5-xml-${Date.now()}-${calls.length}`,
          type: 'function',
          function: { name: toolName, arguments: JSON.stringify(params) },
        })
      }
    }

    return calls
  },

  stripMarkup(text: string): string {
    return text
      .replace(/<[｜|]tool[▁_]call[▁_]begin[｜|]>[\s\S]*?<[｜|]tool[▁_]call[▁_]end[｜|]>/g, '')
      .replace(/<[｜|]tool[▁_]call[▁_]begin[｜|]>[\s\S]*$/g, '')
      .replace(/<tool_call>[\s\S]*?<\/tool_call>/g, '')
      .replace(/<function=[^>]*>[\s\S]*?<\/function>/g, '')
      .trim()
  },
}

// Registry of all adapters — checked in order (most specific first)
const TOOL_ADAPTERS: ToolFormatAdapter[] = [step3p5Adapter, mimoAdapter, nemotronAdapter, yokebotAdapter, dsmlAdapter]

/** Find the native tool format adapter for a given model ID, if any */
function getToolAdapter(providerModelId: string): ToolFormatAdapter | null {
  for (const adapter of TOOL_ADAPTERS) {
    if (adapter.matches(providerModelId)) return adapter
  }
  return null
}

/**
 * For models with native tool format adapters:
 * - Inject tool definitions into the system prompt
 * - Rewrite tool_calls/tool messages into text format the model understands
 * - Return modified messages WITHOUT tools in the API body
 * For models without adapters (or DSML which uses OpenAI natively):
 * - Return messages unchanged, tools stay in the API body
 */
function applyNativeToolFormat(
  adapter: ToolFormatAdapter,
  messages: ChatMessage[],
  tools: ToolDef[],
): { messages: ChatMessage[]; useNativeTools: boolean } {
  const toolPrompt = adapter.formatToolPrompt(tools)

  // DSML adapter returns empty prompt — it uses OpenAI tools natively, only parses responses
  if (!toolPrompt) return { messages, useNativeTools: true }

  // Rewrite messages: convert OpenAI tool_calls/tool messages into plain text
  // so the model sees its own native format in the conversation history
  const modified: ChatMessage[] = []
  for (const msg of messages) {
    if (msg.role === 'assistant' && msg.tool_calls && msg.tool_calls.length > 0) {
      // Convert assistant tool_calls into the adapter's native format
      const callText = msg.tool_calls.map((tc) => {
        const args = JSON.parse(tc.function.arguments) as Record<string, unknown>
        return adapter.formatToolCall(tc.function.name, args)
      }).join('\n')
      const content = msg.content ? `${msg.content}\n\n${callText}` : callText
      modified.push({ role: 'assistant', content })
    } else if (msg.role === 'tool') {
      // Convert tool result into a user message showing the result
      modified.push({ role: 'user', content: `<tool_response>\n${msg.content}\n</tool_response>` })
    } else {
      modified.push(msg)
    }
  }

  // Inject tool definitions into the system prompt
  if (modified.length > 0 && modified[0].role === 'system') {
    modified[0] = { ...modified[0], content: modified[0].content + '\n\n' + toolPrompt }
  } else {
    modified.unshift({ role: 'system', content: toolPrompt })
  }

  return { messages: modified, useNativeTools: false }
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
    const errMsg = (primaryErr as Error).message ?? ''
    // If model doesn't support tool calling (405), retry without tools
    if (tools && tools.length > 0 && errMsg.includes('405')) {
      console.log(`[model] Model doesn't support tool calling, retrying without tools`)
      return await chatCompletion(config, messages)
    }
    if (!fallbackConfig) throw primaryErr
    console.log(`[model] Primary model failed (${errMsg.slice(0, 100)}), trying fallback: ${fallbackConfig.endpoint}/${fallbackConfig.model}`)
    // Fallback also gets full retry logic via chatCompletion's built-in retries
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
