// PR1 — NvidiaNimRuntimeAdapter focused tests

import { describe, it, expect } from 'bun:test'
import { NvidiaNimRuntimeAdapter } from './NvidiaNimRuntimeAdapter.js'
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
    id: 'nvidia-nim',
    label: 'Nvidia NIM',
    vendor: 'nvidia',
    transportConfig: {
      kind: "openai-compatible",
      openaiShim: {},
    },
    ...overrides,
  } as unknown as RouteDescriptor
}

function makeCapabilities(
  overrides: Partial<RuntimeModelCapabilities> = {},
): RuntimeModelCapabilities {
  return {
    routeId: 'nvidia-nim',
    providerId: 'nvidia-nim',
    providerLabel: 'Nvidia NIM',
    model: {
      requested: 'meta/llama-3.1-8b-instruct',
      resolvedApiName: 'meta/llama-3.1-8b-instruct',
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
      supported: false,
      adaptiveSupported: false,
      mode: 'none',
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
      maxTokensField: 'max_tokens',
    },
    limits: {},
    confidence: 'manual',
    ...overrides,
  }
}

const adapter = new NvidiaNimRuntimeAdapter()

// ── Identity ───────────────────────────────────────────────────────────

describe('NvidiaNimRuntimeAdapter — identity', () => {
  it('id is "nvidia-nim"', () => {
    expect(adapter.id).toBe('nvidia-nim')
  })

  it('label is stable', () => {
    expect(adapter.label).toBe('Nvidia NIM')
  })
})

// ── supportsRoute ──────────────────────────────────────────────────────

describe('NvidiaNimRuntimeAdapter — supportsRoute', () => {
  const desc = makeDescriptor()

  it('returns true for routeId "nvidia-nim"', () => {
    expect(adapter.supportsRoute('nvidia-nim', desc)).toBe(true)
  })

  it('returns true when descriptor.id is "nvidia-nim"', () => {
    expect(adapter.supportsRoute('other-id', makeDescriptor({ id: 'nvidia-nim' }))).toBe(true)
  })

  it('returns false for "openrouter"', () => {
    expect(adapter.supportsRoute('openrouter', makeDescriptor({ id: 'openrouter' }))).toBe(false)
  })

  it('returns false for "gemini"', () => {
    expect(adapter.supportsRoute('gemini', makeDescriptor({ id: 'gemini' }))).toBe(false)
  })

  it('returns false for "codex"', () => {
    expect(adapter.supportsRoute('codex', makeDescriptor({ id: 'codex' }))).toBe(false)
  })

  it('returns false for "openai"', () => {
    expect(adapter.supportsRoute('openai', makeDescriptor({ id: 'openai' }))).toBe(false)
  })

  it('returns false for arbitrary custom provider', () => {
    expect(adapter.supportsRoute('custom-xyz', makeDescriptor({ id: 'custom-xyz' }))).toBe(false)
  })
})

// ── validateSetup ──────────────────────────────────────────────────────

describe('NvidiaNimRuntimeAdapter — validateSetup', () => {
  const baseInput = {
    routeId: 'nvidia-nim',
    descriptor: makeDescriptor(),
    catalogEntry: undefined,
    providerInput: {
      apiKey: 'nvapi-test-key',
      baseUrl: 'https://integrate.api.nvidia.com',
      model: 'meta/llama-3.1-8b-instruct',
    },
    processEnv: {},
  }

  it('returns fatal missing_required_auth when apiKey is whitespace-only', async () => {
    const result = await adapter.validateSetup({
      ...baseInput,
      providerInput: { ...baseInput.providerInput, apiKey: '   ' },
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.severity).toBe('fatal')
      expect(result.code).toBe('missing_required_auth')
    }
  })

  it('returns fatal invalid_base_url when baseUrl is whitespace-only', async () => {
    const result = await adapter.validateSetup({
      ...baseInput,
      providerInput: { ...baseInput.providerInput, baseUrl: '   ' },
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.severity).toBe('fatal')
      expect(result.code).toBe('invalid_base_url')
    }
  })

  it('returns fatal model_not_found when model is whitespace-only', async () => {
    const result = await adapter.validateSetup({
      ...baseInput,
      providerInput: { ...baseInput.providerInput, model: '   ' },
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.severity).toBe('fatal')
      expect(result.code).toBe('model_not_found')
    }
  })

  it('returns ok:true with capabilities when required fields exist', async () => {
    const result = await adapter.validateSetup(baseInput)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.capabilities.providerId).toBe('nvidia-nim')
      expect(result.capabilities.model.requested).toBe('meta/llama-3.1-8b-instruct')
    }
  })
})

// ── verifyStartup ──────────────────────────────────────────────────────

describe('NvidiaNimRuntimeAdapter — verifyStartup', () => {
  const baseInput = {
    routeId: 'nvidia-nim',
    descriptor: makeDescriptor(),
    catalogEntry: undefined,
    providerInput: {
      apiKey: 'nvapi-test-key',
      baseUrl: 'https://integrate.api.nvidia.com',
      model: 'meta/llama-3.1-8b-instruct',
    },
    processEnv: {},
  }

  it('returns ok:true with capabilities without network', async () => {
    const result = await adapter.verifyStartup(baseInput)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.capabilities?.providerId).toBe('nvidia-nim')
    }
  })

  it('uses cachedCapabilities when present and matching providerId', async () => {
    const cached = makeCapabilities({ routeId: 'nvidia-nim' })
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
    const cached = makeCapabilities({ providerId: 'openrouter', routeId: 'nvidia-nim' })
    const result = await adapter.verifyStartup({
      ...baseInput,
      cachedCapabilities: cached,
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.capabilities?.providerId).toBe('nvidia-nim')
      expect(result.capabilities).not.toBe(cached)
    }
  })
})

// ── resolveCapabilities ────────────────────────────────────────────────

describe('NvidiaNimRuntimeAdapter — resolveCapabilities', () => {
  const baseInput = {
    routeId: 'nvidia-nim',
    descriptor: makeDescriptor(),
    catalogEntry: undefined,
    providerInput: {
      apiKey: 'nvapi-test-key',
      baseUrl: 'https://integrate.api.nvidia.com',
      model: 'meta/llama-3.1-8b-instruct',
    },
    processEnv: {},
  }

  it('preserves explicit providerInput.model', async () => {
    const caps = await adapter.resolveCapabilities(baseInput)
    expect(caps.model.requested).toBe('meta/llama-3.1-8b-instruct')
    expect(caps.model.resolvedApiName).toBe('meta/llama-3.1-8b-instruct')
  })

  it('does not mutate input', async () => {
    const input = {
      ...baseInput,
      providerInput: { ...baseInput.providerInput },
    }
    const before = { ...input.providerInput }
    await adapter.resolveCapabilities(input)
    expect(input.providerInput).toEqual(before)
  })

  it('uses chat_completions endpoint', async () => {
    const caps = await adapter.resolveCapabilities(baseInput)
    expect(caps.payload.endpoint).toBe('chat_completions')
  })

  it('uses openai tool format', async () => {
    const caps = await adapter.resolveCapabilities(baseInput)
    expect(caps.tools.format).toBe('openai')
  })

  it('keeps effort unsupported', async () => {
    const caps = await adapter.resolveCapabilities(baseInput)
    expect(caps.effort.supported).toBe(false)
    expect(caps.effort.mode).toBe('none')
    expect(caps.effort.nativeValues).toEqual([])
    expect(caps.effort.defaultAbstractEffort).toBe('none')
  })

  it('sets thinking.mode to provider_specific only when catalog says supportsReasoning', async () => {
    // Without supportsReasoning
    const capsNoReasoning = await adapter.resolveCapabilities(baseInput)
    expect(capsNoReasoning.thinking.supported).toBe(false)
    expect(capsNoReasoning.thinking.mode).toBe('none')

    // With supportsReasoning
    const catalogEntry = {
      contextWindow: 131072,
      maxOutputTokens: 4096,
      capabilities: { supportsReasoning: true },
    } as any // eslint-disable-line @typescript-eslint/no-explicit-any — catalogEntry is a partial for test purposes
    const capsWithReasoning = await adapter.resolveCapabilities({
      ...baseInput,
      catalogEntry,
    })
    expect(capsWithReasoning.thinking.supported).toBe(true)
    expect(capsWithReasoning.thinking.mode).toBe('provider_specific')
  })

  it('uses descriptor maxTokensField when provided', async () => {
    const desc = makeDescriptor({
      transportConfig: {
        kind: 'openai-compatible',
        openaiShim: { maxTokensField: 'max_completion_tokens' },
      },
    })
    const caps = await adapter.resolveCapabilities({
      ...baseInput,
      descriptor: desc,
    })
    expect(caps.payload.maxTokensField).toBe('max_completion_tokens')
  })

  it('defaults maxTokensField to "max_tokens" when descriptor does not specify', async () => {
    const caps = await adapter.resolveCapabilities(baseInput)
    expect(caps.payload.maxTokensField).toBe('max_tokens')
  })

  it('sets supportsUserCustomHeaders true when descriptor openaiShim supportsAuthHeaders is true', async () => {
    const desc = makeDescriptor({
      transportConfig: {
        kind: 'openai-compatible',
        openaiShim: { supportsAuthHeaders: true },
      },
    })
    const caps = await adapter.resolveCapabilities({
      ...baseInput,
      descriptor: desc,
    })
    expect(caps.payload.supportsUserCustomHeaders).toBe(true)
  })

  it('sets supportsUserCustomHeaders false when descriptor openaiShim supportsAuthHeaders is not true', async () => {
    const caps = await adapter.resolveCapabilities(baseInput)
    expect(caps.payload.supportsUserCustomHeaders).toBe(false)
  })

  it('sets confidence to "manual"', async () => {
    const caps = await adapter.resolveCapabilities(baseInput)
    expect(caps.confidence).toBe('manual')
  })

  it('sets limits from catalogEntry when present', async () => {
    const catalogEntry = {
      contextWindow: 131072,
      maxOutputTokens: 4096,
      capabilities: {},
    } as any // eslint-disable-line @typescript-eslint/no-explicit-any
    const caps = await adapter.resolveCapabilities({
      ...baseInput,
      catalogEntry,
    })
    expect(caps.limits.contextWindow).toBe(131072)
    expect(caps.limits.maxOutputTokens).toBe(4096)
  })

  it('uses descriptor label as providerLabel when present', async () => {
    const desc = makeDescriptor({ label: 'NIM API' })
    const caps = await adapter.resolveCapabilities({
      ...baseInput,
      descriptor: desc,
    })
    expect(caps.providerLabel).toBe('NIM API')
  })

  it('falls back to adapter label when descriptor has no label', async () => {
    const desc = makeDescriptor()
    const caps = await adapter.resolveCapabilities({
      ...baseInput,
      descriptor: desc,
    })
    expect(caps.providerLabel).toBe('Nvidia NIM')
  })

  it('sets model source to "manual"', async () => {
    const caps = await adapter.resolveCapabilities(baseInput)
    expect(caps.model.source).toBe('manual')
  })

  it('sets availability.verifiedBy to "manual"', async () => {
    const caps = await adapter.resolveCapabilities(baseInput)
    expect(caps.availability.verifiedBy).toBe('manual')
  })
})

// ── buildPayload ───────────────────────────────────────────────────────

describe('NvidiaNimRuntimeAdapter — buildPayload', () => {
  const caps = makeCapabilities()

  it('does not mutate original body', () => {
    const original = { messages: [{ role: 'user', content: 'hi' }], max_tokens: 512 }
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
    expect(result.model).toBe('meta/llama-3.1-8b-instruct')
  })

  it('sets model when body.model is empty string', () => {
    const body = { model: '', messages: [] }
    const result = adapter.buildPayload({ capabilities: caps, body })
    expect(result.model).toBe('meta/llama-3.1-8b-instruct')
  })

  it('applies maxTokensField mapping', () => {
    const capsWithField = makeCapabilities({
      payload: {
        endpoint: 'chat_completions',
        maxTokensField: 'max_completion_tokens',
      },
    })
    const body = { messages: [], max_tokens: 1024 }
    const result = adapter.buildPayload({ capabilities: capsWithField, body })
    // applyQuirkPolicy should map max_tokens -> max_completion_tokens
    expect(result).toHaveProperty('max_completion_tokens')
  })

  it('does not inject apiKey', () => {
    const body = { messages: [] }
    const result = adapter.buildPayload({ capabilities: caps, body })
    expect(result).not.toHaveProperty('apiKey')
    expect(result).not.toHaveProperty('api_key')
  })

  it('does not inject Authorization headers', () => {
    const body = { messages: [] }
    const result = adapter.buildPayload({ capabilities: caps, body })
    expect(result).not.toHaveProperty('Authorization')
    expect(result).not.toHaveProperty('authorization')
    expect(result).not.toHaveProperty('headers')
  })
})

// ── classifyError ──────────────────────────────────────────────────────

describe('NvidiaNimRuntimeAdapter — classifyError', () => {
  it('maps 401 to invalid_api_key', () => {
    const result = adapter.classifyError({ status: 401, message: 'Unauthorized' })
    expect(result.severity).toBe('fatal')
    expect(result.code).toBe('invalid_api_key')
  })

  it('maps 403 to invalid_api_key', () => {
    const result = adapter.classifyError({ status: 403, message: 'Forbidden' })
    expect(result.severity).toBe('fatal')
    expect(result.code).toBe('invalid_api_key')
  })

  it('maps "unauthorized" text to invalid_api_key', () => {
    const result = adapter.classifyError('Unauthorized access')
    expect(result.severity).toBe('fatal')
    expect(result.code).toBe('invalid_api_key')
  })

  it('maps "forbidden" text to invalid_api_key', () => {
    const result = adapter.classifyError('Request was forbidden')
    expect(result.severity).toBe('fatal')
    expect(result.code).toBe('invalid_api_key')
  })

  it('maps 404 to model_not_found', () => {
    const result = adapter.classifyError({ status: 404, message: 'Not Found' })
    expect(result.severity).toBe('fatal')
    expect(result.code).toBe('model_not_found')
  })

  it('maps "model not found" text to model_not_found', () => {
    const result = adapter.classifyError('model not found: llama-3')
    expect(result.severity).toBe('fatal')
    expect(result.code).toBe('model_not_found')
  })

  it('maps "unknown model" text to model_not_found', () => {
    const result = adapter.classifyError('unknown model specified')
    expect(result.severity).toBe('fatal')
    expect(result.code).toBe('model_not_found')
  })

  it('maps unknown errors to warning probe_failed', () => {
    const result = adapter.classifyError('Something went wrong')
    expect(result.severity).toBe('warning')
    expect(result.code).toBe('probe_failed')
  })

  it('does not leak apiKey in error classification', () => {
    const result = adapter.classifyError('api_key=nvapi-secret-12345 is invalid')
    const serialized = JSON.stringify(result)
    expect(serialized).not.toContain('nvapi-secret-12345')
  })

  it('does not leak Bearer token in error classification', () => {
    const result = adapter.classifyError('Bearer nvapi-secret-98765 rejected')
    const serialized = JSON.stringify(result)
    expect(serialized).not.toContain('nvapi-secret-98765')
  })

  it('does not leak plain text key in message like "API key nvapi-secret-12345 is invalid"', () => {
    const result = adapter.classifyError(new Error('API key nvapi-secret-12345 is invalid'))
    const serialized = JSON.stringify(result)
    expect(serialized).not.toContain('nvapi-secret-12345')
    expect(result.code).toBe('invalid_api_key')
  })

  it('generic fallback returns probe_failed with stable generic reason', () => {
    const result = adapter.classifyError(new Error('Unknown error from provider'))
    expect(result.code).toBe('probe_failed')
    expect(result.reason).toBe('Nvidia NIM request failed before completion.')
  })

  it('does not throw on null/undefined error', () => {
    expect(() => adapter.classifyError(null)).not.toThrow()
    expect(() => adapter.classifyError(undefined)).not.toThrow()
  })
})

// ── No raw apiKey in serialized test outputs ───────────────────────────

describe('NvidiaNimRuntimeAdapter — no apiKey leakage', () => {
  it('capabilities does not contain raw apiKey', async () => {
    const baseInput = {
      routeId: 'nvidia-nim',
      descriptor: makeDescriptor(),
      catalogEntry: undefined,
      providerInput: {
        apiKey: 'nvapi-super-secret-99999',
        baseUrl: 'https://integrate.api.nvidia.com',
        model: 'meta/llama-3.1-8b-instruct',
      },
      processEnv: {},
    }
    const caps = await adapter.resolveCapabilities(baseInput)
    const serialized = JSON.stringify(caps)
    expect(serialized).not.toContain('nvapi-super-secret-99999')
  })
})
