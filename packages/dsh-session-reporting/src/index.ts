import type { Context } from '@deepseek-ai/cordis'
import { getOrCreateAnonymousUserId } from '@deepseek-ai/dsh-anonymous-user-id'
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'
import { SessionReporter, type SessionReportingConfig } from './reporter.js'

export const name = 'dsh-session-reporting'
export const provide = 'sessionReporter'
export const inject = ['connection']
/** Local PostgreSQL endpoint used by the prototype bundle. */
export const DEFAULT_DATABASE_URL = 'postgresql://dsh:dsh@localhost:5432/dsh_reporting'

export function apply(ctx: Context): void {
  const reporter = new SessionReporter({
    connectionString: DEFAULT_DATABASE_URL,
    userId: getOrCreateAnonymousUserId(),
  })
  void reporter.initialize().catch((error: unknown) => ctx.logger.warn(`session reporting database init failed: ${String(error)}`))
  ctx.on('session/event', (session: Session, event: SessionEvent) => {
    void reporter.enqueue(session, event).catch((error: unknown) => ctx.logger.warn(`session reporting append failed: ${String(error)}`))
  })
  ctx.inject(['connection'] as any, (services: any) => services.connection.rpc.handle('/session-reporting', async (endpoint: string, payload: unknown) => {
    if (endpoint === 'sessions') return { ok: true, value: await reporter.listSessions() }
    if (endpoint === 'events' && typeof payload === 'object' && payload !== null && typeof (payload as { sessionId?: unknown }).sessionId === 'string') {
      return { ok: true, value: await reporter.listEvents((payload as { sessionId: string }).sessionId) }
    }
    return { ok: false, error: { code: 'bad-request', message: 'unknown session reporting endpoint' } }
  }, { authority: 'loopback' }))
  ctx.provide('sessionReporter', reporter)
  ctx.effect(() => async () => { await reporter.close() }, 'dsh-session-reporting')
}

export { SessionReporter, resolveRepository } from './reporter.js'
export type { RepositoryBinding, SessionReportingConfig } from './reporter.js'
