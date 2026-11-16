const {
  cpSync,
  copyFileSync,
  mkdirSync,
  readFileSync,
  readdirSync
} = require('node:fs')
const { createHash } = require('node:crypto')
const path = require('node:path')
const esbuild = require('esbuild')

function copyVendorAssets(root, out) {
  const manifest = JSON.parse(
    readFileSync(path.join(root, 'app/vendor-assets.json'), 'utf8')
  )
  const destination = path.join(out, 'assets/vendor')
  const copy = (source, target) => {
    mkdirSync(path.dirname(target), { recursive: true })
    cpSync(source, target, { recursive: true })
  }
  for (const asset of manifest.packages) {
    const packageFile = require.resolve(asset.name + '/package.json', {
      paths: [root]
    })
    const info = JSON.parse(readFileSync(packageFile, 'utf8'))
    if (info.version !== asset.version) {
      throw new Error(
        `Vendor ${asset.name}: expected ${asset.version}, found ${info.version}; run npm ci.`
      )
    }
    for (const [source, target] of asset.files) {
      copy(
        path.join(path.dirname(packageFile), source),
        path.join(destination, target)
      )
    }
  }
  for (const asset of manifest.retained) {
    const source = path.join(root, asset.file)
    const actual = createHash('sha256')
      .update(readFileSync(source))
      .digest('hex')
    if (actual !== asset.sha256)
      throw new Error('Retained vendor asset integrity mismatch: ' + asset.file)
    copy(source, path.join(destination, asset.destination))
  }
  // The published flowchart package has no prebuilt browser distribution. Bundle
  // its public entry with Raphael once, then expose the existing browser globals.
  esbuild.buildSync({
    absWorkingDir: root,
    stdin: {
      contents:
        'var Raphael = require("raphael"); var flowchart = require("flowchart.js"); window.Raphael = Raphael; window.flowchart = flowchart;',
      resolveDir: root,
      sourcefile: 'flowchart-vendor-entry.js'
    },
    outfile: path.join(destination, 'flowchart/flowchart.js'),
    bundle: true,
    platform: 'browser',
    format: 'iife',
    target: 'es2020',
    minify: true,
    legalComments: 'linked',
    banner: {
      js: '/*! Flowchart.js (MIT), Raphael (MIT), Eve (Apache-2.0). Full notices: ../licenses/ */'
    },
    logLevel: 'warning'
  })
  // Keep complete source notices beside the browser assets, including fonts and
  // runtime notices that minifier comment detection alone cannot discover.
  const notices = path.join(root, 'docs/licenses')
  for (const name of readdirSync(notices)) {
    copy(path.join(notices, name), path.join(destination, 'licenses', name))
  }
  copyFileSync(
    path.join(root, 'app/vendor-assets.json'),
    path.join(destination, 'manifest.json')
  )
  const prefix = '/_assets/vendor/'
  const html = [
    ...manifest.styles.map(
      (file) => `<link rel="stylesheet" href="${prefix + file}">`
    ),
    ...manifest.scripts.map(
      (file) => `<script defer src="${prefix + file}"></script>`
    )
  ].join('\n    ')
  return { html }
}

module.exports = { copyVendorAssets }
