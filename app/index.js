if (Number(process.versions.node.split('.')[0]) !== 24) {
  throw new Error('Markdown Preview requires Node.js 24.')
}
// Run from the installed plugin directory, independent of the editor's cwd.
process.chdir(__dirname)
require('./server').run()
