import { randomBytes } from 'node:crypto'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { SessionId } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-subagent'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import { NativeAgentError } from './error.js'
import { NATIVE_TOOL_NAMES } from './native.js'
import type { NativeToolLease } from './runtime-registry.js'

const MAX_REQUEST_BYTES = 1024 * 1024

export interface NativeSubagentPolicy {
  readonly provider: string
  readonly maxDepth: number
  readonly isNativeRouteEnabled: (route: string) => boolean
}

function nativeRoute(provider: 'codex' | 'claude-code'): string {
  return provider === 'codex' ? 'native-codex' : 'native-claude-code'
}

function textContent(value: unknown): CallToolResult {
  const structuredContent = value as Record<string, unknown>
  return {
    content: [{ type: 'text', text: JSON.stringify(value) }],
    structuredContent,
  }
}

/** Maps the provider-neutral native tool catalog to the DSH subagent service. */
export class NativeSubagentController {
  constructor(
    private readonly ctx: Context,
    private readonly policy: NativeSubagentPolicy,
  ) {}

  resolveCaller(sessionId: string): Agent {
    const caller = this.ctx.agents.get(SessionId(sessionId))
    if (caller === undefined) {
      throw new NativeAgentError(
        'NATIVE_TOOL_CALLER_UNAVAILABLE',
        `native-agents: DSH session ${JSON.stringify(sessionId)} is not a live agent`,
      )
    }
    return caller
  }

  async createAgent(
    caller: Agent,
    input: { description: string; prompt: string; provider?: 'codex' | 'claude-code'; model?: string },
    signal: AbortSignal,
  ): Promise<Record<string, unknown>> {
    const current = caller.session.requestContext()
    const provider = input.provider === undefined
      ? current?.provider ?? caller.options.provider
      : nativeRoute(input.provider)
    if (provider !== 'native-codex' && provider !== 'native-claude-code') {
      throw new NativeAgentError(
        'NATIVE_TOOL_PROVIDER_REQUIRED',
        'native-agents: create_agent requires a native Codex or Claude Code parent or explicit provider',
      )
    }
    if (!this.policy.isNativeRouteEnabled(provider)) {
      throw new NativeAgentError(
        'NATIVE_TOOL_PROVIDER_DISABLED',
        `native-agents: requested child provider ${JSON.stringify(provider)} is disabled`,
      )
    }
    const model = input.model ?? current?.model ?? caller.options.model
    const started = await this.ctx.subagents.startContinuable({
      provider: this.policy.provider,
      label: input.description,
      request: {
        parent: caller,
        prompt: [{ type: 'text', text: input.prompt }],
        agentOptions: { provider, ...model === undefined ? {} : { model } },
        maxDepth: this.policy.maxDepth,
      },
      signal,
    })
    return { agent_id: started.childId, status: 'running' }
  }

  async sendMessage(
    caller: Agent,
    input: { agent_id: string; message: string },
    signal: AbortSignal,
  ): Promise<Record<string, unknown>> {
    const messageId = await this.ctx.subagents.followup(
      caller,
      SessionId(input.agent_id),
      [{ type: 'text', text: input.message }],
      {
        source: { kind: 'coordinator', form: 'relay', senderSessionId: caller.id },
        signal,
      },
    )
    return { message_id: messageId }
  }

  async listAgents(caller: Agent, signal: AbortSignal): Promise<Record<string, unknown>> {
    const agents = await this.ctx.subagents.listChildren(caller.id, signal)
    return { agents }
  }

  interruptAgent(caller: Agent, input: { agent_id: string }): Record<string, unknown> {
    this.ctx.subagents.interrupt(SessionId(input.agent_id), { kind: 'ancestor', agent: caller })
    return { accepted: true }
  }

  async report(
    caller: Agent,
    input: { message: string },
    signal: AbortSignal,
  ): Promise<Record<string, unknown>> {
    const messageId = await this.ctx.subagents.reportFrom(
      caller,
      [{ type: 'text', text: input.message }],
      { delivery: 'next-step', signal },
    )
    return { message_id: messageId }
  }
}

/** Loopback MCP server with one revocable capability per native runtime. */
export class NativeToolHost {
  private readonly tokens = new Map<string, string>()
  private server: Server | undefined
  private endpoint: Promise<string> | undefined
  private closed = false

  constructor(private readonly controller: NativeSubagentController) {}

  async acquire(sessionId: string): Promise<NativeToolLease> {
    if (this.closed) {
      throw new NativeAgentError('NATIVE_TOOL_HOST_CLOSED', 'native-agents: native tool host is closed')
    }
    const url = await (this.endpoint ??= this.listen())
    const token = randomBytes(32).toString('base64url')
    this.tokens.set(token, sessionId)
    let active = true
    return {
      connection: { url, authorization: `Bearer ${token}` },
      close: () => {
        if (!active) return
        active = false
        this.tokens.delete(token)
      },
    }
  }

  async close(): Promise<void> {
    if (this.closed) return
    this.closed = true
    this.tokens.clear()
    const endpoint = this.endpoint
    if (endpoint !== undefined) await endpoint.catch(() => {})
    const server = this.server
    if (server !== undefined) await new Promise<void>((resolve, reject) => {
      server.close(error => { if (error === undefined) resolve(); else reject(error) })
    })
  }

  private async listen(): Promise<string> {
    const server = createServer((request, response) => { void this.handle(request, response) })
    this.server = server
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', () => {
        server.off('error', reject)
        resolve()
      })
    })
    const address = server.address() as AddressInfo
    return `http://127.0.0.1:${String(address.port)}/mcp`
  }

  private async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    if (request.method !== 'POST' || request.url?.split('?', 1)[0] !== '/mcp') {
      this.jsonError(response, 405, -32000, 'Method not allowed')
      return
    }
    const token = this.bearerToken(request.headers.authorization)
    const sessionId = token === undefined ? undefined : this.tokens.get(token)
    if (sessionId === undefined) {
      this.jsonError(response, 401, -32001, 'Unauthorized')
      return
    }
    try {
      const body = await this.readBody(request)
      const caller = this.controller.resolveCaller(sessionId)
      const mcp = this.createMcpServer(caller)
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableDnsRebindingProtection: false,
      })
      response.on('close', () => {
        void transport.close()
        void mcp.close()
      })
      await mcp.connect(transport)
      await transport.handleRequest(request, response, body)
    } catch (error: unknown) {
      if (!response.headersSent) {
        const tooLarge = error instanceof NativeAgentError && error.code === 'NATIVE_TOOL_REQUEST_TOO_LARGE'
        this.jsonError(response, tooLarge ? 413 : 500, -32603, error instanceof Error ? error.message : 'MCP request failed')
      }
    }
  }

  private createMcpServer(caller: Agent): McpServer {
    const server = new McpServer({ name: 'dsh-native-agents', version: '0.3.1' })
    const [createAgent, sendMessage, listAgents, interruptAgent, report] = NATIVE_TOOL_NAMES
    server.registerTool(createAgent, {
      description: 'Create a background continuable DSH child agent for a delegated task.',
      inputSchema: {
        description: z.string().min(1),
        prompt: z.string().min(1),
        provider: z.enum(['codex', 'claude-code']).optional(),
        model: z.string().min(1).optional(),
      },
    }, async (args, extra) => textContent(await this.controller.createAgent(caller, args, extra.signal)))
    server.registerTool(sendMessage, {
      description: 'Continue an existing child agent with another message.',
      inputSchema: { agent_id: z.string().min(1), message: z.string().min(1) },
    }, async (args, extra) => textContent(await this.controller.sendMessage(caller, args, extra.signal)))
    server.registerTool(listAgents, {
      description: 'List direct DSH child agents and their current activity.',
    }, async (_extra) => textContent(await this.controller.listAgents(caller, new AbortController().signal)))
    server.registerTool(interruptAgent, {
      description: 'Interrupt a child agent current turn while keeping it continuable.',
      inputSchema: { agent_id: z.string().min(1) },
    }, async args => textContent(this.controller.interruptAgent(caller, args)))
    server.registerTool(report, {
      description: 'Report selected content from this child agent to its DSH parent.',
      inputSchema: { message: z.string().min(1) },
    }, async (args, extra) => textContent(await this.controller.report(caller, args, extra.signal)))
    return server
  }

  private bearerToken(header: string | undefined): string | undefined {
    if (header === undefined || !header.startsWith('Bearer ')) return undefined
    const token = header.slice('Bearer '.length)
    return token.length === 0 ? undefined : token
  }

  private async readBody(request: IncomingMessage): Promise<unknown> {
    const chunks: Buffer[] = []
    let size = 0
    for await (const chunk of request) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      size += buffer.length
      if (size > MAX_REQUEST_BYTES) {
        throw new NativeAgentError('NATIVE_TOOL_REQUEST_TOO_LARGE', 'native-agents: MCP request exceeds 1 MiB')
      }
      chunks.push(buffer)
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
  }

  private jsonError(response: ServerResponse, status: number, code: number, message: string): void {
    response.writeHead(status, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ jsonrpc: '2.0', error: { code, message }, id: null }))
  }
}
