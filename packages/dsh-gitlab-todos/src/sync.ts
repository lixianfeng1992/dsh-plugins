import { fetchPendingTodos } from './gitlab.js'
import type { GitLabTodosConfig, GitLabTodosState } from './types.js'

export interface GitLabTokenProvider {
  resolve(): Promise<string | undefined>
}

export interface GitLabTodosSynchronizerOptions {
  tokenProvider: GitLabTokenProvider
  fetchTodos?: typeof fetchPendingTodos
  now?: () => Date
}

/** Owns polling state and coalesces overlapping refresh requests. */
export class GitLabTodosSynchronizer {
  private config: GitLabTodosConfig
  private readonly tokenProvider: GitLabTokenProvider
  private readonly fetchTodos: typeof fetchPendingTodos
  private readonly now: () => Date
  private inFlight?: Promise<GitLabTodosState>
  private state: GitLabTodosState = { status: 'idle', todos: [], revision: 0 }

  constructor(config: GitLabTodosConfig, options: GitLabTodosSynchronizerOptions) {
    this.config = config
    this.tokenProvider = options.tokenProvider
    this.fetchTodos = options.fetchTodos ?? fetchPendingTodos
    this.now = options.now ?? (() => new Date())
  }

  configure(config: GitLabTodosConfig): void {
    this.config = config
  }

  getState(): GitLabTodosState {
    return { ...this.state, todos: [...this.state.todos] }
  }

  refresh(): Promise<GitLabTodosState> {
    if (this.inFlight !== undefined) return this.inFlight
    const operation = this.runRefresh()
    this.inFlight = operation
    void operation.finally(() => {
      if (this.inFlight === operation) this.inFlight = undefined
    })
    return operation
  }

  /** Wait for an older operation, then run against the latest config and credential. */
  async refreshAfterCurrent(): Promise<GitLabTodosState> {
    const current = this.inFlight
    if (current !== undefined) await current
    return this.refresh()
  }

  private async runRefresh(): Promise<GitLabTodosState> {
    this.state = { ...this.state, status: 'syncing', error: undefined, revision: this.state.revision + 1 }
    try {
      const token = await this.tokenProvider.resolve()
      if (token === undefined || token.trim() === '') {
        this.state = { ...this.state, status: 'unconfigured', todos: [], error: undefined, revision: this.state.revision + 1 }
        return this.getState()
      }
      const todos = await this.fetchTodos({ domain: this.config.gitlabDomain, token })
      this.state = {
        status: 'ready',
        todos,
        lastSyncedAt: this.now().toISOString(),
        revision: this.state.revision + 1,
      }
    } catch (error) {
      this.state = {
        ...this.state,
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
        revision: this.state.revision + 1,
      }
    }
    return this.getState()
  }
}
