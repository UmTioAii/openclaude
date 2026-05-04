import { describe, it, expect } from 'bun:test'

import {
  createAuthFingerprint,
  createBaseUrlHash,
  redactSensitiveUrl,
  redactHeaders,
  redactErrorMessage,
  maskSecretForDisplay,
  redactSecretValueForDisplay,
  sanitizeApiKey,
  sanitizeProviderConfigValue,
} from '../RuntimeSecurity.js'

// ── createAuthFingerprint ─────────────────────────────────────────────

describe('createAuthFingerprint', () => {
  it('is deterministic', () => {
    const fp1 = createAuthFingerprint('sk-test-abc123')
    const fp2 = createAuthFingerprint('sk-test-abc123')
    expect(fp1).toBe(fp2)
  })

  it('returns 16 hex chars', () => {
    const fp = createAuthFingerprint('sk-test-abc123')
    expect(fp).toHaveLength(16)
    expect(fp).toMatch(/^[0-9a-f]{16}$/)
  })

  it('does not equal the raw credential', () => {
    const credential = 'sk-test-abc123'
    const fp = createAuthFingerprint(credential)
    expect(fp).not.toBe(credential)
  })

  it('produces different fingerprints for different credentials', () => {
    const fp1 = createAuthFingerprint('sk-test-abc123')
    const fp2 = createAuthFingerprint('sk-test-xyz789')
    expect(fp1).not.toBe(fp2)
  })
})

// ── createBaseUrlHash ─────────────────────────────────────────────────

describe('createBaseUrlHash', () => {
  it('is deterministic', () => {
    const h1 = createBaseUrlHash('https://api.example.com/v1')
    const h2 = createBaseUrlHash('https://api.example.com/v1')
    expect(h1).toBe(h2)
  })

  it('returns 16 hex chars', () => {
    const h = createBaseUrlHash('https://api.example.com/v1')
    expect(h).toHaveLength(16)
    expect(h).toMatch(/^[0-9a-f]{16}$/)
  })

  it('does not include raw URL text', () => {
    const url = 'https://api.example.com/v1'
    const h = createBaseUrlHash(url)
    expect(h).not.toContain('api.example.com')
    expect(h).not.toContain('https')
  })
})

// ── redactSensitiveUrl ────────────────────────────────────────────────

describe('redactSensitiveUrl', () => {
  it('redacts sensitive query parameters', () => {
    const result = redactSensitiveUrl(
      'https://api.example.com/v1/models?key=secret123&page=2',
    )
    expect(result).toContain('key=[REDACTED]')
    expect(result).toContain('page=2')
    expect(result).not.toContain('secret123')
  })

  it('redacts api_key query parameter', () => {
    const result = redactSensitiveUrl(
      'https://api.example.com/v1?api_key=abc456',
    )
    expect(result).toContain('api_key=[REDACTED]')
    expect(result).not.toContain('abc456')
  })

  it('redacts token query parameter', () => {
    const result = redactSensitiveUrl(
      'https://api.example.com/v1?token=bearer-xyz',
    )
    expect(result).toContain('token=[REDACTED]')
    expect(result).not.toContain('bearer-xyz')
  })

  it('preserves non-sensitive query parameters', () => {
    const result = redactSensitiveUrl(
      'https://api.example.com/v1?model=gpt-4&version=2',
    )
    expect(result).toContain('model=gpt-4')
    expect(result).toContain('version=2')
  })

  it('tolerates malformed URLs', () => {
    const malformed = 'not-a-valid-url'
    const result = redactSensitiveUrl(malformed)
    expect(result).toBe(malformed)
  })

  it('redacts multiple sensitive parameters at once', () => {
    const result = redactSensitiveUrl(
      'https://api.example.com?key=abc&token=def&secret=ghi&model=test',
    )
    expect(result).toContain('key=[REDACTED]')
    expect(result).toContain('token=[REDACTED]')
    expect(result).toContain('secret=[REDACTED]')
    expect(result).toContain('model=test')
    expect(result).not.toContain('abc')
    expect(result).not.toContain('def')
    expect(result).not.toContain('ghi')
  })
})

// ── redactHeaders ─────────────────────────────────────────────────────

describe('redactHeaders', () => {
  it('redacts authorization header', () => {
    const result = redactHeaders({ authorization: 'Bearer sk-abc' })
    expect(result.authorization).toBe('[REDACTED]')
  })

  it('redacts api-key header', () => {
    const result = redactHeaders({ 'api-key': 'sk-abc' })
    expect(result['api-key']).toBe('[REDACTED]')
  })

  it('redacts x-api-key header', () => {
    const result = redactHeaders({ 'x-api-key': 'sk-abc' })
    expect(result['x-api-key']).toBe('[REDACTED]')
  })

  it('redacts x-app header', () => {
    const result = redactHeaders({ 'x-app': 'my-app' })
    expect(result['x-app']).toBe('[REDACTED]')
  })

  it('redacts x-client-app header', () => {
    const result = redactHeaders({ 'x-client-app': 'my-client' })
    expect(result['x-client-app']).toBe('[REDACTED]')
  })

  it('redacts x-anthropic-version header', () => {
    const result = redactHeaders({ 'x-anthropic-version': '2023-06-01' })
    expect(result['x-anthropic-version']).toBe('[REDACTED]')
  })

  it('redacts anthropic-beta header', () => {
    const result = redactHeaders({ 'anthropic-beta': 'some-beta' })
    expect(result['anthropic-beta']).toBe('[REDACTED]')
  })

  it('redacts x-claude-test header', () => {
    const result = redactHeaders({ 'x-claude-test': 'test-val' })
    expect(result['x-claude-test']).toBe('[REDACTED]')
  })

  it('redacts case-insensitively', () => {
    const result = redactHeaders({ Authorization: 'Bearer sk-abc' })
    expect(result.Authorization).toBe('[REDACTED]')
  })

  it('preserves non-sensitive headers', () => {
    const result = redactHeaders({
      'content-type': 'application/json',
      accept: 'text/html',
    })
    expect(result['content-type']).toBe('application/json')
    expect(result.accept).toBe('text/html')
  })

  it('handles mixed sensitive and non-sensitive headers', () => {
    const result = redactHeaders({
      'content-type': 'application/json',
      authorization: 'Bearer sk-abc',
      accept: 'text/html',
      'x-api-key': 'sk-xyz',
    })
    expect(result['content-type']).toBe('application/json')
    expect(result.authorization).toBe('[REDACTED]')
    expect(result.accept).toBe('text/html')
    expect(result['x-api-key']).toBe('[REDACTED]')
  })
})

// ── redactErrorMessage ────────────────────────────────────────────────

describe('redactErrorMessage', () => {
  it('redacts bearer tokens', () => {
    const result = redactErrorMessage(
      new Error('Request failed: Bearer sk-abc123def456'),
    )
    expect(result).not.toContain('sk-abc123def456')
    expect(result).toContain('Bearer [REDACTED]')
  })

  it('redacts URL query secrets', () => {
    const result = redactErrorMessage(
      'Failed to call https://api.example.com?token=secret123',
    )
    expect(result).not.toContain('secret123')
    expect(result).toContain('token=[REDACTED]')
  })

  it('redacts API key style values', () => {
    const result = redactErrorMessage('Config error: api_key=sk-abc123')
    expect(result).not.toContain('sk-abc123')
    expect(result).toContain('[REDACTED]')
  })

  it('handles non-Error values', () => {
    const result = redactErrorMessage('string error message')
    expect(result).toBe('string error message')
  })

  it('handles non-string, non-Error values', () => {
    const result = redactErrorMessage(42)
    expect(result).toBe('42')
  })

  it('handles null/undefined gracefully', () => {
    expect(redactErrorMessage(null)).toBe('null')
    expect(redactErrorMessage(undefined)).toBe('undefined')
  })
})

// ── providerSecrets re-exports ────────────────────────────────────────

describe('providerSecrets re-exports', () => {
  it('re-exports maskSecretForDisplay', () => {
    expect(typeof maskSecretForDisplay).toBe('function')
  })

  it('re-exports redactSecretValueForDisplay', () => {
    expect(typeof redactSecretValueForDisplay).toBe('function')
  })

  it('re-exports sanitizeApiKey', () => {
    expect(typeof sanitizeApiKey).toBe('function')
  })

  it('re-exports sanitizeProviderConfigValue', () => {
    expect(typeof sanitizeProviderConfigValue).toBe('function')
  })

  it('maskSecretForDisplay works correctly', () => {
    // Verify it delegates to the real implementation
    const result = maskSecretForDisplay('sk-longapikeyvalue123')
    expect(result).not.toBe('sk-longapikeyvalue123')
  })
})
