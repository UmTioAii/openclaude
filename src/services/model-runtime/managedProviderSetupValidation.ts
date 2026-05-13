// PR1 — Managed provider setup validation for /provider activation
// Converts an active ProviderProfile into RuntimeSetupInput and runs
// validateSetup through ProviderStartupVerifier — only for managed providers.
// Non-managed providers are silently skipped (legacy behavior preserved).
// Not gated by CLAUDE_CODE_USE_MANAGED_RUNTIME: explicit /provider activation
// should always validate managed providers regardless of the startup flag.

import type { ProviderProfile } from '../../utils/config.js'
import type { RuntimeSetupInput, RuntimeSetupResult } from './types.js'

import { isManagedProviderId } from './managedProviderIds.js'
import {
  buildDefaultProviderStartupVerifier,
} from './ProviderStartupVerifier.js'
import {
  getRouteDescriptor,
} from '../../integrations/routeMetadata.js'

/**
 * Build a RuntimeSetupInput from a ProviderProfile (before activation).
 * Returns null if the provider is not a managed provider.
 *
 * For managed providers, route identity comes from profile.provider only --
 * a custom baseUrl must never reclassify a managed provider via URL heuristics.
 */
export function buildRuntimeSetupInputFromProfile(
  profile: ProviderProfile,
  processEnv: NodeJS.ProcessEnv,
): RuntimeSetupInput | null {
  if (!isManagedProviderId(profile.provider)) {
    return null
  }

  const routeId = profile.provider
  const descriptor = getRouteDescriptor(routeId)

  if (!descriptor) {
    return null
  }

  return {
    routeId,
    descriptor,
    catalogEntry: null,
    providerInput: {
      providerId: routeId,
      baseUrl: profile.baseUrl,
      model: profile.model,
      apiKey: profile.apiKey,
    },
    processEnv,
  }
}

/**
 * Validate setup for a managed provider profile.
 * - Managed providers (codex, gemini, nvidia-nim, openrouter): runs validateSetup
 * - Non-managed providers: returns ok immediately (legacy passthrough)
 * - Does not silently replace user-provided baseUrl or model
 * - Does not log raw apiKey, token, custom headers, or secret env values
 */
export async function validateManagedProviderSetup(
  profile: ProviderProfile,
  processEnv: NodeJS.ProcessEnv,
): Promise<RuntimeSetupResult> {
  if (!isManagedProviderId(profile.provider)) {
    return { ok: true, capabilities: makeLegacyPassthroughCapabilities(profile) }
  }

  const input = buildRuntimeSetupInputFromProfile(profile, processEnv)

  if (!input) {
    // Managed provider but no route descriptor found — this is a
    // configuration issue, not a network issue. Report as warning.
    return {
      ok: false,
      severity: 'warning',
      code: 'unknown_provider',
      reason: `Could not resolve route descriptor for managed provider "${profile.provider}"`,
    }
  }

  const verifier = buildDefaultProviderStartupVerifier()
  return verifier.validateSetup(input)
}

function makeLegacyPassthroughCapabilities(profile: ProviderProfile) {
  return {
    routeId: profile.provider,
    providerId: profile.provider,
    providerLabel: profile.name,
    model: {
      requested: profile.model,
      resolvedApiName: profile.model,
      source: 'manual' as const,
    },
    availability: {
      checked: false,
      exists: true,
      active: true,
      verifiedBy: 'not_checked' as const,
    },
    tools: { supported: true, format: 'openai' as const },
    thinking: {
      supported: false,
      adaptiveSupported: false,
      mode: 'none' as const,
      source: 'fallback' as const,
    },
    effort: {
      supported: false,
      mode: 'none' as const,
      nativeValues: [],
      defaultAbstractEffort: 'none' as const,
      maxAutoAbstractEffort: 'none' as const,
      allowAutoMax: false,
      autoStrategy: 'openclaude_decides' as const,
      source: 'fallback' as const,
    },
    payload: {
      endpoint: 'chat_completions' as const,
      maxTokensField: 'max_tokens',
    },
    limits: {},
    confidence: 'manual' as const,
  }
}
