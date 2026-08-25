import { describe, expect, it } from 'vitest'
import { createExploreTool } from '../src/explore-tool.js'
import { createReviewTool } from '../src/review-tool.js'
import { sessionCwd } from '../src/session-cwd.js'

const clients = { get: async () => { throw new Error('not called') } } as never

describe('code-deep tools', () => {
  it('exposes the TSD tool names and parameter constraints', () => {
    const explore = createExploreTool(clients)
    const review = createReviewTool(clients)
    expect(explore.name).toBe('code_deep_explore')
    expect(review.name).toBe('code_deep_review')
    const exploreParameters = explore.parameters as any
    const reviewParameters = review.parameters as any
    expect(exploreParameters.properties.query).toMatchObject({ type: 'string' })
    expect(exploreParameters.required).toEqual(['query'])
    expect(reviewParameters.properties.diff).toMatchObject({ type: 'string' })
  })

  it('renders canonical outputs as model text', () => {
    const explore = createExploreTool(clients)
    const review = createReviewTool(clients)
    expect(explore.output.render({}, { text: 'context', detailLevel: 'standard', sourceFilesFound: 0, sourceFilesReturned: 0, sourceFilesOmitted: 0, returnedSourceFiles: [], omittedSourceFiles: [], truncated: false })).toEqual([{ type: 'text', text: 'context' }])
    expect(review.output.render({}, { markdown: 'report', schemaVersion: 1, summary: {}, files: [], impacts: [], reviewItems: [], riskSignals: [], ignoredPaths: [], graphContext: '' })).toEqual([{ type: 'text', text: 'report' }])
  })

  it('uses the calling agent session workspace', () => {
    expect(sessionCwd({ agent: { session: { header: { cwd: '/workspace' } } } } as never)).toBe('/workspace')
    expect(() => sessionCwd({} as never)).toThrow('requires a calling agent with a session workspace cwd')
  })
})
