import { EventEmitter } from 'node:events'
import type { SpawnedProcess, SpawnOptions } from '@anthropic-ai/claude-agent-sdk'
import {
  scrubbedParentEnv,
  type SubprocessHandle,
  type SubprocessSpawnSpec,
} from '@deepseek-ai/dsh-subprocess'

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}

function environmentOverlay(env: SpawnOptions['env']): NodeJS.ProcessEnv {
  const overlay: NodeJS.ProcessEnv = { ...env }
  for (const name of Object.keys(scrubbedParentEnv())) {
    if (!(name in env)) overlay[name] = undefined
  }
  return overlay
}

/** Convert an SDK spawn request to the DSH process-tree capability. */
export function claudeSpawnSpec(options: SpawnOptions, graceMs: number): SubprocessSpawnSpec {
  if (options.cwd === undefined || options.cwd.length === 0) {
    throw new Error('native-agents: Claude Code omitted its working directory')
  }
  return {
    argv: [options.command, ...options.args],
    cwd: options.cwd,
    stdio: { stdin: 'pipe', stdout: 'pipe', stderr: 'inherit' },
    graceMs,
    signal: options.signal,
    env: environmentOverlay(options.env),
  }
}

/** SDK-facing process facade backed by one DSH process-tree handle. */
export class ManagedClaudeProcess implements SpawnedProcess {
  readonly stdin
  readonly stdout
  private readonly events = new EventEmitter()
  private outcome: Awaited<SubprocessHandle['done']> | undefined
  private killRequested = false

  constructor(private readonly child: SubprocessHandle) {
    this.stdin = child.stdin as NonNullable<SubprocessHandle['stdin']>
    this.stdout = child.stdout as NonNullable<SubprocessHandle['stdout']>
    this.events.on('error', () => {})
    void child.done.then(
      (outcome) => {
        this.outcome = outcome
        this.events.emit('exit', outcome.exitCode, outcome.signal)
      },
      (error: unknown) => { this.events.emit('error', asError(error)) },
    )
  }

  get killed(): boolean {
    return this.killRequested
  }

  get exitCode(): number | null {
    return this.outcome?.exitCode ?? null
  }

  get signalCode(): NodeJS.Signals | null {
    return this.outcome?.signal ?? null
  }

  kill(_signal: NodeJS.Signals): boolean {
    if (this.killRequested || this.outcome !== undefined) return false
    this.killRequested = true
    this.child.terminate()
    return true
  }

  on(
    event: 'exit' | 'error',
    listener: ((code: number | null, signal: NodeJS.Signals | null) => void) | ((error: Error) => void),
  ): void {
    this.events.on(event, listener)
  }

  once(
    event: 'exit' | 'error',
    listener: ((code: number | null, signal: NodeJS.Signals | null) => void) | ((error: Error) => void),
  ): void {
    this.events.once(event, listener)
  }

  off(
    event: 'exit' | 'error',
    listener: ((code: number | null, signal: NodeJS.Signals | null) => void) | ((error: Error) => void),
  ): void {
    this.events.off(event, listener)
  }
}
