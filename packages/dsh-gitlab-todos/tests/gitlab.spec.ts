import { describe, expect, it, vi } from 'vitest'
import { fetchPendingTodos, parseGitLabTodo } from '../src/gitlab.js'

function rawTodo(id: number) {
  return {
    id,
    action_name: 'assigned',
    target_type: 'Issue',
    target: { title: `Issue ${id}`, web_url: `https://gitlab.example/group/project/-/issues/${id}` },
    project: { name_with_namespace: 'group / project', web_url: 'https://gitlab.example/group/project' },
    author: { name: 'Alex' },
    created_at: '2026-08-24T01:02:03.000Z',
  }
}

describe('parseGitLabTodo', () => {
  it('normalizes the browser DTO', () => {
    expect(parseGitLabTodo(rawTodo(7))).toEqual({
      id: 7,
      actionName: 'assigned',
      targetType: 'Issue',
      targetTitle: 'Issue 7',
      targetUrl: 'https://gitlab.example/group/project/-/issues/7',
      projectName: 'group / project',
      projectUrl: 'https://gitlab.example/group/project',
      authorName: 'Alex',
      authorAvatarUrl: undefined,
      createdAt: '2026-08-24T01:02:03.000Z',
    })
  })

  it('rejects malformed API objects', () => {
    expect(() => parseGitLabTodo({ id: 1 })).toThrow(/target/)
  })
})

describe('fetchPendingTodos', () => {
  it('paginates until a short page and sends the PAT header', async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) => rawTodo(index + 1))
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(firstPage), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([rawTodo(101)]), { status: 200 }))

    const todos = await fetchPendingTodos({
      domain: 'https://gitlab.example/',
      token: 'secret-token',
      fetchImpl,
    })

    expect(todos).toHaveLength(101)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    const [secondUrl] = fetchImpl.mock.calls[1] as [URL, RequestInit]
    expect(secondUrl.pathname).toBe('/api/v4/todos')
    expect(secondUrl.searchParams.get('page')).toBe('2')
    const [, init] = fetchImpl.mock.calls[0] as [URL, RequestInit]
    expect(init.headers).toMatchObject({ 'PRIVATE-TOKEN': 'secret-token' })
  })

  it('reports GitLab errors without leaking the token', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('unauthorized', { status: 401 }))
    await expect(fetchPendingTodos({
      domain: 'https://gitlab.example', token: 'secret-token', fetchImpl,
    })).rejects.toThrow('GitLab API 401: unauthorized')
  })
})
