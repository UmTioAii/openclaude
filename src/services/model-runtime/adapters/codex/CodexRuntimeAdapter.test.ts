// PR1 — CodexRuntimeAdapter focused tests

import { describe, it, expect } from 'bun:test'
import { CodexRuntimeAdapter } from './CodexRuntimeAdapter.js'
import type {
  RuntimeSetupInput,
  RuntimeModelCapabilities,
} from '../../types.js'
import type { RouteDescriptor } from '../../../../integrations/routeMetadata.js'

// ── Helpers ────────────────────────────────────────────────────────────

/**
 * Construct a minimal RouteDescriptor for tests.
 * RouteDescriptor = GatewayDescriptor | VendorDescriptor — both require
 * many fields that are irrelevant to the adapter. We cast `as any` once
 * here and pass the typed `RouteDescriptor` to avoid polluting every test.
 */
function makeDescriptor(
  overrides: Record<string, unknown> = {},
): RouteDescriptor {
  return {
    id: 'codex',
    label: 'Codex',
    vendor: 'openai',
    transportConfig: {
      kind: 'openai-compatible',
      openaiShim: {},
    },
    ...overrides,
  } as unknown as RouteDescriptor
}

function makeCapabilities(
  overrides: Partial<RuntimeModelCapabilities> = {},
): RuntimeModelCapabilities {
  return {
    routeId: 'codex',
    providerId: 'codex',
    providerLabel: 'Codex',
    model: {
      requested: 'gpt-5.5',
      resolvedApiName: 'gpt-5.5',
      source: 'manual',
    },
    availability: {
      checked: false,
      exists: true,
      active: true,
      verifiedBy: 'manual',
    },
    tools: { supported: true, format: 'openai' },
    thinking: {
      supported: true,
      adaptiveSupported: false,
      mode: 'provider_specific',
      source: 'fallback',
    },
    effort: {
      supported: true,
      mode: 'reasoning_effort',
      nativeValues: [
        { abstract: 'low', native: 'low', label: 'low', allowedInAuto: false, isDefault: false },
        { abstract: 'medium', native: 'medium', label: 'medium', allowedInAuto: true, isDefault: false },
        { abstract: 'high', native: 'high', label: 'high', allowedInAuto: true, isDefault: true },
        { abstract: 'max', native: 'xhigh', label: 'max', allowedInAuto: false, isDefault: false },
      ],
      defaultAbstractEffort: 'high',
      maxAutoAbstractEffort: 'high',
      allowAutoMax: false,
      autoStrategy: 'openclaude_decides',
      source: 'fallback',
    },
    payload: {
      endpoint: 'codex_responses',
      maxTokensField: 'max_tokens',
      supportsUserCustomHeaders: false,
    },
    limits: {},
    confidence: 'manual',
    ...overrides,
  }
}

const adapter = new CodexRuntimeAdapter()

const validProviderInput = {
  apiKey: 'sk-test-codex-key',
  baseUrl: 'https://chatgpt.com/backend-api/codex',
  model: 'gpt-5.5',
}

// ── Identity ───────────────────────────────────────────────────────────

describe('CodexRuntimeAdapter — identity', () => {
  it('id is "codex"', () => {
    expect(adapter.id).toBe('codex')
  })

  it('label is stable', () => {
    expect(adapter.label).toBe('Codex')
  })
})

// ── supportsRoute ──────────────────────────────────────────────────────

describe('CodexRuntimeAdapter — supportsRoute', () => {
  const desc = makeDescriptor()

  it('returns true for routeId "codex"', () => {
    expect(adapter.supportsRoute('codex', desc)).toBe(true)
  })

  it('returns true when descriptor.id is "codex"', () => {
    expect(adapter.supportsRoute('other-id', makeDescriptor({ id: 'codex' }))).toBe(true)
  })

  it('returns false for "nvidia-nim"', () => {
    expect(adapter.supportsRoute('nvidia-nim', makeDescriptor({ id: 'nvidia-nim' }))).toBe(false)
  })

  it('returns false for "openrouter"', () => {
    expect(adapter.supportsRoute('openrouter', makeDescriptor({ id: 'openrouter' }))).toBe(false)
  })

  it('returns false for "gemini"', () => {
    expect(adapter.supportsRoute('gemini', makeDescriptor({ id: 'gemini' }))).toBe(false)
  })

  it('returns false for "openai"', () => {
    expect(adapter.supportsRoute('openai', makeDescriptor({ id: 'openai' }))).toBe(false)
  })

  it('returns false for arbitrary custom provider', () => {
    expect(adapter.supportsRoute('custom-xyz', makeDescriptor({ id: 'custom-xyz' }))).toBe(false)
  })
})

// ── validateSetup ──────────────────────────────────────────────────────

describe('CodexRuntimeAdapter — validateSetup', () => {
  const baseInput: RuntimeSetupInput = {
    routeId: 'codex',
    descriptor: makeDescriptor(),
    catalogEntry: undefined,
    providerInput: { ...validProviderInput },
    processEnv: {},
  }

  it('returns fatal missing_required_auth when auth is missing', async () => {
    const input: RuntimeSetupInput = {
      ...baseInput,
      providerInput: { ...validProviderInput, apiKey: undefined as unknown as string },
    }
    const result = await adapter.validateSetup(input)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.severity).toBe('fatal')
      expect(result.code).toBe('missing_required_auth')
    }
  })

  it('rejects whitespace-only auth', async () => {
    const input: RuntimeSetupInput = {
      ...baseInput,
      providerInput: { ...validProviderInput, apiKey: '   ' },
    }
    const result = await adapter.validateSetup(input)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.code).toBe('missing_required_auth')
    }
  })

  it('rejects non-string malformed auth', async () => {
    const input = {
      ...baseInput,
      providerInput: { ...validProviderInput, apiKey: 12345 as unknown as string },
    }
    const result = await adapter.validateSetup(input)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.code).toBe('missing_required_auth')
    }
  })

  it('accepts empty baseUrl because DEFAULT_CODEX_BASE_URL is a safe fallback', async () => {
    const input: RuntimeSetupInput = {
      ...baseInput,
      providerInput: { ...validProviderInput, baseUrl: '' },
    }
    const result = await adapter.validateSetup(input)
    // Should succeed because Codex has a safe default base URL
    expect(result.ok).toBe(true)
  })

  it('rejects non-string malformed baseUrl', async () => {
    const input = {
      ...baseInput,
      providerInput: { ...validProviderInput, baseUrl: 999 as unknown as string },
    }
    const result = await adapter.validateSetup(input)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.severity).toBe('fatal')
      expect(result.code).toBe('invalid_base_url')
    }
  })

  it('returns fatal model_not_found when model is empty', async () => {
    const input: RuntimeSetupInput = {
      ...baseInput,
      providerInput: { ...validProviderInput, model: '' },
    }
    const result = await adapter.validateSetup(input)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.severity).toBe('fatal')
      expect(result.code).toBe('model_not_found')
    }
  })

  it('rejects whitespace-only model', async () => {
    const input: RuntimeSetupInput = {
      ...baseInput,
      providerInput: { ...validProviderInput, model: '   ' },
    }
    const result = await adapter.validateSetup(input)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.code).toBe('model_not_found')
    }
  })

  it('rejects non-string malformed model', async () => {
    const input = {
      ...baseInput,
      providerInput: { ...validProviderInput, model: 42 as unknown as string },
    }
    const result = await adapter.validateSetup(input)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.code).toBe('model_not_found')
    }
  })

  it('returns ok:true with capabilities when required fields exist', async () => {
    const result = await adapter.validateSetup(baseInput)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.capabilities.providerId).toBe('codex')
    }
  })
})

// ── verifyStartup ──────────────────────────────────────────────────────

describe('CodexRuntimeAdapter — verifyStartup', () => {
  const baseInput = {
    routeId: 'codex',
    descriptor: makeDescriptor(),
    catalogEntry: undefined,
    providerInput: { ...validProviderInput },
    processEnv: {},
  }

  it('returns ok:true with capabilities without network', async () => {
    const result = await adapter.verifyStartup(baseInput)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.capabilities?.providerId).toBe('codex')
    }
  })

  it('uses cachedCapabilities when providerId is codex', async () => {
    const cached = makeCapabilities({ routeId: 'codex' })
    const result = await adapter.verifyStartup({
      ...baseInput,
      cachedCapabilities: cached,
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.capabilities).toBe(cached)
    }
  })

  it('ignores cachedCapabilities from a different providerId', async () => {
    const cached = makeCapabilities({ providerId: 'openrouter', routeId: 'codex' })
    const result = await adapter.verifyStartup({
      ...baseInput,
      cachedCapabilities: cached,
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.capabilities?.providerId).toBe('codex')
      expect(result.capabilities).not.toBe(cached)
    }
  })
})

// ── resolveCapabilities ────────────────────────────────────────────────

describe('CodexRuntimeAdapter — resolveCapabilities', () => {
  const baseInput = {
    routeId: 'codex',
    descriptor: makeDescriptor(),
    catalogEntry: undefined,
    providerInput: { ...validProviderInput },
    processEnv: {},
  }

  it('preserves explicit providerInput.model', async () => {
    const caps = await adapter.resolveCapabilities(baseInput)
    expect(caps.model.requested).toBe('gpt-5.5')
    expect(caps.model.resolvedApiName).toBe('gpt-5.5')
    expect(caps.model.source).toBe('manual')
  })

  it('does not mutate input', async () => {
    const inputCopy = {
      ...baseInput,
      providerInput: { ...baseInput.providerInput },
    }
    const frozen = JSON.parse(JSON.stringify(inputCopy))
    await adapter.resolveCapabilities(inputCopy)
    expect(inputCopy.providerInput.model).toBe(frozen.providerInput.model)
    expect(inputCopy.providerInput.baseUrl).toBe(frozen.providerInput.baseUrl)
  })

  it('uses codex_responses endpoint', async () => {
    const caps = await adapter.resolveCapabilities(baseInput)
    expect(caps.payload.endpoint).toBe('codex_responses')
  })

  it('uses openai tool format', async () => {
    const caps = await adapter.resolveCapabilities(baseInput)
    expect(caps.tools.format).toBe('openai')
  })

  it('keeps effort conservative for models without alias effort support', async () => {
    const input = {
      ...baseInput,
      providerInput: { ...validProviderInput, model: 'gpt-5.3-codex-spark' },
    }
    const caps = await adapter.resolveCapabilities(input)
    expect(caps.effort.supported).toBe(false)
    expect(caps.effort.mode).toBe('none')
    expect(caps.effort.nativeValues).toHaveLength(0)
    expect(caps.effort.defaultAbstractEffort).toBe('none')
  })

  it('enables effort for codexplan (alias with reasoning support)', async () => {
    const input = {
      ...baseInput,
      providerInput: { ...validProviderInput, model: 'codexplan' },
    }
    const caps = await adapter.resolveCapabilities(input)
    expect(caps.effort.supported).toBe(true)
    expect(caps.effort.mode).toBe('reasoning_effort')
    expect(caps.effort.defaultAbstractEffort).toBe('high')
    expect(caps.effort.maxAutoAbstractEffort).toBe('high')
    expect(caps.effort.nativeValues.length).toBeGreaterThan(0)
  })

  it('sets thinking.provider_specific only when supported', async () => {
    // Supported for gpt-5.5 (has reasoning effort)
    const capsSupported = await adapter.resolveCapabilities(baseInput)
    expect(capsSupported.thinking.supported).toBe(true)
    expect(capsSupported.thinking.mode).toBe('provider_specific')

    // Not supported for codexspark
    const inputSpark = {
      ...baseInput,
      providerInput: { ...validProviderInput, model: 'gpt-5.3-codex-spark' },
    }
    const capsNotSupported = await adapter.resolveCapabilities(inputSpark)
    expect(capsNotSupported.thinking.supported).toBe(false)
    expect(capsNotSupported.thinking.mode).toBe('none')
  })

  it('uses descriptor maxTokensField when provided', async () => {
    const input = {
      ...baseInput,
      descriptor: makeDescriptor({
        transportConfig: {
          kind: 'openai-compatible',
          openaiShim: { maxTokensField: 'max_completion_tokens' },
        },
      }),
    }
    const caps = await adapter.resolveCapabilities(input)
    expect(caps.payload.maxTokensField).toBe('max_completion_tokens')
  })

  it('defaults maxTokensField to "max_tokens"', async () => {
    const caps = await adapter.resolveCapabilities(baseInput)
    expect(caps.payload.maxTokensField).toBe('max_tokens')
  })

  it('supportsUserCustomHeaders follows descriptor openaiShim supportsAuthHeaders', async () => {
    const inputTrue = {
      ...baseInput,
      descriptor: makeDescriptor({
        transportConfig: {
          kind: 'openai-compatible',
          openaiShim: { supportsAuthHeaders: true },
        },
      }),
    }
    const capsTrue = await adapter.resolveCapabilities(inputTrue)
    expect(capsTrue.payload.supportsUserCustomHeaders).toBe(true)

    const inputFalse = {
      ...baseInput,
      descriptor: makeDescriptor({
        transportConfig: {
          kind: 'openai-compatible',
          openaiShim: { supportsAuthHeaders: false },
        },
      }),
    }
    const capsFalse = await adapter.resolveCapabilities(inputFalse)
    expect(capsFalse.payload.supportsUserCustomHeaders).toBe(false)
  })

  it('sets limits from catalogEntry when present', async () => {
    const input = {
      ...baseInput,
      catalogEntry: {
        contextWindow: 128000,
        maxOutputTokens: 16384,
        capabilities: { supportsReasoning: true },
      },
    }
    const caps = await adapter.resolveCapabilities(input)
    expect(caps.limits.contextWindow).toBe(128000)
    expect(caps.limits.maxOutputTokens).toBe(16384)
  })

  it('handles codexplan alias — resolves model without overriding explicit user input', async () => {
    // User explicitly passes "codexplan" — should be preserved as requested
    const input = {
      ...baseInput,
      providerInput: { ...validProviderInput, model: 'codexplan' },
    }
    const caps = await adapter.resolveCapabilities(input)
    expect(caps.model.requested).toBe('codexplan')
    expect(caps.model.resolvedApiName).toBe('gpt-5.5')
    expect(caps.model.source).toBe('manual')
    expect(caps.effort.supported).toBe(true)
    expect(caps.effort.defaultAbstractEffort).toBe('high')
  })

  it('sets model source to fallback when no user model is provided', async () => {
    const input = {
      ...baseInput,
      providerInput: { ...validProviderInput, model: '' },
    }
    const caps = await adapter.resolveCapabilities(input)
    expect(caps.model.source).toBe('fallback')
    expect(caps.confidence).toBe('adapter_fallback')
  })

  it('sets confidence to manual when user provides explicit model', async () => {
    const caps = await adapter.resolveCapabilities(baseInput)
    expect(caps.confidence).toBe('manual')
  })

  it('sets catalogEntry capabilities.supportsReasoning as thinking support source', async () => {
    const input = {
      ...baseInput,
      catalogEntry: {
        contextWindow: 128000,
        maxOutputTokens: 16384,
        capabilities: { supportsReasoning: true },
      },
      // Use a model that doesn't have alias reasoning support
      providerInput: { ...validProviderInput, model: 'some-unknown-model' },
    }
    const caps = await adapter.resolveCapabilities(input)
    expect(caps.thinking.supported).toBe(true)
  })
})

// ── buildPayload ───────────────────────────────────────────────────────

describe('CodexRuntimeAdapter — buildPayload', () => {
  const caps = makeCapabilities()

  it('does not mutate original body', () => {
    const original = { messages: [{ role: 'user', content: 'hello' }], model: 'gpt-5.5' }
    const frozen = JSON.parse(JSON.stringify(original))
    adapter.buildPayload({ capabilities: caps, body: original })
    expect(original).toEqual(frozen)
  })

  it('preserves existing body.model', () => {
    const body = { model: 'custom-model', messages: [] }
    const result = adapter.buildPayload({ capabilities: caps, body })
    expect(result.model).toBe('custom-model')
  })

  it('sets model when body.model is absent', () => {
    const body = { messages: [] }
    const result = adapter.buildPayload({ capabilities: caps, body })
    expect(result.model).toBe('gpt-5.5')
  })

  it('sets model when body.model is empty string', () => {
    const body = { model: '', messages: [] }
    const result = adapter.buildPayload({ capabilities: caps, body })
    expect(result.model).toBe('gpt-5.5')
  })

  it('applies maxTokensField mapping', () => {
    const capsWithField = makeCapabilities({
      payload: {
        endpoint: 'codex_responses',
        maxTokensField: 'max_completion_tokens',
        supportsUserCustomHeaders: false,
      },
    })
    const body = { messages: [], max_tokens: 1024 }
    const result = adapter.buildPayload({ capabilities: capsWithField, body })
    // applyQuirkPolicy should map max_tokens -> max_completion_tokens
    expect(result).toHaveProperty('max_completion_tokens')
  })

  it('does not inject apiKey or authorization', () => {
    const body = { messages: [] }
    const result = adapter.buildPayload({ capabilities: caps, body })
    expect(result).not.toHaveProperty('apiKey')
    expect(result).not.toHaveProperty('api_key')
    expect(result).not.toHaveProperty('Authorization')
    expect(result).not.toHaveProperty('authorization')
  })

  it('strips x-anthropic-billing-header from system prompt text', () => {
    const body = {
      model: 'gpt-5.5',
      messages: [],
      system: 'You are helpful. x-anthropic-billing-header: some-billing-id',
    }
    const result = adapter.buildPayload({ capabilities: caps, body })
    expect(result.system).not.toContain('x-anthropic-billing-header')
    expect(result.system).toContain('You are helpful.')
  })

  it('strips x-anthropic-billing-header from message content', () => {
    const body = {
      model: 'gpt-5.5',
      messages: [
        { role: 'user', content: 'hello x-anthropic-billing-header: billing-xyz' },
      ],
    }
    const result = adapter.buildPayload({ capabilities: caps, body })
    const firstMsg = (result.messages as Array<{ content: string }>)[0]
    expect(firstMsg.content).not.toContain('x-anthropic-billing-header')
  })

  it('strips x-anthropic-billing-header from headers object', () => {
    const body = {
      model: 'gpt-5.5',
      messages: [],
      headers: {
        'x-anthropic-billing-header': 'should-be-removed',
        'x-custom-header': 'should-be-kept',
      },
    }
    const result = adapter.buildPayload({ capabilities: caps, body })
    const headers = result.headers as Record<string, unknown>
    expect(headers).not.toHaveProperty('x-anthropic-billing-header')
    expect(headers).toHaveProperty('x-custom-header')
  })
})

// ── classifyError ──────────────────────────────────────────────────────

describe('CodexRuntimeAdapter — classifyError', () => {
  it('maps 401 to invalid_api_key without leaking secrets', () => {
    const result = adapter.classifyError({ status: 401, message: 'Unauthorized' })
    expect(result.severity).toBe('fatal')
    expect(result.code).toBe('invalid_api_key')
    expect(result.reason).not.toContain('sk-')
  })

  it('maps 403 to invalid_api_key without leaking secrets', () => {
    const result = adapter.classifyError({ status: 403, message: 'Forbidden' })
    expect(result.severity).toBe('fatal')
    expect(result.code).toBe('invalid_api_key')
  })

  it('maps "unauthorized" text to invalid_api_key', () => {
    const result = adapter.classifyError(new Error('Account unauthorized'))
    expect(result.severity).toBe('fatal')
    expect(result.code).toBe('invalid_api_key')
  })

  it('maps "forbidden" text to invalid_api_key', () => {
    const result = adapter.classifyError(new Error('Access forbidden'))
    expect(result.severity).toBe('fatal')
    expect(result.code).toBe('invalid_api_key')
  })

  it('maps "invalid api key" text to invalid_api_key', () => {
    const result = adapter.classifyError(new Error('Invalid API key provided'))
    expect(result.severity).toBe('fatal')
    expect(result.code).toBe('invalid_api_key')
  })

  it('maps "api key ... invalid" pattern to invalid_api_key', () => {
    const result = adapter.classifyError(new Error('The api key is invalid'))
    expect(result.severity).toBe('fatal')
    expect(result.code).toBe('invalid_api_key')
  })

  it('maps 404 to model_not_found', () => {
    const result = adapter.classifyError({ status: 404, message: 'Not found' })
    expect(result.severity).toBe('fatal')
    expect(result.code).toBe('model_not_found')
  })

  it('maps "model not found" text to model_not_found', () => {
    const result = adapter.classifyError(new Error('Model not found: gpt-xyz'))
    expect(result.severity).toBe('fatal')
    expect(result.code).toBe('model_not_found')
  })

  it('maps "unknown model" text to model_not_found', () => {
    const result = adapter.classifyError(new Error('Unknown model requested'))
    expect(result.severity).toBe('fatal')
    expect(result.code).toBe('model_not_found')
  })

  it('maps unknown errors to warning probe_failed with stable generic reason', () => {
    const result = adapter.classifyError(new Error('Something went wrong'))
    expect(result.severity).toBe('warning')
    expect(result.code).toBe('probe_failed')
    expect(result.reason).toBe('Codex request failed before completion.')
  })

  it('does not leak plain text API key in message', () => {
    const result = adapter.classifyError(
      new Error('API key sk-codex-secret-12345 is invalid'),
    )
    expect(result.reason).not.toContain('sk-codex-secret-12345')
    // The reason should be generic, not containing the key
    expect(result.reason).toBe('Codex authentication failed.')
  })

  it('does not leak Bearer token', () => {
    const result = adapter.classifyError(
      new Error('Bearer tok-codex-abcdef123 failed'),
    )
    expect(result.reason).not.toContain('tok-codex-abcdef123')
  })

  it('does not throw on null', () => {
    expect(() => adapter.classifyError(null)).not.toThrow()
    const result = adapter.classifyError(null)
    expect(result.code).toBe('probe_failed')
  })

  it('does not throw on undefined', () => {
    expect(() => adapter.classifyError(undefined)).not.toThrow()
    const result = adapter.classifyError(undefined)
    expect(result.code).toBe('probe_failed')
  })
})

// ── Capability secrets ─────────────────────────────────────────────────

describe('CodexRuntimeAdapter — no secrets in serialized capabilities', () => {
  it('no raw apiKey/account token appears in serialized capabilities', async () => {
    const input = {
      routeId: 'codex',
      descriptor: makeDescriptor(),
      catalogEntry: undefined,
      providerInput: { ...validProviderInput },
      processEnv: {},
    }
    const caps = await adapter.resolveCapabilities(input)
    const serialized = JSON.stringify(caps)
    expect(serialized).not.toContain('sk-test-codex-key')
    expect(serialized).not.toContain('apiKey')
    expect(serialized).not.toContain('api_key')
    expect(serialized).not.toContain('bearer')
    expect(serialized).not.toContain('Bearer')
  })
})

// ── Deep immutability ──────────────────────────────────────────────────

describe('CodexRuntimeAdapter — buildPayload deep immutability', () => {
  const caps = makeCapabilities()

  it('strips billing header from returned message content without mutating original body.messages[0].content', () => {
    const originalMsg = { role: 'user', content: 'hello x-anthropic-billing-header: billing-xyz' }
    const body = {
      model: 'gpt-5.5',
      messages: [originalMsg],
    }
    const originalContent = originalMsg.content
    adapter.buildPayload({ capabilities: caps, body })
    // Original message object must be untouched
    expect(originalMsg.content).toBe(originalContent)
    expect(originalMsg.content).toContain('x-anthropic-billing-header')
  })

  it('strips billing header from returned headers without mutating original body.headers', () => {
    const originalHeaders = {
      'x-anthropic-billing-header': 'should-be-removed',
      'x-custom-header': 'should-be-kept',
    }
    const body = {
      model: 'gpt-5.5',
      messages: [],
      headers: originalHeaders,
    }
    const result = adapter.buildPayload({ capabilities: caps, body })
    // Returned headers should not have the billing header
    const resultHeaders = result.headers as Record<string, unknown>
    expect(resultHeaders).not.toHaveProperty('x-anthropic-billing-header')
    // Original headers object must still have it
    expect(originalHeaders).toHaveProperty('x-anthropic-billing-header')
    expect(originalHeaders['x-anthropic-billing-header']).toBe('should-be-removed')
  })

  it('does not reuse the original message object when message content is sanitized', () => {
    const originalMsg = { role: 'user', content: 'hello x-anthropic-billing-header: billing-xyz' }
    const body = {
      model: 'gpt-5.5',
      messages: [originalMsg],
    }
    const result = adapter.buildPayload({ capabilities: caps, body })
    const resultMsg = (result.messages as Array<Record<string, unknown>>)[0]
    // The returned message should be a different object reference
    expect(resultMsg).not.toBe(originalMsg)
  })

  it('does not reuse the original headers object when headers are sanitized', () => {
    const originalHeaders = {
      'x-anthropic-billing-header': 'should-be-removed',
      'x-custom-header': 'should-be-kept',
    }
    const body = {
      model: 'gpt-5.5',
      messages: [],
      headers: originalHeaders,
    }
    const result = adapter.buildPayload({ capabilities: caps, body })
    // The returned headers should be a different object reference
    expect(result.headers).not.toBe(originalHeaders)
  })
})

// ── Codex max/xhigh effort capability ──────────────────────────────────

describe('CodexRuntimeAdapter — codexplan max/xhigh effort', () => {
  const baseInput = {
    routeId: 'codex',
    descriptor: makeDescriptor(),
    catalogEntry: undefined,
    providerInput: { ...validProviderInput, model: 'codexplan' },
    processEnv: {},
  }

  it('codexplan effort.nativeValues contains abstract "max"', async () => {
    const caps = await adapter.resolveCapabilities(baseInput)
    const maxEntry = caps.effort.nativeValues.find((v) => v.abstract === 'max')
    expect(maxEntry).toBeDefined()
  })

  it('that max entry has native "xhigh"', async () => {
    const caps = await adapter.resolveCapabilities(baseInput)
    const maxEntry = caps.effort.nativeValues.find((v) => v.abstract === 'max')!
    expect(maxEntry.native).toBe('xhigh')
  })

  it('that max entry has allowedInAuto false', async () => {
    const caps = await adapter.resolveCapabilities(baseInput)
    const maxEntry = caps.effort.nativeValues.find((v) => v.abstract === 'max')!
    expect(maxEntry.allowedInAuto).toBe(false)
  })

  it('effort.allowAutoMax is false', async () => {
    const caps = await adapter.resolveCapabilities(baseInput)
    expect(caps.effort.allowAutoMax).toBe(false)
  })

  it('effort.maxAutoAbstractEffort is "high", not "max"', async () => {
    const caps = await adapter.resolveCapabilities(baseInput)
    expect(caps.effort.maxAutoAbstractEffort).toBe('high')
    expect(caps.effort.maxAutoAbstractEffort).not.toBe('max')
  })
})
