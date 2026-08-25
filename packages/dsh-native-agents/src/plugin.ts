import { join, resolve } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import { SessionId } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-subprocess'
import z from '@deepseek-ai/schemastery'
import { NativeLlmAdapter } from './adapter.js'
import { BindingStore } from './binding-store.js'
import { ClaudeProvider, type ClaudePermissionMode } from './claude-provider.js'
import { CodexProvider, type CodexPermissionMode } from './codex-provider.js'
import { NativeAgentError } from './error.js'
import { NativeRuntimeRegistry } from './runtime-registry.js'

export const name = 'native-agents'
export const inject = ['agents', 'llm', 'subprocess']

interface CodexConfig {
  enabled?: boolean
  env?: Record<string, string>
  permissionMode?: CodexPermissionMode
  disposeGraceMs?: number
}

interface ClaudeConfig {
  enabled?: boolean
  env?: Record<string, string>
  permissionMode?: ClaudePermissionMode
  disposeGraceMs?: number
}

/** Deployment configuration for provider homes, permissions, and process release. */
export interface Config {
  dshHome?: string
  storageRoot?: string
  codex?: CodexConfig
  claudeCode?: ClaudeConfig
}

export const Config: z<Config> = z.object({
  dshHome: z.string(),
  storageRoot: z.string(),
  codex: z.object({
    enabled: z.boolean().default(true),
    env: z.dict(z.string()).default({}),
    permissionMode: z.union(['never', 'dangerously-bypass-approvals-and-sandbox'] as const).default('never'),
    disposeGraceMs: z.number().default(3_000),
  }),
  claudeCode: z.object({
    enabled: z.boolean().default(true),
    env: z.dict(z.string()).default({}),
    permissionMode: z.union(['dontAsk', 'bypassPermissions'] as const).default('dontAsk'),
    disposeGraceMs: z.number().default(3_000),
  }),
})

function grace(value: number | undefined, field: string): number {
  const resolved = value ?? 3_000
  if (!Number.isFinite(resolved) || resolved <= 0) {
    throw new Error(`native-agents: ${field} must be a positive finite number`)
  }
  return resolved
}

/** Register the two persistent native LLM routes. */
export function apply(ctx: Context, config: Config = {}): void {
  const root = config.storageRoot === undefined
    ? join(resolveDshHome(config.dshHome), 'native-agents')
    : resolve(config.storageRoot)
  const store = new BindingStore(root)
  const resolveCwd = (sessionId: string): string => {
    const cwd = ctx.agents.get(SessionId(sessionId))?.session.header.cwd
    if (cwd === undefined) {
      throw new NativeAgentError(
        'NATIVE_CWD_REQUIRED',
        `native-agents: DSH session ${JSON.stringify(sessionId)} has no live working directory`,
      )
    }
    return cwd
  }

  if (config.codex?.enabled ?? true) {
    const provider = new CodexProvider({
      permissionMode: config.codex?.permissionMode ?? 'never',
      env: config.codex?.env ?? {},
      graceMs: grace(config.codex?.disposeGraceMs, 'codex.disposeGraceMs'),
      resolveExecutable: (command, env, signal) => ctx.subprocess.resolveExecutable(command, env, signal),
      spawn: spec => ctx.subprocess.spawn(spec),
    })
    const registry = new NativeRuntimeRegistry(provider, store)
    ctx.effect(() => async () => { await registry.closeAll() }, 'native-agents: close Codex runtimes')
    ctx.llm.registerAdapter(['native-codex'], new NativeLlmAdapter({
      route: 'native-codex',
      provider,
      registry,
      resolveCwd,
    }))
  }

  if (config.claudeCode?.enabled ?? true) {
    const provider = new ClaudeProvider({
      permissionMode: config.claudeCode?.permissionMode ?? 'dontAsk',
      env: config.claudeCode?.env ?? {},
      graceMs: grace(config.claudeCode?.disposeGraceMs, 'claudeCode.disposeGraceMs'),
      resolveExecutable: (command, env, signal) => ctx.subprocess.resolveExecutable(command, env, signal),
      spawn: spec => ctx.subprocess.spawn(spec),
    })
    const registry = new NativeRuntimeRegistry(provider, store)
    ctx.effect(() => async () => { await registry.closeAll() }, 'native-agents: close Claude runtimes')
    ctx.llm.registerAdapter(['native-claude-code'], new NativeLlmAdapter({
      route: 'native-claude-code',
      provider,
      registry,
      resolveCwd,
    }))
  }
}
