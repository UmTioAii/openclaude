import { describe, it, expect } from 'bun:test'

import {
  RuntimeAdapterRegistry,
  buildDefaultRuntimeAdapterRegistry,
} from '../RuntimeAdapterRegistry.js'

import type { RuntimeProviderAdapter } from '../types.js'

function makeStubAdapter(
  id: string,
  matchRouteIds: string[],
): RuntimeProviderAdapter {
  return {
    id: id as any,
    label: `Stub ${id}`,
    supportsRoute: (routeId: string) => matchRouteIds.includes(routeId),
    validateSetup: async () => ({ ok: true, capabilities: {} as any }),
    verifyStartup: async () => ({ ok: true, capabilities: {} as any }),
    resolveCapabilities: async () => ({} as any),
  }
}

describe('RuntimeAdapterRegistry', () => {
  describe('resolve', () => {
    it('returns matching adapter before fallback', () => {
      const codex = makeStubAdapter('codex', ['codex-route'])
      const registry = new RuntimeAdapterRegistry([codex])

      const result = registry.resolve({
        routeId: 'codex-route',
        descriptor: { id: 'codex-route' } as any,
      })

      expect(result.id).toBe('codex')
    })

    it('falls back to legacy-passthrough for unknown route', () => {
      const registry = new RuntimeAdapterRegistry([])

      const result = registry.resolve({
        routeId: 'unknown-route',
        descriptor: { id: 'unknown-route' } as any,
      })

      expect(result.id).toBe('legacy-passthrough')
    })

    it('first matching adapter wins when multiple could match', () => {
      const first = makeStubAdapter('first', ['shared-route'])
      const second = makeStubAdapter('second', ['shared-route'])
      const registry = new RuntimeAdapterRegistry([first, second])

      const result = registry.resolve({
        routeId: 'shared-route',
        descriptor: { id: 'shared-route' } as any,
      })

      expect(result.id).toBe('first')
    })

    it('returns fallback when no adapter matches', () => {
      const codex = makeStubAdapter('codex', ['codex-route'])
      const registry = new RuntimeAdapterRegistry([codex])

      const result = registry.resolve({
        routeId: 'other-route',
        descriptor: { id: 'other-route' } as any,
      })

      expect(result.id).toBe('legacy-passthrough')
    })
  })

  describe('getAdapters', () => {
    it('returns configured adapters plus fallback', () => {
      const codex = makeStubAdapter('codex', [])
      const gemini = makeStubAdapter('gemini', [])
      const registry = new RuntimeAdapterRegistry([codex, gemini])

      const adapters = registry.getAdapters()

      expect(adapters.map((a) => a.id)).toEqual([
        'codex',
        'gemini',
        'legacy-passthrough',
      ])
    })
  })

  describe('buildDefaultRuntimeAdapterRegistry', () => {
    it('exposes Nvidia NIM adapter', () => {
      const registry = buildDefaultRuntimeAdapterRegistry()
      const adapters = registry.getAdapters()
      const ids = adapters.map((a) => a.id)
      expect(ids).toContain('nvidia-nim')
    })

    it('exposes OpenRouter adapter', () => {
      const registry = buildDefaultRuntimeAdapterRegistry()
      const adapters = registry.getAdapters()
      const ids = adapters.map((a) => a.id)
      expect(ids).toContain('openrouter')
    })

    it('exposes Codex adapter', () => {
      const registry = buildDefaultRuntimeAdapterRegistry()
      const adapters = registry.getAdapters()
      const ids = adapters.map((a) => a.id)
      expect(ids).toContain('codex')
    })

    it('exposes Gemini adapter', () => {
      const registry = buildDefaultRuntimeAdapterRegistry()
      const adapters = registry.getAdapters()
      const ids = adapters.map((a) => a.id)
      expect(ids).toContain('gemini')
    })

    it('still exposes legacy-passthrough', () => {
      const registry = buildDefaultRuntimeAdapterRegistry()
      const adapters = registry.getAdapters()
      const ids = adapters.map((a) => a.id)
      expect(ids).toContain('legacy-passthrough')
    })

    it('returns adapters in exact order: managed adapters then legacy-passthrough', () => {
      const registry = buildDefaultRuntimeAdapterRegistry()
      const adapters = registry.getAdapters()

      expect(adapters.map((a) => a.id)).toEqual([
        'codex',
        'gemini',
        'nvidia-nim',
        'openrouter',
        'legacy-passthrough',
      ])
    })

    it('returns NvidiaNimRuntimeAdapter for routeId "nvidia-nim"', () => {
      const registry = buildDefaultRuntimeAdapterRegistry()

      const result = registry.resolve({
        routeId: 'nvidia-nim',
        descriptor: { id: 'nvidia-nim' } as any,
      })

      expect(result.id).toBe('nvidia-nim')
    })

    it('returns OpenRouterRuntimeAdapter for routeId "openrouter"', () => {
      const registry = buildDefaultRuntimeAdapterRegistry()

      const result = registry.resolve({
        routeId: 'openrouter',
        descriptor: { id: 'openrouter' } as any,
      })

      expect(result.id).toBe('openrouter')
    })

    it('returns CodexRuntimeAdapter for routeId "codex"', () => {
      const registry = buildDefaultRuntimeAdapterRegistry()

      const result = registry.resolve({
        routeId: 'codex',
        descriptor: { id: 'codex' } as any,
      })

      expect(result.id).toBe('codex')
    })

    it('returns GeminiRuntimeAdapter for routeId "gemini"', () => {
      const registry = buildDefaultRuntimeAdapterRegistry()

      const result = registry.resolve({
        routeId: 'gemini',
        descriptor: { id: 'gemini' } as any,
      })

      expect(result.id).toBe('gemini')
    })

    it('returns legacy-passthrough for unknown/custom routeId', () => {
      const registry = buildDefaultRuntimeAdapterRegistry()

      const result = registry.resolve({
        routeId: 'custom-unknown-provider',
        descriptor: { id: 'custom-unknown-provider' } as any,
      })

      expect(result.id).toBe('legacy-passthrough')
    })
  })
})
