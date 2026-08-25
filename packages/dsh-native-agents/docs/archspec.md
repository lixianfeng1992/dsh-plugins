# Native Agents Architecture Specification

Status: implementation target for the prototype.

## Scope

`dsh-native-agents` lets a continuable DSH child use the locally installed Claude Code or Codex runtime while DSH remains the owner of the child agent, turn lifecycle, durable transcript, and continuation address.

The plugin is a pure Cordis extension. It registers LLM adapters and uses public DSH services; it does not require changes to DeepSeek Harness.

The package also ships a Web client face. It preserves coordinator relay provenance in the session log while shadowing the generic context renderer so parent-to-child relay messages appear as labeled message bubbles. Other non-user context remains a disclosed context row.

## Authority and persistence

There is one logical agent session: the DSH session. The DSH session id is the public continuation id used by `send_message`, the Web application, and agent lifecycle APIs.

Claude Code and Codex keep provider-native conversation data in their own stores. The plugin does not copy or reinterpret those transcripts. It persists only the binding required to reopen the provider conversation:

```text
dshSessionId -> provider + nativeId + cwd
```

Bindings live under `<storageRoot>/bindings/`. The default storage root is `<dshHome>/native-agents/`.

## Components

```text
DSH continuable child
  -> DSH AgentLoop
  -> NativeLlmAdapter
  -> NativeRuntimeRegistry
  -> NativeProvider
  -> NativeRuntime
  -> Claude SDK Query | Codex app-server
```

`NativeLlmAdapter` is the DSH integration point. It converts the newest admitted DSH user or coordinator message into one native turn and projects normalized native events into `StreamChunk` values.

`NativeRuntimeRegistry` owns live runtime instances by DSH session id. It reuses a live runtime for follow-up turns and reconstructs a missing runtime from a ready binding after plugin or process restart.

`NativeProvider` owns provider-specific creation and resumption. `ClaudeProvider` and `CodexProvider` implement the same interface without inheritance.

`NativeRuntime` owns one live provider conversation and its process resources. Claude keeps one SDK `Query` alive across turns. Codex keeps one app-server process and one resumed thread alive across turns.

## Provider interfaces

```ts
interface NativeProvider {
  readonly id: NativeProviderId
  readonly displayName: string
  create(input: NativeCreateRuntimeInput): Promise<NativeRuntime>
  resume(input: NativeResumeRuntimeInput): Promise<NativeRuntime>
}

interface NativeRuntime {
  readonly provider: NativeProviderId
  readonly nativeId: string | null
  runTurn(input: NativeTurnInput): AsyncIterable<NativeEvent>
  interrupt(): Promise<void>
  close(): Promise<void>
}
```

`create()` allocates a new provider conversation. `resume()` opens the exact provider conversation named by the binding. Neither method sends the first prompt; every prompt enters through `runTurn()`.

`runTurn()` permits one active turn. Concurrent calls fail with `NATIVE_TURN_ACTIVE`. A runtime remains reusable after completion and becomes unusable after `close()`.

`interrupt()` requests cancellation of the active provider turn and waits for the provider request to be sent. `close()` is idempotent, interrupts active work, closes the protocol connection, and terminates the owned process tree.

## Native events

```ts
type NativeEvent =
  | { type: 'thread-started'; nativeId: string }
  | { type: 'text-delta'; text: string }
  | { type: 'reasoning-delta'; text: string }
  | { type: 'usage'; usage: NativeUsage }
  | { type: 'turn-completed'; nativeTurnId?: string }
  | { type: 'turn-failed'; failure: NativeFailure }
  | { type: 'turn-canceled'; reason: string }
```

Provider implementations validate their wire formats and emit this closed event union. The adapter never reads Claude SDK messages or Codex JSON-RPC notifications directly.

Provider-native tool calls remain native. The plugin must not emit DSH `tool-call` blocks for them because the DSH AgentLoop would execute the same operation again.

## DSH projection

| Native event | DSH stream output |
|---|---|
| `thread-started` | Mark the creating binding ready; no model-visible chunk |
| `text-delta` | Lazily open a text block and emit `text-delta` |
| `reasoning-delta` | Lazily open a reasoning block and emit `reasoning-delta` |
| `usage` | Emit `usage` using the available native token counts |
| `turn-completed` | Close open blocks and emit `finish` with stop reason and `replayState` |
| `turn-failed` | Close open blocks and emit `finish` with error reason |
| `turn-canceled` | Close open blocks and emit `finish` with aborted reason |

The adapter must emit every streamed text fragment exactly once. A provider may use its final result as a text fallback only when it emitted no text deltas for that turn.

`replayState.response` contains `provider`, `nativeId`, and an optional `nativeTurnId`. This is diagnostic replay metadata; the binding store remains authoritative for cold resumption.

## Lifecycle

### Create

1. The adapter validates an initial DSH request and resolves the child working directory.
2. The registry atomically creates a `creating` binding.
3. The provider creates a runtime without sending the prompt.
4. The registry caches the runtime and runs the prompt.
5. The first `thread-started` event atomically changes the binding to `ready`.
6. Completion leaves the runtime alive for the next DSH turn.

Codex normally knows its thread id during `create()`, so the registry may mark the binding ready before `runTurn()`. Claude normally reports its session id from the live query, so readiness occurs while consuming the first turn.

### Follow-up

The registry returns the existing runtime for the DSH session. The adapter sends only the latest admitted user or coordinator text to `runTurn()`. Earlier DSH messages are not replayed because the native runtime already owns that provider context.

### Cold resume

If no live runtime exists, the registry reads a ready binding, validates its provider and working directory, calls `provider.resume()`, and caches the reconstructed runtime before sending the new prompt.

A missing binding may create a provider conversation only for an initial DSH history. A `creating` binding fails with `NATIVE_CREATION_INCOMPLETE`; the plugin never guesses whether provider allocation succeeded.

### Interrupt and shutdown

An aborted DSH request invokes `runtime.interrupt()`. The provider terminal event closes the DSH stream as aborted; the runtime remains reusable when the provider confirms a usable conversation.

Plugin disposal calls `NativeRuntimeRegistry.closeAll()`. All cached runtimes close and all owned provider processes terminate. The durable bindings remain available for cold resume after restart.

## Binding invariants

Binding files use atomic exclusive creation and atomic replacement when becoming ready. A DSH session id is encoded before use as a file name and cannot escape the binding root.

A ready binding has exactly one provider, native id, and working directory. Provider or working-directory mismatches fail before a native turn starts. A provider may report one native id for a creating binding; a different or repeated id is corruption.

Bindings do not contain prompts, assistant output, provider credentials, or provider transcript contents.

## Policy

Native execution must enforce the intersection of DSH policy, the plugin deployment ceiling, and provider capability. Unattended delegated children never ask the user for approval: unsupported approval and elicitation requests are declined.

The prototype exposes explicit safe and bypass deployment modes for each provider. Bypass mode is an administrator choice and must not be selected implicitly.

## Failure and concurrency

The plugin performs no automatic LLM retry because a native turn can already have changed files or external state before a failure is observed.

One DSH session permits one foreground native turn. Different DSH sessions may run concurrently. Provider protocol errors, early process exit, missing identity, empty final output, and binding mismatches fail with stable `NATIVE_*` codes.

A runtime failure evicts that runtime from the registry. A later DSH turn may cold-resume only when its binding is ready. Cleanup errors do not replace the original turn failure.

## Deferred capabilities

- Native tool calls and subagent activity as structured live DSH timeline blocks.
- Active-turn steering; `send_message` remains a queued DSH follow-up turn.
- Native session import, rewind, fork, archive, and provider transcript browsing.
- Dynamic provider model and feature catalogs.
- Cross-platform policy parity beyond the provider and DSH capabilities available on the host.

## Acceptance criteria

- Two DSH turns reuse one live Claude `Query` or one live Codex app-server and thread.
- A new plugin instance resumes the native conversation from the persisted DSH binding.
- Text, reasoning, usage, finish status, and replay metadata survive DSH stream projection.
- Abort interrupts the active provider turn, and plugin disposal closes every cached runtime.
- Existing continuable-child creation and `send_message` address the DSH child session without exposing a second session id.
- Parent-to-child relay events remain `coordinator` sources and render as parent-agent message bubbles in the Web conversation.
- The package passes focused tests, TypeScript checking, build, and tarball creation.

## Implementation baseline

The plugin uses provider and runtime interfaces, a live runtime registry, resident Claude and Codex processes, and normalized streaming events before DSH projection.

Structured native tool activity, active-turn steering, session management commands, and complete policy derivation remain outside this increment.
