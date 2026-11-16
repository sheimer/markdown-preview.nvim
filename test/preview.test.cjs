const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const { chromium, firefox } = require('playwright')
const { session, until } = require('./helpers/session.cjs')

// This exercises the installed plugin through its public commands, real RPC
// server and exported frontend. No user's init.lua, data directory or profile
// participates. Run `npm run build` before this test.
test(
  'standalone preview navigation, rendering and per-buffer lifecycle',
  { timeout: 180000 },
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
    const context = await browser.newContext({
      viewport: { width: 1100, height: 800 }
    })
    // Keep core rendering independent of external networks. PlantUML's remote
    // image service is deliberately outside this offline smoke test.
    await context.route('**/*', (route) => {
      const url = new URL(route.request().url())
      return ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
        ? route.continue()
        : route.abort()
    })
    const errors = []
    context.on('page', (page) =>
      page.on('pageerror', (error) => errors.push(error.message))
    )
    const control = await context.newPage()
    const popup = async (action) => {
      const [page] = await Promise.all([context.waitForEvent('page'), action()])
      await page.waitForLoadState('domcontentloaded')
      return page
    }
    const openURL = (url) =>
      popup(() => control.evaluate((url) => window.open(url, '_blank'), url))
    const start = async () =>
      openURL(await nvim.launched(() => nvim.command('MarkdownPreview')))
    const rendered = async (page, text) => {
      await page.locator('.markdown-body').filter({ hasText: text }).waitFor()
      await until(
        () => page.evaluate(() => !!window.socket && window.socket.connected),
        'Preview socket did not connect'
      )
      await until(
        () =>
          page.evaluate(() => {
            const styles = [
              ...document.querySelectorAll('link[rel=stylesheet]')
            ]
            return (
              styles.length >= 5 &&
              styles.every(
                (style) => style.sheet && style.sheet.cssRules.length > 0
              )
            )
          }),
        'Preview styles did not load'
      )
      await page.evaluate(() => {
        if (window.__mkdpRefreshTrace) return
        window.__mkdpRefreshTrace = []
        window.socket.on('refresh_content', (data) => {
          window.__mkdpRefreshTrace.push({
            firstLine: data.content[0],
            time: performance.now(),
            visibility: document.visibilityState
          })
          if (window.__mkdpRefreshTrace.length > 12)
            window.__mkdpRefreshTrace.shift()
        })
      })
    }
    const clickDocument = (page, label, options) =>
      popup(() =>
        page.getByRole('link', { name: label, exact: true }).click(options)
      )
    const closed = (page) =>
      until(() => page.isClosed(), 'Preview did not close')
    async function step(name, check) {
      let failure
      await t.test(name, async () => {
        try {
          await check()
        } catch (error) {
          const pages = await Promise.all(
            context.pages().map(async (page) => ({
              url: page.url(),
              state: await page
                .evaluate(() => ({
                  text: document
                    .querySelector('.markdown-body')
                    ?.textContent.slice(0, 160),
                  connected: window.socket?.connected,
                  transport: window.socket?.io.engine?.transport.name,
                  visibility: document.visibilityState,
                  received: window.__mkdpRefreshTrace
                }))
                .catch(() => null)
            }))
          )
          t.diagnostic(
            JSON.stringify({
              pages,
              buffers: await nvim
                .lua('return vim.g.mkdp_preview_buffers')
                .catch(() => null)
            })
          )
          failure = error
          throw error
        }
      })
      if (failure) throw failure
    }
    let source, sourceBuf, targetBuf, detail, secondDetail, table

    await step(
      'public start hook and independent palettes render without private modules',
      async () => {
        sourceBuf = await nvim.edit('markdown-preview-links.md')
        source = await start()
        await rendered(source, 'Markdown preview links')
        assert.match(source.url(), new RegExp('/page/' + sourceBuf + '$'))
        assert.equal(
          await source.locator('main').getAttribute('data-theme'),
          'light'
        )
        await source.locator('#preview-palette').selectOption('gruvbox')
        assert.equal(
          await source.locator('main').getAttribute('data-palette'),
          'gruvbox'
        )
        assert.equal(
          await source.locator('main').getAttribute('data-theme'),
          'light'
        )
        await source.locator('#theme').check()
        assert.equal(
          await source.locator('main').getAttribute('data-theme'),
          'dark'
        )
        assert.equal(
          await source.locator('main').getAttribute('data-palette'),
          'gruvbox'
        )
        await source.reload()
        await rendered(source, 'Markdown preview links')
        assert.equal(
          await source.locator('main').getAttribute('data-palette'),
          'gruvbox'
        )
        await until(
          () =>
            source
              .locator('#page-header')
              .evaluate((el) => getComputedStyle(el).position === 'sticky'),
          'Sticky header styles did not settle after reload'
        )
      }
    )

    await step(
      'custom document titles preserve template and filename characters as text',
      async () => {
        const title = await nvim.lua('return vim.g.mkdp_page_title')
        const filename = 'Title & spaces.md'
        const template = 'Preview & <title> ${name}'
        let page, buf
        await fs.writeFile(
          path.join(nvim.fixture, filename),
          '# Named document\n'
        )
        await nvim.lua('vim.g.mkdp_page_title = ...', [template])
        try {
          buf = await nvim.edit(filename)
          page = await start()
          await rendered(page, 'Named document')
          const expected = 'Preview & <title> Title & spaces'
          await until(
            async () => (await page.title()) === expected,
            'Custom document title did not update'
          )
          assert.equal(await page.locator('head title').count(), 1)
          await page.reload()
          await rendered(page, 'Named document')
          await until(
            async () => (await page.title()) === expected,
            'Custom document title did not survive reload'
          )
          await nvim.command('MarkdownPreviewStop')
          await closed(page)
        } finally {
          if (page && !page.isClosed()) await page.close()
          if (buf)
            await nvim.lua(
              'if vim.api.nvim_buf_is_valid(...) then vim.api.nvim_buf_delete(..., {force = true}) end',
              [buf]
            )
          await nvim.lua('vim.g.mkdp_page_title = ...', [title])
          await nvim.lua('vim.api.nvim_set_current_buf(...)', [sourceBuf])
        }
      }
    )

    await step(
      'start refreshes; native encoded and reference links reuse hidden listed buffers',
      async () => {
        const launches = (await nvim.launches()).length
        await nvim.command('MarkdownPreview')
        // A round trip after the public command drains RPC-triggered work.
        await nvim.lua('return vim.wait(200, function() return false end)')
        assert.equal((await nvim.launches()).length, launches)
        detail = await clickDocument(source, 'Detail document')
        await rendered(detail, 'Linked detail document')
        targetBuf = Number(new URL(detail.url()).pathname.split('/').pop())
        assert.notEqual(targetBuf, sourceBuf)
        assert.deepEqual(
          await nvim.lua(
            'return {vim.api.nvim_get_current_buf(), vim.bo[...].buflisted, #vim.fn.win_findbuf(...)}',
            [targetBuf]
          ),
          [sourceBuf, true, 0]
        )
        assert.equal(
          await nvim.lua('return vim.api.nvim_buf_get_name(...)', [targetBuf]),
          path.join(
            nvim.fixture,
            'markdown-preview-links/detail with spaces.md'
          )
        )
        secondDetail = await clickDocument(source, 'Reference-style detail', {
          button: 'middle'
        })
        await rendered(secondDetail, 'Linked detail document')
        assert.equal(new URL(secondDetail.url()).pathname, '/page/' + targetBuf)
        assert.equal(
          await source
            .getByRole('link', { name: 'Detail document', exact: true })
            .getAttribute('target'),
          '_blank'
        )
        assert.match(
          await source
            .getByRole('link', { name: 'Detail document', exact: true })
            .getAttribute('rel'),
          /noopener/
        )
      }
    )

    await step(
      'parent traversal and cross-document fragment scrolling preserve the editor',
      async () => {
        // Make the target heading far enough down to distinguish real scrolling.
        await nvim.lua(
          `local b = ...; local lines = vim.api.nvim_buf_get_lines(b, 0, -1, false)
local at = 1; for i, line in ipairs(lines) do if line == '## Linked heading' then at = i; break end end
for i = 1, 45 do table.insert(lines, at, 'Paragraph before linked heading ' .. i .. '.'); table.insert(lines, at, '') end
for i = 1, 35 do table.insert(lines, ''); table.insert(lines, 'Paragraph after linked heading ' .. i .. '.') end
vim.api.nvim_buf_set_lines(b, 0, -1, false, lines)`,
          [targetBuf]
        )
        const anchor = await clickDocument(source, 'A heading in that document')
        await rendered(anchor, 'Paragraph before linked heading')
        assert.equal(new URL(anchor.url()).hash, '#linked-heading')
        await until(
          () => anchor.evaluate(() => window.scrollY > 500),
          'Linked heading did not scroll'
        )
        const position = await anchor
          .locator('#linked-heading')
          .evaluate((el) => el.getBoundingClientRect().top)
        assert.ok(
          position >= -2 && position < 180,
          'Linked heading should be in the viewport: ' + position
        )
        table = await clickDocument(
          anchor,
          'Another document via a parent directory'
        )
        await rendered(table, 'gpiTotalReturn36')
        assert.equal(
          await nvim.lua('return vim.api.nvim_get_current_buf()'),
          sourceBuf
        )
        // markdown-it typography changes apostrophes; select by href instead.
        await source.locator('a[href="#local-heading"]').first().click()
        assert.equal(new URL(source.url()).hash, '#local-heading')
        // Shift-click requests a native browser window. Playwright represents its
        // page in this context; no preview click handler or popup script is used.
        const shifted = await clickDocument(source, 'Detail document', {
          modifiers: ['Shift']
        })
        await rendered(shifted, 'Linked detail document')
        assert.equal(new URL(shifted.url()).pathname, '/page/' + targetBuf)
        await shifted.close()
        await anchor.close()
      }
    )

    await step(
      'unsaved buffer updates reach every preview and linked requests reuse them',
      async () => {
        await nvim.lua(
          "vim.api.nvim_buf_set_lines(..., 0, 0, false, {'UNSAVED LIVE CONTENT', ''})",
          [targetBuf]
        )
        // Hidden buffer API edits have no TextChanged autocmd until shown; following
        // its link must nevertheless read the current buffer rather than the file.
        const unsaved = await clickDocument(source, 'Detail document')
        await rendered(unsaved, 'UNSAVED LIVE CONTENT')
        assert.equal(new URL(unsaved.url()).pathname, '/page/' + targetBuf)
        await nvim.lua('vim.api.nvim_set_current_buf(...)', [targetBuf])
        await nvim.lua(
          "vim.api.nvim_buf_set_lines(0, 0, 1, false, {'UPDATED IN ALL PREVIEWS'}); vim.api.nvim_exec_autocmds('TextChanged', {buffer=0})"
        )
        for (const page of [detail, secondDetail, unsaved]) {
          await until(
            () =>
              page.evaluate(() =>
                window.__mkdpRefreshTrace.some(
                  (event) => event.firstLine === 'UPDATED IN ALL PREVIEWS'
                )
              ),
            'A preview did not receive the unsaved content update'
          )
          // Check delivery independently of window activation, then inspect the
          // visible UI as a user would. Focusing does not request another refresh.
          await page.bringToFront()
          await rendered(page, 'UPDATED IN ALL PREVIEWS')
        }
        assert.equal(
          await fs
            .readFile(
              path.join(
                nvim.fixture,
                'markdown-preview-links/detail with spaces.md'
              ),
              'utf8'
            )
            .then((x) => x.includes('UPDATED IN ALL PREVIEWS')),
          false
        )
        await unsaved.close()
        await nvim.lua('vim.api.nvim_set_current_buf(...)', [sourceBuf])
      }
    )

    await step(
      'wide table values remain complete, selectable and keyboard scrollable',
      async () => {
        const wrapper = table.locator('.md-table-scroll').first()
        assert.equal(await wrapper.getAttribute('tabindex'), '0')
        assert.ok(
          (await wrapper.textContent()).includes(
            'data_de.md_german_property_index.retail_market_total_return'
          )
        )
        const geometry = await wrapper.evaluate((el) => ({
          width: el.clientWidth,
          content: el.scrollWidth,
          height: el.clientHeight,
          totalHeight: el.scrollHeight,
          header: getComputedStyle(el.querySelector('th')).position,
          select: getComputedStyle(el.querySelector('td')).userSelect
        }))
        assert.ok(geometry.content > geometry.width, JSON.stringify(geometry))
        const tall = table.locator('.md-table-scroll').last()
        const vertical = await tall.evaluate((el) => ({
          height: el.clientHeight,
          content: el.scrollHeight
        }))
        assert.ok(vertical.content > vertical.height, JSON.stringify(vertical))
        const headerTop = await tall
          .locator('th')
          .first()
          .evaluate((el) => el.getBoundingClientRect().top)
        await tall.evaluate((el) => {
          el.scrollTop = 150
        })
        const scrolledTop = await tall
          .locator('th')
          .first()
          .evaluate((el) => el.getBoundingClientRect().top)
        assert.ok(
          Math.abs(scrolledTop - headerTop) < 2,
          'Table header should remain sticky'
        )
        assert.equal(geometry.header, 'sticky')
        assert.notEqual(geometry.select, 'none')
        assert.equal(
          await wrapper
            .locator('code')
            .first()
            .evaluate((el) => {
              const range = document.createRange()
              range.selectNodeContents(el)
              const s = window.getSelection()
              s.removeAllRanges()
              s.addRange(range)
              return s.toString()
            }),
          'data_de.md_german_property_index.retail_market_total_return'
        )
        await table.evaluate(() => window.getSelection().removeAllRanges())
        await table.bringToFront()
        await wrapper.focus()
        await table.keyboard.press('ArrowRight')
        await until(
          () => wrapper.evaluate((el) => el.scrollLeft > 0),
          'Keyboard did not scroll the table'
        )
        assert.ok(
          await table.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth + 1
          ),
          'The document itself must not overflow horizontally'
        )
      }
    )

    await step(
      'static routes reject traversal and missing assets promptly',
      async () => {
        const http = require('node:http')
        const base = new URL(source.url())
        const get = (pathname) =>
          new Promise((resolve, reject) => {
            const req = http.get(
              {
                hostname: base.hostname,
                port: base.port,
                path: pathname,
                timeout: 3000
              },
              (res) => {
                let body = ''
                res.setEncoding('utf8')
                res.on('data', (part) => {
                  body += part
                })
                res.on('end', () =>
                  resolve({
                    status: res.statusCode,
                    type: res.headers['content-type'],
                    body
                  })
                )
              }
            )
            req.on('timeout', () =>
              req.destroy(new Error('HTTP response timed out: ' + pathname))
            )
            req.on('error', reject)
          })
        for (const [pathname, type] of [
          ['/_static/markdown.css', 'text/css'],
          [
            '/_assets/vendor/underscore/underscore-umd-min.js',
            'application/javascript'
          ],
          ['/_assets/vendor/katex/fonts/KaTeX_Main-Regular.woff2', 'font/woff2']
        ]) {
          const response = await get(pathname)
          assert.equal(response.status, 200)
          assert.ok(
            response.type.startsWith(type),
            pathname + ' MIME type: ' + response.type
          )
        }
        const bundlePath = await source
          .locator('script[type="module"][src^="/_assets/"]')
          .getAttribute('src')
        assert.match(bundlePath, /^\/_assets\/[^/]+\.js$/)
        const bundle = await get(bundlePath)
        assert.equal(bundle.status, 200)
        assert.ok(bundle.type.startsWith('application/javascript'))
        const notice = /For license information please see ([^\s*]+)/.exec(
          bundle.body
        )
        assert.ok(
          notice,
          'The browser bundle must link its third-party notices'
        )
        const noticePath = new URL(notice[1], new URL(bundlePath, source.url()))
          .pathname
        const legal = await get(noticePath)
        assert.equal(legal.status, 200)
        assert.ok(legal.type.startsWith('text/plain'))
        assert.ok(legal.body.includes('React'))
        assert.ok(legal.body.includes('MIT'))
        for (const pathname of [
          '/_next/../../package.json',
          '/_static/../package.json',
          '/_next/not-a-real-asset.js',
          '/_assets/../../../package.json',
          '/_assets/../index.html',
          '/_assets/not-a-real-asset.js',
          '/_static/not-a-real-asset.js'
        ]) {
          const result = await get(pathname)
          assert.equal(result.status, 404, pathname)
          assert.ok(
            !result.body.includes('devDependencies'),
            'Repository contents must not leak'
          )
        }
      }
    )

    await step(
      'unknown pages show a standalone 404 without starting a preview client',
      async () => {
        const page = await context.newPage()
        const socketRequests = []
        page.on('request', (request) => {
          if (new URL(request.url()).pathname.startsWith('/socket.io/'))
            socketRequests.push(request.url())
        })
        try {
          const response = await page.goto(
            new URL('/not-a-preview-document', source.url()).href
          )
          assert.equal(response.status(), 404)
          await page
            .getByRole('heading', { name: '404', exact: true })
            .waitFor()
          assert.equal(await page.title(), 'Preview not found')
          assert.equal(await page.locator('script').count(), 0)
          assert.equal(
            await page.evaluate(() => typeof window.socket),
            'undefined'
          )
          assert.deepEqual(socketRequests, [])
        } finally {
          await page.close()
        }
      }
    )

    await step(
      'missing documents show useful errors and remain editor neutral',
      async () => {
        const missing = await clickDocument(source, 'Missing document')
        await missing
          .getByText('Markdown document not found:', { exact: false })
          .waitFor()
        assert.equal(
          await nvim.lua('return vim.api.nvim_get_current_buf()'),
          sourceBuf
        )
        await missing.close()
      }
    )

    await step(
      'buffer switching keeps pages; stop closes only current buffer and all its tabs',
      async () => {
        await nvim.lua('vim.api.nvim_set_current_buf(...)', [targetBuf])
        assert.equal(source.isClosed(), false)
        assert.equal(table.isClosed(), false)
        await nvim.command('MarkdownPreviewStop')
        await Promise.all([closed(detail), closed(secondDetail)])
        assert.equal(source.isClosed(), false)
        assert.equal(table.isClosed(), false)
        await nvim.lua('vim.api.nvim_set_current_buf(...)', [sourceBuf])
      }
    )

    await step(
      'manually closed previews reopen and toggle affects only the current buffer',
      async () => {
        await source.close()
        await until(
          async () =>
            !(
              await nvim.lua('return vim.g.mkdp_preview_buffers or {}')
            ).includes(sourceBuf),
          'Manual close did not clear connection state'
        )
        source = await start()
        await rendered(source, 'Markdown preview links')
        await nvim.command('MarkdownPreviewToggle')
        await closed(source)
        assert.equal(table.isClosed(), false)
        const url = await nvim.launched(() =>
          nvim.command('MarkdownPreviewToggle')
        )
        source = await openURL(url)
        await rendered(source, 'Markdown preview links')
      }
    )

    await step(
      'unload, delete and wipe close their previews while preserving others',
      async () => {
        for (const operation of ['bunload!', 'bdelete!', 'bwipeout!']) {
          const buf = await nvim.edit(
            'markdown-preview-links/detail with spaces.md'
          )
          const page = await start()
          await rendered(page, 'Linked detail document')
          const duplicate = await clickDocument(source, 'Detail document')
          await rendered(duplicate, 'Linked detail document')
          await nvim.command(operation + ' ' + buf)
          await Promise.all([closed(page), closed(duplicate)])
          assert.equal(source.isClosed(), false)
          assert.equal(table.isClosed(), false)
          await nvim.lua('vim.api.nvim_set_current_buf(...)', [sourceBuf])
        }
      }
    )

    await step(
      'Markdown image attributes remain text with raw HTML disabled',
      async () => {
        const options = await nvim.lua('return vim.g.mkdp_preview_options')
        await nvim.lua(`local options = vim.g.mkdp_preview_options
options.mkit = {html = false, typographer = false}
vim.g.mkdp_preview_options = options`)
        try {
          await nvim.edit('image-attributes.md')
          const page = await start()
          await rendered(page, 'Image attributes')
          const broken = page.locator('img[src*="missing-image.svg"]')
          await until(
            () => broken.evaluate((el) => el.complete),
            'Broken image did not finish loading'
          )
          assert.equal(await broken.getAttribute('onerror'), null)
          assert.equal(
            await page.evaluate(() => window.imageInjected),
            undefined
          )
          assert.equal(
            await broken.getAttribute('title'),
            'hello onerror=window.imageInjected=1'
          )
          const local = page.locator('img[src*="local.svg"]')
          await until(
            () => local.evaluate((el) => el.complete && el.naturalWidth === 20),
            'Image with escaped attributes did not load'
          )
          assert.equal(
            await local.getAttribute('alt'),
            'Description with "quotes" & <angles>'
          )
          assert.equal(
            await local.getAttribute('title'),
            'A "quoted" title & <value>'
          )
          assert.equal(await local.getAttribute('width'), '40')
          assert.equal(await local.getAttribute('height'), '20')
          assert.equal(await page.locator('#raw-html-disabled').count(), 0)
          assert.ok(
            (await page.locator('.markdown-body').textContent()).includes(
              '<img id="raw-html-disabled"'
            )
          )
        } finally {
          await nvim.lua('vim.g.mkdp_preview_options = ...', [options])
        }
      }
    )

    await step(
      'hand-drawn sequence diagrams use the local replacement font',
      async () => {
        const options = await nvim.lua('return vim.g.mkdp_preview_options')
        await fs.writeFile(
          path.join(nvim.fixture, 'hand-sequence.md'),
          '# Hand sequence\n\n```sequence-diagrams\nAlice->Bob: Local <b>font</b>\n```\n'
        )
        await nvim.lua(`local options = vim.g.mkdp_preview_options
options.sequence_diagrams = {theme = 'hand'}
vim.g.mkdp_preview_options = options`)
        let page
        try {
          await nvim.edit('hand-sequence.md')
          page = await start()
          await rendered(page, 'Hand sequence')
          await page.locator('svg').filter({ hasText: 'Alice' }).waitFor()
          await until(
            () => page.evaluate(() => document.fonts.check('16px danielbd')),
            'Local handwriting font did not load'
          )
          const family = await page
            .locator('svg text')
            .first()
            .evaluate((el) => getComputedStyle(el).fontFamily)
          assert.ok(family.includes('danielbd'), family)
          assert.ok(
            (
              await page
                .locator('svg')
                .filter({ hasText: 'Alice' })
                .textContent()
            ).includes('<b>font</b>')
          )
        } finally {
          if (page && !page.isClosed()) await page.close()
          await nvim.lua('vim.g.mkdp_preview_options = ...', [options])
        }
      }
    )

    await step(
      'retained renderers, alerts, code helpers and Mermaid work offline',
      async () => {
        await nvim.edit('rendering.md')
        const page = await start()
        await rendered(page, 'Renderer smoke')
        assert.ok(
          !(await page.locator('.markdown-body').textContent()).includes(
            'hidden-yaml-regression-marker'
          ),
          'YAML frontmatter must stay hidden by default'
        )
        await page.locator('.md-callout-note strong').waitFor()
        await page.locator('.md-callout-caution').waitFor()
        await page.locator('.katex').first().waitFor()
        assert.ok(
          (await page.locator('.katex').count()) >= 2,
          'Math and chemistry must both render'
        )
        await page.locator('.mermaid svg').waitFor()
        await page.locator('.dot svg').waitFor()
        await page.locator('svg').filter({ hasText: 'Alice' }).waitFor()
        await page.locator('svg').filter({ hasText: 'Start' }).last().waitFor()
        assert.ok(
          (await page.locator('svg').allTextContents()).some((text) =>
            text.includes('Start <b>literal</b>')
          )
        )
        assert.equal(await page.locator('dd').textContent(), 'Definition text')
        assert.ok(await page.locator('nav.table-of-contents').count())
        await until(
          () =>
            page
              .locator('img[src*="local.svg"]')
              .evaluate((el) => el.complete && el.naturalWidth === 20),
          'Local image did not load'
        )
        // Verify the browser encoder without contacting the remote UML service.
        const uml = await page
          .locator('img[src^="https://www.plantuml.com/plantuml/img/"]')
          .getAttribute('src')
        assert.equal(
          require('plantuml-encoder').decode(
            new URL(uml).pathname.split('/').pop()
          ),
          '@startuml\nAlice -> Bob: Encoded locally\n@enduml'
        )
        await page.evaluate(() => window.scrollTo(0, 400))
        assert.ok(
          Math.abs(
            await page
              .locator('#page-header')
              .evaluate((el) => el.getBoundingClientRect().top)
          ) < 2,
          'Header must remain pinned when the document scrolls'
        )
        assert.equal(
          await page.locator('input.task-list-item-checkbox').isChecked(),
          true
        )
        assert.ok(await page.locator('.footnotes').textContent())
        assert.equal(
          await page.locator('pre.hljs').getAttribute('data-language'),
          'javascript'
        )
        assert.ok(await page.locator('pre.hljs .hljs-keyword').count())
        await page.locator('pre.hljs code').evaluate((el) => {
          const range = document.createRange()
          range.selectNodeContents(el)
          const s = window.getSelection()
          s.removeAllRanges()
          s.addRange(range)
        })
        await page.keyboard.press(
          process.platform === 'darwin' ? 'Meta+A' : 'Control+A'
        )
        assert.equal(
          (await page.evaluate(() => window.getSelection().toString())).trim(),
          'const answer = 42'
        )
        assert.equal(await page.locator('canvas.chartjs').count(), 1)
        assert.equal(
          await page
            .locator('pre')
            .filter({ hasText: 'Chart.js complains' })
            .count(),
          0
        )
        assert.deepEqual(errors, [])
      }
    )

    await step(
      'Neovim shutdown closes every remaining browser preview',
      async () => {
        const pages = context.pages().filter((p) => p !== control)
        assert.ok(pages.length >= 3)
        await nvim.shutdown()
        await Promise.all(pages.map(closed))
      }
    )
  }
)

test(
  'an occupied preview port reports failure and does not block Neovim exit',
  { timeout: 20000 },
  async (t) => {
    const net = require('node:net')
    const occupied = net.createServer()
    await new Promise((resolve, reject) => {
      occupied.once('error', reject)
      occupied.listen(0, '127.0.0.1', resolve)
    })
    t.after(() => new Promise((resolve) => occupied.close(resolve)))
    const nvim = await session()
    t.after(() => nvim.dispose())
    await nvim.lua('vim.g.mkdp_port = ...', [occupied.address().port])
    await nvim.edit('markdown-preview-links.md')
    await nvim.command('MarkdownPreview')
    await until(async () => {
      const status = await nvim.lua(
        "return vim.fn['mkdp#rpc#get_server_status']()"
      )
      const messages = await nvim.lua(
        "return vim.api.nvim_exec2('messages', {output = true}).output"
      )
      return (
        status === -1 && /EADDRINUSE|address already in use/i.test(messages)
      )
    }, 'The failed server must exit and report the occupied port')
    assert.equal((await nvim.launches()).length, 0)
    await nvim.shutdown(3000)
  }
)
