import type { RuntimeProviderAdapter } from './types.js'

import type { RouteDescriptor } from '../../integrations/routeMetadata.js'

import { LegacyRuntimePassthroughAdapter } from './adapters/legacy/LegacyRuntimePassthroughAdapter.js'

// Final intended adapter order:
// 1. Codex
// 2. Gemini
// 3. NvidiaNim
// 4. OpenRouter
// 5. LegacyRuntimePassthrough

export class RuntimeAdapterRegistry {
  private readonly adapters: RuntimeProviderAdapter[]
  private readonly fallback = new LegacyRuntimePassthroughAdapter()

  constructor(adapters: RuntimeProviderAdapter[] = []) {
    this.adapters = adapters
  }

  resolve({
    routeId,
    descriptor,
  }: {
    routeId: string
    descriptor: RouteDescriptor
  }): RuntimeProviderAdapter {
    const matching = this.adapters.find((adapter) =>
      adapter.supportsRoute(routeId, descriptor),
    )
    return matching ?? this.fallback
  }

  getAdapters(): RuntimeProviderAdapter[] {
    return [...this.adapters, this.fallback]
  }
}

export function buildDefaultRuntimeAdapterRegistry(): RuntimeAdapterRegistry {
  // Real provider adapters are not yet implemented.
  // The default registry currently exposes only the legacy-passthrough fallback.
  return new RuntimeAdapterRegistry([])
}
