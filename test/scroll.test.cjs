const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const { chromium, firefox } = require('playwright')
const { session, until } = require('./helpers/session.cjs')

test(
  'native preview scroll follows editor positions and cancels older movement',
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
    const page = await browser.newPage({
      viewport: { width: 1100, height: 800 }
    })
    await page.route('**/*', (route) =>
      ['localhost', '127.0.0.1', '[::1]'].includes(
        new URL(route.request().url()).hostname
      )
        ? route.continue()
        : route.abort()
    )
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    const lines = ['# Scroll regression', '']
    for (let i = 1; i <= 180; i++)
      lines.push(
        'Paragraph ' + i + ' has enough space to exercise document scrolling.',
        ''
      )
    lines.push('End of the document.')
    await fs.writeFile(path.join(nvim.fixture, 'scroll.md'), lines.join('\n'))
    await nvim.edit('scroll.md')
    const url = await nvim.launched(() => nvim.command('MarkdownPreview'))
    await page.goto(url)
    await page.getByRole('heading', { name: 'Scroll regression' }).waitFor()
    await page.evaluate(() => {
      window.__scrollRefresh = null
      window.socket.on('refresh_content', (data) => {
        window.__scrollRefresh = data
      })
    })

    const cursor = async (line, mode, topline = Math.max(1, line - 2)) => {
      await nvim.lua(
        `local line, mode, topline = ...
local options = vim.g.mkdp_preview_options
options.sync_scroll_type = mode
vim.g.mkdp_preview_options = options
vim.api.nvim_win_set_cursor(0, {line, 0})
vim.fn.winrestview({topline = topline})
vim.cmd.redraw()
vim.api.nvim_exec_autocmds('CursorMoved', {buffer = 0})`,
        [line, mode, topline]
      )
      await until(
        () =>
          page.evaluate(
            ({ line, mode }) =>
              window.__scrollRefresh?.cursor[1] === line &&
              window.__scrollRefresh.options.sync_scroll_type === mode,
            { line, mode }
          ),
        'Preview did not receive the editor position'
      )
    }
    const stable = async () => {
      await page.evaluate(
        () =>
          new Promise((resolve) => {
            let last = window.scrollY
            let unchanged = 0
            const check = () => {
              unchanged =
                Math.abs(last - window.scrollY) < 1 ? unchanged + 1 : 0
              last = window.scrollY
              if (unchanged >= 8) resolve()
              else requestAnimationFrame(check)
            }
            requestAnimationFrame(check)
          })
      )
    }
    const paragraphTop = () =>
      page
        .locator('[data-source-line="200"]')
        .evaluate((el) => el.getBoundingClientRect().top)

    await cursor(201, 'middle')
    await until(
      async () => (await paragraphTop()) > 250 && (await paragraphTop()) < 650,
      'Middle sync did not position the selected paragraph in the viewport'
    )
    await stable()
    assert.ok(await page.evaluate(() => window.scrollY > 500))

    await cursor(201, 'relative')
    await stable()
    const relative = await paragraphTop()
    assert.ok(
      relative >= 0 && relative < 400,
      'Relative sync must follow the editor viewport: ' + relative
    )

    await cursor(201, 'top')
    await stable()
    const top = await paragraphTop()
    assert.ok(
      top >= 0 && top < 300,
      'Top sync must keep the editor viewport near the top: ' + top
    )

    await cursor(lines.length, 'middle')
    await until(
      () =>
        page.evaluate(
          () =>
            Math.abs(
              window.scrollY -
                (document.documentElement.scrollHeight - window.innerHeight)
            ) < 2
        ),
      'Last editor line did not scroll to the document end'
    )
    await cursor(1, 'middle')
    await until(
      () => page.evaluate(() => window.scrollY < 2),
      'First editor line did not scroll back to the top'
    )

    // Interrupt an actual animation with a reduced-motion request. An uncancelled
    // older frame would pull the document away from this newer immediate target.
    await cursor(lines.length, 'middle')
    await until(
      () =>
        page.evaluate(
          () =>
            window.scrollY > 300 &&
            window.scrollY <
              document.documentElement.scrollHeight - window.innerHeight - 300
        ),
      'The normal scroll did not animate'
    )
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await cursor(1, 'middle')
    await until(
      () => page.evaluate(() => window.scrollY < 2),
      'Reduced-motion scroll did not use the newest target'
    )
    const drift = await page.evaluate(
      () =>
        new Promise((resolve) => {
          const end = performance.now() + 550
          let largest = 0
          const check = () => {
            largest = Math.max(largest, window.scrollY)
            if (performance.now() >= end) resolve(largest)
            else requestAnimationFrame(check)
          }
          requestAnimationFrame(check)
        })
    )
    assert.ok(
      drift < 2,
      'An older animation moved the page after the latest request: ' + drift
    )
    await cursor(201, 'middle')
    await until(
      () => page.evaluate(() => window.scrollY > 500),
      'Could not move away from the document start'
    )
    // A wrapped editor line can occupy more screen rows than its buffer line
    // number. Top sync must still resolve to a finite position near the start.
    const screenLine = await nvim.lua(`vim.o.columns = 20
vim.o.wrap = true
vim.api.nvim_win_set_cursor(0, {3, 50})
vim.fn.winrestview({topline = 1})
local options = vim.g.mkdp_preview_options
options.sync_scroll_type = 'top'
vim.g.mkdp_preview_options = options
vim.cmd.redraw()
vim.api.nvim_exec_autocmds('CursorMoved', {buffer = 0})
return vim.fn.winline()`)
    assert.ok(
      screenLine > 3,
      'Fixture must place the cursor on a wrapped editor row'
    )
    await until(
      () => page.evaluate(() => window.scrollY < 400),
      'Wrapped editor rows left top sync at an invalid target'
    )
    assert.equal(
      await page.evaluate(() => typeof window.TweenLite),
      'undefined'
    )
  }
)
