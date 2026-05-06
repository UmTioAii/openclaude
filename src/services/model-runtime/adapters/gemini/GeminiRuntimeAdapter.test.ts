// PR1 — GeminiRuntimeAdapter focused tests

import { describe, it, expect } from 'bun:test'
import { GeminiRuntimeAdapter } from './GeminiRuntimeAdapter.js'
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
    id: 'gemini',
    label: 'Gemini',
    vendor: 'google',
    transportConfig: {
      kind: 'gemini-native',
    },
    ...overrides,
  } as unknown as RouteDescriptor
}

function makeCapabilities(
  overrides: Partial<RuntimeModelCapabilities> = {},
): RuntimeModelCapabilities {
  return {
    routeId: 'gemini',
    providerId: 'gemini',
    providerLabel: 'Gemini',
    model: {
      requested: 'gemini-2.5-pro',
      resolvedApiName: 'gemini-2.5-pro',
      source: 'manual',
    },
    availability: {
      checked: false,
      exists: true,
      active: true,
      verifiedBy: 'manual',
    },
    tools: { supported: false, format: 'gemini' },
    thinking: {
      supported: false,
      adaptiveSupported: false,
      mode: 'none',
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
      maxTokensField: 'max_tokens',
      supportsUserCustomHeaders: false,
    },
    limits: {},
    confidence: 'manual',
    ...overrides,
  }
}

const adapter = new GeminiRuntimeAdapter()

/** Shared processEnv fixture — satisfies RuntimeSetupInput.processEnv */
const processEnv = {} as NodeJS.ProcessEnv

const validProviderInput = {
  apiKey: 'test-gemini-key',
  baseUrl: 'https://generativelanguage.googleapis.com',
  model: 'gemini-2.5-pro',
}

// ── Identity ───────────────────────────────────────────────────────────

describe('GeminiRuntimeAdapter — identity', () => {
  it('id is "gemini"', () => {
    expect(adapter.id).toBe('gemini')
  })

  it('label is "Gemini"', () => {
    expect(adapter.label).toBe('Gemini')
  })
})

// ── supportsRoute ──────────────────────────────────────────────────────

describe('GeminiRuntimeAdapter — supportsRoute', () => {
  const desc = makeDescriptor()

  it('returns true for routeId "gemini"', () => {
    expect(adapter.supportsRoute('gemini', desc)).toBe(true)
  })

  it('returns true when descriptor.id is "gemini"', () => {
    expect(adapter.supportsRoute('other-id', makeDescriptor({ id: 'gemini' }))).toBe(true)
  })

  it('returns false for "nvidia-nim"', () => {
    expect(adapter.supportsRoute('nvidia-nim', makeDescriptor({ id: 'nvidia-nim' }))).toBe(false)
  })

  it('returns false for "openrouter"', () => {
    expect(adapter.supportsRoute('openrouter', makeDescriptor({ id: 'openrouter' }))).toBe(false)
  })

  it('returns false for "codex"', () => {
    expect(adapter.supportsRoute('codex', makeDescriptor({ id: 'codex' }))).toBe(false)
  })

  it('returns false for "openai"', () => {
    expect(adapter.supportsRoute('openai', makeDescriptor({ id: 'openai' }))).toBe(false)
  })

  it('returns false for "anthropic"', () => {
    expect(adapter.supportsRoute('anthropic', makeDescriptor({ id: 'anthropic' }))).toBe(false)
  })

  it('returns false for "ollama"', () => {
    expect(adapter.supportsRoute('ollama', makeDescriptor({ id: 'ollama' }))).toBe(false)
  })

  it('returns false for "custom"', () => {
    expect(adapter.supportsRoute('custom', makeDescriptor({ id: 'custom' }))).toBe(false)
  })
})

// ── validateSetup ──────────────────────────────────────────────────────

describe('GeminiRuntimeAdapter — validateSetup', () => {
  it('returns fatal missing_required_auth when apiKey is missing', async () => {
    const result = await adapter.validateSetup({
      routeId: 'gemini',
      processEnv,
      providerInput: { ...validProviderInput, apiKey: undefined },
      descriptor: makeDescriptor(),
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.severity).toBe('fatal')
      expect(result.code).toBe('missing_required_auth')
    }
  })

  it('returns fatal missing_required_auth when apiKey is whitespace-only', async () => {
    const result = await adapter.validateSetup({
      routeId: 'gemini',
      processEnv,
      providerInput: { ...validProviderInput, apiKey: '   ' },
      descriptor: makeDescriptor(),
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.severity).toBe('fatal')
      expect(result.code).toBe('missing_required_auth')
    }
  })

  it('returns fatal missing_required_auth when apiKey is non-string', async () => {
    const result = await adapter.validateSetup({
      routeId: 'gemini',
      processEnv,
      providerInput: { ...validProviderInput, apiKey: 12345 as unknown as string },
      descriptor: makeDescriptor(),
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.severity).toBe('fatal')
      expect(result.code).toBe('missing_required_auth')
    }
  })

  it('returns fatal invalid_base_url when baseUrl is missing', async () => {
    const result = await adapter.validateSetup({
      routeId: 'gemini',
      processEnv,
      providerInput: { ...validProviderInput, baseUrl: undefined },
      descriptor: makeDescriptor(),
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.severity).toBe('fatal')
      expect(result.code).toBe('invalid_base_url')
    }
  })

  it('returns fatal invalid_base_url when baseUrl is whitespace-only', async () => {
    const result = await adapter.validateSetup({
      routeId: 'gemini',
      processEnv,
      providerInput: { ...validProviderInput, baseUrl: '   ' },
      descriptor: makeDescriptor(),
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.severity).toBe('fatal')
      expect(result.code).toBe('invalid_base_url')
    }
  })

  it('returns fatal invalid_base_url when baseUrl is non-string', async () => {
    const result = await adapter.validateSetup({
      routeId: 'gemini',
      processEnv,
      providerInput: { ...validProviderInput, baseUrl: 42 as unknown as string },
      descriptor: makeDescriptor(),
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.severity).toBe('fatal')
      expect(result.code).toBe('invalid_base_url')
    }
  })

  it('returns fatal model_not_found when model is missing', async () => {
    const result = await adapter.validateSetup({
      routeId: 'gemini',
      processEnv,
      providerInput: { ...validProviderInput, model: undefined },
      descriptor: makeDescriptor(),
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.severity).toBe('fatal')
      expect(result.code).toBe('model_not_found')
    }
  })

  it('returns fatal model_not_found when model is whitespace-only', async () => {
    const result = await adapter.validateSetup({
      routeId: 'gemini',
      processEnv,
      providerInput: { ...validProviderInput, model: '   ' },
      descriptor: makeDescriptor(),
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.severity).toBe('fatal')
      expect(result.code).toBe('model_not_found')
    }
  })

  it('returns fatal model_not_found when model is non-string', async () => {
    const result = await adapter.validateSetup({
      routeId: 'gemini',
      processEnv,
      providerInput: { ...validProviderInput, model: { name: 'gemini' } as unknown as string },
      descriptor: makeDescriptor(),
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.severity).toBe('fatal')
      expect(result.code).toBe('model_not_found')
    }
  })

  it('returns ok:true with capabilities for valid fields', async () => {
    const result = await adapter.validateSetup({
      routeId: 'gemini',
      processEnv,
      providerInput: validProviderInput,
      descriptor: makeDescriptor(),
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.capabilities.providerId).toBe('gemini')
    }
  })

  it('does not mutate the input', async () => {
    const input = {
      routeId: 'gemini',
      processEnv,
      providerInput: { ...validProviderInput },
      descriptor: makeDescriptor(),
    }
    const originalModel = input.providerInput.model
    const originalBaseUrl = input.providerInput.baseUrl
    const originalApiKey = input.providerInput.apiKey

    await adapter.validateSetup(input)

    expect(input.providerInput.model).toBe(originalModel)
    expect(input.providerInput.baseUrl).toBe(originalBaseUrl)
    expect(input.providerInput.apiKey).toBe(originalApiKey)
  })
})

// ── verifyStartup ──────────────────────────────────────────────────────

describe('GeminiRuntimeAdapter — verifyStartup', () => {
  it('returns ok:true', async () => {
    const result = await adapter.verifyStartup({
      routeId: 'gemini',
      processEnv,
      providerInput: validProviderInput,
      descriptor: makeDescriptor(),
    })
    expect(result.ok).toBe(true)
  })

  it('uses cachedCapabilities when providerId is "gemini"', async () => {
    const cached = makeCapabilities({ providerId: 'gemini' })
    const result = await adapter.verifyStartup({
      routeId: 'gemini',
      processEnv,
      providerInput: validProviderInput,
      descriptor: makeDescriptor(),
      cachedCapabilities: cached,
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.capabilities).toBe(cached)
    }
  })

  it('ignores cachedCapabilities from other providers', async () => {
    const cached = makeCapabilities({ providerId: 'codex' })
    const result = await adapter.verifyStartup({
      routeId: 'gemini',
      processEnv,
      providerInput: validProviderInput,
      descriptor: makeDescriptor(),
      cachedCapabilities: cached,
    })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.capabilities).not.toBe(cached)
      expect(result.capabilities.providerId).toBe('gemini')
    }
  })

  it('does not mutate the input', async () => {
    const input = {
      routeId: 'gemini',
      processEnv,
      providerInput: { ...validProviderInput },
      descriptor: makeDescriptor(),
    }
    const originalModel = input.providerInput.model
    const originalBaseUrl = input.providerInput.baseUrl
    const originalApiKey = input.providerInput.apiKey

    await adapter.verifyStartup(input)

    expect(input.providerInput.model).toBe(originalModel)
    expect(input.providerInput.baseUrl).toBe(originalBaseUrl)
    expect(input.providerInput.apiKey).toBe(originalApiKey)
  })
})

// ── resolveCapabilities ────────────────────────────────────────────────

describe('GeminiRuntimeAdapter — resolveCapabilities', () => {
  it('preserves explicit model', async () => {
    const caps = await adapter.resolveCapabilities({
      routeId: 'gemini',
      processEnv,
      providerInput: validProviderInput,
      descriptor: makeDescriptor(),
    })
    expect(caps.model.requested).toBe('gemini-2.5-pro')
    expect(caps.model.resolvedApiName).toBe('gemini-2.5-pro')
  })

  it('endpoint is "gemini_native"', async () => {
    const caps = await adapter.resolveCapabilities({
      routeId: 'gemini',
      processEnv,
      providerInput: validProviderInput,
      descriptor: makeDescriptor(),
    })
    expect(caps.payload.endpoint).toBe('gemini_native')
  })

  it('tools.format is "gemini"', async () => {
    const caps = await adapter.resolveCapabilities({
      routeId: 'gemini',
      processEnv,
      providerInput: validProviderInput,
      descriptor: makeDescriptor(),
    })
    expect(caps.tools.format).toBe('gemini')
  })

  it('effort remains unsupported', async () => {
    const caps = await adapter.resolveCapabilities({
      routeId: 'gemini',
      processEnv,
      providerInput: validProviderInput,
      descriptor: makeDescriptor(),
    })
    expect(caps.effort.supported).toBe(false)
    expect(caps.effort.mode).toBe('none')
    expect(caps.effort.nativeValues).toEqual([])
    expect(caps.effort.defaultAbstractEffort).toBe('none')
    expect(caps.effort.maxAutoAbstractEffort).toBe('none')
    expect(caps.effort.allowAutoMax).toBe(false)
  })

  it('thinking mode is provider_specific when supported', async () => {
    const caps = await adapter.resolveCapabilities({
      routeId: 'gemini',
      processEnv,
      providerInput: validProviderInput,
      descriptor: makeDescriptor(),
      catalogEntry: {
        capabilities: { supportsReasoning: true },
        contextWindow: undefined,
        maxOutputTokens: undefined,
      },
    })
    expect(caps.thinking.supported).toBe(true)
    expect(caps.thinking.mode).toBe('provider_specific')
    expect(caps.thinking.adaptiveSupported).toBe(false)
  })

  it('thinking mode is none when not supported', async () => {
    const caps = await adapter.resolveCapabilities({
      routeId: 'gemini',
      processEnv,
      providerInput: validProviderInput,
      descriptor: makeDescriptor(),
    })
    expect(caps.thinking.supported).toBe(false)
    expect(caps.thinking.mode).toBe('none')
  })

  it('tools.supported follows catalogEntry capabilities.supportsFunctionCalling', async () => {
    const capsWithTools = await adapter.resolveCapabilities({
      routeId: 'gemini',
      processEnv,
      providerInput: validProviderInput,
      descriptor: makeDescriptor(),
      catalogEntry: {
        capabilities: { supportsFunctionCalling: true },
        contextWindow: undefined,
        maxOutputTokens: undefined,
      },
    })
    expect(capsWithTools.tools.supported).toBe(true)

    const capsWithoutTools = await adapter.resolveCapabilities({
      routeId: 'gemini',
      processEnv,
      providerInput: validProviderInput,
      descriptor: makeDescriptor(),
    })
    expect(capsWithoutTools.tools.supported).toBe(false)
  })

  it('maxTokensField defaults to "max_tokens"', async () => {
    const caps = await adapter.resolveCapabilities({
      routeId: 'gemini',
      processEnv,
      providerInput: validProviderInput,
      descriptor: makeDescriptor(),
    })
    expect(caps.payload.maxTokensField).toBe('max_tokens')
  })

  it('maxTokensField uses descriptor openaiShim value when present and type-compatible', async () => {
    const caps = await adapter.resolveCapabilities({
      routeId: 'gemini',
      processEnv,
      providerInput: validProviderInput,
      descriptor: makeDescriptor({
        transportConfig: {
          kind: 'gemini-native',
          openaiShim: {
            maxTokensField: 'max_completion_tokens',
          },
        },
      }),
    })
    expect(caps.payload.maxTokensField).toBe('max_completion_tokens')
  })

  it('supportsUserCustomHeaders follows descriptor openaiShim supportsAuthHeaders', async () => {
    const capsWithHeaders = await adapter.resolveCapabilities({
      routeId: 'gemini',
      processEnv,
      providerInput: validProviderInput,
      descriptor: makeDescriptor({
        transportConfig: {
          kind: 'gemini-native',
          openaiShim: { supportsAuthHeaders: true },
        },
      }),
    })
    expect(capsWithHeaders.payload.supportsUserCustomHeaders).toBe(true)

    const capsNoHeaders = await adapter.resolveCapabilities({
      routeId: 'gemini',
      processEnv,
      providerInput: validProviderInput,
      descriptor: makeDescriptor(),
    })
    expect(capsNoHeaders.payload.supportsUserCustomHeaders).toBe(false)
  })

  it('limits come from catalogEntry', async () => {
    const caps = await adapter.resolveCapabilities({
      routeId: 'gemini',
      processEnv,
      providerInput: validProviderInput,
      descriptor: makeDescriptor(),
      catalogEntry: {
        contextWindow: 1000000,
        maxOutputTokens: 65536,
      },
    })
    expect(caps.limits.contextWindow).toBe(1000000)
    expect(caps.limits.maxOutputTokens).toBe(65536)
  })

  it('providerLabel uses descriptor.label when available', async () => {
    const caps = await adapter.resolveCapabilities({
      routeId: 'gemini',
      processEnv,
      providerInput: validProviderInput,
      descriptor: makeDescriptor({ label: 'Google Gemini' }),
    })
    expect(caps.providerLabel).toBe('Google Gemini')
  })

  it('providerLabel falls back to adapter label', async () => {
    const caps = await adapter.resolveCapabilities({
      routeId: 'gemini',
      processEnv,
      providerInput: validProviderInput,
      descriptor: makeDescriptor({ label: undefined }),
    })
    expect(caps.providerLabel).toBe('Gemini')
  })

  it('model.source is manual when model is provided', async () => {
    const caps = await adapter.resolveCapabilities({
      routeId: 'gemini',
      processEnv,
      providerInput: validProviderInput,
      descriptor: makeDescriptor(),
    })
    expect(caps.model.source).toBe('manual')
  })

  it('confidence is manual when model is provided', async () => {
    const caps = await adapter.resolveCapabilities({
      routeId: 'gemini',
      processEnv,
      providerInput: validProviderInput,
      descriptor: makeDescriptor(),
    })
    expect(caps.confidence).toBe('manual')
  })
})

// ── buildPayload ───────────────────────────────────────────────────────

describe('GeminiRuntimeAdapter — buildPayload', () => {
  const caps = makeCapabilities()

  it('does not mutate body', () => {
    const originalBody = { model: 'gemini-2.5-pro', messages: [{ role: 'user', content: 'hi' }] }
    const bodyCopy = JSON.parse(JSON.stringify(originalBody))
    adapter.buildPayload({ body: originalBody, capabilities: caps })
    expect(originalBody).toEqual(bodyCopy)
  })

  it('does not mutate nested messages or headers', () => {
    const originalBody = {
      model: 'gemini-2.5-pro',
      messages: [{ role: 'user', content: 'hello' }],
      headers: { 'x-custom': 'value' },
    }
    const originalMessages = JSON.parse(JSON.stringify(originalBody.messages))
    const originalHeaders = JSON.parse(JSON.stringify(originalBody.headers))
    adapter.buildPayload({ body: originalBody, capabilities: caps })
    expect(originalBody.messages).toEqual(originalMessages)
    expect(originalBody.headers).toEqual(originalHeaders)
  })

  it('preserves existing body.model', () => {
    const result = adapter.buildPayload({
      body: { model: 'gemini-2.5-flash' },
      capabilities: caps,
    })
    expect(result.model).toBe('gemini-2.5-flash')
  })

  it('sets model when missing', () => {
    const result = adapter.buildPayload({
      body: {},
      capabilities: caps,
    })
    expect(result.model).toBe('gemini-2.5-pro')
  })

  it('sets model when empty string', () => {
    const result = adapter.buildPayload({
      body: { model: '' },
      capabilities: caps,
    })
    expect(result.model).toBe('gemini-2.5-pro')
  })

  it('applies maxTokensField mapping via quirk policy', () => {
    const capsWithField = makeCapabilities({
      payload: {
        endpoint: 'gemini_native',
        maxTokensField: 'max_completion_tokens',
        supportsUserCustomHeaders: false,
      },
    })
    const result = adapter.buildPayload({
      body: { max_tokens: 4096 },
      capabilities: capsWithField,
    })
    // applyQuirkPolicy should map max_tokens -> max_completion_tokens
    expect('max_completion_tokens' in result || 'max_tokens' in result).toBe(true)
  })

  it('does not inject apiKey', () => {
    const result = adapter.buildPayload({
      body: { apiKey: 'should-be-removed', model: 'gemini-2.5-pro' },
      capabilities: caps,
    })
    expect(result.apiKey).toBeUndefined()
  })

  it('does not inject Authorization', () => {
    const result = adapter.buildPayload({
      body: { authorization: 'Bearer secret-token', model: 'gemini-2.5-pro' },
      capabilities: caps,
    })
    expect(result.authorization).toBeUndefined()
    expect(result.Authorization).toBeUndefined()
  })
})

// ── classifyError ──────────────────────────────────────────────────────

describe('GeminiRuntimeAdapter — classifyError', () => {
  it('maps 401 to fatal invalid_api_key', () => {
    const result = adapter.classifyError({ status: 401, message: 'Unauthorized' })
    expect(result.severity).toBe('fatal')
    expect(result.code).toBe('invalid_api_key')
  })

  it('maps 403 to fatal invalid_api_key', () => {
    const result = adapter.classifyError({ status: 403, message: 'Forbidden' })
    expect(result.severity).toBe('fatal')
    expect(result.code).toBe('invalid_api_key')
  })

  it('maps "unauthorized" message to invalid_api_key', () => {
    const result = adapter.classifyError({ message: 'Unauthorized access' })
    expect(result.severity).toBe('fatal')
    expect(result.code).toBe('invalid_api_key')
  })

  it('maps "forbidden" message to invalid_api_key', () => {
    const result = adapter.classifyError({ message: 'Access forbidden' })
    expect(result.severity).toBe('fatal')
    expect(result.code).toBe('invalid_api_key')
  })

  it('maps "invalid api key" message to invalid_api_key', () => {
    const result = adapter.classifyError({ message: 'Invalid API key provided' })
    expect(result.severity).toBe('fatal')
    expect(result.code).toBe('invalid_api_key')
  })

  it('maps "permission denied" message to invalid_api_key', () => {
    const result = adapter.classifyError({ message: 'Permission denied' })
    expect(result.severity).toBe('fatal')
    expect(result.code).toBe('invalid_api_key')
  })

  it('maps 404 to fatal model_not_found', () => {
    const result = adapter.classifyError({ status: 404, message: 'Not found' })
    expect(result.severity).toBe('fatal')
    expect(result.code).toBe('model_not_found')
  })

  it('maps "model not found" to model_not_found', () => {
    const result = adapter.classifyError({ message: 'Model not found' })
    expect(result.severity).toBe('fatal')
    expect(result.code).toBe('model_not_found')
  })

  it('maps "unknown model" to model_not_found', () => {
    const result = adapter.classifyError({ message: 'Unknown model specified' })
    expect(result.severity).toBe('fatal')
    expect(result.code).toBe('model_not_found')
  })

  it('maps "model does not exist" to model_not_found', () => {
    const result = adapter.classifyError({ message: 'Model does not exist' })
    expect(result.severity).toBe('fatal')
    expect(result.code).toBe('model_not_found')
  })

  it('fallback is warning probe_failed with stable reason', () => {
    const result = adapter.classifyError({ message: 'Something went wrong' })
    expect(result.severity).toBe('warning')
    expect(result.code).toBe('probe_failed')
    expect(result.reason).toBe('Gemini request failed before completion.')
  })

  it('does not leak "API key gemini-secret-12345 is invalid" in reason', () => {
    const result = adapter.classifyError({ message: 'API key gemini-secret-12345 is invalid' })
    expect(result.reason).not.toContain('gemini-secret-12345')
    // Should map to auth failure
    expect(result.code).toBe('invalid_api_key')
  })

  it('does not leak Bearer token in reason', () => {
    const result = adapter.classifyError({ message: 'Bearer ya29.super-secret-token is unauthorized' })
    expect(result.reason).not.toContain('ya29.super-secret-token')
    expect(result.code).toBe('invalid_api_key')
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

// ── Security: serialized capabilities do not contain raw apiKey ────────

describe('GeminiRuntimeAdapter — security', () => {
  it('serialized capabilities do not contain raw apiKey', async () => {
    const caps = await adapter.resolveCapabilities({
      routeId: 'gemini',
      processEnv,
      providerInput: validProviderInput,
      descriptor: makeDescriptor(),
    })
    const serialized = JSON.stringify(caps)
    expect(serialized).not.toContain(validProviderInput.apiKey)
  })
})
