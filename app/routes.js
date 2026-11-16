const fs = require('fs')
const path = require('path')
const logger = require('./lib/util/logger')('app/routes')

const routes = []

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
  if (/\/page\/\d+/.test(req.asPath)) {
    return fs.createReadStream('./out/index.html').pipe(res)
  }
  next()
})

// /_next/path
use((req, res, next) => {
  if (/\/_next/.test(req.asPath)) {
    return fs.createReadStream(path.join('./out', req.asPath)).pipe(res)
  }
  next()
})

// /_static/markdown.css
// /_static/highlight.css
use((req, res, next) => {
  try {
    if (req.mkcss && req.asPath === '/_static/markdown.css') {
      if (fs.existsSync(req.mkcss)) {
        return fs.createReadStream(req.mkcss).pipe(res)
      }
    } else if (req.hicss && req.asPath === '/_static/highlight.css') {
      if (fs.existsSync(req.hicss)) {
        return fs.createReadStream(req.hicss).pipe(res)
      }
    }
  } catch (e) {
    logger.error('load diy css fail: ', req.asPath, req.mkcss, req.hicss)
  }
  next()
})

// /_static/path
use((req, res, next) => {
  if (/\/_static/.test(req.asPath)) {
    const fpath = path.join('./', req.asPath)
    if (fs.existsSync(fpath)) {
      return fs.createReadStream(fpath).pipe(res)
    } else {
      logger.error('No such file:', req.asPath, req.mkcss, req.hicss)
    }
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
          const cygpath = 'cygpath.exe'
          const cmd=cygpath+' -w'+' -a '+fileDir ;
          logger.info('cmd',cmd)
       
          const { execSync } = require('node:child_process');
          const result = execSync(cmd);
          fileDir=result.toString('utf8').replace('\n','');

          logger.info('New fileDir',fileDir);
        }  
      }

      let imgPath = decodeURIComponent(decodeURIComponent(req.asPath.replace(reg, '')))
      imgPath = imgPath.replace(/\\ /g, ' ')
      if (imgPath[0] !== '/' && imgPath[0] !== '\\') {
        imgPath = path.join(fileDir, imgPath)
      } else if (!fs.existsSync(imgPath)) {
        let tmpDirPath = fileDir
        while (tmpDirPath !== '/' && tmpDirPath !== '\\') {
          tmpDirPath = path.normalize(path.join(tmpDirPath, '..'))
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
        return fs.createReadStream(imgPath).pipe(res)
      }
      logger.error('image not exists: ', imgPath)
    }
  }
  next()
})

// 404
use((req, res) => {
  res.statusCode = 404
  return fs.createReadStream(path.join('./out', '404.html')).pipe(res)
})

module.exports = function (req, res, next) {
  return routes.reduce((next, route) => route(req, res, next), next)()
}
