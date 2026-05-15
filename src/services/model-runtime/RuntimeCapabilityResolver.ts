// PR1 — Managed Adapter Runtime: RuntimeCapabilityResolver
// Pure, conservative metadata-based resolver for runtime capabilities.
// No network calls. No filesystem access. No environment mutation. No logging.
// No provider API calls. No bridge imports. No services/api imports.
// No command/bootstrap imports. No real provider adapter implementation.
// No request sending. No hidden persistence. No raw secrets in keys.

import type {
  RuntimeCapabilityCacheKey,
  RuntimeModelCapabilities,
  RuntimeRouteResolution,
  RuntimeSetupInput,
  ModelCatalogEntry,
  TransportKind,
  RouteDescriptor,
} from './types.js'

import {
  createAuthFingerprint,
  createBaseUrlHash,
} from './RuntimeSecurity.js'

import {
  normalizeRuntimeEndpoint,
} from './RuntimeEndpointNormalizer.js'

// Local types

export type ResolveRuntimeRouteInput = {
  routeId: string
  descriptor: RouteDescriptor
  catalogEntry?: ModelCatalogEntry | null
  providerInput: {
    providerId: string
    baseUrl: string
    model: string
  }
}

export type ResolveRuntimeCacheKeyInput = {
  routeId: string
  providerInput: {
    baseUrl: string
    model: string
    apiKey?: string
    apiFormat?: string
  }
}

// resolveRuntimeRoute

/**
 * Resolve route/metadata from setup input.
 *
 * Preserves:
 * - providerInput.providerId
 * - providerInput.model
 * - providerInput.baseUrl after normalization only
 * - descriptor.label
 * - catalogEntry when provided
 *
 * Model selection order (compatible with legacy behavior):
 * 1. providerInput.model if non-empty
 * 2. catalogEntry.apiName if present
 * 3. descriptor.defaultModel if present
 * 4. "unknown"
 */
export function resolveRuntimeRoute(
  input: ResolveRuntimeRouteInput,
): RuntimeRouteResolution & {
  normalizedBaseUrl: string
  baseUrlNormalizationChanged: boolean
  resolvedModel: string
  modelSource: RuntimeModelCapabilities['model']['source']
} {
  const { routeId, descriptor, catalogEntry, providerInput } = input

  // Normalize baseUrl
  const normalization = normalizeRuntimeEndpoint(providerInput.baseUrl)

  // Resolve model — order: explicit input → catalog → descriptor → "unknown"
  let resolvedModel: string
  let modelSource: RuntimeModelCapabilities['model']['source']

  if (providerInput.model) {
    resolvedModel = providerInput.model
    modelSource = 'manual'
  } else if (catalogEntry?.apiName) {
    resolvedModel = catalogEntry.apiName
    modelSource = 'catalog'
  } else if ('defaultModel' in descriptor && descriptor.defaultModel) {
    resolvedModel = descriptor.defaultModel
    modelSource = 'fallback'
  } else {
    resolvedModel = 'unknown'
    modelSource = 'fallback'
  }

  // Resolve transportKind from descriptor
  const transportKind: TransportKind | null =
    descriptor.transportConfig?.kind ?? null

  return {
    routeId,
    descriptor,
    catalogEntry: catalogEntry ?? null,
    transportKind,
    normalizedBaseUrl: normalization.normalized,
    baseUrlNormalizationChanged: normalization.changed,
    resolvedModel,
    modelSource,
  }
}

// ── resolveRuntimeCapabilityCacheKey ─────────────────────────────────────

/**
 * Build a RuntimeCapabilityCacheKey safely.
 *
 * - baseUrlHash uses createBaseUrlHash(normalizedBaseUrl) — never raw URL.
 * - authFingerprint uses createAuthFingerprint(apiKey) when apiKey exists,
 *   otherwise the stable non-secret value "no-auth".
 * - Never includes raw apiKey, raw baseUrl, Authorization header, or raw token.
 * - apiFormat included when present.
 */
export function resolveRuntimeCapabilityCacheKey(
  input: ResolveRuntimeCacheKeyInput,
): RuntimeCapabilityCacheKey {
  const { routeId, providerInput } = input

  const normalization = normalizeRuntimeEndpoint(providerInput.baseUrl)
  const baseUrlHash = createBaseUrlHash(normalization.normalized)

  const authFingerprint = providerInput.apiKey
    ? createAuthFingerprint(providerInput.apiKey)
    : 'no-auth'

  const key: RuntimeCapabilityCacheKey = {
    routeId,
    baseUrlHash,
    model: providerInput.model,
    authFingerprint,
  }

  if (providerInput.apiFormat) {
    key.apiFormat = providerInput.apiFormat
  }

  return key
}

// ── resolveRuntimeCapabilitiesFromMetadata ───────────────────────────────

/**
 * Conservative metadata-based RuntimeModelCapabilities resolver.
 *
 * Uses only descriptor and catalog metadata — no network calls, no probes.
 *
 * Rules:
 * - providerId: providerInput.providerId when present, else routeId
 * - providerLabel: descriptor.label
 * - model.requested and model.resolvedApiName preserve explicit providerInput.model
 * - availability: checked=false unless catalog proves otherwise
 * - tools.supported: catalogEntry.capabilities.supportsFunctionCalling
 * - tools.format: conservative from transportKind
 * - thinking.supported: catalogEntry.capabilities.supportsReasoning
 * - effort: conservative (false by default)
 * - payload.endpoint: derived from descriptor.transportConfig.kind
 * - payload.maxTokensField: from descriptor when present, else "max_tokens"
 * - limits: from catalogEntry when present
 * - confidence: catalog | manual | conservative
 */
export function resolveRuntimeCapabilitiesFromMetadata(
  input: RuntimeSetupInput,
): RuntimeModelCapabilities {
  const { routeId, descriptor, catalogEntry, providerInput } = input

  // Route resolution
  const route = resolveRuntimeRoute({
    routeId,
    descriptor,
    catalogEntry,
    providerInput: {
      providerId: providerInput.providerId,
      baseUrl: providerInput.baseUrl,
      model: providerInput.model,
    },
  })

  // providerId: explicit providerInput when present, else routeId
  const providerId = providerInput.providerId || routeId

  // providerLabel: from descriptor
  const providerLabel = descriptor.label

  // Model resolution
  const model = {
    requested: providerInput.model || route.resolvedModel,
    resolvedApiName: route.resolvedModel,
    source: route.modelSource,
  }

  // Availability — conservative
  const hasCatalogEntry = Boolean(catalogEntry)
  const availability: RuntimeModelCapabilities['availability'] = {
    checked: hasCatalogEntry,
    exists: hasCatalogEntry,
    active: hasCatalogEntry,
    verifiedBy: hasCatalogEntry ? 'catalog' : 'not_checked',
  }

  // Tools
  const toolsSupported = Boolean(
    catalogEntry?.capabilities?.supportsFunctionCalling,
  )
  const toolsFormat = resolveToolFormat(route.transportKind)

  // Thinking
  const thinkingSupported = Boolean(
    catalogEntry?.capabilities?.supportsReasoning,
  )
  const thinking: RuntimeModelCapabilities['thinking'] = {
    supported: thinkingSupported,
    adaptiveSupported: false,
    mode: thinkingSupported ? 'provider_specific' : 'none',
    source: catalogEntry ? 'catalog' : 'fallback',
  }

  // Effort — conservative by default
  const effort: RuntimeModelCapabilities['effort'] = {
    supported: false,
    mode: 'none',
    nativeValues: [],
    defaultAbstractEffort: 'none',
    maxAutoAbstractEffort: 'none',
    allowAutoMax: false,
    autoStrategy: 'openclaude_decides',
    source: 'fallback',
  }

  // Payload
  const endpoint = resolvePayloadEndpoint(route.transportKind)
  const maxTokensField = resolveMaxTokensField(descriptor)

  const payload: RuntimeModelCapabilities['payload'] = {
    endpoint,
    maxTokensField,
  }

  // Apply catalog transport overrides when present
  if (catalogEntry?.transportOverrides?.openaiShim) {
    const overrides = catalogEntry.transportOverrides.openaiShim
    if (overrides.maxTokensField) {
      payload.maxTokensField = overrides.maxTokensField
    }
    if (overrides.preserveReasoningContent !== undefined) {
      payload.preserveReasoningContent = overrides.preserveReasoningContent
    }
    if (overrides.requireReasoningContentOnAssistantMessages !== undefined) {
      payload.requireReasoningContentOnAssistantMessages =
        overrides.requireReasoningContentOnAssistantMessages
    }
    if (overrides.removeBodyFields) {
      payload.removeBodyFields = overrides.removeBodyFields
    }
  }

  // Limits
  const limits: RuntimeModelCapabilities['limits'] = {}
  if (catalogEntry?.contextWindow != null) {
    limits.contextWindow = catalogEntry.contextWindow
  }
  if (catalogEntry?.maxOutputTokens != null) {
    limits.maxOutputTokens = catalogEntry.maxOutputTokens
  }

  // Confidence
  const confidence = resolveConfidence(hasCatalogEntry, route.modelSource)

  return {
    routeId,
    providerId,
    providerLabel,
    model,
    availability,
    tools: {
      supported: toolsSupported,
      format: toolsFormat,
    },
    thinking,
    effort,
    payload,
    limits,
    confidence,
  }
}

// ── Internal helpers ─────────────────────────────────────────────────────

/**
 * Resolve tool format from transport kind.
 * Conservative: only assigns "openai", "anthropic", "gemini" when the
 * transport kind clearly matches. Otherwise "none".
 */
function resolveToolFormat(
  transportKind: TransportKind | null,
): RuntimeModelCapabilities['tools']['format'] {
  if (!transportKind) return 'none'

  switch (transportKind) {
    case 'anthropic-native':
    case 'anthropic-proxy':
    case 'bedrock':
    case 'vertex':
      return 'anthropic'
    case 'gemini-native':
      return 'gemini'
    case 'openai-compatible':
    case 'local':
      return 'openai'
    default:
      return 'none'
  }
}

/**
 * Resolve payload endpoint from transport kind.
 * Conservative: uses known mappings, defaults to chat_completions.
 */
function resolvePayloadEndpoint(
  transportKind: TransportKind | null,
): RuntimeModelCapabilities['payload']['endpoint'] {
  if (!transportKind) return 'chat_completions'

  switch (transportKind) {
    case 'anthropic-native':
    case 'anthropic-proxy':
    case 'bedrock':
    case 'vertex':
      return 'anthropic_messages'
    case 'gemini-native':
      return 'gemini_native'
    case 'openai-compatible':
    case 'local':
      return 'chat_completions'
    default:
      return 'chat_completions'
  }
}

/**
 * Resolve maxTokensField from descriptor transport config.
 * Defaults to "max_tokens" when metadata does not specify otherwise.
 */
function resolveMaxTokensField(
  descriptor: RouteDescriptor,
): RuntimeModelCapabilities['payload']['maxTokensField'] {
  const shim = descriptor.transportConfig?.openaiShim
  if (shim?.maxTokensField) {
    return shim.maxTokensField
  }
  return 'max_tokens'
}

/**
 * Resolve confidence level.
 * - "catalog" when catalogEntry is used as the main source
 * - "manual" when explicit user input is used without catalog metadata
 * - "conservative" when fallback assumptions are used
 */
function resolveConfidence(
  hasCatalogEntry: boolean,
  modelSource: RuntimeModelCapabilities['model']['source'],
): RuntimeModelCapabilities['confidence'] {
  if (hasCatalogEntry) return 'catalog'
  if (modelSource === 'manual') return 'manual'
  return 'conservative'
}
