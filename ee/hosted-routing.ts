/**
 * hosted-routing.ts — Hosted mode model routing
 *
 * In hosted mode (yokebot.com / Railway), API keys come from environment
 * variables rather than the DB. This resolver overrides the open-source
 * routing when YOKEBOT_HOSTED_MODE=true.
 *
 * Env vars (set on Railway, NEVER in git):
 *   DEEPINFRA_API_KEY — text/chat models
 *   FAL_API_KEY       — image/video/3D models
 *
 * IMPORTANT: This file is source-available under the YokeBot Enterprise
 * License (see ee/LICENSE). No secrets, API keys, billing data, or
 * private business information should ever appear in this file.
 */

import type { Db } from '../packages/engine/src/db/types.ts'
import type { ModelConfig } from '../packages/engine/src/model.ts'
import { getLogicalModel, PROVIDERS } from '../packages/engine/src/model.ts'

function getProvider(id: string) {
  return PROVIDERS.find((p) => p.id === id)
}

/**
 * Hosted model resolver — reads API keys from env vars.
 *
 * Called by the engine when setHostedResolver() has been registered.
 * This keeps all secret management in Railway env vars, never in the DB or git.
 */
export async function hostedResolveModelConfig(_db: Db, logicalModelId: string): Promise<ModelConfig> {
  const logical = getLogicalModel(logicalModelId)

  if (!logical) {
    throw new Error(`Unknown model: "${logicalModelId}"`)
  }

  // Iterate backends by priority
  const sortedBackends = [...logical.backends].sort((a, b) => a.priority - b.priority)

  for (const backend of sortedBackends) {
    const provider = getProvider(backend.providerId)
    if (!provider) continue

    // Ollama not available in hosted mode
    if (backend.providerId === 'ollama') continue

    // DeepInfra — text/chat models
    if (backend.providerId === 'deepinfra') {
      const apiKey = process.env.DEEPINFRA_API_KEY
      if (apiKey) {
        return { endpoint: provider.endpoint, model: backend.providerModelId, apiKey }
      }
      continue
    }

    // fal.ai — media models (image/video/3D)
    // Note: fal.ai uses its own client (fal.ts) which reads FAL_API_KEY directly.
    // But we still return a ModelConfig so the routing layer knows it's available.
    if (backend.providerId === 'fal') {
      const apiKey = process.env.FAL_API_KEY
      if (apiKey) {
        return { endpoint: provider.endpoint, model: backend.providerModelId, apiKey }
      }
      continue
    }
  }

  throw new Error(
    `No hosted provider available for model "${logical.name}". ` +
    `Check that the required API key env vars are set on Railway.`,
  )
}

/**
 * Check if hosted mode is enabled via env var.
 */
export function isHostedMode(): boolean {
  return process.env.YOKEBOT_HOSTED_MODE === 'true'
}
