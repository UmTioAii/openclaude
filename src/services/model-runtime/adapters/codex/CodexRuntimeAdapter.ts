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
  AbstractEffort,
} from '../../types.js'

import { applyQuirkPolicy } from '../../RuntimeQuirkPolicy.js'
import { redactErrorMessage } from '../../RuntimeSecurity.js'

// ---------------------------------------------------------------------------
// Codex alias data (mirrored from providerConfig CODEX_ALIAS_MODELS)
// providerConfig.ts cannot be safely imported here because it pulls in
// node:fs, node:net, node:os, node:path and credential-reading modules.
// We replicate only the static alias map needed for pure capability resolution.
// ---------------------------------------------------------------------------

type LocalReasoningEffort = 'low' | 'medium' | 'high'

interface CodexAliasInfo {
  model: string
  reasoningEffort?: LocalReasoningEffort
}

const CODEX_ALIASES: Record<string, CodexAliasInfo> = {
  codexplan: { model: 'gpt-5.5', reasoningEffort: 'high' },
  codexspark: { model: 'gpt-5.3-codex-spark' },
  'gpt-5.5': { model: 'gpt-5.5', reasoningEffort: 'high' },
  'gpt-5.4': { model: 'gpt-5.4', reasoningEffort: 'high' },
  'gpt-5.3-codex': { model: 'gpt-5.3-codex', reasoningEffort: 'high' },
  'gpt-5.3-codex-spark': { model: 'gpt-5.3-codex-spark' },
  'gpt-5.2-codex': { model: 'gpt-5.2-codex', reasoningEffort: 'high' },
  'gpt-5.1-codex-max': { model: 'gpt-5.1-codex-max', reasoningEffort: 'high' },
  'gpt-5.1-codex-mini': { model: 'gpt-5.1-codex-mini' },
  'gpt-5.5-mini': { model: 'gpt-5.5-mini', reasoningEffort: 'medium' },
  'gpt-5.4-mini': { model: 'gpt-5.4-mini', reasoningEffort: 'medium' },
  'gpt-5.2': { model: 'gpt-5.2', reasoningEffort: 'medium' },
}

const DEFAULT_CODEX_BASE_URL = 'https://chatgpt.com/backend-api/codex'

function isUsableString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function resolveCodexAlias(model: string): CodexAliasInfo | undefined {
  const normalized = model.trim().toLowerCase().split('?', 1)[0]!.trim()
  return CODEX_ALIASES[normalized]
}

function supportsReasoningEffort(model: string): boolean {
  const alias = resolveCodexAlias(model)
  if (alias) return alias.reasoningEffort !== undefined
  return false
}

function getReasoningEffort(model: string): LocalReasoningEffort | undefined {
  return resolveCodexAlias(model)?.reasoningEffort
}

/**
 * Pure local sanitizer that strips x-anthropic-billing-header from
 * system-prompt content and header-like text in the payload body.
 * Mirrors the behavior in codexShim.ts without importing network-dependent code.
 *
 * IMPORTANT: This function must not mutate any nested objects that belong to
 * the original input.body. It shallow-copies the messages array, each message
 * object whose content is sanitized, and the headers object before modifying.
 */
function stripBillingHeaderFromBody(body: Record<string, unknown>): void {
  // Strip from system prompt text (system is a primitive string — no mutation risk)
  if (typeof body.system === 'string') {
    body.system = body.system.replace(/x-anthropic-billing-header[^\n]*/gi, '').trim()
  }
  // Strip from messages content — shallow-copy array and affected message objects
  if (Array.isArray(body.messages)) {
    body.messages = body.messages.map((msg) => {
      if (msg && typeof msg === 'object' && 'content' in msg && typeof (msg as Record<string, unknown>).content === 'string') {
        const original = msg as Record<string, unknown>
        const sanitized = (original.content as string).replace(/x-anthropic-billing-header[^\n]*/gi, '').trim()
        if (sanitized !== original.content) {
          return { ...original, content: sanitized }
        }
      }
      return msg
    })
  }
  // Strip from headers object — shallow-copy before deleting
  if (body.headers && typeof body.headers === 'object') {
    const originalHeaders = body.headers as Record<string, unknown>
    if (Object.keys(originalHeaders).some((k) => k.toLowerCase() === 'x-anthropic-billing-header')) {
      const copied = { ...originalHeaders }
      for (const key of Object.keys(copied)) {
        if (key.toLowerCase() === 'x-anthropic-billing-header') {
          delete copied[key]
        }
      }
      body.headers = copied
    }
  }
}

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

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

export class CodexRuntimeAdapter implements RuntimeProviderAdapter {
  readonly id = 'codex' as const
  readonly label = 'Codex'

  supportsRoute(routeId: string, descriptor: { id?: string } | null): boolean {
    if (routeId === 'codex') return true
    if (descriptor && typeof descriptor.id === 'string' && descriptor.id === 'codex') return true
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
        reason: 'Codex provider requires an API key or authentication credential.',
      }
    }

    // --- baseUrl validation ---
    // If no explicit baseUrl, we can safely default to DEFAULT_CODEX_BASE_URL
    // (upstream providerConfig clearly establishes this default for Codex aliases)
    const baseUrl = providerInput.baseUrl
    if (typeof baseUrl !== 'string') {
      return {
        ok: false,
        severity: 'fatal',
        code: 'invalid_base_url',
        reason: 'Codex base URL must be a valid string.',
      }
    }
    // Whitespace-only or empty baseUrl is acceptable — we fall back to DEFAULT_CODEX_BASE_URL

    // --- model validation ---
    const model = providerInput.model
    if (typeof model !== 'string') {
      return {
        ok: false,
        severity: 'fatal',
        code: 'model_not_found',
        reason: 'Codex provider requires a valid model string.',
      }
    }
    if (model.trim().length === 0) {
      return {
        ok: false,
        severity: 'fatal',
        code: 'model_not_found',
        reason: 'Codex provider requires a non-empty model.',
      }
    }

    return {
      ok: true,
      capabilities: await this.resolveCapabilities(input),
    }
  }

  async verifyStartup(input: RuntimeStartupInput): Promise<StartupVerificationResult> {
    const { cachedCapabilities } = input
    if (cachedCapabilities && cachedCapabilities.providerId === 'codex') {
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

    const userProvidedModel = isUsableString(providerInput.model) ? providerInput.model.trim() : undefined
    const alias = userProvidedModel ? resolveCodexAlias(userProvidedModel) : undefined
    // When the user provides an alias (e.g. "codexplan"), resolvedApiName should be
    // the actual model name (e.g. "gpt-5.5"). When the user provides a direct model
    // name that is also an alias key (e.g. "gpt-5.5"), it resolves to itself.
    const resolvedModel = alias?.model ?? userProvidedModel ?? ''

    const modelSource = userProvidedModel ? 'manual' as const : 'fallback' as const
    const confidence = userProvidedModel ? 'manual' as const : 'adapter_fallback' as const

    // Reasoning / thinking support
    const catalogSupportsReasoning = catalogEntry?.capabilities?.supportsReasoning === true
    const aliasSupportsReasoning = resolvedModel ? supportsReasoningEffort(resolvedModel) : false
    const thinkingSupported = catalogSupportsReasoning || aliasSupportsReasoning

    const effortSupported = resolvedModel ? supportsReasoningEffort(resolvedModel) : false
    const effortValue = resolvedModel ? getReasoningEffort(resolvedModel) : undefined

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

    // Build native effort values when supported
    // Includes low/medium/high from alias data, plus a manual-only max/xhigh entry
    const nativeValues: RuntimeModelCapabilities['effort']['nativeValues'] = effortSupported
      ? [
          ...(['low', 'medium', 'high'] as const).map((level) => ({
            abstract: level as AbstractEffort,
            native: level,
            label: level,
            allowedInAuto: level !== 'low',
            isDefault: level === (effortValue ?? 'medium'),
          })),
          {
            abstract: 'max' as AbstractEffort,
            native: 'xhigh',
            label: 'max',
            allowedInAuto: false,
            isDefault: false,
          },
        ]
      : []

    // Determine the correct defaultAbstractEffort and maxAutoAbstractEffort
    const defaultAbstract: Exclude<AbstractEffort, 'auto'> =
      effortValue === 'high' ? 'high' :
      effortValue === 'medium' ? 'medium' : 'none'

    const maxAutoAbstract: 'none' | 'low' | 'medium' | 'high' =
      effortValue === 'high' ? 'high' :
      effortValue === 'medium' ? 'medium' : 'none'

    return {
      routeId: input.routeId,
      providerId: 'codex',
      providerLabel: descriptor?.label ?? this.label,
      model: {
        requested: userProvidedModel ?? resolvedModel,
        resolvedApiName: resolvedModel,
        source: modelSource,
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
        supported: thinkingSupported,
        adaptiveSupported: false,
        mode: thinkingSupported ? 'provider_specific' : 'none',
        source: 'fallback',
      },
      effort: {
        supported: effortSupported,
        mode: effortSupported ? 'reasoning_effort' : 'none',
        nativeValues,
        defaultAbstractEffort: defaultAbstract,
        maxAutoAbstractEffort: maxAutoAbstract,
        allowAutoMax: false,
        autoStrategy: 'openclaude_decides',
        source: 'fallback',
      },
      payload: {
        endpoint: 'codex_responses',
        maxTokensField,
        supportsUserCustomHeaders: supportsAuthHeaders,
      },
      limits: {
        contextWindow,
        maxOutputTokens,
      },
      confidence,
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

    // Strip x-anthropic-billing-header leakage
    stripBillingHeaderFromBody(result)

    // Never inject apiKey or Authorization headers
    delete result.apiKey
    delete result.authorization
    delete result.Authorization

    return result
  }

  classifyError(error: unknown): RuntimeProviderErrorClassification {
    const safeMessage = redactErrorMessage(error)
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
      lowerMessage.includes('account unauthorized')
    ) {
      return {
        severity: 'fatal',
        code: 'invalid_api_key',
        reason: 'Codex authentication failed.',
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
        reason: 'Codex model was not found.',
      }
    }

    // Everything else - return a stable generic reason to avoid leaking sensitive information
    return {
      severity: 'warning',
      code: 'probe_failed',
      reason: 'Codex request failed before completion.',
    }
  }
}
