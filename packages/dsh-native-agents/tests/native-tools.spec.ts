import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { SessionId } from '@deepseek-ai/dsh-session'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { describe, expect, it, vi } from 'vitest'
import { NativeSubagentController, NativeToolHost } from '../src/native-tools.js'

function fixture() {
  const caller = {
    id: SessionId('parent'),
    options: { provider: 'native-codex', model: 'fallback-model' },
    session: { requestContext: () => ({ provider: 'native-codex', model: 'gpt-5.6-codex' }) },
  } as unknown as Agent
  const subagents = {
    startContinuable: vi.fn(async () => ({ childId: SessionId('child'), messageId: 'initial-message' })),
    followup: vi.fn(async () => 'followup-message'),
    listChildren: vi.fn(async () => [{ kind: 'child', id: SessionId('child'), activity: 'running', hasChildren: false, mode: 'continuable', label: 'task' }]),
    interrupt: vi.fn(),
    reportFrom: vi.fn(async () => 'report-message'),
  }
  const ctx = {
    agents: { get: (id: string) => id === caller.id ? caller : undefined },
    subagents,
  } as unknown as Context
  const controller = new NativeSubagentController(ctx, {
    provider: 'spawn',
    maxDepth: 3,
    isNativeRouteEnabled: route => route === 'native-codex' || route === 'native-claude-code',
  })
  return { caller, subagents, controller }
}

describe('NativeSubagentController', () => {
  it('maps the native catalog to continuable DSH subagent operations', async () => {
    const { caller, subagents, controller } = fixture()
    const signal = new AbortController().signal

    await expect(controller.createAgent(caller, {
      description: 'research',
      prompt: 'inspect the implementation',
    }, signal)).resolves.toEqual({ agent_id: 'child', status: 'running' })
    expect(subagents.startContinuable).toHaveBeenCalledWith({
      provider: 'spawn',
      label: 'research',
      request: {
        parent: caller,
        prompt: [{ type: 'text', text: 'inspect the implementation' }],
        agentOptions: { provider: 'native-codex', model: 'gpt-5.6-codex' },
        maxDepth: 3,
      },
      signal,
    })

    await controller.sendMessage(caller, { agent_id: 'child', message: 'continue' }, signal)
    expect(subagents.followup).toHaveBeenCalledWith(
      caller,
      'child',
      [{ type: 'text', text: 'continue' }],
      { source: { kind: 'coordinator', form: 'relay', senderSessionId: caller.id }, signal },
    )
    await expect(controller.listAgents(caller, signal)).resolves.toMatchObject({
      agents: [{ id: 'child', mode: 'continuable' }],
    })
    expect(controller.interruptAgent(caller, { agent_id: 'child' })).toEqual({ accepted: true })
    expect(subagents.interrupt).toHaveBeenCalledWith('child', { kind: 'ancestor', agent: caller })
    await expect(controller.report(caller, { message: 'result' }, signal)).resolves.toEqual({
      message_id: 'report-message',
    })
    expect(subagents.reportFrom).toHaveBeenCalledWith(
      caller,
      [{ type: 'text', text: 'result' }],
      { delivery: 'next-step', signal },
    )
  })

  it('serves the unified catalog over authenticated stateless MCP', async () => {
    const { subagents, controller } = fixture()
    const host = new NativeToolHost(controller)
    const lease = await host.acquire('parent')
    const client = new Client({ name: 'native-tools-test', version: '1.0.0' })
    const transport = new StreamableHTTPClientTransport(new URL(lease.connection.url), {
      requestInit: { headers: { Authorization: lease.connection.authorization } },
    })
    try {
      await client.connect(transport)
      await expect(client.listTools()).resolves.toMatchObject({
        tools: expect.arrayContaining([
          expect.objectContaining({ name: 'create_agent' }),
          expect.objectContaining({ name: 'send_message' }),
          expect.objectContaining({ name: 'list_agents' }),
          expect.objectContaining({ name: 'interrupt_agent' }),
          expect.objectContaining({ name: 'report' }),
        ]),
      })
      await expect(client.callTool({
        name: 'create_agent',
        arguments: { description: 'research', prompt: 'inspect it' },
      })).resolves.toMatchObject({
        structuredContent: { agent_id: 'child', status: 'running' },
      })
      expect(subagents.startContinuable).toHaveBeenCalledOnce()
    } finally {
      await client.close().catch(() => {})
      lease.close()
      await host.close()
    }
  })
})
