import { spawnSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'

const result = spawnSync('pnpm', [
  'exec', 'tsdown', '--config', 'tsdown.client.config.ts',
], { stdio: 'inherit' })
if (result.status !== 0) process.exit(result.status ?? 1)

const source = await readFile('.client-build/index.cjs', 'utf8')
const platformModules = new Set(['react', 'react-dom'])
const unresolved = [...source.matchAll(/\brequire\(["']([^"']+)["']\)/g)]
  .map(match => match[1])
  .filter(specifier => !platformModules.has(specifier))
if (unresolved.length > 0) {
  throw new Error(`client bundle contains unresolved modules: ${[...new Set(unresolved)].join(', ')}`)
}

await mkdir('lib', { recursive: true })
const bundle = [
  'window.__ModuleLoader__.load({',
  '  id: "dsh-native-agents",',
  '  factory: (require) => {',
  '    var module = { exports: {} };',
  '    var exports = module.exports;',
  source,
  '    return module.exports;',
  '  },',
  '});',
  '',
].join('\n')
await writeFile('lib/client.js', bundle)
