import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { Pool, type PoolConfig } from 'pg'
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'

const execFileAsync = promisify(execFile)

export interface SessionReportingConfig {
  readonly connectionString: string
  readonly userId: string
}

export interface RepositoryBinding {
  readonly canonicalRemote: string
  readonly rootPath: string
}

function canonicalRemote(remote: string): string {
  const value = remote.trim().replace(/\.git$/u, '')
  const scp = value.match(/^[^@]+@([^:]+):(.+)$/u)
  if (scp !== null) return `${scp[1]}/${scp[2]}`
  const url = new URL(value)
  return `${url.host}/${url.pathname.replace(/^\//u, '')}`
}

export async function resolveRepository(cwd: string): Promise<RepositoryBinding | undefined> {
  try {
    const root = (await execFileAsync('git', ['-C', cwd, 'rev-parse', '--show-toplevel'])).stdout.trim()
    const remote = (await execFileAsync('git', ['-C', cwd, 'remote', 'get-url', 'origin'])).stdout.trim()
    return { canonicalRemote: canonicalRemote(remote), rootPath: root }
  } catch {
    return undefined
  }
}

export class SessionReporter {
  readonly pool: Pool
  private readonly tails = new Map<string, Promise<void>>()
  private readonly repositories = new Map<string, Promise<RepositoryBinding | undefined>>()
  private initPromise: Promise<void> | undefined

  constructor(private readonly config: SessionReportingConfig, poolConfig?: PoolConfig) {
    this.pool = new Pool({ connectionString: config.connectionString, ...poolConfig })
  }

  async initialize(): Promise<void> {
    if (this.initPromise !== undefined) return this.initPromise
    this.initPromise = this.initializeSchema()
    return this.initPromise
  }

  private async initializeSchema(): Promise<void> {
    const fs = await import('node:fs/promises')
    const path = new URL('../schema.sql', import.meta.url)
    await this.pool.query(await fs.readFile(path, 'utf8'))
    await this.pool.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'reporting_session_events' AND column_name = 'event' AND data_type = 'jsonb'
        ) THEN
          ALTER TABLE reporting_session_events ALTER COLUMN event TYPE text USING event::text;
        END IF;
      END $$;
    `)
  }

  enqueue(session: Session, event: SessionEvent): Promise<void> {
    const previous = this.tails.get(session.id) ?? Promise.resolve()
    const next = previous.then(() => this.append(session, event))
      .finally(() => {
        if (this.tails.get(session.id) === next) this.tails.delete(session.id)
      })
    this.tails.set(session.id, next)
    return next
  }

  private async append(session: Session, event: SessionEvent): Promise<void> {
    if (session.header.origin === 'subagent') return
    await this.initialize()
    const cwd = session.header.cwd ?? process.cwd()
    let repoPromise = this.repositories.get(session.id)
    if (repoPromise === undefined) {
      repoPromise = resolveRepository(cwd)
      this.repositories.set(session.id, repoPromise)
    }
    const repo = await repoPromise
    if (repo === undefined) return
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      await client.query('INSERT INTO reporting_users (id) VALUES ($1) ON CONFLICT DO NOTHING', [this.config.userId])
      await client.query(
        `INSERT INTO reporting_sessions (id, user_id, canonical_remote, repo_root_path, created_at, cwd, parent_session, seed_length, header)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (id) DO UPDATE SET updated_at = now()`,
        [session.id, this.config.userId, repo.canonicalRemote, repo.rootPath, session.header.createdAt,
          session.header.cwd ?? repo.rootPath, session.header.parentSession ?? null, session.header.seedLength ?? null,
          session.header],
      )
      await client.query(
        'INSERT INTO reporting_session_events (session_id, seq, type, event_time, event) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (session_id, seq) DO NOTHING',
        [session.id, event.seq, event.type, event.time, JSON.stringify(event)],
      )
      await client.query('UPDATE reporting_sessions SET last_seq = GREATEST(last_seq, $2), updated_at = now() WHERE id = $1', [session.id, event.seq])
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined)
      throw error
    } finally {
      client.release()
    }
  }

  async close(): Promise<void> {
    await Promise.all(this.tails.values())
    await this.pool.end()
  }

  async listSessions(): Promise<unknown[]> {
    const result = await this.pool.query(
      `SELECT s.id, s.user_id, s.canonical_remote, s.created_at, s.cwd, s.last_seq,
              s.updated_at,
              count(e.seq)::int AS event_count
       FROM reporting_sessions s
       LEFT JOIN reporting_session_events e ON e.session_id = s.id
       WHERE COALESCE(s.header->>'origin', '') <> 'subagent'
       GROUP BY s.id ORDER BY s.updated_at DESC`,
    )
    return result.rows
  }

  async listEvents(sessionId: string): Promise<unknown[]> {
    const result = await this.pool.query(
      'SELECT session_id, seq, type, event_time, event FROM reporting_session_events WHERE session_id = $1 ORDER BY seq',
      [sessionId],
    )
    return result.rows
  }
}
