// PR1 — Managed Adapter Runtime: RuntimeEndpointNormalizer.test

import { describe, expect, it } from 'bun:test'
import { normalizeRuntimeEndpoint } from '../RuntimeEndpointNormalizer.js'

describe('normalizeRuntimeEndpoint', () => {
  it('trims whitespace', () => {
    const result = normalizeRuntimeEndpoint('  https://api.example.com/v1  ')
    expect(result.normalized).toBe('https://api.example.com/v1')
    expect(result.changed).toBe(true)
  })

  it('removes trailing slash', () => {
    const result = normalizeRuntimeEndpoint('https://api.example.com/v1/')
    expect(result.normalized).toBe('https://api.example.com/v1')
    expect(result.changed).toBe(true)
  })

  it('removes multiple trailing slashes', () => {
    const result = normalizeRuntimeEndpoint('https://api.example.com/v1///')
    expect(result.normalized).toBe('https://api.example.com/v1')
    expect(result.changed).toBe(true)
  })

  it('preserves https://api.example.com/v1', () => {
    const result = normalizeRuntimeEndpoint('https://api.example.com/v1')
    expect(result.normalized).toBe('https://api.example.com/v1')
    expect(result.changed).toBe(false)
  })

  it('preserves https://integrate.api.nvidia.com/v1', () => {
    const result = normalizeRuntimeEndpoint(
      'https://integrate.api.nvidia.com/v1',
    )
    expect(result.normalized).toBe('https://integrate.api.nvidia.com/v1')
    expect(result.changed).toBe(false)
  })

  it('converts https://api.example.com/v1/chat/completions to https://api.example.com/v1', () => {
    const result = normalizeRuntimeEndpoint(
      'https://api.example.com/v1/chat/completions',
    )
    expect(result.normalized).toBe('https://api.example.com/v1')
    expect(result.changed).toBe(true)
  })

  it('converts https://api.example.com/chat/completions to https://api.example.com', () => {
    const result = normalizeRuntimeEndpoint(
      'https://api.example.com/chat/completions',
    )
    expect(result.normalized).toBe('https://api.example.com')
    expect(result.changed).toBe(true)
  })

  it('converts https://api.example.com/v1/completions to https://api.example.com/v1', () => {
    const result = normalizeRuntimeEndpoint(
      'https://api.example.com/v1/completions',
    )
    expect(result.normalized).toBe('https://api.example.com/v1')
    expect(result.changed).toBe(true)
  })

  it('converts https://api.example.com/v1/responses to https://api.example.com/v1', () => {
    const result = normalizeRuntimeEndpoint(
      'https://api.example.com/v1/responses',
    )
    expect(result.normalized).toBe('https://api.example.com/v1')
    expect(result.changed).toBe(true)
  })

  it('converts https://api.example.com/completions to https://api.example.com', () => {
    const result = normalizeRuntimeEndpoint(
      'https://api.example.com/completions',
    )
    expect(result.normalized).toBe('https://api.example.com')
    expect(result.changed).toBe(true)
  })

  it('converts https://api.example.com/responses to https://api.example.com', () => {
    const result = normalizeRuntimeEndpoint(
      'https://api.example.com/responses',
    )
    expect(result.normalized).toBe('https://api.example.com')
    expect(result.changed).toBe(true)
  })

  it('converts https://api.example.com/v1/responses with trailing slash', () => {
    const result = normalizeRuntimeEndpoint(
      'https://api.example.com/v1/responses/',
    )
    expect(result.normalized).toBe('https://api.example.com/v1')
    expect(result.changed).toBe(true)
  })

  it('handles empty string safely', () => {
    const result = normalizeRuntimeEndpoint('')
    expect(result.normalized).toBe('')
    expect(result.changed).toBe(false)
  })

  it('handles malformed string safely without throwing', () => {
    const result = normalizeRuntimeEndpoint('not-a-url')
    expect(result.normalized).toBe('not-a-url')
    expect(result.changed).toBe(false)
  })

  it('handles partial input like just a hostname', () => {
    const result = normalizeRuntimeEndpoint('localhost:11434')
    expect(result.normalized).toBe('localhost:11434')
    expect(result.changed).toBe(false)
  })

  it('reports whether the input changed', () => {
    const unchanged = normalizeRuntimeEndpoint('https://api.openai.com/v1')
    expect(unchanged.changed).toBe(false)

    const changed = normalizeRuntimeEndpoint(
      '  https://api.openai.com/v1/chat/completions  ',
    )
    expect(changed.changed).toBe(true)
  })

  it('does not remove /v1 when /v1 is the intended API base', () => {
    const result = normalizeRuntimeEndpoint(
      'https://api.openai.com/v1',
    )
    expect(result.normalized).toBe('https://api.openai.com/v1')
    expect(result.changed).toBe(false)
  })

  it('handles whitespace-only input', () => {
    const result = normalizeRuntimeEndpoint('   ')
    expect(result.normalized).toBe('')
    expect(result.changed).toBe(true)
  })

  it('strips only the endpoint tail /chat/completions, preserving /v1', () => {
    // /v1 is preserved because only the endpoint tail /chat/completions is stripped;
    // /v1 is the intended API base and must not be removed.
    const result = normalizeRuntimeEndpoint(
      'https://api.example.com/v1/chat/completions',
    )
    expect(result.normalized).toBe('https://api.example.com/v1')
  })
})
