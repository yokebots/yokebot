/**
 * hosted-routing.js — Hosted mode model routing
 *
 * In hosted mode, API keys come from environment variables rather
 * than the DB. This resolver overrides the open-source routing
 * when YOKEBOT_HOSTED_MODE=true.
 *
 * IMPORTANT: This file is source-available under the YokeBot Enterprise
 * License (see ee/LICENSE). No secrets, API keys, billing data, or
 * private business information should ever appear in this file.
 */

import { getLogicalModel, PROVIDERS } from '../packages/engine/dist/model.js'

function getProvider(id) {
  return PROVIDERS.find((p) => p.id === id)
}

/**
 * Derive the env var name for a provider's API key from its ID.
 * e.g. "some_provider" → "SOME_PROVIDER_API_KEY"
 */
function providerEnvKey(providerId) {
  return `${providerId.toUpperCase()}_API_KEY`
}

/**
 * Hosted model resolver — reads API keys from env vars.
 */
export async function hostedResolveModelConfig(_db, logicalModelId) {
  const logical = getLogicalModel(logicalModelId)

  if (!logical) {
    throw new Error(`Unknown model: "${logicalModelId}"`)
  }

  const sortedBackends = [...logical.backends].sort((a, b) => a.priority - b.priority)

  for (const backend of sortedBackends) {
    const provider = getProvider(backend.providerId)
    if (!provider) continue

    // Local-only providers are not available in hosted mode
    if (!provider.requiresKey) continue

    const apiKey = process.env[providerEnvKey(backend.providerId)]
    if (apiKey) {
      return { endpoint: provider.endpoint, model: backend.providerModelId, apiKey }
    }
  }

  throw new Error(
    `No hosted provider available for model "${logical.name}". ` +
    `Check that the required API key env vars are configured.`,
  )
}

export function isHostedMode() {
  return process.env.YOKEBOT_HOSTED_MODE === 'true'
}
