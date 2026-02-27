/**
 * model.ts — Model abstraction (any OpenAI-compatible endpoint)
 *
 * Works with Ollama, DeepInfra, Together, OpenAI, or any
 * endpoint that speaks the OpenAI chat completions API.
 * For hosted yokebot.com: the endpoint is our proxy that meters usage.
 * For self-hosted: the endpoint is Ollama or the user's own API key.
 */

export interface ModelConfig {
  endpoint: string   // e.g. "http://localhost:11434/v1" for Ollama
  model: string      // e.g. "llama3.2" or "deepseek-r1"
  apiKey?: string    // optional, not needed for Ollama
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

/**
 * Call any OpenAI-compatible chat completions endpoint.
 */
export async function chatCompletion(
  config: ModelConfig,
  messages: ChatMessage[],
  tools?: ToolDef[],
): Promise<CompletionResponse> {
  const url = `${config.endpoint}/chat/completions`

  const body: Record<string, unknown> = {
    model: config.model,
    messages,
    stream: false,
  }

  if (tools && tools.length > 0) {
    body.tools = tools
    body.tool_choice = 'auto'
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  if (config.apiKey) {
    headers['Authorization'] = `Bearer ${config.apiKey}`
  }

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Model API error ${res.status}: ${text}`)
  }

  const data = await res.json() as {
    choices: Array<{
      message: {
        content: string | null
        tool_calls?: ToolCall[]
      }
    }>
    usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number }
  }

  const choice = data.choices[0]
  if (!choice) {
    throw new Error('No choices returned from model API')
  }

  return {
    content: choice.message.content,
    tool_calls: choice.message.tool_calls ?? [],
    usage: data.usage,
  }
}

/**
 * Check if an Ollama instance is reachable and list available models.
 */
export async function detectOllama(
  endpoint = 'http://localhost:11434',
): Promise<{ connected: boolean; models: string[] }> {
  try {
    const res = await fetch(`${endpoint}/api/tags`, {
      signal: AbortSignal.timeout(3000),
    })
    if (!res.ok) return { connected: false, models: [] }
    const data = await res.json() as { models?: Array<{ name: string }> }
    const models = data.models?.map((m) => m.name) ?? []
    return { connected: true, models }
  } catch {
    return { connected: false, models: [] }
  }
}
