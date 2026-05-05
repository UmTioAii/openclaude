// PR1 — Managed Adapter Runtime: ProviderStartupVerifier
// Narrow orchestration layer for setup validation and startup verification.
// No network calls. No filesystem access. No environment mutation. No logging.
// No bridge imports. No services/api imports. No command/bootstrap imports.
// No /provider wiring. No request sending. No provider-specific behavior.
// No real provider adapter implementation.

import type {
  RuntimeSetupInput,
  RuntimeSetupResult,
  RuntimeStartupInput,
  RuntimeModelCapabilities,
  StartupVerificationResult,
} from './types.js'

import { RuntimeAdapterRegistry, buildDefaultRuntimeAdapterRegistry } from './RuntimeAdapterRegistry.js'
import { RuntimeCapabilityCache } from './RuntimeCapabilityCache.js'
import { resolveRuntimeCapabilityCacheKey } from './RuntimeCapabilityResolver.js'

// ── Dependency type ─────────────────────────────────────────────────────

export type ProviderStartupVerifierDeps = {
  registry: RuntimeAdapterRegistry
  capabilityCache: RuntimeCapabilityCache
}

// ── ProviderStartupVerifier ─────────────────────────────────────────────

/**
 * Orchestrates setup validation and startup verification through adapters.
 *
 * - validateSetup(): calls adapter.validateSetup(), caches ok capabilities.
 * - verifyStartup(): calls adapter.verifyStartup(), caches ok capabilities.
 * - Never throws for normal unknown/custom provider cases.
 * - Never calls resolveCapabilities() directly.
 * - Never performs network calls or reads process.env directly.
 * - Never stores or exposes raw apiKey in cache keys or result metadata.
 */
export class ProviderStartupVerifier {
  private readonly registry: RuntimeAdapterRegistry
  private readonly capabilityCache: RuntimeCapabilityCache

  constructor(deps: ProviderStartupVerifierDeps) {
    this.registry = deps.registry
    this.capabilityCache = deps.capabilityCache
  }

  /**
   * Validate provider setup.
   *
   * Flow:
   * 1. Build safe cache key via resolveRuntimeCapabilityCacheKey().
   * 2. Resolve adapter from registry.
   * 3. Call adapter.validateSetup(input) exactly once.
   * 4. If ok: true — cache capabilities and return result.
   * 5. If ok: false — return adapter failure result as-is (do not cache).
   * 6. If adapter throws — return ok:false warning probe_failed with sanitized reason.
   */
  async validateSetup(input: RuntimeSetupInput): Promise<RuntimeSetupResult> {
    const cacheKey = resolveRuntimeCapabilityCacheKey({
      routeId: input.routeId,
      providerInput: {
        baseUrl: input.providerInput.baseUrl,
        model: input.providerInput.model,
        apiKey: input.providerInput.apiKey,
        apiFormat: input.providerInput.apiFormat,
      },
    })

    const adapter = this.registry.resolve({
      routeId: input.routeId,
      descriptor: input.descriptor,
    })

    try {
      const result = await adapter.validateSetup(input)

      if (result.ok) {
        // Cache ok capabilities
        this.capabilityCache.set(cacheKey, result.capabilities)
        return result
      }

      // Do not cache failures — return as-is
      return result
    } catch {
      // Do not expose raw error text (may contain secrets)
      return {
        ok: false,
        severity: 'warning',
        code: 'probe_failed',
        reason: 'Provider setup validation failed before completion.',
      }
    }
  }

  /**
   * Verify provider startup.
   *
   * Flow:
   * 1. Build safe cache key via resolveRuntimeCapabilityCacheKey().
   * 2. If cached capabilities exist, pass them to adapter via input copy.
   * 3. Resolve adapter from registry.
   * 4. Call adapter.verifyStartup() exactly once.
   * 5. If ok: true with capabilities — cache and return.
   * 6. If ok: true without capabilities — preserve existing cache, return.
   * 7. If ok: false with warning — return warning (do not throw, do not cache).
   * 8. If ok: false with fatal — return fatal (do not throw, do not cache).
   * 9. If adapter throws — return ok:false warning probe_failed with sanitized reason.
   */
  async verifyStartup(input: RuntimeStartupInput): Promise<StartupVerificationResult> {
    const cacheKey = resolveRuntimeCapabilityCacheKey({
      routeId: input.routeId,
      providerInput: {
        baseUrl: input.providerInput.baseUrl,
        model: input.providerInput.model,
        apiKey: input.providerInput.apiKey,
        apiFormat: input.providerInput.apiFormat,
      },
    })

    // Check cache for existing capabilities to pass to adapter
    const cachedCapabilities = this.capabilityCache.get(cacheKey) ?? undefined

    // Build startup input with cached capabilities, without mutating original
    const startupInput: RuntimeStartupInput = cachedCapabilities
      ? { ...input, cachedCapabilities }
      : input

    const adapter = this.registry.resolve({
      routeId: input.routeId,
      descriptor: input.descriptor,
    })

    try {
      const result = await adapter.verifyStartup(startupInput)

      if (result.ok) {
        if (result.capabilities) {
          // Cache returned capabilities
          this.capabilityCache.set(cacheKey, result.capabilities)
        }
        // If ok without capabilities, preserve existing cache (do not overwrite)
        return result
      }

      // Failure — do not cache, do not throw
      return result
    } catch {
      // Do not expose raw error text (may contain secrets)
      return {
        ok: false,
        severity: 'warning',
        code: 'probe_failed',
        reason: 'Provider startup verification failed before completion.',
      }
    }
  }
}

// ── Default factory ─────────────────────────────────────────────────────

/**
 * Build a ProviderStartupVerifier with default dependencies.
 *
 * Uses buildDefaultRuntimeAdapterRegistry() (legacy-passthrough only)
 * and a fresh RuntimeCapabilityCache.
 *
 * Does not instantiate real provider adapters.
 * Does not perform network calls.
 */
export function buildDefaultProviderStartupVerifier(): ProviderStartupVerifier {
  return new ProviderStartupVerifier({
    registry: buildDefaultRuntimeAdapterRegistry(),
    capabilityCache: new RuntimeCapabilityCache(),
  })
}
