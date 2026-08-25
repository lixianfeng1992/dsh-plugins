import { createHash } from 'node:crypto'
import { mkdir, open, readFile, rename } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { NativeAgentError } from './error.js'

export type NativeProvider = string

interface BindingBase {
  version: 1
  dshSessionId: string
  provider: NativeProvider
  cwd: string
  createdAt: string
}

export type NativeBinding = BindingBase & (
  | { state: 'creating'; nativeId?: string }
  | { state: 'ready'; nativeId: string }
)

export interface CreateBindingInput {
  dshSessionId: string
  provider: NativeProvider
  cwd: string
  nativeId?: string
}

function corrupt(sessionId: string, cause?: unknown): NativeAgentError {
  return new NativeAgentError(
    'NATIVE_BINDING_CORRUPT',
    `native-agents: binding for DSH session ${JSON.stringify(sessionId)} is corrupt`,
    cause === undefined ? undefined : { cause },
  )
}

function validateBinding(value: unknown, sessionId: string): NativeBinding {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw corrupt(sessionId)
  const item = value as Record<string, unknown>
  if (
    item.version !== 1
    || item.dshSessionId !== sessionId
    || typeof item.provider !== 'string'
    || item.provider.length === 0
    || (item.state !== 'creating' && item.state !== 'ready')
    || typeof item.cwd !== 'string'
    || item.cwd.length === 0
    || typeof item.createdAt !== 'string'
    || item.createdAt.length === 0
    || (item.nativeId !== undefined && (typeof item.nativeId !== 'string' || item.nativeId.length === 0))
    || (item.state === 'ready' && typeof item.nativeId !== 'string')
  ) {
    throw corrupt(sessionId)
  }
  return item as unknown as NativeBinding
}

async function syncDirectory(path: string): Promise<void> {
  const directory = await open(path, 'r')
  try {
    await directory.sync()
  } finally {
    await directory.close()
  }
}

/** Plugin-owned durable association between one DSH child and one native session. */
export class BindingStore {
  constructor(private readonly root: string) {}

  pathFor(sessionId: string): string {
    const key = createHash('sha256').update(sessionId).digest('hex')
    return join(this.root, 'bindings', key, 'binding.json')
  }

  async read(sessionId: string): Promise<NativeBinding | undefined> {
    let source: string
    try {
      source = await readFile(this.pathFor(sessionId), 'utf8')
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
      throw corrupt(sessionId, error)
    }
    try {
      return validateBinding(JSON.parse(source), sessionId)
    } catch (error: unknown) {
      if (error instanceof NativeAgentError) throw error
      throw corrupt(sessionId, error)
    }
  }

  async create(input: CreateBindingInput): Promise<NativeBinding> {
    const binding: NativeBinding = {
      version: 1,
      dshSessionId: input.dshSessionId,
      provider: input.provider,
      state: 'creating',
      ...input.nativeId === undefined ? {} : { nativeId: input.nativeId },
      cwd: input.cwd,
      createdAt: new Date().toISOString(),
    }
    const path = this.pathFor(input.dshSessionId)
    await mkdir(dirname(path), { recursive: true, mode: 0o700 })
    let file
    try {
      file = await open(path, 'wx', 0o600)
      await file.writeFile(`${JSON.stringify(binding, null, 2)}\n`, 'utf8')
      await file.sync()
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
        throw new NativeAgentError(
          'NATIVE_BINDING_EXISTS',
          `native-agents: binding for DSH session ${JSON.stringify(input.dshSessionId)} already exists`,
        )
      }
      throw error
    } finally {
      await file?.close()
    }
    await syncDirectory(dirname(path))
    return binding
  }

  async markReady(
    sessionId: string,
    provider: NativeProvider,
    nativeId: string,
  ): Promise<NativeBinding & { state: 'ready' }> {
    const current = await this.read(sessionId)
    if (current === undefined || current.provider !== provider || current.state !== 'creating') {
      throw corrupt(sessionId)
    }
    const ready = { ...current, state: 'ready' as const, nativeId }
    const path = this.pathFor(sessionId)
    const temporary = join(dirname(path), `.binding-${process.pid}-${Date.now()}.tmp`)
    const file = await open(temporary, 'wx', 0o600)
    try {
      await file.writeFile(`${JSON.stringify(ready, null, 2)}\n`, 'utf8')
      await file.sync()
    } finally {
      await file.close()
    }
    await rename(temporary, path)
    await syncDirectory(dirname(path))
    return ready
  }

  async readReady(
    sessionId: string,
    provider: NativeProvider,
    cwd: string,
  ): Promise<NativeBinding & { state: 'ready' }> {
    const binding = await this.read(sessionId)
    if (binding === undefined) {
      throw new NativeAgentError(
        'NATIVE_BINDING_MISSING',
        `native-agents: binding for DSH session ${JSON.stringify(sessionId)} is missing`,
      )
    }
    if (binding.provider !== provider) throw corrupt(sessionId)
    if (binding.state !== 'ready') {
      throw new NativeAgentError(
        'NATIVE_CREATION_INCOMPLETE',
        `native-agents: native creation for DSH session ${JSON.stringify(sessionId)} is incomplete`,
      )
    }
    if (binding.cwd !== cwd) {
      throw new NativeAgentError(
        'NATIVE_CWD_MISMATCH',
        `native-agents: DSH session ${JSON.stringify(sessionId)} cannot resume in a different workspace`,
      )
    }
    return binding
  }
}
