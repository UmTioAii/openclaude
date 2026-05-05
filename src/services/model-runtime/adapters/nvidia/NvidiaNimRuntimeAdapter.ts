// PR1 — Managed Adapter Runtime: NvidiaNimRuntimeAdapter

import type {
  RuntimeProviderAdapter,
  RuntimeSetupInput,
  RuntimeStartupInput,
  RuntimeSetupResult,
  StartupVerificationResult,
  ResolveRuntimeCapabilitiesInput,
  RuntimeModelCapabilities,
  BuildRuntimePayloadInput,
  ProviderPayload,
  RuntimeProviderErrorClassification,
} from '../../types.js'

import type { RouteDescriptor } from '../../../../integrations/routeMetadata.js'

import { applyQuirkPolicy } from '../../RuntimeQuirkPolicy.js'
import { redactErrorMessage } from '../../RuntimeSecurity.js'

// ── Adapter identity ──────────────────────────────────────────────────

const ADAPTER_ID = 'nvidia-nim' as const
const ADAPTER_LABEL = 'Nvidia NIM'

// ── NvidiaNimRuntimeAdapter ───────────────────────────────────────────

export class NvidiaNimRuntimeAdapter implements RuntimeProviderAdapter {
  readonly id = ADAPTER_ID
  readonly label = ADAPTER_LABEL

  // ── Route matching ────────────────────────────────────────────────────

  supportsRoute(routeId: string, descriptor: RouteDescriptor): boolean {
    if (routeId === 'nvidia-nim') return true

    // Match if the descriptor itself identifies as nvidia-nim
    if (descriptor?.id === 'nvidia-nim') return true

    return false
  }

  // ── Setup validation ──────────────────────────────────────────────────

  async validateSetup(input: RuntimeSetupInput): Promise<RuntimeSetupResult> {
    const { providerInput } = input

    // Check for whitespace-only values
    const apiKey = typeof providerInput.apiKey === 'string' ? providerInput.apiKey.trim() : providerInput.apiKey
    const baseUrl = typeof providerInput.baseUrl === 'string' ? providerInput.baseUrl.trim() : providerInput.baseUrl
    const model = typeof providerInput.model === 'string' ? providerInput.model.trim() : providerInput.model

    if (!apiKey) {
      return {
        ok: false,
        severity: 'fatal',
        code: 'missing_required_auth',
        reason: 'API key is required for Nvidia NIM.',
      }
    }

    if (!baseUrl) {
      return {
        ok: false,
        severity: 'fatal',
        code: 'invalid_base_url',
        reason: 'Base URL is required for Nvidia NIM.',
      }
    }

    if (!model) {
      return {
        ok: false,
        severity: 'fatal',
        code: 'model_not_found',
        reason: 'Model is required for Nvidia NIM.',
      }
    }

    return {
      ok: true,
      capabilities: await this.resolveCapabilities(input),
    }
  }

  // ── Startup verification ──────────────────────────────────────────────

  async verifyStartup(input: RuntimeStartupInput): Promise<StartupVerificationResult> {
    if (input.cachedCapabilities?.providerId === ADAPTER_ID) {
      return { ok: true, capabilities: input.cachedCapabilities }
    }

    return {
      ok: true,
      capabilities: await this.resolveCapabilities(input),
    }
  }

  // ── Capability resolution ─────────────────────────────────────────────

  async resolveCapabilities(input: ResolveRuntimeCapabilitiesInput): Promise<RuntimeModelCapabilities> {
    const { routeId, descriptor, catalogEntry, providerInput } = input

    const model = providerInput.model
    const supportsReasoning = catalogEntry?.capabilities?.supportsReasoning === true

    // Derive maxTokensField from descriptor openaiShim config
    const openaiShim = descriptor?.transportConfig?.openaiShim
    const maxTokensField = openaiShim?.maxTokensField ?? 'max_tokens'
    const supportsUserCustomHeaders = openaiShim?.supportsAuthHeaders === true

    // Derive providerLabel from descriptor label when safe, otherwise adapter label
    const providerLabel = descriptor?.label ?? ADAPTER_LABEL

    return {
      routeId,
      providerId: ADAPTER_ID,
      providerLabel,

      model: {
        requested: model,
        resolvedApiName: model,
        source: 'manual',
      },

      availability: {
        checked: false,
        exists: true,
        active: true,
        verifiedBy: 'manual',
      },

      tools: {
        supported: true,
        format: 'openai',
      },

      thinking: {
        supported: supportsReasoning,
        adaptiveSupported: false,
        mode: supportsReasoning ? 'provider_specific' : 'none',
        source: 'descriptor',
      },

      effort: {
        supported: false,
        mode: 'none',
        nativeValues: [],
        defaultAbstractEffort: 'none',
        maxAutoAbstractEffort: 'none',
        allowAutoMax: false,
        autoStrategy: 'openclaude_decides',
        source: 'descriptor',
      },

      payload: {
        endpoint: 'chat_completions',
        maxTokensField,
        supportsUserCustomHeaders,
      },

      limits: {
        contextWindow: catalogEntry?.contextWindow,
        maxOutputTokens: catalogEntry?.maxOutputTokens,
      },

      confidence: 'manual',
    }
  }

  // ── Payload building ──────────────────────────────────────────────────

  buildPayload(input: BuildRuntimePayloadInput): ProviderPayload {
    const { capabilities, body } = input

    // Apply quirk policy to a shallow copy (never mutates original)
    const result = applyQuirkPolicy(body, capabilities)

    // Preserve existing model or set from capabilities
    if (!('model' in result) || result.model === undefined || result.model === '') {
      result.model = capabilities.model.resolvedApiName
    }

    return result
  }

  // ── Error classification ──────────────────────────────────────────────

  classifyError(error: unknown): RuntimeProviderErrorClassification {
    const safeMessage = redactErrorMessage(error)
    const lowerMessage = safeMessage.toLowerCase()

    // Auth failures
    const status = extractStatus(error)
    if (
      status === 401 ||
      status === 403 ||
      lowerMessage.includes('unauthorized') ||
      lowerMessage.includes('forbidden') ||
      lowerMessage.includes('invalid api key') ||
      (lowerMessage.includes('api key') && lowerMessage.includes('invalid'))
    ) {
      return {
        severity: 'fatal',
        code: 'invalid_api_key',
        reason: 'Authentication failed for Nvidia NIM.',
      }
    }

    // Model not found
    if (
      status === 404 ||
      lowerMessage.includes('model not found') ||
      lowerMessage.includes('unknown model')
    ) {
      return {
        severity: 'fatal',
        code: 'model_not_found',
        reason: 'The requested model was not found on the Nvidia NIM endpoint.',
      }
    }

    // Everything else - return a stable generic reason to avoid leaking sensitive information
    return {
      severity: 'warning',
      code: 'probe_failed',
      reason: 'Nvidia NIM request failed before completion.',
    }
  }
}

// ── Internal helpers ────────────────────────────────────────────────────

/**
 * Attempt to extract an HTTP status code from an error-like object.
 * Returns undefined if no status can be found.
 */
function extractStatus(error: unknown): number | undefined {
  if (error && typeof error === 'object') {
    const obj = error as Record<string, unknown>
    if (typeof obj.status === 'number') return obj.status
    if (typeof obj.statusCode === 'number') return obj.statusCode
  }
  return undefined
}
