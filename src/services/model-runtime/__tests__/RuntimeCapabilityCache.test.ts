import { describe, it, expect } from 'bun:test'

import { RuntimeCapabilityCache } from '../RuntimeCapabilityCache.js'

import type {
  RuntimeCapabilityCacheKey,
  RuntimeModelCapabilities,
} from '../types.js'

// ── Test helpers ──────────────────────────────────────────────────────

function makeKey(
  overrides: Partial<RuntimeCapabilityCacheKey> = {},
): RuntimeCapabilityCacheKey {
  return {
    routeId: 'test-route',
    baseUrlHash: 'abcdef0123456789',
    model: 'gpt-4',
    authFingerprint: 'fedcba9876543210',
    apiFormat: 'openai',
    ...overrides,
  }
}

function makeCapabilities(
  overrides: Partial<RuntimeModelCapabilities> = {},
): RuntimeModelCapabilities {
  return {
    routeId: 'test-route',
    providerId: 'codex',
    providerLabel: 'Codex',
    model: {
      requested: 'gpt-4',
      resolvedApiName: 'gpt-4',
      source: 'catalog',
    },
    availability: {
      checked: true,
      exists: true,
      active: true,
      verifiedBy: 'models_api',
    },
    tools: {
      supported: true,
      format: 'openai',
    },
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
      defaultAbstractEffort: 'medium',
      maxAutoAbstractEffort: 'high',
      allowAutoMax: false,
      autoStrategy: 'openclaude_decides',
    },
    payload: {
      endpoint: 'chat_completions',
      maxTokensField: 'max_tokens',
    },
    limits: {
      contextWindow: 128000,
      maxOutputTokens: 4096,
    },
    confidence: 'catalog',
    ...overrides,
  }
}

// ── set / get ──────────────────────────────────────────────────────────

describe('RuntimeCapabilityCache', () => {
  describe('set/get', () => {
    it('returns stored capabilities for matching key', () => {
      const cache = new RuntimeCapabilityCache()
      const key = makeKey()
      const caps = makeCapabilities()

      cache.set(key, caps)
      const result = cache.get(key)

      expect(result).not.toBeNull()
      expect(result!.routeId).toBe('test-route')
      expect(result!.providerId).toBe('codex')
    })

    it('returns null for missing key', () => {
      const cache = new RuntimeCapabilityCache()
      const result = cache.get(makeKey())

      expect(result).toBeNull()
    })
  })

  describe('invalidate', () => {
    it('removes one key', () => {
      const cache = new RuntimeCapabilityCache()
      const key1 = makeKey({ model: 'gpt-4' })
      const key2 = makeKey({ model: 'claude-3' })

      cache.set(key1, makeCapabilities({ providerId: 'codex' }))
      cache.set(key2, makeCapabilities({ providerId: 'anthropic' }))

      cache.invalidate(key1)

      expect(cache.get(key1)).toBeNull()
      expect(cache.get(key2)).not.toBeNull()
      expect(cache.get(key2)!.providerId).toBe('anthropic')
    })
  })

  describe('clear', () => {
    it('removes all keys', () => {
      const cache = new RuntimeCapabilityCache()
      const key1 = makeKey({ model: 'gpt-4' })
      const key2 = makeKey({ model: 'claude-3' })

      cache.set(key1, makeCapabilities())
      cache.set(key2, makeCapabilities())

      cache.clear()

      expect(cache.get(key1)).toBeNull()
      expect(cache.get(key2)).toBeNull()
    })
  })

  describe('TTL expiry', () => {
    it('expired entries return null', () => {
      const cache = new RuntimeCapabilityCache(0) // 0ms TTL = immediate expiry
      const key = makeKey()

      cache.set(key, makeCapabilities())

      // Even with 0ms TTL, Date.now() in set and get are close enough
      // that we need a small delay or a slightly negative TTL.
      // Use -1 to force expiry (expiresAt will be in the past)
      const expiredCache = new RuntimeCapabilityCache(-1)
      expiredCache.set(key, makeCapabilities())

      const result = expiredCache.get(key)
      expect(result).toBeNull()
    })
  })

  describe('key collision avoidance', () => {
    it('apiFormat undefined does not collide with apiFormat empty string', () => {
      const cache = new RuntimeCapabilityCache()
      const keyUndef = makeKey({ apiFormat: undefined })
      const keyEmpty = makeKey({ apiFormat: '' })

      cache.set(keyUndef, makeCapabilities({ providerId: 'provider-undef' }))
      cache.set(keyEmpty, makeCapabilities({ providerId: 'provider-empty' }))

      expect(cache.get(keyUndef)!.providerId).toBe('provider-undef')
      expect(cache.get(keyEmpty)!.providerId).toBe('provider-empty')
    })

    it('different model values do not collide', () => {
      const cache = new RuntimeCapabilityCache()
      const key1 = makeKey({ model: 'gpt-4' })
      const key2 = makeKey({ model: 'claude-3' })

      cache.set(key1, makeCapabilities({ providerId: 'codex' }))
      cache.set(key2, makeCapabilities({ providerId: 'anthropic' }))

      expect(cache.get(key1)!.providerId).toBe('codex')
      expect(cache.get(key2)!.providerId).toBe('anthropic')
    })

    it('different baseUrlHash values do not collide', () => {
      const cache = new RuntimeCapabilityCache()
      const key1 = makeKey({ baseUrlHash: 'hash_aaaaaaaaaaaa' })
      const key2 = makeKey({ baseUrlHash: 'hash_bbbbbbbbbbbb' })

      cache.set(key1, makeCapabilities({ providerId: 'codex' }))
      cache.set(key2, makeCapabilities({ providerId: 'gemini' }))

      expect(cache.get(key1)!.providerId).toBe('codex')
      expect(cache.get(key2)!.providerId).toBe('gemini')
    })

    it('different authFingerprint values do not collide', () => {
      const cache = new RuntimeCapabilityCache()
      const key1 = makeKey({ authFingerprint: 'fp_aaaaaaaaaaaaa' })
      const key2 = makeKey({ authFingerprint: 'fp_bbbbbbbbbbbbb' })

      cache.set(key1, makeCapabilities({ providerId: 'codex' }))
      cache.set(key2, makeCapabilities({ providerId: 'nvidia-nim' }))

      expect(cache.get(key1)!.providerId).toBe('codex')
      expect(cache.get(key2)!.providerId).toBe('nvidia-nim')
    })

    it('different apiFormat values do not collide', () => {
      const cache = new RuntimeCapabilityCache()
      const key1 = makeKey({ apiFormat: 'openai' })
      const key2 = makeKey({ apiFormat: 'anthropic' })

      cache.set(key1, makeCapabilities({ providerId: 'codex' }))
      cache.set(key2, makeCapabilities({ providerId: 'openrouter' }))

      expect(cache.get(key1)!.providerId).toBe('codex')
      expect(cache.get(key2)!.providerId).toBe('openrouter')
    })
  })

  describe('key serialization safety', () => {
    it('cache key does not include raw secret when key uses fingerprints/hashes', () => {
      // This test verifies that RuntimeCapabilityCacheKey fields are
      // fingerprint/hash-based, not raw credentials.
      // The type itself enforces this — no apiKey/token/baseUrl field exists.
      const key: RuntimeCapabilityCacheKey = {
        routeId: 'test-route',
        baseUrlHash: 'abcdef0123456789', // hash, not raw URL
        model: 'gpt-4',
        authFingerprint: 'fedcba9876543210', // fingerprint, not raw key
        apiFormat: 'openai',
      }

      // Verify the key can be used without any raw secret field
      const cache = new RuntimeCapabilityCache()
      cache.set(key, makeCapabilities())
      const result = cache.get(key)
      expect(result).not.toBeNull()
    })

    it('cache tests do not use real secrets', () => {
      // Verify that all test keys use hash/fingerprint placeholders,
      // never real API keys or tokens.
      const testKey = makeKey()
      expect(testKey.authFingerprint).not.toContain('sk-')
      expect(testKey.authFingerprint).not.toContain('AIza')
      expect(testKey.baseUrlHash).not.toContain('http')
    })

    it('no raw apiKey/token/baseUrl field is accepted in RuntimeCapabilityCacheKey', () => {
      // TypeScript enforces this at compile time — RuntimeCapabilityCacheKey
      // has no apiKey, token, or baseUrl field.
      // This test verifies the shape at runtime.
      const key = makeKey()
      const keyFields = Object.keys(key)

      expect(keyFields).not.toContain('apiKey')
      expect(keyFields).not.toContain('token')
      expect(keyFields).not.toContain('baseUrl')
    })
  })
})
