# openclaude — PR 1 Managed Adapter Runtime
#### English — Authoritative reference for contributors

---

## Document Structure

This document is divided into two strictly separated layers.

**Part I — Codebase Audit / Discovery Notes** records what is known about the existing
repository and identifies gaps that must be resolved before implementation. All claims carry an
explicit evidence level. Observations here do not constitute implementation requirements.

**Part II — Final PR 1 Managed Adapter Runtime Specification** is the standalone implementation
contract. This specification does not depend on any external descriptor layer. Implementers
should read Part I for context and Part II for requirements.

---

## Evidence Level Convention

Every factual claim in Part I is tagged with one of the following levels:

| Level | Meaning |
|---|---|
| `confirmed-local` | Verified by direct inspection of the target branch in the canonical repository |
| `public-mirror-observed` | Observed on a public mirror (e.g., GitHub); may lag the canonical instance or differ in detail |
| `inferred` | Derived from documentation, observable behavior, or structural reasoning; not directly read from source |
| `requires-phase-a-verification` | Must be confirmed by cloning and reading the target branch before this fact can be used for implementation |

**Rule:** Source file paths, line counts, dependency versions, tsconfig content, and command
handler locations must not be labeled `confirmed-local` unless an implementer has verified them
in the target branch of the canonical repository. The labels below reflect what was available
at the time this document was written.

---

# Part I — Codebase Audit / Discovery Notes

---

## A1. What openclaude Is

`[public-mirror-observed]` openclaude originated from the Claude Code source that was exposed via
npm source maps on March 31, 2026. The Gitlawb organization took the snapshot, added a
multi-provider shim, and published it as an open-source CLI under the MIT license.

`[public-mirror-observed]` The canonical repository lives at `gitlawb.com` (a Gitlawb-hosted
Gitea instance). GitHub at `github.com/Gitlawb/openclaude` is a mirror. Star and fork counts
visible there vary between page loads due to CDN caching and do not reflect the actual community
size on the canonical instance.

`[public-mirror-observed]` The npm package is `@gitlawb/openclaude`. The source build uses Bun.

**What openclaude adds on top of Claude Code** `[public-mirror-observed]`:

| Addition | Purpose |
|---|---|
| `src/services/api/openaiShim.ts` | Duck-type the Anthropic SDK interface and forward calls to any OpenAI-compatible API |
| `src/services/api/client.ts` modifications | Route to the shim when `CLAUDE_CODE_USE_OPENAI=1` or `CLAUDE_CODE_USE_GEMINI=1` |
| `src/utils/model/providers.ts` | Add the `'openai'` provider type |
| `src/utils/model/configs.ts` | Add model name mappings (codexplan, codexspark, etc.) |
| `src/utils/model/nvidiaNimModels.ts` | NVIDIA NIM model catalog |
| `src/utils/model/model.ts` | Respect `OPENAI_MODEL` / `GEMINI_MODEL` env vars for model defaults |
| `src/utils/auth.ts` | Recognize OpenAI-compatible and Gemini providers as valid third-party |
| `scripts/provider-bootstrap.ts` | Write `.openclaude-profile.json` |
| `scripts/provider-launch.ts` | Launch with a saved profile |
| `scripts/system-check.ts` | `doctor:runtime` health checks |
| `/provider` slash command (in-app) | Interactive guided setup and saved profiles |
| `/onboard-github` slash command | GitHub Models onboarding |

`[inferred]` The total delta from upstream is approximately 786 lines in core files plus scripts,
slash commands, and documentation. This figure has not been verified against the target branch.

---

## A2. Source File Inventory

### A2.1 `src/` layout

`[public-mirror-observed]` The following layout was observed on the public mirror:

```
src/
  services/
    api/
      openaiShim.ts       ← OpenAI-compatible translation layer
      client.ts           ← routes to shim when CLAUDE_CODE_USE_OPENAI=1 or CLAUDE_CODE_USE_GEMINI=1
      [other Anthropic SDK files from Claude Code]

  utils/
    model/
      providers.ts        ← defines provider type union, includes 'openai'
      configs.ts          ← model name mappings, context windows, output caps
      model.ts            ← reads OPENAI_MODEL / GEMINI_MODEL for default model resolution
      nvidiaNimModels.ts  ← NVIDIA NIM model catalog (already exists — do not duplicate)

    auth.ts               ← recognizes OpenAI-compatible and Gemini providers as valid

  [Claude Code original source: tools/, commands/, ui/, agents/, etc.]
```

`[inferred]` Line counts for these files have not been verified in the target branch and should
not be treated as exact.

### A2.2 `scripts/` layout

`[public-mirror-observed]`

```
scripts/
  build.ts               ← Bun build script → dist/cli.mjs
  provider-bootstrap.ts  ← profile:init; writes .openclaude-profile.json
  provider-launch.ts     ← dev:profile, dev:ollama, dev:codex, dev:gemini, etc.
  system-check.ts        ← doctor:runtime, doctor:runtime:json, doctor:report
```

### A2.3 `docs/`

`[public-mirror-observed]`

```
docs/
  advanced-setup.md      ← env vars, profile launchers, runtime hardening
  non-technical-setup.md
  quick-start-*.md
```

### A2.4 What does not exist yet

`[inferred]`

```
src/services/model-runtime/          ← DOES NOT EXIST — PR 1 creates this
src/services/model-runtime/adapters/ ← DOES NOT EXIST
```

PR 1 is 100% greenfield code within the existing tree. No existing files are deleted.

---

## A3. Current Provider Architecture

### A3.1 The multi-shim model

`[public-mirror-observed]`

```
Claude Code Tool System (tools, agents, bash, file ops, etc.)
  ↓
Anthropic SDK interface — duck-typed
  ↓
src/services/api/client.ts
  ↓
  ├─ if CLAUDE_CODE_USE_OPENAI=1  → src/services/api/openaiShim.ts
  │                                    → POST /chat/completions (most providers)
  │                                    → POST /responses (Codex — model alias detection)
  │
  ├─ if CLAUDE_CODE_USE_GEMINI=1  → Gemini path (exact callsite requires Phase A)
  │                                    → native Gemini API or OpenAI-compat endpoint
  │
  └─ else                         → Anthropic SDK directly (default Claude Code behavior)
```

Any provider: OpenAI · DeepSeek · Ollama · Groq · Mistral · OpenRouter · Gemini · Codex ·
NVIDIA NIM · LM Studio · Azure OpenAI · Together AI

The shim currently handles: Anthropic ↔ OpenAI message format translation, tool-call format
translation, system prompt conversion, stream handling, Codex endpoint routing via model alias,
context-window caps, and `max_tokens` / `max_completion_tokens` field selection.

### A3.2 The routing decisions in `client.ts`

`[public-mirror-observed]`

```
if CLAUDE_CODE_USE_OPENAI=1  → openaiShim.ts (all current non-Anthropic/non-Gemini providers)
if CLAUDE_CODE_USE_GEMINI=1  → Gemini path (exact implementation requires Phase A)
else                          → Anthropic SDK directly (default Claude Code behavior)
```

### A3.3 Implicit provider detection in the shim

`[inferred]` The shim has implicit provider detection based on model name pattern matching
(`codexplan`, `codexspark` → Codex responses endpoint), `OPENAI_BASE_URL` value, and
`CODEX_API_KEY` / `~/.codex/auth.json` presence. This detection lives inside `openaiShim.ts`
rather than in a separate provider module. PR 1 introduces proper separation.

### A3.4 Existing `auth.ts` scope

`[public-mirror-observed]` `src/utils/auth.ts` was modified to recognize OpenAI-compatible
and Gemini providers as valid third-party providers, skipping Anthropic's native auth validation
when `CLAUDE_CODE_USE_OPENAI=1` or `CLAUDE_CODE_USE_GEMINI=1`.

### A3.5 Existing model configs

`[public-mirror-observed]` `src/utils/model/configs.ts` contains context window sizes per
model, max output token caps, and known model aliases (`codexplan`, `codexspark`).
`src/utils/model/nvidiaNimModels.ts` contains the NVIDIA NIM model catalog. This file already
exists and must not be duplicated under `model-runtime/adapters/nvidia/`.

---

## A4. Environment Variable Model

### A4.1 OpenAI-compatible shim activation

`[public-mirror-observed]`

| Variable | Value | Effect |
|---|---|---|
| `CLAUDE_CODE_USE_OPENAI` | `1` | Activates the OpenAI shim path in `client.ts` |
| `OPENAI_API_KEY` | API key string | Authentication in the shim |
| `OPENAI_MODEL` | Model name | Active model; priority over `ANTHROPIC_MODEL` |
| `OPENAI_BASE_URL` | URL | Provider base URL; defaults to `https://api.openai.com/v1` |

### A4.2 Gemini activation

`[public-mirror-observed]` Gemini is a first-class supported provider on main, documented via
`.env.example` and `advanced-setup.md`:

| Variable | Value | Effect |
|---|---|---|
| `CLAUDE_CODE_USE_GEMINI` | `1` | Activates the Gemini path in `client.ts` |
| `GEMINI_API_KEY` | API key string | Authentication for Gemini |
| `GEMINI_MODEL` | Model name | Active Gemini model |
| `GEMINI_BASE_URL` | URL | Gemini endpoint override |

`[requires-phase-a-verification]` The exact `client.ts` callsite for `CLAUDE_CODE_USE_GEMINI=1`
must be confirmed during Phase A before `GeminiRuntimeAdapter` integration can be written.

**Activation rule (parallel to OpenAI):** `CLAUDE_CODE_USE_GEMINI=1` without a validated
`/provider` profile sets `source = 'legacy_env'`. The Managed Adapter Runtime remains inactive.
The existing Gemini flow is unchanged.

### A4.3 Codex-specific variables

`[public-mirror-observed]`

| Variable | Purpose |
|---|---|
| `CODEX_API_KEY` | Direct Codex / ChatGPT token override |
| `CODEX_AUTH_JSON_PATH` | Path to a Codex CLI `auth.json` file |
| `CODEX_HOME` | Alternative Codex home directory |

Codex auto-reads `~/.codex/auth.json` when present. `[inferred]` Codex probes `POST /responses`,
not `GET /models` — but the exact probe behavior in `doctor:runtime` for Codex profiles requires
Phase A verification.

### A4.4 What PR 1 adds

`[inferred]` PR 1's `/provider` command will persist validated provider configuration to
`.openclaude-profile.json`. `ProviderStartupVerifier` reads the profile on startup and calls the
appropriate managed adapter. All existing env-var paths are unaffected when no `/provider`
configuration is present.

---

## A5. Profile System

### A5.1 Profile file

`[public-mirror-observed]` `.openclaude-profile.json` is stored in the project root. It is
git-ignored. File permissions are `0600` (owner-only).

### A5.2 Profile creation

`[public-mirror-observed]` `scripts/provider-bootstrap.ts` creates or updates
`.openclaude-profile.json` with: provider ID, base URL, model name, and credential reference
(env var name, not value).

### A5.3 Profile launch

`[public-mirror-observed]` `scripts/provider-launch.ts` reads `.openclaude-profile.json`,
sets appropriate env vars, and launches `dist/cli.mjs`. The `dev:profile` script uses this path.

### A5.4 `doctor:runtime` behavior

`[public-mirror-observed, requires-phase-a-verification for exact logic]`
`scripts/system-check.ts` performs:
- `CLAUDE_CODE_USE_OPENAI=1` with a placeholder key → fail fast
- Local providers (`localhost`, `127.0.0.1`) → no API key required
- Codex profiles → validate `CODEX_API_KEY` or auth file, then probe `POST /responses`
- Non-local, non-Codex → validate API key, then `GET /models` or equivalent

### A5.5 Profile system changes in PR 1

`[inferred]` PR 1's `ModelRuntimeCoordinator` replaces standalone script validation with an
in-process runtime layer. The `/provider` slash command calls `ModelRuntimeCoordinator.validateSetup()`
directly and writes `.openclaude-profile.json` only on success. A version field will need to be
added to distinguish legacy profiles from runtime-validated ones.

---

## A6. Codex Implementation Details

### A6.1 Codex aliases

`[public-mirror-observed]`

| Alias | Maps to | Characteristic |
|---|---|---|
| `codexplan` | GPT-5.4 | High reasoning, slower |
| `codexspark` | GPT-5.3 Codex Spark | Faster loops |

`[requires-phase-a-verification]` These aliases are resolved inside `openaiShim.ts` and/or
`configs.ts`. Exact function names and export status require Phase A inspection.

### A6.2 Codex auth stack

`[public-mirror-observed]` Resolution order documented in `advanced-setup.md`:

```
1. CODEX_API_KEY env var         ← direct override
2. CODEX_AUTH_JSON_PATH env var  ← custom path to auth.json
3. ~/.codex/auth.json            ← Codex CLI default location
4. CODEX_HOME env var            ← alternative home directory
```

### A6.3 Codex endpoint behavior

`[public-mirror-observed]` Codex uses `POST /responses` (OpenAI Responses API), not
`POST /chat/completions` and not `GET /models` for validation. `[requires-phase-a-verification]`
Whether `doctor:runtime` probes `POST /responses` for Codex profiles must be confirmed before
implementing `ProviderStartupVerifier`.

### A6.4 Codex logic extraction

`[inferred]` `CodexRuntimeAdapter.validateSetup()` will need to replicate validation logic
currently inside `openaiShim.ts` and `scripts/system-check.ts`. The bridge functions
(`resolveProviderRequest`, `isCodexAlias`, `supportsCodexReasoningEffort`, `codexShim`) likely
exist as unexported functions in `openaiShim.ts` or utility functions in `utils/model/`.
`[requires-phase-a-verification]` Exact names and export status must be confirmed during Phase A.

---

## A7. TypeScript and Build Configuration

### A7.1 `tsconfig.json`

`[public-mirror-observed, requires-phase-a-verification]` No tsconfig snapshot is embedded here
because the public mirror and the canonical target branch may differ. The following values were
observed on the current public main and must be re-confirmed during Phase A before any import
paths or compiler-option assumptions are written:

- `target`: `ES2023`
- `lib`: `["ES2023", "DOM"]`
- `noImplicitAny`: `false`
- `noEmit`: `true`
- `allowImportingTsExtensions`: `true`
- `moduleResolution`: `bundler`
- `paths`: `src/*` → `./src/*`

These values are listed for orientation only. **Do not treat them as a specification.**
Phase A must read the target branch `tsconfig.json` directly before finalizing import paths.
The import policy in §S9 is the normative source for how PR 1 code must be written.

### A7.2 Import path implications

`[inferred from A7.1]` If `paths` is confirmed, the `src/*` alias maps to `./src/*`, enabling
imports such as `import { X } from 'src/services/model-runtime/X'`. Import style must follow
whatever pattern already exists in the repository. See Part II §S9 for the import policy.

### A7.3 Module system

`[inferred from A7.1]` `"module": "ESNext"` + `"moduleResolution": "bundler"` means ESM syntax
only (`import`/`export`), no `require()`, no CommonJS exports. Bun handles resolution at build
time.

### A7.4 React and Ink

`[inferred from A7.1]` `"jsx": "react-jsx"` indicates the CLI uses React with Ink for the
terminal UI. The `/provider` and `/status` commands are `[inferred]` React/Ink components.

### A7.5 Build output

`[public-mirror-observed]` `bun run build` → `bun run scripts/build.ts` → `dist/cli.mjs`.
`[inferred]` All files under `src/**/*` are included automatically by the tsconfig.

### A7.6 Dependencies relevant to PR 1

`[public-mirror-observed, requires-phase-a-verification for exact versions]` The following
packages were observed in `package.json` on the public mirror:

- `zod` — schema validation for setup inputs
- `lru-cache` — potential backing store for `RuntimeCapabilityCache`
- `undici` — HTTP client for provider validation calls
- `node:crypto` (built-in) — SHA-256 for `RuntimeSecurity.createAuthFingerprint()`
- `type-fest` — utility types

`[inferred]` No new npm dependencies should need to be added for PR 1. This must be confirmed
once the target branch's `package.json` is read directly.

---

## A8. Test Infrastructure

### A8.1 Current state

`[public-mirror-observed]` The main branch already has a formal test suite. The following
`package.json` scripts are present:

| Script | Purpose |
|---|---|
| `test` | `bun test` — runs the full test suite |
| `test:coverage` | Coverage report |
| `test:provider-recommendation` | Provider recommendation tests |
| `test:provider` | Provider-specific tests |
| `typecheck` | `tsc --noEmit` |
| `smoke` | Build + `--version` sanity check |
| `doctor:runtime` | Provider reachability integration test |
| `hardening:strict` | `typecheck` + `smoke` + `doctor:runtime` |

**PR 1 must not add a generic `test` or `test:coverage` script — they already exist.**

### A8.2 What PR 1 adds to `package.json`

PR 1 adds only the scoped runtime test entry:

```json
"test:runtime": "bun test src/services/model-runtime/",
"test:runtime:watch": "bun test --watch src/services/model-runtime/"
```

The `test:runtime:watch` entry is optional.

---

## A9. Gaps Between the PR 1 Plan and the Codebase

This specification is standalone and does not depend on any external descriptor layer.

### Gap 1: `/provider` command handler location is unknown

The `/provider` command exists (confirmed from README), but its internal implementation in `src/`
is not visible from outside the repository. It may use `scripts/provider-bootstrap.ts` logic
inlined or may already be a separate command module.

`[requires-phase-a-verification]` The implementer must locate the command handler and understand
its current `onSubmit`/`onComplete` path before writing `ModelRuntimeCoordinator`.

### Gap 2: OpenRouter is currently a pure passthrough

OpenRouter today is accessed via `OPENAI_BASE_URL=https://openrouter.ai/api/v1` through the
generic shim. The managed `OpenRouterRuntimeAdapter` is additive — it provides validated setup
via `/provider` while the env-var path continues to work as legacy passthrough.

### Gap 3: NVIDIA NIM DeepSeek v4 payload behavior

`[public-mirror-observed, requires-phase-a-verification]` NVIDIA NIM's DeepSeek v4 models
reportedly hang without `chat_template_kwargs` in the request body. Evidence requirements are
specified in Part II §S6.

### Gap 4: SHA-256 availability

`[inferred]` Both Bun and Node ≥ 20 support `node:crypto`. Use synchronous hashing:

```ts
import { createHash } from 'node:crypto'
const fingerprint = createHash('sha256').update(secret).digest('hex').slice(0, 16)
```

### Gap 5: `/status` panel implementation is unknown

`[requires-phase-a-verification]` Whether the existing `/status` panel is a React/Ink component
or a command-rendered text output determines the correct `RuntimeStatusStore` integration
pattern. See Part II §S8.

### Gap 6: `.js` extensions must not appear in imports

`[inferred from A7.1]` With `moduleResolution: bundler`, TypeScript imports must not include
`.js` extensions. See Part II §S9.

### Gap 7: Gemini `client.ts` callsite is unknown

`[requires-phase-a-verification]` `CLAUDE_CODE_USE_GEMINI=1` activates a Gemini path in
`client.ts`, but the exact integration point — and whether it shares any code with the OpenAI
shim — must be confirmed during Phase A before `GeminiRuntimeAdapter` can be wired in.

---

## A10. Viability Verdict by Component

| PR 1 Component | Viable? | Evidence Level | Notes |
|---|---|---|---|
| `src/services/model-runtime/` directory tree | ✅ Yes | inferred | Greenfield in existing `src/` tree |
| `managedProviderIds.ts` | ✅ Yes | inferred | Pure constants and function |
| `localProviderDefaults.ts` | ✅ Yes | inferred | Config object |
| `RuntimeSecurity.ts` | ✅ Yes | inferred | Uses `node:crypto`, no new deps |
| `RuntimeEndpointNormalizer.ts` | ✅ Yes | inferred | Pure logic, no deps |
| `RuntimeEndpointBuilder.ts` | ✅ Yes | inferred | Pure logic, no deps |
| `RuntimeAdapterRegistry.ts` | ✅ Yes | inferred | Strategy pattern |
| `LegacyRuntimePassthroughAdapter.ts` | ✅ Yes | inferred | Passive no-op |
| `RuntimeCapabilityCache.ts` | ✅ Yes | inferred | In-memory Map; `lru-cache` optional |
| `RuntimeStatusStore.ts` | ⚠️ Conditional | requires-phase-a-verification | Integration pattern depends on `/status` type |
| `ProviderStartupVerifier.ts` | ⚠️ Conditional | requires-phase-a-verification | Depends on `/provider` command location |
| `ModelRuntimeCoordinator.ts` | ⚠️ Conditional | requires-phase-a-verification | Must hook into `/provider` command |
| `GeminiRuntimeAdapter.ts` | ⚠️ Conditional | requires-phase-a-verification | `CLAUDE_CODE_USE_GEMINI` callsite must be confirmed |
| `CodexRuntimeAdapter.ts` | ✅ Yes | inferred | Extracts logic from `openaiShim.ts` |
| `NvidiaNimRuntimeAdapter.ts` | ✅ Yes | inferred | Uses existing `nvidiaNimModels.ts` via bridge |
| `nvidiaModelCatalogBridge.ts` | ✅ Yes | inferred | Wraps `src/utils/model/nvidiaNimModels.ts` read-only |
| `OpenRouterRuntimeAdapter.ts` | ✅ Yes | inferred | Additive; legacy env-var path untouched |
| `RuntimeQuirkPolicy` + quirk reader | ✅ Yes | inferred | Separate policy layer; adapters emit candidates only |
| Full test matrix | ⚠️ Partial | inferred | Scoped `test:runtime` scope to be added |
| Zero dependency additions | ✅ Yes | inferred | All needed libs present in `package.json` |

**Overall PR 1 viability: HIGH.** The main unknowns are the `/provider` command handler location,
the Gemini `client.ts` callsite, and the internal structure of `openaiShim.ts`.

---

## A11. File Locations Requiring Phase A Discovery

| Unknown | Likely location | Why it matters |
|---|---|---|
| `/provider` command handler | `src/commands/provider.ts` or `src/ui/commands/` | PR 1 hooks `ModelRuntimeCoordinator` here |
| `/status` panel component | `src/ui/panels/StatusPanel.tsx` or similar | Determines `RuntimeStatusStore` integration pattern |
| CLI startup / main loop | `src/cli.ts` or `src/main.ts` | `ProviderStartupVerifier` call site |
| Gemini `client.ts` callsite | Inside `src/services/api/client.ts` | `GeminiRuntimeAdapter` wiring |
| Codex routing logic | Inside `openaiShim.ts` | `codexLegacyBridge.ts` extraction |
| Quirk injection point | Request body construction in `openaiShim.ts` | Phase D integration |
| `.openclaude-profile.json` schema | `scripts/provider-bootstrap.ts` | Profile version field |

These are resolvable by cloning the canonical repository and reading the source files directly.

---

# Part II — Final PR 1 Managed Adapter Runtime Specification

This specification is standalone and does not depend on any external descriptor layer.

---

## S1. Purpose and Scope

PR 1 introduces a **Managed Adapter Runtime** layer inside `src/services/model-runtime/`. Its
responsibilities are:

- Validate provider configuration when the user runs `/provider`
- Resolve and cache provider capabilities in memory (no secrets stored)
- Expose transport routing metadata (`transportKind`, `endpoint`) per provider
- Emit typed, provider-specific payload quirk candidates for future policy evaluation
- Verify the active provider at startup
- Expose runtime status to the `/status` panel

PR 1 does **not**:

- Implement effort / thinking payload mutation (deferred to PR 2)
- Promote any payload quirk from candidate to active (that is `RuntimeQuirkPolicy`'s job)
- Replace any legacy env-var path (`CLAUDE_CODE_USE_OPENAI=1`, `CLAUDE_CODE_USE_GEMINI=1`)
- Add new npm dependencies
- Remove any existing files
- Duplicate `src/utils/model/nvidiaNimModels.ts`

---

## S2. Core Types

```ts
// src/services/model-runtime/types.ts

// ─── Provider identity ────────────────────────────────────────────────────────

export type ManagedProviderId =
  | 'codex'
  | 'gemini'
  | 'nvidia-nim'
  | 'openrouter'

// ─── Activation source ───────────────────────────────────────────────────────

/**
 * Describes how the Managed Adapter Runtime was (or was not) activated.
 *
 * Rules:
 * - 'provider_command' or 'provider_profile' activate the runtime.
 * - 'legacy_env' alone NEVER activates the Managed Adapter Runtime.
 *   This applies equally to CLAUDE_CODE_USE_OPENAI=1 and CLAUDE_CODE_USE_GEMINI=1
 *   when used without a validated /provider profile.
 * - 'none' is the default when no env flag or profile is present.
 */
export type ManagedActivationSource =
  | 'provider_command'   // user ran /provider interactively
  | 'provider_profile'   // a validated profile was loaded at startup
  | 'legacy_env'         // legacy env flag active without /provider profile — passthrough only
  | 'none'               // no provider active

/**
 * Narrowed activation source used only inside the managed runtime — after the registry
 * has confirmed that a managed provider is active.
 *
 * Usage boundary:
 * - ManagedActivationSource is used before adapter resolution: in client.ts routing,
 *   RuntimeAdapterRegistryQuery, and any code that decides whether the runtime is active.
 * - ManagedRuntimeActivationSource is used only after that decision — specifically in
 *   RuntimeSetupInput and any type that is passed directly to a managed adapter method.
 *
 * Managed adapters must NEVER receive source='legacy_env' or source='none'.
 * RuntimeAdapterRegistry must reject those values before constructing any adapter call.
 */
export type ManagedRuntimeActivationSource =
  | 'provider_command'   // user ran /provider interactively
  | 'provider_profile'   // a validated profile was loaded at startup

// ─── Credentials ─────────────────────────────────────────────────────────────

export type RuntimeCredentialKind =
  | 'api_key'           // explicit API key value
  | 'access_token'      // OAuth / bearer access token
  | 'adc'               // Application Default Credentials (no value field)
  | 'oauth'             // OAuth token stored in auth.json or similar
  | 'auth_json'         // path to a JSON file containing credentials
  | 'env_ref'           // reference to an environment variable name (not the value)
  | 'secure_storage_ref' // reference to a platform secure storage entry

export interface RuntimeCredential {
  readonly kind: RuntimeCredentialKind
  /** Present for 'api_key', 'access_token', 'oauth'. Never stored in cache or logs. */
  readonly value?: string
  /** Present for 'env_ref'. Stores the variable name, not its value. */
  readonly envVar?: string
  /** Present for 'auth_json'. Stores the file path. */
  readonly path?: string
}

// ─── Codex credential source ─────────────────────────────────────────────────

export type CodexCredentialSource =
  | 'api_key'          // CODEX_API_KEY env var
  | 'oauth'            // ~/.codex/auth.json with OAuth tokens
  | 'auth_json'        // CODEX_AUTH_JSON_PATH pointing to a custom auth.json
  | 'existing_bridge'  // credential delegation to the existing codexLegacyBridge

// ─── Transport routing ───────────────────────────────────────────────────────

/**
 * Describes which HTTP transport the runtime layer should use.
 * Transport selection is driven by RuntimeModelCapabilities.payload,
 * NOT by a hardcoded rule that routes everything through openaiShim.
 */
export type RuntimeTransportKind =
  | 'openai_compatible'  // POST /chat/completions — openaiShim handles this
  | 'codex_responses'    // POST /responses (OpenAI Responses API)
  | 'gemini_native'      // native Gemini API (non-OpenAI-compatible endpoint)

export interface RuntimeTransportPayload {
  readonly transportKind: RuntimeTransportKind
  /** Endpoint path relative to baseUrl, e.g. 'chat/completions', 'responses' */
  readonly endpoint: string
}

// ─── Transport routing table (normative) ─────────────────────────────────────
//
//  Provider       transportKind          endpoint
//  ─────────────────────────────────────────────────────────────────────────────
//  nvidia-nim     openai_compatible      chat/completions
//  openrouter     openai_compatible      chat/completions
//  codex          codex_responses        responses
//  gemini         openai_compatible      chat/completions  (OpenAI-compat endpoint)
//             OR  gemini_native          (provider-determined)  (native endpoint)
//
// GeminiRuntimeAdapter sets transportKind based on the resolved authMode.
// No managed provider is hardcoded to openaiShim unless transportKind = 'openai_compatible'.
// Gemini native transport integration point must be confirmed in Phase A.

// ─── Capability types ────────────────────────────────────────────────────────

/**
 * Thinking / extended reasoning capability information.
 * PR 1 may resolve and cache this. PR 2 decides whether and how to use it.
 * PR 1 must never apply thinking payload mutation.
 */
export interface RuntimeThinkingCapability {
  readonly supported: boolean
  /**
   * Mechanism by which thinking / extended reasoning is expressed in the payload.
   *
   *  'none'              — provider does not support thinking; ignore budget/effort fields
   *  'reasoning_effort'  — expressed as a reasoning_effort string parameter
   *  'thinking_object'   — expressed as a structured { type: 'thinking', budget_tokens } object
   *  'budget_tokens'     — expressed as a standalone budget_tokens integer parameter
   *  'provider_specific' — none of the above; adapter documents the exact mechanism
   *
   * PR 1 resolves and caches this. PR 2 reads it to decide payload shape.
   */
  readonly mode: 'none' | 'reasoning_effort' | 'thinking_object' | 'budget_tokens' | 'provider_specific'
  readonly minBudgetTokens?: number
  readonly maxBudgetTokens?: number
  /** How this information was obtained. */
  readonly source: 'adapter_static' | 'adapter_verified' | 'unknown'
}

/**
 * Effort-level capability information.
 * PR 1 may resolve and cache this. PR 2 decides whether and how to use it.
 * PR 1 must never apply effort payload mutation.
 *
 * nativeValues maps abstract effort levels to the provider's native strings and records
 * whether each level may be selected automatically (allowedInAuto) or is restricted to
 * explicit user invocation only (allowedInAuto: false — e.g., Codex max → xhigh).
 *
 * allowAutoMax: false — the runtime must never automatically select the maximum effort
 * level on behalf of the user. PR 2 enforces this at the selection site.
 *
 * maxAutoAbstractEffort — the highest abstract level the runtime may select automatically.
 * Levels above this threshold require explicit user opt-in.
 */
export interface RuntimeEffortNativeValue {
  /** Abstract level used internally by the runtime. */
  readonly abstract: 'low' | 'medium' | 'high' | 'max'
  /**
   * Provider's native value for this effort level.
   *
   * string  — most providers (e.g. Codex 'low' | 'medium' | 'high' | 'xhigh')
   * number  — providers that accept a numeric reasoning budget (e.g. a token count)
   * boolean — binary on/off effort switch
   * Record  — providers that express effort as a structured object in the payload
   *
   * PR 2 reads this value and places it directly into the request payload at the
   * field the provider expects. Keeping the type broad here avoids a breaking change
   * when a new provider with non-string effort values is added.
   */
  readonly native: string | number | boolean | Record<string, unknown>
  /** Whether the runtime may select this level automatically (without explicit user request). */
  readonly allowedInAuto: boolean
}

export interface RuntimeEffortCapability {
  readonly supported: boolean
  /**
   * Ordered list of supported effort levels with native provider values.
   * INVARIANT: if supported is false, nativeValues must be [].
   * Example — Codex: [
   *   { abstract: 'low',    native: 'low',    allowedInAuto: true  },
   *   { abstract: 'medium', native: 'medium', allowedInAuto: true  },
   *   { abstract: 'high',   native: 'high',   allowedInAuto: true  },
   *   { abstract: 'max',    native: 'xhigh',  allowedInAuto: false },
   * ]
   * Codex max → xhigh is a manual-only capability: allowedInAuto must be false.
   */
  readonly nativeValues: ReadonlyArray<RuntimeEffortNativeValue>
  /**
   * The highest abstract level the runtime may choose automatically.
   *
   * 'none'  — effort is not supported; no level may be auto-selected (use when supported=false).
   * 'low' | 'medium' | 'high' — the inclusive ceiling for automatic selection.
   *
   * INVARIANT: when supported=false, maxAutoAbstractEffort must be 'none'.
   * The runtime must never auto-select 'max'; that requires explicit user opt-in (allowAutoMax: false).
   */
  readonly maxAutoAbstractEffort: 'none' | 'low' | 'medium' | 'high'
  /**
   * Whether the runtime may automatically select the maximum effort level.
   * Must always be false for PR 1 and PR 2. Explicit user request required.
   */
  readonly allowAutoMax: false
  readonly source: 'adapter_static' | 'adapter_verified' | 'unknown'
}

// ─── Payload quirks ──────────────────────────────────────────────────────────

/**
 * Typed condition for a payload quirk. Free-form condition strings are PROHIBITED.
 * All conditions must be one of the variants below.
 *
 * For APPROVED, ACTIVE quirks:
 * - 'model_id_includes' is PROHIBITED. Approved conditions must use 'model_id_exact' or
 *   'model_id_regex' so that activation cannot silently spread to unintended models.
 * - Candidate declarations may use any condition type (including 'model_id_includes') for
 *   discovery, but the condition must be tightened to 'model_id_exact' or 'model_id_regex'
 *   before the quirk can be approved by RuntimeQuirkPolicy.
 */
export type RuntimeProviderPayloadQuirkCondition =
  | { readonly type: 'model_id_exact';    readonly modelId: string }
  | { readonly type: 'model_id_prefix';   readonly prefix: string }
  | { readonly type: 'model_id_includes'; readonly substring: string }  // candidates only — prohibited for approved active quirks
  | { readonly type: 'model_id_regex';    readonly pattern: string }    // preferred for approved active quirks requiring pattern matching

/**
 * A single provider-specific, model-scoped payload quirk declaration.
 *
 * IMPORTANT: Adapters emit candidate quirks only.
 * - Adapters must never set status to 'approved' directly.
 * - Only RuntimeQuirkPolicy may promote a quirk from 'candidate' to 'approved'.
 * - An approved quirk becomes active only when wrapped in ActiveRuntimeProviderPayloadQuirk
 *   by RuntimeQuirkPolicy.
 *
 * Additional rules:
 * - conditions must be typed (RuntimeProviderPayloadQuirkCondition); no strings
 * - fields must come from RuntimeProviderPayloadQuirkAllowlist
 * - no generic Object.assign in consumers
 * - general effort/thinking fields are NOT in scope for PR 1
 */
export interface RuntimeProviderPayloadQuirk {
  /** Stable unique identifier for this quirk declaration. */
  readonly id: string
  readonly provider: ManagedProviderId
  readonly condition: RuntimeProviderPayloadQuirkCondition
  /** Fields that may be injected. Only keys present in the allowlist are permitted. */
  readonly allowlistedFields: RuntimeProviderPayloadQuirkAllowlist
  /**
   * 'candidate': emitted by the adapter; awaiting policy evaluation.
   * 'approved': promoted by RuntimeQuirkPolicy; still not applied until wrapped
   *             in ActiveRuntimeProviderPayloadQuirk.
   *
   * Adapters MUST emit 'candidate' only. Setting 'approved' from an adapter is a violation.
   */
  readonly status: 'candidate' | 'approved'
}

/**
 * An active quirk that has been promoted and enabled by RuntimeQuirkPolicy.
 * Only RuntimeQuirkPolicy may construct values of this type.
 */
export interface ActiveRuntimeProviderPayloadQuirk extends RuntimeProviderPayloadQuirk {
  readonly status: 'approved'
  readonly enabled: true
  readonly enabledBy: 'runtime_policy'
}

/**
 * Allowlisted extra-body fields for payload quirks.
 * Adding a new field requires a deliberate change to this type — no open-ended objects.
 */
export interface RuntimeProviderPayloadQuirkAllowlist {
  readonly chat_template_kwargs?: {
    readonly enable_thinking?: boolean
    readonly thinking?: boolean
  }
}

/**
 * Policy layer responsible for promoting candidate quirks to active quirks.
 * Adapters have no access to this layer.
 */
export interface RuntimeQuirkPolicy {
  /**
   * Evaluates a candidate quirk against evidence and allowlist checks.
   * Returns an ActiveRuntimeProviderPayloadQuirk if the quirk passes all checks,
   * or null if it does not.
   */
  evaluate(
    quirk: RuntimeProviderPayloadQuirk,
    context: RuntimeQuirkPolicyContext,
  ): ActiveRuntimeProviderPayloadQuirk | null
}

export interface RuntimeQuirkPolicyContext {
  readonly modelId: string
  readonly providerId: ManagedProviderId
  /**
   * The set of quirk IDs that have been explicitly approved for activation.
   * RuntimeQuirkPolicy may promote a quirk only when approvedQuirkIds.has(quirk.id).
   * A quirk whose id is absent from this set must not be promoted, regardless of
   * whether its condition matches or its evidence is documented.
   * This replaces the prior boolean evidenceSatisfied field.
   */
  readonly approvedQuirkIds: ReadonlySet<string>
}

// ─── Capabilities ────────────────────────────────────────────────────────────

export interface RuntimeModelCapabilities {
  readonly providerId: ManagedProviderId
  readonly modelId: string
  readonly payload: RuntimeTransportPayload
  /**
   * Quirk candidates emitted by the adapter.
   * Empty array means no quirks were emitted.
   * None of these are active until RuntimeQuirkPolicy promotes them.
   */
  readonly quirkCandidates: readonly RuntimeProviderPayloadQuirk[]
  /**
   * Thinking capability information resolved by PR 1.
   * PR 1 caches this. PR 2 decides whether and how to act on it.
   */
  readonly thinking: RuntimeThinkingCapability
  /**
   * Effort-level capability information resolved by PR 1.
   * PR 1 caches this. PR 2 decides whether and how to act on it.
   */
  readonly effort: RuntimeEffortCapability
}

// ─── Setup input ─────────────────────────────────────────────────────────────

export interface RuntimeSetupInput {
  readonly providerInput: {
    readonly providerId: ManagedProviderId
    readonly baseUrl: string
    readonly model: string
    /**
     * Structured credential for the provider.
     * Prefer this over apiKey for new code.
     */
    readonly credential?: RuntimeCredential
    /**
     * Legacy convenience field kept for compatibility with the existing /provider command
     * until Phase D wires in the structured credential.
     * Must not be stored in cache or logs.
     */
    readonly apiKey?: string
  }
  readonly normalized: { readonly baseUrl: string; readonly warnings: string[] }
  readonly processEnv: Readonly<Record<string, string | undefined>>
  /**
   * Activation source for this setup call.
   * Typed as ManagedRuntimeActivationSource — not the broader ManagedActivationSource.
   * 'legacy_env' and 'none' must be rejected by the registry before this input is constructed.
   */
  readonly source: ManagedRuntimeActivationSource
  /** True when CLAUDE_CODE_USE_OPENAI=1 or CLAUDE_CODE_USE_GEMINI=1 is active. */
  readonly legacyEnvActive: boolean
  /**
   * Custom headers to include in provider requests.
   * All keys must pass RuntimeSecurity.validateHeaderName() before use.
   * Must not carry authorization secrets; use credential for that.
   */
  readonly customHeaders?: Readonly<Record<string, string>>
}

// ─── Startup input ───────────────────────────────────────────────────────────

/**
 * Full context passed to RuntimeProviderAdapter.verifyStartup().
 * Capabilities alone are insufficient for startup verification — the adapter
 * needs the original provider input, baseUrl, credential, and env to re-verify
 * reachability and auth.
 */
export interface RuntimeStartupInput {
  readonly providerInput: RuntimeSetupInput['providerInput']
  readonly normalized: RuntimeSetupInput['normalized']
  readonly processEnv: Readonly<Record<string, string | undefined>>
  /** Startup verification always originates from a loaded profile. */
  readonly source: 'provider_profile'
  /** Capabilities cached from the last successful validateSetup(), if available. */
  readonly cachedCapabilities?: RuntimeModelCapabilities
  readonly startupMode: 'interactive_tty' | 'non_interactive'
}

// ─── Adapter identity ─────────────────────────────────────────────────────────

/**
 * The full set of adapter identity tokens.
 * ManagedProviderId values identify real provider adapters.
 * 'legacy-passthrough' identifies LegacyRuntimePassthroughAdapter.
 *
 * Keeping the literal separate from ManagedProviderId means TypeScript can prove
 * that a LegacyRuntimePassthroughAdapter can never be mistaken for a managed adapter
 * and vice versa, without requiring a runtime instanceof check at every call site.
 */
export type RuntimeAdapterId = ManagedProviderId | 'legacy-passthrough'

// ─── Adapter interface ────────────────────────────────────────────────────────

export type RuntimeSetupResult =
  | { readonly ok: true;  readonly capabilities: RuntimeModelCapabilities }
  | { readonly ok: false; readonly code: RuntimeSetupErrorCode; readonly message: string }

export type RuntimeSetupErrorCode =
  | 'invalid_api_key'
  | 'model_not_found'
  | 'network_error'
  | 'timeout'
  | 'credential_missing'
  | 'credential_format_invalid'
  | 'legacy_env_only'           // activation attempted via legacy_env alone — rejected
  | 'unsupported_auth_mode'

export type RuntimeStartupResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly code: string; readonly message: string; readonly fatal: boolean }

/**
 * Minimal adapter interface shared by all adapter objects — managed and legacy alike.
 * This is the type returned by RuntimeAdapterRegistry.getAdapter().
 *
 * Callers that need to call validateSetup() or verifyStartup() must first narrow to
 * ManagedRuntimeProviderAdapter (e.g., via isManagedProvider(adapter.adapterId) or
 * an instanceof check). LegacyRuntimePassthroughAdapter satisfies this interface but
 * does NOT satisfy ManagedRuntimeProviderAdapter.
 */
export interface RuntimeAdapterBase {
  /**
   * Stable identity token for this adapter instance.
   * Use to distinguish LegacyRuntimePassthroughAdapter ('legacy-passthrough')
   * from real provider adapters (ManagedProviderId values).
   */
  readonly adapterId: RuntimeAdapterId
}

/**
 * Interface implemented by real, managed provider adapters only.
 * LegacyRuntimePassthroughAdapter must NOT implement this interface.
 *
 * providerId is narrowed to ManagedProviderId here so that downstream code that
 * holds a ManagedRuntimeProviderAdapter reference cannot accidentally receive
 * 'legacy-passthrough' as a provider identity.
 */
export interface ManagedRuntimeProviderAdapter extends RuntimeAdapterBase {
  readonly adapterId: ManagedProviderId
  /** Alias for adapterId; kept for symmetry with legacy code that references providerId. */
  readonly providerId: ManagedProviderId
  validateSetup(input: RuntimeSetupInput): Promise<RuntimeSetupResult>
  /**
   * Verifies that the provider is still reachable at startup.
   * Receives the full RuntimeStartupInput, not just capabilities.
   */
  verifyStartup(input: RuntimeStartupInput): Promise<RuntimeStartupResult>
}

/**
 * Deprecated compatibility alias.
 * New PR 1 code must use ManagedRuntimeProviderAdapter.
 * This alias exists only to reduce migration friction while older references are updated.
 */
export type RuntimeProviderAdapter = ManagedRuntimeProviderAdapter

// ─── Cache key ───────────────────────────────────────────────────────────────

/**
 * Composite key used to look up RuntimeModelCapabilities in RuntimeCapabilityCache.
 *
 * Security rules:
 * - No raw baseUrl is stored in the key; only a normalized hash is used.
 * - No raw credential (API key, token, secret) is stored in the key.
 * - credentialFingerprint is the SHA-256 first 16 hex chars of the credential value.
 * - For credential kinds that do not have a raw secret (adc, env_ref, auth_json),
 *   the fingerprint must be derived from a stable non-secret credential identity such as:
 *     'adc', 'env_ref:<name>', or 'auth_json:<path-hash>'
 */
export interface RuntimeCapabilityCacheKey {
  readonly providerId: ManagedProviderId
  readonly baseUrlHash: string
  readonly modelId: string
  readonly credentialFingerprint: string
  readonly authMode?: string
  readonly apiFormat?: RuntimeTransportKind
}

/**
 * RuntimeCapabilityCacheKey is derived from:
 * - providerId
 * - normalized baseUrl hash
 * - modelId
 * - credential fingerprint
 * - authMode when applicable
 * - apiFormat / transportKind when applicable
 */

// ─── Capability cache interface ───────────────────────────────────────────────

/**
 * In-memory capability cache for the current process.
 *
 * PR 1 cache rules:
 * - In-memory only. No disk write occurs.
 * - TTL is process-local. A default of 1 hour applies within the same process.
 * - A new CLI process starts with an empty cache.
 * - Startup in a fresh process cannot skip remote verification on the basis of a
 *   prior in-memory cache entry — every new process is a cold start.
 */
export interface RuntimeCapabilityCache {
  get(key: RuntimeCapabilityCacheKey): RuntimeModelCapabilities | null
  set(key: RuntimeCapabilityCacheKey, capabilities: RuntimeModelCapabilities): void
  delete(key: RuntimeCapabilityCacheKey): void
  clear(): void
}
```

`RuntimeProviderAdapter` is retained only as a compatibility alias. New PR 1 code must use `ManagedRuntimeProviderAdapter`.

---

## S3. Activation Rules

### S3.1 `ManagedActivationSource` gating

The Managed Adapter Runtime activates **only** when `source` is `'provider_command'` or
`'provider_profile'`. Neither `CLAUDE_CODE_USE_OPENAI=1` nor `CLAUDE_CODE_USE_GEMINI=1` alone
activates the runtime:

```
CLAUDE_CODE_USE_OPENAI=1, no profile   → source = 'legacy_env'  → LegacyRuntimePassthroughAdapter;
                                                                    existing env-var provider path continues unchanged
CLAUDE_CODE_USE_GEMINI=1, no profile   → source = 'legacy_env'  → LegacyRuntimePassthroughAdapter;
                                                                    existing Gemini env-var path continues unchanged
/provider run interactively            → source = 'provider_command' → managed runtime activated
Startup with validated profile         → source = 'provider_profile' → managed runtime activated
Neither env flag nor profile           → source = 'none'         → adapter runtime inactive;
                                                                    default Anthropic SDK path continues unchanged
```

**`source = 'none'`** means no provider env flag is set and no profile is loaded. The Managed
Adapter Runtime is entirely inactive. `client.ts` takes the default Anthropic SDK path as if
PR 1 did not exist. **Production code must not call `RuntimeAdapterRegistry.getAdapter()` when
`source = 'none'`** — the correct action is to skip the registry entirely and proceed directly
to the Anthropic SDK path. If `getAdapter()` is called with `source = 'none'` anyway — for
example in test harnesses or defensive wrapper code — it returns `LegacyRuntimePassthroughAdapter`
as a safe fallback, but this is a defensive behavior and not the intended production code path.

```
source='none':
  no registry lookup in production
  Anthropic SDK path continues directly
  managed runtime remains inactive
```

**`source = 'legacy_env'`** means a legacy env flag (`CLAUDE_CODE_USE_OPENAI=1` or
`CLAUDE_CODE_USE_GEMINI=1`) is present but no validated `/provider` profile was loaded.
Production code may call `RuntimeAdapterRegistry.getAdapter()` here; it returns
`LegacyRuntimePassthroughAdapter`. The existing env-var provider path continues exactly
as it did before PR 1. No managed adapter logic runs.

```
source='legacy_env':
  legacy env-var provider path continues unchanged
  RuntimeAdapterRegistry may defensively return LegacyRuntimePassthroughAdapter
  managed runtime remains inactive
```

**`source='none'` is not a legacy passthrough production path — it is runtime inactive.**
`source='legacy_env'` is the env-var passthrough path. These two values are distinct and
must not be conflated in code or documentation.

**Two-type boundary — `ManagedActivationSource` vs. `ManagedRuntimeActivationSource`:**
`ManagedActivationSource` (four values including `'legacy_env'` and `'none'`) is used by
`client.ts` routing logic and `RuntimeAdapterRegistryQuery` — code that decides whether and
how to activate the runtime. `ManagedRuntimeActivationSource` (`'provider_command'` and
`'provider_profile'` only) is used by `RuntimeSetupInput` and any type passed directly to a
managed adapter method. The registry narrows from the broad type to the narrow type before
constructing adapter calls. Managed adapters must never observe `'legacy_env'` or `'none'`.

### S3.2 `LegacyRuntimePassthroughAdapter` and registry input types

When `source = 'legacy_env'`, `RuntimeAdapterRegistry` returns
`LegacyRuntimePassthroughAdapter`, which is passive: it performs no validation, emits no
capabilities, and emits no quirk candidates. It exists to provide a uniform interface to callers
that always expect an adapter object.

When `source = 'none'`, production code must **not** call `RuntimeAdapterRegistry.getAdapter()`.
The Anthropic SDK path continues directly. The registry default fallback to
`LegacyRuntimePassthroughAdapter` for `source='none'` is defensive-only and not the production
code path. `source='none'` and `source='legacy_env'` are distinct values and must not be used
interchangeably.

**Adapter interface split — legacy vs. managed:**

`LegacyRuntimePassthroughAdapter` implements `RuntimeAdapterBase` only, with
`adapterId: 'legacy-passthrough'`. It does **not** implement `ManagedRuntimeProviderAdapter`
and therefore has no `validateSetup` or `verifyStartup` methods. This is enforced by the type
split; no runtime guard or cast is needed.

Real provider adapters implement `ManagedRuntimeProviderAdapter` (which extends `RuntimeAdapterBase`),
with `adapterId` and `providerId` both typed as `ManagedProviderId`.

`RuntimeAdapterRegistry.getAdapter()` returns `RuntimeAdapterBase`. Callers that need to call
`validateSetup` or `verifyStartup` must first narrow the result to `ManagedRuntimeProviderAdapter`
by checking `isManagedProvider(adapter.adapterId)` — the type system then permits the call.

**Registry input:**

`RuntimeAdapterRegistry.getAdapter()` accepts `RuntimeAdapterRegistryQuery` with
`providerId: string` (unvalidated string at the registry boundary). The registry calls
`isManagedProvider(providerId)` internally and narrows to `ManagedProviderId` before dispatching.

```ts
// RuntimeAdapterRegistry — normative types
export interface RuntimeAdapterRegistryQuery {
  readonly source: ManagedActivationSource
  readonly providerId: string   // unvalidated string at registry boundary
}

// Returns RuntimeAdapterBase — may be LegacyRuntimePassthroughAdapter or a managed adapter.
// Production callers must NOT call getAdapter() when source='none' (see §S3.1).
// For source='legacy_env' or unrecognized providerId, returns LegacyRuntimePassthroughAdapter.
getAdapter(query: RuntimeAdapterRegistryQuery): RuntimeAdapterBase {
  if (
    (query.source !== 'provider_command' && query.source !== 'provider_profile') ||
    !isManagedProvider(query.providerId)
  ) {
    return new LegacyRuntimePassthroughAdapter()
  }
  // query.providerId is now narrowed to ManagedProviderId
  return this.adapters[query.providerId]
}

// LegacyRuntimePassthroughAdapter — correct shape
class LegacyRuntimePassthroughAdapter implements RuntimeAdapterBase {
  readonly adapterId = 'legacy-passthrough' as const
  // No validateSetup. No verifyStartup. No providerId typed as ManagedProviderId.
}

// Type guard used by callers after getAdapter()
function isManagedAdapter(a: RuntimeAdapterBase): a is ManagedRuntimeProviderAdapter {
  return isManagedProvider(a.adapterId)
}
```

---

## S4. Transport Routing

Transport selection is driven by `RuntimeModelCapabilities.payload.transportKind` and
`RuntimeModelCapabilities.payload.endpoint`. No managed provider is unconditionally routed
through `openaiShim`.

### S4.1 Per-provider transport table

| Provider | `transportKind` | `endpoint` | Handler |
|---|---|---|---|
| `nvidia-nim` | `openai_compatible` | `chat/completions` | existing `openaiShim.ts` |
| `openrouter` | `openai_compatible` | `chat/completions` | existing `openaiShim.ts` |
| `codex` | `codex_responses` | `responses` | existing Codex responses path |
| `gemini` (OpenAI-compat endpoint) | `openai_compatible` | `chat/completions` | existing `openaiShim.ts` |
| `gemini` (native endpoint) | `gemini_native` | provider-determined | existing Gemini path in `client.ts` — `[requires-phase-a-verification]` |

### S4.2 Transport selection in `client.ts`

After PR 1, `client.ts` reads `RuntimeCapabilityCache` when a managed provider is active and
uses `payload.transportKind` to select the transport. When no managed runtime is active,
behavior is unchanged.

```
// source='none': Anthropic SDK path. Do NOT reach this code block — client.ts must
// short-circuit before any registry or cache lookup when source is 'none'.
if source is 'provider_command' or 'provider_profile':
  caps = RuntimeCapabilityCache.get(cacheKey)  // cacheKey: RuntimeCapabilityCacheKey (never profileId)
  if caps.payload.transportKind === 'gemini_native':
    → route to Gemini native path (Phase A confirms exact callsite)
  elif caps.payload.transportKind === 'codex_responses':
    → route to Codex responses path (existing logic, preserved via bridge)
  else ('openai_compatible'):
    → route to openaiShim
    → pass active quirks to shim (from RuntimeQuirkPolicy, not from adapter)
elif CLAUDE_CODE_USE_GEMINI=1 (legacy_env):
  → existing Gemini path, unchanged
elif CLAUDE_CODE_USE_OPENAI=1 (legacy_env):
  → openaiShim, unchanged
else (source='none'):
  → Anthropic SDK directly — no registry lookup, no cache read, no adapter involved
```

### S4.3 Gemini transport note

`GeminiRuntimeAdapter` must coexist with the existing `CLAUDE_CODE_USE_GEMINI=1` path.
`[requires-phase-a-verification]` Until the exact `client.ts` integration point is confirmed
during Phase A, `GeminiRuntimeAdapter` operates in validation, status, and capability-resolution
mode only. Gemini native transport routing is not wired in until Phase A confirms the callsite.

---

## S5. Payload Quirk Architecture

### S5.1 Separation of concerns

The quirk system has three distinct roles:

1. **Provider adapters** — emit `RuntimeProviderPayloadQuirk` candidates with
   `status: 'candidate'`. Adapters have no ability to activate a quirk.
2. **`RuntimeQuirkPolicy`** — evaluates candidates, checks evidence requirements, confirms
   allowlist compliance, and produces `ActiveRuntimeProviderPayloadQuirk` values.
3. **`openaiShim.ts`** — consumes `ActiveRuntimeProviderPayloadQuirk` values received from
   `RuntimeQuirkPolicy`. It only processes quirks where `enabled === true` and
   `enabledBy === 'runtime_policy'`.

**Normative quirk-layer rules:**

```
Adapters may only emit RuntimeProviderPayloadQuirk with status='candidate'.
Adapters must not construct ActiveRuntimeProviderPayloadQuirk.
Only RuntimeQuirkPolicy may construct ActiveRuntimeProviderPayloadQuirk.
```

**Test requirement:**

```
RuntimeQuirkPolicy: adapter-emitted candidates cannot be active unless RuntimeQuirkPolicy
promotes them by exact approvedQuirkIds match.
```

### S5.2 Consumption in `openaiShim.ts`

The shim applies active quirks only when all of the following are true:

1. The quirk is an `ActiveRuntimeProviderPayloadQuirk` (`enabled === true`,
   `enabledBy === 'runtime_policy'`)
2. The quirk's `condition` matches the current model ID
3. The field key is present in `RuntimeProviderPayloadQuirkAllowlist`
4. The quirk's `condition.type` is **not** `'model_id_includes'` — `RuntimeQuirkPolicy` must
   reject any approved quirk whose condition is `model_id_includes`. The shim adds a runtime
   guard as defence-in-depth, but policy enforcement is the primary gate.

Fields are applied individually and explicitly — `Object.assign` is prohibited:

```ts
// Pseudocode addition to openaiShim.ts — ~20 lines, additive, conditional
for (const quirk of activeQuirks) {
  if (!isActiveQuirk(quirk)) continue                 // type guard
  if (!conditionMatches(quirk.condition, modelId)) continue
  if (quirk.allowlistedFields.chat_template_kwargs !== undefined) {
    requestBody.chat_template_kwargs = {
      ...quirk.allowlistedFields.chat_template_kwargs,
    }
  }
  // Additional allowlisted fields added here as the allowlist expands in future PRs
}
```

No arbitrary extra body field injection is permitted. A field not in
`RuntimeProviderPayloadQuirkAllowlist` cannot be injected in PR 1.

---

## S6. NVIDIA DeepSeek v4 — Candidate Quirk

### S6.1 Status

The `chat_template_kwargs` quirk for `deepseek-v4` models on NVIDIA NIM is a **candidate**.
`NvidiaNimRuntimeAdapter` emits it with `status: 'candidate'`. `RuntimeQuirkPolicy` will not
promote it until all evidence requirements below are satisfied.

### S6.2 Evidence required

Before this quirk may be promoted to `status: 'approved'`, the following must be documented
in the PR description or an accompanying test:

| Evidence item | Required content |
|---|---|
| Affected model IDs | Full model IDs as returned by NVIDIA NIM's `GET /models` |
| Failure behavior without quirk | Reproducible evidence that the request hangs or errors when `chat_template_kwargs` is absent |
| Success behavior with quirk | Reproducible evidence that the same request succeeds with `chat_template_kwargs` present |
| Provider response behavior | Description of what NVIDIA NIM returns (hang, HTTP 4xx, HTTP 5xx, or malformed stream) |

### S6.3 Candidate quirk declaration

```ts
// nvidia/nvidiaPayloadQuirks.ts
export const NVIDIA_DEEPSEEK_V4_QUIRK: RuntimeProviderPayloadQuirk = {
  id: 'nvidia-nim/deepseek-v4/chat_template_kwargs',
  provider: 'nvidia-nim',
  // 'model_id_includes' is permitted for candidate declarations only.
  // Before this quirk may be approved, the condition must be replaced with
  // 'model_id_exact' or 'model_id_regex' targeting the specific affected model IDs
  // confirmed during §S6.2 evidence gathering. RuntimeQuirkPolicy must reject any
  // approval attempt that still carries 'model_id_includes'.
  condition: { type: 'model_id_includes', substring: 'deepseek-v4' },
  allowlistedFields: {
    chat_template_kwargs: { enable_thinking: true, thinking: true },
  },
  status: 'candidate',  // CANDIDATE — RuntimeQuirkPolicy must approve before applying
}
```

### S6.4 NVIDIA NIM model catalog

`NvidiaNimRuntimeAdapter` must read model information from the existing
`src/utils/model/nvidiaNimModels.ts` file via `nvidiaModelCatalogBridge.ts`. A second
`NvidiaNimModels.ts` file under `model-runtime/adapters/nvidia/` must not be created.

`nvidiaModelCatalogBridge.ts` is a read-only wrapper. It may expose known model metadata but
must not validate model availability — only `GET /models` at `/provider` time validates
whether a model is accessible on the user's NVIDIA account.

---

## S7. Codex Adapter Specification

### S7.1 Transport and endpoint

`CodexRuntimeAdapter` always sets `transportKind: 'codex_responses'` and
`endpoint: 'responses'`. It must **never** probe `POST /chat/completions` or `GET /models`. The
Codex responses path already exists; the adapter delegates to it without replacing it.

### S7.2 Validation strategy

PR 1 prefers **no network probe** in `CodexRuntimeAdapter.validateSetup()`. Validation is
credential-based only:

1. Resolve `CodexCredentialSource` (§S7.3)
2. Verify that the resolved credential is non-empty and structurally valid
3. Return success with capabilities if credentials are present; return `credential_missing`
   otherwise

If the existing `doctor:runtime` behavior already probes `POST /responses` for Codex profiles
(confirmed during Phase A), that probe may be **reused** via `codexLegacyBridge.ts` inside
`ProviderStartupVerifier.verifyStartup()`, not inside `validateSetup()`.

### S7.3 `CodexCredentialSource` resolution

```ts
// codex/codexLegacyBridge.ts
export function resolveCodexCredentialSource(
  env: Readonly<Record<string, string | undefined>>,
): CodexCredentialSource | null {
  // Resolution order: CODEX_API_KEY → CODEX_AUTH_JSON_PATH → ~/.codex/auth.json → CODEX_HOME
}
```

### S7.4 Codex OAuth isolation

When `resolveCodexCredentialSource` returns `'oauth'` or `'auth_json'`, `CodexRuntimeAdapter`
handles the credential entirely. It must not fall through to the generic OpenAI-compatible path.
The `RuntimeTransportPayload` for any identifiable Codex session must carry
`transportKind: 'codex_responses'`, never `'openai_compatible'`.

### S7.5 Codex alias preservation

`codexLegacyBridge.ts` re-exports `isCodexAlias` and any other Codex-specific functions
extracted from `openaiShim.ts`. The originals inside `openaiShim.ts` are not removed — the
bridge references them without breaking existing behavior.

---

## S8. `/status` Panel Integration

Phase A must determine whether the `/status` panel is a React/Ink component or a
command-rendered text output. The integration pattern differs:

### S8.1 If `/status` is a React/Ink component

Use `useSyncExternalStore` — designed for external store reads in React concurrent mode:

```tsx
import { useSyncExternalStore } from 'react'
import { RuntimeStatusStore } from 'src/services/model-runtime/RuntimeStatusStore'

const runtimeStatus = useSyncExternalStore(
  RuntimeStatusStore.subscribe,
  RuntimeStatusStore.getSnapshot,
)
```

### S8.2 If `/status` is command-rendered text

Use `RuntimeStatusStore.getSnapshot()` directly:

```ts
const status = RuntimeStatusStore.getSnapshot()
// Render status fields as plain text lines
```

### S8.3 Before Phase A confirmation

Do not assume the exact file location or rendering model. The integration code for the status
panel integration commit (Phase D) must not be written until Phase A confirms the panel type
and file path.

---

## S9. Import Rules

1. **Follow the existing repository import style.** Before writing any import path, read how
   other files in the same area import from `src/services/` and match that pattern.
2. **Cross-module imports** may use the `src/*` alias (e.g.,
   `'src/services/model-runtime/RuntimeSecurity'`) if that alias style already appears in the
   repository's source files.
3. **Same-folder imports** use relative paths without extensions (e.g.,
   `'./RuntimeSecurity'`).
4. **No `.js` extensions** in TypeScript source files. With `moduleResolution: bundler`, Bun
   resolves extensions automatically.
5. **No `../../` chains** across module boundaries. Use the `src/*` alias instead.

---

## S10. Cache TTL and Timeout Policy

### S10.1 `RuntimeCapabilityCache`

- Stores `RuntimeModelCapabilities` keyed by `RuntimeCapabilityCacheKey` (no raw baseUrl, no raw credentials stored in the key)
- **PR 1: in-memory only.** No persistent cache is written to disk unless an existing sanitized
  persistent cache is already present and confirmed safe during Phase A. The in-memory cache
  is a plain `Map` (or optional `lru-cache` backing); it does not survive process exit.
- **TTL is process-local.** A default TTL of 1 hour applies within the same process. After a
  process exits and a new process starts, the cache is empty. A new process **cannot** skip
  remote verification on the basis of a prior in-memory cache entry. `ProviderStartupVerifier`
  must treat each new process as a cold start unless a persistent cache is explicitly introduced
  in a future PR.
- All `get`, `set`, and `delete` operations use `RuntimeCapabilityCacheKey`, never a raw
  `profileId` string. `profileId` is not a valid cache lookup term in PR 1.

### S10.2 Timeout values

| Operation | Default timeout | Behavior on timeout |
|---|---|---|
| `/provider` validation (`GET /models` or equivalent) | 10 s | Return `RuntimeSetupResult` with `code: 'timeout'` |
| Startup verification (`ProviderStartupVerifier.verifyStartup()`) | 3–5 s | Non-fatal warning; runtime continues with cached capabilities |
| `/provider` metadata / capability fetch | 5 s | Warning logged; conservative fallback capabilities used |
| Startup metadata / capability fetch | 2–3 s | Warning logged; conservative fallback capabilities used |

No timeout value in PR 1 is left unbounded. "No hard limit" is not acceptable for any
network-bound operation in a CLI startup path.

### S10.3 Conservative fallback

When a metadata fetch times out or returns an unexpected response,
`RuntimeModelCapabilities.thinking` and `RuntimeModelCapabilities.effort` are populated from the
provider's static defaults in `localProviderDefaults.ts` with `source: 'unknown'`. The user is
warned but the session continues.

---

## S11. Integration Points in Existing Files

### S11.1 `src/services/api/client.ts` — additive

Read `RuntimeCapabilityCache` when source is `'provider_command'` or `'provider_profile'`.
Use `payload.transportKind` to select the transport per §S4.2. When no managed runtime is
active, behavior is unchanged. Estimated addition: ~15 lines.

### S11.2 `src/services/api/openaiShim.ts` — additive

Add a typed active-quirk reader per §S5.2. Codex endpoint routing already present in the shim
is not touched. Estimated addition: ~20 lines.

**Important:** This integration happens only after all quirk type tests, allowlist tests,
legacy coexistence tests, and provider adapter tests have passed. See §S14 commit sequence.

### S11.3 `/provider` command handler — replace validation call

After Phase A locates the handler, replace the inline / script-based validation call with:

```ts
const result = await coordinator.validateSetup(input)
if (result.ok) {
  await saveProfile(result.capabilities.payload, ...)
}
```

The React/Ink UI is not changed. Only the backend validation call changes. Estimated change:
~30–50 lines.

### S11.4 `/status` panel — additive

Add an "Adapter Runtime" section using the pattern from §S8. No existing UI section is modified.

### S11.5 CLI startup entry point — additive

After loading the profile but before entering the REPL loop:

```ts
if (profile && isManagedProvider(profile.providerId)) {
  await ProviderStartupVerifier.verify(profile, { startupMode })
}
```

Estimated addition: ~10 lines.

### S11.6 `src/utils/model/providers.ts` — no change required

The existing `'openai'` provider type covers the legacy path. PR 1's managed providers are
handled internally by the runtime layer.

### S11.7 `package.json` — test scope only

PR 1 adds only:

```json
"test:runtime": "bun test src/services/model-runtime/",
"test:runtime:watch": "bun test --watch src/services/model-runtime/"
```

The `test`, `test:coverage`, `test:provider`, `test:provider-recommendation`, `typecheck`,
`smoke`, `doctor:runtime`, and `hardening:strict` scripts already exist. They must not be
re-added or overwritten.

---

## S12. New File Layout

```
src/services/model-runtime/
  types.ts                                    ~300 lines  (all PR 1 types — see §S2)
  managedProviderIds.ts                       ~25 lines
  localProviderDefaults.ts                    ~80 lines
  RuntimeSecurity.ts                          ~120 lines
  RuntimeEndpointNormalizer.ts                ~150 lines
  RuntimeEndpointBuilder.ts                   ~60 lines
  RuntimeCapabilityCache.ts                   ~120 lines
  RuntimeStatusStore.ts                       ~100 lines
  RuntimeQuirkPolicy.ts                       ~80 lines
  ModelRuntimeCoordinator.ts                  ~200 lines
  RuntimeAdapterRegistry.ts                   ~80 lines
  RuntimeCapabilityResolver.ts                ~150 lines
  ProviderStartupVerifier.ts                  ~100 lines

src/services/model-runtime/adapters/
  legacy/LegacyRuntimePassthroughAdapter.ts   ~60 lines
  codex/CodexRuntimeAdapter.ts                ~150 lines
  codex/codexLegacyBridge.ts                  ~100 lines  (extracts from openaiShim.ts)
  codex/codexCapabilities.ts                  ~60 lines
  codex/codexEndpointConfig.ts                ~30 lines
  gemini/GeminiRuntimeAdapter.ts              ~150 lines
  gemini/geminiCapabilities.ts                ~60 lines
  gemini/geminiEndpointConfig.ts              ~30 lines
  nvidia/NvidiaNimRuntimeAdapter.ts           ~180 lines
  nvidia/nvidiaModelCatalogBridge.ts          ~60 lines   (wraps src/utils/model/nvidiaNimModels.ts)
  nvidia/nvidiaCapabilities.ts                ~60 lines
  nvidia/nvidiaEndpointConfig.ts              ~30 lines
  nvidia/nvidiaPayloadQuirks.ts               ~40 lines   (NVIDIA_DEEPSEEK_V4_QUIRK as candidate)
  openrouter/OpenRouterRuntimeAdapter.ts      ~160 lines
  openrouter/openRouterCapabilities.ts        ~60 lines
  openrouter/openRouterEndpointConfig.ts      ~30 lines

src/services/model-runtime/__tests__/
  managedProviderIds.test.ts
  RuntimeEndpointNormalizer.test.ts
  RuntimeEndpointBuilder.test.ts
  RuntimeSecurity.test.ts
  RuntimeAdapterRegistry.test.ts
  LegacyRuntimePassthroughAdapter.test.ts
  RuntimeCapabilityCache.test.ts
  RuntimeQuirkPolicy.test.ts
  NvidiaNimRuntimeAdapter.test.ts
  OpenRouterRuntimeAdapter.test.ts
  CodexRuntimeAdapter.test.ts
  GeminiRuntimeAdapter.test.ts
  integration/
    providerSetupFlow.test.ts
    legacyCoexistence.test.ts
    activationSource.test.ts
    payloadQuirkPolicy.test.ts
    metadataTimeout.test.ts
    verifyStartupInput.test.ts

NOTE: src/utils/model/nvidiaNimModels.ts already exists.
      Do NOT create adapters/nvidia/NvidiaNimModels.ts.
      Use nvidiaModelCatalogBridge.ts to read from the existing file.
```

Estimated total addition: ~2,700–3,200 lines of new TypeScript.
Estimated existing file changes: ~80–120 lines.

---

## S13. Implementation Strategy

### Phase A — Discovery (mandatory before writing runtime code)

```
A1. Locate /provider command handler in src/
    → Exact file, function signature, current write path to .openclaude-profile.json

A2. Locate /status panel component in src/
    → React/Ink component or command-rendered text? (determines §S8 pattern)

A3. Read openaiShim.ts in full
    → Identify Codex routing logic and candidate extraction points for codexLegacyBridge.ts
    → Identify all provider-specific hardcoded behavior
    → Identify where active quirk fields can be applied (request body construction point)
    → Map internal function names to the names in this spec

A4. Read scripts/system-check.ts
    → Confirm whether Codex profiles probe POST /responses
    → Extract exact validation logic per provider

A5. Read scripts/provider-bootstrap.ts
    → Confirm .openclaude-profile.json schema
    → Determine if a version field needs to be added

A6. Confirm CLAUDE_CODE_USE_GEMINI=1 callsite in client.ts
    → Exact integration point for GeminiRuntimeAdapter wiring

A7. Confirm tsconfig.json paths and import style in existing src/ files
    → Verify src/* alias usage before writing any import paths

A8. Confirm package.json scripts
    → Verify exact existing script names before adding test:runtime
```

### Phase B — Foundation (standalone, no existing file changes)

```
B1. types.ts — all types from §S2; no logic, no imports from existing code
B2. managedProviderIds.ts, localProviderDefaults.ts — pure constants
B3. RuntimeSecurity.ts — node:crypto, pure functions (including validateHeaderName)
B4. RuntimeEndpointNormalizer.ts + RuntimeEndpointBuilder.ts — pure functions
B5. RuntimeCapabilityCache.ts — in-memory Map (lru-cache optional)
B6. RuntimeStatusStore.ts — subscribe/getSnapshot for useSyncExternalStore
B7. RuntimeQuirkPolicy.ts — policy evaluation logic
B8. RuntimeAdapterRegistry.ts + LegacyRuntimePassthroughAdapter.ts
B9. Add test:runtime scope to package.json scripts (do not add generic test)
    → Tests for B1–B8 (all pure, no HTTP)
```

### Phase C — Provider Adapters (require Phase A)

```
C1. CodexRuntimeAdapter.ts + codexLegacyBridge.ts
    → Credential-based validation; no network probe; never probes /chat/completions
    → OAuth fully isolated to Codex adapter

C2. GeminiRuntimeAdapter.ts
    → Conservative capabilities (thinking.supported and effort.supported resolved from static data)
    → All auth modes: api-key, access-token, adc
    → transportKind set by resolved authMode
    → CLAUDE_CODE_USE_GEMINI=1 legacy env path must not be disturbed

C3. NvidiaNimRuntimeAdapter.ts + nvidiaModelCatalogBridge.ts
    → GET /models mandatory for validation
    → Read model catalog from existing src/utils/model/nvidiaNimModels.ts via bridge
    → Emit NVIDIA_DEEPSEEK_V4_QUIRK as candidate (status: 'candidate')

C4. OpenRouterRuntimeAdapter.ts
    → GET /models mandatory; no OPENAI_API_KEY pollution

C5. ProviderStartupVerifier.ts + ModelRuntimeCoordinator.ts
```

### Phase D — Integration (touches existing files)

```
D1. Hook ModelRuntimeCoordinator into /provider command handler
D2. Add startup verification to CLI entry point (~10 lines, conditional)
D3. Add RuntimeStatusStore reader to /status panel (§S8 pattern, Phase A result)
D4. Add profile version field handling (backward compatible)
D5. Add active quirk reader to openaiShim.ts (~20 lines)
    → ONLY after D1–D4 are complete and integration tests pass
    → ONLY after quirk type tests, allowlist tests, and legacy coexistence tests pass
```

---

## S14. Commit Sequence

Each commit must compile independently (`bun run typecheck` passes).

```
Commit 1: infra(runtime): add model-runtime test scope to package.json
  - Add "test:runtime": "bun test src/services/model-runtime/" if not already present
  - Optionally add "test:runtime:watch"
  - Do NOT add "test": "bun test" — it already exists in main
  - Create src/services/model-runtime/__tests__/.gitkeep
  - Validates: bun run build && bun run smoke still pass

Commit 2: feat(runtime): add core types and managed provider boundary
  - src/services/model-runtime/types.ts (all types from §S2)
  - src/services/model-runtime/managedProviderIds.ts
  - src/services/model-runtime/localProviderDefaults.ts
  - __tests__/managedProviderIds.test.ts
  - Validates: bun run typecheck passes

Commit 3: feat(runtime): add security helpers
  - RuntimeSecurity.ts — node:crypto; validateHeaderName included
  - __tests__/RuntimeSecurity.test.ts
  - Validates: bun run test:runtime passes

Commit 4: feat(runtime): add endpoint normalizer and builder
  - RuntimeEndpointNormalizer.ts, RuntimeEndpointBuilder.ts
  - __tests__/RuntimeEndpointNormalizer.test.ts (table-driven, ~30 cases)
  - __tests__/RuntimeEndpointBuilder.test.ts

Commit 5: feat(runtime): add capability cache and status store
  - RuntimeCapabilityCache.ts (no secrets, TTL per §S10.1)
  - RuntimeStatusStore.ts (subscribe/getSnapshot)
  - __tests__/RuntimeCapabilityCache.test.ts

Commit 6: feat(runtime): add quirk policy and adapter registry
  - RuntimeQuirkPolicy.ts — candidate evaluation; only this layer may produce ActiveRuntimeProviderPayloadQuirk
  - RuntimeAdapterRegistry.ts
  - adapters/legacy/LegacyRuntimePassthroughAdapter.ts
  - __tests__/RuntimeQuirkPolicy.test.ts
  - __tests__/RuntimeAdapterRegistry.test.ts
  - __tests__/LegacyRuntimePassthroughAdapter.test.ts

Commit 7: feat(runtime): add Codex runtime adapter
  - adapters/codex/ — all files
  - codexLegacyBridge.ts extracts without removing originals from openaiShim.ts
  - Credential-based only; no probe; never calls /chat/completions; OAuth isolated
  - __tests__/CodexRuntimeAdapter.test.ts

Commit 8: feat(runtime): add Gemini runtime adapter
  - adapters/gemini/ — capabilities resolved statically; all auth modes; transport by authMode
  - No disruption to CLAUDE_CODE_USE_GEMINI=1 legacy path
  - __tests__/GeminiRuntimeAdapter.test.ts

Commit 9: feat(runtime): add NVIDIA NIM runtime adapter
  - adapters/nvidia/ including nvidiaModelCatalogBridge.ts and nvidiaPayloadQuirks.ts
  - Reads from src/utils/model/nvidiaNimModels.ts via bridge — no duplication
  - Emits NVIDIA_DEEPSEEK_V4_QUIRK with status: 'candidate' only
  - __tests__/NvidiaNimRuntimeAdapter.test.ts (fetch mock)

Commit 10: feat(runtime): add OpenRouter runtime adapter
  - adapters/openrouter/ — GET /models mandatory; no OPENAI_API_KEY pollution
  - __tests__/OpenRouterRuntimeAdapter.test.ts

Commit 11: feat(runtime): add coordinator and startup verifier
  - ModelRuntimeCoordinator.ts (generation counter for concurrency)
  - ProviderStartupVerifier.ts (verifyStartup receives RuntimeStartupInput; timeouts per §S10.2)
  - Validates: bun run typecheck

Commit 12: feat(runtime): integrate runtime into /provider command
  - MODIFY: located command handler (Phase A result)
  - Replace inline validation with coordinator.validateSetup()
  - Validates: /provider end-to-end manually

Commit 13: feat(runtime): add startup verification to CLI entry point
  - MODIFY: src/cli.ts or equivalent (Phase A result)
  - ~10 lines: call ProviderStartupVerifier if managed provider in profile
  - Validates: startup without profile = no change

Commit 14: feat(runtime): integrate status store into /status panel
  - MODIFY: located status panel (Phase A result)
  - Apply §S8 pattern based on panel type
  - Validates: /status shows Adapter Runtime section for managed providers

Commit 15: test(runtime): add integration tests
  - integration/providerSetupFlow.test.ts
  - integration/legacyCoexistence.test.ts  (CLAUDE_CODE_USE_OPENAI=1 and CLAUDE_CODE_USE_GEMINI=1)
  - integration/activationSource.test.ts
  - integration/payloadQuirkPolicy.test.ts
  - integration/metadataTimeout.test.ts
  - integration/verifyStartupInput.test.ts
  - All tests in §S15.3 must pass before Commit 16 may proceed

Commit 16: feat(runtime): add active quirk reader to openaiShim.ts
  - MODIFY: openaiShim.ts — ~20 additive lines
  - Individual field application, no Object.assign
  - Only processes ActiveRuntimeProviderPayloadQuirk (enabled true, enabledBy runtime_policy)
  - PREREQUISITE: Commit 15 tests pass; quirk type, allowlist, and coexistence tests pass
  - Validates: existing providers still work (bun run smoke + bun run test:runtime)
```

---

## S15. Test Strategy

All tests use `bun:test`. No other test runner is introduced.

### S15.1 Test file template

```ts
import { describe, test, expect } from 'bun:test'
import {
  MANAGED_PROVIDER_IDS,
  isManagedProvider,
} from 'src/services/model-runtime/managedProviderIds'

describe('MANAGED_PROVIDER_IDS', () => {
  test('contains exactly 4 providers', () => {
    expect(MANAGED_PROVIDER_IDS).toHaveLength(4)
  })

  test.each([
    ['gemini',     true],
    ['codex',      true],
    ['nvidia-nim', true],
    ['openrouter', true],
    ['openai',     false],
    ['anthropic',  false],
    ['ollama',     false],
    ['',           false],
  ])('isManagedProvider(%s) === %s', (id, expected) => {
    expect(isManagedProvider(id)).toBe(expected)
  })
})
```

### S15.2 HTTP mock for adapter tests

```ts
import { describe, test, expect, mock, beforeEach } from 'bun:test'

const mockFetch = mock()
global.fetch = mockFetch as unknown as typeof fetch

import { NvidiaNimRuntimeAdapter } from
  'src/services/model-runtime/adapters/nvidia/NvidiaNimRuntimeAdapter'

describe('NvidiaNimRuntimeAdapter.validateSetup', () => {
  beforeEach(() => { mockFetch.mockReset() })

  test('returns invalid_api_key when /models returns 401', async () => {
    mockFetch.mockResolvedValueOnce(new Response('', { status: 401 }))
    const adapter = new NvidiaNimRuntimeAdapter()
    const result = await adapter.validateSetup({
      providerInput: {
        providerId: 'nvidia-nim',
        baseUrl: 'https://integrate.api.nvidia.com/v1',
        model: 'nvidia/llama-3.3-nemotron-super-49b-v1',
        credential: { kind: 'api_key', value: 'nvapi-fake-key' },
      },
      normalized: { baseUrl: 'https://integrate.api.nvidia.com/v1', warnings: [] },
      processEnv: {},
      source: 'provider_command',
      legacyEnvActive: false,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('invalid_api_key')
  })

  test('returns model_not_found when model absent from /models list', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ data: [{ id: 'other-model' }] }), { status: 200 })
    )
    const adapter = new NvidiaNimRuntimeAdapter()
    const result = await adapter.validateSetup({
      providerInput: {
        providerId: 'nvidia-nim',
        baseUrl: 'https://integrate.api.nvidia.com/v1',
        model: 'nvidia/requested-model',
        credential: { kind: 'api_key', value: 'nvapi-valid-key' },
      },
      normalized: { baseUrl: 'https://integrate.api.nvidia.com/v1', warnings: [] },
      processEnv: {},
      source: 'provider_command',
      legacyEnvActive: false,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('model_not_found')
  })
})
```

### S15.3 Required test coverage for PR 1

**Activation gating — both legacy env flags**

```ts
// integration/activationSource.test.ts

test('CLAUDE_CODE_USE_OPENAI=1 alone does not activate managed runtime', () => {
  const registry = new RuntimeAdapterRegistry()
  const adapter = registry.getAdapter({ source: 'legacy_env', providerId: 'nvidia-nim' })
  expect(adapter).toBeInstanceOf(LegacyRuntimePassthroughAdapter)
})

test('CLAUDE_CODE_USE_GEMINI=1 alone does not activate managed runtime', () => {
  const registry = new RuntimeAdapterRegistry()
  const adapter = registry.getAdapter({ source: 'legacy_env', providerId: 'gemini' })
  expect(adapter).toBeInstanceOf(LegacyRuntimePassthroughAdapter)
})

test('provider_profile activates managed runtime', () => {
  const registry = new RuntimeAdapterRegistry()
  const adapter = registry.getAdapter({ source: 'provider_profile', providerId: 'nvidia-nim' })
  expect(adapter).toBeInstanceOf(NvidiaNimRuntimeAdapter)
})
```

**Legacy coexistence**

```ts
// integration/legacyCoexistence.test.ts

test('CLAUDE_CODE_USE_OPENAI=1 without /provider leaves runtime inactive', () => {
  const status = RuntimeStatusStore.getSnapshot()
  expect(status.isManaged).toBe(false)
})

test('CLAUDE_CODE_USE_GEMINI=1 without /provider leaves runtime inactive', () => {
  // Simulates startup with CLAUDE_CODE_USE_GEMINI=1 and no profile
  const source: ManagedActivationSource = 'legacy_env'
  const registry = new RuntimeAdapterRegistry()
  const adapter = registry.getAdapter({ source, providerId: 'gemini' })
  expect(adapter).toBeInstanceOf(LegacyRuntimePassthroughAdapter)
})

test('managed providers do not hijack legacy OpenAI-compatible flow', () => {
  const quirks = getActiveQuirksForSource('legacy_env')
  expect(quirks).toHaveLength(0)
})
```

**Payload quirk policy**

```ts
// integration/payloadQuirkPolicy.test.ts

test('provider adapters emit candidate quirks only — status must be candidate', async () => {
  const adapter = new NvidiaNimRuntimeAdapter()
  const result = await adapter.validateSetup(validNvidiaInput)
  if (!result.ok) throw new Error('setup failed')
  for (const quirk of result.capabilities.quirkCandidates) {
    expect(quirk.status).toBe('candidate')
    // Adapters must never produce 'approved' status
    expect(quirk.status).not.toBe('approved')
  }
})

test('provider adapters cannot emit enabled=true quirks', async () => {
  const adapter = new NvidiaNimRuntimeAdapter()
  const result = await adapter.validateSetup(validNvidiaInput)
  if (!result.ok) throw new Error('setup failed')
  for (const quirk of result.capabilities.quirkCandidates) {
    // enabled is not a property on RuntimeProviderPayloadQuirk — TypeScript enforces this
    expect(Object.prototype.hasOwnProperty.call(quirk, 'enabled')).toBe(false)
  }
})

test('quirk condition must be a typed object with a type field', () => {
  expect(typeof NVIDIA_DEEPSEEK_V4_QUIRK.condition).toBe('object')
  expect(NVIDIA_DEEPSEEK_V4_QUIRK.condition).toHaveProperty('type')
  expect(typeof NVIDIA_DEEPSEEK_V4_QUIRK.condition.type).toBe('string')
})

test('no arbitrary extra body field injection — only allowlisted fields applied', () => {
  const approvedQuirk = buildApprovedQuirkForTest(NVIDIA_DEEPSEEK_V4_QUIRK)
  const applied = simulateQuirkApplication(approvedQuirk, 'deepseek-v4-flash')
  const allowlistedKeys: Array<keyof RuntimeProviderPayloadQuirkAllowlist> = [
    'chat_template_kwargs',
  ]
  Object.keys(applied).forEach(k => expect(allowlistedKeys).toContain(k))
})
```

**Codex-specific**

```ts
// CodexRuntimeAdapter.test.ts

test('CodexRuntimeAdapter.validateSetup never calls /chat/completions', async () => {
  const fetchSpy = mock()
  global.fetch = fetchSpy as unknown as typeof fetch
  const adapter = new CodexRuntimeAdapter()
  await adapter.validateSetup(codexApiKeyInput)
  const calledUrls: string[] = fetchSpy.mock.calls.map((c: unknown[]) => String(c[0]))
  calledUrls.forEach(url => {
    expect(url).not.toContain('chat/completions')
    expect(url).not.toContain('/models')
  })
})

test('Codex OAuth is handled by CodexRuntimeAdapter — does not fall through to openai_compatible', async () => {
  const adapter = new CodexRuntimeAdapter()
  const result = await adapter.validateSetup(codexOAuthInput)
  if (!result.ok) throw new Error('setup failed')
  expect(result.capabilities.payload.transportKind).toBe('codex_responses')
})
```

**NVIDIA bridge — no model catalog duplication**

```ts
// NvidiaNimRuntimeAdapter.test.ts

test('NvidiaNimRuntimeAdapter reads model catalog through nvidiaModelCatalogBridge, not a local copy', () => {
  // The bridge module must import from src/utils/model/nvidiaNimModels, not from
  // adapters/nvidia/NvidiaNimModels.ts (which must not exist)
  const bridge = new NvidiaModelCatalogBridge()
  const knownModels = bridge.getKnownModelIds()
  expect(Array.isArray(knownModels)).toBe(true)
  // Confirm bridge does NOT have its own model data — it reads from the shared catalog
  expect(bridge.hasOwnModelData).toBe(false)
})
```

**`verifyStartup` receives full `RuntimeStartupInput`**

```ts
// integration/verifyStartupInput.test.ts

test('RuntimeProviderAdapter.verifyStartup receives RuntimeStartupInput, not just capabilities', async () => {
  const adapter = new NvidiaNimRuntimeAdapter()
  const startupInput: RuntimeStartupInput = {
    providerInput: {
      providerId: 'nvidia-nim',
      baseUrl: 'https://integrate.api.nvidia.com/v1',
      model: 'nvidia/llama-3.3-nemotron-super-49b-v1',
      credential: { kind: 'api_key', envVar: 'NVIDIA_API_KEY' },
    },
    normalized: { baseUrl: 'https://integrate.api.nvidia.com/v1', warnings: [] },
    processEnv: { NVIDIA_API_KEY: 'nvapi-test-key' },
    source: 'provider_profile',
    startupMode: 'non_interactive',
  }
  // verifyStartup must accept RuntimeStartupInput — TypeScript enforces the signature
  const result = await adapter.verifyStartup(startupInput)
  expect(result).toHaveProperty('ok')
})
```

**Metadata timeout falls back conservatively**

```ts
// integration/metadataTimeout.test.ts

test('metadata fetch timeout returns conservative fallback capabilities, not an error', async () => {
  const slowFetch = mock().mockImplementation(() =>
    new Promise(resolve => setTimeout(() => resolve(new Response('', { status: 200 })), 10_000))
  )
  global.fetch = slowFetch as unknown as typeof fetch

  const adapter = new NvidiaNimRuntimeAdapter({ metadataTimeoutMs: 50 })
  const result = await adapter.validateSetup(validNvidiaInput)

  // Timeout on metadata does not fail setup — conservative fallback is used
  if (result.ok) {
    expect(result.capabilities.thinking.source).toBe('unknown')
    expect(result.capabilities.effort.source).toBe('unknown')
  }
  // If the adapter treats this as a hard failure, this test also catches it
})
```

**`source='none'` selects no adapter and leaves Anthropic SDK path untouched**

```ts
// integration/activationSource.test.ts

test("source='none': client.ts must not call RuntimeAdapterRegistry", () => {
  // Production invariant: when source is 'none', the registry is never reached.
  // This test asserts the registry guard behavior as defence-in-depth only.
  const registry = new RuntimeAdapterRegistry()
  const adapter = registry.getAdapter({ source: 'none', providerId: 'nvidia-nim' })
  // Defensive return — production code must not rely on this path.
  expect(adapter).toBeInstanceOf(LegacyRuntimePassthroughAdapter)
  expect(adapter.adapterId).toBe('legacy-passthrough')
})

test("source='none' with an empty providerId string returns passthrough adapter (defensive)", () => {
  const registry = new RuntimeAdapterRegistry()
  const adapter = registry.getAdapter({ source: 'none', providerId: '' })
  expect(adapter).toBeInstanceOf(LegacyRuntimePassthroughAdapter)
})
```

**`RuntimeAdapterRegistry` accepts `providerId: string` and routes unmanaged providers to legacy**

```ts
// RuntimeAdapterRegistry.test.ts

test('registry accepts an unrecognized providerId string and routes to LegacyRuntimePassthroughAdapter', () => {
  const registry = new RuntimeAdapterRegistry()
  const adapter = registry.getAdapter({ source: 'provider_profile', providerId: 'some-unknown-provider' })
  expect(adapter).toBeInstanceOf(LegacyRuntimePassthroughAdapter)
  expect(adapter.adapterId).toBe('legacy-passthrough')
})

test('registry accepts a recognized providerId string with active source and returns managed adapter', () => {
  const registry = new RuntimeAdapterRegistry()
  const adapter = registry.getAdapter({ source: 'provider_profile', providerId: 'nvidia-nim' })
  expect(adapter).toBeInstanceOf(NvidiaNimRuntimeAdapter)
  // adapterId is a ManagedProviderId — type system permits calling validateSetup after narrowing
  expect(isManagedProvider(adapter.adapterId)).toBe(true)
})

test('LegacyRuntimePassthroughAdapter does not have validateSetup or verifyStartup', () => {
  const registry = new RuntimeAdapterRegistry()
  const adapter = registry.getAdapter({ source: 'legacy_env', providerId: 'nvidia-nim' })
  expect(adapter).toBeInstanceOf(LegacyRuntimePassthroughAdapter)
  // TypeScript enforces this at compile time; belt-and-suspenders check at runtime:
  expect(typeof (adapter as unknown as Record<string, unknown>)['validateSetup']).toBe('undefined')
  expect(typeof (adapter as unknown as Record<string, unknown>)['verifyStartup']).toBe('undefined')
})
```

**TTL is process-local when cache is in-memory**

```ts
// RuntimeCapabilityCache.test.ts

test('cache is in-memory: a new cache instance has no entries from a previous instance', () => {
  const cache1 = new RuntimeCapabilityCache()
  const cacheKey: RuntimeCapabilityCacheKey = makeMockCacheKey()
  cache1.set(cacheKey, makeMockCapabilities())

  // Simulate a new process: create a fresh instance
  const cache2 = new RuntimeCapabilityCache()
  const result = cache2.get(cacheKey)
  expect(result).toBeNull()
})

test('cache TTL expires within the same process after the configured duration', async () => {
  const cache = new RuntimeCapabilityCache({ ttlMs: 50 })
  const cacheKey: RuntimeCapabilityCacheKey = makeMockCacheKey()
  cache.set(cacheKey, makeMockCapabilities())
  await new Promise(r => setTimeout(r, 100))
  expect(cache.get(cacheKey)).toBeNull()
})
```

**`approvedQuirkIds` controls quirk activation by exact id**

```ts
// integration/payloadQuirkPolicy.test.ts

test('RuntimeQuirkPolicy promotes a quirk only when its id is in approvedQuirkIds', () => {
  const policy = new RuntimeQuirkPolicy()
  const context: RuntimeQuirkPolicyContext = {
    modelId: 'nvidia/deepseek-v4-flash',
    providerId: 'nvidia-nim',
    approvedQuirkIds: new Set(['nvidia-nim/deepseek-v4/chat_template_kwargs']),
  }
  const result = policy.evaluate(NVIDIA_DEEPSEEK_V4_QUIRK, context)
  expect(result).not.toBeNull()
  expect(result?.status).toBe('approved')
  expect(result?.enabled).toBe(true)
})

test('RuntimeQuirkPolicy rejects a quirk whose id is absent from approvedQuirkIds', () => {
  const policy = new RuntimeQuirkPolicy()
  const context: RuntimeQuirkPolicyContext = {
    modelId: 'nvidia/deepseek-v4-flash',
    providerId: 'nvidia-nim',
    approvedQuirkIds: new Set([]),  // empty — no approvals
  }
  const result = policy.evaluate(NVIDIA_DEEPSEEK_V4_QUIRK, context)
  expect(result).toBeNull()
})
```

**`model_id_includes` is not allowed for approved active quirks**

```ts
// integration/payloadQuirkPolicy.test.ts

test('RuntimeQuirkPolicy rejects approval of a quirk with model_id_includes condition', () => {
  const policy = new RuntimeQuirkPolicy()
  const broadCandidate: RuntimeProviderPayloadQuirk = {
    id: 'test/broad-candidate',
    provider: 'nvidia-nim',
    condition: { type: 'model_id_includes', substring: 'deepseek' },
    allowlistedFields: { chat_template_kwargs: { enable_thinking: true } },
    status: 'candidate',
  }
  const context: RuntimeQuirkPolicyContext = {
    modelId: 'nvidia/deepseek-v4-flash',
    providerId: 'nvidia-nim',
    approvedQuirkIds: new Set(['test/broad-candidate']),
  }
  // Policy must reject: 'model_id_includes' is prohibited for approved active quirks
  const result = policy.evaluate(broadCandidate, context)
  expect(result).toBeNull()
})

test('openaiShim does not apply a quirk with model_id_includes condition even if enabled=true', () => {
  const quirkWithIncludes = buildApprovedQuirkWithCondition({
    type: 'model_id_includes',
    substring: 'deepseek',
  })
  // Simulates the defence-in-depth check in the shim
  const applied = simulateShimQuirkApplication(quirkWithIncludes, 'nvidia/deepseek-v4-flash')
  expect(applied).toEqual({})  // no fields applied
})
```

**Codex max→xhigh capability is present but allowedInAuto=false**

```ts
// CodexRuntimeAdapter.test.ts

test('Codex effort capability includes max→xhigh mapping with allowedInAuto=false', async () => {
  const adapter = new CodexRuntimeAdapter()
  const result = await adapter.validateSetup(codexApiKeyInput)
  if (!result.ok) throw new Error('setup failed')
  const { effort } = result.capabilities
  expect(effort.supported).toBe(true)
  expect(effort.allowAutoMax).toBe(false)
  const maxLevel = effort.nativeValues.find(v => v.abstract === 'max')
  expect(maxLevel).toBeDefined()
  expect(maxLevel?.native).toBe('xhigh')
  expect(maxLevel?.allowedInAuto).toBe(false)
})

test('Codex maxAutoAbstractEffort is high, never max', async () => {
  const adapter = new CodexRuntimeAdapter()
  const result = await adapter.validateSetup(codexApiKeyInput)
  if (!result.ok) throw new Error('setup failed')
  expect(result.capabilities.effort.maxAutoAbstractEffort).toBe('high')
})
```

**`RuntimeThinkingCapability.mode` is present for every provider**

```ts
// integration/providerSetupFlow.test.ts

const managedProviders: Array<{ adapter: RuntimeProviderAdapter; input: RuntimeSetupInput }> = [
  { adapter: new NvidiaNimRuntimeAdapter(), input: validNvidiaInput },
  { adapter: new OpenRouterRuntimeAdapter(), input: validOpenRouterInput },
  { adapter: new CodexRuntimeAdapter(),     input: codexApiKeyInput },
  { adapter: new GeminiRuntimeAdapter(),    input: validGeminiInput },
]

test.each(managedProviders)(
  'RuntimeThinkingCapability.mode is a non-empty string for $adapter.providerId',
  async ({ adapter, input }) => {
    const result = await adapter.validateSetup(input)
    if (!result.ok) return  // skip if credentials not present in test env
    const { mode } = result.capabilities.thinking
    expect(typeof mode).toBe('string')
    expect(mode.length).toBeGreaterThan(0)
    const validModes = ['none', 'reasoning_effort', 'thinking_object', 'budget_tokens', 'provider_specific']
    expect(validModes).toContain(mode)
  }
)
```

---

## S16. Risk Table

| Risk | Affected file(s) | Severity | Mitigation |
|---|---|---|---|
| `/provider` command handler location is wrong | `src/commands/provider.ts` (assumed) | High | Phase A must confirm before Commit 12 |
| `openaiShim.ts` has tight coupling that resists quirk injection | `src/services/api/openaiShim.ts` | Medium | Read full source before Commit 16; inject at request-body construction point |
| Codex bridge extraction breaks existing Codex flow | `src/services/api/openaiShim.ts` | High | Bridge re-exports without removing originals; existing code stays unchanged |
| Gemini `client.ts` callsite is unknown | `src/services/api/client.ts` | High | Phase A must confirm before Commit 8 wires transport routing |
| `/status` panel type (React/Ink vs text) is unknown | Located during Phase A | Medium | Phase A must confirm before Commit 14; correct pattern per §S8 |
| `.openclaude-profile.json` format change breaks existing profiles | `scripts/provider-bootstrap.ts` | Medium | Backward-compatible version field; missing version = legacy profile |
| TypeScript strict mode rejects adapter types | All new adapter files | Low | Types are strict-mode compatible by design |
| `moduleResolution: bundler` breaks imports in test files | All test files | Low | No `.js` extensions; `src/*` or relative per §S9 |
| `CLAUDE_CODE_USE_OPENAI=1` or `GEMINI=1` path silently broken | `src/services/api/client.ts` | High | `legacyCoexistence.test.ts` asserts runtime inactive for both flags without `/provider` |
| Race condition between concurrent `/provider` calls | `ModelRuntimeCoordinator.ts` | Medium | `runtimeGeneration` counter incremented atomically; result checked before write |
| Quirk reader added to shim before tests pass | `src/services/api/openaiShim.ts` | High | Commit 16 is gated on Commit 15 integration tests passing |
| DeepSeek v4 quirk promoted without evidence | `nvidiaPayloadQuirks.ts` | High | Emitted as `status: 'candidate'`; §S6.2 evidence required before `RuntimeQuirkPolicy` may approve |
| Codex OAuth falls through to generic OpenAI path | `CodexRuntimeAdapter.ts` | High | Explicit `transportKind: 'codex_responses'` + test assertion |
| NvidiaNimModels.ts duplicated under adapters/ | `src/services/model-runtime/adapters/nvidia/` | Medium | Use `nvidiaModelCatalogBridge.ts` reading from existing `src/utils/model/nvidiaNimModels.ts` |

---

## S17. Definition of Done

PR 1 is complete when all of the following are true against the **actual** target-branch
codebase:

```
Source code
  ✓ src/services/model-runtime/ exists with all planned files
  ✓ All new files pass bun run typecheck with zero errors
  ✓ No new npm dependencies added (package.json unchanged except test:runtime scope)
  ✓ No NvidiaNimModels.ts created under adapters/nvidia/ (use nvidiaModelCatalogBridge.ts)

Build
  ✓ bun run build succeeds
  ✓ bun run smoke passes (dist/cli.mjs --version outputs correctly)
  ✓ bun run hardening:strict passes (typecheck + smoke + doctor:runtime)

Tests
  ✓ bun run test:runtime passes (new scoped script)
  ✓ bun run test passes (existing full suite; no regression)
  ✓ managedProviderIds: all provider routing assertions pass
  ✓ RuntimeEndpointNormalizer: all normalization table cases pass
  ✓ RuntimeSecurity: no secrets in output assertions pass
  ✓ RuntimeCapabilityCache: no API key stored assertions pass
  ✓ RuntimeCapabilityCache: get/set/delete use RuntimeCapabilityCacheKey, not profileId
  ✓ RuntimeCapabilityCache: key contains providerId, baseUrlHash, modelId, credentialFingerprint, and optional authMode/apiFormat
  ✓ RuntimeCapabilityCache: key stores no raw baseUrl
  ✓ RuntimeCapabilityCache: key stores no raw credential
  ✓ RuntimeCapabilityCache: new instance has no entries from a prior instance (in-memory only)
  ✓ RuntimeCapabilityCache: TTL expires within the same process; new process always starts empty
  ✓ LegacyRuntimePassthroughAdapter: passive behavior assertions pass
  ✓ Provider adapters: HTTP mock tests pass for all 4 managed providers
  ✓ source='none' returns LegacyRuntimePassthroughAdapter and leaves Anthropic SDK path untouched
  ✓ production client.ts does not call RuntimeAdapterRegistry when source='none'
  ✓ source='none' continues Anthropic SDK path directly (no registry lookup in production)
  ✓ source='legacy_env' remains separate from source='none' (distinct activation paths)
  ✓ CLAUDE_CODE_USE_OPENAI=1 alone does not activate managed runtime
  ✓ CLAUDE_CODE_USE_GEMINI=1 alone does not activate managed runtime
  ✓ RuntimeAdapterRegistry.getAdapter() accepts providerId: string; unrecognized string → LegacyRuntimePassthroughAdapter
  ✓ RuntimeAdapterRegistry routes unmanaged providers to LegacyRuntimePassthroughAdapter before type narrowing
  ✓ LegacyRuntimePassthroughAdapter.adapterId === 'legacy-passthrough'; no validateSetup, no verifyStartup
  ✓ ManagedRuntimeProviderAdapter.adapterId and .providerId are both ManagedProviderId (not 'legacy-passthrough')
  ✓ provider_profile activates managed runtime
  ✓ managed providers do not hijack legacy OpenAI-compatible or Gemini flow
  ✓ provider adapters emit candidate quirks only (status: 'candidate')
  ✓ provider adapters cannot set enabled=true on any quirk
  ✓ provider adapters cannot construct ActiveRuntimeProviderPayloadQuirk
  ✓ RuntimeQuirkPolicy is the only layer that may produce ActiveRuntimeProviderPayloadQuirk
  ✓ RuntimeQuirkPolicy promotes only when approvedQuirkIds.has(quirk.id)
  ✓ no free-form payload quirk conditions (typed condition objects only)
  ✓ no arbitrary extra body field injection (only allowlisted keys applied)
  ✓ model_id_includes is prohibited for approved active quirks; RuntimeQuirkPolicy rejects such approval attempts
  ✓ openaiShim defence-in-depth guard blocks model_id_includes quirks even if enabled=true
  ✓ approvedQuirkIds controls quirk activation by exact quirk id; absent id → no promotion
  ✓ RuntimeProviderAdapter alias is compatibility-only; new PR 1 code uses ManagedRuntimeProviderAdapter
  ✓ Codex adapter never calls /chat/completions
  ✓ Codex OAuth handled by Codex adapter when identifiable (no fall-through)
  ✓ Codex effort capability: max→xhigh present with allowedInAuto=false; allowAutoMax=false; maxAutoAbstractEffort='high'
  ✓ Providers with supported=false: nativeValues=[] and maxAutoAbstractEffort='none'
  ✓ RuntimeThinkingCapability.mode is a valid non-empty string for every provider adapter
  ✓ nvidia adapter reads from src/utils/model/nvidiaNimModels.ts via bridge, not a duplicate
  ✓ verifyStartup receives RuntimeStartupInput (not capabilities alone)
  ✓ metadata timeout falls back conservatively; does not crash setup

Existing behavior (no regression)
  ✓ OpenAI path (CLAUDE_CODE_USE_OPENAI=1 + OPENAI_BASE_URL) unchanged
  ✓ Gemini path (CLAUDE_CODE_USE_GEMINI=1 + GEMINI_API_KEY) unchanged
  ✓ Ollama local path unchanged
  ✓ Codex path (codexplan / codexspark) unchanged
  ✓ Anthropic native path unchanged
  ✓ .openclaude-profile.json written by profile:init still loads correctly

Provider adapters
  ✓ /provider with nvidia-nim validates via GET /models (401 → fatal; missing model → fatal)
  ✓ /provider with openrouter validates via GET /models (same)
  ✓ /provider with codex validates via credential resolution, not GET /models
  ✓ /provider with gemini validates with correct auth mode; transport set by authMode
  ✓ User-provided model never replaced silently
  ✓ User-provided baseUrl never replaced silently

Security
  ✓ No API key in RuntimeCapabilityCache
  ✓ No API key in RuntimeStatusStore
  ✓ No API key in logs or error messages
  ✓ Quirk candidates never contain secrets
  ✓ customHeaders pass RuntimeSecurity.validateHeaderName() before use

PR 2 readiness
  ✓ RuntimeModelCapabilities.thinking and .effort exported with resolved values
  ✓ RuntimeCapabilityCache.get() accessible to future PR 2 thinking/effort logic
  ✓ No thinking/effort payload mutation in PR 1 (assertable by grep)
  ✓ DeepSeek v4 quirk remains status: 'candidate' unless §S6.2 evidence is documented
  ✓ RuntimeQuirkPolicy is the only layer that may produce ActiveRuntimeProviderPayloadQuirk
  ✓ NVIDIA_DEEPSEEK_V4_QUIRK condition is not 'model_id_exact' or 'model_id_regex' at candidate stage — tightening is required before any approval attempt
```

---

## Appendix A: Environment Variables Reference

### Variables present before PR 1

`[public-mirror-observed]`

| Variable | Scope | Used by |
|---|---|---|
| `CLAUDE_CODE_USE_OPENAI` | OpenAI-compatible shim flag | `client.ts` |
| `OPENAI_API_KEY` | Generic provider auth | `openaiShim.ts` |
| `OPENAI_MODEL` | Model selection | `model.ts`, `openaiShim.ts` |
| `OPENAI_BASE_URL` | Endpoint override | `openaiShim.ts` |
| `ANTHROPIC_MODEL` | Fallback model | `model.ts` |
| `CLAUDE_CODE_USE_GEMINI` | Gemini path flag | `client.ts` |
| `GEMINI_API_KEY` | Gemini authentication | Gemini path |
| `GEMINI_MODEL` | Active Gemini model | Gemini path |
| `GEMINI_BASE_URL` | Gemini endpoint override | Gemini path |
| `CODEX_API_KEY` | Codex token override | `openaiShim.ts` |
| `CODEX_AUTH_JSON_PATH` | Custom auth.json path | `openaiShim.ts` |
| `CODEX_HOME` | Alternative Codex home | `openaiShim.ts` |
| `FIRECRAWL_API_KEY` | Web search / fetch | `WebSearch`, `WebFetch` tools |
| `OPENCLAUDE_DISABLE_CO_AUTHORED_BY` | Suppress git trailer | git commit tool |

### Variables added by PR 1

| Variable | Scope | Added by |
|---|---|---|
| `NVIDIA_API_KEY` | NVIDIA NIM auth (managed path) | `NvidiaNimRuntimeAdapter` |
| `OPENROUTER_API_KEY` | OpenRouter auth (managed path) | `OpenRouterRuntimeAdapter` |
| `GEMINI_AUTH_MODE` | Gemini auth mode selector (managed path) | `GeminiRuntimeAdapter` |
| `GEMINI_ACCESS_TOKEN` | Gemini access-token auth (managed path) | `GeminiRuntimeAdapter` |

---

## Appendix B: Provider-Specific Notes

### NVIDIA NIM — DeepSeek v4 candidate quirk

See §S6 for the full specification, evidence requirements, and candidate declaration. The quirk
is emitted with `status: 'candidate'` and must not be promoted to `status: 'approved'` without
the documented evidence. `RuntimeQuirkPolicy` is the only layer that may promote it.

### NVIDIA NIM — model catalog

`src/utils/model/nvidiaNimModels.ts` already exists and must not be duplicated.
`nvidiaModelCatalogBridge.ts` reads from it as a read-only source. `GET /models` at `/provider`
time is the only mechanism that validates whether a model is accessible on the user's account.

### Codex — responses endpoint only

`CodexRuntimeAdapter` exclusively uses `POST /responses`. It never probes `GET /models` or
`POST /chat/completions`. The existing routing logic in `openaiShim.ts` is preserved intact via
`codexLegacyBridge.ts` re-exports.

### OpenRouter — model availability

OpenRouter model IDs change and are deprecated without notice. `GET /models` validation at
`/provider` time catches most stale configurations. The validated model ID is stored in
`.openclaude-profile.json` so `ProviderStartupVerifier` can re-check it at startup.

### Gemini — legacy path coexistence

`CLAUDE_CODE_USE_GEMINI=1` and its associated env vars (`GEMINI_API_KEY`, `GEMINI_MODEL`,
`GEMINI_BASE_URL`) are publicly documented on main and must remain fully functional after PR 1.
`GeminiRuntimeAdapter` is additive — it activates only via `/provider` command or profile.
The legacy Gemini env path must not be disrupted.

`GeminiRuntimeAdapter` sets `transportKind` based on the resolved `authMode`:
- OpenAI-compatible endpoint → `transportKind: 'openai_compatible'`
- Native Gemini API → `transportKind: 'gemini_native'`

`[requires-phase-a-verification]` The exact `gemini_native` integration point in `client.ts`
must be confirmed during Phase A before transport routing for Gemini can be wired in.