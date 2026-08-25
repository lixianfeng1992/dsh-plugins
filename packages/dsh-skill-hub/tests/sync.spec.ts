import { describe, expect, it } from 'vitest'
import { parseRepositoryUrl } from '../src/repository.js'
import { apply } from '../src/plugin.js'
import { SkillHubSynchronizer } from '../src/sync.js'

describe('skill hub repository validation', () => {
  it('accepts GitHub and GitLab URLs and strips .git', () => { expect(parseRepositoryUrl('https://github.com/acme/team-skills.git')).toMatchObject({ name: 'team-skills', url: 'https://github.com/acme/team-skills.git' }); expect(parseRepositoryUrl('https://gitlab.com/acme/team-skills')).toMatchObject({ name: 'team-skills' }) })
  it('rejects unsupported or unsafe URLs', () => { expect(() => parseRepositoryUrl('http://github.com/acme/x')).toThrow('HTTPS'); expect(() => parseRepositoryUrl('https://example.com/acme/x')).toThrow('GitHub'); expect(() => parseRepositoryUrl('https://github.com/acme/../x')).toThrow() })
  it('registers SessionStart but skips silently without a settings section', () => { let listener: (() => void) | undefined; const on = (_event: string, callback: () => void) => { listener = callback }; const warn = () => { throw new Error('must not warn') }; expect(() => apply({ provide: () => undefined, on, logger: () => ({ warn }), inject: () => {} } as any)).not.toThrow(); expect(listener).toBeDefined(); expect(() => listener!()).not.toThrow() })

  it('reports validation progress for an asynchronous initialization', async () => {
    const service = new SkillHubSynchronizer({ repositoryUrl: '', dshHome: '/tmp/dsh-skill-hub-test' })
    const operationId = service.startInitialize('not-a-url', async () => undefined)
    await expect.poll(() => service.getProgress(operationId)).toMatchObject({ phase: 'error', stage: 'validating', operationId })
  })
})
