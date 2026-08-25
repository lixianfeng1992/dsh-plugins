import type { GitLabTodo } from './types.js'

const PAGE_SIZE = 100

interface FetchTodosOptions {
  domain: string
  token: string
  signal?: AbortSignal
  fetchImpl?: typeof fetch
}

function requiredString(record: Record<string, unknown>, field: string): string {
  const value = record[field]
  if (typeof value !== 'string' || value.length === 0) throw new Error(`GitLab Todo field ${field} is invalid`)
  return value
}

function optionalString(record: Record<string, unknown> | undefined, field: string): string | undefined {
  const value = record?.[field]
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(`${label} is invalid`)
  return value as Record<string, unknown>
}

/** Validate and normalize one GitLab API Todo. */
export function parseGitLabTodo(value: unknown): GitLabTodo {
  const todo = record(value, 'GitLab Todo')
  const id = todo.id
  if (typeof id !== 'number' || !Number.isSafeInteger(id) || id < 0) throw new Error('GitLab Todo field id is invalid')
  const target = record(todo.target, 'GitLab Todo target')
  const project = todo.project === null || todo.project === undefined ? undefined : record(todo.project, 'GitLab Todo project')
  const author = todo.author === null || todo.author === undefined ? undefined : record(todo.author, 'GitLab Todo author')
  return {
    id,
    actionName: requiredString(todo, 'action_name'),
    targetType: requiredString(todo, 'target_type'),
    targetTitle: requiredString(target, 'title'),
    targetUrl: requiredString(target, 'web_url'),
    projectName: optionalString(project, 'name_with_namespace') ?? optionalString(project, 'name'),
    projectUrl: optionalString(project, 'web_url'),
    authorName: optionalString(author, 'name') ?? optionalString(author, 'username'),
    authorAvatarUrl: optionalString(author, 'avatar_url'),
    createdAt: requiredString(todo, 'created_at'),
  }
}

/** Fetch every pending Todo using page-size termination. */
export async function fetchPendingTodos(options: FetchTodosOptions): Promise<GitLabTodo[]> {
  const fetchImpl = options.fetchImpl ?? fetch
  const base = new URL(`${options.domain.replace(/\/+$/, '')}/`)
  const todos: GitLabTodo[] = []
  for (let page = 1; ; page += 1) {
    const url = new URL('api/v4/todos', base)
    url.searchParams.set('state', 'pending')
    url.searchParams.set('per_page', String(PAGE_SIZE))
    url.searchParams.set('page', String(page))
    const response = await fetchImpl(url, {
      headers: { 'PRIVATE-TOKEN': options.token, Accept: 'application/json' },
      signal: options.signal,
    })
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 240)
      throw new Error(`GitLab API ${response.status}${detail ? `: ${detail}` : ''}`)
    }
    const body: unknown = await response.json()
    if (!Array.isArray(body)) throw new Error('GitLab Todo response must be an array')
    todos.push(...body.map(parseGitLabTodo))
    if (body.length < PAGE_SIZE) return todos
  }
}
