import type { TokenUsage } from '@deepseek-ai/dsh-llm'
import type { JsonValue } from '@deepseek-ai/dsh-session'

export type NativeProviderId = string

export const NATIVE_TOOL_NAMES = [
  'create_agent',
  'send_message',
  'list_agents',
  'interrupt_agent',
  'report',
] as const

/** Runtime-scoped connection to the plugin's native MCP tool host. */
export interface NativeToolConnection {
  readonly url: string
  readonly authorization: string
}

export interface NativeModel {
  readonly id: string
  readonly name: string
  readonly description?: string
  readonly contextWindow?: number
  readonly isDefault?: boolean
}

export interface NativeCatalog {
  readonly models: readonly NativeModel[]
  readonly defaultModel?: string
}

export type NativeProviderStatus =
  | { readonly state: 'available'; readonly version?: string }
  | { readonly state: 'unavailable'; readonly reason: string }
  | { readonly state: 'error'; readonly message: string }

export interface NativeFailure {
  readonly code: string
  readonly message: string
}

export type NativeEvent =
  | { readonly type: 'thread-started'; readonly nativeId: string }
  | { readonly type: 'text-delta'; readonly text: string }
  | { readonly type: 'reasoning-delta'; readonly text: string }
  | { readonly type: 'tool-start'; readonly callId: string; readonly name: string; readonly input: JsonValue }
  | { readonly type: 'tool-result'; readonly callId: string; readonly output?: JsonValue; readonly error?: string }
  | { readonly type: 'usage'; readonly usage: TokenUsage }
  | { readonly type: 'turn-completed'; readonly nativeTurnId?: string }
  | { readonly type: 'turn-failed'; readonly failure: NativeFailure }
  | { readonly type: 'turn-canceled'; readonly reason: string }

export interface NativeRuntimeInput {
  readonly dshSessionId: string
  readonly cwd: string
  readonly model?: string
  readonly signal: AbortSignal
  readonly tools?: NativeToolConnection
}

export interface NativeCreateRuntimeInput extends NativeRuntimeInput {}

export interface NativeResumeRuntimeInput extends NativeRuntimeInput {
  readonly nativeId: string
}

export interface NativeTurnInput {
  readonly prompt: string
  readonly signal: AbortSignal
}

/** One live provider conversation. */
export interface NativeRuntime {
  readonly provider: NativeProviderId
  readonly nativeId: string | null
  setModel(model: string | undefined): Promise<void>
  runTurn(input: NativeTurnInput): AsyncIterable<NativeEvent>
  interrupt(): Promise<void>
  close(): Promise<void>
}

/** Creates and resumes live conversations for one native provider. */
export interface NativeProvider {
  readonly id: NativeProviderId
  readonly route: string
  readonly displayName: string
  discover(signal?: AbortSignal): Promise<NativeProviderStatus>
  fetchCatalog(signal?: AbortSignal): Promise<NativeCatalog>
  create(input: NativeCreateRuntimeInput): Promise<NativeRuntime>
  resume(input: NativeResumeRuntimeInput): Promise<NativeRuntime>
}

interface Pending<T> {
  readonly resolve: (value: IteratorResult<T>) => void
  readonly reject: (error: unknown) => void
}

/** Single-consumer async event queue used by resident provider protocols. */
export class AsyncEventQueue<T> implements AsyncIterable<T> {
  private readonly values: T[] = []
  private readonly pending: Pending<T>[] = []
  private ended = false
  private failure: unknown

  push(value: T): void {
    if (this.ended) return
    const pending = this.pending.shift()
    if (pending === undefined) this.values.push(value)
    else pending.resolve({ done: false, value })
  }

  end(): void {
    if (this.ended) return
    this.ended = true
    for (const pending of this.pending.splice(0)) pending.resolve({ done: true, value: undefined })
  }

  fail(error: unknown): void {
    if (this.ended) return
    this.failure = error
    this.ended = true
    for (const pending of this.pending.splice(0)) pending.reject(error)
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: async (): Promise<IteratorResult<T>> => {
        const value = this.values.shift()
        if (value !== undefined) return { done: false, value }
        if (this.failure !== undefined) throw this.failure
        if (this.ended) return { done: true, value: undefined }
        return await new Promise<IteratorResult<T>>((resolve, reject) => {
          this.pending.push({ resolve, reject })
        })
      },
    }
  }
}
