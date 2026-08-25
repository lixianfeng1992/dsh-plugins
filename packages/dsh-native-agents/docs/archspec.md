# Native Agents Architecture Specification

Status: implementation target for the prototype.

## Goal

`dsh-native-agents` connects locally installed coding agents to ordinary top-level DSH sessions. The first implementation supports Codex and Claude Code, while the provider protocol must allow another native agent to be added without changing the DSH adapter, runtime registry, persistence, or Web settings page.

The package is a pure Cordis plugin. It uses public DSH LLM, subprocess, settings, session, and Web slot capabilities and does not modify DeepSeek Harness.

This package does not register subagent tools. A native agent is selected as the provider of an ordinary DSH session, not created as a child of another DSH agent.

## Ownership

The DSH session is the only public session. It owns the conversation URL, user-visible transcript, title, lifecycle, cancellation, and continuation identity.

Each native provider may create its own durable conversation. That provider conversation is an internal continuation resource, not a second user-facing session. The plugin persists only the association needed to reopen it:

```text
dshSessionId -> providerId + nativeId + cwd
```

Provider-native transcripts remain in the provider's own storage. The plugin neither relocates nor replays them. Bindings live under `<storageRoot>/bindings/`; the default storage root is `<dshHome>/native-agents/`.

One DSH session binds to one native provider when its first native turn starts. The provider cannot change after binding because two providers do not share one native conversation history. A model may change within the bound provider. Selecting another provider requires a new DSH session.

## Runtime structure

```text
DSH session and Web UI
  -> DSH AgentLoop
  -> NativeLlmAdapter
  -> NativeProviderHost
       -> NativeRuntimeRegistry
       -> BindingStore
       -> NativeProvider
            -> CodexProvider  -> local codex app-server
            -> ClaudeProvider -> local Claude Code SDK and CLI
```

The DSH AgentLoop remains the host lifecycle. For a native route it records the request and projected response, carries cancellation, and drives the adapter. The native runtime remains responsible for its system prompt, project instructions, context management, tools, permissions, and provider transcript.

`NativeLlmAdapter` is provider-neutral. It exposes one DSH LLM route per enabled native provider, delegates model metadata to that provider, sends only the newly admitted DSH message to the native conversation, and projects normalized native events into DSH stream chunks.

`NativeProviderHost` owns provider registrations, discovery state, enabled settings, catalog caching, adapter registration handles, and provider runtime registries. It reconciles settings changes atomically: enabling a discovered provider registers its DSH route; disabling it first removes the route, then closes its resident runtimes. Durable bindings are retained.

`NativeRuntimeRegistry` owns live runtimes by DSH session id. It reuses a live runtime for later turns and reconstructs one from a ready binding after plugin or process restart.

## Provider protocol

```ts
type NativeProviderStatus =
  | { state: 'available'; version?: string }
  | { state: 'unavailable'; reason: string }
  | { state: 'error'; message: string }

interface NativeCatalog {
  readonly models: readonly NativeModel[]
  readonly defaultModel?: string
}

interface NativeProvider {
  readonly id: string
  readonly route: string
  readonly displayName: string

  discover(signal?: AbortSignal): Promise<NativeProviderStatus>
  fetchCatalog(signal?: AbortSignal): Promise<NativeCatalog>
  create(input: NativeCreateRuntimeInput): Promise<NativeRuntime>
  resume(input: NativeResumeRuntimeInput): Promise<NativeRuntime>
}

interface NativeRuntime {
  readonly provider: string
  readonly nativeId: string | null

  setModel(model: string | undefined): Promise<void>
  runTurn(input: NativeTurnInput): AsyncIterable<NativeEvent>
  interrupt(): Promise<void>
  close(): Promise<void>
}
```

A provider module owns executable discovery, authentication-sensitive probing, native wire validation, model conversion, runtime creation, runtime resumption, and model switching. It must not import DSH Web or session presentation code.

Adding a provider consists of implementing `NativeProvider`, declaring its default enabled state and settings metadata, and adding it to the provider factory list. The host and Web page render provider records generically.

Provider ids and DSH routes are stable persistence identifiers. Display names and status text are presentation metadata. Duplicate ids or routes fail plugin loading.

## Built-in providers

### Codex

Codex resolves `codex` through the DSH subprocess capability. Catalog discovery starts a short-lived local `codex app-server`, performs `initialize`, sends `model/list`, reads configured defaults, converts model and reasoning metadata, and always closes the process.

A live session keeps one app-server process and one Codex thread. Creation uses `thread/start`; cold continuation uses `thread/resume`. Model changes follow the app-server semantics used by Paseo and apply to the next turn.

### Claude Code

Claude Code resolves `claude` through the DSH subprocess capability and reads its version. Claude Code exposes model selection but no supported model-list command. Its catalog therefore follows Paseo: a plugin-owned model manifest is filtered by the installed Claude Code version, then augmented with model ids declared by `~/.claude/settings.json` and its supported `ANTHROPIC_*_MODEL` environment entries.

A live session keeps one Claude SDK query. Creation starts a persisted query; cold continuation resumes its session id. Model changes call the live query's model setter and apply before the next prompt.

## Discovery and catalog

Discovery and enablement are separate facts:

- `discovered` means the executable is resolvable and its version probe succeeds.
- `enabled` is the persisted user choice controlling whether the DSH route is registered.
- `available` means the enabled provider is registered and its catalog can currently be read.
- A disabled provider remains visible in settings and may still be probed on explicit refresh.

Catalog reads use one provider-owned in-flight request and a bounded cache. Concurrent Web and session catalog requests share the same acquisition. Explicit refresh invalidates the cache. One provider's failure does not hide healthy providers.

The DSH model selector remains the model-selection transport. Enabled providers publish their models through `NativeLlmAdapter.listModels()`, producing separate `Codex (Local)` and `Claude Code (Local)` groups. The selected provider route and model flow through the existing `session.selectModel` API.

## Web settings

The package contributes a `Native Agents` section through the Web `settings.section` slot. The page is driven by generic provider view records and contains no Codex- or Claude-specific branches.

Each provider row shows:

- display name and provider icon;
- discovered, unavailable, disabled, loading, or error status;
- installed version when available;
- selectable model count or catalog failure;
- an enable switch;
- a disclosure with executable diagnostics and a catalog refresh command.

The prototype does not support custom executable paths. Providers resolve the current host `PATH`. Provider-specific environment and permission ceilings remain deployment configuration rather than browser-editable secrets.

Changing a switch writes the plugin's DSH settings namespace. The Host reconciles the provider before acknowledging the new effective state. The page disables the switch while reconciliation is pending and reports a failure without pretending the requested state became effective.

Disabling a provider with an active turn is rejected. Disabling an idle provider unregisters its LLM route, closes resident runtimes, removes it from the session model selector, and preserves durable bindings. Re-enabling allows those sessions to cold-resume.

## Turn projection

```ts
type NativeEvent =
  | { type: 'thread-started'; nativeId: string }
  | { type: 'text-delta'; text: string }
  | { type: 'reasoning-delta'; text: string }
  | { type: 'tool-start'; callId: string; name: string; input: JsonValue }
  | { type: 'tool-result'; callId: string; output?: JsonValue; error?: string }
  | { type: 'usage'; usage: NativeUsage }
  | { type: 'turn-completed'; nativeTurnId?: string }
  | { type: 'turn-failed'; failure: NativeFailure }
  | { type: 'turn-canceled'; reason: string }
```

Provider implementations validate native messages and emit this closed union. The adapter never reads Claude SDK messages or Codex JSON-RPC notifications directly.

| Native event | DSH stream output |
|---|---|
| `thread-started` | Mark the binding ready; emit no model-visible chunk |
| `text-delta` | Open or extend one DSH text block |
| `reasoning-delta` | Open or extend one DSH reasoning block |
| `tool-start` | Ignore for DSH projection; provider executes the tool |
| `tool-result` | Ignore for DSH projection; provider owns the result |
| `usage` | Emit available native token counts |
| `turn-completed` | Close blocks and emit a stop finish with replay metadata |
| `turn-failed` | Close blocks and emit a structured error finish |
| `turn-canceled` | Close blocks and emit an aborted finish |

Provider-native tools remain native. The adapter must not emit DSH executable tool-call chunks because that would execute the operation twice. Both providers normalize their protocol-specific tool notifications into the same `tool-start`/`tool-result` events for the internal provider protocol, then omit them from DSH projection. They do not join the model-visible surface, invoke a DSH executor, or alter native continuation. They are intentionally not persisted by this pure-plugin prototype because DSH does not expose safe registration for new session event types.

## Lifecycle

### First turn

1. The adapter resolves the selected provider, model, DSH session, and working directory.
2. The registry creates a `creating` binding atomically.
3. The provider creates a runtime without sending the prompt.
4. The runtime applies the selected model and runs the newly admitted message.
5. The first native identity marks the binding `ready` atomically.
6. Completion leaves the runtime resident for the next turn.

### Follow-up and model change

The registry returns the resident runtime. Before each turn, the adapter compares the DSH-selected model with the runtime's applied model. A difference must complete through `setModel()` before the prompt is sent. Failure stops the turn; the UI selection must never silently diverge from the native runtime.

Only the newly admitted DSH message is sent. Previous DSH messages are not replayed because the native provider already owns that context.

### Cold continuation

Without a resident runtime, the registry reads the ready binding, validates provider and working directory, calls `provider.resume()`, applies the current model, caches the runtime, and sends the new message.

A missing binding can create a provider conversation only for a session with no previous native response. A `creating` binding fails with `NATIVE_CREATION_INCOMPLETE`; the plugin never guesses whether native allocation succeeded.

### Interrupt and shutdown

DSH cancellation invokes `runtime.interrupt()`. Plugin disposal and provider disablement close all affected runtimes and owned process trees. Ready bindings remain available for later cold continuation.

## Persistence invariants

Binding files use exclusive creation and atomic replacement. DSH session ids are hashed before use as path components.

A ready binding has exactly one provider id, native id, and working directory. Provider or working-directory mismatches fail before a native turn. Bindings contain no prompts, assistant output, credentials, access tokens, or provider transcript contents.

The DSH session log owns the provider route and model actually consumed by each request. The binding store owns only native continuation identity. Neither source silently repairs the other.

## Policy and failure

Native execution enforces the intersection of DSH policy, the plugin deployment ceiling, and provider capability. Safe modes are defaults. Bypass modes require explicit deployment configuration and are never enabled from discovery or browser toggles.

The adapter performs no automatic LLM retry because a native turn may have changed files or external state before a failure is observed.

One DSH session permits one foreground native turn. Different sessions may run concurrently. Stable `NATIVE_*` errors cover discovery, catalog, protocol, process, identity, binding, model-switch, and lifecycle failures. Cleanup errors do not replace the original failure.

## Deferred capabilities

- Native tool-call projection into the DSH conversation. Provider tool execution remains provider-owned and is intentionally omitted from the DSH session log because the pure-plugin API does not expose safe registration for new session event types.
- Native subagent activity as structured DSH trajectory entries.
- Active-turn steering; new DSH input remains a queued follow-up turn.
- Native session import, fork, rewind, archive, and transcript browsing.
- Provider installation or marketplace workflows from the settings page.
- Cross-platform policy parity beyond macOS prototype behavior.

## Acceptance criteria

- The Web settings page lists Codex and Claude Code with discovery state, version, model count, refresh, and persisted enable switches.
- Disabling an idle provider removes its models and route without deleting bindings; re-enabling permits cold continuation.
- Codex models come from the local app-server `model/list`; Claude models follow the Paseo manifest, installed version, and local settings merge.
- A normal top-level DSH session can select either enabled native provider and run two turns in one native conversation.
- A new plugin process resumes that native conversation from the persisted binding.
- Same-provider model changes reach the native runtime before the next prompt; cross-provider changes on a bound session fail clearly.
- Text, reasoning, usage, completion, cancellation, and failures project into the DSH transcript without replaying native tools.
- Native tool starts and results remain normalized inside the provider protocol, but are not projected into or persisted in the DSH transcript.
- The bundle contains no subagent tool registration or coordinator-message presentation behavior.
- Focused tests, type checking, build, tarball installation, and a Web restart smoke test pass.
