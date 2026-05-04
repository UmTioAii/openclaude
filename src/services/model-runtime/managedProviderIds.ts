import type { ManagedProviderId } from './types.js'

export const MANAGED_PROVIDER_IDS: readonly ManagedProviderId[] = [
  'codex',
  'gemini',
  'nvidia-nim',
  'openrouter',
] as const

export function isManagedProviderId(
  value: unknown,
): value is ManagedProviderId {
  return (
    typeof value === 'string' &&
    (MANAGED_PROVIDER_IDS as readonly string[]).includes(value)
  )
}
