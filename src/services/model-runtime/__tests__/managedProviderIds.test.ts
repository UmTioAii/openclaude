import { describe, it, expect } from 'bun:test'

import {
  MANAGED_PROVIDER_IDS,
  isManagedProviderId,
} from '../managedProviderIds.js'

describe('managedProviderIds', () => {
  describe('MANAGED_PROVIDER_IDS', () => {
    it('contains exactly the four managed provider ids', () => {
      expect([...MANAGED_PROVIDER_IDS]).toEqual([
        'codex',
        'gemini',
        'nvidia-nim',
        'openrouter',
      ])
    })

    it('does not include openai', () => {
      expect((MANAGED_PROVIDER_IDS as readonly string[]).includes('openai')).toBe(false)
    })

    it('does not include anthropic', () => {
      expect((MANAGED_PROVIDER_IDS as readonly string[]).includes('anthropic')).toBe(false)
    })

    it('does not include ollama', () => {
      expect((MANAGED_PROVIDER_IDS as readonly string[]).includes('ollama')).toBe(false)
    })

    it('does not include legacy-passthrough', () => {
      expect((MANAGED_PROVIDER_IDS as readonly string[]).includes('legacy-passthrough')).toBe(false)
    })
  })

  describe('isManagedProviderId', () => {
    it('returns true for codex', () => {
      expect(isManagedProviderId('codex')).toBe(true)
    })

    it('returns true for gemini', () => {
      expect(isManagedProviderId('gemini')).toBe(true)
    })

    it('returns true for nvidia-nim', () => {
      expect(isManagedProviderId('nvidia-nim')).toBe(true)
    })

    it('returns true for openrouter', () => {
      expect(isManagedProviderId('openrouter')).toBe(true)
    })

    it('returns false for openai', () => {
      expect(isManagedProviderId('openai')).toBe(false)
    })

    it('returns false for anthropic', () => {
      expect(isManagedProviderId('anthropic')).toBe(false)
    })

    it('returns false for ollama', () => {
      expect(isManagedProviderId('ollama')).toBe(false)
    })

    it('returns false for legacy-passthrough', () => {
      expect(isManagedProviderId('legacy-passthrough')).toBe(false)
    })

    it('returns false for empty string', () => {
      expect(isManagedProviderId('')).toBe(false)
    })

    it('returns false for undefined', () => {
      expect(isManagedProviderId(undefined)).toBe(false)
    })
  })
})
