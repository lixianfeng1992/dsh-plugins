import type { SubprocessHandle, SubprocessSpawnSpec } from '@deepseek-ai/dsh-subprocess'
import { CodexWire } from './codex-wire.js'
import { NativeAgentError } from './error.js'
import type {
  NativeCreateRuntimeInput,
  NativeCatalog,
  NativeEvent,
  NativeProvider,
  NativeResumeRuntimeInput,
  NativeRuntime,
  NativeTurnInput,
  NativeProviderStatus,
} from './native.js'

export type CodexPermissionMode = 'never' | 'dangerously-bypass-approvals-and-sandbox'

export interface CodexProviderOptions {
  readonly permissionMode: CodexPermissionMode
  readonly env: Record<string, string>
  readonly graceMs: number
  readonly resolveExecutable: (command: string, env: Readonly<Record<string, string>>, signal: AbortSignal) => Promise<string>
  readonly spawn: (spec: SubprocessSpawnSpec) => SubprocessHandle
}

function permission(mode: CodexPermissionMode): Record<string, unknown> {
  return mode === 'never'
    ? { approvalPolicy: 'never' }
    : { approvalPolicy: 'never', sandbox: 'danger-full-access' }
}

/** One resident Codex app-server process and persistent thread. */
export class CodexRuntime implements NativeRuntime {
  readonly provider = 'codex' as const
  private closed = false

  constructor(
    private readonly wire: CodexWire,
    private readonly child: SubprocessHandle,
  ) {
    void child.done.then(
      outcome => {
        if (!this.closed) {
          this.wire.fail(new NativeAgentError(
            'NATIVE_PROCESS_FAILURE',
            `native-agents: Codex app-server exited unexpectedly (exit ${String(outcome.exitCode)})`,
          ))
        }
      },
      error => { if (!this.closed) this.wire.fail(error) },
    )
  }

  get nativeId(): string | null {
    return this.wire.nativeId
  }

  setModel(model: string | undefined): Promise<void> {
    if (this.closed) {
      return Promise.reject(new NativeAgentError('NATIVE_RUNTIME_CLOSED', 'native-agents: Codex runtime is closed'))
    }
    this.wire.setModel(model)
    return Promise.resolve()
  }

  runTurn(input: NativeTurnInput): AsyncIterable<NativeEvent> {
    if (this.closed) {
      throw new NativeAgentError('NATIVE_RUNTIME_CLOSED', 'native-agents: Codex runtime is closed')
    }
    return this.wire.runTurn(input.prompt, input.signal)
  }

  async interrupt(): Promise<void> {
    if (!this.closed) await this.wire.interrupt()
  }

  async close(): Promise<void> {
    if (this.closed) return
    const interrupted = this.wire.interrupt().catch(() => {})
    this.closed = true
    this.wire.close()
    await interrupted
    this.child.terminate()
    await this.child.waitForExit()
    await this.child.done.catch(() => {})
  }
}

/** Creates resident Codex runtimes through the local app-server command. */
export class CodexProvider implements NativeProvider {
  readonly id = 'codex' as const
  readonly route = 'native-codex'
  readonly displayName = 'Codex (Local)'

  constructor(private readonly options: CodexProviderOptions) {}

  async discover(signal = new AbortController().signal): Promise<NativeProviderStatus> {
    try {
      await this.options.resolveExecutable('codex', this.options.env, signal)
      return { state: 'available' }
    } catch (error: unknown) {
      return { state: 'unavailable', reason: error instanceof Error ? error.message : String(error) }
    }
  }

  async fetchCatalog(signal = new AbortController().signal): Promise<NativeCatalog> {
    const { child, wire } = await this.openWire(process.cwd(), signal)
    try {
      return await wire.listModels(signal)
    } finally {
      wire.close()
      child.terminate()
      await child.waitForExit()
      await child.done.catch(() => {})
    }
  }

  create(input: NativeCreateRuntimeInput): Promise<NativeRuntime> {
    return this.open(input)
  }

  resume(input: NativeResumeRuntimeInput): Promise<NativeRuntime> {
    return this.open(input, input.nativeId)
  }

  private async open(
    input: NativeCreateRuntimeInput | NativeResumeRuntimeInput,
    nativeId?: string,
  ): Promise<NativeRuntime> {
    input.signal.throwIfAborted()
    const { child, wire } = await this.openWire(input.cwd, input.signal)
    const exited = child.done.then(outcome => {
      throw new NativeAgentError(
        'NATIVE_PROCESS_FAILURE',
        `native-agents: Codex app-server exited during initialization (exit ${String(outcome.exitCode)})`,
      )
    })
    try {
      wire.setModel(input.model)
      if (nativeId === undefined) {
        await Promise.race([
          wire.createThread(input.cwd, permission(this.options.permissionMode), input.model, input.tools, input.signal),
          exited,
        ])
      } else {
        await Promise.race([wire.resumeThread(nativeId, input.tools, input.signal), exited])
      }
      return new CodexRuntime(wire, child)
    } catch (error: unknown) {
      wire.close()
      child.terminate()
      await child.waitForExit()
      await child.done.catch(() => {})
      throw error
    }
  }

  private async openWire(cwd: string, signal: AbortSignal): Promise<{
    child: SubprocessHandle
    wire: CodexWire
  }> {
    signal.throwIfAborted()
    const command = await this.options.resolveExecutable('codex', this.options.env, signal)
    const child = this.options.spawn({
      argv: [command, 'app-server'],
      cwd,
      stdio: { stdin: 'pipe', stdout: 'pipe', stderr: 'inherit' },
      graceMs: this.options.graceMs,
      env: this.options.env,
    })
    if (child.stdout === undefined || child.stdin === undefined) {
      child.terminate()
      throw new NativeAgentError('NATIVE_PROCESS_FAILURE', 'native-agents: Codex app-server pipes are unavailable')
    }
    const wire = new CodexWire(child.stdout, child.stdin)
    wire.start()
    const exited = child.done.then(outcome => {
      throw new NativeAgentError(
        'NATIVE_PROCESS_FAILURE',
        `native-agents: Codex app-server exited during initialization (exit ${String(outcome.exitCode)})`,
      )
    })
    try {
      await Promise.race([wire.initialize(signal), exited])
      return { child, wire }
    } catch (error: unknown) {
      wire.close()
      child.terminate()
      await child.waitForExit()
      await child.done.catch(() => {})
      throw error
    }
  }
}
