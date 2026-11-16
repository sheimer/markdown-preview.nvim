const { spawnSync } = require('node:child_process')
const { rmSync, writeFileSync } = require('node:fs')
const path = require('node:path')

if (Number(process.versions.node.split('.')[0]) !== 24) {
  throw new Error('Build and run Markdown Preview with Node.js 24.')
}
const root = path.resolve(__dirname, '..')
function run(script, args, cwd, env = process.env) {
  const result = spawnSync(process.execPath, [script, ...args], { cwd, env, stdio: 'inherit' })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status || 1)
}
if (!process.argv.includes('--frontend')) {
  rmSync(path.join(root, 'app/lib'), { recursive: true, force: true })
  run(require.resolve('typescript/bin/tsc'), ['-p', root], root)
}
rmSync(path.join(root, 'app/.next'), { recursive: true, force: true })
rmSync(path.join(root, 'app/out'), { recursive: true, force: true })
// Next 7's webpack uses MD4. Keep this legacy compatibility flag scoped to builds.
const env = { ...process.env, NODE_OPTIONS: [process.env.NODE_OPTIONS, '--openssl-legacy-provider'].filter(Boolean).join(' ') }
const next = require.resolve('next/dist/bin/next')
run(next, ['build'], path.join(root, 'app'), env)
run(next, ['export'], path.join(root, 'app'), env)
writeFileSync(path.join(root, 'app/out/build-version'), require('../package.json').version + '\n')
