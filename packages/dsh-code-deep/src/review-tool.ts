import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ProjectClientCache } from './clients.js'
import { sessionCwd } from './session-cwd.js'

const json = { type: 'json' as const }
const outputSchema = { type: 'object' as const, additionalProperties: true, properties: {
  schemaVersion: { type: 'integer' as const, required: true }, summary: { ...json, required: true }, files: { type: 'array' as const, items: json, required: true },
  impacts: { type: 'array' as const, items: json, required: true }, reviewItems: { type: 'array' as const, items: json, required: true },
  riskSignals: { type: 'array' as const, items: json, required: true }, ignoredPaths: { type: 'array' as const, items: { type: 'string' as const }, required: true },
  graphContext: { type: 'string' as const, required: true }, markdown: { type: 'string' as const, required: true },
} } as const

export function createReviewTool(clients: ProjectClientCache) {
  return defineTool({
    name: 'code_deep_review',
    description: 'Review the calling agent session workspace or a supplied diff/range with code impact analysis.',
    parameters: {
      diff: { type: 'string', description: 'Patch to review; mutually exclusive with base/head.' },
      base: { type: 'string', description: 'Base ref; required when head is supplied.' },
      head: { type: 'string', description: 'Head ref; requires base.' },
      maxFiles: { type: 'integer' }, maxSymbols: { type: 'integer' },
      detailLevel: { type: 'string', enum: ['minimal', 'standard'] as const },
    },
    output: { schema: outputSchema, render: (_args, value) => [{ type: 'text', text: value.markdown }] },
    async execute(args, exec) {
      if (args.diff !== undefined && (args.base !== undefined || args.head !== undefined)) throw new Error('diff cannot be combined with base/head')
      if (args.head !== undefined && args.base === undefined) throw new Error('head requires base')
      const client = await clients.get(sessionCwd(exec))
      const report = await client.review({ diff: args.diff, base: args.base, head: args.head, maxFiles: args.maxFiles, maxSymbols: args.maxSymbols })
      if (args.detailLevel === 'minimal') return JSON.parse(JSON.stringify({ ...report, files: [], impacts: [], graphContext: '' }))
      return JSON.parse(JSON.stringify(report))
    },
  })
}
