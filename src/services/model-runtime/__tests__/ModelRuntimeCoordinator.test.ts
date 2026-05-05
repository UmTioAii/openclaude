// PR1 — Slice 4B1: ModelRuntimeCoordinator focused tests
// Tests cover: cache-first, cache-miss, adapter fallback, metadata fallback,
// cache key normalization, auth separation, no forbidden method calls,
// input immutability, default factory, and no raw secrets in cache keys.

import { describe, it, expect } from 'bun:test'

import { ModelRuntimeCoordinator, buildDefaultModelRuntimeCoordinator } from '../ModelRuntimeCoordinator.js'
import { RuntimeAdapterRegistry } from '../RuntimeAdapterRegistry.js'
import { RuntimeCapabilityCache } from '../RuntimeCapabilityCache.js'
import type {
  RuntimeProviderAdapter,
  RuntimeSetupInput,
  RuntimeModelCapabilities,
} from '../types.js'

// ── Fixture helpers ─────────────────────────────────────────────────────

/**
 * Build a minimal RuntimeSetupInput for testing.
 * RouteDescriptor requires `id` and `label` at minimum;
 * transportConfig is optional. `as any` is isolated here because
 * RouteDescriptor is a union type (GatewayDescriptor | VendorDescriptor)
 * and constructing a fully valid union member in tests requires many
 * irrelevant fields — we only need the fields the coordinator actually reads.
 */
function makeSetupInput(overrides: {
  routeId?: string
  providerId?: string
  baseUrl?: string
  model?: string
  apiKey?: string
  apiFormat?: string
  catalogEntry?: RuntimeSetupInput['catalogEntry']
  descriptor?: RuntimeSetupInput['descriptor']
}): RuntimeSetupInput {
  return {
    routeId: overrides.routeId ?? 'test-route',
    descriptor: overrides.descriptor ?? {
      id: overrides.routeId ?? 'test-route',
      label: 'Test Provider',
    } as any,
    catalogEntry: overrides.catalogEntry ?? null,
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

/** Build a fake adapter that returns a known capabilities object. */
function makeFakeAdapter(
  caps: Partial<RuntimeModelCapabilities>,
  options?: {
    shouldThrow?: boolean
    validateSetupCalled?: { value: boolean }
    verifyStartupCalled?: { value: boolean }
    resolveCapabilitiesCalls?: { count: number }
  },
): RuntimeProviderAdapter {
  const fullCaps: RuntimeModelCapabilities = {
    routeId: caps.routeId ?? 'test-route',
    providerId: caps.providerId ?? 'test-provider',
    providerLabel: caps.providerLabel ?? 'Test Provider',
    model: caps.model ?? {
      requested: 'test-model',
      resolvedApiName: 'test-model',
      source: 'catalog',
    },
    availability: caps.availability ?? {
      checked: true,
      exists: true,
      active: true,
      verifiedBy: 'catalog',
    },
    tools: caps.tools ?? { supported: true, format: 'openai' },
    thinking: caps.thinking ?? {
      supported: false,
      adaptiveSupported: false,
      mode: 'none',
      source: 'fallback',
    },
    effort: caps.effort ?? {
      supported: false,
      mode: 'none',
      nativeValues: [],
      defaultAbstractEffort: 'none',
      maxAutoAbstractEffort: 'none',
      allowAutoMax: false,
      autoStrategy: 'openclaude_decides',
      source: 'fallback',
    },
    payload: caps.payload ?? {
      endpoint: 'chat_completions',
      maxTokensField: 'max_tokens',
    },
    limits: caps.limits ?? {},
    confidence: caps.confidence ?? 'catalog',
  }

  return {
    id: 'fake-adapter' as any,
    label: 'Fake Adapter',
    supportsRoute: () => true,
    validateSetup: async () => {
      if (options?.validateSetupCalled) options.validateSetupCalled.value = true
      return { ok: true, capabilities: fullCaps }
    },
    verifyStartup: async () => {
      if (options?.verifyStartupCalled) options.verifyStartupCalled.value = true
      return { ok: true, capabilities: fullCaps }
    },
    resolveCapabilities: async () => {
      if (options?.resolveCapabilitiesCalls) options.resolveCapabilitiesCalls.count++
      if (options?.shouldThrow) {
        throw new Error('adapter failed')
      }
      return fullCaps
    },
  }
}

/** Make a fake adapter that only supports a specific route. */
function makeRouteSpecificAdapter(
  routeId: string,
  caps: Partial<RuntimeModelCapabilities>,
  options?: { shouldThrow?: boolean; resolveCapabilitiesCalls?: { count: number } },
): RuntimeProviderAdapter {
  const adapter = makeFakeAdapter(caps, options)
  adapter.supportsRoute = (id: string) => id === routeId
  return adapter
}

// ── Tests ───────────────────────────────────────────────────────────────

describe('ModelRuntimeCoordinator', () => {
  describe('resolveCapabilities', () => {
    it('returns cached capabilities without calling adapter.resolveCapabilities', async () => {
      const callTracker = { count: 0 }
      const adapter = makeFakeAdapter({}, { resolveCapabilitiesCalls: callTracker })
      const registry = new RuntimeAdapterRegistry([adapter])
      const cache = new RuntimeCapabilityCache()
      const coordinator = new ModelRuntimeCoordinator({ registry, capabilityCache: cache })

      const input = makeSetupInput({})

      // First call: cache miss → adapter is called
      await coordinator.resolveCapabilities(input)
      expect(callTracker.count).toBe(1)

      // Second call: cache hit → adapter is NOT called again
      const result = await coordinator.resolveCapabilities(input)
      expect(callTracker.count).toBe(1) // still 1
      expect(result.model.requested).toBe('test-model')
    })

    it('cache miss calls adapter.resolveCapabilities once', async () => {
      const callTracker = { count: 0 }
      const adapter = makeFakeAdapter({}, { resolveCapabilitiesCalls: callTracker })
      const registry = new RuntimeAdapterRegistry([adapter])
      const cache = new RuntimeCapabilityCache()
      const coordinator = new ModelRuntimeCoordinator({ registry, capabilityCache: cache })

      const input = makeSetupInput({})
      await coordinator.resolveCapabilities(input)

      expect(callTracker.count).toBe(1)
    })

    it('caches adapter-resolved capabilities', async () => {
      const adapter = makeFakeAdapter({
        providerId: 'cached-provider',
        confidence: 'catalog',
      })
      const registry = new RuntimeAdapterRegistry([adapter])
      const cache = new RuntimeCapabilityCache()
      const coordinator = new ModelRuntimeCoordinator({ registry, capabilityCache: cache })

      const input = makeSetupInput({})
      const result = await coordinator.resolveCapabilities(input)

      // Second call should return the same cached result
      const result2 = await coordinator.resolveCapabilities(input)
      expect(result2.providerId).toBe('cached-provider')
      expect(result2.confidence).toBe('catalog')
      expect(result).toEqual(result2)
    })

    it('resolves fallback legacy adapter through registry for unknown route', async () => {
      // Empty registry → legacy-passthrough fallback
      const registry = new RuntimeAdapterRegistry([])
      const cache = new RuntimeCapabilityCache()
      const coordinator = new ModelRuntimeCoordinator({ registry, capabilityCache: cache })

      const input = makeSetupInput({
        routeId: 'totally-unknown-route',
        providerId: 'unknown-provider',
        model: 'some-model',
      })
      const result = await coordinator.resolveCapabilities(input)

      // Legacy passthrough returns legacy_bridge confidence
      expect(result.confidence).toBe('legacy_bridge')
      expect(result.model.requested).toBe('some-model')
    })

    it('falls back to metadata capabilities if adapter.resolveCapabilities throws', async () => {
      const adapter = makeFakeAdapter(
        { providerId: 'should-not-appear' },
        { shouldThrow: true },
      )
      const registry = new RuntimeAdapterRegistry([adapter])
      const cache = new RuntimeCapabilityCache()
      const coordinator = new ModelRuntimeCoordinator({ registry, capabilityCache: cache })

      const input = makeSetupInput({
        routeId: 'failing-route',
        model: 'explicit-model',
      })
      const result = await coordinator.resolveCapabilities(input)

      // Falls back to metadata resolver → confidence depends on input context.
      // With an explicit model but no catalog, confidence is 'manual'.
      expect(result.confidence).toBe('manual')
    })

    it('fallback metadata result preserves explicit providerInput.model', async () => {
      const adapter = makeFakeAdapter(
        {},
        { shouldThrow: true },
      )
      const registry = new RuntimeAdapterRegistry([adapter])
      const cache = new RuntimeCapabilityCache()
      const coordinator = new ModelRuntimeCoordinator({ registry, capabilityCache: cache })

      const input = makeSetupInput({
        model: 'my-custom-model',
      })
      const result = await coordinator.resolveCapabilities(input)

      // Metadata resolver preserves explicit model → source is 'manual'
      expect(result.model.requested).toBe('my-custom-model')
      expect(result.model.resolvedApiName).toBe('my-custom-model')
      expect(result.model.source).toBe('manual')
    })

    it('cache key uses normalized baseUrl, so full endpoint baseUrl and normalized baseUrl share cache', async () => {
      const callTracker = { count: 0 }
      const adapter = makeFakeAdapter({}, { resolveCapabilitiesCalls: callTracker })
      const registry = new RuntimeAdapterRegistry([adapter])
      const cache = new RuntimeCapabilityCache()
      const coordinator = new ModelRuntimeCoordinator({ registry, capabilityCache: cache })

      // Input with accidental endpoint suffix (will normalize)
      const inputWithSuffix = makeSetupInput({
        baseUrl: 'https://api.test.com/v1/chat/completions',
      })
      await coordinator.resolveCapabilities(inputWithSuffix)
      expect(callTracker.count).toBe(1)

      // Input with the normalized base URL (no suffix)
      const inputNormalized = makeSetupInput({
        baseUrl: 'https://api.test.com/v1',
      })
      const result = await coordinator.resolveCapabilities(inputNormalized)

      // Cache hit — adapter not called again
      expect(callTracker.count).toBe(1)
      expect(result).toBeDefined()
    })

    it('different apiKey values do not share cache', async () => {
      const callTracker = { count: 0 }
      const adapter = makeFakeAdapter({}, { resolveCapabilitiesCalls: callTracker })
      const registry = new RuntimeAdapterRegistry([adapter])
      const cache = new RuntimeCapabilityCache()
      const coordinator = new ModelRuntimeCoordinator({ registry, capabilityCache: cache })

      const input1 = makeSetupInput({ apiKey: 'key-alpha-111' })
      await coordinator.resolveCapabilities(input1)
      expect(callTracker.count).toBe(1)

      const input2 = makeSetupInput({ apiKey: 'key-beta-222' })
      await coordinator.resolveCapabilities(input2)
      expect(callTracker.count).toBe(2) // different auth → cache miss → adapter called
    })

    it('missing apiKey uses stable no-auth cache behavior', async () => {
      const callTracker = { count: 0 }
      const adapter = makeFakeAdapter({}, { resolveCapabilitiesCalls: callTracker })
      const registry = new RuntimeAdapterRegistry([adapter])
      const cache = new RuntimeCapabilityCache()
      const coordinator = new ModelRuntimeCoordinator({ registry, capabilityCache: cache })

      // Two calls with no apiKey → should share cache (both get "no-auth" fingerprint)
      const input1 = makeSetupInput({})
      // ensure no apiKey
      delete input1.providerInput.apiKey
      await coordinator.resolveCapabilities(input1)
      expect(callTracker.count).toBe(1)

      const input2 = makeSetupInput({})
      delete input2.providerInput.apiKey
      await coordinator.resolveCapabilities(input2)
      expect(callTracker.count).toBe(1) // cache hit — same no-auth fingerprint
    })

    it('does not call validateSetup', async () => {
      const validateCalled = { value: false }
      const adapter = makeFakeAdapter({}, { validateSetupCalled: validateCalled })
      const registry = new RuntimeAdapterRegistry([adapter])
      const cache = new RuntimeCapabilityCache()
      const coordinator = new ModelRuntimeCoordinator({ registry, capabilityCache: cache })

      const input = makeSetupInput({})
      await coordinator.resolveCapabilities(input)

      expect(validateCalled.value).toBe(false)
    })

    it('does not call verifyStartup', async () => {
      const verifyCalled = { value: false }
      const adapter = makeFakeAdapter({}, { verifyStartupCalled: verifyCalled })
      const registry = new RuntimeAdapterRegistry([adapter])
      const cache = new RuntimeCapabilityCache()
      const coordinator = new ModelRuntimeCoordinator({ registry, capabilityCache: cache })

      const input = makeSetupInput({})
      await coordinator.resolveCapabilities(input)

      expect(verifyCalled.value).toBe(false)
    })

    it('does not mutate input object', async () => {
      const adapter = makeFakeAdapter({})
      const registry = new RuntimeAdapterRegistry([adapter])
      const cache = new RuntimeCapabilityCache()
      const coordinator = new ModelRuntimeCoordinator({ registry, capabilityCache: cache })

      const input = makeSetupInput({
        model: 'preserve-this',
        baseUrl: 'https://api.test.com/v1',
        apiKey: 'secret-key',
      })

      // Deep-clone input before calling
      const inputBefore = JSON.parse(JSON.stringify(input))

      await coordinator.resolveCapabilities(input)

      // Input must be unchanged
      expect(input).toEqual(inputBefore)
      expect(input.providerInput.model).toBe('preserve-this')
      expect(input.providerInput.baseUrl).toBe('https://api.test.com/v1')
      expect(input.providerInput.apiKey).toBe('secret-key')
    })

    it('returns deterministic results for the same input', async () => {
      const adapter = makeFakeAdapter({ providerId: 'deterministic-p' })
      const registry = new RuntimeAdapterRegistry([adapter])
      const cache = new RuntimeCapabilityCache()
      const coordinator = new ModelRuntimeCoordinator({ registry, capabilityCache: cache })

      const input = makeSetupInput({})

      // First call populates cache
      const result1 = await coordinator.resolveCapabilities(input)
      // Second call reads from cache
      const result2 = await coordinator.resolveCapabilities(input)

      expect(result1).toEqual(result2)
    })
  })

  describe('buildDefaultModelRuntimeCoordinator', () => {
    it('returns a usable coordinator', async () => {
      const coordinator = buildDefaultModelRuntimeCoordinator()

      // Should resolve capabilities via legacy-passthrough fallback
      const input = makeSetupInput({
        routeId: 'any-route',
        model: 'default-test-model',
      })
      const result = await coordinator.resolveCapabilities(input)

      expect(result).toBeDefined()
      expect(result.model.requested).toBe('default-test-model')
      expect(result.confidence).toBe('legacy_bridge')
    })
  })

  describe('cache key security', () => {
    it('no raw apiKey appears in serialized test cache keys or test assertions', async () => {
      const adapter = makeFakeAdapter({})
      const registry = new RuntimeAdapterRegistry([adapter])
      const cache = new RuntimeCapabilityCache()
      const coordinator = new ModelRuntimeCoordinator({ registry, capabilityCache: cache })

      const secretKey = 'sk-super-secret-abc123xyz'
      const input = makeSetupInput({ apiKey: secretKey })

      await coordinator.resolveCapabilities(input)

      // Inspect the internal cache store by iterating known keys.
      // We'll use the cache's get with a manually constructed key to verify
      // that the raw apiKey does not appear in any serialized key.
      // The RuntimeCapabilityCache serializes keys via JSON.stringify of
      // { routeId, baseUrlHash, model, authFingerprint, apiFormat }.
      // We verify by checking that the authFingerprint is a hash, not the raw key.

      // Import the resolver to build the expected key structure
      const { resolveRuntimeCapabilityCacheKey } = await import('../RuntimeCapabilityResolver.js')
      const cacheKey = resolveRuntimeCapabilityCacheKey({
        routeId: input.routeId,
        providerInput: {
          baseUrl: input.providerInput.baseUrl,
          model: input.providerInput.model,
          apiKey: secretKey,
        },
      })

      // authFingerprint must NOT be the raw key
      expect(cacheKey.authFingerprint).not.toBe(secretKey)
      // authFingerprint must be a hex hash (16 chars from SHA-256)
      expect(cacheKey.authFingerprint).toMatch(/^[0-9a-f]{16}$/)

      // baseUrlHash must NOT be the raw URL
      expect(cacheKey.baseUrlHash).not.toBe(input.providerInput.baseUrl)
      expect(cacheKey.baseUrlHash).toMatch(/^[0-9a-f]{16}$/)

      // The cache must return a hit for this key
      const cached = cache.get(cacheKey)
      expect(cached).not.toBeNull()
    })
  })
})
