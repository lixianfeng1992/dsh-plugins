# dsh-native-agents TSD

Status: proposed for review

## 1. Decision

Build one external DSH plugin package, `dsh-native-agents`. It registers two LLM adapter routes, `native-codex` and `native-claude-code`, and installs two preconfigured continuable delegation tools over DSH's existing `spawn` subagent provider.

The plugin does not add a new subagent runtime and does not convert provider transcripts into DSH session events. DSH continues to own child identity, parent authorization, FIFO delivery, `send_message`, interruption, transcript projection, and cold activation. Codex and Claude Code continue to own their native conversation history and tool execution. Only conversations created and bound by this plugin are continuable; arbitrary existing CLI conversations are not imported or guessed.

```text
parent Agent
  -> codex_agent / claude_code_agent
  -> DSH continuable spawn child
  -> native-codex / native-claude-code LLM adapter
  -> persistent Codex thread / Claude Code session
```

This is a pure plugin design. It requires no change in `deepseek-harness`.

## 2. Why this design

DSH's existing continuation manager only continues DSH `Agent` instances. A normal Codex or Claude Code `SubagentProvider` cannot participate after `prepareContinuable()`, so extending the existing one-shot providers in a plugin cannot implement `send_message` or cold resume.

An LLM adapter is already inside the continued DSH Agent's turn. `GenerateOptions.sessionId` provides the durable DSH child id needed to select one native conversation. With all DSH tools removed, one admitted DSH message produces exactly one adapter call and one native turn. The adapter returns the native final answer as the DSH assistant response.

This preserves the existing DSH continuation lifecycle instead of duplicating its identity, queue, authorization, and restart logic. It also avoids a community-style relay Agent and the extra DeepSeek model turn that relay requires.

## 3. Scope

### In scope

- Create continuable Codex and Claude Code children through dedicated DSH tools.
- Continue the same native conversation through the existing `send_message` tool.
- Resume after DSH process restart.
- Store native transcripts unchanged below a configured plugin root.
- Preserve final user and assistant messages in the DSH child transcript.
- Cancel the active native turn and await process termination.
- Fail explicitly when binding or native state is missing, corrupt, ambiguous, or incompatible.

### Out of scope

- Changes to DeepSeek Harness packages, session formats, or generated event types.
- Mapping native reasoning, tool activity, usage, or intermediate events into DSH.
- DSH tool execution inside the native child.
- DSH approval and interaction UI bridging.
- Images, structured output, fork seeding, Team mailbox integration, or cross-host resume.
- Automatic repair of a crash during first-conversation creation.

## 4. Package layout

```text
packages/dsh-native-agents/
  package.json
  cordis.patch.yml
  README.md
  src/
    index.ts
    plugin.ts
    config.ts
    binding-store.ts
    prompt.ts
    process-lifecycle.ts
    codex-adapter.ts
    codex-wire.ts
    claude-code-adapter.ts
  tests/
    binding-store.spec.ts
    prompt.spec.ts
    codex-adapter.spec.ts
    claude-code-adapter.spec.ts
    continuation.e2e.spec.ts
```

`codex-wire.ts` owns only the app-server JSON-RPC needed for initialize, thread creation or resume, turn start, final answer selection, interruption, and shutdown. The Claude adapter uses the official Claude Agent SDK. `process-lifecycle.ts` is a thin provider-neutral wrapper over DSH's subprocess capability; the plugin does not implement process-tree discovery or termination itself.

The package declares DSH LLM, subprocess, home-path, and Cordis packages as peers. `@deepseek-ai/dsh-tool-subagent` is a direct dependency because the bundle patch inserts it by package name. Both native executables are resolved from `PATH` through DSH's subprocess service. The Claude Agent SDK is a direct dependency only for its stream protocol and is forced to launch the resolved local `claude` executable.

## 5. Public configuration

```ts
interface Config {
  dshHome?: string
  storageRoot?: string
  codex?: {
    enabled?: boolean
    approvalPolicy?: 'never' | 'dangerously-bypass-approvals-and-sandbox'
  }
  claudeCode?: {
    enabled?: boolean
    permissionMode?: 'dontAsk' | 'bypassPermissions'
  }
}
```

`storageRoot` defaults to `<resolved DSH_HOME>/native-agents`. Resolution follows explicit `dshHome`, then `DSH_HOME`, then `~/.dsh`. The prototype exposes only unattended permission modes because there is no DSH interaction bridge.

The fixed adapter routes are `native-codex` and `native-claude-code`. Model id `default` means that the adapter does not override the native product's configured model. Other model ids are forwarded as provider-native model names.

The bundle patch inserts the plugin and two instances of `@deepseek-ai/dsh-tool-subagent`:

```yaml
- id: native-agents
  name: dsh-native-agents

- id: tool-native-codex
  name: '@deepseek-ai/dsh-tool-subagent'
  config:
    provider: spawn
    toolName: codex_agent
    backgroundMode: continuable
    maxDepth: 1
    agentOptions:
      provider: native-codex
      model: default
    toolFilter:
      allow: []

- id: tool-native-claude-code
  name: '@deepseek-ai/dsh-tool-subagent'
  config:
    provider: spawn
    toolName: claude_code_agent
    backgroundMode: continuable
    maxDepth: 1
    agentOptions:
      provider: native-claude-code
      model: default
    toolFilter:
      allow: []
```

The base DSH profile must already provide `ctx.llm`, `ctx.subprocess`, persistent sessions, `spawn`, and the subagent control tools. Plugin load fails with a named missing dependency when any required service is absent.

## 6. Storage

```text
<storageRoot>/
  bindings/
    <dsh-child-session-id>/
      binding.json
```

Codex and Claude Code keep authentication, settings, and native transcripts in their standard `~/.codex` and `~/.claude` homes, matching direct CLI use and Paseo. The plugin does not copy credentials or override `CODEX_HOME` or `CLAUDE_CONFIG_DIR`.

`binding.json` uses mode `0600` and contains no credential, prompt, or response text:

```ts
type Binding = {
  version: 1
  dshSessionId: string
  provider: 'codex' | 'claude-code'
  state: 'creating' | 'ready'
  nativeId?: string
  cwd: string
  createdAt: string
}
```

Writes use a same-directory temporary file, file sync, atomic rename, and directory sync. Before native creation, the adapter atomically writes `state: creating`. After the provider returns its native id, it atomically replaces that record with `state: ready`.

A surviving `creating` record is deliberately not resumed or overwritten in the prototype. The first turn may already have caused file or network side effects, so automatic reconstruction or replay is unsafe. The adapter returns `NATIVE_CREATION_INCOMPLETE` and leaves both stores available for inspection.

## 7. Authority rules

Three stores have separate authority:

| Store | Authoritative for |
|---|---|
| DSH session | child identity, parent relationship, admitted messages, turn outcome, final visible transcript |
| `binding.json` | the one-to-one DSH child to native conversation association and original cwd |
| Native provider home | Codex or Claude Code context, native tool history, and provider-specific metadata |

No store silently reconstructs or overwrites another. A ready binding with no matching native conversation is an error. Native conversations without a ready binding are orphans and are never attached by guessing. A request whose current DSH cwd differs from the binding cwd fails; resuming the same native conversation in another workspace is not part of the prototype.

Custom DSH session events are not used. An external plugin cannot safely persist a new required event type because known event types are generated by the main project, while public `Session.append()` cannot mark an unknown event `ignorable`.

## 8. Request projection

The native adapter does not resend DSH history. The native transcript already owns prior context, so the adapter extracts only the newest admitted user message from `GenerateOptions.messages`.

Before starting a native turn, it requires all of the following:

1. `sessionId` is present and matches the binding path.
2. `purpose` is absent; compaction and title requests are rejected.
3. The request contains a newest message whose source is the human user and whose content has non-empty text blocks only.
4. No native turn for that DSH child is currently active in this process.

Text blocks are joined with newlines. System prompt, older messages, injected context, DSH tools, DSH persona, reasoning settings, and stop sequences are not forwarded. Continuable children always receive DSH's child-scoped `report` tool even when their requested tool allow-list is empty, so the adapter ignores the DSH tool list instead of requiring it to be empty. The model id is forwarded unless it is `default`.

Each adapter advertises a retry policy with `mode: normal` and `maxRetries: 0`. A native request may have been accepted before a transport failure becomes visible, so automatic LLM retry could duplicate external side effects. A failed DSH turn can only be retried through a new explicit user message.

## 9. Lifecycle

### Create

1. `codex_agent` or `claude_code_agent` asks the existing `spawn` provider for a continuable child with the native adapter route and no DSH tools.
2. DSH reserves the child session, writes its normal subagent descriptor, and admits the initial user message.
3. The DSH child loop calls the selected native adapter with its durable `sessionId`.
4. The adapter creates the binding directory and atomically writes `state: creating` before contacting the provider.
5. Codex starts a non-ephemeral thread; Claude starts a persistent SDK session. The adapter records the returned native id as `state: ready`.
6. The adapter submits the extracted prompt, streams text chunks, emits one completed finish, and settles the provider process.
7. DSH logs the assistant message and turn end, then reports normal continuable-child settlement to the parent.

### Follow-up

1. Existing `send_message` authorizes the parent and appends the next message to the DSH child's FIFO.
2. DSH wakes or materializes the child and invokes the same adapter route.
3. The adapter reads and validates the ready binding, starts the local provider against its standard home, and resumes the exact native id.
4. It submits only the newest DSH user text and returns the new final answer.

### DSH restart

1. DSH session persistence discovers the cold continuable child from its ordinary descriptor.
2. A later `send_message` makes the existing continuation manager recreate the DSH Agent with the snapshotted native adapter route.
3. The adapter resolves the binding from the child `sessionId` and resumes the native conversation.
4. Missing plugin route, missing binding, non-ready binding, cwd mismatch, or missing native state fails the new DSH turn without creating another conversation.

### Interrupt

1. Existing `interrupt_agent` cancels the DSH child turn, aborting `GenerateOptions.signal`.
2. Codex sends `turn/interrupt`; Claude aborts the active SDK query.
3. The adapter closes protocol input, terminates the complete provider process tree when necessary, and awaits process exit.
4. Only after settlement does it emit an aborted finish. It retains the ready binding and native transcript for a later explicit follow-up.

The adapter never automatically replays the interrupted prompt.

## 10. Provider details

### Codex

- Resolve `codex` from `PATH` and launch `codex app-server` against its standard home.
- Initialize once per DSH adapter call.
- Use a persistent `thread/start` for creation and `thread/resume` for later calls.
- Submit one `turn/start` and select the last final-answer agent message.
- On cancellation, request `turn/interrupt`, close the wire, then terminate and await the process tree.

### Claude Code

- Resolve `claude` from `PATH` and pass that executable to the official Claude Agent SDK with `persistSession: true`.
- Let Claude Code allocate the initial session id, capture it from the SDK stream, and persist it in the binding.
- Start each later SDK query with `resume: nativeId`; no resident CLI process is required between turns.
- Use SDK abort followed by process settlement on cancellation.
- Do not use the alpha custom `sessionStore` in the prototype; the local CLI preserves its native JSONL in the standard home.

## 11. Failure semantics

| Condition | Result |
|---|---|
| Binding missing after the DSH child already has a completed or failed turn | `NATIVE_BINDING_MISSING`; never create |
| Binding is malformed, wrong version, wrong provider, or wrong child id | `NATIVE_BINDING_CORRUPT` |
| Binding remains `creating` | `NATIVE_CREATION_INCOMPLETE` |
| Native conversation cannot be resumed | `NATIVE_SESSION_UNAVAILABLE` |
| Provider exits after prompt admission | DSH turn ends `error`; no replay and binding remains |
| Interrupt wins | DSH turn ends `aborted`; binding remains |

The only case allowed to create a native conversation is a child with no binding whose supplied DSH message history contains exactly one user message and no assistant message. A later follow-up after a failed or lost first attempt produces more than one user message and therefore cannot create a replacement conversation. The adapter checks this before writing `creating`.

Diagnostics name the provider, DSH child id, lifecycle stage, and repair location. They do not include prompts, tool inputs, environment values, credentials, raw protocol frames, or native transcript content.

## 12. Verification matrix

| Case | Evidence |
|---|---|
| Codex create then follow-up | Same thread id; second answer depends on first turn |
| Claude create then follow-up | Same session id; second answer depends on first turn |
| DSH restart then follow-up | New plugin process resumes the same native ids |
| Two children in parallel | Different bindings and native ids; no cross-talk |
| Interrupt active turn | Provider process exits; no duplicate turn; later follow-up resumes |
| Crash after `creating` | Restart fails with `NATIVE_CREATION_INCOMPLETE` |
| Delete or corrupt native state | Explicit unavailable/corrupt failure; no replacement conversation |
| Adapter receives compaction, tools, images, or no session id | Rejected before provider launch |
| LLM retry plugin is loaded | Native route reports `maxRetries: 0`; one submission only |
| Transcript inspection | DSH has user/final answer; provider home retains native format |

Unit tests use fake Codex app-server and fake Claude SDK streams. One keyless assembled DSH test covers create, `send_message`, cold materialization, and interrupt with fake providers. Optional real-provider tests self-skip unless their CLI authentication is available.

## 13. Acceptance criteria

1. Both dedicated tools return a normal DSH continuable child id.
2. `send_message` continues the exact native conversation before and after DSH restart.
3. Native provider files remain unchanged in format in each CLI's standard home.
4. DSH records admitted user messages, final answers, and turn outcomes.
5. Missing, corrupt, incomplete, or incompatible state never creates a replacement conversation.
6. Cancellation terminates and awaits the active provider process and never replays a prompt.
7. No tracked DeepSeek Harness source or configuration file changes.

## 14. Review questions

The prototype intentionally reuses the local CLIs' standard homes and existing authentication. `storageRoot` owns only the binding from a DSH child id to the provider-native conversation id.
