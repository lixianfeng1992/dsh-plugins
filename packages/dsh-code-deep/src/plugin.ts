import type { Context } from '@deepseek-ai/cordis'
import { createExploreTool } from './explore-tool.js'
import { createReviewTool } from './review-tool.js'
import { ProjectClientCache } from './clients.js'

export const name = 'dsh-code-deep'
export const inject = ['tools']

export function apply(ctx: Context) {
  const clients = new ProjectClientCache()
  ctx.effect(() => () => { void clients.close() })
  ctx.tools.register(createExploreTool(clients))
  ctx.tools.register(createReviewTool(clients))
}
