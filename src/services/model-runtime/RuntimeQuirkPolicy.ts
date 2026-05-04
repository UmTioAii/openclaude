// PR1 — Managed Adapter Runtime: RuntimeQuirkPolicy
// Pure policy module for runtime payload/endpoint quirks.
// No provider network calls, no request sending, no bridge edits, no services/api imports.

import type { RuntimeModelCapabilities } from './types.js'

/**
 * Policy for applying payload quirks based on RuntimeModelCapabilities.
 * All functions are pure — no side effects, no mutation of input objects.
 */

/**
 * Remove configured body fields from a payload object.
 * Returns a shallow copy with the specified fields omitted.
 * Does NOT mutate the original body.
 */
export function removeBodyFields(
  body: Record<string, unknown>,
  fieldsToRemove: string[],
): Record<string, unknown> {
  if (!fieldsToRemove || fieldsToRemove.length === 0) {
    return { ...body }
  }

  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(body)) {
    if (!fieldsToRemove.includes(key)) {
      result[key] = value
    }
  }
  return result
}

/**
 * Map a token value to the configured max-tokens field name.
 * If the body already uses the correct field, return a shallow copy as-is.
 * If the body uses a different max-tokens field name, remap the value.
 * Does NOT mutate the original body.
 */
export function applyMaxTokensField(
  body: Record<string, unknown>,
  maxTokensField: 'max_tokens' | 'max_completion_tokens',
): Record<string, unknown> {
  const result = { ...body }

  const altField: 'max_tokens' | 'max_completion_tokens' =
    maxTokensField === 'max_tokens' ? 'max_completion_tokens' : 'max_tokens'

  if (altField in result && !(maxTokensField in result)) {
    result[maxTokensField] = result[altField]
    delete result[altField]
  }

  return result
}

/**
 * Apply the reasoning field from capabilities to a payload.
 * Only sets the reasoning field when explicitly provided in capabilities.
 * Does NOT silently enable effort/thinking.
 * Does NOT add provider-specific reasoning payloads.
 * Does NOT mutate the original body.
 */
export function applyReasoningField(
  body: Record<string, unknown>,
  reasoningField: string | undefined,
  reasoningValue: unknown,
): Record<string, unknown> {
  if (!reasoningField || reasoningValue === undefined) {
    return { ...body }
  }

  return { ...body, [reasoningField]: reasoningValue }
}

/**
 * Read the preserveReasoningContent flag from capabilities.
 * Pure accessor — returns the boolean flag value, defaulting to false.
 */
export function shouldPreserveReasoningContent(
  capabilities: RuntimeModelCapabilities,
): boolean {
  return capabilities.payload.preserveReasoningContent ?? false
}

/**
 * Read the requireReasoningContentOnAssistantMessages flag from capabilities.
 * Pure accessor — returns the boolean flag value, defaulting to false.
 */
export function shouldRequireReasoningContentOnAssistantMessages(
  capabilities: RuntimeModelCapabilities,
): boolean {
  return capabilities.payload.requireReasoningContentOnAssistantMessages ?? false
}

/**
 * Read the supportsSystemRole flag from capabilities.
 * Pure accessor — returns the boolean flag value, defaulting to false.
 * Conservative: unless explicitly set to true, returns false.
 */
export function supportsSystemRole(
  capabilities: RuntimeModelCapabilities,
): boolean {
  return capabilities.payload.supportsSystemRole ?? false
}

/**
 * Read the supportsUserCustomHeaders flag from capabilities.
 * Pure accessor — returns the boolean flag value, defaulting to false.
 * Conservative: unless explicitly set to true, returns false.
 */
export function supportsUserCustomHeaders(
  capabilities: RuntimeModelCapabilities,
): boolean {
  return capabilities.payload.supportsUserCustomHeaders ?? false
}

/**
 * Apply all quirk policies to a payload body based on capabilities.
 * Returns a new shallow-copied body object — never mutates the original.
 * Does not silently enable effort/thinking.
 * Does not add provider-specific reasoning payloads.
 */
export function applyQuirkPolicy(
  body: Record<string, unknown>,
  capabilities: RuntimeModelCapabilities,
): Record<string, unknown> {
  let result = { ...body }

  // Remove configured body fields.
  if (capabilities.payload.removeBodyFields?.length) {
    result = removeBodyFields(result, capabilities.payload.removeBodyFields)
  }

  // Map max tokens to the correct field.
  result = applyMaxTokensField(result, capabilities.payload.maxTokensField)

  return result
}
