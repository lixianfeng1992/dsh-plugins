import { BindingStore } from './binding-store.js'
import { NativeAgentError } from './error.js'
import type { NativeProvider, NativeRuntime } from './native.js'

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

  private async open(input: ResolveRuntimeInput): Promise<NativeRuntime> {
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
      const runtime = await this.provider.create(input)
      if (runtime.nativeId !== null) await this.markReady(input.dshSessionId, runtime.nativeId)
      return runtime
    }
    const ready = await this.store.readReady(input.dshSessionId, this.provider.id, input.cwd)
    const runtime = await this.provider.resume({ ...input, nativeId: ready.nativeId })
    if (runtime.nativeId !== ready.nativeId) {
      await runtime.close()
      throw new NativeAgentError(
        'NATIVE_BINDING_CORRUPT',
        `native-agents: ${this.provider.id} resumed an unexpected native session id`,
      )
    }
    return runtime
  }
}
