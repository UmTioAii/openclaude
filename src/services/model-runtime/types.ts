import type {
  ModelCatalogEntry,
  TransportKind,
} from '../../integrations/descriptors.js'

import type {
  RouteDescriptor,
} from '../../integrations/routeMetadata.js'

export type ManagedProviderId =
  | 'codex'
  | 'gemini'
  | 'nvidia-nim'
  | 'openrouter'

export type RuntimeAdapterId =
  | ManagedProviderId
  | 'legacy-passthrough'

export type RuntimeErrorCode =
  | 'invalid_api_key'
  | 'missing_required_auth'
  | 'model_not_found'
  | 'invalid_base_url'
  | 'metadata_unavailable'
  | 'probe_failed'
  | 'unknown_provider'

export type AbstractEffort =
  | 'none'
  | 'auto'
  | 'low'
  | 'medium'
  | 'high'
  | 'max'

export type NativeEffortValue =
  | string
  | number
  | boolean
  | { type: string; [key: string]: unknown }

export type RuntimeThinkingCapability = {
  supported: boolean
  adaptiveSupported: boolean
  mode:
    | 'none'
    | 'adaptive'
    | 'reasoning_effort'
    | 'reasoning_object'
    | 'thinking_object'
    | 'budget_tokens'
    | 'reasoning_content_history'
    | 'provider_specific'
  source:
    | 'descriptor'
    | 'catalog'
    | 'metadata'
    | 'probe'
    | 'legacy_bridge'
    | 'fallback'
}

export type RuntimeEffortCapability = {
  supported: boolean
  mode:
    | 'none'
    | 'native_enum'
    | 'reasoning_effort'
    | 'reasoning_object'
    | 'thinking_object'
    | 'budget_tokens'
    | 'adaptive_only'
    | 'provider_auto'
  nativeValues: Array<{
    abstract: AbstractEffort
    native: NativeEffortValue
    label: string
    allowedInAuto: boolean
    isDefault?: boolean
  }>
  defaultAbstractEffort: Exclude<AbstractEffort, 'auto'>
  maxAutoAbstractEffort: 'none' | 'low' | 'medium' | 'high'
  allowAutoMax: boolean
  autoStrategy: 'openclaude_decides' | 'provider_decides'
  source:
    | 'descriptor'
    | 'catalog'
    | 'metadata'
    | 'probe'
    | 'legacy_bridge'
    | 'fallback'
}

export type RuntimeModelCapabilities = {
  routeId: string
  providerId: string
  providerLabel: string

  model: {
    requested: string
    resolvedApiName: string
    source:
      | 'catalog'
      | 'models_api'
      | 'metadata'
      | 'probe'
      | 'legacy_bridge'
      | 'manual'
      | 'fallback'
  }

  availability: {
    checked: boolean
    exists: boolean
    active: boolean
    verifiedBy:
      | 'models_api'
      | 'native_models_api'
      | 'metadata'
      | 'probe'
      | 'responses_probe'
      | 'catalog'
      | 'legacy_bridge'
      | 'manual'
      | 'not_checked'
  }

  tools: {
    supported: boolean
    format: 'openai' | 'anthropic' | 'gemini' | 'none'
    strictSchema?: boolean
  }

  thinking: RuntimeThinkingCapability
  effort: RuntimeEffortCapability

  payload: {
    endpoint:
      | 'chat_completions'
      | 'responses'
      | 'codex_responses'
      | 'gemini_native'
      | 'anthropic_messages'
    maxTokensField:
      | 'max_tokens'
      | 'max_completion_tokens'
    reasoningField?:
      | 'reasoning_effort'
      | 'reasoning'
      | 'thinking'
    preserveReasoningContent?: boolean
    requireReasoningContentOnAssistantMessages?: boolean
    removeBodyFields?: string[]
    supportsSystemRole?: boolean
    supportsUserCustomHeaders?: boolean
  }

  limits: {
    contextWindow?: number
    maxOutputTokens?: number
  }

  confidence:
    | 'not_resolved'
    | 'remote_metadata'
    | 'models_api'
    | 'native_models_api'
    | 'probe'
    | 'responses_probe'
    | 'catalog'
    | 'legacy_bridge'
    | 'adapter_fallback'
    | 'manual'
    | 'conservative'
}

export type RuntimeSetupInput = {
  routeId: string
  descriptor: RouteDescriptor
  catalogEntry?: ModelCatalogEntry | null

  providerInput: {
    providerId: string
    baseUrl: string
    model: string
    apiKey?: string
    authMode?: string
    apiFormat?: string
  }

  processEnv: NodeJS.ProcessEnv
}

export type RuntimeStartupInput = RuntimeSetupInput & {
  cachedCapabilities?: RuntimeModelCapabilities
}

export type RuntimeSetupResult =
  | { ok: true; capabilities: RuntimeModelCapabilities }
  | {
      ok: false
      severity: 'fatal' | 'warning'
      reason: string
      code: RuntimeErrorCode
    }

export type StartupVerificationResult =
  | { ok: true; capabilities?: RuntimeModelCapabilities }
  | {
      ok: false
      severity: 'fatal' | 'warning'
      reason: string
      code: RuntimeErrorCode
    }

export type ResolveRuntimeCapabilitiesInput = RuntimeSetupInput

export type ProviderPayload = Record<string, unknown>

export type BuildRuntimePayloadInput = {
  capabilities: RuntimeModelCapabilities
  body: Record<string, unknown>
}

export type RuntimeProviderErrorClassification = {
  severity: 'fatal' | 'warning'
  code: RuntimeErrorCode
  reason: string
}

export type RuntimeProviderAdapter = {
  id: RuntimeAdapterId
  label: string

  supportsRoute(routeId: string, descriptor: RouteDescriptor): boolean

  validateSetup(input: RuntimeSetupInput): Promise<RuntimeSetupResult>

  verifyStartup(input: RuntimeStartupInput): Promise<StartupVerificationResult>

  resolveCapabilities(
    input: ResolveRuntimeCapabilitiesInput,
  ): Promise<RuntimeModelCapabilities>

  buildPayload?(input: BuildRuntimePayloadInput): ProviderPayload

  classifyError?(error: unknown): RuntimeProviderErrorClassification
}

export type RuntimeCapabilityCacheKey = {
  routeId: string
  baseUrlHash: string
  model: string
  authFingerprint: string
  apiFormat?: string
}

export type RuntimeRouteResolution = {
  routeId: string
  descriptor: RouteDescriptor
  catalogEntry?: ModelCatalogEntry | null
  transportKind: TransportKind | null
}
