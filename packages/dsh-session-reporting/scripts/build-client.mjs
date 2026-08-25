import { spawnSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
const result = spawnSync('pnpm', ['exec', 'tsdown', '--config', 'tsdown.client.config.ts'], { stdio: 'inherit' })
if (result.status !== 0) process.exit(result.status ?? 1)
const source = await readFile('.client-build/index.cjs', 'utf8')
await mkdir('lib', { recursive: true })
await writeFile('lib/client.js', ['window.__ModuleLoader__.load({', '  id: "dsh-session-reporting",', '  factory: (require) => {', '    var module = { exports: {} };', '    var exports = module.exports;', source.split('\n').map(line => `    ${line}`).join('\n'), '    return module.exports;', '  },', '});', ''].join('\n'))
