import { BindingStore } from './binding-store.js'
import { NativeAgentError } from './error.js'
import type { NativeProvider, NativeRuntime, NativeToolConnection } from './native.js'

export interface NativeToolLease {
  readonly connection: NativeToolConnection
  close(): void
}

export type NativeToolLeaseFactory = (dshSessionId: string) => Promise<NativeToolLease>

class LeasedRuntime implements NativeRuntime {
  constructor(
    private readonly runtime: NativeRuntime,
    private readonly lease: NativeToolLease,
  ) {}

  get provider(): string { return this.runtime.provider }
  get nativeId(): string | null { return this.runtime.nativeId }
  setModel(model: string | undefined): Promise<void> { return this.runtime.setModel(model) }
  runTurn(input: Parameters<NativeRuntime['runTurn']>[0]): AsyncIterable<import('./native.js').NativeEvent> {
    return this.runtime.runTurn(input)
  }
  interrupt(): Promise<void> { return this.runtime.interrupt() }
  async close(): Promise<void> {
    try {
      await this.runtime.close()
    } finally {
      this.lease.close()
    }
  }
}

export interface ResolveRuntimeInput {
  readonly dshSessionId: string
  readonly cwd: string
  readonly model?: string
  readonly allowCreate: boolean
  readonly signal: AbortSignal
}

/** Owns live native runtimes and reconstructs them from durable bindings. */
export class NativeRuntimeRegistry {
  private readonly runtimes = new Map<string, NativeRuntime>()
  private readonly resolving = new Map<string, Promise<NativeRuntime>>()
  private closed = false

  constructor(
    private readonly provider: NativeProvider,
    private readonly store: BindingStore,
    private readonly acquireToolLease?: NativeToolLeaseFactory,
  ) {}

  async resolve(input: ResolveRuntimeInput): Promise<NativeRuntime> {
    if (this.closed) {
      throw new NativeAgentError('NATIVE_RUNTIME_CLOSED', 'native-agents: runtime registry is closed')
    }
    const cached = this.runtimes.get(input.dshSessionId)
    if (cached !== undefined) return cached
    const pending = this.resolving.get(input.dshSessionId)
    if (pending !== undefined) return await pending
    const resolution = this.open(input)
    this.resolving.set(input.dshSessionId, resolution)
    try {
      const runtime = await resolution
      if (this.closed) {
        await runtime.close()
        throw new NativeAgentError('NATIVE_RUNTIME_CLOSED', 'native-agents: runtime registry is closed')
      }
      this.runtimes.set(input.dshSessionId, runtime)
      return runtime
    } finally {
      this.resolving.delete(input.dshSessionId)
    }
  }

  async markReady(dshSessionId: string, nativeId: string): Promise<void> {
    await this.store.markReady(dshSessionId, this.provider.id, nativeId)
  }

  evict(dshSessionId: string, runtime: NativeRuntime): void {
    if (this.runtimes.get(dshSessionId) === runtime) this.runtimes.delete(dshSessionId)
  }

  async closeAll(): Promise<void> {
    if (this.closed) return
    this.closed = true
    const runtimes = [...this.runtimes.values()]
    this.runtimes.clear()
    await Promise.allSettled(runtimes.map(async runtime => { await runtime.close() }))
  }

  /** Close resident runtimes while keeping this registry available for re-enable. */
  async releaseAll(): Promise<void> {
    if (this.closed) return
    const runtimes = [...this.runtimes.values()]
    this.runtimes.clear()
    await Promise.allSettled(runtimes.map(async runtime => { await runtime.close() }))
  }

  private async open(input: ResolveRuntimeInput): Promise<NativeRuntime> {
    const lease = await this.acquireToolLease?.(input.dshSessionId)
    const runtimeInput = {
      ...input,
      ...lease === undefined ? {} : { tools: lease.connection },
    }
    try {
      const binding = await this.store.read(input.dshSessionId)
      if (binding === undefined) {
        if (!input.allowCreate) {
          throw new NativeAgentError(
            'NATIVE_BINDING_MISSING',
            `native-agents: binding for DSH session ${JSON.stringify(input.dshSessionId)} is missing`,
          )
        }
        await this.store.create({
          dshSessionId: input.dshSessionId,
          provider: this.provider.id,
          cwd: input.cwd,
        })
        const runtime = await this.provider.create(runtimeInput)
        if (runtime.nativeId !== null) await this.markReady(input.dshSessionId, runtime.nativeId)
        return lease === undefined ? runtime : new LeasedRuntime(runtime, lease)
      }
      const ready = await this.store.readReady(input.dshSessionId, this.provider.id, input.cwd)
      const runtime = await this.provider.resume({ ...runtimeInput, nativeId: ready.nativeId })
      if (runtime.nativeId !== ready.nativeId) {
        await runtime.close()
        throw new NativeAgentError(
          'NATIVE_BINDING_CORRUPT',
          `native-agents: ${this.provider.id} resumed an unexpected native session id`,
        )
      }
      return lease === undefined ? runtime : new LeasedRuntime(runtime, lease)
    } catch (error: unknown) {
      lease?.close()
      throw error
    }
  }
}
