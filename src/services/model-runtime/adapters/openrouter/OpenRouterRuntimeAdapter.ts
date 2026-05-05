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

// ── Constants ────────────────────────────────────────────────────────────────

const ADAPTER_ID = 'openrouter'
const ADAPTER_LABEL = 'OpenRouter'

// ── Internal helpers ────────────────────────────────────────────────────────

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

// ── Adapter Implementation ─────────────────────────────────────────────────

export class OpenRouterRuntimeAdapter implements RuntimeProviderAdapter {
  readonly id = ADAPTER_ID
  readonly label = ADAPTER_LABEL

  supportsRoute(routeId: string, descriptor: RouteDescriptor): boolean {
    if (routeId === ADAPTER_ID) return true
    if (descriptor?.id === ADAPTER_ID) return true
    return false
  }

  async validateSetup(input: RuntimeSetupInput): Promise<RuntimeSetupResult> {
    const { providerInput } = input

    // Guard against non-string types (e.g. malformed JSON config)
    const apiKey = typeof providerInput.apiKey === 'string' ? providerInput.apiKey.trim() : providerInput.apiKey
    const baseUrl = typeof providerInput.baseUrl === 'string' ? providerInput.baseUrl.trim() : providerInput.baseUrl
    const model = typeof providerInput.model === 'string' ? providerInput.model.trim() : providerInput.model

    // Check for required fields (must be non-empty strings)
    if (typeof apiKey !== 'string' || !apiKey) {
      return {
        ok: false,
        severity: 'fatal',
        code: 'missing_required_auth',
        reason: 'API key is required for OpenRouter.',
      }
    }

    if (typeof baseUrl !== 'string' || !baseUrl) {
      return {
        ok: false,
        severity: 'fatal',
        code: 'invalid_base_url',
        reason: 'Base URL is required for OpenRouter.',
      }
    }

    if (typeof model !== 'string' || !model) {
      return {
        ok: false,
        severity: 'fatal',
        code: 'model_not_found',
        reason: 'Model is required for OpenRouter.',
      }
    }

    return {
      ok: true,
      capabilities: await this.resolveCapabilities(input),
    }
  }

  async verifyStartup(input: RuntimeStartupInput): Promise<StartupVerificationResult> {
    const { cachedCapabilities } = input

    // If we have cached capabilities from the same provider, use them
    if (cachedCapabilities?.providerId === ADAPTER_ID) {
      return {
        ok: true,
        capabilities: cachedCapabilities,
      }
    }

    // Otherwise resolve new capabilities
    return {
      ok: true,
      capabilities: await this.resolveCapabilities(input),
    }
  }

  async resolveCapabilities(
    input: ResolveRuntimeCapabilitiesInput,
  ): Promise<RuntimeModelCapabilities> {
    const { descriptor, catalogEntry, providerInput } = input
    const providerLabel = descriptor?.label ?? ADAPTER_LABEL

    const supportsReasoning = Boolean(
      catalogEntry?.capabilities?.supportsReasoning,
    )

    return {
      routeId: input.routeId,
      providerId: ADAPTER_ID,
      providerLabel,
      model: {
        requested: providerInput.model,
        resolvedApiName: providerInput.model,
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
        maxTokensField:
          descriptor?.transportConfig?.openaiShim?.maxTokensField ?? 'max_tokens',
        supportsUserCustomHeaders:
          descriptor?.transportConfig?.openaiShim?.supportsAuthHeaders === true,
      },
      limits: {
        contextWindow: catalogEntry?.contextWindow,
        maxOutputTokens: catalogEntry?.maxOutputTokens,
      },
      confidence: 'manual',
    }
  }

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
        reason: 'Authentication failed for OpenRouter.',
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
        reason: 'The requested model was not found on the OpenRouter endpoint.',
      }
    }

    // Everything else — return a stable generic reason to avoid leaking sensitive information
    return {
      severity: 'warning',
      code: 'probe_failed',
      reason: 'OpenRouter request failed before completion.',
    }
  }
}
