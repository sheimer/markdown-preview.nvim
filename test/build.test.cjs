const { test } = require('node:test')
const assert = require('node:assert/strict')
const { execFileSync } = require('node:child_process')
const { createHash } = require('node:crypto')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const out = path.join(root, 'app/out')

async function snapshot(directory, prefix = '') {
  const files = {}
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const relative = prefix + entry.name
    const filename = path.join(directory, entry.name)
    if (entry.isDirectory())
      Object.assign(files, await snapshot(filename, relative + '/'))
    else
      files[relative] = createHash('sha256')
        .update(await fs.readFile(filename))
        .digest('hex')
  }
  return files
}

test('frontend rebuilds produce stable standalone assets and linked license notices', async () => {
  const build = () =>
    execFileSync(
      process.execPath,
      [path.join(root, 'scripts/build.js'), '--frontend'],
      {
        // Build from outside the checkout with no OpenSSL compatibility options.
        cwd: os.tmpdir(),
        env: { ...process.env, NODE_OPTIONS: '' },
        stdio: 'pipe'
      }
    )
  build()
  const first = await snapshot(out)
  const html = await fs.readFile(path.join(out, 'index.html'), 'utf8')
  const script = /src="\/_assets\/([^"/]+\.js)"/.exec(html)
  assert.ok(script, 'The HTML shell must load the emitted browser entry')
  assert.ok(
    !html.includes('/_next/'),
    'The HTML shell must not depend on Next assets'
  )
  const javascript = await fs.readFile(
    path.join(out, 'assets', script[1]),
    'utf8'
  )
  const notice = script[1] + '.LEGAL.txt'
  assert.ok(
    javascript.includes(notice),
    'The bundle must link to its third-party license notices'
  )
  assert.match(
    await fs.readFile(path.join(out, 'assets', notice), 'utf8'),
    /React/
  )
  assert.equal(
    await fs.readFile(path.join(out, 'build-version'), 'utf8'),
    require('../package.json').version + '\n'
  )
  const inventory = JSON.parse(
    await fs.readFile(
      path.join(out, 'assets/vendor/bundled-modules.json'),
      'utf8'
    )
  )
  assert.ok(
    inventory.packages.some(
      (item) => item.name === 'mermaid' && item.version === '12.3.0'
    )
  )
  assert.ok(
    inventory.packages.some(
      (item) => item.name === '@viz-js/viz' && item.version === '3.31.0'
    )
  )
  const mermaid = inventory.packages.find((item) => item.name === 'mermaid')
  const lockedMermaid = require('../package-lock.json').packages['node_modules/mermaid']
  assert.equal(mermaid.resolved, lockedMermaid.resolved)
  assert.equal(mermaid.integrity, lockedMermaid.integrity)
  assert.ok(mermaid.repository)
  const fullNotices = await fs.readFile(
    path.join(out, 'assets/vendor/BUNDLED-LICENSES.txt'),
    'utf8'
  )
  assert.match(fullNotices, /Eclipse Public License/)
  assert.match(fullNotices, /Mermaid|mermaid/)
  const retained = require('../app/vendor-assets.json').retained
  for (const source of retained) {
    const bytes = await fs.readFile(
      path.join(out, 'assets/vendor', source.destination)
    )
    assert.equal(
      createHash('sha256').update(bytes).digest('hex'),
      source.sha256
    )
  }
  build()
  assert.deepEqual(
    await snapshot(out),
    first,
    'Identical inputs must produce identical output bytes and asset names'
  )
})
