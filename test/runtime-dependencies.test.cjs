const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const { io } = require('socket.io-client')
const { chromium, firefox } = require('playwright')
const { session, until } = require('./helpers/session.cjs')

test(
  'polling and WebSocket previews enforce origins and preserve large unsaved documents',
  { timeout: 30000 },
  async (t) => {
    const nvim = await session()
    const clients = []
    t.after(async () => {
      clients.forEach((client) => client.disconnect())
      await nvim.dispose()
    })
    const buf = await nvim.edit('markdown-preview-links.md')
    const url = await nvim.launched(() => nvim.command('MarkdownPreview'))
    const received = []
    for (const transport of ['polling', 'websocket']) {
      const messages = []
      received.push(messages)
      const client = io(new URL(url).origin, {
        query: { bufnr: buf },
        extraHeaders: { Origin: new URL(url).origin },
        transports: [transport],
        forceNew: true,
        reconnection: false
      })
      clients.push(client)
      client.on('refresh_content', (data) => messages.push(data))
      await until(
        () => messages.length > 0,
        transport + ' did not receive its document'
      )
      assert.equal(client.io.engine.transport.name, transport)
    }

    // CORS checks do not cover WebSocket; both transports must reject foreign
    // browser origins before a preview connection is accepted.
    for (const transport of ['polling', 'websocket']) {
      for (const origin of [
        'https://unrelated.example',
        'null',
        'not-an-origin'
      ]) {
        const rejected = io(new URL(url).origin, {
          query: { bufnr: buf },
          transports: [transport],
          extraHeaders: { Origin: origin },
          forceNew: true,
          reconnection: false,
          timeout: 2000
        })
        clients.push(rejected)
        await new Promise((resolve, reject) => {
          rejected.once('connect', () =>
            reject(new Error(transport + ' accepted foreign Origin ' + origin))
          )
          rejected.once('connect_error', (error) => {
            if (error.message === 'timeout') reject(error)
            else resolve()
          })
        })
        rejected.disconnect()
      }
    }
    const forbidden = await fetch(
      new URL('/socket.io/?EIO=4&transport=polling', url),
      {
        headers: { Origin: 'https://unrelated.example' }
      }
    )
    assert.equal(forbidden.status, 403)

    // Socket.IO 3+ lowered the inbound limit to 1 MiB. Documents travel from
    // server to browser; both transports must still deliver larger content.
    const lines = [
      '# Large unsaved preview',
      'x'.repeat(1100000),
      'Complete document tail'
    ]
    await nvim.lua(
      `local buf, lines = ...
vim.api.nvim_buf_set_lines(buf, 0, -1, false, lines)
vim.api.nvim_exec_autocmds('TextChanged', {buffer = buf})`,
      [buf, lines]
    )
    for (const messages of received) {
      await until(
        () => messages.some((data) => data.content[2] === lines[2]),
        'Large live update was not delivered'
      )
      assert.deepEqual(messages.at(-1).content, lines)
    }
    assert.equal(
      await fs
        .readFile(path.join(nvim.fixture, 'markdown-preview-links.md'), 'utf8')
        .then((text) => text.includes(lines[2])),
      false
    )

    received[0].length = 0
    clients[0].disconnect().connect()
    await until(
      () => received[0].length > 0,
      'Reconnected preview did not recover the unsaved document'
    )
    assert.deepEqual(received[0].at(-1).content, lines)
    const previews = clients.filter((client) => client.connected)
    assert.equal(previews.length, 2)
    const closed = previews.map(
      (client) => new Promise((resolve) => client.once('close_page', resolve))
    )
    await nvim.command('MarkdownPreviewStop')
    await Promise.all(closed)
  }
)

test(
  'pathological smart quotes render without freezing a live browser preview',
  { timeout: 30000 },
  async (t) => {
    const nvim = await session()
    t.after(() => nvim.dispose())
    const engine =
      process.env.MKDP_TEST_BROWSER === 'firefox' ? firefox : chromium
    const browser = await engine.launch({
      headless: true,
      ...(process.env.MKDP_TEST_BROWSER_EXECUTABLE
        ? { executablePath: process.env.MKDP_TEST_BROWSER_EXECUTABLE }
        : {})
    })
    t.after(() => browser.close())
    const page = await browser.newPage()
    await page.route('**/*', (route) =>
      ['localhost', '127.0.0.1', '[::1]'].includes(
        new URL(route.request().url()).hostname
      )
        ? route.continue()
        : route.abort()
    )
    await nvim.edit('markdown-preview-links.md')
    const url = await nvim.launched(() => nvim.command('MarkdownPreview'))
    await page.goto(url)
    await page.locator('.markdown-body h1').waitFor()
    await until(
      () =>
        page.evaluate(
          () => window.socket.io.engine.transport.name === 'websocket'
        ),
      'Default browser transport did not upgrade to WebSocket'
    )

    await nvim.lua(`vim.api.nvim_buf_set_lines(0, 0, -1, false, {
  '# Parser compatibility', '', 'Visit www.example.com or reader@example.com.', '',
  '"Quoted" -- typography.', '', '[Unsafe link](javascript:alert(1))'
})
vim.api.nvim_exec_autocmds('TextChanged', {buffer = 0})`)
    await page.getByRole('link', { name: 'www.example.com' }).waitFor()
    assert.equal(
      await page
        .getByRole('link', { name: 'www.example.com' })
        .getAttribute('href'),
      'http://www.example.com'
    )
    assert.equal(
      await page
        .getByRole('link', { name: 'reader@example.com' })
        .getAttribute('href'),
      'mailto:reader@example.com'
    )
    await page.getByText('“Quoted” – typography.', { exact: true }).waitFor()
    assert.equal(
      await page.getByRole('link', { name: 'Unsafe link' }).count(),
      0
    )

    // GHSA-r7fv-28h4-cvq7: unmatched closing quotes repeatedly scan the opener
    // stack when typographer=true, as it is in the plugin's default renderer.
    const lines = [
      '# Smart quote regression',
      '',
      '"a '.repeat(80000) + "b' ".repeat(80000),
      '',
      'Tail after smart quotes'
    ]
    await nvim.lua(
      `local lines = ...
vim.api.nvim_buf_set_lines(0, 0, -1, false, lines)
vim.api.nvim_exec_autocmds('TextChanged', {buffer = 0})`,
      [lines]
    )
    await page
      .getByText('Tail after smart quotes', { exact: true })
      .waitFor({ timeout: 4000 })
    // A subsequent edit must still update normally, not merely complete one parse.
    await nvim.lua(`vim.api.nvim_buf_set_lines(0, 0, -1, false, {'# Responsive after large input'})
vim.api.nvim_exec_autocmds('TextChanged', {buffer = 0})`)
    await page
      .getByRole('heading', { name: 'Responsive after large input' })
      .waitFor({ timeout: 4000 })
  }
)
