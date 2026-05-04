import { describe, it, expect } from 'bun:test'

import { LegacyRuntimePassthroughAdapter } from '../adapters/legacy/LegacyRuntimePassthroughAdapter.js'

import type { RuntimeSetupInput } from '../types.js'

function makeInput(
	overrides: Partial<RuntimeSetupInput> = {},
): RuntimeSetupInput {
	return {
		routeId: 'test-route',
		providerInput: {
			providerId: 'custom-provider',
			baseUrl: 'https://example.com/v1',
			model: '',
		},
		descriptor: {
			id: 'test-gateway',
			label: 'Test Gateway',
			defaultModel: 'test-default-model',
			setup: { requiresAuth: false, authMode: 'none' },
			transportConfig: {
				kind: 'openai-compatible',
				baseUrl: 'https://example.com',
			},
		} as any,
		catalogEntry: undefined,
		processEnv: {},
		...overrides,
	}
}

describe('LegacyRuntimePassthroughAdapter', () => {
	const adapter = new LegacyRuntimePassthroughAdapter()

	describe('id and label', () => {
		it('id is "legacy-passthrough"', () => {
			expect(adapter.id).toBe('legacy-passthrough')
		})

		it('label is stable and simple', () => {
			expect(adapter.label).toBe('Legacy Passthrough')
		})
	})

	describe('supportsRoute', () => {
		it('always returns true', () => {
			expect(adapter.supportsRoute('anything', {} as any)).toBe(true)
		})
	})

	describe('validateSetup', () => {
		it('returns ok: true', async () => {
			const result = await adapter.validateSetup(makeInput())
			expect(result.ok).toBe(true)
		})

		it('returns capabilities when ok', async () => {
			const result = await adapter.validateSetup(makeInput())
			if (result.ok) {
				expect(result.capabilities).toBeDefined()
			}
		})
	})

	describe('verifyStartup', () => {
		it('returns ok: true', async () => {
			const result = await adapter.verifyStartup(makeInput())
			expect(result.ok).toBe(true)
		})

		it('returns capabilities when ok', async () => {
			const result = await adapter.verifyStartup(makeInput())
			if (result.ok) {
				expect(result.capabilities).toBeDefined()
			}
		})
	})

	describe('resolveCapabilities', () => {
		it('returns conservative legacy capabilities', async () => {
			const caps = await adapter.resolveCapabilities(makeInput())
			expect(caps.confidence).toBe('legacy_bridge')
			expect(caps.availability.verifiedBy).toBe('legacy_bridge')
			expect(caps.availability.checked).toBe(false)
			expect(caps.availability.exists).toBe(true)
			expect(caps.availability.active).toBe(true)
		})

		it('returns effort.supported as false', async () => {
			const caps = await adapter.resolveCapabilities(makeInput())
			expect(caps.effort.supported).toBe(false)
		})

		it('returns effort.allowAutoMax as false', async () => {
			const caps = await adapter.resolveCapabilities(makeInput())
			expect(caps.effort.allowAutoMax).toBe(false)
		})

		it('returns effort.mode as "none"', async () => {
			const caps = await adapter.resolveCapabilities(makeInput())
			expect(caps.effort.mode).toBe('none')
		})

		it('returns effort.nativeValues as empty array', async () => {
			const caps = await adapter.resolveCapabilities(makeInput())
			expect(caps.effort.nativeValues).toEqual([])
		})

		it('returns effort.defaultAbstractEffort as "none"', async () => {
			const caps = await adapter.resolveCapabilities(makeInput())
			expect(caps.effort.defaultAbstractEffort).toBe('none')
		})

		it('returns effort.maxAutoAbstractEffort as "none"', async () => {
			const caps = await adapter.resolveCapabilities(makeInput())
			expect(caps.effort.maxAutoAbstractEffort).toBe('none')
		})

		it('returns effort.autoStrategy as "openclaude_decides"', async () => {
			const caps = await adapter.resolveCapabilities(makeInput())
			expect(caps.effort.autoStrategy).toBe('openclaude_decides')
		})
	})

	describe('model resolution', () => {
		it('preserves explicit providerInput.model', async () => {
			const caps = await adapter.resolveCapabilities(
				makeInput({
					providerInput: { providerId: 'custom', baseUrl: 'https://example.com/v1', model: 'my-explicit-model' },
				}),
			)
			expect(caps.model.requested).toBe('my-explicit-model')
			expect(caps.model.resolvedApiName).toBe('my-explicit-model')
		})

		it('falls back to catalogEntry.apiName when providerInput.model is empty', async () => {
			const caps = await adapter.resolveCapabilities(
				makeInput({
					providerInput: { providerId: 'custom', baseUrl: 'https://example.com/v1', model: '' },
					catalogEntry: {
						id: 'some-id',
						apiName: 'catalog-model',
					} as any,
				}),
			)
			expect(caps.model.requested).toBe('catalog-model')
			expect(caps.model.resolvedApiName).toBe('catalog-model')
		})

		it('falls back to descriptor.defaultModel when catalogEntry is missing', async () => {
			const caps = await adapter.resolveCapabilities(
				makeInput({
					providerInput: { providerId: 'custom', baseUrl: 'https://example.com/v1', model: '' },
					catalogEntry: undefined,
				}),
			)
			expect(caps.model.requested).toBe('test-default-model')
			expect(caps.model.resolvedApiName).toBe('test-default-model')
		})

		it('falls back to "unknown" when all sources are missing', async () => {
			const caps = await adapter.resolveCapabilities(
				makeInput({
					providerInput: { providerId: 'custom', baseUrl: 'https://example.com/v1', model: '' },
					descriptor: {
						id: 'no-model',
						label: 'No Model',
						setup: { requiresAuth: false, authMode: 'none' },
						transportConfig: {
							kind: 'openai-compatible',
							baseUrl: 'https://example.com',
						},
					} as any,
					catalogEntry: undefined,
				}),
			)
			expect(caps.model.requested).toBe('unknown')
			expect(caps.model.resolvedApiName).toBe('unknown')
			expect(caps.model.source).toBe('fallback')
		})

		it('does not replace explicit model with catalog default', async () => {
			const caps = await adapter.resolveCapabilities(
				makeInput({
					providerInput: { providerId: 'custom', baseUrl: 'https://example.com/v1', model: 'my-model' },
					catalogEntry: {
						id: 'some-id',
						apiName: 'catalog-model',
					} as any,
				}),
			)
			expect(caps.model.resolvedApiName).toBe('my-model')
		})
	})

	describe('capabilities from catalogEntry', () => {
		it('enables tools when catalogEntry supports function calling', async () => {
			const caps = await adapter.resolveCapabilities(
				makeInput({
					catalogEntry: {
						id: 'some-id',
						apiName: 'fn-model',
						capabilities: { supportsFunctionCalling: true },
					} as any,
				}),
			)
			expect(caps.tools.supported).toBe(true)
			expect(caps.tools.format).toBe('openai')
		})

		it('disables tools when catalogEntry does not support function calling', async () => {
			const caps = await adapter.resolveCapabilities(
				makeInput({
					catalogEntry: {
						id: 'some-id',
						apiName: 'no-fn-model',
						capabilities: {},
					} as any,
				}),
			)
			expect(caps.tools.supported).toBe(false)
			expect(caps.tools.format).toBe('none')
		})

		it('enables thinking when catalogEntry supports reasoning', async () => {
			const caps = await adapter.resolveCapabilities(
				makeInput({
					catalogEntry: {
						id: 'some-id',
						apiName: 'reasoning-model',
						capabilities: { supportsReasoning: true },
					} as any,
				}),
			)
			expect(caps.thinking.supported).toBe(true)
			expect(caps.thinking.mode).toBe('provider_specific')
		})

		it('disables thinking when catalogEntry does not support reasoning', async () => {
			const caps = await adapter.resolveCapabilities(
				makeInput({
					catalogEntry: {
						id: 'some-id',
						apiName: 'no-reasoning-model',
						capabilities: {},
					} as any,
				}),
			)
			expect(caps.thinking.supported).toBe(false)
			expect(caps.thinking.mode).toBe('none')
		})
	})

	describe('no buildPayload', () => {
		it('does not implement buildPayload', () => {
			expect((adapter as any).buildPayload).toBeUndefined()
		})
	})
})
