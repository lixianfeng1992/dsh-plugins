import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts'],
  dts: true,
  outDir: 'lib',
  format: ['esm'],
  clean: true,
  deps: {
    alwaysBundle: ['@anthropic-ai/claude-agent-sdk'],
    onlyBundle: ['@anthropic-ai/claude-agent-sdk'],
  },
})
