import { realpath } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { CodeDeepClient } from '@team-harness/code-deep'

const execFileAsync = promisify(execFile)

async function gitRoot(projectPath: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', ['-C', projectPath, 'rev-parse', '--show-toplevel'])
    return realpath(stdout.trim())
  } catch {
    throw new Error(`projectPath must be an existing Git repository root: ${projectPath}`)
  }
}

export class ProjectClientCache {
  private readonly clients = new Map<string, CodeDeepClient>()

  async get(projectPath: string): Promise<CodeDeepClient> {
    if (!projectPath || !projectPath.startsWith('/')) {
      throw new Error(`projectPath must be an absolute path: ${projectPath || '<empty>'}`)
    }
    const requested = await realpath(projectPath).catch(() => {
      throw new Error(`projectPath does not exist: ${projectPath}`)
    })
    const root = await gitRoot(requested)
    if (root !== requested) {
      throw new Error(`projectPath must be the Git repository root (${root}): ${projectPath}`)
    }
    const existing = this.clients.get(root)
    if (existing) return existing
    const client = new CodeDeepClient({ projectPath: root })
    this.clients.set(root, client)
    return client
  }

  async close(): Promise<void> {
    const clients = [...this.clients.values()]
    this.clients.clear()
    await Promise.all(clients.map((client) => client.close()))
  }
}
