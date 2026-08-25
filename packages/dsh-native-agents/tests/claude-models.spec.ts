import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { claudeCatalog } from '../src/claude-models.js'

describe('Claude model catalog', () => {
  it('filters by installed version and merges local settings models', async () => {
    const root = await mkdtemp(join(tmpdir(), 'native-claude-models-'))
    await writeFile(join(root, 'settings.json'), JSON.stringify({
      model: 'company-claude-model',
      env: { ANTHROPIC_DEFAULT_SONNET_MODEL: 'gateway-sonnet' },
    }))

    const catalog = await claudeCatalog('2.1.200', root)
    const ids = catalog.models.map(model => model.id)

    expect(ids).not.toContain('claude-opus-5')
    expect(ids).toContain('claude-fable-5')
    expect(ids).toContain('company-claude-model')
    expect(ids).toContain('gateway-sonnet')
  })
})
