import { describe, expect, it, vi } from 'vitest'
import { apply, NativeAgentsPage } from '../src/client/index.js'

describe('native agent settings client', () => {
  it('contributes one Native Agents settings section', () => {
    const register = vi.fn(() => () => {})
    const inject = vi.fn((_key: string, install: () => unknown) => {
      install()
      return () => {}
    })
    const off = vi.fn()
    const context = {
      get: vi.fn(() => ({ api: {} })),
      slots: { inject, register },
      conversationEvents: { register: vi.fn() },
      remote: { $on: vi.fn(() => off) },
      on: vi.fn(() => off),
      effect: vi.fn((install: () => unknown) => install()),
    }

    apply(context as never)

    expect(inject).toHaveBeenCalledWith('settings.section', expect.any(Function))
    expect(register).toHaveBeenCalledWith(expect.objectContaining({
      name: 'settings.section',
      id: 'native-agents',
      order: 15,
    }), NativeAgentsPage)
  })
})
