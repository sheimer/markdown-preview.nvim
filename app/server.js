exports.run = function () {
  // attach nvim
  const { plugin } = require('./nvim')
  const http = require('http')
  const websocket = require('socket.io')

  const opener = require('./lib/util/opener')
  const logger = require('./lib/util/logger')('app/server')
  const { getIP } = require('./lib/util/getIP')
  const routes = require('./routes')

  let clients = {}

  const openUrl = (url, browser) => {
    const handler = opener(url, browser)
    handler.on('error', (err) => {
      const message = err.message || ''
      const match = message.match(/\s*spawn\s+(.+)\s+ENOENT\s*/)
      if (match) {
        plugin.nvim.call('mkdp#util#echo_messages', ['Error', [`[markdown-preview.nvim]: Can not open browser by using ${match[1]} command`]])
      } else {
        plugin.nvim.call('mkdp#util#echo_messages', ['Error', [err.name, err.message]])
      }
    })
  }

  const update_clients_active_var = () => {
    const active = Object.keys(clients).filter(bufnr => clients[bufnr].some(c => c.connected)).map(Number)
    plugin.nvim.setVar('mkdp_preview_buffers', active)
    plugin.nvim.setVar('mkdp_clients_active', active.length ? 1 : 0)
  }

  // http server
  const server = http.createServer(async (req, res) => {
    // plugin
    req.plugin = plugin
    // bufnr
    req.bufnr = (req.headers.referer || req.url)
      .replace(/[?#].*$/, '').split('/').pop()
    // request path
    req.asPath = req.url.replace(/[?#].*$/, '')
    req.mkcss = await plugin.nvim.getVar('mkdp_markdown_css')
    req.hicss = await plugin.nvim.getVar('mkdp_highlight_css')
    req.custImgPath = await plugin.nvim.getVar('mkdp_images_path')
    // routes
    routes(req, res)
  })

  server.on('error', (error) => {
    logger.error('Preview server failed: ', error)
    // A bind failure cannot recover in this process. Exit so Neovim can retry
    // and never leave an uninitialized RPC application blocking editor shutdown.
    process.stderr.write('[markdown-preview.nvim] Cannot start preview server: ' + error.message + '\n', () => process.exit(1))
  })

  // websocket server
  const io = websocket(server, {
    // Check browser origins for polling and WebSocket handshakes. Native
    // clients may omit Origin; this is not remote authentication.
    allowRequest(req, done) {
      if (req.headers.origin === undefined) return done(null, true)
      try {
        const origin = new URL(req.headers.origin).origin
        const address = new URL('http://' + req.headers.host).origin
        done(null, origin === address)
      } catch (error) {
        done(null, false)
      }
    }
  })

  io.on('connection', async (client) => {
    const { handshake = { query: {} } } = client
    const bufnr = Number(handshake.query.bufnr)
    if (!Number.isSafeInteger(bufnr) || bufnr < 1) {
      client.disconnect(true)
      return
    }

    // Register before awaiting RPC calls so stop/delete can see in-flight clients.
    const removeClient = () => {
      clients[bufnr] = (clients[bufnr] || []).filter(c => c.id !== client.id)
      update_clients_active_var()
    }
    client.on('disconnect', removeClient)
    clients[bufnr] = clients[bufnr] || []
    clients[bufnr].push(client)

    const requested = await plugin.nvim.call('getbufvar', [bufnr, 'mkdp_preview_requested', 0])
    const loaded = await plugin.nvim.call('bufloaded', [bufnr])
    if (!Number(requested) || !loaded || !(clients[bufnr] || []).includes(client)) {
      client.emit('close_page')
      removeClient()
      return
    }
    if (!client.connected) return removeClient()
    plugin.nvim.call('setbufvar', [bufnr, 'mkdp_preview_pending', 0])
    logger.info('client connect: ', client.id, bufnr)
    update_clients_active_var()

    const buffers = await plugin.nvim.buffers
    buffers.forEach(async (buffer) => {
      if (buffer.id === Number(bufnr)) {
        const winline = await plugin.nvim.call('winline')
        const currentWindow = await plugin.nvim.window
        const winheight = await plugin.nvim.call('winheight', currentWindow.id)
        const cursor = await plugin.nvim.call('getpos', '.')
        const options = await plugin.nvim.getVar('mkdp_preview_options')
        const pageTitle = await plugin.nvim.getVar('mkdp_page_title')
        const theme = await plugin.nvim.getVar('mkdp_theme')
        const name = await buffer.name
        const content = await buffer.getLines()
        const currentBuffer = await plugin.nvim.buffer
        if (!client.connected || !(clients[bufnr] || []).includes(client)) return
        client.emit('refresh_content', {
          options,
          isActive: currentBuffer.id === buffer.id,
          winline,
          winheight,
          cursor,
          pageTitle,
          theme,
          name,
          content
        })
      }
    })
  })

  async function startServer () {
    const openToTheWord = await plugin.nvim.getVar('mkdp_open_to_the_world')
    const host = openToTheWord ? '0.0.0.0' : '127.0.0.1'
    let port = await plugin.nvim.getVar('mkdp_port')
    // Let the OS reserve a free port atomically for independent editor instances.
    port = port || 0
    server.listen({
      host,
      port
    }, function () {
      port = server.address().port
      logger.info('server run: ', port)
      function refreshPage ({ bufnr, data }) {
        logger.info('refresh page: ', bufnr)
        ;(clients[bufnr] || []).forEach(c => {
          if (c.connected) {
            c.emit('refresh_content', data)
          }
        })
      }
      function closePage ({ bufnr }) {
        logger.info('close page: ', bufnr)
        clients[bufnr] = (clients[bufnr] || []).filter(c => {
          if (c.connected) {
            c.emit('close_page')
            return false
          }
          return true
        })
        update_clients_active_var()
      }
      function closeAllPages () {
        logger.info('close all pages')
        Object.keys(clients).forEach(bufnr => {
          ;(clients[bufnr] || []).forEach(c => {
            if (c.connected) {
              c.emit('close_page')
            }
          })
        })
        clients = {}
        update_clients_active_var()
      }
      async function openBrowser ({ bufnr }) {
        const requested = await plugin.nvim.call('getbufvar', [Number(bufnr), 'mkdp_preview_requested', 1])
        if (!Number(requested) || (clients[bufnr] || []).some(c => c.connected)) return
        const combinePreview = await plugin.nvim.getVar('mkdp_combine_preview')
        if (combinePreview && Object.values(clients).some(cs => cs.some(c => c.connected))) {
          logger.info(`combine preview page: `, bufnr)
          Object.values(clients).forEach(cs => {
            cs.forEach(c => {
              if (c.connected) {
                c.emit('change_bufnr', bufnr)
              }
            })
          })
        } else {
          const openIp = await plugin.nvim.getVar('mkdp_open_ip')
          const openHost = openIp !== '' ? openIp : (openToTheWord ? getIP() : 'localhost')
          const url = `http://${openHost}:${port}/page/${bufnr}`
          const browserfunc = await plugin.nvim.getVar('mkdp_browserfunc')
          if (browserfunc !== '') {
            logger.info(`open page [${browserfunc}]: `, url)
            plugin.nvim.call(browserfunc, [url])
          } else {
            const browser = await plugin.nvim.getVar('mkdp_browser')
            logger.info(`open page [${browser || 'default'}]: `, url)
            if (browser !== '') {
              openUrl(url, browser)
            } else {
              openUrl(url)
            }
          }
          const isEchoUrl = await plugin.nvim.getVar('mkdp_echo_preview_url')
          if (isEchoUrl) {
            plugin.nvim.call('mkdp#util#echo_url', [url])
          }
        }
      }
      plugin.init({
        refreshPage,
        closePage,
        closeAllPages,
        openBrowser
      })

      // The Lua adapter queues explicit buffer IDs while this server starts.
      plugin.nvim.setVar('mkdp_preview_ready', 1)
    })
  }

  startServer()
}
