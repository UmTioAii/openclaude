// PR1 — Managed Adapter Runtime: RuntimeEndpointNormalizer
// Deterministic, side-effect-free normalizer for user-provided baseUrl values.

/** Endpoints that users commonly paste in full instead of providing just the base URL. */
const ACCIDENTAL_ENDPOINT_SUFFIXES = [
  '/chat/completions',
  '/v1/chat/completions',
  '/completions',
  '/v1/completions',
  '/responses',
  '/v1/responses',
] as const

/**
 * Result of normalizing a user-provided base URL.
 * Carries enough metadata for tests and callers to determine whether normalization
 * changed the input, without exposing any sensitive information.
 */
export type RuntimeEndpointNormalizationResult = {
  /** The normalized base URL. */
  normalized: string
  /** Whether the input was changed during normalization. */
  changed: boolean
}

/**
 * Normalize a user-provided baseUrl value.
 *
 * - Trims whitespace.
 * - Removes trailing slashes.
 * - Strips duplicated endpoint suffixes when users provide full endpoint URLs
 *   instead of provider base URLs (e.g. https://api.example.com/v1/chat/completions → https://api.example.com/v1).
 * - Preserves legitimate version base paths such as https://api.example.com/v1.
 *
 * Must NOT:
 * - Perform network calls.
 * - Read environment variables.
 * - Log secrets or any other data.
 * - Throw on invalid or partial input.
 */
export function normalizeRuntimeEndpoint(
  baseUrl: string,
): RuntimeEndpointNormalizationResult {
  if (typeof baseUrl !== 'string') {
    return { normalized: '', changed: true }
  }

  let current = baseUrl.trim()

  if (current.length === 0) {
    return { normalized: '', changed: baseUrl.length > 0 }
  }

  // Remove trailing slashes (one or more).
  const afterTrailingSlash = current.replace(/\/+$/, '')

  // Strip accidental endpoint suffixes.
  // Endpoint-tail suffixes (e.g. /chat/completions) are intentionally matched
  // first — this preserves legitimate version base paths such as /v1.
  // /v1 must not be stripped when it is the intended API base.
  let stripped = afterTrailingSlash
  for (const suffix of ACCIDENTAL_ENDPOINT_SUFFIXES) {
    if (stripped.endsWith(suffix)) {
      stripped = stripped.slice(0, -suffix.length)
      break
    }
  }

  // Remove any trailing slash that may have been exposed by stripping.
  stripped = stripped.replace(/\/+$/, '')

  const changed = stripped !== baseUrl

  return { normalized: stripped, changed }
}
