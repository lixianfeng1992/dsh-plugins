import { join, resolve } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import { SessionId } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-subagent'
import type {} from '@deepseek-ai/dsh-subprocess'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import z from '@deepseek-ai/schemastery'
import { NativeLlmAdapter } from './adapter.js'
import { BindingStore } from './binding-store.js'
import { ClaudeProvider, type ClaudePermissionMode } from './claude-provider.js'
import { CodexProvider, type CodexPermissionMode } from './codex-provider.js'
import { NativeAgentError } from './error.js'
import { NativeRuntimeRegistry } from './runtime-registry.js'
import { NativeSubagentController, NativeToolHost } from './native-tools.js'

export const name = 'native-agents'
export const inject = ['agents', 'llm', 'settings', 'subagents', 'subprocess']

const SETTINGS_NAMESPACE = settingsNamespace('native-agents')

interface NativeAgentsSettings {
  providers: {
    'native-codex': { enabled: boolean }
    'native-claude-code': { enabled: boolean }
  }
}

const NativeAgentsSettingsSchema: z<NativeAgentsSettings> = z.object({
  providers: z.object({
    'native-codex': z.object({ enabled: z.boolean() }),
    'native-claude-code': z.object({ enabled: z.boolean() }),
  }),
})

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

interface NativeToolsConfig {
  enabled?: boolean
  subagentProvider?: string
  maxDepth?: number
}

/** Deployment configuration for provider homes, permissions, and process release. */
export interface Config {
  dshHome?: string
  storageRoot?: string
  codex?: CodexConfig
  claudeCode?: ClaudeConfig
  nativeTools?: NativeToolsConfig
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
  nativeTools: z.object({
    enabled: z.boolean().default(true),
    subagentProvider: z.string().default('spawn'),
    maxDepth: z.number().default(3),
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
  const maxDepth = config.nativeTools?.maxDepth ?? 3
  if (!Number.isSafeInteger(maxDepth) || maxDepth < 0) {
    throw new Error('native-agents: nativeTools.maxDepth must be a non-negative safe integer')
  }
  const enabledRoutes = new Set<string>()
  const toolHost = config.nativeTools?.enabled === false
    ? undefined
    : new NativeToolHost(new NativeSubagentController(ctx, {
        provider: config.nativeTools?.subagentProvider ?? 'spawn',
        maxDepth,
        isNativeRouteEnabled: route => enabledRoutes.has(route),
      }))
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

  const codex = new CodexProvider({
    permissionMode: config.codex?.permissionMode ?? 'never',
    env: config.codex?.env ?? {},
    graceMs: grace(config.codex?.disposeGraceMs, 'codex.disposeGraceMs'),
    resolveExecutable: (command, env, signal) => ctx.subprocess.resolveExecutable(command, env, signal),
    spawn: spec => ctx.subprocess.spawn(spec),
  })
  const claudeCode = new ClaudeProvider({
    permissionMode: config.claudeCode?.permissionMode ?? 'dontAsk',
    env: config.claudeCode?.env ?? {},
    graceMs: grace(config.claudeCode?.disposeGraceMs, 'claudeCode.disposeGraceMs'),
    resolveExecutable: (command, env, signal) => ctx.subprocess.resolveExecutable(command, env, signal),
    spawn: spec => ctx.subprocess.spawn(spec),
  })

  const providers = [codex, claudeCode].map((provider) => {
    const registry = new NativeRuntimeRegistry(
      provider,
      store,
      toolHost === undefined ? undefined : sessionId => toolHost.acquire(sessionId),
    )
    const adapter = new NativeLlmAdapter({
      route: provider.route,
      provider,
      registry,
      resolveCwd,
    })
    return {
      provider,
      registry,
      adapter,
      registration: undefined as undefined | { replace(routes: string[]): void },
      enabled: false,
    }
  })

  ctx.llm.registerConfigurableProviders(providers.map(({ provider }) => ({
    provider: provider.route,
    displayName: provider.displayName,
    settingsNs: SETTINGS_NAMESPACE,
    settingsPath: ['providers', provider.route],
    declared: false,
  })))

  const settings = ctx.settings.register(SETTINGS_NAMESPACE, NativeAgentsSettingsSchema, {
    base: {
      providers: {
        'native-codex': { enabled: config.codex?.enabled ?? true },
        'native-claude-code': { enabled: config.claudeCode?.enabled ?? true },
      },
    },
    applies: 'live',
  })

  const enable = (entry: typeof providers[number]): void => {
    if (entry.enabled) return
    if (entry.registration === undefined) {
      entry.registration = ctx.llm.registerAdapter([entry.provider.route], entry.adapter)
    } else {
      entry.registration.replace([entry.provider.route])
    }
    entry.enabled = true
    enabledRoutes.add(entry.provider.route)
  }
  const disable = async (entry: typeof providers[number]): Promise<void> => {
    if (!entry.enabled) return
    entry.registration?.replace([])
    entry.enabled = false
    enabledRoutes.delete(entry.provider.route)
    await entry.registry.releaseAll()
  }
  const desired = (value: NativeAgentsSettings, route: string): boolean =>
    value.providers[route as keyof NativeAgentsSettings['providers']].enabled

  for (const entry of providers) {
    if (desired(settings.get(), entry.provider.route)) enable(entry)
    ctx.effect(() => async () => { await entry.registry.closeAll() }, `native-agents: close ${entry.provider.id} runtimes`)
  }
  if (toolHost !== undefined) {
    ctx.effect(() => async () => { await toolHost.close() }, 'native-agents: close native tool host')
  }

  let reconciliation = Promise.resolve()
  ctx.effect(() => settings.watch((next) => {
    reconciliation = reconciliation.then(async () => {
      for (const entry of providers) {
        if (desired(next, entry.provider.route)) enable(entry)
        else await disable(entry)
      }
    })
    return reconciliation
  }), 'native-agents: provider enablement')
}
