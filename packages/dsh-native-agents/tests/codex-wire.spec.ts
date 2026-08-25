import { PassThrough } from 'node:stream'
import { describe, expect, it } from 'vitest'
import { CodexWire } from '../src/codex-wire.js'
import type { NativeEvent } from '../src/native.js'

type Frame = Record<string, unknown>

async function collect(stream: AsyncIterable<NativeEvent>): Promise<NativeEvent[]> {
  const events: NativeEvent[] = []
  for await (const event of stream) events.push(event)
  return events
}

describe('CodexWire', () => {
  it('reuses one app-server thread for two streamed turns', async () => {
    const serverOutput = new PassThrough()
    const clientOutput = new PassThrough()
    const wire = new CodexWire(serverOutput, clientOutput)
    const methods: string[] = []
    let turn = 0
    let buffer = ''
    const send = (frame: Frame): void => { serverOutput.write(`${JSON.stringify(frame)}\n`) }
    clientOutput.on('data', (chunk: Buffer) => {
      buffer += chunk.toString('utf8')
      for (;;) {
        const newline = buffer.indexOf('\n')
        if (newline < 0) break
        const line = buffer.slice(0, newline)
        buffer = buffer.slice(newline + 1)
        const frame = JSON.parse(line) as Frame
        if (typeof frame.method !== 'string') continue
        methods.push(frame.method)
        if (frame.id === undefined) continue
        if (frame.method === 'initialize') {
          send({ jsonrpc: '2.0', id: frame.id, result: {} })
        } else if (frame.method === 'thread/start') {
          send({ jsonrpc: '2.0', id: frame.id, result: { thread: { id: 'thread-1' } } })
        } else if (frame.method === 'turn/start') {
          turn += 1
          const turnId = `turn-${turn}`
          send({ jsonrpc: '2.0', id: frame.id, result: { turn: { id: turnId } } })
          send({
            jsonrpc: '2.0',
            method: 'item/reasoning/summaryTextDelta',
            params: { threadId: 'thread-1', turnId, itemId: `reason-${turn}`, delta: 'thinking' },
          })
          send({
            jsonrpc: '2.0',
            method: 'item/agentMessage/delta',
            params: { threadId: 'thread-1', turnId, itemId: `answer-${turn}`, delta: `answer ${turn}` },
          })
          send({
            jsonrpc: '2.0',
            method: 'turn/completed',
            params: { threadId: 'thread-1', turn: { id: turnId, status: 'completed' } },
          })
        }
      }
    })
    wire.start()
    const signal = new AbortController().signal
    await wire.initialize(signal)
    await wire.createThread('/work', { approvalPolicy: 'never' }, undefined, signal)

    const first = await collect(wire.runTurn('first', signal))
    const second = await collect(wire.runTurn('second', signal))

    expect(first).toContainEqual({ type: 'reasoning-delta', text: 'thinking' })
    expect(first).toContainEqual({ type: 'text-delta', text: 'answer 1' })
    expect(second).toContainEqual({ type: 'turn-completed', nativeTurnId: 'turn-2' })
    expect(methods.filter(method => method === 'thread/start')).toHaveLength(1)
    expect(methods.filter(method => method === 'turn/start')).toHaveLength(2)
    wire.close()
  })

  it('interrupts an active turn and emits a canceled terminal event', async () => {
    const serverOutput = new PassThrough()
    const clientOutput = new PassThrough()
    const wire = new CodexWire(serverOutput, clientOutput)
    const controller = new AbortController()
    let confirmTurnStarted!: () => void
    const turnStarted = new Promise<void>(resolve => { confirmTurnStarted = resolve })
    let buffer = ''
    const send = (frame: Frame): void => { serverOutput.write(`${JSON.stringify(frame)}\n`) }
    clientOutput.on('data', (chunk: Buffer) => {
      buffer += chunk.toString('utf8')
      for (;;) {
        const newline = buffer.indexOf('\n')
        if (newline < 0) break
        const frame = JSON.parse(buffer.slice(0, newline)) as Frame
        buffer = buffer.slice(newline + 1)
        if (frame.id === undefined || typeof frame.method !== 'string') continue
        if (frame.method === 'initialize') {
          send({ jsonrpc: '2.0', id: frame.id, result: {} })
        } else if (frame.method === 'thread/start') {
          send({ jsonrpc: '2.0', id: frame.id, result: { thread: { id: 'thread-1' } } })
        } else if (frame.method === 'turn/start') {
          send({ jsonrpc: '2.0', id: frame.id, result: { turn: { id: 'turn-1' } } })
          confirmTurnStarted()
        } else if (frame.method === 'turn/interrupt') {
          send({ jsonrpc: '2.0', id: frame.id, result: {} })
          send({
            jsonrpc: '2.0',
            method: 'turn/completed',
            params: { threadId: 'thread-1', turn: { id: 'turn-1', status: 'interrupted' } },
          })
        }
      }
    })
    wire.start()
    const setupSignal = new AbortController().signal
    await wire.initialize(setupSignal)
    await wire.createThread('/work', { approvalPolicy: 'never' }, undefined, setupSignal)

    const interrupted = collect(wire.runTurn('cancel me', controller.signal))
    await turnStarted
    await new Promise<void>(resolve => { setImmediate(resolve) })
    controller.abort()
    await expect(interrupted).resolves.toContainEqual({
      type: 'turn-canceled',
      reason: 'Codex turn was interrupted',
    })
    wire.close()
  })
})
