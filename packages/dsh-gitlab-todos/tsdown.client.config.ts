import { defineConfig } from 'tsdown'

/** Bundle private browser dependencies; only DSH platform seeds stay external. */
export default defineConfig({
  entry: ['src/client/index.ts'],
  outDir: '.client-build',
  format: ['cjs'],
  platform: 'browser',
  dts: false,
  clean: true,
  deps: {
    neverBundle: ['react', 'react-dom'],
    alwaysBundle: [/^lucide-react(?:\/|$)/],
  },
})
