import { describe, expect, it, vi } from 'vitest'
import { GitLabTodosSynchronizer } from '../src/sync.js'
import type { GitLabTodo } from '../src/types.js'

const config = { gitlabDomain: 'https://gitlab.example', pollIntervalSeconds: 60 }
const todo: GitLabTodo = {
  id: 1,
  actionName: 'assigned',
  targetType: 'Issue',
  targetTitle: 'Fix it',
  targetUrl: 'https://gitlab.example/issue/1',
  createdAt: '2026-08-24T01:00:00.000Z',
}

describe('GitLabTodosSynchronizer', () => {
  it('reports missing PAT as unconfigured', async () => {
    const synchronizer = new GitLabTodosSynchronizer(config, {
      tokenProvider: { resolve: vi.fn().mockResolvedValue(undefined) },
    })
    expect(await synchronizer.refresh()).toMatchObject({ status: 'unconfigured', todos: [] })
  })

  it('coalesces concurrent refreshes', async () => {
    let release: ((value: GitLabTodo[]) => void) | undefined
    const fetchTodos = vi.fn().mockImplementation(() => new Promise<GitLabTodo[]>(resolve => { release = resolve }))
    const synchronizer = new GitLabTodosSynchronizer(config, {
      tokenProvider: { resolve: vi.fn().mockResolvedValue('token') },
      fetchTodos,
      now: () => new Date('2026-08-24T02:00:00.000Z'),
    })
    const first = synchronizer.refresh()
    const second = synchronizer.refresh()
    await vi.waitFor(() => { expect(fetchTodos).toHaveBeenCalledOnce() })
    release?.([todo])
    await expect(first).resolves.toMatchObject({ status: 'ready', todos: [todo] })
    await expect(second).resolves.toMatchObject({ status: 'ready', todos: [todo] })
  })

  it('retains stale Todos when a later refresh fails', async () => {
    const fetchTodos = vi.fn().mockResolvedValueOnce([todo]).mockRejectedValueOnce(new Error('network down'))
    const synchronizer = new GitLabTodosSynchronizer(config, {
      tokenProvider: { resolve: vi.fn().mockResolvedValue('token') }, fetchTodos,
    })
    await synchronizer.refresh()
    expect(await synchronizer.refresh()).toMatchObject({ status: 'error', todos: [todo], error: 'network down' })
  })

  it('runs again after an operation that started with an older credential', async () => {
    let token: string | undefined
    let release: (() => void) | undefined
    const firstTokenRead = new Promise<void>(resolve => { release = resolve })
    const tokenProvider = {
      resolve: vi.fn().mockImplementation(async () => {
        const current = token
        if (tokenProvider.resolve.mock.calls.length === 1) await firstTokenRead
        return current
      }),
    }
    const fetchTodos = vi.fn().mockResolvedValue([todo])
    const synchronizer = new GitLabTodosSynchronizer(config, { tokenProvider, fetchTodos })
    const oldRefresh = synchronizer.refresh()
    token = 'new-token'
    const latestRefresh = synchronizer.refreshAfterCurrent()
    release?.()
    await expect(oldRefresh).resolves.toMatchObject({ status: 'unconfigured' })
    await expect(latestRefresh).resolves.toMatchObject({ status: 'ready', todos: [todo] })
    expect(fetchTodos).toHaveBeenCalledWith(expect.objectContaining({ token: 'new-token' }))
  })
})
