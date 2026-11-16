const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const http = require('node:http')
const socketIO = require('socket.io')
const clientIO = require('socket.io-client')
const { until } = require('./helpers/session.cjs')

// Exercise real HTTP/socket transports while holding one Neovim RPC response.
// The barrier makes stop-during-connect deterministic without timing guesses.
test(
  'stop closes a browser that is still validating its Neovim buffer',
  { timeout: 10000 },
  async (t) => {
    let server,
      sockets,
      actions,
      browser,
      requested = 1,
      listenOptions
    let releaseLoaded, enteredLoaded
    const loaded = new Promise((resolve) => {
      releaseLoaded = resolve
    })
    const entered = new Promise((resolve) => {
      enteredLoaded = resolve
    })
    const variables = new Map()
    const plugin = {
      init(api) {
        actions = api
      },
      nvim: {
        buffers: Promise.resolve([]),
        async getVar(name) {
          return name === 'mkdp_port' ? 0 : ''
        },
        async setVar(name, value) {
          variables.set(name, value)
        },
        async call(name) {
          if (name === 'getbufvar') return requested
          if (name === 'bufloaded') {
            enteredLoaded()
            return loaded
          }
          return 0
        }
      }
    }
    const quiet = () => {}
    const sandbox = {
      exports: {},
      process: {
        stderr: process.stderr,
        exit(code) {
          throw new Error('Unexpected server exit: ' + code)
        }
      },
      require(name) {
        if (name === './nvim') return { plugin }
        if (name === 'http')
          return {
            createServer(handler) {
              server = http.createServer(handler)
              const listen = server.listen.bind(server)
              server.listen = (options, callback) => {
                listenOptions = options
                return listen(options, callback)
              }
              return server
            }
          }
        if (name === 'socket.io')
          return (...args) => {
            sockets = socketIO(...args)
            return sockets
          }
        if (name === './lib/util/logger')
          return () => ({ info: quiet, error: quiet })
        if (name === './lib/util/opener')
          return () => {
            throw new Error('The test must not launch a browser')
          }
        if (name === './lib/util/getIP') return { getIP: () => '127.0.0.1' }
        if (name === './routes')
          return (_, response) => {
            response.statusCode = 404
            response.end()
          }
        throw new Error('Unexpected server dependency: ' + name)
      }
    }
    vm.runInNewContext(
      fs.readFileSync(path.join(__dirname, '../app/server.js'), 'utf8'),
      sandbox
    )
    t.after(async () => {
      releaseLoaded(1)
      if (browser) browser.disconnect()
      if (sockets) await new Promise((resolve) => sockets.close(resolve))
    })
    sandbox.exports.run()
    await until(
      () => actions && server.listening,
      'Preview server did not initialize'
    )
    assert.equal(
      listenOptions.port,
      0,
      'Default previews must ask the OS for a free port'
    )
    assert.ok(server.address().port > 0)
    browser = clientIO('http://127.0.0.1:' + server.address().port, {
      query: { bufnr: '1' },
      transports: ['websocket'],
      forceNew: true,
      reconnection: false
    })
    let closed = false
    browser.on('close_page', () => {
      closed = true
    })
    await entered
    // Neovim Stop clears the requested flag and invokes this same RPC action.
    requested = 0
    actions.closePage({ bufnr: 1 })
    releaseLoaded(1)
    await until(() => closed, 'Stop lost the connecting browser', 2000)
    assert.equal(
      (variables.get('mkdp_preview_buffers') || []).includes(1),
      false
    )
  }
)
