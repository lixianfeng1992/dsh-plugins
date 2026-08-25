import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { NativeCatalog, NativeModel } from './native.js'

interface ManifestModel extends NativeModel {
  readonly minimumVersion?: string
  readonly defaultPriority?: number
}

const MANIFEST: readonly ManifestModel[] = [
  { id: 'claude-opus-5', name: 'Opus 5', description: 'Latest Opus release', contextWindow: 1_000_000, minimumVersion: '2.1.219', defaultPriority: 2 },
  { id: 'claude-fable-5', name: 'Fable 5', description: 'Most powerful Claude model', contextWindow: 1_000_000, minimumVersion: '2.1.169' },
  { id: 'claude-opus-4-8[1m]', name: 'Opus 4.8 1M', description: 'Opus 4.8 with 1M context', contextWindow: 1_000_000 },
  { id: 'claude-opus-4-8', name: 'Opus 4.8', description: 'Previous Opus release', contextWindow: 200_000, defaultPriority: 1 },
  { id: 'claude-sonnet-5', name: 'Sonnet 5', description: 'Best for everyday tasks', contextWindow: 200_000 },
  { id: 'claude-sonnet-5[1m]', name: 'Sonnet 5 1M', description: 'Sonnet 5 with 1M context', contextWindow: 1_000_000 },
  { id: 'claude-opus-4-7[1m]', name: 'Opus 4.7 1M', description: 'Opus 4.7 with 1M context', contextWindow: 1_000_000 },
  { id: 'claude-opus-4-7', name: 'Opus 4.7', description: 'Previous Opus release', contextWindow: 200_000 },
  { id: 'claude-opus-4-6[1m]', name: 'Opus 4.6 1M', description: 'Opus 4.6 with 1M context', contextWindow: 1_000_000 },
  { id: 'claude-opus-4-6', name: 'Opus 4.6', description: 'Opus for complex work', contextWindow: 200_000 },
  { id: 'claude-sonnet-4-6[1m]', name: 'Sonnet 4.6 1M', description: 'Sonnet 4.6 with 1M context', contextWindow: 1_000_000 },
  { id: 'claude-sonnet-4-6', name: 'Sonnet 4.6', description: 'Sonnet for everyday tasks', contextWindow: 200_000 },
  { id: 'claude-haiku-4-5', name: 'Haiku 4.5', description: 'Fastest for quick answers', contextWindow: 200_000 },
]

const SETTINGS_MODEL_KEYS = [
  'ANTHROPIC_MODEL',
  'ANTHROPIC_SMALL_FAST_MODEL',
  'ANTHROPIC_DEFAULT_OPUS_MODEL',
  'ANTHROPIC_DEFAULT_SONNET_MODEL',
  'ANTHROPIC_DEFAULT_HAIKU_MODEL',
] as const

function versionAtLeast(actual: string, minimum: string): boolean {
  const parts = (value: string): number[] => value.split('.').map(part => Number.parseInt(part, 10) || 0)
  const left = parts(actual)
  const right = parts(minimum)
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0)
    if (difference !== 0) return difference > 0
  }
  return true
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

async function configuredModels(configDir: string): Promise<NativeModel[]> {
  let settings: Record<string, unknown> | undefined
  try {
    settings = record(JSON.parse(await readFile(join(configDir, 'settings.json'), 'utf8')))
  } catch (_missingOrInvalidClaudeSettings) {
    return []
  }
  if (settings === undefined) return []
  const entries: Array<{ value: unknown; source: string }> = [{ value: settings.model, source: 'model' }]
  const env = record(settings.env)
  if (env !== undefined) {
    for (const key of SETTINGS_MODEL_KEYS) entries.push({ value: env[key], source: `env.${key}` })
  }
  return entries.flatMap(({ value, source }) => {
    if (typeof value !== 'string' || value.trim().length === 0) return []
    const id = value.trim()
    return [{ id, name: id, description: `From Claude settings.json ${source}` }]
  })
}

/** Build the Claude Code catalog from the Paseo-style manifest and local settings. */
export async function claudeCatalog(version: string | undefined, configDir?: string): Promise<NativeCatalog> {
  const manifest = MANIFEST.filter(model => model.minimumVersion === undefined
    || version === undefined
    || versionAtLeast(version, model.minimumVersion))
  const models = [...manifest]
  for (const model of await configuredModels(configDir ?? join(homedir(), '.claude'))) {
    if (!models.some(candidate => candidate.id === model.id)) models.push(model)
  }
  const selected = manifest.reduce<ManifestModel | undefined>((current, candidate) =>
    (candidate.defaultPriority ?? 0) > (current?.defaultPriority ?? 0) ? candidate : current, undefined)
  return {
    models: models.map(model => ({
      id: model.id,
      name: model.name,
      ...model.description === undefined ? {} : { description: model.description },
      ...model.contextWindow === undefined ? {} : { contextWindow: model.contextWindow },
      ...model.id === selected?.id ? { isDefault: true } : {},
    })),
    ...selected === undefined ? {} : { defaultModel: selected.id },
  }
}
