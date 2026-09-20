/**
 * Build the browser half into the single artifact the client loader serves:
 * `lib/client.js`, a CommonJS factory registered with `window.__ModuleLoader__`.
 *
 * The wrapper lines and the external list reproduce the harness' dynamic client
 * bundle: the shell seeds a fixed module table (React, cordis, the static client
 * libraries), so those specifiers stay external and are never declared per
 * package. `platform: 'browser'` also turns a Node builtin reachable from the
 * bundled graph into a build failure rather than a runtime one.
 */

import { build } from 'esbuild'
import { mkdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))

/** Modules the Web shell seeds for every dynamic bundle. */
const PLATFORM_MODULES = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-dockkit',
]

const outfile = resolve(root, 'lib/client.js')
mkdirSync(dirname(outfile), { recursive: true })

await build({
  entryPoints: [resolve(root, 'src/client/index.ts')],
  outfile,
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  jsx: 'automatic',
  external: PLATFORM_MODULES,
  logLevel: 'warning',
  banner: {
    js: `window.__ModuleLoader__.load({ id: ${JSON.stringify(manifest.name)}, factory: (require) => {\n`
      + 'var module = { exports: {} }; var exports = module.exports;',
  },
  footer: { js: 'return module.exports; } });' },
})

console.log(`built lib/client.js (${statSync(outfile).size} bytes)`)