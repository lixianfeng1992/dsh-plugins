import type { Query, SDKMessage, SDKUserMessage } from '@anthropic-ai/claude-agent-sdk'
import { describe, expect, it, vi } from 'vitest'
import { ClaudeProvider } from '../src/claude-provider.js'
import type { NativeEvent } from '../src/native.js'

class FakeQuery implements AsyncIterableIterator<SDKMessage> {
  readonly close = vi.fn()
  readonly interrupt = vi.fn(async () => undefined)
  readonly setModel = vi.fn(async () => undefined)
  private readonly messages: SDKMessage[] = []
  private waiter: (() => void) | undefined
  private ended = false

  push(message: SDKMessage): void {
    this.messages.push(message)
    this.waiter?.()
    this.waiter = undefined
  }

  end(): void {
    this.ended = true
    this.waiter?.()
    this.waiter = undefined
  }

  [Symbol.asyncIterator](): AsyncIterableIterator<SDKMessage> {
    return this
  }

  async next(): Promise<IteratorResult<SDKMessage>> {
    while (this.messages.length === 0 && !this.ended) {
      await new Promise<void>(resolve => { this.waiter = resolve })
    }
    const value = this.messages.shift()
    return value === undefined ? { done: true, value: undefined } : { done: false, value }
  }
}

const init = (sessionId: string): SDKMessage => ({
  type: 'system',
  subtype: 'init',
  session_id: sessionId,
} as SDKMessage)

const result = (sessionId: string, value: string, uuid: string): SDKMessage => ({
  type: 'result',
  subtype: 'success',
  is_error: false,
  result: value,
  session_id: sessionId,
  uuid,
  usage: { input_tokens: 2, output_tokens: 1 },
} as unknown as SDKMessage)

async function collect(stream: AsyncIterable<NativeEvent>): Promise<NativeEvent[]> {
  const events: NativeEvent[] = []
  for await (const event of stream) events.push(event)
  return events
}

describe('ClaudeProvider', () => {
  it('keeps one streaming Query resident across two turns', async () => {
    const fake = new FakeQuery()
    let prompts: AsyncIterable<SDKUserMessage> | undefined
    const query = vi.fn((input: { prompt: string | AsyncIterable<SDKUserMessage> }) => {
      prompts = input.prompt as AsyncIterable<SDKUserMessage>
      return fake as unknown as Query
    })
    const provider = new ClaudeProvider({
      permissionMode: 'dontAsk',
      env: {},
      graceMs: 3_000,
      resolveExecutable: async () => '/usr/local/bin/claude',
      spawn: () => { throw new Error('fake query must not spawn') },
      query: query as unknown as ConstructorParameters<typeof ClaudeProvider>[0]['query'],
    })
    const runtime = await provider.create({
      dshSessionId: 'child',
      cwd: '/work',
      signal: new AbortController().signal,
    })
    const input = prompts?.[Symbol.asyncIterator]()
    expect(input).toBeDefined()
    await runtime.setModel('claude-sonnet-4-6')
    expect(fake.setModel).toHaveBeenCalledWith('claude-sonnet-4-6')

    const first = collect(runtime.runTurn({ prompt: 'first', signal: new AbortController().signal }))
    await expect(input?.next()).resolves.toMatchObject({ value: { message: { content: [{ text: 'first' }] } } })
    fake.push(init('claude-native-1'))
    fake.push({
      type: 'assistant',
      session_id: 'claude-native-1',
      message: { role: 'assistant', content: [{ type: 'tool_use', id: 'tool-1', name: 'Bash', input: { command: 'pwd' } }] },
    } as unknown as SDKMessage)
    fake.push({
      type: 'user',
      session_id: 'claude-native-1',
      message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'tool-1', content: '/work' }] },
    } as unknown as SDKMessage)
    fake.push(result('claude-native-1', 'answer 1', 'turn-1'))
    await expect(first).resolves.toEqual(expect.arrayContaining([
      { type: 'thread-started', nativeId: 'claude-native-1' },
      { type: 'tool-start', callId: 'tool-1', name: 'Bash', input: { command: 'pwd' } },
      { type: 'tool-result', callId: 'tool-1', output: '/work' },
    ]))

    const second = collect(runtime.runTurn({ prompt: 'second', signal: new AbortController().signal }))
    await expect(input?.next()).resolves.toMatchObject({ value: { message: { content: [{ text: 'second' }] } } })
    fake.push(result('claude-native-1', 'answer 2', 'turn-2'))
    await expect(second).resolves.toContainEqual({ type: 'turn-completed', nativeTurnId: 'turn-2' })

    expect(query).toHaveBeenCalledOnce()
    fake.end()
    await runtime.close()
  })

  it('interrupts one turn and keeps the resident Query reusable', async () => {
    const fake = new FakeQuery()
    let prompts: AsyncIterable<SDKUserMessage> | undefined
    const provider = new ClaudeProvider({
      permissionMode: 'dontAsk',
      env: {},
      graceMs: 3_000,
      resolveExecutable: async () => '/usr/local/bin/claude',
      spawn: () => { throw new Error('fake query must not spawn') },
      query: ((input: { prompt: string | AsyncIterable<SDKUserMessage> }) => {
        prompts = input.prompt as AsyncIterable<SDKUserMessage>
        return fake as unknown as Query
      }) as unknown as ConstructorParameters<typeof ClaudeProvider>[0]['query'],
    })
    const runtime = await provider.create({
      dshSessionId: 'child',
      cwd: '/work',
      signal: new AbortController().signal,
    })
    const input = prompts?.[Symbol.asyncIterator]()
    const controller = new AbortController()
    const interrupted = collect(runtime.runTurn({ prompt: 'cancel me', signal: controller.signal }))
    await input?.next()
    fake.push(init('claude-native-1'))
    controller.abort()
    fake.push(result('claude-native-1', '', 'turn-canceled'))

    await expect(interrupted).resolves.toContainEqual({
      type: 'turn-canceled',
      reason: 'Claude Code turn was interrupted',
    })
    expect(fake.interrupt).toHaveBeenCalledOnce()

    const resumed = collect(runtime.runTurn({ prompt: 'continue', signal: new AbortController().signal }))
    await input?.next()
    fake.push(result('claude-native-1', 'continued', 'turn-continued'))
    await expect(resumed).resolves.toContainEqual({ type: 'text-delta', text: 'continued' })
    fake.end()
    await runtime.close()
  })
})
