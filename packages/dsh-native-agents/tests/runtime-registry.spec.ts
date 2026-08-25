import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { BindingStore } from '../src/binding-store.js'
import type { NativeProvider, NativeRuntime } from '../src/native.js'
import { NativeRuntimeRegistry } from '../src/runtime-registry.js'

describe('NativeRuntimeRegistry', () => {
  it('closes every cached resident runtime on disposal', async () => {
    const root = await mkdtemp(join(tmpdir(), 'native-agents-'))
    const runtime = {
      provider: 'codex',
      nativeId: 'native-1',
      setModel: vi.fn(async () => {}),
      runTurn: vi.fn(),
      interrupt: vi.fn(async () => {}),
      close: vi.fn(async () => {}),
    } satisfies NativeRuntime
    const provider: NativeProvider = {
      id: 'codex',
      route: 'native-codex',
      displayName: 'Codex (Local)',
      discover: async () => ({ state: 'available' }),
      fetchCatalog: async () => ({ models: [{ id: 'default', name: 'Native default' }] }),
      create: vi.fn(async () => runtime),
      resume: vi.fn(),
    }
    const registry = new NativeRuntimeRegistry(provider, new BindingStore(root))
    await registry.resolve({
      dshSessionId: 'child',
      cwd: '/work',
      allowCreate: true,
      signal: new AbortController().signal,
    })

    await registry.closeAll()

    expect(runtime.close).toHaveBeenCalledOnce()
    await expect(registry.resolve({
      dshSessionId: 'child',
      cwd: '/work',
      allowCreate: false,
      signal: new AbortController().signal,
    })).rejects.toMatchObject({ code: 'NATIVE_RUNTIME_CLOSED' })
  })

  it('passes a runtime tool lease to the provider and revokes it on close', async () => {
    const root = await mkdtemp(join(tmpdir(), 'native-agents-'))
    const closeLease = vi.fn()
    const runtime = {
      provider: 'codex',
      nativeId: 'native-tools',
      setModel: vi.fn(async () => {}),
      runTurn: vi.fn(),
      interrupt: vi.fn(async () => {}),
      close: vi.fn(async () => {}),
    } satisfies NativeRuntime
    const provider: NativeProvider = {
      id: 'codex',
      route: 'native-codex',
      displayName: 'Codex (Local)',
      discover: async () => ({ state: 'available' }),
      fetchCatalog: async () => ({ models: [] }),
      create: vi.fn(async () => runtime),
      resume: vi.fn(),
    }
    const registry = new NativeRuntimeRegistry(provider, new BindingStore(root), async () => ({
      connection: { url: 'http://127.0.0.1:1234/mcp', authorization: 'Bearer secret' },
      close: closeLease,
    }))

    await registry.resolve({
      dshSessionId: 'child-tools',
      cwd: '/work',
      allowCreate: true,
      signal: new AbortController().signal,
    })
    expect(provider.create).toHaveBeenCalledWith(expect.objectContaining({
      tools: { url: 'http://127.0.0.1:1234/mcp', authorization: 'Bearer secret' },
    }))

    await registry.releaseAll()
    expect(runtime.close).toHaveBeenCalledOnce()
    expect(closeLease).toHaveBeenCalledOnce()
  })
})
