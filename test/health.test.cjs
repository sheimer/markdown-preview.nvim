const { test } = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { session } = require('./helpers/session.cjs')

test('health reports the source installation and configured Node/browser hooks without launching a preview', async (t) => {
  const nvim = await session()
  t.after(() => nvim.dispose())
  await nvim.lua('vim.g.mkdp_node_command = ...', [process.execPath])
  await nvim.command('checkhealth markdown_preview')
  const report = (
    await nvim.lua('return vim.api.nvim_buf_get_lines(0, 0, -1, false)')
  ).join('\n')
  assert.match(report, /Source build present/)
  assert.match(report, /Node runtime dependencies installed/)
  assert.ok(report.includes(process.execPath))
  assert.match(report, /Browser hook: MkdpTestOpen/)
  assert.doesNotMatch(report, /ERROR|Pre build|app\/bin/)
  assert.deepEqual(await nvim.launches(), [])
  await nvim.lua(
    'vim.g.mkdp_node_command = ...; vim.g.mkdp_browserfunc = "MkdpMissingHook"',
    [path.join(nvim.dir, 'missing node')]
  )
  await nvim.command('checkhealth markdown_preview')
  const failed = (
    await nvim.lua('return vim.api.nvim_buf_get_lines(0, 0, -1, false)')
  ).join('\n')
  assert.match(failed, /Node.js 24 not found/)
  assert.match(failed, /Browser hook does not exist: MkdpMissingHook/)
  assert.deepEqual(await nvim.launches(), [])
})
