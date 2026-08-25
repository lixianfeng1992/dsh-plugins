import { describe, expect, it, vi } from 'vitest'
import { TodoStore } from '../src/client/index.js'

describe('TodoStore manual refresh', () => {
  it('publishes syncing immediately and stays there until RPC completes', async () => {
    let complete: ((value: unknown) => void) | undefined
    const rpc = {
      call: vi.fn().mockImplementation(() => new Promise(resolve => { complete = resolve })),
    }
    const store = new TodoStore(rpc)

    const refresh = store.refresh()

    expect(store.getSnapshot().status).toBe('syncing')
    expect(rpc.call).toHaveBeenCalledWith('/gitlab-todos', 'refresh', {})
    complete?.({
      ok: true,
      value: { status: 'ready', todos: [], revision: 1, lastSyncedAt: '2026-08-24T07:00:00.000Z' },
    })
    await refresh
    expect(store.getSnapshot().status).toBe('ready')
  })
})
