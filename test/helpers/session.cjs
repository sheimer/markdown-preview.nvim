const { spawn } = require('node:child_process')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const msgpack = require('msgpack-lite')

const root = path.resolve(__dirname, '../..')

async function until(check, message, timeout = 10000) {
  const deadline = Date.now() + timeout
  let last
  while (Date.now() < deadline) {
    try {
      const value = await check()
      if (value) return value
    } catch (error) {
      last = error
    }
    await new Promise((resolve) => setTimeout(resolve, 30))
  }
  throw new Error(message + (last ? ': ' + last.message : ''))
}

async function session() {
  const dir = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), 'markdown-preview-test-'))
  )
  const fixture = path.join(dir, 'documents')
  await fs.mkdir(fixture)
  await fs.cp(path.join(root, 'fixtures'), fixture, { recursive: true })
  await fs.cp(path.join(root, 'test/fixtures'), fixture, { recursive: true })
  const init = path.join(dir, 'init.lua')
  await fs.writeFile(
    init,
    `
vim.opt.runtimepath:prepend(vim.env.MKDP_TEST_ROOT)
vim.opt.swapfile = false
vim.opt.shadafile = 'NONE'
vim.opt.hidden = true
vim.g.mkdp_theme = 'light'
vim.g.mkdp_preview_options = {sequence_diagrams = {theme = 'simple'}, disable_filename = 0}
vim.g.mkdp_test_urls = {}
vim.g.mkdp_browserfunc = 'MkdpTestOpen'
vim.cmd([[
function! MkdpTestOpen(url) abort
  call add(g:mkdp_test_urls, a:url)
endfunction
]])
vim.cmd('runtime plugin/mkdp.vim')
vim.cmd('filetype on')
`
  )
  const proc = spawn(
    process.env.NVIM || 'nvim',
    ['--headless', '--embed', '-u', init, '-i', 'NONE', '-n'],
    {
      cwd: fixture,
      env: {
        ...process.env,
        MKDP_TEST_ROOT: root,
        XDG_CONFIG_HOME: path.join(dir, 'config'),
        XDG_DATA_HOME: path.join(dir, 'data'),
        XDG_STATE_HOME: path.join(dir, 'state'),
        XDG_CACHE_HOME: path.join(dir, 'cache'),
        NVIM_LOG_FILE: path.join(dir, 'nvim.log'),
        NVIM_MKDP_LOG_FILE: path.join(dir, 'server.log'),
        NVIM_MKDP_LOG_LEVEL: 'debug'
      },
      stdio: ['pipe', 'pipe', 'pipe']
    }
  )
  let stderr = ''
  proc.stderr.on('data', (chunk) => {
    stderr += chunk
  })
  let seq = 0
  const pending = new Map()
  const decoder = msgpack.createDecodeStream()
  proc.stdout.pipe(decoder)
  decoder.on('data', (data) => {
    if (data[0] !== 1) return
    const waiter = pending.get(data[1])
    if (!waiter) return
    pending.delete(data[1])
    clearTimeout(waiter.timer)
    if (data[2]) waiter.reject(new Error(JSON.stringify(data[2])))
    else waiter.resolve(data[3])
  })
  proc.on('exit', () => {
    for (const waiter of pending.values()) {
      clearTimeout(waiter.timer)
      waiter.reject(new Error('Neovim exited: ' + stderr))
    }
    pending.clear()
  })
  function rpc(method, args) {
    return new Promise((resolve, reject) => {
      const id = ++seq
      const timer = setTimeout(() => {
        pending.delete(id)
        reject(new Error('Neovim RPC timeout: ' + method + '\n' + stderr))
      }, 10000)
      pending.set(id, { resolve, reject, timer })
      proc.stdin.write(msgpack.encode([0, id, method, args]))
    })
  }
  const lua = (code, args = []) => rpc('nvim_exec_lua', [code, args])
  const command = (code) => rpc('nvim_command', [code])
  const edit = async (name) => {
    await lua('vim.cmd.edit(vim.fn.fnameescape(...))', [
      path.join(fixture, name)
    ])
    await command('setfiletype markdown')
    return lua('return vim.api.nvim_get_current_buf()')
  }
  const launches = () => lua('return vim.g.mkdp_test_urls')
  const launched = async (action) => {
    const before = (await launches()).length
    await action()
    return until(
      async () => (await launches())[before],
      'Browser hook was not called'
    )
  }
  await rpc('nvim_get_api_info', [])
  return {
    root,
    dir,
    fixture,
    proc,
    rpc,
    lua,
    command,
    edit,
    launches,
    launched,
    diagnostics: async () => ({
      stderr,
      messages: await command('messages').catch(() => '')
    }),
    async shutdown(timeout = 10000) {
      if (proc.exitCode === null) {
        proc.stdin.write(msgpack.encode([2, 'nvim_command', ['qa!']]))
        await until(
          () => proc.exitCode !== null,
          'Neovim failed to shut down',
          timeout
        )
      }
    },
    async dispose() {
      if (proc.exitCode === null) {
        proc.stdin.write(msgpack.encode([2, 'nvim_command', ['qa!']]))
        try {
          await until(() => proc.exitCode !== null, 'Neovim did not exit', 3000)
        } catch (_) {
          proc.kill('SIGKILL')
        }
      }
      if (process.env.MKDP_KEEP_TEST_DATA)
        process.stderr.write('Test data: ' + dir + '\n')
      else await fs.rm(dir, { recursive: true, force: true })
    }
  }
}

module.exports = { session, until }
