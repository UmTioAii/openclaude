// PR1 — Managed Adapter Runtime: ModelRuntimeCoordinator
// Narrow orchestration layer that coordinates cache, registry, and resolver.
// No network calls. No filesystem access. No environment mutation. No logging.
// No bridge imports. No services/api imports. No command/bootstrap imports.
// No startup verification. No request sending. No provider-specific behavior.

import type {
  RuntimeModelCapabilities,
  RuntimeSetupInput,
} from './types.js'

import { RuntimeAdapterRegistry, buildDefaultRuntimeAdapterRegistry } from './RuntimeAdapterRegistry.js'
import { RuntimeCapabilityCache } from './RuntimeCapabilityCache.js'
import {
  resolveRuntimeCapabilityCacheKey,
  resolveRuntimeCapabilitiesFromMetadata,
} from './RuntimeCapabilityResolver.js'

// ── Dependency type ─────────────────────────────────────────────────────

export type ModelRuntimeCoordinatorDeps = {
  registry: RuntimeAdapterRegistry
  capabilityCache: RuntimeCapabilityCache
}

// ── ModelRuntimeCoordinator ─────────────────────────────────────────────

/**
 * Orchestrates capability resolution through cache → adapter → metadata fallback.
 *
 * - Cache-first: avoids calling adapter.resolveCapabilities() on cache hit.
 * - Adapter call: exactly once on cache miss.
 * - Metadata fallback: if adapter.resolveCapabilities() throws, uses
 *   resolveRuntimeCapabilitiesFromMetadata() and caches the conservative result.
 * - Never throws for normal unknown/custom provider cases.
 * - Never calls validateSetup() or verifyStartup().
 * - Never performs network calls or reads process.env directly.
 */
export class ModelRuntimeCoordinator {
  private readonly registry: RuntimeAdapterRegistry
  private readonly capabilityCache: RuntimeCapabilityCache

  constructor(deps: ModelRuntimeCoordinatorDeps) {
    this.registry = deps.registry
    this.capabilityCache = deps.capabilityCache
  }

  /**
   * Resolve capabilities for a given setup input.
   *
   * Flow:
   * 1. Build cache key via resolveRuntimeCapabilityCacheKey().
   * 2. Check cache — return immediately on hit.
   * 3. On miss: resolve adapter from registry, call adapter.resolveCapabilities().
   * 4. If adapter throws: fall back to resolveRuntimeCapabilitiesFromMetadata().
   * 5. Cache and return the resolved capabilities.
   */
  async resolveCapabilities(
    input: RuntimeSetupInput,
  ): Promise<RuntimeModelCapabilities> {
    // 1. Build safe cache key (no raw baseUrl or apiKey in key)
    const cacheKey = resolveRuntimeCapabilityCacheKey({
      routeId: input.routeId,
      providerInput: {
        baseUrl: input.providerInput.baseUrl,
        model: input.providerInput.model,
        apiKey: input.providerInput.apiKey,
        apiFormat: input.providerInput.apiFormat,
      },
    })

    // 2. Check cache
    const cached = this.capabilityCache.get(cacheKey)
    if (cached) {
      return cached
    }

    // 3. Resolve adapter and call resolveCapabilities
    const adapter = this.registry.resolve({
      routeId: input.routeId,
      descriptor: input.descriptor,
    })

    try {
      const capabilities = await adapter.resolveCapabilities(input)

      // 4. Cache and return adapter-resolved capabilities
      this.capabilityCache.set(cacheKey, capabilities)
      return capabilities
    } catch {
      // 5. Adapter threw — fall back to conservative metadata resolution.
      //    Do not expose raw error messages (may contain secrets).
      const fallbackCapabilities = resolveRuntimeCapabilitiesFromMetadata(input)

      // Cache the fallback result too — avoids repeated adapter failures
      this.capabilityCache.set(cacheKey, fallbackCapabilities)
      return fallbackCapabilities
    }
  }
}

// ── Default factory ─────────────────────────────────────────────────────

/**
 * Build a ModelRuntimeCoordinator with default dependencies.
 *
 * Uses buildDefaultRuntimeAdapterRegistry() (legacy-passthrough only)
 * and a fresh RuntimeCapabilityCache.
 *
 * Does not instantiate real provider adapters.
 * Does not perform network calls.
 */
export function buildDefaultModelRuntimeCoordinator(): ModelRuntimeCoordinator {
  return new ModelRuntimeCoordinator({
    registry: buildDefaultRuntimeAdapterRegistry(),
    capabilityCache: new RuntimeCapabilityCache(),
  })
}
