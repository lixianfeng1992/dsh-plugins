import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { BindingStore } from '../src/binding-store.js'

describe('BindingStore', () => {
  it('stores an opaque session id below the binding root', async () => {
    const root = await mkdtemp(join(tmpdir(), 'native-agents-'))
    const store = new BindingStore(root)

    await store.create({
      dshSessionId: '../../escape',
      provider: 'codex',
      cwd: '/work/project',
    })

    const binding = await store.read('../../escape')
    expect(binding).toMatchObject({ state: 'creating', dshSessionId: '../../escape' })
    expect(store.pathFor('../../escape').startsWith(join(root, 'bindings'))).toBe(true)
    expect(JSON.parse(await readFile(store.pathFor('../../escape'), 'utf8'))).toEqual(binding)
  })

  it('moves a creating binding to ready without replacing an existing binding', async () => {
    const root = await mkdtemp(join(tmpdir(), 'native-agents-'))
    const store = new BindingStore(root)
    await store.create({ dshSessionId: 'child', provider: 'claude-code', cwd: '/work' })

    await store.markReady('child', 'claude-code', 'native-1')

    await expect(store.create({ dshSessionId: 'child', provider: 'claude-code', cwd: '/work' }))
      .rejects.toThrow('already exists')
    await expect(store.readReady('child', 'claude-code', '/work'))
      .resolves.toMatchObject({ state: 'ready', nativeId: 'native-1' })
  })

  it('fails loudly for malformed and incomplete bindings', async () => {
    const root = await mkdtemp(join(tmpdir(), 'native-agents-'))
    const store = new BindingStore(root)
    await store.create({ dshSessionId: 'child', provider: 'codex', cwd: '/work' })

    await expect(store.readReady('child', 'codex', '/work'))
      .rejects.toMatchObject({ code: 'NATIVE_CREATION_INCOMPLETE' })
    await expect(store.readReady('child', 'claude-code', '/work'))
      .rejects.toMatchObject({ code: 'NATIVE_BINDING_CORRUPT' })
  })
})
