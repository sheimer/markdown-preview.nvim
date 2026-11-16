const { test } = require('node:test')
const assert = require('node:assert/strict')
const io = require('socket.io-client')
const { session, until } = require('./helpers/session.cjs')

test('independent editors receive distinct default ports and keep their own live contents', async (t) => {
  const editors = []
  const sockets = []
  t.after(async () => {
    sockets.forEach((socket) => socket.close())
    await Promise.all(editors.map((editor) => editor.dispose()))
  })
  for (let i = 0; i < 2; i++) editors.push(await session())
  const urls = await Promise.all(
    editors.map(async (editor, index) => {
      await editor.edit('markdown-preview-links.md')
      await editor.lua('vim.api.nvim_buf_set_lines(0, 0, -1, false, {...})', [
        '# Independent editor ' + index
      ])
      return new URL(
        await editor.launched(() => editor.command('MarkdownPreview'))
      )
    })
  )
  assert.notEqual(urls[0].port, urls[1].port)
  assert.ok(urls.every((url) => Number(url.port) > 0))
  for (const [index, url] of urls.entries()) {
    // The server binds IPv4 loopback; avoid a native client's IPv6-only lookup.
    url.hostname = '127.0.0.1'
    assert.equal((await fetch(url)).status, 200)
    const socket = io(url.origin, {
      query: { bufnr: url.pathname.split('/').pop() },
      transports: ['websocket'],
      forceNew: true,
      reconnection: false
    })
    sockets.push(socket)
    let content
    socket.on('refresh_content', (data) => {
      content = data.content
    })
    await until(
      () => content?.[0] === '# Independent editor ' + index,
      'The preview must receive content from its own editor'
    )
  }
  await editors[0].shutdown()
  await until(() => !sockets[0].connected, 'The first preview did not close')
  assert.equal(sockets[1].connected, true)
  assert.equal((await fetch(urls[1])).status, 200)
})
