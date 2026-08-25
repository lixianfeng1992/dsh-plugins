import { describe, expect, it, vi } from 'vitest'
import { apply, isCoordinatorRelay, NativeContextNodeView } from '../src/client/index.js'

describe('native agent client presentation', () => {
  it('recognizes only coordinator relay sources', () => {
    expect(isCoordinatorRelay({
      kind: 'coordinator',
      form: 'relay',
      senderSessionId: 'parent' as never,
    })).toBe(true)
    expect(isCoordinatorRelay({ kind: 'user' })).toBe(false)
    expect(isCoordinatorRelay({ kind: 'plugin', plugin: 'fixture' })).toBe(false)
  })

  it('shadows the generic context renderer at a lower priority', () => {
    const register = vi.fn(() => () => {})
    const inject = vi.fn((_key: string, install: () => unknown) => {
      install()
      return () => {}
    })
    apply({ slots: { inject, register } } as never)

    expect(inject).toHaveBeenCalledWith('conversation.chat.node', expect.any(Function))
    expect(register).toHaveBeenCalledWith({
      name: 'conversation.chat.node',
      key: 'context',
      priority: -100,
      registrant: 'dsh-native-agents',
    }, NativeContextNodeView)
  })
})
