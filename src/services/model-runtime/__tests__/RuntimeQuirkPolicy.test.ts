// PR1 — Managed Adapter Runtime: RuntimeQuirkPolicy.test

import { describe, expect, it } from 'bun:test'
import {
  applyMaxTokensField,
  applyQuirkPolicy,
  applyReasoningField,
  removeBodyFields,
  shouldPreserveReasoningContent,
  shouldRequireReasoningContentOnAssistantMessages,
  supportsSystemRole,
  supportsUserCustomHeaders,
} from '../RuntimeQuirkPolicy.js'
import type { RuntimeModelCapabilities } from '../types.js'

/** Helper to build a minimal valid RuntimeModelCapabilities with overrides. */
function makeCapabilities(
  overrides: Partial<RuntimeModelCapabilities['payload']> = {},
): RuntimeModelCapabilities {
  return {
    routeId: 'test-route',
    providerId: 'test-provider',
    providerLabel: 'Test Provider',
    model: {
      requested: 'test-model',
      resolvedApiName: 'test-model',
      source: 'fallback',
    },
    availability: {
      checked: false,
      exists: false,
      active: false,
      verifiedBy: 'not_checked',
    },
    tools: { supported: false, format: 'openai' },
    thinking: {
      supported: false,
      adaptiveSupported: false,
      mode: 'none',
      source: 'fallback',
    },
    effort: {
      supported: false,
      mode: 'none',
      nativeValues: [],
      defaultAbstractEffort: 'medium',
      maxAutoAbstractEffort: 'none',
      allowAutoMax: false,
      autoStrategy: 'openclaude_decides',
      source: 'fallback',
    },
    payload: {
      endpoint: 'chat_completions',
      maxTokensField: 'max_tokens',
      ...overrides,
    },
    limits: {},
    confidence: 'fallback',
  }
}

describe('removeBodyFields', () => {
  it('removes only configured fields', () => {
    const body = { model: 'gpt-4', stream: true, temperature: 0.7 }
    const result = removeBodyFields(body, ['temperature'])
    expect(result).toEqual({ model: 'gpt-4', stream: true })
  })

  it('removes multiple configured fields', () => {
    const body = { model: 'gpt-4', stream: true, temperature: 0.7, top_p: 1 }
    const result = removeBodyFields(body, ['temperature', 'top_p'])
    expect(result).toEqual({ model: 'gpt-4', stream: true })
  })

  it('does not mutate original body', () => {
    const body = { model: 'gpt-4', stream: true, temperature: 0.7 }
    const result = removeBodyFields(body, ['temperature'])
    expect(body).toEqual({ model: 'gpt-4', stream: true, temperature: 0.7 })
    expect(result).not.toBe(body)
  })

  it('returns shallow copy when no fields to remove', () => {
    const body = { model: 'gpt-4', stream: true }
    const result = removeBodyFields(body, [])
    expect(result).toEqual(body)
    expect(result).not.toBe(body)
  })

  it('handles missing fields gracefully', () => {
    const body = { model: 'gpt-4', stream: true }
    const result = removeBodyFields(body, ['nonexistent'])
    expect(result).toEqual({ model: 'gpt-4', stream: true })
  })
})

describe('applyMaxTokensField', () => {
  it('maps token value from max_tokens to max_completion_tokens', () => {
    const body = { model: 'gpt-4', max_tokens: 4096 }
    const result = applyMaxTokensField(body, 'max_completion_tokens')
    expect(result).toEqual({ model: 'gpt-4', max_completion_tokens: 4096 })
  })

  it('maps token value from max_completion_tokens to max_tokens', () => {
    const body = { model: 'gpt-4', max_completion_tokens: 4096 }
    const result = applyMaxTokensField(body, 'max_tokens')
    expect(result).toEqual({ model: 'gpt-4', max_tokens: 4096 })
  })

  it('does not remap when the correct field already exists', () => {
    const body = { model: 'gpt-4', max_tokens: 4096 }
    const result = applyMaxTokensField(body, 'max_tokens')
    expect(result).toEqual({ model: 'gpt-4', max_tokens: 4096 })
  })

  it('does not mutate original body', () => {
    const body = { model: 'gpt-4', max_tokens: 4096 }
    const result = applyMaxTokensField(body, 'max_completion_tokens')
    expect(body).toEqual({ model: 'gpt-4', max_tokens: 4096 })
    expect(result).not.toBe(body)
  })
})

describe('applyReasoningField', () => {
  it('reasoningField is respected when explicitly provided', () => {
    const body = { model: 'gpt-4', messages: [] }
    const result = applyReasoningField(body, 'reasoning_effort', 'high')
    expect(result).toEqual({
      model: 'gpt-4',
      messages: [],
      reasoning_effort: 'high',
    })
  })

  it('does not add reasoning field when reasoningField is undefined', () => {
    const body = { model: 'gpt-4', messages: [] }
    const result = applyReasoningField(body, undefined, 'high')
    expect(result).toEqual({ model: 'gpt-4', messages: [] })
  })

  it('does not add reasoning field when reasoningValue is undefined', () => {
    const body = { model: 'gpt-4', messages: [] }
    const result = applyReasoningField(body, 'reasoning_effort', undefined)
    expect(result).toEqual({ model: 'gpt-4', messages: [] })
  })

  it('does not mutate original body', () => {
    const body = { model: 'gpt-4', messages: [] }
    applyReasoningField(body, 'reasoning_effort', 'high')
    expect(body).toEqual({ model: 'gpt-4', messages: [] })
  })

  it('does not silently enable effort/thinking without explicit field and value', () => {
    const body = { model: 'gpt-4', messages: [] }
    const result = applyReasoningField(body, undefined, undefined)
    expect(result).toEqual({ model: 'gpt-4', messages: [] })
    expect('reasoning_effort' in result).toBe(false)
    expect('thinking' in result).toBe(false)
  })
})

describe('shouldPreserveReasoningContent', () => {
  it('preserveReasoningContent flag can be read without mutating unrelated fields', () => {
    const caps = makeCapabilities({ preserveReasoningContent: true })
    expect(shouldPreserveReasoningContent(caps)).toBe(true)
  })

  it('defaults to false when not set', () => {
    const caps = makeCapabilities({})
    expect(shouldPreserveReasoningContent(caps)).toBe(false)
  })

  it('returns false when explicitly set to false', () => {
    const caps = makeCapabilities({ preserveReasoningContent: false })
    expect(shouldPreserveReasoningContent(caps)).toBe(false)
  })
})

describe('shouldRequireReasoningContentOnAssistantMessages', () => {
  it('requireReasoningContentOnAssistantMessages flag can be read without mutating unrelated fields', () => {
    const caps = makeCapabilities({
      requireReasoningContentOnAssistantMessages: true,
    })
    expect(shouldRequireReasoningContentOnAssistantMessages(caps)).toBe(true)
  })

  it('defaults to false when not set', () => {
    const caps = makeCapabilities({})
    expect(shouldRequireReasoningContentOnAssistantMessages(caps)).toBe(false)
  })

  it('returns false when explicitly set to false', () => {
    const caps = makeCapabilities({
      requireReasoningContentOnAssistantMessages: false,
    })
    expect(shouldRequireReasoningContentOnAssistantMessages(caps)).toBe(false)
  })
})

describe('supportsSystemRole', () => {
  it('supportsSystemRole flag is exposed conservatively — false by default', () => {
    const caps = makeCapabilities({})
    expect(supportsSystemRole(caps)).toBe(false)
  })

  it('returns true only when explicitly set to true', () => {
    const caps = makeCapabilities({ supportsSystemRole: true })
    expect(supportsSystemRole(caps)).toBe(true)
  })

  it('returns false when explicitly set to false', () => {
    const caps = makeCapabilities({ supportsSystemRole: false })
    expect(supportsSystemRole(caps)).toBe(false)
  })
})

describe('supportsUserCustomHeaders', () => {
  it('supportsUserCustomHeaders flag is exposed conservatively — false by default', () => {
    const caps = makeCapabilities({})
    expect(supportsUserCustomHeaders(caps)).toBe(false)
  })

  it('returns true only when explicitly set to true', () => {
    const caps = makeCapabilities({ supportsUserCustomHeaders: true })
    expect(supportsUserCustomHeaders(caps)).toBe(true)
  })

  it('returns false when explicitly set to false', () => {
    const caps = makeCapabilities({ supportsUserCustomHeaders: false })
    expect(supportsUserCustomHeaders(caps)).toBe(false)
  })
})

describe('applyQuirkPolicy', () => {
  it('applies removeBodyFields from capabilities', () => {
    const body = { model: 'gpt-4', stream: true, temperature: 0.7 }
    const caps = makeCapabilities({ removeBodyFields: ['temperature'] })
    const result = applyQuirkPolicy(body, caps)
    expect(result).toEqual({ model: 'gpt-4', stream: true })
  })

  it('applies maxTokensField mapping from capabilities', () => {
    const body = { model: 'gpt-4', max_tokens: 4096 }
    const caps = makeCapabilities({ maxTokensField: 'max_completion_tokens' })
    const result = applyQuirkPolicy(body, caps)
    expect(result).toEqual({ model: 'gpt-4', max_completion_tokens: 4096 })
  })

  it('original payload object is not mutated', () => {
    const body = { model: 'gpt-4', max_tokens: 4096, temperature: 0.7 }
    const originalBody = { ...body }
    const caps = makeCapabilities({
      maxTokensField: 'max_completion_tokens',
      removeBodyFields: ['temperature'],
    })
    applyQuirkPolicy(body, caps)
    expect(body).toEqual(originalBody)
  })

  it('returns shallow copy when no quirks apply', () => {
    const body = { model: 'gpt-4', messages: [] }
    const caps = makeCapabilities({})
    const result = applyQuirkPolicy(body, caps)
    expect(result).toEqual(body)
    expect(result).not.toBe(body)
  })
})
