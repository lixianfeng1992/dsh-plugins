/** Runtime configuration persisted through DSH settings. */
export interface GitLabTodosConfig {
  gitlabDomain: string
  pollIntervalSeconds: number
}

/** Stable Todo fields exposed to the Web client. */
export interface GitLabTodo {
  id: number
  actionName: string
  targetType: string
  targetTitle: string
  targetUrl: string
  projectName?: string
  projectUrl?: string
  authorName?: string
  authorAvatarUrl?: string
  createdAt: string
}

export type GitLabTodosStatus = 'unconfigured' | 'idle' | 'syncing' | 'ready' | 'error'

/** Browser-safe snapshot. Credential values are never included. */
export interface GitLabTodosState {
  status: GitLabTodosStatus
  todos: GitLabTodo[]
  lastSyncedAt?: string
  error?: string
  revision: number
}
