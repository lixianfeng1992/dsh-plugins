import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { SkillHubSynchronizer } from './sync.js'
import type { SkillHubConfig } from './types.js'

export const name = 'dsh-skill-hub'
export const provide = 'skillHub'
export const inject = ['settings', 'connection']
export const SETTINGS_NAMESPACE = 'skill-hub'
export const Config = z.object({
  repositoryUrl: z.string().default(''),
})
export function apply(ctx: Context, config?: SkillHubConfig) {
  const resolvedConfig = config ?? { repositoryUrl: '' }
  const service = new SkillHubSynchronizer(resolvedConfig)
  let activeConfig: SkillHubConfig = resolvedConfig
  let settingsScope: any
  ctx.provide('skillHub', service)
  ctx.inject(['settings', 'connection'] as any, (services: any) => {
    settingsScope = services.settings.register(SETTINGS_NAMESPACE, Config, { base: resolvedConfig })
    activeConfig = { ...resolvedConfig, ...settingsScope.get() }
    service.configure(activeConfig)
    settingsScope.watch((next: SkillHubConfig) => {
      activeConfig = { ...resolvedConfig, ...next }
      service.configure(activeConfig)
    })
    services.effect(() => services.connection.rpc.handle('/skill-hub', async (endpoint: string, payload: any) => {
      if (endpoint === 'initialize') {
        if (typeof payload?.repositoryUrl !== 'string') return { ok: false, error: { code: 'bad-request', message: 'repositoryUrl must be a string', details: { issues: [] } } }
        if (!settingsScope) return { ok: false, error: { code: 'internal', message: 'settings service is unavailable', details: {} } }
        const operationId = service.startInitialize(payload.repositoryUrl, () => settingsScope.update({ repositoryUrl: payload.repositoryUrl.trim() }))
        return { ok: true, value: { operationId } }
      }
      if (endpoint === 'progress') return { ok: true, value: service.getProgress(typeof payload?.operationId === 'string' ? payload.operationId : undefined) }
      return { ok: false, error: { code: 'bad-request', message: `unknown Skill Hub endpoint: ${endpoint}`, details: { issues: [] } } }
    }, { authority: 'loopback' }), 'dsh-skill-hub: host RPC')
  })
  // SessionStart is always wired; an absent settings section is a normal first-run state.
  ctx.on('agent/session-start' as any, () => {
    if (!activeConfig.repositoryUrl.trim()) return
    void service.sync().catch(error => ctx.logger(name).warn(`sync failed: ${String(error)}`))
  })
}
