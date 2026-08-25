import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  createAssistantMessage,
  createUserMessage,
  type GenerateOptions,
  type Message,
  type StreamChunk,
} from '@deepseek-ai/dsh-llm'
import { describe, expect, it, vi } from 'vitest'
import { NativeLlmAdapter } from '../src/adapter.js'
import { BindingStore } from '../src/binding-store.js'
import type {
  NativeEvent,
  NativeProvider,
  NativeRuntime,
  NativeTurnInput,
} from '../src/native.js'
import { NativeRuntimeRegistry } from '../src/runtime-registry.js'

const user = (text: string): Message => createUserMessage({
  content: [{ type: 'text', text }],
  source: { kind: 'user' },
})

const assistant = (text: string): Message => createAssistantMessage({
  content: [{ type: 'text', text }],
  source: { provider: 'native-codex', model: 'default' },
})

function request(messages: Message[]): GenerateOptions {
  return {
    provider: 'native-codex',
    model: 'default',
    messages,
    sessionId: 'child' as GenerateOptions['sessionId'],
  }
}

async function collect(stream: AsyncIterable<StreamChunk>): Promise<StreamChunk[]> {
  const chunks: StreamChunk[] = []
  for await (const chunk of stream) chunks.push(chunk)
  return chunks
}

class FakeRuntime implements NativeRuntime {
  readonly provider = 'codex' as const
  nativeId: string | null
  readonly prompts: string[] = []
  readonly models: Array<string | undefined> = []
  closed = false

  constructor(nativeId: string | null) {
    this.nativeId = nativeId
  }

  setModel(model: string | undefined): Promise<void> {
    this.models.push(model)
    return Promise.resolve()
  }

  async * runTurn(input: NativeTurnInput): AsyncIterable<NativeEvent> {
    this.prompts.push(input.prompt)
    if (this.nativeId === null) {
      this.nativeId = 'native-1'
      yield { type: 'thread-started', nativeId: this.nativeId }
    }
    yield { type: 'reasoning-delta', text: 'thinking' }
    yield { type: 'text-delta', text: `answer ${this.prompts.length}` }
    yield { type: 'usage', usage: { inputTokens: 3, outputTokens: 2 } }
    yield { type: 'turn-completed', nativeTurnId: `turn-${this.prompts.length}` }
  }

  interrupt(): Promise<void> {
    return Promise.resolve()
  }

  close(): Promise<void> {
    this.closed = true
    return Promise.resolve()
  }
}

function fakeProvider(overrides: Partial<NativeProvider> = {}): NativeProvider {
  return {
    id: 'codex',
    route: 'native-codex',
    displayName: 'Codex (Local)',
    discover: async () => ({ state: 'available' }),
    fetchCatalog: async () => ({ models: [{ id: 'default', name: 'Native default' }] }),
    create: async () => { throw new Error('unexpected create') },
    resume: async () => { throw new Error('unexpected resume') },
    ...overrides,
  }
}

function adapter(provider: NativeProvider, store: BindingStore): NativeLlmAdapter {
  return new NativeLlmAdapter({
    route: 'native-codex',
    provider,
    registry: new NativeRuntimeRegistry(provider, store),
    resolveCwd: () => '/work',
  })
}

describe('NativeLlmAdapter', () => {
  it('owns the prepared-call entry point required by source-launched DSH', async () => {
    const provider = fakeProvider({
      create: vi.fn(),
      resume: vi.fn(),
    })
    const prepared = await adapter(provider, {} as BindingStore).prepareCall('native-codex', 'default')
    expect(Object.hasOwn(NativeLlmAdapter.prototype, 'prepareCall')).toBe(true)
    expect(prepared.model).toMatchObject({ provider: 'native-codex', id: 'default' })
  })

  it('creates once, streams events, and reuses the live runtime', async () => {
    const root = await mkdtemp(join(tmpdir(), 'native-agents-'))
    const runtime = new FakeRuntime(null)
    const provider = fakeProvider({
      create: vi.fn(async () => runtime),
      resume: vi.fn(),
    })
    const native = adapter(provider, new BindingStore(root))

    const created = await collect(native.stream(request([user('remember alpha')])))
    const resumed = await collect(native.stream(request([
      user('remember alpha'),
      assistant('answer 1'),
      user('what word?'),
    ])))

    expect(provider.create).toHaveBeenCalledOnce()
    expect(provider.resume).not.toHaveBeenCalled()
    expect(runtime.prompts).toEqual(['remember alpha', 'what word?'])
    expect(created).toContainEqual({ type: 'reasoning-delta', index: 0, text: 'thinking' })
    expect(created).toContainEqual({ type: 'text-delta', index: 1, text: 'answer 1' })
    expect(created).toContainEqual({ type: 'usage', usage: { inputTokens: 3, outputTokens: 2 } })
    expect(resumed.at(-1)).toMatchObject({
      type: 'finish',
      replayState: { response: { provider: 'codex', nativeId: 'native-1', nativeTurnId: 'turn-2' } },
    })
  })

  it('cold-resumes a ready binding through a new registry', async () => {
    const root = await mkdtemp(join(tmpdir(), 'native-agents-'))
    const store = new BindingStore(root)
    await store.create({ dshSessionId: 'child', provider: 'codex', cwd: '/work' })
    await store.markReady('child', 'codex', 'native-1')
    const runtime = new FakeRuntime('native-1')
    const provider = fakeProvider({
      create: vi.fn(),
      resume: vi.fn(async () => runtime),
    })

    await collect(adapter(provider, store).stream(request([
      user('first'),
      assistant('done'),
      user('continue'),
    ])))

    expect(provider.resume).toHaveBeenCalledWith(expect.objectContaining({ nativeId: 'native-1' }))
    expect(runtime.prompts).toEqual(['continue'])
  })

  it('does not recreate a missing conversation for later history', async () => {
    const root = await mkdtemp(join(tmpdir(), 'native-agents-'))
    const provider = fakeProvider({
      create: vi.fn(),
      resume: vi.fn(),
    })

    await expect(collect(adapter(provider, new BindingStore(root)).stream(
      request([user('first'), user('later')]),
    ))).rejects.toMatchObject({ code: 'NATIVE_BINDING_MISSING' })
    expect(provider.create).not.toHaveBeenCalled()
  })

  it('disables automatic retries for side-effecting native turns', () => {
    const provider = fakeProvider()
    expect(adapter(provider, {} as BindingStore).providerRetryPolicy('native-codex')).toMatchObject({
      mode: 'normal',
      maxRetries: 0,
    })
  })
})
