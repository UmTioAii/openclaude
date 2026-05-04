import { createHash } from 'node:crypto'

import {
  maskSecretForDisplay,
  redactSecretValueForDisplay,
  sanitizeApiKey,
  sanitizeProviderConfigValue,
} from '../../utils/providerSecrets.js'

export {
  maskSecretForDisplay,
  redactSecretValueForDisplay,
  sanitizeApiKey,
  sanitizeProviderConfigValue,
}

// ── Fingerprint / hash helpers ───────────────────────────────────────────

/**
 * Create a non-reversible fingerprint from a credential string.
 * SHA-256, first 16 hex chars — deterministic, never returns the raw credential.
 */
export function createAuthFingerprint(credential: string): string {
  return createHash('sha256').update(credential).digest('hex').slice(0, 16)
}

/**
 * Create a non-reversible hash from a base URL string.
 * SHA-256, first 16 hex chars — deterministic, never returns the raw URL.
 */
export function createBaseUrlHash(baseUrl: string): string {
  return createHash('sha256').update(baseUrl).digest('hex').slice(0, 16)
}

// ── URL redaction ────────────────────────────────────────────────────────

const SENSITIVE_QUERY_KEYS = new Set([
  'key',
  'api_key',
  'apikey',
  'token',
  'access_token',
  'secret',
  'password',
  'credential',
])

function isSensitiveQueryKey(key: string): boolean {
  return SENSITIVE_QUERY_KEYS.has(key.toLowerCase())
}

/**
 * Redact sensitive query parameter values from a URL.
 * Tolerates malformed/invalid URLs — returns the input unchanged if parsing fails.
 */
export function redactSensitiveUrl(value: string): string {
  // Use regex-based replacement to avoid URL-encoding the [REDACTED] placeholder.
  return value.replace(
    /([?&])([^=]+=)([^&]*)/g,
    (match, prefix: string, keyValue: string, _val: string) => {
      const eqIndex = keyValue.indexOf('=')
      if (eqIndex < 0) return match
      const key = keyValue.slice(0, eqIndex)
      if (isSensitiveQueryKey(key)) {
        return prefix + key + '=[REDACTED]'
      }
      return match
    },
  )
}

// ── Header redaction ─────────────────────────────────────────────────────

function isSensitiveHeaderName(name: string): boolean {
  const lower = name.toLowerCase()

  if (
    lower === 'authorization' ||
    lower === 'api-key' ||
    lower === 'x-api-key' ||
    lower === 'x-app' ||
    lower === 'x-client-app'
  ) {
    return true
  }

  if (
    lower.startsWith('x-anthropic-') ||
    lower.startsWith('anthropic-') ||
    lower.startsWith('x-claude-')
  ) {
    return true
  }

  return false
}

/**
 * Redact sensitive header values.
 * Header matching is case-insensitive.
 * Preserves non-sensitive header values unchanged.
 */
export function redactHeaders(
  headers: Record<string, string | undefined>,
): Record<string, string | undefined> {
  const result: Record<string, string | undefined> = {}

  for (const [key, value] of Object.entries(headers)) {
    result[key] = isSensitiveHeaderName(key) ? '[REDACTED]' : value
  }

  return result
}

// ── Error message redaction ──────────────────────────────────────────────

/**
 * Redact sensitive values from an error message.
 * Handles Bearer tokens, Authorization header values, API key style values,
 * and sensitive URL query values.
 * Never throws — returns a safe fallback string if redaction itself fails.
 */
export function redactErrorMessage(error: unknown): string {
  let message: string

  if (error instanceof Error) {
    message = error.message
  } else if (typeof error === 'string') {
    message = error
  } else {
    try {
      message = String(error)
    } catch {
      return '[error redacted]'
    }
  }

  try {
    // Bearer tokens: "Bearer sk-abc123"
    message = message.replace(/\bBearer\s+\S+/gi, 'Bearer [REDACTED]')

    // Authorization header values: "Authorization: Basic xyz"
    message = message.replace(
      /\bAuthorization\s*:\s*\S+/gi,
      'Authorization: [REDACTED]',
    )

    // API key style: "api_key=sk-abc" or "apiKey: sk-abc"
    message = message.replace(
      /\b(?:api[-_]?key|apikey)\s*[=:]\s*\S+/gi,
      (match) => {
        const eqIdx = match.indexOf('=')
        const colonIdx = match.indexOf(':')
        let sepIndex = -1
        if (eqIdx >= 0 && colonIdx >= 0) {
          sepIndex = Math.min(eqIdx, colonIdx)
        } else if (eqIdx >= 0) {
          sepIndex = eqIdx
        } else if (colonIdx >= 0) {
          sepIndex = colonIdx
        }
        if (sepIndex >= 0) {
          return match.slice(0, sepIndex + 1) + ' [REDACTED]'
        }
        return '[REDACTED]'
      },
    )

    // Sensitive URL query params: ?key=value or &token=value
    message = message.replace(
      /([?&])(?:key|api_key|apikey|token|access_token|secret|password|credential)=[^&\s#]+/gi,
      (match, prefix: string) => {
        const eqIndex = match.indexOf('=')
        if (eqIndex >= 0) {
          return match.slice(0, eqIndex + 1) + '[REDACTED]'
        }
        return prefix + '[REDACTED]'
      },
    )

    return message
  } catch {
    return '[error redacted]'
  }
}
