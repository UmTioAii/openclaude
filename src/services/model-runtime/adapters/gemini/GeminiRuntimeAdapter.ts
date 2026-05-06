import type {
  RuntimeProviderAdapter,
  RuntimeSetupInput,
  RuntimeStartupInput,
  RuntimeSetupResult,
  StartupVerificationResult,
  RuntimeModelCapabilities,
  ResolveRuntimeCapabilitiesInput,
  BuildRuntimePayloadInput,
  ProviderPayload,
  RuntimeProviderErrorClassification,
} from '../../types.js'

import { applyQuirkPolicy } from '../../RuntimeQuirkPolicy.js'
import { redactErrorMessage } from '../../RuntimeSecurity.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isUsableString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function extractStatus(error: unknown): number | undefined {
  if (error && typeof error === 'object') {
    const obj = error as Record<string, unknown>
    if (typeof obj.status === 'number') return obj.status
    if (typeof obj.statusCode === 'number') return obj.statusCode
  }
  return undefined
}

/**
 * Extract the raw message string from an error-like value for pattern matching.
 * This is used internally by classifyError to detect known error patterns
 * (e.g. "unauthorized", "model not found") that may be stripped by
 * redactErrorMessage when the input is a plain object (not an Error).
 * The raw message is never exposed externally — classifyError always
 * returns a safe, static reason string.
 */
function extractRawMessage(error: unknown): string {
  if (error == null) return ''
  if (typeof error === 'string') return error
  if (error instanceof Error) return error.message
  if (typeof error === 'object') {
    const obj = error as Record<string, unknown>
    if (typeof obj.message === 'string') return obj.message
  }
  return String(error)
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export class GeminiRuntimeAdapter implements RuntimeProviderAdapter {
  readonly id = 'gemini' as const
  readonly label = 'Gemini'

  supportsRoute(routeId: string, descriptor: { id?: string } | null): boolean {
    if (routeId === 'gemini') return true
    if (descriptor && typeof descriptor.id === 'string' && descriptor.id === 'gemini') return true
    return false
  }

  async validateSetup(input: RuntimeSetupInput): Promise<RuntimeSetupResult> {
    const { providerInput } = input

    // --- Auth validation ---
    const apiKey = providerInput.apiKey
    if (typeof apiKey !== 'string' || apiKey.trim().length === 0) {
      return {
        ok: false,
        severity: 'fatal',
        code: 'missing_required_auth',
        reason: 'Gemini provider requires an API key.',
      }
    }

    // --- baseUrl validation ---
    const baseUrl = providerInput.baseUrl
    if (typeof baseUrl !== 'string' || baseUrl.trim().length === 0) {
      return {
        ok: false,
        severity: 'fatal',
        code: 'invalid_base_url',
        reason: 'Gemini provider requires a valid base URL.',
      }
    }

    // --- model validation ---
    const model = providerInput.model
    if (typeof model !== 'string' || model.trim().length === 0) {
      return {
        ok: false,
        severity: 'fatal',
        code: 'model_not_found',
        reason: 'Gemini provider requires a valid model string.',
      }
    }

    return {
      ok: true,
      capabilities: await this.resolveCapabilities(input),
    }
  }

  async verifyStartup(input: RuntimeStartupInput): Promise<StartupVerificationResult> {
    const { cachedCapabilities } = input
    if (cachedCapabilities && cachedCapabilities.providerId === 'gemini') {
      return { ok: true, capabilities: cachedCapabilities }
    }
    // Ignore cachedCapabilities from other providers; resolve fresh
    return {
      ok: true,
      capabilities: await this.resolveCapabilities(input),
    }
  }

  async resolveCapabilities(
    input: ResolveRuntimeCapabilitiesInput,
  ): Promise<RuntimeModelCapabilities> {
    const { providerInput, descriptor, catalogEntry } = input

    const userProvidedModel = isUsableString(providerInput.model) ? providerInput.model : undefined
    const resolvedModel = userProvidedModel ?? ''

    // Reasoning / thinking support
    const catalogSupportsReasoning = catalogEntry?.capabilities?.supportsReasoning === true
    const thinkingSupported = catalogSupportsReasoning

    // Tool/function calling support
    const catalogSupportsFunctionCalling = catalogEntry?.capabilities?.supportsFunctionCalling === true
    const toolsSupported = catalogSupportsFunctionCalling

    // Descriptor openaiShim fields
    const openaiShim = descriptor?.transportConfig?.openaiShim
    const maxTokensField = ((): 'max_tokens' | 'max_completion_tokens' => {
      const raw = openaiShim?.maxTokensField
      if (raw === 'max_tokens' || raw === 'max_completion_tokens') return raw
      return 'max_tokens'
    })()
    const supportsAuthHeaders = openaiShim?.supportsAuthHeaders === true

    // Limits from catalogEntry
    const contextWindow = catalogEntry?.contextWindow
    const maxOutputTokens = catalogEntry?.maxOutputTokens

    return {
      routeId: input.routeId,
      providerId: 'gemini',
      providerLabel: descriptor?.label ?? this.label,
      model: {
        requested: userProvidedModel ?? resolvedModel,
        resolvedApiName: resolvedModel,
        source: userProvidedModel ? 'manual' as const : 'fallback' as const,
      },
      availability: {
        checked: false,
        exists: true,
        active: true,
        verifiedBy: 'manual',
      },
      tools: {
        supported: toolsSupported,
        format: 'gemini',
      },
      thinking: {
        supported: thinkingSupported,
        adaptiveSupported: false,
        mode: thinkingSupported ? 'provider_specific' : 'none',
        source: 'fallback',
      },
      effort: {
        supported: false,
        mode: 'none',
        nativeValues: [],
        defaultAbstractEffort: 'none',
        maxAutoAbstractEffort: 'none',
        allowAutoMax: false,
        autoStrategy: 'openclaude_decides',
        source: 'fallback',
      },
      payload: {
        endpoint: 'gemini_native',
        maxTokensField,
        supportsUserCustomHeaders: supportsAuthHeaders,
      },
      limits: {
        contextWindow,
        maxOutputTokens,
      },
      confidence: userProvidedModel ? 'manual' as const : 'adapter_fallback' as const,
    }
  }

  buildPayload(input: BuildRuntimePayloadInput): ProviderPayload {
    // Apply quirk policy first (handles maxTokensField mapping etc.)
    // applyQuirkPolicy returns a new shallow-copied body — never mutates the original
    const result = applyQuirkPolicy(input.body, input.capabilities)

    // Preserve existing model or set from capabilities
    if (!('model' in result) || result.model === undefined || result.model === '') {
      result.model = input.capabilities.model.resolvedApiName
    }

    // Never inject apiKey or Authorization headers
    delete result.apiKey
    delete result.authorization
    delete result.Authorization

    return result
  }

  classifyError(error: unknown): RuntimeProviderErrorClassification {
    // Extract the raw message first, then pass through redactErrorMessage
    // to sanitize any embedded secrets while preserving classification keywords
    const rawMessage = extractRawMessage(error)
    const safeMessage = redactErrorMessage(rawMessage)
    const lowerMessage = safeMessage.toLowerCase()

    const status = extractStatus(error)

    // Auth failures
    if (
      status === 401 ||
      status === 403 ||
      lowerMessage.includes('unauthorized') ||
      lowerMessage.includes('forbidden') ||
      lowerMessage.includes('invalid api key') ||
      (lowerMessage.includes('api key') && lowerMessage.includes('invalid')) ||
      lowerMessage.includes('permission denied')
    ) {
      return {
        severity: 'fatal',
        code: 'invalid_api_key',
        reason: 'Gemini authentication failed.',
      }
    }

    // Model not found
    if (
      status === 404 ||
      lowerMessage.includes('model not found') ||
      lowerMessage.includes('unknown model') ||
      lowerMessage.includes('model does not exist')
    ) {
      return {
        severity: 'fatal',
        code: 'model_not_found',
        reason: 'Gemini model was not found.',
      }
    }

    // Everything else - return a stable generic reason to avoid leaking sensitive information
    return {
      severity: 'warning',
      code: 'probe_failed',
      reason: 'Gemini request failed before completion.',
    }
  }
}
