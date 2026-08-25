import type { Readable, Writable } from 'node:stream'
import { JsonRpcLineTransport } from '@deepseek-ai/dsh-sdk-protocol'
import { NativeAgentError } from './error.js'
import { AsyncEventQueue, type NativeEvent } from './native.js'

type JsonObject = Record<string, unknown>

function object(value: unknown, label: string): JsonObject {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new NativeAgentError('NATIVE_PROTOCOL_ERROR', `native-agents: Codex returned invalid ${label}`)
  }
  return value as JsonObject
}

function text(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new NativeAgentError('NATIVE_PROTOCOL_ERROR', `native-agents: Codex returned invalid ${label}`)
  }
  return value
}

function finite(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined
}

interface ActiveTurn {
  readonly events: AsyncEventQueue<NativeEvent>
  readonly signal: AbortSignal
  turnId?: string
  answer?: string
  streamedText: boolean
  usage?: Extract<NativeEvent, { type: 'usage' }>
  readonly early: Array<{ method: string; params: JsonObject }>
}

/** Resident Codex app-server connection for one persistent thread. */
export class CodexWire {
  private readonly transport: JsonRpcLineTransport
  private threadId: string | undefined
  private active: ActiveTurn | undefined

  constructor(input: Readable, output: Writable) {
    this.transport = new JsonRpcLineTransport(input, output)
    this.transport.onRequest((method, params) => this.handleRequest(method, params))
    this.transport.onNotification((method, params) => this.handleNotification(method, params))
  }

  get nativeId(): string | null {
    return this.threadId ?? null
  }

  start(): void {
    this.transport.start()
  }

  async initialize(signal: AbortSignal): Promise<void> {
    await this.transport.request('initialize', {
      clientInfo: {
        name: 'dsh-native-agents',
        title: 'DSH Native Agents',
        version: '0.1.0',
      },
      capabilities: { experimentalApi: true, mcpServerOpenaiFormElicitation: true },
    }, signal)
    this.transport.notify('initialized', {})
    await this.transport.flush()
  }

  async createThread(
    cwd: string,
    permission: JsonObject,
    model: string | undefined,
    signal: AbortSignal,
  ): Promise<string> {
    const response = object(await this.transport.request('thread/start', {
      cwd,
      ephemeral: false,
      ...permission,
      ...model === undefined ? {} : { model },
    }, signal), 'thread/start response')
    const id = text(object(response.thread, 'thread').id, 'thread id')
    this.threadId = id
    return id
  }

  async resumeThread(threadId: string, signal: AbortSignal): Promise<void> {
    const response = object(await this.transport.request('thread/resume', { threadId }, signal), 'thread/resume response')
    const resumed = object(response.thread, 'thread')
    const returnedId = text(resumed.id, 'thread id')
    if (returnedId !== threadId) {
      throw new NativeAgentError('NATIVE_BINDING_CORRUPT', 'native-agents: Codex resumed an unexpected thread')
    }
    this.threadId = threadId
  }

  async * runTurn(prompt: string, signal: AbortSignal): AsyncIterable<NativeEvent> {
    signal.throwIfAborted()
    if (this.threadId === undefined) {
      throw new NativeAgentError('NATIVE_PROTOCOL_ERROR', 'native-agents: Codex thread is not initialized')
    }
    if (this.active !== undefined) {
      throw new NativeAgentError('NATIVE_TURN_ACTIVE', 'native-agents: Codex runtime already has an active turn')
    }
    const events = new AsyncEventQueue<NativeEvent>()
    const active: ActiveTurn = { events, signal, streamedText: false, early: [] }
    this.active = active
    const onAbort = (): void => { void this.interrupt().catch(() => {}) }
    signal.addEventListener('abort', onAbort, { once: true })
    try {
      const response = object(await this.transport.request('turn/start', {
        threadId: this.threadId,
        input: [{ type: 'text', text: prompt, text_elements: [] }],
      }, signal), 'turn/start response')
      active.turnId = text(object(response.turn, 'turn').id, 'turn id')
      for (const notification of active.early.splice(0)) {
        this.consumeNotification(active, notification.method, notification.params)
      }
      yield* events
    } catch (error: unknown) {
      events.fail(error)
      throw error
    } finally {
      signal.removeEventListener('abort', onAbort)
      if (this.active === active) this.active = undefined
    }
  }

  async interrupt(): Promise<void> {
    const active = this.active
    if (this.threadId === undefined || active?.turnId === undefined) return
    await this.transport.request('turn/interrupt', {
      threadId: this.threadId,
      turnId: active.turnId,
    })
  }

  fail(error: unknown): void {
    this.active?.events.fail(error)
  }

  close(): void {
    this.active?.events.end()
    this.active = undefined
    this.transport.close()
  }

  private handleRequest(method: string, params: JsonObject): Promise<unknown> {
    switch (method) {
      case 'item/commandExecution/requestApproval':
      case 'item/fileChange/requestApproval': {
        const decisions = Array.isArray(params.availableDecisions) ? params.availableDecisions : []
        return Promise.resolve({ decision: decisions.includes('cancel') ? 'cancel' : 'decline' })
      }
      case 'item/permissions/requestApproval':
        return Promise.resolve({ permissions: {}, scope: 'turn' })
      case 'item/tool/requestUserInput':
        return Promise.resolve({ answers: {} })
      case 'mcpServer/elicitation/request':
        return Promise.resolve({ action: 'decline', content: null, _meta: null })
      default:
        return Promise.reject(new Error(`native-agents: unsupported Codex request ${JSON.stringify(method)}`))
    }
  }

  private handleNotification(method: string, params: JsonObject): void {
    if (params.threadId !== this.threadId) return
    const active = this.active
    if (active === undefined) return
    if (active.turnId === undefined) {
      active.early.push({ method, params })
      return
    }
    this.consumeNotification(active, method, params)
  }

  private consumeNotification(active: ActiveTurn, method: string, params: JsonObject): void {
    if (method === 'item/agentMessage/delta') {
      if (typeof params.delta === 'string' && params.delta.length > 0) {
        active.streamedText = true
        active.events.push({ type: 'text-delta', text: params.delta })
      }
      return
    }
    if (method === 'item/reasoning/summaryTextDelta') {
      if (typeof params.delta === 'string' && params.delta.length > 0) {
        active.events.push({ type: 'reasoning-delta', text: params.delta })
      }
      return
    }
    if (method === 'thread/tokenUsage/updated') {
      const usage = params.tokenUsage === null || typeof params.tokenUsage !== 'object'
        ? undefined
        : params.tokenUsage as JsonObject
      const last = usage?.last === null || typeof usage?.last !== 'object'
        ? undefined
        : usage.last as JsonObject
      if (last === undefined) return
      const inputTokens = finite(last.inputTokens)
      const outputTokens = finite(last.outputTokens)
      if (inputTokens !== undefined && outputTokens !== undefined) {
        const cacheReadTokens = finite(last.cachedInputTokens)
        active.usage = {
          type: 'usage',
          usage: {
            inputTokens,
            outputTokens,
            ...cacheReadTokens === undefined ? {} : { cacheReadTokens },
          },
        }
      }
      return
    }
    if (method === 'item/completed' && params.turnId === active.turnId) {
      const item = object(params.item, 'completed item')
      if (item.type === 'agentMessage' && typeof item.text === 'string' && item.text.length > 0) {
        if (item.phase === 'final_answer' || (item.phase === null && active.answer === undefined)) {
          active.answer = item.text
        }
      }
      return
    }
    if (method !== 'turn/completed') return
    const turn = object(params.turn, 'completed turn')
    if (turn.id !== active.turnId) return
    if (!active.streamedText && active.answer !== undefined) {
      active.events.push({ type: 'text-delta', text: active.answer })
    }
    if (active.usage !== undefined) active.events.push(active.usage)
    if (turn.status === 'completed' && (active.streamedText || active.answer !== undefined)) {
      active.events.push({ type: 'turn-completed', nativeTurnId: active.turnId })
    } else if (turn.status === 'completed') {
      active.events.push({
        type: 'turn-failed',
        failure: { code: 'NATIVE_EMPTY_RESPONSE', message: 'Codex returned no final answer' },
      })
    } else if (turn.status === 'interrupted' || active.signal.aborted) {
      active.events.push({ type: 'turn-canceled', reason: 'Codex turn was interrupted' })
    } else {
      active.events.push({
        type: 'turn-failed',
        failure: {
          code: 'NATIVE_PROVIDER_FAILURE',
          message: typeof turn.error === 'string' ? turn.error : `Codex turn ended with status ${String(turn.status)}`,
        },
      })
    }
    active.events.end()
    this.active = undefined
  }
}
