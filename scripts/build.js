const { spawnSync } = require('node:child_process')
const { copyFileSync, readFileSync, rmSync, writeFileSync } = require('node:fs')
const path = require('node:path')

if (Number(process.versions.node.split('.')[0]) !== 24) {
  throw new Error('Build and run Markdown Preview with Node.js 24.')
}
const esbuild = require('esbuild')
const { copyVendorAssets } = require('./vendor-assets')
const { writeBundleNotices } = require('./bundle-notices')
const root = path.resolve(__dirname, '..')
const app = path.join(root, 'app')
const out = path.join(app, 'out')

if (!process.argv.includes('--frontend')) {
  rmSync(path.join(app, 'lib'), { recursive: true, force: true })
  const result = spawnSync(
    process.execPath,
    [require.resolve('typescript/bin/tsc'), '-p', root],
    {
      cwd: root,
      stdio: 'inherit'
    }
  )
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status || 1)
}
// Remove the obsolete cache when rebuilding an existing Next-based installation.
rmSync(path.join(app, '.next'), { recursive: true, force: true })
rmSync(out, { recursive: true, force: true })
const entry = path.join(app, 'client.jsx')
const result = esbuild.buildSync({
  absWorkingDir: root,
  entryPoints: [entry],
  outdir: path.join(out, 'assets'),
  entryNames: '[name]-[hash]',
  bundle: true,
  platform: 'browser',
  format: 'esm',
  splitting: true,
  chunkNames: 'chunks/[name]-[hash]',
  target: 'es2020',
  define: { 'process.env.NODE_ENV': '"production"' },
  minify: true,
  legalComments: 'linked',
  metafile: true,
  logLevel: 'info'
})
const bundle = Object.entries(result.metafile.outputs).find(
  ([, output]) =>
    output.entryPoint && path.resolve(root, output.entryPoint) === entry
)
if (!bundle) throw new Error('The preview browser entry was not emitted.')
const template = readFileSync(path.join(app, 'index.html'), 'utf8')
const vendor = copyVendorAssets(root, out)
writeBundleNotices(root, out, result.metafile)
const marker = '<!-- preview-bundle -->'
if (!template.includes(marker))
  throw new Error('The preview HTML is missing its bundle marker.')
writeFileSync(
  path.join(out, 'index.html'),
  template
    .replace('<!-- preview-vendor -->', vendor.html)
    .replace(
      marker,
      '<script type="module" src="/_assets/' +
        path.basename(bundle[0]) +
        '"></script>'
    )
)
copyFileSync(path.join(app, '404.html'), path.join(out, '404.html'))
writeFileSync(
  path.join(out, 'build-version'),
  require('../package.json').version + '\n'
)
