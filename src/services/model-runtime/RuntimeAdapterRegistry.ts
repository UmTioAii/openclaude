import type { RuntimeProviderAdapter } from './types.js'

import type { RouteDescriptor } from './types.js'

import { LegacyRuntimePassthroughAdapter } from './adapters/legacy/LegacyRuntimePassthroughAdapter.js'
import { NvidiaNimRuntimeAdapter } from './adapters/nvidia/NvidiaNimRuntimeAdapter.js'
import { OpenRouterRuntimeAdapter } from './adapters/openrouter/OpenRouterRuntimeAdapter.js'
import { CodexRuntimeAdapter } from './adapters/codex/CodexRuntimeAdapter.js'
import { GeminiRuntimeAdapter } from './adapters/gemini/GeminiRuntimeAdapter.js'

// Adapter order: managed adapters first, then legacy-passthrough fallback.
// 1. Codex
// 2. Gemini
// 3. NvidiaNim
// 4. OpenRouter
// 5. LegacyRuntimePassthrough (fallback — always last)

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
  return new RuntimeAdapterRegistry([
    new CodexRuntimeAdapter(),
    new GeminiRuntimeAdapter(),
    new NvidiaNimRuntimeAdapter(),
    new OpenRouterRuntimeAdapter(),
  ])
}
