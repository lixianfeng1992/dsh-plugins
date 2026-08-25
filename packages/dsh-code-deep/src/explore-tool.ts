import { defineTool } from '@deepseek-ai/dsh-tools'
import type { ProjectClientCache } from './clients.js'
import { sessionCwd } from './session-cwd.js'

function projectExploreText(text: string, detailLevel: 'minimal' | 'standard') {
  const files = [...text.matchAll(/(?:^|\n)(?:File|Source file):\s*([^\n]+)/gi)].map((match) => match[1].trim())
  const returnedSourceFiles = [...new Set(files)]
  const truncated = /truncat|omitted|\.\.\./i.test(text)
  const projected = detailLevel === 'minimal' ? text.split('\n').slice(0, 80).join('\n') : text
  return {
    text: projected,
    metadata: {
      detailLevel,
      sourceFilesFound: returnedSourceFiles.length,
      sourceFilesReturned: returnedSourceFiles.length,
      sourceFilesOmitted: 0,
      returnedSourceFiles,
      omittedSourceFiles: [],
      truncated,
    },
  }
}

const outputSchema = {
  type: 'object' as const,
  additionalProperties: false,
  properties: {
    text: { type: 'string' as const, required: true },
    detailLevel: { type: 'string' as const, enum: ['minimal', 'standard'] as const, required: true },
    sourceFilesFound: { type: 'integer' as const, required: true },
    sourceFilesReturned: { type: 'integer' as const, required: true },
    sourceFilesOmitted: { type: 'integer' as const, required: true },
    returnedSourceFiles: { type: 'array' as const, items: { type: 'string' as const }, required: true },
    omittedSourceFiles: { type: 'array' as const, items: { type: 'string' as const }, required: true },
    truncated: { type: 'boolean' as const, required: true },
  },
} as const

export function createExploreTool(clients: ProjectClientCache) {
  return defineTool({
    name: 'code_deep_explore',
    description: 'Explore the calling agent session workspace using code structure and dependency context.',
    parameters: {
      query: { type: 'string', required: true, description: 'Task, symbols/files, and relationships to trace.' },
      maxFiles: { type: 'integer', description: 'Maximum source files to return (1-50).' },
      detailLevel: { type: 'string', enum: ['minimal', 'standard'] as const },
    },
    output: {
      schema: outputSchema,
      render: (_args, value) => [{ type: 'text', text: value.text }],
    },
    async execute(args, exec) {
      if (args.maxFiles !== undefined && (args.maxFiles < 1 || args.maxFiles > 50)) {
        throw new Error('maxFiles must be between 1 and 50')
      }
      const client = await clients.get(sessionCwd(exec))
      const raw = await client.explore(args.query, { maxFiles: args.maxFiles })
      const projection = projectExploreText(raw, args.detailLevel ?? 'standard')
      const metadata = projection.metadata
      return {
        text: projection.text,
        detailLevel: metadata.detailLevel,
        sourceFilesFound: metadata.sourceFilesFound,
        sourceFilesReturned: metadata.sourceFilesReturned,
        sourceFilesOmitted: metadata.sourceFilesOmitted,
        returnedSourceFiles: metadata.returnedSourceFiles,
        omittedSourceFiles: metadata.omittedSourceFiles,
        truncated: metadata.truncated,
      }
    },
  })
}
