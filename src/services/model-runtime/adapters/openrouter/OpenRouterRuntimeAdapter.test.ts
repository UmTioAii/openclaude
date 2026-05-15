// PR1 — OpenRouterRuntimeAdapter focused tests

import { describe, it, expect } from 'bun:test'
import { OpenRouterRuntimeAdapter } from './OpenRouterRuntimeAdapter.js'
import type {
  RuntimeSetupInput,
  RuntimeModelCapabilities,
  ResolveRuntimeCapabilitiesInput,
} from '../../types.js'
import type { RouteDescriptor } from '../../types.js'

// Helpers

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
    id: 'openrouter',
    label: 'OpenRouter',
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
    routeId: 'openrouter',
    providerId: 'openrouter',
    providerLabel: 'OpenRouter',
    model: {
      requested: 'openai/gpt-4o',
      resolvedApiName: 'openai/gpt-4o',
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
      supportsUserCustomHeaders: false,
    },
    limits: {
      contextWindow: undefined,
      maxOutputTokens: undefined,
    },
    confidence: 'manual',
    ...overrides,
  }
}

// ── Tests ───────────────────────────────────────────────────────────────────

const baseInput = {
  routeId: 'openrouter',
  descriptor: makeDescriptor(),
  catalogEntry: undefined,
  providerInput: {
    apiKey: 'sk-or-test-key',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'openai/gpt-4o',
  },
  processEnv: {},
}

const adapter = new OpenRouterRuntimeAdapter()

describe('OpenRouterRuntimeAdapter — identity', () => {
  it('id is "openrouter"', () => {
    expect(adapter.id).toBe('openrouter')
  })

  it('label is stable ("OpenRouter")', () => {
    expect(adapter.label).toBe('OpenRouter')
  })
})

describe('OpenRouterRuntimeAdapter — supportsRoute', () => {
  it('supportsRoute matches by routeId or descriptor.id', () => {
    expect(adapter.supportsRoute('openrouter', makeDescriptor())).toBe(true)
    expect(adapter.supportsRoute('nvidia-nim', makeDescriptor({ id: 'nvidia-nim' }))).toBe(false)
    expect(adapter.supportsRoute('gemini', makeDescriptor({ id: 'gemini' }))).toBe(false)
    expect(adapter.supportsRoute('codex', makeDescriptor({ id: 'codex' }))).toBe(false)
    expect(adapter.supportsRoute('openai', makeDescriptor({ id: 'openai' }))).toBe(false)
    expect(adapter.supportsRoute('custom-provider', makeDescriptor({ id: 'custom-provider' }))).toBe(false)
  })
})

describe('OpenRouterRuntimeAdapter — validateSetup', () => {
  it('validateSetup returns fatal missing_required_auth when apiKey is missing', async () => {
    const input = {
      ...baseInput,
      providerInput: {
        ...baseInput.providerInput,
        apiKey: '',
      },
    }

    const result = await adapter.validateSetup(input)
    expect(result.ok).toBe(false)
    expect(result.severity).toBe('fatal')
    expect(result.code).toBe('missing_required_auth')
  })

  it('validateSetup returns fatal missing_required_auth when apiKey is whitespace-only', async () => {
    const input = {
      ...baseInput,
      providerInput: {
        ...baseInput.providerInput,
        apiKey: '   ',
      },
    }

    const result = await adapter.validateSetup(input)
    expect(result.ok).toBe(false)
    expect(result.severity).toBe('fatal')
    expect(result.code).toBe('missing_required_auth')
  })

  it('validateSetup returns fatal invalid_base_url when baseUrl is empty', async () => {
    const input = {
      ...baseInput,
      providerInput: {
        ...baseInput.providerInput,
        baseUrl: '',
      },
    }

    const result = await adapter.validateSetup(input)
    expect(result.ok).toBe(false)
    expect(result.severity).toBe('fatal')
    expect(result.code).toBe('invalid_base_url')
  })

  it('validateSetup returns fatal invalid_base_url when baseUrl is whitespace-only', async () => {
    const input = {
      ...baseInput,
      providerInput: {
        ...baseInput.providerInput,
        baseUrl: '   ',
      },
    }

    const result = await adapter.validateSetup(input)
    expect(result.ok).toBe(false)
    expect(result.severity).toBe('fatal')
    expect(result.code).toBe('invalid_base_url')
  })

  it('validateSetup returns fatal model_not_found when model is empty', async () => {
    const input = {
      ...baseInput,
      providerInput: {
        ...baseInput.providerInput,
        model: '',
      },
    }

    const result = await adapter.validateSetup(input)
    expect(result.ok).toBe(false)
       expect(result.severity).toBe('fatal')
    expect(result.code).toBe('model_not_found')
  })

  it('validateSetup returns fatal model_not_found when model is whitespace-only', async () => {
    const input = {
      ...baseInput,
      providerInput: {
        ...baseInput.providerInput,
        model: '   ',
      },
    }

    const result = await adapter.validateSetup(input)
    expect(result.ok).toBe(false)
    expect(result.severity).toBe('fatal')
    expect(result.code).toBe('model_not_found')
  })

  it('validateSetup returns ok:true with capabilities when required fields exist', async () => {
    const result = await adapter.validateSetup(baseInput)
    expect(result.ok).toBe(true)
    expect(result.capabilities).toBeDefined()
  })

  // Type-mismatch boundary: non-string values from malformed JSON config
  it('validateSetup returns missing_required_auth when apiKey is a number (not string)', async () => {
    const input = {
      ...baseInput,
      providerInput: { ...baseInput.providerInput, apiKey: 12345 },
    }
    const result = await adapter.validateSetup(input as any)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.code).toBe('missing_required_auth')
    }
  })

  it('validateSetup returns invalid_base_url when baseUrl is a number (not string)', async () => {
    const input = {
      ...baseInput,
      providerInput: { ...baseInput.providerInput, baseUrl: 999 },
    }
    const result = await adapter.validateSetup(input as any)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.code).toBe('invalid_base_url')
    }
  })

  it('validateSetup returns model_not_found when model is a number (not string)', async () => {
    const input = {
      ...baseInput,
      providerInput: { ...baseInput.providerInput, model: 42 },
    }
    const result = await adapter.validateSetup(input as any)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.code).toBe('model_not_found')
    }
  })
})

describe('OpenRouterRuntimeAdapter — verifyStartup', () => {
  it('verifyStartup returns ok:true with capabilities without network', async () => {
    const result = await adapter.verifyStartup({
      routeId: 'openrouter',
      descriptor: makeDescriptor(),
      catalogEntry: undefined,
      providerInput: {
        apiKey: 'test-key',
        baseUrl: 'https://openrouter.ai/api/v1',
        model: 'test-model',
      },
      cachedCapabilities: undefined,
    })

    expect(result.ok).toBe(true)
    expect(result.capabilities).toBeDefined()
  })

  it('verifyStartup uses cachedCapabilities when present and providerId is openrouter', async () => {
    const cachedCaps = makeCapabilities()
    const result = await adapter.verifyStartup({
      routeId: 'openrouter',
      descriptor: makeDescriptor(),
      catalogEntry: undefined,
      providerInput: {
        apiKey: 'test-key',
        baseUrl: 'https://openrouter.ai/api/v1',
        model: 'test-model',
      },
      cachedCapabilities: cachedCaps,
    })

    expect(result.ok).toBe(true)
    expect(result.capabilities).toBe(cachedCaps)
  })

  it('verifyStartup ignores cachedCapabilities from a different providerId', async () => {
    const cachedCaps = makeCapabilities({ providerId: 'different-provider' })
    const result = await adapter.verifyStartup({
      routeId: 'openrouter',
      descriptor: makeDescriptor(),
      catalogEntry: undefined,
      providerInput: {
        apiKey: 'test-key',
        baseUrl: 'https://openrouter.ai/api/v1',
        model: 'test-model',
      },
      cachedCapabilities: cachedCaps,
    })

    expect(result.ok).toBe(true)
    // Should not use the cached capabilities, should resolve new ones
    expect(result.capabilities).not.toBe(cachedCaps)
  })
})

describe('OpenRouterRuntimeAdapter — resolveCapabilities', () => {
  it('resolveCapabilities preserves explicit providerInput.model', async () => {
    const caps = await adapter.resolveCapabilities(baseInput)
    expect(caps.model.requested).toBe('openai/gpt-4o')
    expect(caps.model.resolvedApiName).toBe('openai/gpt-4o')
  })

  it('resolveCapabilities does not mutate input', async () => {
    const input = { ...baseInput }
    const inputCopy = { ...input }
    await adapter.resolveCapabilities(input)
    expect(input).toEqual(inputCopy)
  })

  it('resolveCapabilities uses chat_completions endpoint', async () => {
    const caps = await adapter.resolveCapabilities(baseInput)
    expect(caps.payload.endpoint).toBe('chat_completions')
  })

  it('resolveCapabilities uses openai tool format', async () => {
    const caps = await adapter.resolveCapabilities(baseInput)
    expect(caps.tools.format).toBe('openai')
  })

  it('resolveCapabilities keeps effort unsupported', async () => {
    const caps = await adapter.resolveCapabilities(baseInput)
    expect(caps.effort.supported).toBe(false)
  })

  it('resolveCapabilities sets thinking.provider_specific only when catalog says supportsReasoning', async () => {
    const inputWithReasoning = {
      ...baseInput,
      catalogEntry: { capabilities: { supportsReasoning: true } }
    }
    const caps = await adapter.resolveCapabilities(inputWithReasoning)
    expect(caps.thinking.mode).toBe('provider_specific')
  })

  it('resolveCapabilities uses descriptor maxTokensField when provided', async () => {
    const descriptor = makeDescriptor({
      transportConfig: {
        kind: 'openai-compatible',
        openaiShim: {
          maxTokensField: 'max_completion_tokens'
        }
      }
    })
    const input = { ...baseInput, descriptor }
    const caps = await adapter.resolveCapabilities(input)
    expect(caps.payload.maxTokensField).toBe('max_completion_tokens')
  })

  it('resolveCapabilities defaults maxTokensField to "max_tokens"', async () => {
    const caps = await adapter.resolveCapabilities(baseInput)
    expect(caps.payload.maxTokensField).toBe('max_tokens')
  })

  it('resolveCapabilities supportsUserCustomHeaders follows descriptor openaiShim supportsAuthHeaders', async () => {
    const descriptor = makeDescriptor({
      transportConfig: {
        kind: 'openai-compatible',
        openaiShim: {
          supportsAuthHeaders: true
        }
      }
    })
    const input = { ...baseInput, descriptor }
    const caps = await adapter.resolveCapabilities(input)
    expect(caps.payload.supportsUserCustomHeaders).toBe(true)
  })

  it('resolveCapabilities sets limits from catalogEntry when present', async () => {
    const input = {
      ...baseInput,
      catalogEntry: {
        contextWindow: 8192,
        maxOutputTokens: 4096
      }
    }
    const caps = await adapter.resolveCapabilities(input)
    expect(caps.limits.contextWindow).toBe(8192)
    expect(caps.limits.maxOutputTokens).toBe(4096)
  })
})

describe('OpenRouterRuntimeAdapter — buildPayload', () => {
  it('buildPayload does not mutate original body', () => {
    const body = { model: 'test-model', messages: [] }
    const bodyCopy = { ...body }
    const caps = makeCapabilities()

    const payload = adapter.buildPayload({
      body,
      capabilities: caps
    })

    expect(body).toEqual(bodyCopy)
  })

  it('buildPayload preserves existing body.model', () => {
    const body = { model: 'custom-model', messages: [] }
    const caps = makeCapabilities()

    const payload = adapter.buildPayload({
      body,
      capabilities: caps
    })

    expect(payload.model).toBe('custom-model')
  })

  it('buildPayload sets model when body.model is absent', () => {
    const body = { messages: [] }
    const caps = makeCapabilities()

    const payload = adapter.buildPayload({
      body,
      capabilities: caps
    })

    expect(payload.model).toBe('openai/gpt-4o')
  })

  it('buildPayload sets model when body.model is empty string', () => {
    const body = { model: '', messages: [] }
    const caps = makeCapabilities()

    const payload = adapter.buildPayload({
      body: body,
      capabilities: caps
    })

    expect(payload.model).toBe('openai/gpt-4o')
  })

  it('buildPayload applies maxTokensField mapping', () => {
    const body = { max_completion_tokens: 1000, messages: [] }
    const caps = makeCapabilities({
      payload: {
        endpoint: 'chat_completions',
        maxTokensField: 'max_tokens',
        supportsUserCustomHeaders: false,
      }
    })

    const payload = adapter.buildPayload({
      body,
      capabilities: caps
    })

    expect(payload.max_tokens).toBe(1000)
    expect(payload.max_completion_tokens).toBeUndefined()
  })

  it('buildPayload does not inject apiKey or authorization', () => {
    const body = { messages: [] }
    const caps = makeCapabilities()

    const payload = adapter.buildPayload({
      body,
      capabilities: caps
    })

    const serialized = JSON.stringify(payload)
    expect(serialized).not.toContain('apiKey')
    expect(serialized).not.toContain('Authorization')
    expect(serialized).not.toContain('Bearer')
    expect('apiKey' in payload).toBe(false)
    expect('Authorization' in payload).toBe(false)
  })
})

describe('OpenRouterRuntimeAdapter — classifyError', () => {
  it('classifyError maps 401/403/auth text to invalid_api_key without leaking secrets', () => {
    const error401 = new Error('401 Unauthorized')
    // @ts-expect-error - adding status property
    error401.status = 401

    const result = adapter.classifyError(error401)
    expect(result.code).toBe('invalid_api_key')
    expect(result.reason).toBe('Authentication failed for OpenRouter.')
  })

  it('classifyError maps 404/model not found/unknown model to model_not_found', () => {
    const error404 = new Error('Model not found')
    // @ts-expect-error - adding status property
    error404.status = 404

    const result = adapter.classifyError(error404)
    expect(result.code).toBe('model_not_found')
  })

  it('classifyError maps unknown errors to warning probe_failed with stable generic reason', () => {
    const error = new Error('Unknown error')
    const result = adapter.classifyError(error)
    expect(result.severity).toBe('warning')
    expect(result.code).toBe('probe_failed')
  })

  it('classifyError does not leak plain text key in message like "API key sk-or-secret-12345 is invalid"', () => {
    const error = new Error('API key sk-or-secret-12345 is invalid')
    const result = adapter.classifyError(error)
    // The result should not contain the actual key value
    expect(result.reason).not.toContain('sk-or-secret-12345')
  })

  it('classifyError does not leak Bearer token', () => {
    const error = new Error('Authorization: Bearer sk-or-token-12345')
    const result = adapter.classifyError(error)
    expect(result.reason).not.toContain('sk-or-token-12345')
  })

  it('classifyError does not throw on null/undefined', () => {
    expect(() => {
      adapter.classifyError(null)
      adapter.classifyError(undefined)
    }).not.toThrow()
  })
})

describe('OpenRouterRuntimeAdapter — no apiKey leakage', () => {
  it('no raw apiKey appears in serialized capabilities', async () => {
    const input = {
      routeId: 'openrouter',
      descriptor: makeDescriptor(),
      catalogEntry: undefined,
      providerInput: {
        apiKey: 'sk-or-super-secret-99999',
        baseUrl: 'https://openrouter.ai/api/v1',
        model: 'openai/gpt-4o',
      },
      processEnv: {},
    }
    const caps = await adapter.resolveCapabilities(input as unknown as ResolveRuntimeCapabilitiesInput)
    const capsJson = JSON.stringify(caps)
    expect(capsJson).not.toContain('sk-or-super-secret-99999')
  })
})

