import type {
  RuntimeProviderAdapter,
  RuntimeSetupInput,
  RuntimeStartupInput,
  RuntimeSetupResult,
  StartupVerificationResult,
  ResolveRuntimeCapabilitiesInput,
  RuntimeModelCapabilities,
} from '../../types.js'

import type { RouteDescriptor } from '../../types.js'

export class LegacyRuntimePassthroughAdapter
  implements RuntimeProviderAdapter
{
  readonly id = 'legacy-passthrough' as const
  readonly label = 'Legacy Passthrough'

  supportsRoute(_routeId: string, _descriptor: RouteDescriptor): boolean {
    return true
  }

  async validateSetup(
    input: RuntimeSetupInput,
  ): Promise<RuntimeSetupResult> {
    return { ok: true, capabilities: this.resolveCapabilitiesSync(input) }
  }

  async verifyStartup(
    input: RuntimeStartupInput,
  ): Promise<StartupVerificationResult> {
    return { ok: true, capabilities: this.resolveCapabilitiesSync(input) }
  }

  async resolveCapabilities(
    input: ResolveRuntimeCapabilitiesInput,
  ): Promise<RuntimeModelCapabilities> {
    return this.resolveCapabilitiesSync(input)
  }

  private resolveCapabilitiesSync(
    input: RuntimeSetupInput,
  ): RuntimeModelCapabilities {
    const resolved = this.resolveModel(input)
    const catalogCaps = input.catalogEntry?.capabilities

    return {
      routeId: input.routeId,
      providerId: input.providerInput.providerId,
      providerLabel: input.descriptor.label,

      model: resolved,

      availability: {
        checked: false,
        exists: true,
        active: true,
        verifiedBy: 'legacy_bridge',
      },

      tools: {
        supported: catalogCaps?.supportsFunctionCalling === true,
        format: catalogCaps?.supportsFunctionCalling === true
          ? 'openai'
          : 'none',
      },

      thinking: {
        supported: catalogCaps?.supportsReasoning === true,
        adaptiveSupported: false,
        mode: catalogCaps?.supportsReasoning === true
          ? 'provider_specific'
          : 'none',
        source: 'legacy_bridge',
      },

      effort: {
        supported: false,
        mode: 'none',
        nativeValues: [],
        defaultAbstractEffort: 'none',
        maxAutoAbstractEffort: 'none',
        allowAutoMax: false,
        autoStrategy: 'openclaude_decides',
        source: 'legacy_bridge',
      },

      payload: {
        endpoint: 'chat_completions',
        maxTokensField: 'max_tokens',
      },

      limits: {
        contextWindow: input.catalogEntry?.contextWindow,
        maxOutputTokens: input.catalogEntry?.maxOutputTokens,
      },

      confidence: 'legacy_bridge',
    }
  }

  private resolveModel(
    input: RuntimeSetupInput,
  ): RuntimeModelCapabilities['model'] {
    const { providerInput, catalogEntry, descriptor } = input

    // 1. providerInput.model, if non-empty
    if (providerInput.model) {
      return {
        requested: providerInput.model,
        resolvedApiName: providerInput.model,
        source: 'legacy_bridge',
      }
    }

    // 2. catalogEntry.apiName, if present
    if (catalogEntry?.apiName) {
      return {
        requested: catalogEntry.apiName,
        resolvedApiName: catalogEntry.apiName,
        source: 'legacy_bridge',
      }
    }

    // 3. descriptor.defaultModel, if present
    const defaultModel = (descriptor as Record<string, unknown>)
      .defaultModel as string | undefined
    if (defaultModel) {
      return {
        requested: defaultModel,
        resolvedApiName: defaultModel,
        source: 'legacy_bridge',
      }
    }

    // 4. "unknown"
    return {
      requested: 'unknown',
      resolvedApiName: 'unknown',
      source: 'fallback',
    }
  }
}
