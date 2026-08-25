import type { ToolExecution } from '@deepseek-ai/dsh-tools'

export function sessionCwd(exec: ToolExecution): string {
  const cwd = exec.agent?.session.header.cwd
  if (cwd === undefined) {
    throw new Error('code-deep requires a calling agent with a session workspace cwd')
  }
  return cwd
}
