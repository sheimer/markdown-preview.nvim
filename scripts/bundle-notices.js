const {
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync
} = require('node:fs')
const path = require('node:path')

const noticeName =
  /^(?:licen[cs]es?|copying|copyright|notice|unlicense)(?:$|[._-])/i
const slash = (value) => value.split(path.sep).join('/')
const compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0)

function noticeFiles(root, directory) {
  const found = []
  const visit = (folder, includeAll) => {
    for (const entry of readdirSync(folder, { withFileTypes: true }).sort(
      (a, b) => compare(a.name, b.name)
    )) {
      if (!includeAll && !noticeName.test(entry.name)) continue
      const filename = path.join(folder, entry.name)
      if (entry.isDirectory()) visit(filename, true)
      else if (entry.isFile()) found.push(slash(path.relative(root, filename)))
    }
  }
  visit(directory, false)
  return found
}

function writeBundleNotices(root, out, metafile) {
  const lock = JSON.parse(
    readFileSync(path.join(root, 'package-lock.json'), 'utf8')
  )
  // Lockfile roots remain accurate when emitted modules live below package.json
  // stubs such as socket.io-client/build/esm/package.json.
  const packagePaths = Object.keys(lock.packages)
    .filter((name) => name.includes('node_modules/'))
    .sort((a, b) => b.length - a.length || compare(a, b))
  const emittedInputs = new Set(
    Object.values(metafile.outputs).flatMap((output) =>
      Object.entries(output.inputs || {})
        .filter(([, info]) => info.bytesInOutput > 0)
        .map(([name]) => name)
    )
  )
  const included = new Set()
  for (const input of emittedInputs) {
    const relative = slash(path.relative(root, path.resolve(root, input)))
    const owner = packagePaths.find(
      (name) => relative === name || relative.startsWith(name + '/')
    )
    if (owner) included.add(owner)
  }
  const viz = JSON.parse(
    readFileSync(path.join(root, 'app/vendor-viz.json'), 'utf8')
  )
  const vizNotices = [
    viz.licenseFile,
    viz.backend.emscriptenLicenseFile,
    ...viz.backend.runtimeNotices.map((notice) => notice.licenseFile),
    ...viz.bundledComponents.map((component) => component.licenseFile)
  ]
  const limitations = []
  const packages = [...included]
    .map((packagePath) => {
      const folder = path.join(root, packagePath)
      const info = JSON.parse(
        readFileSync(path.join(folder, 'package.json'), 'utf8')
      )
      if (info.version !== lock.packages[packagePath].version) {
        throw new Error(
          'Bundled package version differs from lockfile: ' +
            packagePath +
            '; run npm ci.'
        )
      }
      const licenseFiles = noticeFiles(root, folder)
      if (info.name === '@viz-js/viz') licenseFiles.push(...vizNotices)
      let license = info.license || lock.packages[packagePath].license
      if (!license && info.licenses)
        license = info.licenses.map((value) => value.type || value).join(' OR ')
      // khroma omits the metadata field but its published license file explicitly
      // carries the MIT title, authors and complete grant.
      if (!license && info.name === 'khroma') license = 'MIT'
      const result = {
        name: info.name,
        version: info.version,
        license: license || 'UNDECLARED',
        packagePath,
        licenseFiles: [...new Set(licenseFiles)].sort(compare)
      }
      const locked = lock.packages[packagePath]
      if (locked.resolved) result.resolved = locked.resolved
      if (locked.integrity) result.integrity = locked.integrity
      if (info.repository) result.repository = info.repository
      if (info.homepage) result.homepage = info.homepage
      if (info.name === 'elkjs') result.selectedLicense = 'EPL-2.0'
      if (info.name === 'dompurify') result.selectedLicense = 'Apache-2.0'
      if (!result.licenseFiles.length) {
        const note = `${info.name}@${info.version}: package declares ${result.license} but supplies no standalone full-text license notice.`
        limitations.push(note)
        result.noticeStatus = 'declaration-only'
        result.metadataFile = packagePath + '/package.json'
        if (info.author) result.author = info.author
      } else result.noticeStatus = 'full-text-files-recorded'
      return result
    })
    .sort(
      (a, b) =>
        compare(a.name, b.name) ||
        compare(a.version, b.version) ||
        compare(a.packagePath, b.packagePath)
    )

  const directory = path.join(out, 'assets/vendor')
  mkdirSync(directory, { recursive: true })
  const assets = JSON.parse(
    readFileSync(path.join(root, 'app/vendor-assets.json'), 'utf8')
  )
  const inventory = {
    schemaVersion: 1,
    description:
      'npm packages with emitted code in the browser bundle; versions and notices are inventory evidence, not a legal compliance certification.',
    packages,
    nativeBackendProvenance: viz,
    supplementalSourceProvenance: assets.bundledModuleProvenance || [],
    limitations: limitations.sort(compare)
  }
  writeFileSync(
    path.join(directory, 'bundled-modules.json'),
    JSON.stringify(inventory, null, 2) + '\n'
  )
  const sections = [
    'Browser bundle dependency notices\n\nFull source notice files are retained below. Original alternative license texts are preserved; selectedLicense in bundled-modules.json records the chosen distribution option where relevant.'
  ]
  for (const item of packages) {
    sections.push(
      `\n${'='.repeat(72)}\n${item.name}@${item.version}\nDeclared license: ${
        item.license
      }\nPackage: ${item.packagePath}`
    )
    if (item.selectedLicense)
      sections.push('Selected distribution option: ' + item.selectedLicense)
    if (!item.licenseFiles.length) {
      sections.push(
        'FULL-TEXT NOTICE GAP: No standalone notice supplied. The original package metadata declares the license above; no copyright attribution has been invented.'
      )
      if (item.author)
        sections.push(
          'Published author metadata: ' + JSON.stringify(item.author)
        )
      if (item.source) sections.push('Verified source tree: ' + item.source)
    }
    for (const filename of item.licenseFiles) {
      sections.push(
        `\n--- ${filename} ---\n` +
          readFileSync(path.join(root, filename), 'utf8').trimEnd()
      )
    }
  }
  if (limitations.length)
    sections.push(
      '\nInventory limitations\n' +
        limitations.map((note) => '- ' + note).join('\n')
    )
  writeFileSync(
    path.join(directory, 'BUNDLED-LICENSES.txt'),
    sections.join('\n') + '\n'
  )
  return inventory
}

module.exports = { writeBundleNotices }
