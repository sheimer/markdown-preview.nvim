// Optional smoke against an installed Firefox, using an isolated profile:
// MKDP_SYSTEM_FIREFOX=/path/to/firefox node test/system-firefox.cjs
// Set MKDP_PERSONAL_BROWSER_HELPER=/path/to/browser_helper.lua to exercise its
// setup() and launch hook too. Otherwise this installs a minimal public hook.
// Runs headless with no-remote; it never opens the normal Firefox profile.
const fs = require('node:fs/promises')
const path = require('node:path')
const net = require('node:net')
const assert = require('node:assert/strict')
const { session, until } = require('./helpers/session.cjs')

const executable = process.env.MKDP_SYSTEM_FIREFOX
if (!executable || !path.isAbsolute(executable)) {
  throw new Error('Set MKDP_SYSTEM_FIREFOX to the absolute path of an installed Firefox executable.')
}
const helper = process.env.MKDP_PERSONAL_BROWSER_HELPER
if (helper && !path.isAbsolute(helper)) {
  throw new Error('MKDP_PERSONAL_BROWSER_HELPER must be an absolute path.')
}
process.env.MOZ_MARIONETTE = '1'
process.env.MOZ_HEADLESS = '1'
process.env.MOZ_NO_REMOTE = '1'

let nvim, socket, command, browserPID
const value = result => result && typeof result === 'object' && 'value' in result ? result.value : result

async function unusedPort() {
  const server = net.createServer()
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const port = server.address().port
  await new Promise(resolve => server.close(resolve))
  return port
}

async function connect(port) {
  socket = await until(() => new Promise(resolve => {
    const candidate = net.connect(port, '127.0.0.1')
    candidate.once('error', () => { candidate.destroy(); resolve(false) })
    candidate.once('connect', () => resolve(candidate))
  }), 'Firefox Marionette port did not become ready', 30000)
  let bytes = Buffer.alloc(0)
  let sequence = 0
  const pending = new Map()
  const greeting = new Promise(resolve => {
    socket.on('data', chunk => {
      bytes = Buffer.concat([bytes, chunk])
      while (true) {
        const colon = bytes.indexOf(58)
        if (colon < 0) break
        const length = Number(bytes.subarray(0, colon).toString())
        if (bytes.length < colon + 1 + length) break
        const message = JSON.parse(bytes.subarray(colon + 1, colon + 1 + length))
        bytes = bytes.subarray(colon + 1 + length)
        if (!Array.isArray(message)) { resolve(message); continue }
        const waiter = pending.get(message[1])
        if (!waiter) continue
        pending.delete(message[1])
        clearTimeout(waiter.timer)
        if (message[2]) waiter.reject(new Error(JSON.stringify(message[2])))
        else waiter.resolve(message[3])
      }
    })
    socket.on('error', error => {
      for (const waiter of pending.values()) {
        clearTimeout(waiter.timer)
        waiter.reject(error)
      }
      pending.clear()
    })
  })
  command = (name, args = {}) => new Promise((resolve, reject) => {
    const id = ++sequence
    const data = JSON.stringify([0, id, name, args])
    const timer = setTimeout(() => {
      pending.delete(id)
      reject(new Error('Marionette command timed out: ' + name))
    }, 15000)
    pending.set(id, { resolve, reject, timer })
    socket.write(Buffer.byteLength(data) + ':' + data)
  })
  assert.equal((await greeting).marionetteProtocol, 3)
}

async function execute(script, args = []) {
  return value(await command('WebDriver:ExecuteScript', {
    script, args, newSandbox: true, sandbox: 'default', line: 1, filename: 'system-firefox.cjs'
  }))
}
const handles = async () => value(await command('WebDriver:GetWindowHandles'))
async function click(selector) {
  const element = value(await command('WebDriver:FindElement', { using: 'css selector', value: selector }))
  await command('WebDriver:ElementClick', { id: element[Object.keys(element)[0]] })
}

async function run() {
  await fs.access(executable, fs.constants.X_OK)
  nvim = await session()
  let profile
  if (helper) {
    await nvim.lua(`local binary, helper = ...
vim.g.mkdp_firefox_binary = binary
vim.g.mkdp_firefox_mode = 'window'
dofile(helper).setup()`, [executable, helper])
    profile = await nvim.lua('return vim.g.mkdp_firefox_preview_profile')
    assert.ok(profile && profile.startsWith(nvim.dir + path.sep), 'The helper must use the isolated stdpath data directory')
    const args = await nvim.lua('return vim.g.mkdp_browser_command')
    assert.equal(args[0], executable)
    console.log('Personal launch helper:', args)
  } else {
    profile = path.join(nvim.dir, 'firefox-profile')
    await fs.mkdir(profile)
    await nvim.lua(`local binary, profile = ...
vim.g.mkdp_browser_command = {binary, '--profile', profile, '--new-window'}
vim.cmd([[
function! MkdpSystemFirefox(url) abort
  call jobstart(g:mkdp_browser_command + [a:url], {'detach': v:true})
endfunction
]])
vim.g.mkdp_browserfunc = 'MkdpSystemFirefox'`, [executable, profile])
  }
  const port = await unusedPort()
  await fs.appendFile(path.join(profile, 'user.js'), `
user_pref("marionette.port", ${port});
user_pref("browser.shell.checkDefaultBrowser", false);
user_pref("browser.aboutwelcome.enabled", false);
user_pref("dom.disable_open_during_load", false);
`)
  const sourceBuf = await nvim.edit('markdown-preview-links.md')
  await nvim.command('MarkdownPreview')
  // The personal helper uses jobstart too; capture only this isolated launch.
  browserPID = await until(() => nvim.lua(`local binary, profile = ...
for _, channel in ipairs(vim.api.nvim_list_chans()) do
  if channel.argv and channel.argv[1] == binary and vim.tbl_contains(channel.argv, profile) then
    return vim.fn.jobpid(channel.id)
  end
end`, [executable, profile]), 'The browser hook did not start Firefox')
  await connect(port)
  const info = await command('WebDriver:NewSession', { acceptInsecureCerts: true })
  assert.equal(info.capabilities['moz:processID'], browserPID)
  assert.equal(info.capabilities['moz:headless'], true)
  console.log('System Firefox:', info.capabilities.browserVersion, info.capabilities['moz:buildID'])
  await until(() => execute('return document.querySelector(".markdown-body")?.textContent.includes("Markdown preview links")'), 'Source did not render', 15000)
  const source = value(await command('WebDriver:GetWindowHandle'))
  const appearance = await execute('return {sticky:getComputedStyle(document.querySelector("#page-header")).position,palette:document.querySelector("main").dataset.palette}')
  assert.deepEqual(appearance, { sticky: 'sticky', palette: 'forest' })
  // Keep a blank tab alive so closing every preview leaves Marionette running.
  await command('WebDriver:NewWindow', { type: 'tab' })
  await command('WebDriver:SwitchToWindow', { handle: source })
  const before = await handles()
  await click('a[href*="detail%2520with%2520spaces.md"]')
  const target = await until(async () => (await handles()).find(handle => !before.includes(handle)), 'Linked tab did not open')
  await command('WebDriver:SwitchToWindow', { handle: target })
  await until(() => execute('return document.querySelector(".markdown-body")?.textContent.includes("Linked detail document")'), 'Linked document did not render')
  assert.equal(await nvim.lua('return vim.api.nvim_get_current_buf()'), sourceBuf)
  const targetBuf = Number((await execute('return location.pathname')).split('/').pop())
  assert.deepEqual(await nvim.lua('return {vim.bo[...].buflisted, #vim.fn.win_findbuf(...)}', [targetBuf]), [true, 0])
  await nvim.lua(`vim.api.nvim_set_current_buf(...)
vim.api.nvim_buf_set_lines(0, 0, 0, false, {'SYSTEM FIREFOX UNSAVED', ''})
vim.api.nvim_exec_autocmds('TextChanged', {buffer=0})`, [targetBuf])
  await until(() => execute('return document.body.textContent.includes("SYSTEM FIREFOX UNSAVED")'), 'Unsaved edit did not refresh')
  await nvim.command('MarkdownPreviewStop')
  await until(async () => !(await handles()).includes(target), 'Stop did not close the linked tab')
  assert.ok((await handles()).includes(source))
  await nvim.shutdown()
  await until(async () => !(await handles()).includes(source), 'Shutdown did not close the source')
  console.log('System Firefox hook, rendering, native links, hidden buffers, unsaved updates, per-buffer stop and shutdown passed.')
}

run().catch(error => {
  console.error(error)
  process.exitCode = 1
}).finally(async () => {
  if (command) await command('Marionette:Quit', { flags: ['eForceQuit'] }).catch(() => {})
  if (socket) socket.destroy()
  if (browserPID) {
    await until(() => {
      try { process.kill(browserPID, 0); return false } catch (_) { return true }
    }, 'Isolated Firefox did not quit', 10000).catch(() => {
      try { process.kill(browserPID, 'SIGKILL') } catch (_) {}
    })
  }
  if (nvim) await nvim.dispose()
}).catch(error => {
  console.error(error)
  process.exitCode = 1
})
