const fs = require('fs')
const path = require('path')
const logger = require('./lib/util/logger')('app/routes')

const routes = []

const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf'
}

function sendFile(filename, res) {
  try {
    if (!fs.statSync(filename).isFile()) return false
  } catch (error) {
    return false
  }
  const contentType = contentTypes[path.extname(filename).toLowerCase()]
  if (contentType) res.setHeader('Content-Type', contentType)
  const stream = fs.createReadStream(filename)
  stream.on('error', (error) => {
    logger.error('Could not read preview asset: ', filename, error)
    if (res.headersSent) return res.destroy()
    res.statusCode = 404
    res.end('Preview asset not found.')
  })
  stream.pipe(res)
  return true
}

function staticAsset(root, filename, res) {
  const directory = path.resolve(root)
  const target = path.resolve(directory, filename)
  const relative = path.relative(directory, target)
  if (relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) return false
  return sendFile(target, res)
}

const use = function (route) {
  routes.unshift((req, res, next) => () => route(req, res, next))
}

// Real links preserve the browser's tab/window actions without popup scripts.
use(async (req, res, next) => {
  const match = /^\/_markdown_link\/(\d+)\/(.+)$/.exec(req.asPath)
  if (!match) return next()
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Content-Type', 'text/plain; charset=utf-8')
  if (req.method !== 'GET') {
    res.statusCode = 405
    res.setHeader('Allow', 'GET')
    return res.end('Open document links with GET.')
  }
  try {
    // Decode the route wrapper, then Markdown's URL-encoded filename.
    const filename = decodeURIComponent(decodeURIComponent(match[2]))
    const result = await req.plugin.nvim.call('luaeval', [
      "require('markdown_preview').resolve_link(_A[1], _A[2])",
      [Number(match[1]), filename]
    ])
    if (!result.bufnr) {
      res.statusCode = 404
      return res.end(result.error || 'Cannot open this Markdown document.')
    }
    // Browsers carry the original #fragment through this redirect.
    res.statusCode = 302
    res.setHeader('Location', '/page/' + result.bufnr)
    res.end()
  } catch (error) {
    logger.error('Markdown document link failed: ', error)
    res.statusCode = 400
    res.end('Cannot open this Markdown document. Check the link and the messages in Neovim.')
  }
})

// /page/:number
use((req, res, next) => {
  if (/^\/page\/\d+$/.test(req.asPath)) {
    if (sendFile('./out/index.html', res)) return
  }
  next()
})

// /_next/path
use((req, res, next) => {
  if (req.asPath.startsWith('/_next/')) {
    if (staticAsset('./out/_next', req.asPath.slice('/_next/'.length), res)) return
  }
  next()
})

// /_static/markdown.css
// /_static/highlight.css
use((req, res, next) => {
  try {
    if (req.mkcss && req.asPath === '/_static/markdown.css') {
      if (fs.existsSync(req.mkcss)) {
        if (sendFile(req.mkcss, res)) return
      }
    } else if (req.hicss && req.asPath === '/_static/highlight.css') {
      if (fs.existsSync(req.hicss)) {
        if (sendFile(req.hicss, res)) return
      }
    }
  } catch (e) {
    logger.error('load diy css fail: ', req.asPath, req.mkcss, req.hicss)
  }
  next()
})

// /_static/path
use((req, res, next) => {
  if (req.asPath.startsWith('/_static/')) {
    if (staticAsset('./_static', req.asPath.slice('/_static/'.length), res)) return
  }
  next()
})

// images
use(async (req, res, next) => {
  logger.info('image route: ', req.asPath)
  const reg = /^\/_local_image_/
  if (reg.test(req.asPath) && req.asPath !== '') {
    const plugin = req.plugin
    const buffers = await plugin.nvim.buffers
    const buffer = buffers.find(b => b.id === Number(req.bufnr))
    if (buffer) {
      let fileDir = ''
      if (req.custImgPath !== '' ){
        fileDir = req.custImgPath
      } else {
        fileDir = await plugin.nvim.call('expand', `#${req.bufnr}:p:h`)
      }

      logger.info('fileDir', fileDir)

      const  mingw_home=process.env.MINGW_HOME;
      if (mingw_home){
        if(! fileDir.includes(':')){
          // fileDir is unix-like:      /Z/x/y/...., 'Z' means Z:
          // the win-like fileDir should be: Z:\x\y...
          const { execFileSync } = require('node:child_process')
          const result = execFileSync('cygpath.exe', ['-w', '-a', fileDir])
          fileDir = result.toString('utf8').trim()

          logger.info('New fileDir',fileDir);
        }  
      }

      let imgPath = decodeURIComponent(decodeURIComponent(req.asPath.replace(reg, '')))
      imgPath = imgPath.replace(/\\ /g, ' ')
      if (imgPath[0] !== '/' && imgPath[0] !== '\\') {
        imgPath = path.join(fileDir, imgPath)
      } else if (!fs.existsSync(imgPath)) {
        let tmpDirPath = fileDir
        while (true) {
          const parent = path.dirname(tmpDirPath)
          if (parent === tmpDirPath) break
          tmpDirPath = parent
          let tmpImgPath = path.join(tmpDirPath, imgPath)
          if (fs.existsSync(tmpImgPath)) {
            imgPath = tmpImgPath
            break
          }
        }
      }
      logger.info('imgPath', imgPath);
      
      if (fs.existsSync(imgPath) && !fs.statSync(imgPath).isDirectory()) {
        if (imgPath.endsWith('svg')) {
          res.setHeader('content-type', 'image/svg+xml')
        }
        if (sendFile(imgPath, res)) return
      }
      logger.error('image not exists: ', imgPath)
    }
  }
  next()
})

// 404
use((req, res) => {
  res.statusCode = 404
  if (!sendFile(path.join('./out', '404.html'), res)) res.end('Preview document or asset not found.')
})

module.exports = function (req, res, next) {
  return routes.reduce((next, route) => route(req, res, next), next)()
}
