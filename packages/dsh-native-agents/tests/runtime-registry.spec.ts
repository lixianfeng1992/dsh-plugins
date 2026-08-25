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
      runTurn: vi.fn(),
      interrupt: vi.fn(async () => {}),
      close: vi.fn(async () => {}),
    } satisfies NativeRuntime
    const provider: NativeProvider = {
      id: 'codex',
      displayName: 'Native Codex',
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
})
