// PR1 — Managed Adapter Runtime: RuntimeEndpointBuilder
// Pure endpoint construction helpers.
// No network calls, no env reads, no secret encoding, no services/api or bridge imports.

import type { RuntimeModelCapabilities } from './types.js'

/** Endpoint kind — mirrors RuntimeModelCapabilities.payload.endpoint. */
export type RuntimeEndpointKind =
  RuntimeModelCapabilities['payload']['endpoint']

/**
 * Build a deterministic endpoint URL from a normalized base URL and endpoint kind.
 *
 * - Appends the correct path segment for the given endpoint kind.
 * - Avoids double-appending (if the base already ends with the target path).
 * - Avoids duplicate slashes.
 * - Preserves base /v1 when appropriate.
 * - Does not mutate input.
 *
 * For gemini_native: the PR1 plan does not define a concrete endpoint URL pattern
 * in this slice. The function returns the normalized base URL as-is, since Gemini
 * native API routing will be handled by the Gemini adapter in a future phase.
 */
export function buildRuntimeEndpoint(
  normalizedBaseUrl: string,
  endpointKind: RuntimeEndpointKind,
): string {
  if (typeof normalizedBaseUrl !== 'string' || normalizedBaseUrl.trim() === '') {
    return ''
  }

  const base = normalizedBaseUrl.replace(/\/+$/, '')

  switch (endpointKind) {
    case 'chat_completions':
      return appendPath(base, '/chat/completions')
    case 'responses':
      return appendPath(base, '/responses')
    case 'codex_responses':
      // Codex uses the Responses API — same /responses path.
      return appendPath(base, '/responses')
    case 'anthropic_messages':
      return appendPath(base, '/messages')
    case 'gemini_native':
      // The PR1 plan does not define a concrete Gemini native endpoint URL
      // in this implementation slice. Return the normalized base URL as-is.
      // Gemini model-specific generateContent paths belong to the adapter phase.
      return base
    default:
      return base
  }
}

/**
 * Append a path segment to a base URL, avoiding duplicate slashes
 * and double-appending when the base already ends with the target path.
 */
function appendPath(base: string, path: string): string {
  // Avoid double-append: if the base already ends with the exact path, return as-is.
  if (base.endsWith(path)) {
    return base
  }

  // Avoid duplicate slash: if base ends with '/' and path starts with '/',
  // strip the leading slash from path.
  if (base.endsWith('/') && path.startsWith('/')) {
    return base + path.slice(1)
  }

  // If base does not end with '/' and path does not start with '/',
  // join with a single '/'.
  if (!base.endsWith('/') && !path.startsWith('/')) {
    return base + '/' + path
  }

  return base + path
}
