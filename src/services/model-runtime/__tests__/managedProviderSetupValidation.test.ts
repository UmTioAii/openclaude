// PR1 — Tests for managedProviderSetupValidation

// Covers: buildRuntimeSetupInputFromProfile, validateManagedProviderSetup,

// managed vs non-managed routing, no-descriptor fallback, non-managed passthrough,

// and rejection of non-PR1 providers (Venice, xAI, MiniMax, Bankr).

import { describe, it, expect, mock, beforeEach } from 'bun:test'

// Dynamic import with cache-busting to avoid mock.module() leaks from
// ProviderManager.test.tsx (bun:test mock.module() is process-global and
// mock.restore() does not fully undo it).
async function importFreshValidationModule() {
  return import(`../managedProviderSetupValidation.js?ts=${Date.now()}-${Math.random()}`)
}

let buildRuntimeSetupInputFromProfile: typeof import('../managedProviderSetupValidation.js').buildRuntimeSetupInputFromProfile
let validateManagedProviderSetup: typeof import('../managedProviderSetupValidation.js').validateManagedProviderSetup

beforeEach(async () => {
  const mod = await importFreshValidationModule()
  buildRuntimeSetupInputFromProfile = mod.buildRuntimeSetupInputFromProfile
  validateManagedProviderSetup = mod.validateManagedProviderSetup
})

import type { ProviderProfile } from '../../../utils/config.js'

import type { RuntimeSetupInput } from '../types.js'

// ── Fixture helpers ─────────────────────────────────────────────────────

const CODEX_PROFILE: ProviderProfile = {
  id: 'test-codex',
  name: 'Codex Test',
  provider: 'codex',
  baseUrl: 'https://api.openai.com/v1',
  model: 'codex-mini',
  apiKey: 'sk-test-codex-key',

}

const GEMINI_PROFILE: ProviderProfile = {
  id: 'test-gemini',
  name: 'Gemini Test',
  provider: 'gemini',
  baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
  model: 'gemini-2.0-flash',
  apiKey: 'test-gemini-key',

}

const NVIDIA_NIM_PROFILE: ProviderProfile = {
  id: 'test-nvidia-nim',
  name: 'NVIDIA NIM Test',
  provider: 'nvidia-nim',
  baseUrl: 'https://integrate.api.nvidia.com/v1',
  model: 'meta/llama-3.1-8b-instruct',
  apiKey: 'nvapi-test-key',

}

const OPENROUTER_PROFILE: ProviderProfile = {
  id: 'test-openrouter',
  name: 'OpenRouter Test',
  provider: 'openrouter',
  baseUrl: 'https://openrouter.ai/api/v1',
  model: 'anthropic/claude-sonnet-4',
  apiKey: 'sk-or-test-key',

}

const OPENAI_PROFILE: ProviderProfile = {
  id: 'test-openai',
  name: 'OpenAI Test',
  provider: 'openai',
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-4o',
  apiKey: 'sk-openai-key',

}

const OLLAMA_PROFILE: ProviderProfile = {
  id: 'test-ollama',
  name: 'Ollama Test',
  provider: 'ollama',
  baseUrl: 'http://localhost:11434',
  model: 'llama3',

}

const ANTHROPIC_PROFILE: ProviderProfile = {
  id: 'test-anthropic',
  name: 'Anthropic Test',
  provider: 'anthropic',
  baseUrl: 'https://api.anthropic.com/v1',
  model: 'claude-sonnet-4-20250514',
  apiKey: 'sk-ant-test-key',

}

const VENICE_PROFILE: ProviderProfile = {
  id: 'test-venice',
  name: 'Venice Test',
  provider: 'venice',
  baseUrl: 'https://api.venice.ai/api/v1',
  model: 'venice-model',
  apiKey: 'venice-key',

}

const XAI_PROFILE: ProviderProfile = {
  id: 'test-xai',
  name: 'xAI Test',
  provider: 'xai',
  baseUrl: 'https://api.x.ai/v1',
  model: 'grok-beta',
  apiKey: 'xai-key',

}

const MINIMAX_PROFILE: ProviderProfile = {
  id: 'test-minimax',
  name: 'MiniMax Test',
  provider: 'minimax',
  baseUrl: 'https://api.minimax.chat/v1',
  model: 'minimax-model',
  apiKey: 'minimax-key',

}

const BANKR_PROFILE: ProviderProfile = {
  id: 'test-bankr',
  name: 'Bankr Test',
  provider: 'bankr',
  baseUrl: 'https://api.bankr.ai/v1',
  model: 'bankr-model',
  apiKey: 'bankr-key',

}

const MOCK_ENV = {} as NodeJS.ProcessEnv

// ── buildRuntimeSetupInputFromProfile ──────────────────────────────────

describe('buildRuntimeSetupInputFromProfile', () => {
  it('returns null for non-managed openai provider', () => {
    const result = buildRuntimeSetupInputFromProfile(OPENAI_PROFILE, MOCK_ENV)
    expect(result).toBeNull()
  })
  it('returns null for non-managed ollama provider', () => {
    const result = buildRuntimeSetupInputFromProfile(OLLAMA_PROFILE, MOCK_ENV)
    expect(result).toBeNull()
  })
  it('returns null for non-managed anthropic provider', () => {
    const result = buildRuntimeSetupInputFromProfile(ANTHROPIC_PROFILE, MOCK_ENV)
    expect(result).toBeNull()
  })
  it('returns null for Venice (not a managed provider)', () => {
    const result = buildRuntimeSetupInputFromProfile(VENICE_PROFILE, MOCK_ENV)
    expect(result).toBeNull()
  })
  it('returns null for xAI (not a managed provider)', () => {
    const result = buildRuntimeSetupInputFromProfile(XAI_PROFILE, MOCK_ENV)
    expect(result).toBeNull()
  })
  it('returns null for MiniMax (not a managed provider)', () => {
    const result = buildRuntimeSetupInputFromProfile(MINIMAX_PROFILE, MOCK_ENV)
    expect(result).toBeNull()
  })
  it('returns null for Bankr (not a managed provider)', () => {
    const result = buildRuntimeSetupInputFromProfile(BANKR_PROFILE, MOCK_ENV)
    expect(result).toBeNull()
  })
  it('returns null when resolveDescriptor returns null for a managed provider', () => {
    // Simulate a truly missing route descriptor via the injection seam.
    // Changing baseUrl to a bogus URL must NOT simulate a missing descriptor --
    // route identity comes from profile.provider only.
    const result = buildRuntimeSetupInputFromProfile(CODEX_PROFILE, MOCK_ENV, () => null)
    expect(result).toBeNull()
  })

})

// ── validateManagedProviderSetup ────────────────────────────────────────

describe('validateManagedProviderSetup', () => {
  it('returns ok for non-managed openai provider (legacy passthrough)', async () => {
    const result = await validateManagedProviderSetup(OPENAI_PROFILE, MOCK_ENV)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.capabilities.routeId).toBe('openai')
    }

  })
  it('returns ok for non-managed ollama provider (legacy passthrough)', async () => {
    const result = await validateManagedProviderSetup(OLLAMA_PROFILE, MOCK_ENV)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.capabilities.routeId).toBe('ollama')
    }

  })
  it('returns ok for non-managed anthropic provider (legacy passthrough)', async () => {
    const result = await validateManagedProviderSetup(ANTHROPIC_PROFILE, MOCK_ENV)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.capabilities.routeId).toBe('anthropic')
    }

  })
  it('returns ok for Venice (non-managed, legacy passthrough)', async () => {
    const result = await validateManagedProviderSetup(VENICE_PROFILE, MOCK_ENV)
    expect(result.ok).toBe(true)
  })
  it('returns ok for xAI (non-managed, legacy passthrough)', async () => {
    const result = await validateManagedProviderSetup(XAI_PROFILE, MOCK_ENV)
    expect(result.ok).toBe(true)
  })
  it('returns ok for MiniMax (non-managed, legacy passthrough)', async () => {
    const result = await validateManagedProviderSetup(MINIMAX_PROFILE, MOCK_ENV)
    expect(result.ok).toBe(true)
  })
  it('returns ok for Bankr (non-managed, legacy passthrough)', async () => {
    const result = await validateManagedProviderSetup(BANKR_PROFILE, MOCK_ENV)
    expect(result.ok).toBe(true)
  })
  it('returns warning when route descriptor is missing for managed provider', async () => {
    // Use a real managed provider (codex) but simulate a missing descriptor
    // via the injection seam -- do not use a non-managed provider like
    // 'nonexistent-provider' which would get legacy passthrough ok:true.
    const result = await validateManagedProviderSetup(CODEX_PROFILE, MOCK_ENV, () => null)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.severity).toBe('warning')
      expect(result.code).toBe('unknown_provider')
    }

  })
  it('does not log raw apiKey for any profile', async () => {
    // Spy on console to ensure no secret leakage
    const consoleSpy = mock(() => {})
    const origWarn = console.warn
    const origLog = console.log
    const origError = console.error
    console.warn = consoleSpy
    console.log = consoleSpy
    console.error = consoleSpy
    try {
      await validateManagedProviderSetup(CODEX_PROFILE, MOCK_ENV)
      for (const call of consoleSpy.mock.calls) {
        const arg = String(call[0] ?? '')
        expect(arg).not.toContain('sk-test-codex-key')
      }

    } finally {
      console.warn = origWarn
      console.log = origLog
      console.error = origError
    }

  })
  it('does not silently replace user-provided baseUrl or model', async () => {
    // For non-managed, the capabilities should reflect the profile's model
    const result = await validateManagedProviderSetup(OPENAI_PROFILE, MOCK_ENV)
    if (result.ok) {
      expect(result.capabilities.model.requested).toBe('gpt-4o')
    }

  })

})

// ── Non-managed provider exclusion ──────────────────────────────────────

describe('non-managed provider exclusion', () => {
  const nonManagedProfiles = [
    ['openai', OPENAI_PROFILE],
    ['ollama', OLLAMA_PROFILE],
    ['anthropic', ANTHROPIC_PROFILE],
    ['venice', VENICE_PROFILE],
    ['xai', XAI_PROFILE],
    ['minimax', MINIMAX_PROFILE],
    ['bankr', BANKR_PROFILE],
  ] as const
  for (const [name, profile] of nonManagedProfiles) {
    it(`${name} is not routed through managed validation`, () => {
      const result = buildRuntimeSetupInputFromProfile(profile, MOCK_ENV)
      expect(result).toBeNull()
    })
  }

})

// ── Managed provider passthrough (integration) ─────────────────────────

describe('managed provider profiles reach validateSetup', () => {
  // These tests verify that managed profiles produce valid RuntimeSetupInput
  // that would reach the real adapter's validateSetup method.
  // Since we can't control the real adapter in unit tests without mocking,
  // we verify the input construction is correct.
  const managedProfiles = [
    ['codex', CODEX_PROFILE],
    ['gemini', GEMINI_PROFILE],
    ['nvidia-nim', NVIDIA_NIM_PROFILE],
    ['openrouter', OPENROUTER_PROFILE],
  ] as const
    for (const [name, profile] of managedProfiles) {
   it(`${name} must produce a non-null RuntimeSetupInput`, () => {
    const result = buildRuntimeSetupInputFromProfile(profile, MOCK_ENV)
    // Managed providers MUST NOT return null — descriptor must exist
    expect(result).not.toBeNull()
    expect(result!.routeId).toBe(profile.provider)
    expect(result!.descriptor).toBeTruthy()
    expect(result!.providerInput.providerId).toBe(profile.provider)
    expect(result!.providerInput.baseUrl).toBe(profile.baseUrl)
    expect(result!.providerInput.model).toBe(profile.model)
    if (profile.apiKey) {
     expect(result!.providerInput.apiKey).toBe(profile.apiKey)
    }

    expect(result!.catalogEntry).toBeNull()
    expect(result!.processEnv).toBe(MOCK_ENV)
   })
  }

})

// ── Managed route identity uses profile.provider, not baseUrl heuristics ──

describe('managed route identity: profile.provider overrides baseUrl', () => {
    it('codex profile with openrouter baseUrl still uses routeId=codex', () => {
   // A codex profile that someone pointed at openrouter's URL
   // must NOT be reclassified as openrouter
   const codexWithOpenrouterUrl: ProviderProfile = {
    ...CODEX_PROFILE,
    baseUrl: 'https://openrouter.ai/api/v1',
   }

   const result = buildRuntimeSetupInputFromProfile(codexWithOpenrouterUrl, MOCK_ENV)
   expect(result).not.toBeNull()
   expect(result!.routeId).toBe('codex')
   expect(result!.providerInput.providerId).toBe('codex')
   expect(result!.providerInput.baseUrl).toBe('https://openrouter.ai/api/v1')
  })
    it('openrouter profile with openai baseUrl still uses routeId=openrouter', () => {
   const openrouterWithOpenaiUrl: ProviderProfile = {
    ...OPENROUTER_PROFILE,
    baseUrl: 'https://api.openai.com/v1',
   }

   const result = buildRuntimeSetupInputFromProfile(openrouterWithOpenaiUrl, MOCK_ENV)
   expect(result).not.toBeNull()
   expect(result!.routeId).toBe('openrouter')
   expect(result!.providerInput.providerId).toBe('openrouter')
   expect(result!.providerInput.baseUrl).toBe('https://api.openai.com/v1')
  })
    it('gemini profile with custom proxy baseUrl still uses routeId=gemini', () => {
   const geminiWithProxy: ProviderProfile = {
    ...GEMINI_PROFILE,
    baseUrl: 'https://my-proxy.example.com/gemini',
   }

   const result = buildRuntimeSetupInputFromProfile(geminiWithProxy, MOCK_ENV)
   expect(result).not.toBeNull()
   expect(result!.routeId).toBe('gemini')
   expect(result!.providerInput.providerId).toBe('gemini')
   expect(result!.providerInput.baseUrl).toBe('https://my-proxy.example.com/gemini')
  })

})

// ── Non-managed providers remain non-managed (no-op path) ──

describe('non-managed providers return null from buildRuntimeSetupInputFromProfile', () => {
    const nonManagedProviders = [
   { name: 'venice', provider: 'venice', baseUrl: 'https://api.venice.ai/api/v1', model: 'venice-model' },
   { name: 'xai', provider: 'xai', baseUrl: 'https://api.x.ai/v1', model: 'grok-beta' },
   { name: 'minimax', provider: 'minimax', baseUrl: 'https://api.minimax.chat/v1', model: 'minimax-model' },
   { name: 'bankr', provider: 'bankr', baseUrl: 'https://api.bankr.ai/v1', model: 'bankr-model' },
  ]

  for (const { name, provider, baseUrl, model } of nonManagedProviders) {
    it(`${name} (provider="${provider}") returns null — not a managed provider`, () => {
      const profile: ProviderProfile = {
        id: `test-${provider}`,
        name,
        provider,
        baseUrl,
        model,
        apiKey: 'test-key',
      }

      const result = buildRuntimeSetupInputFromProfile(profile, MOCK_ENV)
      expect(result).toBeNull()
    })
  }

})

