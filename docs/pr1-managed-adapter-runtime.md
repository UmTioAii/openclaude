# OpenClaude · PR 1: Adapter Runtime
**Unified context document — specification, architecture, fixes, and readiness checklist.**
**Revised against `main` @ internal target v0.8.0 (May 2026).**

> All identified bugs and mandatory fixes are already integrated into this spec.
> Fixed items are tagged `[FIX]`. Corrections introduced by the previous revision are tagged `[REV]`.
> Corrections introduced by THIS revision (grounded in the actual repo at github.com/Gitlawb/openclaude)
> are tagged `[REV2]`.
> This document is the authoritative reference for the PR-Adapter implementation.

---

## Table of Contents

1. [Objective](#1-objective)
2. [Current Repository Reality](#2-current-repository-reality)
3. [Architectural Contract with PR #910](#3-architectural-contract-with-pr-910)
4. [First Rollout: Providers](#4-first-rollout-providers)
5. [Directory Structure](#5-directory-structure)
6. [Module Responsibilities](#6-module-responsibilities)
7. [Core Types](#7-core-types)
8. [User Input Capture at `/provider`](#8-user-input-capture-at-provider)
9. [Capability Resolution Order](#9-capability-resolution-order)
10. [Provider: NVIDIA NIM](#10-provider-nvidia-nim)
11. [Provider: Gemini](#11-provider-gemini)
12. [Provider: Codex](#12-provider-codex)
13. [Provider: OpenRouter](#13-provider-openrouter)
14. [OpenRouter Profile & Wizard](#14-openrouter-profile--wizard)
15. [Error Handling & Severity](#15-error-handling--severity)
16. [Security Rules](#16-security-rules)
17. [Safe Probe](#17-safe-probe)
18. [Payload Migration Scope](#18-payload-migration-scope)
19. [Commit Sequence](#19-commit-sequence)
20. [Minimum Test Coverage](#20-minimum-test-coverage)
21. [PR Readiness Checklist](#21-pr-readiness-checklist)
22. [Definition of Done](#22-definition-of-done)

---

## 1. Objective

Build a runtime layer for provider/model resolution that is compatible with the descriptor-first
architecture introduced in PR #910, without creating a parallel registry and without breaking
existing providers.

### This PR delivers

- Secure user input capture at `/provider`
- Integration with `src/integrations` from PR #910
- Runtime adapters for 4 selected providers
- Validation of `provider` / `baseUrl` / `model` / `apiKey` / `token`
- One-time startup verification per `openclaude` initialization
- Safe resolution and caching of `RuntimeModelCapabilities`
- Remote `/models` and `/metadata` fetching where applicable
- Conservative fallback when metadata/capabilities are incomplete
- Scaffold for `buildPayload` per provider (optional — outside first rollout)
- Strict protection of keys, tokens, custom headers, and sensitive URLs

### This PR does NOT implement

The following belong to **PR 2 — Effort/Thinking**:

- Final `ReasoningDecisionPlanner`
- Final `TaskComplexityAnalyzer`
- `/thinking` command
- Auto effort/thinking per prompt
- Aggressive payload changes across providers

---

## 2. Current Repository Reality

> **[REV] This section was missing from the original document.**
> It documents the actual state of `main`. All implementation decisions must be grounded in this
> reality, verified against the actual files at github.com/Gitlawb/openclaude.

### Version note

> **[REV2] The "v0.8.0" label in this document's header is an internal planning target, NOT a
> published git tag.** The Gitlawb/openclaude repository has no public releases. Do not reference
> "v0.8.0" as a tag in any git command or branch strategy. Use `main` HEAD as the baseline.

### What exists in `main` today

**`src/` directory (actual top-level folders):**

```
__tests__   assistant   bootstrap   bridge      buddy
cli         commands    components  constants   context
coordinator entrypoints grpc        hooks       ink
keybindings memdir      migrations  moreright   native-ts
outputStyles plugins    proto       query       remote
utils                              ← [REV2] confirmed via test scripts
```

> **[REV2] `src/utils/` is confirmed to exist** with at minimum:
> `providerProfile.ts`, `providerProfile.test.ts`, `providerRecommendation.ts`,
> `providerRecommendation.test.ts`, `providerSecrets.ts`, `context.test.ts`.
> It was omitted from the spec's top-level folder list in error.

**What does NOT exist:**

```
src/integrations/        ← DOES NOT EXIST — will come from PR #910
src/services/model-runtime/  ← DOES NOT EXIST — entirely net-new in this PR
```

**What DOES exist that was previously claimed absent:**

```
src/services/api/        ← [REV2] EXISTS — confirmed by package.json test:provider script:
                            "bun test src/services/api/*.test.ts src/utils/context.test.ts"
                            src/services/ itself is not fully absent; only model-runtime/ is net-new.
```

**What exists in `scripts/`:**

```
build.ts
feature-flags-source-guard.test.ts
generate-integrations-artifacts.ts   ← likely the generator for PR #910 artifacts
grpc-cli.ts
no-telemetry-growthbook-stub.test.ts
no-telemetry-plugin.ts
pr-intent-scan.test.ts
pr-intent-scan.ts
provider-bootstrap.ts
provider-discovery.ts
provider-launch.ts
system-check.ts                      ← [REV2] EXISTS — used by doctor:runtime, missing from prev spec
```

**What exists in `src/utils/` (confirmed via package.json test scripts):**

```
providerProfile.ts      ← profile system exists today
providerProfile.test.ts
providerRecommendation.ts
providerRecommendation.test.ts
providerSecrets.ts      ← secret handling exists today
context.test.ts         ← [REV2] additional util file present
```

**What exists in `docs/`:**

```
docs/integrations/   ← documentation for integrations already present
docs/architecture/
docs/advanced-setup.md   ← [REV2] exists; contains authoritative Codex probe behavior
```

### Current provider model (actual behavior in main)

| Provider    | Activation today                                                     |
|-------------|----------------------------------------------------------------------|
| OpenAI      | `CLAUDE_CODE_USE_OPENAI=1` + `OPENAI_API_KEY` + `OPENAI_MODEL`      |
| Gemini      | `CLAUDE_CODE_USE_GEMINI=1` + `GEMINI_API_KEY` + `GEMINI_MODEL`      |
| Codex       | `CLAUDE_CODE_USE_OPENAI=1` + `OPENAI_MODEL=codexplan\|codexspark`   |
| Ollama      | `CLAUDE_CODE_USE_OPENAI=1` + `OPENAI_BASE_URL=localhost:11434/v1`   |
| OpenRouter  | `CLAUDE_CODE_USE_OPENAI=1` + `OPENAI_BASE_URL=openrouter.ai/api/v1` |
| NVIDIA NIM  | No dedicated first-class path — routes through OpenAI shim           |
| Atomic Chat | Dedicated path via `CLAUDE_CODE_USE_OPENAI=1` + local URL            |
| Mistral     | `CLAUDE_CODE_USE_MISTRAL=1`  ← [REV2] confirmed in doctor:runtime   |

> **[REV2] NVIDIA NIM clarification:** There is no dedicated activation flag for NVIDIA NIM.
> It currently enters via the OpenAI shim with `OPENAI_BASE_URL` pointing at the NIM endpoint.
> This PR introduces it as a first-class provider with its own adapter and env vars.

**Critical observations:**
- **OpenRouter routes through the OpenAI shim today.** This PR makes it a distinct provider.
- **NVIDIA NIM has no dedicated path today.** This PR introduces it.
- **Codex is identified by model alias** (`codexplan`, `codexspark`) within the OpenAI shim.
- **The existing `src/bridge/` shim layer is live and stable.** Must not be broken.
- **[REV2] `src/services/api/` already exists.** The new `src/services/model-runtime/`
  directory is net-new, but it is a sibling of an existing directory, not a brand-new tree.

### Current Codex model aliases (updated)

```
codexplan  → GPT-5.5 (high reasoning)
codexspark → GPT-5.3 Codex Spark (fast loops)
```

These can change. The `isCodexAlias()` function in the existing bridge is the authoritative
check — always use it, never hardcode alias strings.

### Codex startup probe behavior

> **[REV2] CRITICAL CORRECTION — the previous spec incorrectly stated that Codex does not probe.**
>
> `docs/advanced-setup.md` (authoritative source in the actual repo) states explicitly:
>
> > "Codex profiles validate CODEX_API_KEY or the Codex CLI auth file and **probe POST /responses
> > instead of GET /models**."
>
> Codex DOES probe at startup. It uses `POST /responses` on the Codex Responses API endpoint,
> not `GET /models`. The fix in section 12 and section 17 has been updated accordingly.
> The phrase "no probe" in all previous versions of this spec was wrong and must not be used.

---

## 3. Architectural Contract with PR #910

### PR #910 status

> **[REV] PR #910 is OPEN, NOT MERGED as of the date of this document.**
> Title: "Registry-Based Integration Architecture for Providers, Gateways, and Models"
> Author: jatmn (Contributor)
> Date opened: April 26, 2026

**This is the hardest dependency in the entire plan.** The PR-Adapter branch:

1. **Must be based on the commit where PR #910 merges into `main`.**
2. **Cannot be compiled or tested against `main` before #910 merges.**
3. **Must not reimplement what #910 introduces.**

### Pre-merge development strategy

While PR #910 is still open, the PR-Adapter branch must define **local stub interfaces** for
every symbol it will consume from `src/integrations/`. These stubs live in a temporary file:

```
src/services/model-runtime/_pr910-stubs.ts   ← DELETE after #910 merge
```

When #910 merges, delete the stubs file and point all imports to `src/integrations/`.
If the symbols exported by #910 differ from what the stubs declared, resolve conflicts before
opening the PR-Adapter for review.

### Symbols the PR-Adapter will consume from PR #910

These must match exactly what #910 exports. Verify before opening PR-Adapter:

```ts
// From src/integrations/ (PR #910)
resolveActiveRouteIdFromEnv(env: NodeJS.ProcessEnv): string | null
resolveRouteIdFromBaseUrl(baseUrl: string): string | null
getRouteDescriptor(routeId: string): RouteDescriptor | null
getRouteDefaultModel(routeId: string): string | null
getRouteCredentialValue(routeId: string, env: NodeJS.ProcessEnv): string | null
getTransportKindForRoute(routeId: string): TransportKind
resolveOpenAIShimRuntimeContext(input: RuntimeSetupInput): OpenAIShimRuntimeContext | null
```

### Responsibility boundary

```
src/integrations/          → declarative source of truth (PR #910)
src/services/model-runtime → validation, remote metadata, capabilities, payload runtime (this PR)
src/services/api/          → [REV2] already exists; do not modify unless explicitly in scope
```

### Do NOT do

```
- Do not create a ProviderAdapterRegistry that reimplements the provider list
- Do not duplicate the main model catalog inside adapters
- Do not resolve providers by baseUrl heuristics when #910 already resolves routeId
- Do not treat Gemini / Codex / NVIDIA / OpenRouter as generic OpenAI-compatible
- Do not break or modify src/bridge/ — it remains the shim layer
- Do not delete or replace src/utils/providerSecrets.ts — reuse it
- Do not delete or replace src/utils/providerProfile.ts — extend it
- Do not modify src/services/api/ — it is out of scope for this PR   ← [REV2]
```

### Do

```
- Wrap src/bridge/ — do not replace it
- Reuse providerSecrets.ts masking functions in RuntimeSecurity
- Extend providerProfile.ts to add 'openrouter' and 'nvidia-nim' profiles
- Use scripts/generate-integrations-artifacts.ts output when available
```

---

## 4. First Rollout: Providers

```
1. NVIDIA NIM     ← net-new first-class provider in this PR
2. Gemini         ← existing, being formalized in runtime layer
3. Codex          ← existing, being formalized in runtime layer
4. OpenRouter     ← existing (OpenAI shim), being promoted to unique provider
```

Each must be treated as a **unique provider**, regardless of transport:

| Provider    | Current status in main               | Note in this PR                                     |
|-------------|--------------------------------------|-----------------------------------------------------|
| NVIDIA NIM  | No dedicated flag — uses OpenAI shim | Introduced as unique first-class provider           |
| Gemini      | Separate flag `CLAUDE_CODE_USE_GEMINI=1` | Formalized with runtime descriptor            |
| Codex       | OpenAI shim + model alias            | Promoted to unique provider via `isCodexAlias()`    |
| OpenRouter  | OpenAI shim + baseUrl                | Promoted to unique provider with own profile        |

**Generic/custom OpenAI-compatible providers are out of scope for this PR.**
They continue through the existing legacy path until a future PR.

**[REV] Breaking constraint:** The existing shim paths for Gemini, Codex, and OpenRouter
must remain functional during and after this PR. The runtime layer sits above them; it does
not replace them.

---

## 5. Directory Structure

```
src/services/model-runtime/         ← NET-NEW subdirectory (src/services/ exists; model-runtime/ does not)
  ModelRuntimeCoordinator.ts
  RuntimeAdapterRegistry.ts
  RuntimeCapabilityResolver.ts
  RuntimeCapabilityCache.ts
  ProviderStartupVerifier.ts
  RuntimeSecurity.ts
  types.ts
  _pr910-stubs.ts                   ← TEMPORARY: delete after PR #910 merge

src/services/model-runtime/adapters/
  nvidia/
    NvidiaNimRuntimeAdapter.ts
    nvidiaRemoteMetadata.ts
    nvidiaCapabilities.ts

  gemini/
    GeminiRuntimeAdapter.ts
    geminiRemoteMetadata.ts
    geminiCapabilities.ts

  codex/
    CodexRuntimeAdapter.ts
    codexLegacyBridge.ts
    codexCapabilities.ts

  openrouter/
    OpenRouterRuntimeAdapter.ts
    openRouterRemoteMetadata.ts
    openRouterCapabilities.ts

  legacy/
    LegacyRuntimePassthroughAdapter.ts
```

> **[REV2] `src/services/` already exists** (it contains `src/services/api/`). The
> `model-runtime/` subdirectory is net-new. Do not describe or treat `src/services/` itself
> as absent when writing commit messages, PR descriptions, or branch setup steps.

**Files to MODIFY (not create):**

```
src/utils/providerProfile.ts     ← add 'openrouter', 'nvidia-nim' to ProviderProfile union
src/utils/providerSecrets.ts     ← add OPENROUTER_API_KEY, NVIDIA_API_KEY to SECRET_ENV_KEYS
src/bootstrap/                   ← integrate ProviderStartupVerifier at startup
src/commands/provider.ts         ← integrate ModelRuntimeCoordinator into /provider command
```

**Files to NOT modify:**

```
src/services/api/                ← [REV2] out of scope; do not touch
```

---

## 6. Module Responsibilities

### 6.1 `ModelRuntimeCoordinator`

Orchestrates the runtime flow.

**Responsible for:**

```
- Receiving routeId / descriptor / baseUrl / model / auth / env
- Querying #910 descriptor/catalog
- Selecting a RuntimeProviderAdapter
- Executing validateSetup() at /provider
- Executing verifyStartup() at boot
- Resolving RuntimeModelCapabilities
- Caching capabilities
- Calling buildPayload() from runtime adapter (PR 2+ only)
```

**Must NOT know:**

```
- Codex uses POST /responses for startup probe
- Gemini uses GEMINI_AUTH_MODE
- NVIDIA uses /metadata
- OpenRouter uses OPENROUTER_API_KEY
- Provider X uses reasoning.effort
```

These details belong exclusively to the runtime adapters.

**[FIX] Cache invalidation on provider switch:**

When a `routeId` or `model` change is received via `/provider`, invalidate cache and re-run startup:

```ts
async onProviderChanged(newInput: RuntimeSetupInput): Promise<void> {
  this.capabilityCache.invalidate(previousKey)
  await this.startupVerifier.verify(newInput)
}
```

Without this, the startup verifier is not re-run when switching providers mid-session, leaving
stale capabilities in cache.

---

### 6.2 `RuntimeAdapterRegistry`

Not a new provider registry. It is only a registry of runtime executors.

**Mandatory resolution order (enforced by test — see section 20):**

```
1. CodexRuntimeAdapter
2. GeminiRuntimeAdapter
3. NvidiaNimRuntimeAdapter
4. OpenRouterRuntimeAdapter
5. LegacyRuntimePassthroughAdapter
```

Codex, Gemini, NVIDIA, and OpenRouter may appear OpenAI-compatible at the transport level, but
must be intercepted as unique providers before any fallback occurs.

**[FIX] `LegacyRuntimePassthroughAdapter` as an instance, not a class reference:**

```ts
export class RuntimeAdapterRegistry {
  // [FIX] private instance, not a class reference
  private readonly fallback = new LegacyRuntimePassthroughAdapter()

  constructor(private readonly adapters: RuntimeProviderAdapter[]) {}

  resolve(input: {
    routeId: string
    descriptor: RouteDescriptor
  }): RuntimeProviderAdapter {
    const matched = this.adapters.find(adapter =>
      adapter.supportsRoute(input.routeId, input.descriptor),
    )
    return matched ?? this.fallback
  }
}
```

**[REV] `getAdapters()` must be exposed for testing:**

```ts
getAdapters(): RuntimeProviderAdapter[] {
  return [...this.adapters, this.fallback]
}
```

---

### 6.3 `ProviderStartupVerifier`

Runs a lightweight verification once when `openclaude` starts.

**Responsible for:**

```
- Loading the saved provider profile
- Resolving routeId/descriptor
- Selecting the runtime adapter
- Lightweight validation of auth / model / baseUrl
- For Codex: probe via POST /responses (not GET /models)    ← [REV2]
- For others: GET /models or equivalent where required
- Updating and caching capabilities
```

**Must NOT do:**

```
- Decide effort/thinking
- Build prompt payloads
```

**Startup flow:**

```
openclaude start
  ↓
load saved profile/env (.openclaude-profile.json or shell env)
  ↓
resolve routeId via src/integrations (PR #910)
  ↓
get descriptor/catalog
  ↓
RuntimeAdapterRegistry.resolve()
  ↓
adapter.verifyStartup()
  ↓
cache capabilities
  ↓
main loop
```

**[REV] Integration point:** `ProviderStartupVerifier` must be wired into `src/bootstrap/`
at startup. Identify the exact bootstrap entry point before writing code.

**Timing rules:**

| Trigger     | Behavior                                         |
|-------------|--------------------------------------------------|
| `/provider` | Full validation                                  |
| Startup     | One-time lightweight verification                |
| Per-prompt  | Zero `/models`, zero `/metadata`, zero probe     |

---

### 6.4 `RuntimeCapabilityCache`

Secure cache for resolved capabilities.

**[FIX] Cache key uses a fixed fingerprint algorithm:**

```ts
export type RuntimeCapabilityCacheKey = {
  routeId: string
  baseUrlHash: string
  model: string
  authFingerprint: string
  apiFormat?: string
}
```

**Never store in cache:**

```
apiKey · accessToken · CODEX_API_KEY · GEMINI_ACCESS_TOKEN
GEMINI_API_KEY · GOOGLE_API_KEY · NVIDIA_API_KEY
OPENROUTER_API_KEY · OPENAI_AUTH_HEADER_VALUE · raw custom headers
```

Store only non-reversible fingerprints/hashes.

---

### 6.5 `RuntimeSecurity`

Centralizes all security functions for the runtime layer.

**[FIX] Fixed, documented fingerprint algorithm:**

```ts
// SHA-256, first 16 hex chars — non-reversible, collision acceptable for cache keying
export function createAuthFingerprint(credential: string): string {
  return crypto.createHash('sha256').update(credential).digest('hex').slice(0, 16)
}
```

The algorithm must be fixed and documented so no adapter creates its own fingerprint. Different
algorithms cause constant cache misses.

**Helpers this module must expose:**

```
createAuthFingerprint()       ← SHA-256 / 16 hex chars
createBaseUrlHash()
redactSensitiveUrl()
redactHeaders()
redactErrorMessage()
— prevent logging of raw sensitive metadata
```

**Must reuse existing mechanisms from `src/utils/providerSecrets.ts`:**

```ts
// Import and re-export from RuntimeSecurity — do not duplicate
import {
  maskSecretForDisplay,
  redactSecretValueForDisplay,
  sanitizeApiKey,
  sanitizeProviderConfigValue,
} from '../../utils/providerSecrets'
```

**[REV] `crypto` import:** Use Node's built-in `node:crypto`. Do not add a third-party
dependency. Bun supports Node crypto natively.

**Must respect the custom header blocklist from PR #910:**

```
authorization · api-key · x-api-key · x-app · x-client-app
x-anthropic-* · anthropic-* · x-claude-*
```

---

## 7. Core Types

### 7.1 `RuntimeProviderAdapter`

**[FIX] `buildPayload` is optional — payload migration is out of scope for PR-Adapter:**

```ts
export type RuntimeProviderAdapter = {
  id: string
  label: string

  supportsRoute(routeId: string, descriptor: RouteDescriptor): boolean

  validateSetup(input: RuntimeSetupInput): Promise<RuntimeSetupResult>

  verifyStartup(input: RuntimeStartupInput): Promise<StartupVerificationResult>

  resolveCapabilities(
    input: ResolveRuntimeCapabilitiesInput,
  ): Promise<RuntimeModelCapabilities>

  // [FIX] optional — buildPayload belongs to PR 2+
  buildPayload?(input: BuildRuntimePayloadInput): ProviderPayload

  classifyError?(error: unknown): RuntimeProviderErrorClassification
}
```

If declared as required, all adapters need `throw new Error('not implemented')` stubs, causing
silent runtime failures.

---

### 7.2 `RuntimeSetupInput`

```ts
export type RuntimeSetupInput = {
  routeId: string
  descriptor: RouteDescriptor

  // [REV] RouteDescriptor comes from PR #910's src/integrations/
  // During pre-merge development, use the stub type from _pr910-stubs.ts
  catalogEntry?: ModelCatalogEntry | null

  providerInput: {
    providerId: string
    baseUrl: string
    model: string
    apiKey?: string
    authMode?: string
    apiFormat?: string
  }

  processEnv: NodeJS.ProcessEnv
}
```

---

### 7.3 `RuntimeStartupInput`

```ts
export type RuntimeStartupInput = RuntimeSetupInput & {
  cachedCapabilities?: RuntimeModelCapabilities
}
```

---

### 7.4 `RuntimeModelCapabilities`

```ts
export type RuntimeModelCapabilities = {
  routeId: string
  providerId: string
  providerLabel: string

  model: {
    requested: string
    resolvedApiName: string
    source:
      | 'catalog'
      | 'models_api'
      | 'metadata'
      | 'probe'
      | 'legacy_bridge'
      | 'manual'
      | 'fallback'
  }

  availability: {
    checked: boolean
    exists: boolean
    active: boolean
    verifiedBy:
      | 'models_api'
      | 'native_models_api'
      | 'metadata'
      | 'probe'
      | 'responses_probe'    // ← [REV2] added: Codex verifies via POST /responses
      | 'catalog'
      | 'legacy_bridge'
      | 'manual'
      | 'not_checked'
  }

  tools: {
    supported: boolean
    format: 'openai' | 'anthropic' | 'gemini' | 'none'
    strictSchema?: boolean
  }

  thinking: RuntimeThinkingCapability
  effort: RuntimeEffortCapability

  payload: {
    endpoint:
      | 'chat_completions'
      | 'responses'
      | 'codex_responses'
      | 'gemini_native'
      | 'anthropic_messages'

    maxTokensField:
      | 'max_tokens'
      | 'max_completion_tokens'

    reasoningField?:
      | 'reasoning_effort'
      | 'reasoning'
      | 'thinking'

    preserveReasoningContent?: boolean
    requireReasoningContentOnAssistantMessages?: boolean
    removeBodyFields?: string[]
    supportsSystemRole?: boolean
    supportsUserCustomHeaders?: boolean
  }

  limits: {
    contextWindow?: number
    maxOutputTokens?: number
  }

  // [FIX] 'not_resolved' added for initial state before any resolution occurs
  confidence:
    | 'not_resolved'       // ← initial state
    | 'remote_metadata'
    | 'models_api'
    | 'native_models_api'
    | 'probe'
    | 'responses_probe'    // ← [REV2] added: Codex POST /responses probe
    | 'catalog'
    | 'legacy_bridge'
    | 'adapter_fallback'
    | 'manual'
    | 'conservative'
}
```

---

### 7.5 `RuntimeThinkingCapability`

```ts
export type RuntimeThinkingCapability = {
  supported: boolean
  adaptiveSupported: boolean

  mode:
    | 'none'
    | 'adaptive'
    | 'reasoning_effort'
    | 'reasoning_object'
    | 'thinking_object'
    | 'budget_tokens'
    | 'reasoning_content_history'
    | 'provider_specific'

  source:
    | 'descriptor'
    | 'catalog'
    | 'metadata'
    | 'probe'
    | 'legacy_bridge'
    | 'fallback'
}
```

---

### 7.6 `RuntimeEffortCapability`

**[FIX] `allowAutoMax: boolean` instead of literal `false`:**

```ts
export type AbstractEffort =
  | 'none'
  | 'auto'
  | 'low'
  | 'medium'
  | 'high'
  | 'max'

export type NativeEffortValue =
  | string
  | number
  | boolean
  | { type: string; [key: string]: unknown }

export type RuntimeEffortCapability = {
  supported: boolean

  mode:
    | 'none'
    | 'native_enum'
    | 'reasoning_effort'
    | 'reasoning_object'
    | 'thinking_object'
    | 'budget_tokens'
    | 'adaptive_only'
    | 'provider_auto'

  nativeValues: Array<{
    abstract: AbstractEffort
    native: NativeEffortValue
    label: string
    allowedInAuto: boolean
    isDefault?: boolean
  }>

  defaultAbstractEffort: Exclude<AbstractEffort, 'auto'>
  maxAutoAbstractEffort: 'none' | 'low' | 'medium' | 'high'

  // [FIX] boolean instead of literal false
  // Note: must be false in all PR-Adapter adapters; PR 2 may change this.
  allowAutoMax: boolean

  autoStrategy:
    | 'openclaude_decides'
    | 'provider_decides'

  source:
    | 'descriptor'
    | 'catalog'
    | 'metadata'
    | 'probe'
    | 'legacy_bridge'
    | 'fallback'
}
```

**Hard rule:** Any `max`/`xhigh` value must have `allowedInAuto: false`.

---

### 7.7 `RuntimeSetupResult`

**[FIX] Discriminated union for exhaustive type checking:**

```ts
export type RuntimeSetupResult =
  | { ok: true; capabilities: RuntimeModelCapabilities }
  | { ok: false; severity: 'fatal' | 'warning'; reason: string; code: RuntimeErrorCode }
```

---

## 8. User Input Capture at `/provider`

The system must capture exactly what the user selects or enters:

```
- Chosen provider
- Entered baseUrl, or descriptor default
- Entered model, or descriptor/catalog default
- apiKey / token / authMode
- apiFormat where applicable
- Custom headers where applicable
```

### Security and consistency rule

```
Fallback/preset CAN fill an empty field.
Fallback/preset MUST NOT silently replace a field the user explicitly provided.
```

**Correct:**

```
User left baseUrl empty        → use provider default
User left model empty          → use provider default
Metadata fetch failed          → use catalog/fallback for capabilities
```

**Incorrect:**

```
User entered invalid model     → silently replace with default
User entered invalid baseUrl   → silently replace with default
```

### Field validation rules

| Field        | Rule                                                                              |
|--------------|-----------------------------------------------------------------------------------|
| `providerId` | Must map to correct `routeId` from PR #910                                        |
| `baseUrl`    | If empty, use descriptor default. If provided, validate as URL.                   |
| `apiKey`     | If provider requires auth, validate presence. If API rejects it, return error.    |
| `model`      | If empty, use default. If provided, validate via `/models`. If invalid, error.    |
| `metadata`   | Failure is non-fatal. Use catalog/preset/fallback for capabilities.               |

---

## 9. Capability Resolution Order

Each provider decides which steps are mandatory, optional, or unavailable.

```
1. /models or equivalent endpoint
   → Validate that the model exists and is available for that key.

2. /metadata or equivalent endpoint
   → Fetch model capabilities/info.

3. probe (only when necessary, provider-specific endpoint)
   → Fixed payload, never using real user prompt.
   → Codex: POST /responses (not GET /models, not POST /chat/completions)  ← [REV2]

4. descriptor/catalog from PR #910
   → Declarative fallback.

5. adapter fallback
   → Runtime adapter technical fallback.

6. conservative fallback
   → Minimum payload. No advanced thinking/effort.
```

---

## 10. Provider: NVIDIA NIM

### Identity

```
providerId: nvidia-nim
routeId:    nvidia-nim
```

**[REV] This provider has no dedicated first-class path in `main` today.** It currently enters
via the OpenAI shim using `OPENAI_BASE_URL` pointed at the NIM endpoint. This adapter introduces
it as a proper first-class provider with dedicated env vars and validation.

### Input capture

```
baseUrl: user input or https://integrate.api.nvidia.com/v1
model:   user input or descriptor/catalog default
apiKey:  user input or NVIDIA_API_KEY
```

### Validation sequence

```
1. GET {baseUrl}/models
2. Validate auth
3. Validate model
4. Attempt /metadata (optional)
5. Resolve capabilities
6. Cache
```

### Errors

| Condition                    | Error                                             |
|------------------------------|---------------------------------------------------|
| `/models` 401/403            | Invalid API key                                   |
| Model not in `/models`       | Model not found or not available for this API key |
| `/metadata` failure          | Non-fatal                                         |

### Initial capabilities

```
tools:    format openai
thinking: supported only if metadata/fallback reliably indicates it
effort:   low, medium, high (no max, no xhigh)
```

```ts
nativeValues: [
  { abstract: 'low',    native: 'low',    label: 'Low',    allowedInAuto: true },
  { abstract: 'medium', native: 'medium', label: 'Medium', allowedInAuto: true },
  { abstract: 'high',   native: 'high',   label: 'High',   allowedInAuto: true },
]
```

---

## 11. Provider: Gemini

### Identity

```
providerId: gemini
routeId:    gemini
```

**[REV] Gemini is handled today via `CLAUDE_CODE_USE_GEMINI=1` and the Gemini bridge in
`src/bridge/`. The runtime adapter formalizes this. Do not remove or replace the bridge —
the adapter sits above it.**

### Input capture

```
baseUrl:    user input or Gemini default
model:      user input or Gemini default
authMode:   api-key | access-token | adc
credential: GEMINI_API_KEY · GOOGLE_API_KEY · GEMINI_ACCESS_TOKEN · local ADC
```

### Validation

Use the existing bridge: `resolveGeminiCredential()`.

**[FIX] Metadata flow — native API as primary path:**

```ts
// Prefer native API when possible — more stable than the OpenAI-compatible endpoint
const useNative = authMode !== 'access-token'
if (useNative) {
  return await fetchNativeGeminiModels(credential)
}
return await fetchOpenAICompatibleGeminiModels(credential)
```

The Gemini OpenAI-compatible endpoint (`generativelanguage.googleapis.com/v1beta/openai/`) has
had multiple URL changes. The native endpoint is more stable when `authMode === 'api-key'`.

### Initial capabilities

```
thinking: supported=false
effort:   supported=false
```

Reasoning/thinking for Gemini must not be activated until model-level support is confirmed
along with payload and transport specifics. Gemini capability varies per model family, auth
mode, and transport.

### Must not break

```
GEMINI_AUTH_MODE · access-token · ADC
thought_signature · remove body.store · Gemini tool schema
```

---

## 12. Provider: Codex

### Identity

```
providerId: codex
routeId:    codex
```

**[REV] Codex today runs through the OpenAI shim path with model alias detection
(`codexplan`, `codexspark`). The runtime adapter must intercept this before it reaches the
generic OpenAI shim.** The aliases currently map to real endpoints:

```
codexplan  → GPT-5.5 (high reasoning, Responses API)
codexspark → GPT-5.3 Codex Spark (fast loops, Responses API)
```

**[FIX] `CodexRuntimeAdapter.supportsRoute()` with detection fallback:**

`routeId: "codex"` must be confirmed with the PR #910 author. If #910 does not formalize
`codex` as an explicit `routeId`, the adapter must include a fallback:

```ts
supportsRoute(routeId: string, descriptor: RouteDescriptor): boolean {
  if (routeId === 'codex') return true
  // fallback: when #910 has not yet formalized the routeId
  if (isCodexAlias(descriptor?.defaultModel ?? '')) return true
  return false
}
```

Without this fallback, input silently falls through to `LegacyRuntimePassthroughAdapter`.

**[REV] Before writing this adapter, verify with the PR #910 author whether `codex` is
an explicit `routeId` in that PR. If it is, the `isCodexAlias()` fallback is secondary
safety only. If it is not, the fallback is the primary detection path.**

### Input capture

```
baseUrl:          user input or DEFAULT_CODEX_BASE_URL
model:            user input or codexplan
credentialSource: oauth | existing
credentials:      CODEX_API_KEY · secure storage · auth.json
account:          CHATGPT_ACCOUNT_ID · CODEX_ACCOUNT_ID
```

### Validation

**[REV2] Codex DOES NOT use `GET /models`.** From `docs/advanced-setup.md`:

> "Codex profiles validate CODEX_API_KEY or the Codex CLI auth file and
> **probe POST /responses** instead of GET /models."

The startup probe uses the Codex Responses API endpoint, not the chat completions endpoint and
not the models listing endpoint.

Use existing bridges (these already exist in `src/bridge/` or adjacent):

```
resolveProviderRequest()
resolveRuntimeCodexCredentials()
resolveCodexApiCredentials()
isCodexAlias()
getReasoningEffortForModel()
supportsCodexReasoningEffort()
codexShim
```

**[REV] Before coding, verify the exact import paths for these functions from the current
`src/bridge/` and adjacent files. Do not assume paths — read the files.**

### Errors

| Condition               | Severity |
|-------------------------|----------|
| Missing credential      | Fatal    |
| Missing accountId       | Fatal    |
| Unknown alias/model     | Fatal    |
| POST /responses failure | Fatal    |

### Capabilities

```
effort: low, medium, high, max → xhigh
max/xhigh: allowedInAuto=false
```

**[REV2] `verifyStartup` for Codex — probe via POST /responses:**

```ts
// CodexRuntimeAdapter
async verifyStartup(input: RuntimeStartupInput): Promise<StartupVerificationResult> {
  // Step 1: validate credentials and accountId
  const creds = await resolveRuntimeCodexCredentials(input)
  if (!creds.accountId) {
    return { ok: false, severity: 'fatal', reason: 'missing_account_id' }
  }

  // Step 2: probe POST /responses with a minimal safe payload (see section 17)
  // This is Codex's equivalent of GET /models validation.
  // Do NOT probe GET /models — it is not supported on the Codex endpoint.
  // Do NOT probe POST /chat/completions — it returns 404 on the Codex endpoint.
  const probeResult = await probeCodexResponsesEndpoint(input, creds)
  if (!probeResult.ok) {
    return { ok: false, severity: 'fatal', reason: probeResult.reason }
  }

  return { ok: true }
}
```

> **[REV2] The previous claim "Codex does not probe" was incorrect and has been removed.**
> Codex probes via POST /responses as documented in `docs/advanced-setup.md`. The safe probe
> payload rules in section 17 apply to this probe exactly as they apply to all other probes.

### Payload

First rollout must preserve: `codex_responses` + `codexShim` + current stable serialization.
Do not reimplement Codex payload conversion in this phase.

---

## 13. Provider: OpenRouter

### Identity

```
providerId: openrouter
routeId:    openrouter
```

**[REV] OpenRouter today routes through the OpenAI shim with `OPENAI_BASE_URL=https://openrouter.ai/api/v1`.
This PR promotes it to a distinct provider. The old path must remain usable for users who have not
yet switched to the new profile — do not remove the env-var path from the shim.**

### Descriptor from PR #910

```
id:                openrouter
label:             OpenRouter
defaultBaseUrl:    https://openrouter.ai/api/v1
credentialEnvVars: OPENROUTER_API_KEY
transportConfig:   kind: openai-compatible
catalog.source:    hybrid
discovery.kind:    openai-compatible
discoveryCacheTtl: 1d
```

### Input capture

```
baseUrl: user input or https://openrouter.ai/api/v1
model:   user input or catalog default
apiKey:  user input or OPENROUTER_API_KEY
```

### Validation sequence

```
1. GET /models
2. Validate auth
3. Validate model
4. Extract metadata/capability when available
5. Descriptor catalog fallback
6. Conservative fallback
```

### Initial capabilities

```
thinking: off unless metadata confirms it
effort:   none unless metadata/supported_parameters confirms it
tools:    openai format if metadata/catalog allows it
```

Do not inject reasoning/effort automatically without per-model/provider confirmation.

---

## 14. OpenRouter Profile & Wizard

**[FIX] `buildOpenRouterProfileEnv()` must not pollute `OPENAI_API_KEY`:**

The OpenRouter profile must not set `OPENAI_API_KEY`. If a user has `OPENAI_API_KEY` set for
OpenAI and switches to OpenRouter via `/provider`, the logic could overwrite the OpenAI key
in the saved env — or apply the OpenRouter key when switching back to OpenAI.

The profile must contain only:

```
OPENROUTER_API_KEY = <key>
OPENROUTER_BASE_URL = https://openrouter.ai/api/v1  (optional)
OPENROUTER_MODEL = <model>  (optional)
```

Shim compatibility must be handled inside the adapter or transport, not in the profile env.
The adapter reads `OPENROUTER_API_KEY` and injects the correct header internally.

### Add `openrouter` to `ProviderProfile`

Modify `src/utils/providerProfile.ts`:

```ts
export type ProviderProfile =
  | 'openai'
  | 'gemini'
  | 'codex'
  | 'ollama'
  | 'atomic-chat'
  | 'openrouter'     // ← ADD
  | 'nvidia-nim'     // ← ADD
```

Update the following accordingly:

```
isProviderProfile()
buildLaunchEnv()
buildSavedProfileSummary()
buildProfileSaveMessage()
ProviderChooser component
```

### Add environment variables

```
OPENROUTER_API_KEY
OPENROUTER_BASE_URL   (optional)
OPENROUTER_MODEL      (optional)
```

### Update secret handling in `src/utils/providerSecrets.ts`

Add `OPENROUTER_API_KEY` (and `NVIDIA_API_KEY`) to:

```
PROFILE_ENV_KEYS
SECRET_ENV_KEYS
ProfileEnv
SecretValueSource
providerSecrets redaction/masking
```

---

## 15. Error Handling & Severity

### Fatal errors

```
invalid_api_key
missing_required_auth
model_not_found (in provider with mandatory /models)
missing accountId in Codex
POST /responses probe failure in Codex     ← [REV2]
invalid/unreachable baseUrl (when provider requires remote endpoint)
```

### Non-fatal errors

```
metadata_unavailable
metadata_timeout
incomplete capabilities
probe timeout (for non-Codex providers)
```

### TTY vs non-interactive behavior

| Mode                        | Behavior                                               |
|-----------------------------|--------------------------------------------------------|
| Interactive TTY             | Warning + allow `/provider` to correct when possible   |
| `-p` / `--print` / SDK      | Fatal error — exit with sanitized message              |

---

## 16. Security Rules

All rules are mandatory and non-negotiable.

```
 1. No API key or token may be stored in RuntimeCapabilityCache.
 2. No log may print a key, token, or header value.
 3. No error message may print Authorization or query token.
 4. Probe must never use the real user prompt.
 5. Raw metadata must not be logged in full.
 6. OPENROUTER_API_KEY must be treated as a secret.
 7. Reserved custom headers must remain blocked.
 8. URLs with key/token in query string must be redacted.
 9. authFingerprint must be a non-reversible hash (SHA-256 / 16 hex chars).
10. baseUrlHash must not store URLs containing sensitive query parameters.
11. [REV2] CODEX_API_KEY must be treated as a secret in all logs and error paths.
```

---

## 17. Safe Probe

Probing is allowed for non-Codex OpenAI-compatible providers via `POST /chat/completions`,
and for Codex via `POST /responses`. The same payload safety rules apply to both.

**[REV2] Codex probe endpoint:** `POST /responses` (the Codex Responses API).
Sending a `POST /chat/completions` request to the Codex endpoint produces a 404 or parse error.
Sending a `GET /models` request is not supported on the Codex endpoint.

**Safe payload for all probes (adapt endpoint and field names per provider):**

```json
{
  "model": "<model>",
  "messages": [{ "role": "user", "content": "ping" }],
  "max_tokens": 1,
  "stream": false
}
```

For Codex `POST /responses`, use the Responses API field schema instead of chat completions
fields. The payload content ("ping") and intent (minimum tokens, no stream) remain identical.

**Prohibited in all probes:**

```
Real user prompt · real message history · real tools
Real system prompt · attachments · files
```

---

## 18. Payload Migration Scope

First implementation must prioritize **validation / capability resolution / caching**.

Do not reimplement full message/tool conversion in this PR.

The existing `openaiShim` already contains sensitive rules for:

```
role alternation · orphan tool_result · strict schema
Gemini thought_signature · reasoning_content from specific providers
remove body fields · stream conversion
```

**Rule:**

```
Adapter produces body object/policy when payload stage is reached.
Transport/shim serializes and executes.
Do not use custom JSON.stringify inside individual adapters.
Preserve existing stable serialization.
```

---

## 19. Commit Sequence

The sequence below is revised. `RuntimeSecurity` must come **before** the OpenRouter profile
commit because `buildOpenRouterProfileEnv()` calls `RuntimeSecurity.maskSecretForDisplay()`.
The scaffold commit comes first since the entire `src/services/model-runtime/` tree is net-new.

> **[REV2] Note on commit 1:** `src/services/` already exists (it has `src/services/api/`).
> Commit 1 creates only the `model-runtime/` subdirectory and its contents.
> Commit messages must say "add src/services/model-runtime/" not "add src/services/".

```
Commit 1: feat(runtime): add src/services/model-runtime directory and types
  → Create model-runtime/ subtree (src/services/ already exists — do not describe as net-new)
  → types.ts with all type definitions
  → _pr910-stubs.ts with temporary stub interfaces (delete after PR #910 merge)

Commit 2: feat(runtime): add model runtime coordinator over integration descriptors
  → ModelRuntimeCoordinator · RuntimeAdapterRegistry
  → RuntimeProviderAdapter interface · LegacyRuntimePassthroughAdapter (as instance)
  → RuntimeSetupResult as discriminated union

Commit 3: feat(runtime): add secure runtime capability cache and redaction helpers
  → RuntimeCapabilityCache
  → createAuthFingerprint() with SHA-256 / 16 chars
  → createBaseUrlHash() · RuntimeSecurity (imports from providerSecrets.ts)
  → tests: cache contains no secrets

Commit 4: feat(runtime): add provider startup verifier
  → verifyOnce() · startup severity
  → TTY warning vs non-interactive error
  → onProviderChanged() with cache invalidation
  → wire into src/bootstrap/

Commit 5: feat(provider): add OpenRouter profile support
  → ProviderProfile 'openrouter' + 'nvidia-nim' in providerProfile.ts
  → OPENROUTER_API_KEY + NVIDIA_API_KEY in providerSecrets.ts
  → buildOpenRouterProfileEnv() without OPENAI_API_KEY pollution
  → /provider wizard with OpenRouter · saved profile summary

Commit 6: feat(runtime): add NVIDIA NIM runtime adapter
  → NvidiaNimRuntimeAdapter · nvidiaRemoteMetadata · nvidiaCapabilities

Commit 7: feat(runtime): add Gemini runtime adapter
  → GeminiRuntimeAdapter · geminiRemoteMetadata · geminiCapabilities
  → native API as primary path when authMode !== 'access-token'

Commit 8: feat(runtime): add Codex runtime adapter bridge
  → CodexRuntimeAdapter · codexLegacyBridge · codexCapabilities
  → supportsRoute() with isCodexAlias() fallback
  → [REV2] verifyStartup() probes POST /responses — NOT a no-probe path

Commit 9: feat(runtime): add OpenRouter runtime adapter
  → OpenRouterRuntimeAdapter · openRouterRemoteMetadata · openRouterCapabilities

Commit 10: test(runtime): cover provider routing, validation, and secret safety
  → Add bun test target: src/services/model-runtime/**/*.test.ts
  → Extend test:provider script or add test:runtime script in package.json
  → All routing, security, and provider-specific tests from section 20
```

---

## 20. Minimum Test Coverage

### Routing

| Assertion                                                         | Must pass |
|-------------------------------------------------------------------|-----------|
| Gemini never falls through to OpenRouter/OpenAI-compatible        | ✓         |
| Codex never falls through to OpenAI-compatible                    | ✓         |
| NVIDIA NIM never falls through to OpenAI-compatible               | ✓         |
| OpenRouter never falls through to generic OpenAI-compatible       | ✓         |
| Unknown/custom stays in legacy passthrough                        | ✓         |

**[FIX] Adapter order test — enforced, not just documented:**

```ts
it('codex must have priority over openrouter', () => {
  const registry = buildDefaultRegistry()
  const adapters = registry.getAdapters()
  expect(adapters.findIndex(a => a.id === 'codex'))
    .toBeLessThan(adapters.findIndex(a => a.id === 'openrouter'))
})
```

### Security

```
- RuntimeCapabilityCache contains no secrets
- Debug output contains no secrets
- Errors contain no Authorization headers
- OPENROUTER_API_KEY is masked
- NVIDIA_API_KEY is masked
- CODEX_API_KEY is masked in all error/log paths   ← [REV2]
- URLs with ?key=... are redacted
- Reserved custom headers remain blocked
```

### Provider setup

```
- Empty baseUrl → uses provider default
- Empty model → uses provider default
- Invalid model → returns error
- Invalid baseUrl → returns error
- Invalid key → returns error
- Metadata failure → non-fatal
```

### Startup

```
- Valid saved provider → starts and caches capabilities
- Invalid saved provider (TTY) → allows correction via /provider
- Invalid saved provider (non-interactive) → exits with sanitized error
- Provider switched via /provider → cache invalidated, startup re-executed
```

### Provider-specific

| Provider   | Test requirement                                                              |
|------------|-------------------------------------------------------------------------------|
| NVIDIA     | `GET /models` mandatory. `/metadata` optional.                                |
| Gemini     | `api-key` / `access-token` / `adc` preserved. Native API preferred.          |
| Codex      | No `GET /models`. Probes `POST /responses`. `accountId` validated. ← [REV2]  |
| OpenRouter | `OPENROUTER_API_KEY` accepted. `GET /models` validates model.                 |

### Test script registration

> **[REV2]** Add a `test:runtime` script to `package.json` targeting
> `src/services/model-runtime/**/*.test.ts`. The existing `test:provider` script targets
> `src/services/api/*.test.ts` and must not be modified or overloaded.

```json
"test:runtime": "bun test src/services/model-runtime/**/*.test.ts"
```

---

## 21. PR Readiness Checklist

### Hard prerequisites (blocking)

- [ ] PR #910 merged into `main` (absolute blocker — do not open PR-Adapter review without this)
- [ ] `_pr910-stubs.ts` deleted and replaced with real imports from `src/integrations/`
- [ ] `routeId: "codex"` confirmed with #910 author **or** `isCodexAlias()` fallback verified
- [ ] Branch rebased on the merge commit of PR #910

### Mandatory fixes

- [ ] `allowAutoMax: boolean` instead of literal `false` in `RuntimeEffortCapability`
- [ ] `LegacyRuntimePassthroughAdapter` as instance in registry
- [ ] `getAdapters()` exposed in `RuntimeAdapterRegistry` for tests
- [ ] Codex `verifyStartup` probes `POST /responses` — NOT skip probe, NOT `POST /chat/completions`  ← [REV2]
- [ ] `buildPayload` marked as optional in the interface
- [ ] `buildOpenRouterProfileEnv()` without `OPENAI_API_KEY` pollution
- [ ] `createAuthFingerprint()` with fixed SHA-256 in `RuntimeSecurity`
- [ ] `onProviderChanged()` invalidates cache and re-runs startup
- [ ] `confidence: 'not_resolved'` added to the union type
- [ ] `confidence: 'responses_probe'` added to the union type  ← [REV2]
- [ ] `availability.verifiedBy: 'responses_probe'` added to the union type  ← [REV2]
- [ ] `RuntimeSetupResult` as discriminated union
- [ ] `RuntimeSecurity` imports from `providerSecrets.ts` — no duplication
- [ ] `node:crypto` used — no third-party crypto dependency added
- [ ] `test:runtime` script added to `package.json`  ← [REV2]

### Recommended fixes

- [ ] Gemini: native API as primary path when `authMode !== 'access-token'`
- [ ] Adapter order enforced by test in registry
- [ ] `CodexRuntimeAdapter.supportsRoute()` with `isCodexAlias()` fallback
- [ ] Codex alias list kept up-to-date (codexplan, codexspark — verify current list in docs/advanced-setup.md)

### Security (verify before merge)

- [ ] `OPENROUTER_API_KEY` in `SECRET_ENV_KEYS`
- [ ] `NVIDIA_API_KEY` in `SECRET_ENV_KEYS`
- [ ] `CODEX_API_KEY` masked in all error/log paths  ← [REV2]
- [ ] `authFingerprint` does not include raw credential in any log
- [ ] Probe never uses real prompt (verified by test)
- [ ] Codex probe uses POST /responses, not chat/completions (verified by test)  ← [REV2]
- [ ] Reserved headers remain blocked (regression from PR #910)
- [ ] Old OpenRouter shim path (`OPENAI_BASE_URL=openrouter.ai`) still works (regression test)

### Integrity (verify before merge)

- [ ] `src/bridge/` is unmodified
- [ ] `src/services/api/` is unmodified  ← [REV2]
- [ ] Existing Gemini flow (`CLAUDE_CODE_USE_GEMINI=1`) still works
- [ ] Existing Codex flow (`OPENAI_MODEL=codexplan`) still works
- [ ] Existing OpenRouter shim path still works for users who have not migrated

---

## 22. Definition of Done

```
✓ All 4 providers are treated as unique.
✓ Generic OpenAI-compatible does not participate in first rollout.
✓ Runtime uses src/integrations from #910 as source of truth.
✓ /provider correctly captures and validates inputs.
✓ Fallback does not silently replace explicit user input.
✓ Capabilities are cached without secrets.
✓ Startup verifies provider once (and invalidates on provider switch).
✓ Prompt-time triggers zero remote discovery.
✓ Logs and error messages are sanitized.
✓ Codex/Gemini preserve their current sensitive behavior.
✓ Codex verifyStartup probes POST /responses — not zero-probe.  ← [REV2]
✓ OpenRouter has explicit profile and correct secret handling.
✓ NVIDIA NIM is introduced as a fully working first-class provider.
✓ _pr910-stubs.ts is deleted — no stub imports remain.
✓ src/bridge/ is not broken.
✓ src/services/api/ is not touched.  ← [REV2]
✓ Existing provider env-var paths still work for users who have not migrated.
✓ test:runtime script exists and targets src/services/model-runtime/**/*.test.ts.  ← [REV2]
```