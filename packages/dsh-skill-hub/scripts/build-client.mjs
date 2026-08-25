import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'

const result = spawnSync('pnpm', [
  'exec', 'tsdown', '--entry', 'src/client/index.ts', '--out-dir', '.client-build',
  '--format', 'cjs', '--no-dts', '--clean', '--external', 'react', '--external', 'react-dom',
], { stdio: 'inherit' })
if (result.status !== 0) process.exit(result.status ?? 1)

const source = await readFile('.client-build/index.cjs', 'utf8')
await mkdir('lib', { recursive: true })
const bundle = [
  'window.__ModuleLoader__.load({',
  '  id: "dsh-skill-hub",',
  '  factory: (require) => {',
  '    var module = { exports: {} };',
  '    var exports = module.exports;',
  source.split('\n').map(line => `    ${line}`).join('\n'),
  '    return module.exports;',
  '  },',
  '});',
  '',
].join('\n')
await writeFile('lib/client.js', bundle)
