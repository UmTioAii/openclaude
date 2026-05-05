import { describe, it, expect } from 'bun:test'

import {
  resolveRuntimeRoute,
  resolveRuntimeCapabilityCacheKey,
  resolveRuntimeCapabilitiesFromMetadata,
} from '../RuntimeCapabilityResolver.js'

import type {
  RuntimeSetupInput,
} from '../types.js'

import type {
  ModelCatalogEntry,
} from '../../../integrations/descriptors.js'

import type {
  RouteDescriptor,
} from '../../../integrations/routeMetadata.js'

// ── Test helpers ──────────────────────────────────────────────────────

// RouteDescriptor is a union of GatewayDescriptor | VendorDescriptor.
// Constructing a minimal valid VendorDescriptor requires many fields.
// We use `as any` in one isolated helper to avoid repeating it in every test,
// since the union type makes a fully-typed minimal fixture impractical.
function makeDescriptor(
  overrides: Record<string, unknown> = {},
): RouteDescriptor {
  return {
    routeId: 'test-vendor',
    label: 'Test Vendor',
    envKey: 'TEST_API_KEY',
    envLabel: 'Test API Key',
    authMode: 'api-key',
    defaultBaseUrl: 'https://api.test.com/v1',
    defaultModel: 'test-default-model',
    transportConfig: {
      kind: 'openai-compatible',
      openaiShim: {
        maxTokensField: 'max_tokens',
      },
    },
    ...overrides,
  } as any as RouteDescriptor
}

function makeCatalogEntry(
  overrides: Partial<ModelCatalogEntry> = {},
): ModelCatalogEntry {
  return {
    apiName: 'catalog-model',
    label: 'Catalog Model',
    capabilities: {
      supportsFunctionCalling: true,
      supportsReasoning: true,
    },
    contextWindow: 128000,
    maxOutputTokens: 4096,
    ...overrides,
  } as ModelCatalogEntry
}

function makeSetupInput(
  overrides: Partial<RuntimeSetupInput> = {},
): RuntimeSetupInput {
  return {
    routeId: 'test-vendor',
    descriptor: makeDescriptor(),
    catalogEntry: makeCatalogEntry(),
    providerInput: {
      providerId: 'test-vendor',
      baseUrl: 'https://api.test.com/v1',
      model: 'gpt-4',
      apiKey: 'sk-test-key-123',
    },
    processEnv: {},
    ...overrides,
  }
}

// ── resolveRuntimeRoute ──────────────────────────────────────────────

describe('RuntimeCapabilityResolver', () => {
  describe('resolveRuntimeRoute', () => {
    it('preserves explicit providerInput.model', () => {
      const result = resolveRuntimeRoute({
        routeId: 'test-vendor',
        descriptor: makeDescriptor(),
        catalogEntry: makeCatalogEntry({ apiName: 'catalog-model' }),
        providerInput: {
          providerId: 'test-vendor',
          baseUrl: 'https://api.test.com/v1',
          model: 'explicit-model',
        },
      })

      expect(result.resolvedModel).toBe('explicit-model')
      expect(result.modelSource).toBe('manual')
    })

    it('falls back to catalogEntry.apiName when providerInput.model is empty', () => {
      const result = resolveRuntimeRoute({
        routeId: 'test-vendor',
        descriptor: makeDescriptor(),
        catalogEntry: makeCatalogEntry({ apiName: 'catalog-model' }),
        providerInput: {
          providerId: 'test-vendor',
          baseUrl: 'https://api.test.com/v1',
          model: '',
        },
      })

      expect(result.resolvedModel).toBe('catalog-model')
      expect(result.modelSource).toBe('catalog')
    })

    it('falls back to descriptor.defaultModel when catalogEntry is missing', () => {
      const result = resolveRuntimeRoute({
        routeId: 'test-vendor',
        descriptor: makeDescriptor({ defaultModel: 'default-model' }),
        catalogEntry: null,
        providerInput: {
          providerId: 'test-vendor',
          baseUrl: 'https://api.test.com/v1',
          model: '',
        },
      })

      expect(result.resolvedModel).toBe('default-model')
      expect(result.modelSource).toBe('fallback')
    })

    it('falls back to "unknown" when model sources are missing', () => {
      // GatewayDescriptor has optional defaultModel, so we simulate
      // a descriptor with no defaultModel and no catalog entry
      const result = resolveRuntimeRoute({
        routeId: 'test-vendor',
        descriptor: makeDescriptor({ defaultModel: undefined }),
        catalogEntry: null,
        providerInput: {
          providerId: 'test-vendor',
          baseUrl: 'https://api.test.com/v1',
          model: '',
        },
      })

      expect(result.resolvedModel).toBe('unknown')
      expect(result.modelSource).toBe('fallback')
    })

    it('normalizes baseUrl but does not change host', () => {
      const result = resolveRuntimeRoute({
        routeId: 'test-vendor',
        descriptor: makeDescriptor(),
        catalogEntry: null,
        providerInput: {
          providerId: 'test-vendor',
          baseUrl: 'https://api.test.com/v1/chat/completions',
          model: 'gpt-4',
        },
      })

      // Host is preserved, endpoint suffix stripped
      expect(result.normalizedBaseUrl).toBe('https://api.test.com/v1')
      expect(result.baseUrlNormalizationChanged).toBe(true)
    })

    it('preserves /v1 base URLs', () => {
      const result = resolveRuntimeRoute({
        routeId: 'test-vendor',
        descriptor: makeDescriptor(),
        catalogEntry: null,
        providerInput: {
          providerId: 'test-vendor',
          baseUrl: 'https://api.test.com/v1',
          model: 'gpt-4',
        },
      })

      expect(result.normalizedBaseUrl).toBe('https://api.test.com/v1')
      expect(result.baseUrlNormalizationChanged).toBe(false)
    })

    it('does not mutate input objects', () => {
      const providerInput = {
        providerId: 'test-vendor',
        baseUrl: 'https://api.test.com/v1/chat/completions',
        model: 'gpt-4',
      }
      const originalBaseUrl = providerInput.baseUrl
      const originalModel = providerInput.model

      resolveRuntimeRoute({
        routeId: 'test-vendor',
        descriptor: makeDescriptor(),
        catalogEntry: null,
        providerInput,
      })

      expect(providerInput.baseUrl).toBe(originalBaseUrl)
      expect(providerInput.model).toBe(originalModel)
    })
  })

  // ── resolveRuntimeCapabilityCacheKey ────────────────────────────────

  describe('resolveRuntimeCapabilityCacheKey', () => {
    it('cache key uses baseUrlHash, not raw baseUrl', () => {
      const key = resolveRuntimeCapabilityCacheKey({
        routeId: 'test-vendor',
        providerInput: {
          baseUrl: 'https://api.test.com/v1',
          model: 'gpt-4',
          apiKey: 'sk-test-key-123',
        },
      })

      expect(key.baseUrlHash).not.toBe('https://api.test.com/v1')
      expect(key.baseUrlHash).not.toContain('http')
      // baseUrlHash should be a 16-char hex string (SHA-256 truncated)
      expect(key.baseUrlHash).toMatch(/^[0-9a-f]{16}$/)
    })

    it('cache key uses authFingerprint, not raw apiKey', () => {
      const key = resolveRuntimeCapabilityCacheKey({
        routeId: 'test-vendor',
        providerInput: {
          baseUrl: 'https://api.test.com/v1',
          model: 'gpt-4',
          apiKey: 'sk-test-key-123',
        },
      })

      expect(key.authFingerprint).not.toBe('sk-test-key-123')
      expect(key.authFingerprint).not.toContain('sk-')
      // authFingerprint should be a 16-char hex string
      expect(key.authFingerprint).toMatch(/^[0-9a-f]{16}$/)
    })

    it('missing apiKey produces stable non-secret fingerprint', () => {
      const key1 = resolveRuntimeCapabilityCacheKey({
        routeId: 'test-vendor',
        providerInput: {
          baseUrl: 'https://api.test.com/v1',
          model: 'gpt-4',
        },
      })

      const key2 = resolveRuntimeCapabilityCacheKey({
        routeId: 'test-vendor',
        providerInput: {
          baseUrl: 'https://api.test.com/v1',
          model: 'gpt-4',
        },
      })

      expect(key1.authFingerprint).toBe('no-auth')
      expect(key2.authFingerprint).toBe('no-auth')
    })

    it('apiFormat is included when present', () => {
      const key = resolveRuntimeCapabilityCacheKey({
        routeId: 'test-vendor',
        providerInput: {
          baseUrl: 'https://api.test.com/v1',
          model: 'gpt-4',
          apiKey: 'sk-test-key',
          apiFormat: 'openai',
        },
      })

      expect(key.apiFormat).toBe('openai')
    })

    it('apiFormat is omitted when not present', () => {
      const key = resolveRuntimeCapabilityCacheKey({
        routeId: 'test-vendor',
        providerInput: {
          baseUrl: 'https://api.test.com/v1',
          model: 'gpt-4',
          apiKey: 'sk-test-key',
        },
      })

      expect(key.apiFormat).toBeUndefined()
    })

    it('no raw secret appears in serialized cache key test data', () => {
      const key = resolveRuntimeCapabilityCacheKey({
        routeId: 'test-vendor',
        providerInput: {
          baseUrl: 'https://api.secret-url.com/v1',
          model: 'gpt-4',
          apiKey: 'sk-super-secret-key-999',
        },
      })

      const serialized = JSON.stringify(key)

      expect(serialized).not.toContain('sk-super-secret-key-999')
      expect(serialized).not.toContain('sk-')
      expect(serialized).not.toContain('https://api.secret-url.com')
      expect(serialized).not.toContain('http')
    })
  })

  // ── resolveRuntimeCapabilitiesFromMetadata ──────────────────────────

  describe('resolveRuntimeCapabilitiesFromMetadata', () => {
    it('tools.supported follows catalogEntry.capabilities.supportsFunctionCalling', () => {
      const withTools = makeSetupInput({
        catalogEntry: makeCatalogEntry({
          capabilities: { supportsFunctionCalling: true },
        }),
      })
      const resultWith = resolveRuntimeCapabilitiesFromMetadata(withTools)
      expect(resultWith.tools.supported).toBe(true)

      const withoutTools = makeSetupInput({
        catalogEntry: makeCatalogEntry({
          capabilities: { supportsFunctionCalling: false },
        }),
      })
      const resultWithout = resolveRuntimeCapabilitiesFromMetadata(withoutTools)
      expect(resultWithout.tools.supported).toBe(false)
    })

    it('thinking.supported follows catalogEntry.capabilities.supportsReasoning', () => {
      const withThinking = makeSetupInput({
        catalogEntry: makeCatalogEntry({
          capabilities: { supportsReasoning: true },
        }),
      })
      const resultWith = resolveRuntimeCapabilitiesFromMetadata(withThinking)
      expect(resultWith.thinking.supported).toBe(true)

      const withoutThinking = makeSetupInput({
        catalogEntry: makeCatalogEntry({
          capabilities: { supportsReasoning: false },
        }),
      })
      const resultWithout = resolveRuntimeCapabilitiesFromMetadata(withoutThinking)
      expect(resultWithout.thinking.supported).toBe(false)
    })

  it("thinking.mode is provider_specific when supportsReasoning is true", () => {
    const input = makeSetupInput({
      catalogEntry: makeCatalogEntry({
        capabilities: { supportsReasoning: true },
      }),
    })
    const result = resolveRuntimeCapabilitiesFromMetadata(input)
    expect(result.thinking.supported).toBe(true)
    expect(result.thinking.mode).toBe("provider_specific")
  })

    it('effort remains conservative by default', () => {
      const result = resolveRuntimeCapabilitiesFromMetadata(makeSetupInput())

      expect(result.effort.supported).toBe(false)
      expect(result.effort.mode).toBe('none')
      expect(result.effort.allowAutoMax).toBe(false)
      expect(result.effort.nativeValues).toEqual([])
      expect(result.effort.source).toBe('fallback')
    })

    it('payload.maxTokensField defaults to "max_tokens" when metadata does not specify otherwise', () => {
      const result = resolveRuntimeCapabilitiesFromMetadata(
        makeSetupInput({
          descriptor: makeDescriptor({
            transportConfig: {
              kind: 'openai-compatible',
              openaiShim: {},
            },
          }),
        }),
      )

      expect(result.payload.maxTokensField).toBe('max_tokens')
    })

    it('payload.maxTokensField uses descriptor transport config when present', () => {
      const result = resolveRuntimeCapabilitiesFromMetadata(
        makeSetupInput({
          descriptor: makeDescriptor({
            transportConfig: {
              kind: 'openai-compatible',
              openaiShim: {
                maxTokensField: 'max_completion_tokens',
              },
            },
          }),
        }),
      )

      expect(result.payload.maxTokensField).toBe('max_completion_tokens')
    })

    it('providerLabel comes from descriptor.label', () => {
      const result = resolveRuntimeCapabilitiesFromMetadata(
        makeSetupInput({
          descriptor: makeDescriptor({ label: 'My Custom Provider' }),
        }),
      )

      expect(result.providerLabel).toBe('My Custom Provider')
    })

    it('providerId comes from providerInput.providerId', () => {
      const result = resolveRuntimeCapabilitiesFromMetadata(
        makeSetupInput({
          providerInput: {
            providerId: 'custom-id',
            baseUrl: 'https://api.test.com/v1',
            model: 'gpt-4',
            apiKey: 'sk-test',
          },
        }),
      )

      expect(result.providerId).toBe('custom-id')
    })

    it('providerId falls back to routeId when providerInput.providerId is empty', () => {
      const result = resolveRuntimeCapabilitiesFromMetadata(
        makeSetupInput({
          routeId: 'fallback-route',
          providerInput: {
            providerId: '',
            baseUrl: 'https://api.test.com/v1',
            model: 'gpt-4',
            apiKey: 'sk-test',
          },
        }),
      )

      expect(result.providerId).toBe('fallback-route')
    })

    it('tools.format is "anthropic" for anthropic-native transport', () => {
      const result = resolveRuntimeCapabilitiesFromMetadata(
        makeSetupInput({
          descriptor: makeDescriptor({
            transportConfig: { kind: 'anthropic-native' },
          }),
        }),
      )

      expect(result.tools.format).toBe('anthropic')
    })

    it('tools.format is "gemini" for gemini-native transport', () => {
      const result = resolveRuntimeCapabilitiesFromMetadata(
        makeSetupInput({
          descriptor: makeDescriptor({
            transportConfig: { kind: 'gemini-native' },
          }),
        }),
      )

      expect(result.tools.format).toBe('gemini')
    })

    it('tools.format is "openai" for openai-compatible transport', () => {
      const result = resolveRuntimeCapabilitiesFromMetadata(
        makeSetupInput({
          descriptor: makeDescriptor({
            transportConfig: { kind: 'openai-compatible' },
          }),
        }),
      )

      expect(result.tools.format).toBe('openai')
    })

    it('payload.endpoint is "anthropic_messages" for anthropic-native', () => {
      const result = resolveRuntimeCapabilitiesFromMetadata(
        makeSetupInput({
          descriptor: makeDescriptor({
            transportConfig: { kind: 'anthropic-native' },
          }),
        }),
      )

      expect(result.payload.endpoint).toBe('anthropic_messages')
    })

    it('payload.endpoint is "gemini_native" for gemini-native', () => {
      const result = resolveRuntimeCapabilitiesFromMetadata(
        makeSetupInput({
          descriptor: makeDescriptor({
            transportConfig: { kind: 'gemini-native' },
          }),
        }),
      )

      expect(result.payload.endpoint).toBe('gemini_native')
    })

    it('payload.endpoint is "chat_completions" for openai-compatible', () => {
      const result = resolveRuntimeCapabilitiesFromMetadata(
        makeSetupInput({
          descriptor: makeDescriptor({
            transportConfig: { kind: 'openai-compatible' },
          }),
        }),
      )

      expect(result.payload.endpoint).toBe('chat_completions')
    })

    it('confidence is "catalog" when catalogEntry is used', () => {
      const result = resolveRuntimeCapabilitiesFromMetadata(
        makeSetupInput({
          catalogEntry: makeCatalogEntry(),
        }),
      )

      expect(result.confidence).toBe('catalog')
    })

    it('confidence is "manual" when model comes from explicit input without catalog', () => {
      const result = resolveRuntimeCapabilitiesFromMetadata(
        makeSetupInput({
          catalogEntry: null,
          providerInput: {
            providerId: 'test-vendor',
            baseUrl: 'https://api.test.com/v1',
            model: 'explicit-model',
            apiKey: 'sk-test',
          },
        }),
      )

      expect(result.confidence).toBe('manual')
    })

    it('confidence is "conservative" when fallback assumptions are used', () => {
      const result = resolveRuntimeCapabilitiesFromMetadata(
        makeSetupInput({
          catalogEntry: null,
          descriptor: makeDescriptor({ defaultModel: 'fallback-model' }),
          providerInput: {
            providerId: 'test-vendor',
            baseUrl: 'https://api.test.com/v1',
            model: '',
            apiKey: 'sk-test',
          },
        }),
      )

      expect(result.confidence).toBe('conservative')
    })

    it('availability is conservative when no catalog entry exists', () => {
      const result = resolveRuntimeCapabilitiesFromMetadata(
        makeSetupInput({
          catalogEntry: null,
        }),
      )

      expect(result.availability.checked).toBe(false)
      expect(result.availability.verifiedBy).toBe('not_checked')
    })

    it('availability is catalog-verified when catalog entry exists', () => {
      const result = resolveRuntimeCapabilitiesFromMetadata(
        makeSetupInput({
          catalogEntry: makeCatalogEntry(),
        }),
      )

      expect(result.availability.checked).toBe(true)
      expect(result.availability.verifiedBy).toBe('catalog')
    })

    it('limits use catalogEntry contextWindow and maxOutputTokens', () => {
      const result = resolveRuntimeCapabilitiesFromMetadata(
        makeSetupInput({
          catalogEntry: makeCatalogEntry({
            contextWindow: 200000,
            maxOutputTokens: 8192,
          }),
        }),
      )

      expect(result.limits.contextWindow).toBe(200000)
      expect(result.limits.maxOutputTokens).toBe(8192)
    })

    it('limits are empty when catalogEntry has no limit data', () => {
      const result = resolveRuntimeCapabilitiesFromMetadata(
        makeSetupInput({
          catalogEntry: makeCatalogEntry({
            contextWindow: undefined,
            maxOutputTokens: undefined,
          }),
        }),
      )

      expect(result.limits.contextWindow).toBeUndefined()
      expect(result.limits.maxOutputTokens).toBeUndefined()
    })

    it('model.requested preserves explicit providerInput.model', () => {
      const result = resolveRuntimeCapabilitiesFromMetadata(
        makeSetupInput({
          providerInput: {
            providerId: 'test-vendor',
            baseUrl: 'https://api.test.com/v1',
            model: 'my-explicit-model',
            apiKey: 'sk-test',
          },
        }),
      )

      expect(result.model.requested).toBe('my-explicit-model')
      expect(result.model.resolvedApiName).toBe('my-explicit-model')
      expect(result.model.source).toBe('manual')
    })

    it('resolver does not mutate input objects', () => {
      const input = makeSetupInput()
      const originalModel = input.providerInput.model
      const originalBaseUrl = input.providerInput.baseUrl

      resolveRuntimeCapabilitiesFromMetadata(input)

      expect(input.providerInput.model).toBe(originalModel)
      expect(input.providerInput.baseUrl).toBe(originalBaseUrl)
    })

    it('catalog transport overrides apply to payload fields', () => {
      const result = resolveRuntimeCapabilitiesFromMetadata(
        makeSetupInput({
          catalogEntry: makeCatalogEntry({
            transportOverrides: {
              openaiShim: {
                maxTokensField: 'max_completion_tokens',
                preserveReasoningContent: true,
                removeBodyFields: ['stop'],
              },
            },
          }),
        }),
      )

      expect(result.payload.maxTokensField).toBe('max_completion_tokens')
      expect(result.payload.preserveReasoningContent).toBe(true)
      expect(result.payload.removeBodyFields).toEqual(['stop'])
    })
  })
})
