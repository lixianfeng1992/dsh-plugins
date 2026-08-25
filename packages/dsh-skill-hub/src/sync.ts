import { access, lstat, mkdir, readFile, readdir, rename, symlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import { parseRepositoryUrl, repositoryPaths } from './repository.js'
import type { SkillHubConfig, SkillHubProgress, SkillHubState, SyncResult } from './types.js'

const exists = async (target: string) => access(target).then(() => true, () => false)

function git(args: string[], cwd?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('git', args, { cwd, stdio: ['ignore', 'ignore', 'pipe'] })
    let error = ''
    child.stderr.on('data', chunk => { error += String(chunk) })
    child.on('error', reject)
    child.on('close', code => code === 0
      ? resolve()
      : reject(new Error(`git ${args[0]} failed${error.trim() ? `: ${error.trim().split('\n')[0]}` : ''}`)))
  })
}

export class SkillHubSynchronizer {
  private dshHome!: string
  private profile!: string
  private statePath!: string
  private state?: SkillHubState
  private running?: Promise<SyncResult>
  private operationId?: string
  private progress: SkillHubProgress = { phase: 'idle' }

  constructor(private config: SkillHubConfig) {
    this.configure(config)
  }

  configure(config: SkillHubConfig): void {
    this.config = config
    this.dshHome = resolveDshHome(config.dshHome)
    this.profile = config.profile ?? process.env.DSH_PROFILE ?? 'web'
    this.statePath = path.resolve(this.dshHome, 'skill-hub', 'state.json')
  }

  async getState(): Promise<SkillHubState> {
    if (!this.state) {
      try {
        this.state = JSON.parse(await readFile(this.statePath, 'utf8')) as SkillHubState
      } catch {
        this.state = { repositoryUrl: this.config.repositoryUrl, checkoutPath: '', profile: this.profile, createdLinks: [] }
      }
    }
    return this.state
  }

  getProgress(operationId?: string): SkillHubProgress {
    if (operationId !== undefined && this.progress.operationId !== operationId) return { phase: 'idle' }
    return this.progress
  }

  /** Starts clone + link initialization and returns immediately with an operation id. */
  startInitialize(repositoryUrl: string, persist: () => Promise<void>): string {
    if (this.running && this.operationId) return this.operationId
    const operationId = `${Date.now()}-${Math.random().toString(36).slice(2)}`
    this.operationId = operationId
    this.progress = { phase: 'validating', operationId, message: '正在验证仓库地址…' }
    const task = this.performInitialize(repositoryUrl, persist, operationId)
      .then(result => {
        this.progress = { phase: 'success', operationId, result }
        return result
      })
      .catch(error => {
        const message = error instanceof Error ? error.message : String(error)
        const stage = this.progress.phase === 'error' ? this.progress.stage : this.progress.phase
        this.progress = { phase: 'error', operationId, stage, message }
        return {
          repositoryUrl,
          checkoutPath: '',
          syncedAt: new Date().toISOString(),
          linked: 0,
          skipped: 0,
          failed: 1,
          errors: [message],
        }
      })
      .finally(() => { this.running = undefined })
    this.running = task
    return operationId
  }

  /** SessionStart is pull-only. It never creates a missing checkout. */
  async sync(): Promise<SyncResult> {
    if (this.running) return this.running
    if (!this.config.repositoryUrl.trim()) throw new Error('repository URL is not configured')
    const ref = parseRepositoryUrl(this.config.repositoryUrl)
    const paths = repositoryPaths(this.dshHome, this.profile, ref)
    if (!await exists(path.join(paths.checkout, '.git'))) {
      throw new Error('repository checkout is not initialized; save the repository URL first')
    }
    this.running = this.performPull(ref.url, paths).finally(() => { this.running = undefined })
    return this.running
  }

  private async performInitialize(repositoryUrl: string, persist: () => Promise<void>, operationId: string): Promise<SyncResult> {
    const ref = parseRepositoryUrl(repositoryUrl)
    const paths = repositoryPaths(this.dshHome, this.profile, ref)
    await mkdir(paths.base, { recursive: true })
    await mkdir(paths.links, { recursive: true })
    this.progress = { phase: 'cloning', operationId, message: '正在克隆仓库…' }
    if (await exists(path.join(paths.checkout, '.git'))) {
      await git(['-C', paths.checkout, 'pull', '--ff-only'])
    } else if (await exists(paths.checkout)) {
      throw new Error('checkout path exists but is not a Git repository')
    } else {
      const temporary = `${paths.checkout}.tmp-${process.pid}-${Date.now()}`
      await git(['clone', '--', ref.url, temporary])
      await rename(temporary, paths.checkout)
    }
    this.progress = { phase: 'scanning', operationId, message: '正在扫描 Skills…' }
    const result = await this.scanAndLink(ref.url, paths, operationId)
    this.progress = { phase: 'persisting', operationId, message: '正在保存配置…' }
    await persist()
    this.configure({ ...this.config, repositoryUrl: ref.url })
    return result
  }

  private async performPull(repositoryUrl: string, paths: ReturnType<typeof repositoryPaths>): Promise<SyncResult> {
    try {
      await git(['-C', paths.checkout, 'pull', '--ff-only'])
    } catch (error) {
      throw new Error(`repository update failed: ${error instanceof Error ? error.message : String(error)}`)
    }
    return this.scanAndLink(repositoryUrl, paths)
  }

  private async scanAndLink(repositoryUrl: string, paths: ReturnType<typeof repositoryPaths>, operationId?: string): Promise<SyncResult> {
    const result: SyncResult = { repositoryUrl, checkoutPath: paths.checkout, syncedAt: new Date().toISOString(), linked: 0, skipped: 0, failed: 0, errors: [] }
    let entries: string[] = []
    try {
      entries = await readdir(paths.skills)
    } catch (error) {
      result.errors.push(`skills directory unavailable: ${error instanceof Error ? error.message : String(error)}`)
    }
    const createdLinks: string[] = []
    if (operationId) this.progress = { phase: 'linking', operationId, message: '正在创建链接…' }
    for (const name of entries) {
      if (!/^[A-Za-z0-9._-]+$/.test(name) || name === '.' || name === '..') {
        result.failed++
        result.errors.push(`unsafe skill name: ${name}`)
        continue
      }
      const source = path.resolve(paths.skills, name)
      const marker = path.resolve(source, 'SKILL.md')
      const destination = path.resolve(paths.links, name)
      try {
        const stat = await lstat(source)
        const markerStat = await lstat(marker)
        if (!stat.isDirectory() || !markerStat.isFile() || stat.isSymbolicLink()) throw new Error('skill must be a real directory containing a regular SKILL.md')
        if (await exists(destination)) { result.skipped++; continue }
        await symlink(source, destination, 'junction')
        result.linked++
        createdLinks.push(destination)
      } catch (error) {
        result.failed++
        result.errors.push(`${name}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
    await this.writeState(result, paths, createdLinks)
    return result
  }

  private async writeState(result: SyncResult, paths: ReturnType<typeof repositoryPaths>, createdLinks: string[] = []): Promise<void> {
    const previous = await this.getState()
    this.state = {
      repositoryUrl: result.repositoryUrl,
      checkoutPath: paths.checkout,
      profile: this.profile,
      lastSync: result,
      createdLinks: [...previous.createdLinks, ...createdLinks],
    }
    await mkdir(path.dirname(this.statePath), { recursive: true })
    await writeFile(`${this.statePath}.tmp`, JSON.stringify(this.state, null, 2) + '\n', { mode: 0o600 })
    await rename(`${this.statePath}.tmp`, this.statePath)
  }
}
