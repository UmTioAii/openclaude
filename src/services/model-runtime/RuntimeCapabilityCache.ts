import type {
  RuntimeCapabilityCacheKey,
  RuntimeModelCapabilities,
} from './types.js'

const DEFAULT_TTL_MS = 5 * 60 * 1000 // 5 minutes

type CacheEntry = {
  value: RuntimeModelCapabilities
  expiresAt: number
}

function serializeKey(key: RuntimeCapabilityCacheKey): string {
  return JSON.stringify({
    routeId: key.routeId,
    baseUrlHash: key.baseUrlHash,
    model: key.model,
    authFingerprint: key.authFingerprint,
    apiFormat: key.apiFormat ?? null,
  })
}

/**
 * In-memory, process-local capability cache.
 *
 * Keys use only hashed/fingerprinted fields — never raw apiKey, token, or baseUrl.
 * No persistence, no filesystem, no network, no logging of cache contents.
 */
export class RuntimeCapabilityCache {
  private readonly ttlMs: number
  private readonly store = new Map<string, CacheEntry>()

  constructor(ttlMs: number = DEFAULT_TTL_MS) {
    this.ttlMs = ttlMs
  }

  get(key: RuntimeCapabilityCacheKey): RuntimeModelCapabilities | null {
    const serialized = serializeKey(key)
    const entry = this.store.get(serialized)

    if (!entry) return null

    if (Date.now() >= entry.expiresAt) {
      this.store.delete(serialized)
      return null
    }

    return entry.value
  }

  set(key: RuntimeCapabilityCacheKey, value: RuntimeModelCapabilities): void {
    const serialized = serializeKey(key)
    this.store.set(serialized, {
      value,
      expiresAt: Date.now() + this.ttlMs,
    })
  }

  invalidate(key: RuntimeCapabilityCacheKey): void {
    const serialized = serializeKey(key)
    this.store.delete(serialized)
  }

  clear(): void {
    this.store.clear()
  }
}
