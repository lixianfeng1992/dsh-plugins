import type { Context } from '@deepseek-ai/cordis'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import z from '@deepseek-ai/schemastery'
import { GitLabTodosSynchronizer } from './sync.js'
import type { GitLabTodosConfig } from './types.js'

export const name = 'dsh-gitlab-todos'
export const provide = 'gitLabTodos'
export const inject = ['settings', 'credentials', 'connection']
export const SETTINGS_NAMESPACE = 'gitlab-todos'
export const TOKEN_REF = credentialRef('GITLAB_PERSONAL_ACCESS_TOKEN')
export const DEFAULT_CONFIG: GitLabTodosConfig = {
  gitlabDomain: 'https://gitlab.com',
  pollIntervalSeconds: 60,
}
export const Config = z.object({
  gitlabDomain: z.string().default(DEFAULT_CONFIG.gitlabDomain),
  pollIntervalSeconds: z.number().step(1).min(15).max(86_400).default(DEFAULT_CONFIG.pollIntervalSeconds),
})

function badRequest(message: string) {
  return { ok: false, error: { code: 'bad-request', message, details: { issues: [] } } }
}

/** Register GitLab Todo polling, settings and loopback RPC. */
export function apply(ctx: Context, config?: Partial<GitLabTodosConfig>): void {
  const base = { ...DEFAULT_CONFIG, ...config }
  ctx.inject(['settings', 'credentials', 'connection'] as any, (services: any) => {
    const scope = services.settings.register(SETTINGS_NAMESPACE, Config, { base })
    let activeConfig: GitLabTodosConfig = { ...base, ...scope.get() }
    const synchronizer = new GitLabTodosSynchronizer(activeConfig, {
      tokenProvider: {
        resolve: async () => (await services.credentials.resolve(TOKEN_REF))?.value,
      },
    })
    services.provide('gitLabTodos', synchronizer)

    let timer: ReturnType<typeof setInterval> | undefined
    const restartTimer = (): void => {
      if (timer !== undefined) clearInterval(timer)
      timer = setInterval(() => {
        void synchronizer.refresh().catch((error: unknown) => services.logger(name).warn(`refresh failed: ${String(error)}`))
      }, activeConfig.pollIntervalSeconds * 1_000)
    }
    restartTimer()
    void synchronizer.refresh()

    const unwatch = scope.watch((next: GitLabTodosConfig) => {
      activeConfig = { ...base, ...next }
      synchronizer.configure(activeConfig)
      restartTimer()
      void synchronizer.refreshAfterCurrent()
    })

    services.effect(() => services.connection.rpc.handle('/gitlab-todos', async (endpoint: string, payload: any) => {
      switch (endpoint) {
        case 'state':
          return { ok: true, value: synchronizer.getState() }
        case 'refresh':
          return { ok: true, value: await synchronizer.refresh() }
        case 'token/describe':
          return { ok: true, value: await services.credentials.describe(TOKEN_REF) }
        case 'token/set': {
          if (typeof payload?.token !== 'string' || payload.token.trim() === '') return badRequest('token must be a non-empty string')
          await services.credentials.set(TOKEN_REF, payload.token.trim())
          return { ok: true, value: await synchronizer.refreshAfterCurrent() }
        }
        case 'token/unset':
          await services.credentials.unset(TOKEN_REF)
          return { ok: true, value: await synchronizer.refreshAfterCurrent() }
        default:
          return badRequest(`unknown GitLab Todos endpoint: ${endpoint}`)
      }
    }, { authority: 'loopback' }), 'dsh-gitlab-todos: host RPC')

    services.effect(() => () => {
      if (timer !== undefined) clearInterval(timer)
      unwatch?.()
    }, 'dsh-gitlab-todos: polling timer')
  })
}
