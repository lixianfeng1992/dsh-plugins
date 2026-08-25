import {
  query as officialQuery,
  type Options,
  type Query,
  type SDKMessage,
  type SDKResultMessage,
  type SDKUserMessage,
  type SpawnOptions,
} from '@anthropic-ai/claude-agent-sdk'
import { scrubbedParentEnv, type SubprocessHandle, type SubprocessSpawnSpec } from '@deepseek-ai/dsh-subprocess'
import { ManagedClaudeProcess, claudeSpawnSpec } from './claude-process.js'
import { claudeCatalog } from './claude-models.js'
import { NativeAgentError } from './error.js'
import {
  AsyncEventQueue,
  NATIVE_TOOL_NAMES,
  type NativeCreateRuntimeInput,
  type NativeCatalog,
  type NativeEvent,
  type NativeProvider,
  type NativeResumeRuntimeInput,
  type NativeRuntime,
  type NativeTurnInput,
  type NativeProviderStatus,
} from './native.js'

export type ClaudePermissionMode = 'dontAsk' | 'bypassPermissions'

export interface ClaudeProviderOptions {
  readonly permissionMode: ClaudePermissionMode
  readonly env: Record<string, string>
  readonly graceMs: number
  readonly resolveExecutable: (command: string, env: Readonly<Record<string, string>>, signal: AbortSignal) => Promise<string>
  readonly spawn: (spec: SubprocessSpawnSpec) => SubprocessHandle
  readonly query?: typeof officialQuery
}

interface ChildHolder {
  child?: SubprocessHandle
}

interface ActiveTurn {
  readonly events: AsyncEventQueue<NativeEvent>
  readonly signal: AbortSignal
  streamedText: boolean
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function finite(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined
}

function jsonValue(value: unknown): import('@deepseek-ai/dsh-session').JsonValue {
  try {
    const copy = JSON.parse(JSON.stringify(value))
    return copy === undefined ? null : copy
  } catch {
    return String(value)
  }
}

function usage(message: SDKResultMessage): Extract<NativeEvent, { type: 'usage' }> | undefined {
  const source = record(message.usage)
  if (source === undefined) return undefined
  const inputTokens = finite(source.input_tokens)
  const outputTokens = finite(source.output_tokens)
  if (inputTokens === undefined || outputTokens === undefined) return undefined
  const cacheReadTokens = finite(source.cache_read_input_tokens)
  const cacheWriteTokens = finite(source.cache_creation_input_tokens)
  return {
    type: 'usage',
    usage: {
      inputTokens,
      outputTokens,
      ...cacheReadTokens === undefined ? {} : { cacheReadTokens },
      ...cacheWriteTokens === undefined ? {} : { cacheWriteTokens },
    },
  }
}

function userMessage(prompt: string): SDKUserMessage {
  return {
    type: 'user',
    message: {
      role: 'user',
      content: [{ type: 'text', text: prompt }],
    },
    parent_tool_use_id: null,
  }
}

function isDshNativeTool(toolName: string): boolean {
  return NATIVE_TOOL_NAMES.some(name => toolName === `mcp__dsh__${name}`)
}

/** Resident Claude SDK query that accepts multiple DSH turns. */
export class ClaudeRuntime implements NativeRuntime {
  readonly provider = 'claude-code' as const
  private active: ActiveTurn | undefined
  private sessionId: string | null
  private identityPending = false
  private closed = false
  private readonly pump: Promise<void>

  constructor(
    private readonly operation: Query,
    private readonly child: ChildHolder,
    resumeId: string | undefined,
    private readonly prompts: AsyncEventQueue<SDKUserMessage>,
  ) {
    this.sessionId = resumeId ?? null
    this.pump = this.runPump()
  }

  get nativeId(): string | null {
    return this.sessionId
  }

  async setModel(model: string | undefined): Promise<void> {
    if (this.closed) throw new NativeAgentError('NATIVE_RUNTIME_CLOSED', 'native-agents: Claude runtime is closed')
    await this.operation.setModel(model)
  }

  async * runTurn(input: NativeTurnInput): AsyncIterable<NativeEvent> {
    input.signal.throwIfAborted()
    if (this.closed) throw new NativeAgentError('NATIVE_RUNTIME_CLOSED', 'native-agents: Claude runtime is closed')
    if (this.active !== undefined) {
      throw new NativeAgentError('NATIVE_TURN_ACTIVE', 'native-agents: Claude runtime already has an active turn')
    }
    const events = new AsyncEventQueue<NativeEvent>()
    this.active = { events, signal: input.signal, streamedText: false }
    if (this.identityPending && this.sessionId !== null) {
      events.push({ type: 'thread-started', nativeId: this.sessionId })
      this.identityPending = false
    }
    const onAbort = (): void => { void this.interrupt().catch(() => {}) }
    input.signal.addEventListener('abort', onAbort, { once: true })
    this.prompts.push(userMessage(input.prompt))
    try {
      yield* events
    } finally {
      input.signal.removeEventListener('abort', onAbort)
      if (this.active?.events === events) this.active = undefined
    }
  }

  async interrupt(): Promise<void> {
    if (this.closed || this.active === undefined) return
    await this.operation.interrupt()
  }

  async close(): Promise<void> {
    if (this.closed) return
    this.closed = true
    this.prompts.end()
    this.operation.close()
    this.active?.events.end()
    this.active = undefined
    const child = this.child.child
    if (child !== undefined) {
      child.terminate()
      await child.waitForExit()
      await child.done.catch(() => {})
    }
    await this.pump.catch(() => {})
  }

  private async runPump(): Promise<void> {
    try {
      for await (const message of this.operation) this.consume(message)
      if (!this.closed) {
        this.closed = true
        this.active?.events.fail(new NativeAgentError(
          'NATIVE_PROCESS_FAILURE',
          'native-agents: Claude Code exited before the runtime was closed',
        ))
      }
    } catch (error: unknown) {
      if (!this.closed) {
        this.closed = true
        this.active?.events.fail(error)
      }
    }
  }

  private consume(message: SDKMessage): void {
    this.captureIdentity(message)
    const active = this.active
    if (active === undefined) return
    const body = record((message as { message?: unknown }).message)
    const content = body?.content
    if (Array.isArray(content)) {
      for (const block of content) {
        const item = record(block)
        if (item?.type === 'tool_use' && typeof item.id === 'string' && typeof item.name === 'string') {
          active.events.push({
            type: 'tool-start',
            callId: item.id,
            name: item.name,
            input: jsonValue(item.input),
          })
        } else if (item?.type === 'tool_result' && typeof item.tool_use_id === 'string') {
          active.events.push({
            type: 'tool-result',
            callId: item.tool_use_id,
            ...'content' in item ? { output: jsonValue(item.content) } : {},
            ...item.is_error === true ? { error: 'Claude Code tool returned an error' } : {},
          })
        }
      }
    }
    if (message.type === 'stream_event') {
      const event = record(message.event)
      const delta = record(event?.delta)
      if (event?.type !== 'content_block_delta' || delta === undefined) return
      if (delta.type === 'text_delta' && typeof delta.text === 'string' && delta.text.length > 0) {
        active.streamedText = true
        active.events.push({ type: 'text-delta', text: delta.text })
      } else if (delta.type === 'thinking_delta' && typeof delta.thinking === 'string' && delta.thinking.length > 0) {
        active.events.push({ type: 'reasoning-delta', text: delta.thinking })
      }
      return
    }
    if (message.type !== 'result') return
    const measured = usage(message)
    if (measured !== undefined) active.events.push(measured)
    if (active.signal.aborted) {
      active.events.push({ type: 'turn-canceled', reason: 'Claude Code turn was interrupted' })
    } else if (message.subtype === 'success' && !message.is_error) {
      if (!active.streamedText && message.result.trim().length > 0) {
        active.events.push({ type: 'text-delta', text: message.result })
      }
      if (!active.streamedText && message.result.trim().length === 0) {
        active.events.push({
          type: 'turn-failed',
          failure: { code: 'NATIVE_EMPTY_RESPONSE', message: 'Claude Code returned no final answer' },
        })
      } else {
        active.events.push({ type: 'turn-completed', nativeTurnId: message.uuid })
      }
    } else {
      const detail = 'errors' in message && message.errors.length > 0
        ? message.errors.join('\n')
        : 'Claude Code turn failed'
      active.events.push({
        type: 'turn-failed',
        failure: { code: 'NATIVE_PROVIDER_FAILURE', message: detail },
      })
    }
    active.events.end()
    this.active = undefined
  }

  private captureIdentity(message: SDKMessage): void {
    if (typeof message.session_id !== 'string' || message.session_id.length === 0) return
    if (this.sessionId !== null && this.sessionId !== message.session_id) {
      throw new NativeAgentError(
        'NATIVE_BINDING_CORRUPT',
        'native-agents: Claude Code returned an unexpected session id',
      )
    }
    if (this.sessionId !== null) return
    this.sessionId = message.session_id
    if (this.active === undefined) this.identityPending = true
    else this.active.events.push({ type: 'thread-started', nativeId: message.session_id })
  }
}

/** Creates resident Claude Code runtimes through the official Agent SDK. */
export class ClaudeProvider implements NativeProvider {
  readonly id = 'claude-code' as const
  readonly route = 'native-claude-code'
  readonly displayName = 'Claude Code (Local)'

  constructor(private readonly options: ClaudeProviderOptions) {}

  async discover(signal = new AbortController().signal): Promise<NativeProviderStatus> {
    try {
      const version = await this.resolveVersion(signal)
      return { state: 'available', version }
    } catch (error: unknown) {
      return { state: 'unavailable', reason: error instanceof Error ? error.message : String(error) }
    }
  }

  async fetchCatalog(signal = new AbortController().signal): Promise<NativeCatalog> {
    const version = await this.resolveVersion(signal)
    return await claudeCatalog(version, this.options.env.CLAUDE_CONFIG_DIR)
  }

  create(input: NativeCreateRuntimeInput): Promise<NativeRuntime> {
    return this.open(input)
  }

  resume(input: NativeResumeRuntimeInput): Promise<NativeRuntime> {
    return this.open(input, input.nativeId)
  }

  private async resolveVersion(signal: AbortSignal): Promise<string> {
    const executable = await this.options.resolveExecutable('claude', this.options.env, signal)
    const child = this.options.spawn({
      argv: [executable, '--version'],
      cwd: process.cwd(),
      stdio: {
        stdin: 'ignore',
        stdout: { maxBytes: 8_192 },
        stderr: { maxBytes: 8_192 },
      },
      graceMs: this.options.graceMs,
      signal,
      env: this.options.env,
    })
    const outcome = await child.done
    if (outcome.exitCode !== 0) {
      const detail = child.collected.stderr?.readFrom(0).text.trim()
      throw new NativeAgentError('NATIVE_DISCOVERY_FAILED', detail || 'Claude Code version probe failed')
    }
    const output = child.collected.stdout?.readFrom(0).text.trim() ?? ''
    const match = /\d+\.\d+\.\d+/.exec(output)
    if (match === null) throw new NativeAgentError('NATIVE_DISCOVERY_FAILED', 'Claude Code returned no version')
    return match[0]
  }

  private async open(
    input: NativeCreateRuntimeInput | NativeResumeRuntimeInput,
    resume?: string,
  ): Promise<NativeRuntime> {
    input.signal.throwIfAborted()
    const executable = await this.options.resolveExecutable('claude', this.options.env, input.signal)
    const controller = new AbortController()
    const holder: ChildHolder = {}
    const sdkOptions: Options = {
      abortController: controller,
      cwd: input.cwd,
      env: { ...scrubbedParentEnv(), ...this.options.env },
      pathToClaudeCodeExecutable: executable,
      persistSession: true,
      includePartialMessages: true,
      permissionMode: this.options.permissionMode,
      disallowedTools: ['AskUserQuestion'],
      ...input.tools === undefined ? {} : {
        mcpServers: {
          dsh: {
            type: 'http' as const,
            url: input.tools.url,
            headers: { Authorization: input.tools.authorization },
            alwaysLoad: true,
          },
        },
      },
      ...input.model === undefined ? {} : { model: input.model },
      ...resume === undefined ? {} : { resume },
      ...this.options.permissionMode === 'bypassPermissions'
        ? { allowDangerouslySkipPermissions: true }
        : {
          canUseTool: (toolName, input) => Promise.resolve(isDshNativeTool(toolName)
            ? { behavior: 'allow' as const, updatedInput: input }
            : {
                behavior: 'deny' as const,
                message: 'This unattended native agent cannot request human approval.',
              }),
        },
      onElicitation: () => Promise.resolve({ action: 'decline' as const }),
      spawnClaudeCodeProcess: (spawnOptions: SpawnOptions) => {
        holder.child = this.options.spawn(claudeSpawnSpec(spawnOptions, this.options.graceMs))
        return new ManagedClaudeProcess(holder.child)
      },
    }
    const prompt = new AsyncEventQueue<SDKUserMessage>()
    const operation = (this.options.query ?? officialQuery)({ prompt, options: sdkOptions })
    return new ClaudeRuntime(operation, holder, resume, prompt)
  }
}
