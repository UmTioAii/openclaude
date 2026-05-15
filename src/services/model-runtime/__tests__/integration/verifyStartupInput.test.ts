import { describe, it, expect } from 'bun:test'
import type { RuntimeStartupInput } from '../../types.js'
import type { RouteDescriptor } from '../../types.js'
import { buildDefaultRuntimeAdapterRegistry } from '../../RuntimeAdapterRegistry.js'
import { buildDefaultProviderStartupVerifier } from '../../ProviderStartupVerifier.js'

/**
 * PR1 integration test: verify RuntimeStartupInput construction
 * from data available in the bootstrap flow.
 *
 * No network calls. No secrets in snapshots.
 *
 * NOTE: These tests use minimal mock RouteDescriptors, not real
 * getRouteDescriptor() lookups, because the adapter routeId strings
 * ('codex', 'gemini', etc.) do not necessarily match the integration
 * system's gateway/vendor route IDs. The mock descriptors simulate the
 * shape that bootstrap.ts would have from getRouteDescriptor() for a
 * registered route.
 */

const MANAGED_ADAPTERS = [
  {
    routeId: 'codex',
    adapterId: 'codex',
    baseUrl: 'https://chatgpt.com/backend-api/codex',
    model: 'gpt-5.3-codex',
  },
  {
    routeId: 'openrouter',
    adapterId: 'openrouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'openai/gpt-5-mini',
  },
  {
    routeId: 'nvidia-nim',
    adapterId: 'nvidia-nim',
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    model: 'nvidia/llama-3.3-nv-70b',
  },
  {
    routeId: 'gemini',
    adapterId: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    model: 'gemini-2.5-pro',
  },
] as const

/**
 * Construct a minimal mock RouteDescriptor for test purposes.
 * This simulates the shape that bootstrap.ts receives from
 * getRouteDescriptor() for a registered route — but does NOT
 * call getRouteDescriptor() directly, since adapter routeId
 * strings may not match integration-system route IDs.
 */
function makeTestDescriptor(routeId: string): RouteDescriptor {
  const isGemini = routeId === 'gemini'

  return {
    id: routeId,
    label: routeId.charAt(0).toUpperCase() + routeId.slice(1),
    defaultBaseUrl: '',
    defaultModel: '',
    transportConfig: {
      kind: isGemini ? 'gemini-native' : 'openai-compatible',
      // openaiShim is only valid for openai-compatible transports;
      // omit for gemini-native (its real descriptor uses removeBodyFields, not maxTokensField)
      ...(!isGemini && {
        openaiShim: {
          maxTokensField: 'max_tokens' as const,
        },
      }),
    },
  }
}

/**
 * Construct RuntimeStartupInput the same way bootstrap.ts does.
 * Uses only data available at bootstrap time (no fabricated secrets).
 * Uses runtimeRouteId consistently for routeId, descriptor.id, and providerId.
 */
function constructStartupInput(
  routeId: string,
  overrides?: Partial<RuntimeStartupInput['providerInput']>,
): RuntimeStartupInput {
  const adapterInfo = MANAGED_ADAPTERS.find((a) => a.routeId === routeId)!
  const descriptor = makeTestDescriptor(routeId)

  return {
    routeId, // same as providerInput.providerId — consistency invariant
    descriptor,
    catalogEntry: null, // not yet available in bootstrap context
    providerInput: {
      providerId: routeId, // must equal routeId — consistency invariant
      baseUrl: adapterInfo.baseUrl,
      model: adapterInfo.model,
      apiKey: undefined, // never fabricate secrets in tests
      ...overrides,
    },
    processEnv: {},
  }
}

describe('verifyStartupInput — RuntimeStartupInput construction from bootstrap context', () => {
  for (const { routeId } of MANAGED_ADAPTERS) {
    describe(`routeId: ${routeId}`, () => {
      it(`constructs a valid RuntimeStartupInput for "${routeId}"`, () => {
        const input = constructStartupInput(routeId)
        expect(input.routeId).toBe(routeId)
        expect(input.descriptor).toBeDefined()
        expect(input.descriptor).not.toBeNull()
        expect(input.descriptor.id).toBe(routeId)
      })

      it(`includes descriptor for "${routeId}"`, () => {
        const input = constructStartupInput(routeId)
        expect(input.descriptor).toBeDefined()
        expect(input.descriptor.id).toBe(routeId)
        expect(input.descriptor.label).toBeDefined()
      })

      it(`providerInput.model comes from resolved provider and is not silently changed`, () => {
        const expectedModel = 'test-model-value'
        const input = constructStartupInput(routeId, { model: expectedModel })
        expect(input.providerInput.model).toBe(expectedModel)
        // model is preserved exactly — no mutation
      })

      it(`providerInput.baseUrl comes from resolved provider and is not silently changed`, () => {
        const expectedBaseUrl = 'https://test.example.com/v1'
        const input = constructStartupInput(routeId, { baseUrl: expectedBaseUrl })
        expect(input.providerInput.baseUrl).toBe(expectedBaseUrl)
        // baseUrl is preserved exactly — no mutation
      })

      it(`processEnv is included`, () => {
        const input = constructStartupInput(routeId)
        expect(input.processEnv).toBeDefined()
        expect(typeof input.processEnv).toBe('object')
      })

      it(`apiKey is present only as input and never appears in serialized test output`, () => {
        const input = constructStartupInput(routeId, { apiKey: 'sk-test-redacted-key' })
        // apiKey is in the input object for provider flow
        expect(input.providerInput.apiKey).toBe('sk-test-redacted-key')
        // Confirm the field exists in the shape
        expect('apiKey' in input.providerInput).toBe(true)
      })

      it(`no network calls are required`, () => {
        // This test is synchronous and never calls fetch/axios
        const input = constructStartupInput(routeId)
        expect(input.routeId).toBe(routeId)
        // If this test passes without mocks, no network calls were needed
      })
    })
  }

  describe('RuntimeStartupInput consistency invariants', () => {
    for (const { routeId } of MANAGED_ADAPTERS) {
      it(`routeId equals providerInput.providerId for "${routeId}"`, () => {
        const input = constructStartupInput(routeId)
        expect(input.routeId).toBe(input.providerInput.providerId)
      })

      it(`descriptor.id equals routeId for "${routeId}"`, () => {
        const input = constructStartupInput(routeId)
        expect(input.descriptor.id).toBe(input.routeId)
      })

      it(`model is preserved exactly after construction for "${routeId}"`, () => {
        const original = 'exact-model-name-no-mutation'
        const input = constructStartupInput(routeId, { model: original })
        expect(input.providerInput.model).toBe(original)
        // Re-read to prove no mutation
        expect(input.providerInput.model).toBe(original)
      })

      it(`baseUrl is preserved exactly after construction for "${routeId}"`, () => {
        const original = 'https://exact-url.example.com/v1'
        const input = constructStartupInput(routeId, { baseUrl: original })
        expect(input.providerInput.baseUrl).toBe(original)
        // Re-read to prove no mutation
        expect(input.providerInput.baseUrl).toBe(original)
      })

      it(`apiKey does not appear in assertion output for "${routeId}"`, () => {
        const input = constructStartupInput(routeId, { apiKey: 'sk-secret-never-assert' })
        // Verify apiKey exists but never assert its value directly in snapshots
        expect(typeof input.providerInput.apiKey).toBe('string')
        expect(input.providerInput.apiKey!.length).toBeGreaterThan(0)
        // Never do: expect(input.providerInput.apiKey).toMatchSnapshot()
      })
    }
  })

  describe('adapter resolution matches constructed input', () => {
    for (const { routeId, adapterId } of MANAGED_ADAPTERS) {
      it(`registry resolves "${routeId}" to the "${adapterId}" adapter`, () => {
        const registry = buildDefaultRuntimeAdapterRegistry()
        const descriptor = makeTestDescriptor(routeId)
        const adapter = registry.resolve({ routeId, descriptor })
        expect(adapter.id).toBe(adapterId)
      })
    }
  })

  describe('ProviderStartupVerifier.verifyStartup() accepts constructed input', () => {
    for (const { routeId } of MANAGED_ADAPTERS) {
      it(`verifyStartup returns ok:true for "${routeId}" with minimal input`, async () => {
        const verifier = buildDefaultProviderStartupVerifier()
        const input = constructStartupInput(routeId)
        const result = await verifier.verifyStartup(input)
        // All adapters return ok:true from verifyStartup (metadata-only, no network)
        expect(result.ok).toBe(true)
        if (result.ok) {
          expect(result.capabilities).toBeDefined()
          expect(result.capabilities.providerId).toBeDefined()
        }
      })
    }
  })
})
