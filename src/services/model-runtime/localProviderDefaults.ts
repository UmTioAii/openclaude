// PR1 — Managed Adapter Runtime: localProviderDefaults
// Minimal descriptor defaults for managed providers, so model-runtime
// does not depend on src/integrations at runtime for setup validation.
// Route identity always comes from profile.provider, never from baseUrl.

import type { RouteDescriptor } from './types.js'
import { MANAGED_PROVIDER_IDS } from './managedProviderIds.js'

// Local descriptor map
// Only the fields needed to build RuntimeSetupInput and pass adapter
// supportsRoute() checks.  Not a full provider registry.

const MANAGED_PROVIDER_DEFAULTS: Record<string, RouteDescriptor> = {
  codex: {
    id: 'codex',
    label: 'Codex',
    category: 'hosted',
    defaultBaseUrl: 'https://chatgpt.com/backend-api/codex',
    defaultModel: 'codexplan',
    setup: {
      requiresAuth: true,
      authMode: 'api-key',
      credentialEnvVars: ['CODEX_API_KEY'],
    },
    transportConfig: {
      kind: 'openai-compatible',
    },
  },
  gemini: {
    id: 'gemini',
    label: 'Gemini',
    category: 'hosted',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    defaultModel: 'gemini-2.0-flash',
    setup: {
      requiresAuth: true,
      authMode: 'api-key',
      credentialEnvVars: ['GOOGLE_API_KEY'],
    },
    transportConfig: {
      kind: 'openai-compatible',
    },
  },
  'nvidia-nim': {
    id: 'nvidia-nim',
    label: 'NVIDIA NIM',
    category: 'hosted',
    defaultBaseUrl: 'https://integrate.api.nvidia.com/v1',
    defaultModel: 'nvidia/llama-3.1-nemotron-70b-instruct',
    setup: {
      requiresAuth: true,
      authMode: 'api-key',
      credentialEnvVars: ['NVIDIA_API_KEY'],
    },
    transportConfig: {
      kind: 'openai-compatible',
    },
  },
  openrouter: {
    id: 'openrouter',
    label: 'OpenRouter',
    category: 'aggregating',
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'openai/gpt-5-mini',
    supportsModelRouting: true,
    setup: {
      requiresAuth: true,
      authMode: 'api-key',
      credentialEnvVars: ['OPENROUTER_API_KEY'],
    },
    transportConfig: {
      kind: 'openai-compatible',
    },
  },
}

/**
 * Resolve a managed provider descriptor locally.
 * Returns null for non-managed route IDs (those fall through to
 * legacy passthrough).
 */
export function getManagedProviderDescriptor(
  routeId: string,
): RouteDescriptor | null {
  if (!MANAGED_PROVIDER_IDS.includes(routeId as typeof MANAGED_PROVIDER_IDS[number])) {
    return null
  }
  return MANAGED_PROVIDER_DEFAULTS[routeId] ?? null
}
