// PR1 — Slice 4B2: ProviderStartupVerifier focused tests
// Tests cover: validateSetup and verifyStartup orchestration,
// cache behavior, error handling, input immutability, no forbidden method calls,
// cache key normalization, auth separation, default factory, and no raw secrets.

import { describe, it, expect } from 'bun:test'

import { ProviderStartupVerifier, buildDefaultProviderStartupVerifier } from '../ProviderStartupVerifier.js'
import { RuntimeAdapterRegistry } from '../RuntimeAdapterRegistry.js'
import { RuntimeCapabilityCache } from '../RuntimeCapabilityCache.js'
import type {
  RuntimeProviderAdapter,
  RuntimeSetupInput,
  RuntimeStartupInput,
  RuntimeModelCapabilities,
  RuntimeSetupResult,
  StartupVerificationResult,
} from '../types.js'

// ── Fixture helpers ─────────────────────────────────────────────────────

const DEFAULT_CAPABILITIES: RuntimeModelCapabilities = {
  routeId: 'test-route',
  providerId: 'test-provider',
  providerLabel: 'Test Provider',
  model: {
    requested: 'test-model',
    resolvedApiName: 'test-model',
    source: 'catalog',
  },
  availability: {
    checked: true,
    exists: true,
    active: true,
    verifiedBy: 'catalog',
  },
  tools: { supported: true, format: 'openai' },
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
    endpoint: 'chat_completions',
    maxTokensField: 'max_tokens',
  },
  limits: {},
  confidence: 'catalog',
}

/**
 * Build a minimal RuntimeSetupInput for testing.
 * RouteDescriptor is a union type; `as any` is isolated here because
 * constructing a fully valid union member requires many irrelevant fields.
 */
function makeSetupInput(overrides: {
  routeId?: string
  providerId?: string
  baseUrl?: string
  model?: string
  apiKey?: string
  apiFormat?: string
  descriptor?: RuntimeSetupInput['descriptor']
}): RuntimeSetupInput {
  return {
    routeId: overrides.routeId ?? 'test-route',
    descriptor: overrides.descriptor ?? {
      id: overrides.routeId ?? 'test-route',
      label: 'Test Provider',
    } as any,
    catalogEntry: null,
    providerInput: {
      providerId: overrides.providerId ?? 'test-provider',
      baseUrl: overrides.baseUrl ?? 'https://api.test.com/v1',
      model: overrides.model ?? 'test-model',
      apiKey: overrides.apiKey,
      apiFormat: overrides.apiFormat,
    },
    processEnv: {},
  }
}

/** Build a fake adapter with controllable behavior. */
function makeFakeAdapter(options: {
  validateSetupResult?: RuntimeSetupResult
  validateSetupThrows?: boolean
  validateSetupCalls?: { count: number }
  verifyStartupResult?: StartupVerificationResult
  verifyStartupThrows?: boolean
  verifyStartupCalls?: { count: number }
  verifyStartupReceivedInput?: { value: RuntimeStartupInput | null }
  resolveCapabilitiesCalls?: { count: number }
}): RuntimeProviderAdapter {
  return {
    id: 'fake-adapter' as any,
    label: 'Fake Adapter',
    supportsRoute: () => true,
    validateSetup: async (input: RuntimeSetupInput) => {
      if (options.validateSetupCalls) options.validateSetupCalls.count++
      if (options.validateSetupThrows) throw new Error('validateSetup exploded with secret-key-abc123')
      return options.validateSetupResult ?? { ok: true, capabilities: DEFAULT_CAPABILITIES }
    },
    verifyStartup: async (input: RuntimeStartupInput) => {
      if (options.verifyStartupCalls) options.verifyStartupCalls.count++
      if (options.verifyStartupReceivedInput) options.verifyStartupReceivedInput.value = input
      if (options.verifyStartupThrows) throw new Error('verifyStartup exploded with secret-key-abc123')
      return options.verifyStartupResult ?? { ok: true, capabilities: DEFAULT_CAPABILITIES }
    },
    resolveCapabilities: async () => {
      if (options.resolveCapabilitiesCalls) options.resolveCapabilitiesCalls.count++
      return DEFAULT_CAPABILITIES
    },
  }
}

// ── Tests ───────────────────────────────────────────────────────────────

describe('ProviderStartupVerifier', () => {
  // ── validateSetup ────────────────────────────────────────────────────

  describe('validateSetup', () => {
    it('calls adapter.validateSetup once', async () => {
      const callTracker = { count: 0 }
      const adapter = makeFakeAdapter({ validateSetupCalls: callTracker })
      const registry = new RuntimeAdapterRegistry([adapter])
      const cache = new RuntimeCapabilityCache()
      const verifier = new ProviderStartupVerifier({ registry, capabilityCache: cache })

      const input = makeSetupInput({})
      await verifier.validateSetup(input)

      expect(callTracker.count).toBe(1)
    })

    it('does not call adapter.verifyStartup', async () => {
      const verifyCalls = { count: 0 }
      const adapter = makeFakeAdapter({ verifyStartupCalls: verifyCalls })
      const registry = new RuntimeAdapterRegistry([adapter])
      const cache = new RuntimeCapabilityCache()
      const verifier = new ProviderStartupVerifier({ registry, capabilityCache: cache })

      const input = makeSetupInput({})
      await verifier.validateSetup(input)

      expect(verifyCalls.count).toBe(0)
    })

    it('does not call adapter.resolveCapabilities', async () => {
      const resolveCalls = { count: 0 }
      const adapter = makeFakeAdapter({ resolveCapabilitiesCalls: resolveCalls })
      const registry = new RuntimeAdapterRegistry([adapter])
      const cache = new RuntimeCapabilityCache()
      const verifier = new ProviderStartupVerifier({ registry, capabilityCache: cache })

      const input = makeSetupInput({})
      await verifier.validateSetup(input)

      expect(resolveCalls.count).toBe(0)
    })

    it('caches ok capabilities', async () => {
      const caps: RuntimeModelCapabilities = {
        ...DEFAULT_CAPABILITIES,
        providerId: 'cached-via-validate',
      }
      const adapter = makeFakeAdapter({
        validateSetupResult: { ok: true, capabilities: caps },
      })
      const registry = new RuntimeAdapterRegistry([adapter])
      const cache = new RuntimeCapabilityCache()
      const verifier = new ProviderStartupVerifier({ registry, capabilityCache: cache })

      const input = makeSetupInput({})
      const result = await verifier.validateSetup(input)

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.capabilities.providerId).toBe('cached-via-validate')
      }

      // Verify it's in the cache by checking the verifier can reuse it
      const { resolveRuntimeCapabilityCacheKey } = await import('../RuntimeCapabilityResolver.js')
      const cacheKey = resolveRuntimeCapabilityCacheKey({
        routeId: input.routeId,
        providerInput: {
          baseUrl: input.providerInput.baseUrl,
          model: input.providerInput.model,
          apiKey: input.providerInput.apiKey,
        },
      })
      const cached = cache.get(cacheKey)
      expect(cached).not.toBeNull()
      expect(cached!.providerId).toBe('cached-via-validate')
    })

    it('does not cache ok:false failures', async () => {
      const adapter = makeFakeAdapter({
        validateSetupResult: {
          ok: false,
          severity: 'warning',
          code: 'invalid_api_key',
          reason: 'API key is invalid',
        },
      })
      const registry = new RuntimeAdapterRegistry([adapter])
      const cache = new RuntimeCapabilityCache()
      const verifier = new ProviderStartupVerifier({ registry, capabilityCache: cache })

      const input = makeSetupInput({})
      const result = await verifier.validateSetup(input)

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.severity).toBe('warning')
        expect(result.code).toBe('invalid_api_key')
      }

      // Cache should be empty
      const { resolveRuntimeCapabilityCacheKey } = await import('../RuntimeCapabilityResolver.js')
      const cacheKey = resolveRuntimeCapabilityCacheKey({
        routeId: input.routeId,
        providerInput: {
          baseUrl: input.providerInput.baseUrl,
          model: input.providerInput.model,
          apiKey: input.providerInput.apiKey,
        },
      })
      const cached = cache.get(cacheKey)
      expect(cached).toBeNull()
    })

    it('returns adapter failure result as-is when ok:false', async () => {
      const adapter = makeFakeAdapter({
        validateSetupResult: {
          ok: false,
          severity: 'fatal',
          code: 'invalid_base_url',
          reason: 'Base URL is unreachable',
        },
      })
      const registry = new RuntimeAdapterRegistry([adapter])
      const cache = new RuntimeCapabilityCache()
      const verifier = new ProviderStartupVerifier({ registry, capabilityCache: cache })

      const input = makeSetupInput({})
      const result = await verifier.validateSetup(input)

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.severity).toBe('fatal')
        expect(result.code).toBe('invalid_base_url')
        expect(result.reason).toBe('Base URL is unreachable')
      }
    })

    it('catches thrown errors and returns warning probe_failed without leaking raw apiKey', async () => {
      const adapter = makeFakeAdapter({ validateSetupThrows: true })
      const registry = new RuntimeAdapterRegistry([adapter])
      const cache = new RuntimeCapabilityCache()
      const verifier = new ProviderStartupVerifier({ registry, capabilityCache: cache })

      const input = makeSetupInput({ apiKey: 'sk-secret-key-should-not-leak' })
      const result = await verifier.validateSetup(input)

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.severity).toBe('warning')
        expect(result.code).toBe('probe_failed')
        // Must NOT contain raw apiKey
        expect(result.reason).not.toContain('secret-key-should-not-leak')
        expect(result.reason).not.toContain('sk-')
        // Must be a stable generic message
        expect(result.reason).toBe('Provider setup validation failed before completion.')
      }
    })

    it('preserves explicit providerInput.model', async () => {
      const caps: RuntimeModelCapabilities = {
        ...DEFAULT_CAPABILITIES,
        model: {
          requested: 'my-explicit-model',
          resolvedApiName: 'my-explicit-model',
          source: 'manual',
        },
      }
      const adapter = makeFakeAdapter({
        validateSetupResult: { ok: true, capabilities: caps },
      })
      const registry = new RuntimeAdapterRegistry([adapter])
      const cache = new RuntimeCapabilityCache()
      const verifier = new ProviderStartupVerifier({ registry, capabilityCache: cache })

      const input = makeSetupInput({ model: 'my-explicit-model' })
      const result = await verifier.validateSetup(input)

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.capabilities.model.requested).toBe('my-explicit-model')
        expect(result.capabilities.model.resolvedApiName).toBe('my-explicit-model')
      }
    })

    it('does not mutate input object', async () => {
      const adapter = makeFakeAdapter({
        validateSetupResult: { ok: true, capabilities: DEFAULT_CAPABILITIES },
      })
      const registry = new RuntimeAdapterRegistry([adapter])
      const cache = new RuntimeCapabilityCache()
      const verifier = new ProviderStartupVerifier({ registry, capabilityCache: cache })

      const input = makeSetupInput({
        model: 'preserve-this',
        baseUrl: 'https://api.test.com/v1',
        apiKey: 'secret-key',
      })

      const inputBefore = JSON.parse(JSON.stringify(input))
      await verifier.validateSetup(input)

      expect(input).toEqual(inputBefore)
      expect(input.providerInput.model).toBe('preserve-this')
      expect(input.providerInput.baseUrl).toBe('https://api.test.com/v1')
      expect(input.providerInput.apiKey).toBe('secret-key')
    })
  })

  // ── verifyStartup ────────────────────────────────────────────────────

  describe('verifyStartup', () => {
    it('calls adapter.verifyStartup once', async () => {
      const callTracker = { count: 0 }
      const adapter = makeFakeAdapter({ verifyStartupCalls: callTracker })
      const registry = new RuntimeAdapterRegistry([adapter])
      const cache = new RuntimeCapabilityCache()
      const verifier = new ProviderStartupVerifier({ registry, capabilityCache: cache })

      const input: RuntimeStartupInput = {
        ...makeSetupInput({}),
      }
      await verifier.verifyStartup(input)

      expect(callTracker.count).toBe(1)
    })

    it('does not call adapter.validateSetup', async () => {
      const validateCalls = { count: 0 }
      const adapter = makeFakeAdapter({ validateSetupCalls: validateCalls })
      const registry = new RuntimeAdapterRegistry([adapter])
      const cache = new RuntimeCapabilityCache()
      const verifier = new ProviderStartupVerifier({ registry, capabilityCache: cache })

      const input: RuntimeStartupInput = { ...makeSetupInput({}) }
      await verifier.verifyStartup(input)

      expect(validateCalls.count).toBe(0)
    })

    it('does not call adapter.resolveCapabilities', async () => {
      const resolveCalls = { count: 0 }
      const adapter = makeFakeAdapter({ resolveCapabilitiesCalls: resolveCalls })
      const registry = new RuntimeAdapterRegistry([adapter])
      const cache = new RuntimeCapabilityCache()
      const verifier = new ProviderStartupVerifier({ registry, capabilityCache: cache })

      const input: RuntimeStartupInput = { ...makeSetupInput({}) }
      await verifier.verifyStartup(input)

      expect(resolveCalls.count).toBe(0)
    })

    it('passes cachedCapabilities on cache hit without mutating original input', async () => {
      const receivedInput = { value: null as RuntimeStartupInput | null }
      const adapter = makeFakeAdapter({
        verifyStartupResult: { ok: true },
        verifyStartupReceivedInput: receivedInput,
      })
      const registry = new RuntimeAdapterRegistry([adapter])
      const cache = new RuntimeCapabilityCache()
      const verifier = new ProviderStartupVerifier({ registry, capabilityCache: cache })

      // Pre-populate cache
      const { resolveRuntimeCapabilityCacheKey } = await import('../RuntimeCapabilityResolver.js')
      const input = makeSetupInput({})
      const cacheKey = resolveRuntimeCapabilityCacheKey({
        routeId: input.routeId,
        providerInput: {
          baseUrl: input.providerInput.baseUrl,
          model: input.providerInput.model,
          apiKey: input.providerInput.apiKey,
        },
      })
      const preCachedCaps: RuntimeModelCapabilities = {
        ...DEFAULT_CAPABILITIES,
        providerId: 'pre-cached',
      }
      cache.set(cacheKey, preCachedCaps)

      // Original input should NOT have cachedCapabilities
      const startupInput: RuntimeStartupInput = { ...input }
      expect(startupInput.cachedCapabilities).toBeUndefined()

      await verifier.verifyStartup(startupInput)

      // Adapter should have received cachedCapabilities
      expect(receivedInput.value).not.toBeNull()
      expect(receivedInput.value!.cachedCapabilities).toBeDefined()
      expect(receivedInput.value!.cachedCapabilities!.providerId).toBe('pre-cached')

      // Original input must NOT be mutated
      expect(startupInput.cachedCapabilities).toBeUndefined()
    })

    it('caches ok result when capabilities are returned', async () => {
      const caps: RuntimeModelCapabilities = {
        ...DEFAULT_CAPABILITIES,
        providerId: 'startup-verified',
      }
      const adapter = makeFakeAdapter({
        verifyStartupResult: { ok: true, capabilities: caps },
      })
      const registry = new RuntimeAdapterRegistry([adapter])
      const cache = new RuntimeCapabilityCache()
      const verifier = new ProviderStartupVerifier({ registry, capabilityCache: cache })

      const input: RuntimeStartupInput = { ...makeSetupInput({}) }
      const result = await verifier.verifyStartup(input)

      expect(result.ok).toBe(true)

      const { resolveRuntimeCapabilityCacheKey } = await import('../RuntimeCapabilityResolver.js')
      const cacheKey = resolveRuntimeCapabilityCacheKey({
        routeId: input.routeId,
        providerInput: {
          baseUrl: input.providerInput.baseUrl,
          model: input.providerInput.model,
          apiKey: input.providerInput.apiKey,
        },
      })
      const cached = cache.get(cacheKey)
      expect(cached).not.toBeNull()
      expect(cached!.providerId).toBe('startup-verified')
    })

    it('does not overwrite cache when ok result has no capabilities', async () => {
      const preCachedCaps: RuntimeModelCapabilities = {
        ...DEFAULT_CAPABILITIES,
        providerId: 'original-cache',
      }
      const adapter = makeFakeAdapter({
        verifyStartupResult: { ok: true }, // no capabilities
      })
      const registry = new RuntimeAdapterRegistry([adapter])
      const cache = new RuntimeCapabilityCache()
      const verifier = new ProviderStartupVerifier({ registry, capabilityCache: cache })

      const input = makeSetupInput({})

      // Pre-populate cache
      const { resolveRuntimeCapabilityCacheKey } = await import('../RuntimeCapabilityResolver.js')
      const cacheKey = resolveRuntimeCapabilityCacheKey({
        routeId: input.routeId,
        providerInput: {
          baseUrl: input.providerInput.baseUrl,
          model: input.providerInput.model,
          apiKey: input.providerInput.apiKey,
        },
      })
      cache.set(cacheKey, preCachedCaps)

      const startupInput: RuntimeStartupInput = { ...input }
      await verifier.verifyStartup(startupInput)

      // Cache must still have the original entry
      const cached = cache.get(cacheKey)
      expect(cached).not.toBeNull()
      expect(cached!.providerId).toBe('original-cache')
    })

    it('returns warning failure without throwing', async () => {
      const adapter = makeFakeAdapter({
        verifyStartupResult: {
          ok: false,
          severity: 'warning',
          code: 'model_not_found',
          reason: 'Model not found in provider catalog',
        },
      })
      const registry = new RuntimeAdapterRegistry([adapter])
      const cache = new RuntimeCapabilityCache()
      const verifier = new ProviderStartupVerifier({ registry, capabilityCache: cache })

      const input: RuntimeStartupInput = { ...makeSetupInput({}) }
      const result = await verifier.verifyStartup(input)

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.severity).toBe('warning')
        expect(result.code).toBe('model_not_found')
      }
    })

    it('returns fatal failure without throwing', async () => {
      const adapter = makeFakeAdapter({
        verifyStartupResult: {
          ok: false,
          severity: 'fatal',
          code: 'invalid_api_key',
          reason: 'API key is permanently invalid',
        },
      })
      const registry = new RuntimeAdapterRegistry([adapter])
      const cache = new RuntimeCapabilityCache()
      const verifier = new ProviderStartupVerifier({ registry, capabilityCache: cache })

      const input: RuntimeStartupInput = { ...makeSetupInput({}) }
      const result = await verifier.verifyStartup(input)

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.severity).toBe('fatal')
        expect(result.code).toBe('invalid_api_key')
      }
    })

    it('catches thrown errors and returns warning probe_failed without leaking raw apiKey', async () => {
      const adapter = makeFakeAdapter({ verifyStartupThrows: true })
      const registry = new RuntimeAdapterRegistry([adapter])
      const cache = new RuntimeCapabilityCache()
      const verifier = new ProviderStartupVerifier({ registry, capabilityCache: cache })

      const input: RuntimeStartupInput = {
        ...makeSetupInput({ apiKey: 'sk-secret-should-not-appear' }),
      }
      const result = await verifier.verifyStartup(input)

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.severity).toBe('warning')
        expect(result.code).toBe('probe_failed')
        // Must NOT contain raw apiKey
        expect(result.reason).not.toContain('secret-should-not-appear')
        expect(result.reason).not.toContain('sk-')
        expect(result.reason).toBe('Provider startup verification failed before completion.')
      }
    })

    it('different apiKeys do not share cached capabilities', async () => {
      const caps1: RuntimeModelCapabilities = {
        ...DEFAULT_CAPABILITIES,
        providerId: 'user-alpha',
      }
      const caps2: RuntimeModelCapabilities = {
        ...DEFAULT_CAPABILITIES,
        providerId: 'user-beta',
      }

      let callCount = 0
      const adapter: RuntimeProviderAdapter = {
        id: 'fake-adapter' as any,
        label: 'Fake Adapter',
        supportsRoute: () => true,
        validateSetup: async () => {
          callCount++
          return callCount === 1
            ? { ok: true, capabilities: caps1 }
            : { ok: true, capabilities: caps2 }
        },
        verifyStartup: async () => {
          callCount++
          return callCount === 1
            ? { ok: true, capabilities: caps1 }
            : { ok: true, capabilities: caps2 }
        },
        resolveCapabilities: async () => DEFAULT_CAPABILITIES,
      }

      const registry = new RuntimeAdapterRegistry([adapter])
      const cache = new RuntimeCapabilityCache()
      const verifier = new ProviderStartupVerifier({ registry, capabilityCache: cache })

      // First user
      const input1 = makeSetupInput({ apiKey: 'key-alpha-111' })
      const result1 = await verifier.validateSetup(input1)
      expect(result1.ok).toBe(true)
      if (result1.ok) expect(result1.capabilities.providerId).toBe('user-alpha')

      // Second user — different apiKey → should not hit first user's cache
      callCount = 1
      const input2 = makeSetupInput({ apiKey: 'key-beta-222' })
      const result2 = await verifier.validateSetup(input2)
      expect(result2.ok).toBe(true)
      if (result2.ok) expect(result2.capabilities.providerId).toBe('user-beta')
    })

    it('normalized baseUrl and full endpoint baseUrl share cache', async () => {
      const callTracker = { count: 0 }
      const adapter = makeFakeAdapter({
        validateSetupCalls: callTracker,
      })
      const registry = new RuntimeAdapterRegistry([adapter])
      const cache = new RuntimeCapabilityCache()
      const verifier = new ProviderStartupVerifier({ registry, capabilityCache: cache })

      // Input with endpoint suffix (will be normalized)
      const inputWithSuffix = makeSetupInput({
        baseUrl: 'https://api.test.com/v1/chat/completions',
      })
      await verifier.validateSetup(inputWithSuffix)
      expect(callTracker.count).toBe(1)

      // Input with the normalized base URL — should hit cache
      const inputNormalized = makeSetupInput({
        baseUrl: 'https://api.test.com/v1',
      })
      // We need a fresh adapter with a separate call tracker to prove the second
      // call used cache. Since cache hit doesn't call the adapter, we check that
      // the cache has the entry.
      const { resolveRuntimeCapabilityCacheKey } = await import('../RuntimeCapabilityResolver.js')
      const cacheKey = resolveRuntimeCapabilityCacheKey({
        routeId: inputNormalized.routeId,
        providerInput: {
          baseUrl: inputNormalized.providerInput.baseUrl,
          model: inputNormalized.providerInput.model,
          apiKey: inputNormalized.providerInput.apiKey,
        },
      })
      const cached = cache.get(cacheKey)
      expect(cached).not.toBeNull()
    })
  })

  // ── buildDefaultProviderStartupVerifier ───────────────────────────────

  describe('buildDefaultProviderStartupVerifier', () => {
    it('returns a usable verifier', async () => {
      const verifier = buildDefaultProviderStartupVerifier()

      const input: RuntimeStartupInput = {
        ...makeSetupInput({ routeId: 'any-route', model: 'default-model' }),
      }

      // validateSetup through legacy passthrough
      const setupResult = await verifier.validateSetup(input)
      expect(setupResult.ok).toBe(true)

      // verifyStartup through legacy passthrough
      const startupResult = await verifier.verifyStartup(input)
      expect(startupResult.ok).toBe(true)
    })
  })

  // ── Cache key security ───────────────────────────────────────────────

  describe('cache key security', () => {
    it('no raw apiKey appears in cache keys', async () => {
      const adapter = makeFakeAdapter({})
      const registry = new RuntimeAdapterRegistry([adapter])
      const cache = new RuntimeCapabilityCache()
      const verifier = new ProviderStartupVerifier({ registry, capabilityCache: cache })

      const secretKey = 'sk-super-secret-xyz789'
      const input = makeSetupInput({ apiKey: secretKey })

      await verifier.validateSetup(input)

      const { resolveRuntimeCapabilityCacheKey } = await import('../RuntimeCapabilityResolver.js')
      const cacheKey = resolveRuntimeCapabilityCacheKey({
        routeId: input.routeId,
        providerInput: {
          baseUrl: input.providerInput.baseUrl,
          model: input.providerInput.model,
          apiKey: secretKey,
        },
      })

      // authFingerprint must be a hash, not the raw key
      expect(cacheKey.authFingerprint).not.toBe(secretKey)
      expect(cacheKey.authFingerprint).toMatch(/^[0-9a-f]{16}$/)

      // baseUrlHash must be a hash, not the raw URL
      expect(cacheKey.baseUrlHash).not.toBe(input.providerInput.baseUrl)
      expect(cacheKey.baseUrlHash).toMatch(/^[0-9a-f]{16}$/)

      // Cache must return a hit
      const cached = cache.get(cacheKey)
      expect(cached).not.toBeNull()
    })
  })
})
