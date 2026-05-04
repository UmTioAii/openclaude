// PR1 — Managed Adapter Runtime: RuntimeEndpointBuilder.test

import { describe, expect, it } from 'bun:test'
import { buildRuntimeEndpoint } from '../RuntimeEndpointBuilder.js'
import { normalizeRuntimeEndpoint } from '../RuntimeEndpointNormalizer.js'

describe('buildRuntimeEndpoint', () => {
  // ── chat_completions ──────────────────────────────────────────────────

  it('chat_completions builds /chat/completions', () => {
    const result = buildRuntimeEndpoint(
      'https://api.example.com/v1',
      'chat_completions',
    )
    expect(result).toBe('https://api.example.com/v1/chat/completions')
  })

  // ── responses ─────────────────────────────────────────────────────────

  it('responses builds /responses', () => {
    const result = buildRuntimeEndpoint(
      'https://api.example.com/v1',
      'responses',
    )
    expect(result).toBe('https://api.example.com/v1/responses')
  })

  // ── codex_responses ───────────────────────────────────────────────────

  it('codex_responses builds /responses', () => {
    const result = buildRuntimeEndpoint(
      'https://api.example.com/v1',
      'codex_responses',
    )
    expect(result).toBe('https://api.example.com/v1/responses')
  })

  // ── anthropic_messages ────────────────────────────────────────────────

  it('anthropic_messages builds /messages', () => {
    const result = buildRuntimeEndpoint(
      'https://api.anthropic.com',
      'anthropic_messages',
    )
    expect(result).toBe('https://api.anthropic.com/messages')
  })

  // ── no duplicate slash ────────────────────────────────────────────────

  it('no duplicate slash appears when base ends with /', () => {
    const result = buildRuntimeEndpoint(
      'https://api.example.com/v1/',
      'chat_completions',
    )
    expect(result).toBe('https://api.example.com/v1/chat/completions')
  })

  // ── base /v1 is preserved ─────────────────────────────────────────────

  it('base /v1 is preserved', () => {
    const result = buildRuntimeEndpoint(
      'https://integrate.api.nvidia.com/v1',
      'chat_completions',
    )
    expect(result).toBe(
      'https://integrate.api.nvidia.com/v1/chat/completions',
    )
  })

  // ── no double-append after normalization ───────────────────────────────

  it('full endpoint input does not get double-appended after normalization', () => {
    // User pastes the full endpoint URL, normalizer strips the suffix,
    // builder re-appends correctly — no duplication.
    const rawInput = 'https://api.example.com/v1/chat/completions'
    const { normalized } = normalizeRuntimeEndpoint(rawInput)
    const result = buildRuntimeEndpoint(normalized, 'chat_completions')
    expect(result).toBe('https://api.example.com/v1/chat/completions')
  })

  it('responses endpoint does not double-append after normalization', () => {
    const rawInput = 'https://api.example.com/v1/responses'
    const { normalized } = normalizeRuntimeEndpoint(rawInput)
    const result = buildRuntimeEndpoint(normalized, 'responses')
    expect(result).toBe('https://api.example.com/v1/responses')
  })

  // ── gemini_native ─────────────────────────────────────────────────────

  it('gemini_native returns the normalized base URL as-is (no speculative path)', () => {
    const result = buildRuntimeEndpoint(
      'https://generativelanguage.googleapis.com/v1beta',
      'gemini_native',
    )
    // The PR1 plan does not define a concrete gemini_native endpoint URL
    // in this slice. The builder conservatively returns the base URL.
    expect(result).toBe(
      'https://generativelanguage.googleapis.com/v1beta',
    )
  })

  // ── empty / invalid input ─────────────────────────────────────────────

  it('returns empty string for empty base URL', () => {
    const result = buildRuntimeEndpoint('', 'chat_completions')
    expect(result).toBe('')
  })

  it('returns empty string for whitespace-only base URL', () => {
    const result = buildRuntimeEndpoint('   ', 'chat_completions')
    expect(result).toBe('')
  })

  // ── does not double-append when base already has the path ──────────────

  it('does not double-append /chat/completions if base already ends with it', () => {
    // This can happen if normalization was skipped or the base was set
    // explicitly to include the endpoint.
    const result = buildRuntimeEndpoint(
      'https://api.example.com/v1/chat/completions',
      'chat_completions',
    )
    expect(result).toBe('https://api.example.com/v1/chat/completions')
  })

  it('does not double-append /responses if base already ends with it', () => {
    const result = buildRuntimeEndpoint(
      'https://api.example.com/v1/responses',
      'responses',
    )
    expect(result).toBe('https://api.example.com/v1/responses')
  })

  it('does not double-append /messages if base already ends with it', () => {
    const result = buildRuntimeEndpoint(
      'https://api.anthropic.com/messages',
      'anthropic_messages',
    )
    expect(result).toBe('https://api.anthropic.com/messages')
  })
})
