const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const { chromium, firefox } = require('playwright')
const { session, until } = require('./helpers/session.cjs')

test(
  'Graphviz renders both fence aliases, preserves labels and recovers from invalid live edits',
  { timeout: 60000 },
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
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.route('**/*', (route) =>
      ['localhost', '127.0.0.1', '[::1]'].includes(
        new URL(route.request().url()).hostname
      )
        ? route.continue()
        : route.abort()
    )
    const lines = [
      '# Graphviz maintenance',
      '',
      '```dot',
      'digraph { A [label=<<TABLE><TR><TD>HTML label</TD></TR></TABLE>>]; A -> B }',
      '```',
      '',
      '```graphviz',
      'digraph { A [label="<img src=x onerror=window.vizInjected=1>"]; A -> B }',
      '```'
    ]
    await fs.writeFile(path.join(nvim.fixture, 'graphviz.md'), lines.join('\n'))
    await nvim.edit('graphviz.md')
    const url = await nvim.launched(() => nvim.command('MarkdownPreview'))
    await page.goto(url)
    await until(
      async () => (await page.locator('.dot svg').count()) === 2,
      'Both DOT fence aliases must render SVG'
    )
    assert.ok(
      (await page.locator('.dot').nth(0).textContent()).includes('HTML label')
    )
    assert.ok(
      (await page.locator('.dot').nth(1).textContent()).includes(
        '<img src=x onerror=window.vizInjected=1>'
      )
    )
    assert.equal(await page.locator('img').count(), 0)
    assert.equal(await page.evaluate(() => window.vizInjected), undefined)

    const update = (next) =>
      nvim.lua(
        `local lines = ...
vim.api.nvim_buf_set_lines(0, 0, -1, false, lines)
vim.api.nvim_exec_autocmds('TextChanged', {buffer = 0})`,
        [next]
      )
    await update(['# Invalid DOT', '', '```dot', 'digraph { A ->', '```'])
    const error = page.locator('.dot pre[role="alert"]')
    await error.waitFor()
    assert.match(await error.textContent(), /^Graphviz:/)
    assert.ok((await error.textContent()).length > 'Graphviz:'.length)

    // A broken graph must not poison the shared instance for later buffer edits.
    // Rapid replacements must leave only the newest document's graph visible.
    for (let i = 0; i < 5; i++) {
      await update([
        '# Live graph',
        '',
        '```dot',
        `digraph { A [label="Live update ${i}"]; A -> B }`,
        '```'
      ])
    }
    await until(async () => {
      const graphs = await page.locator('.dot svg').allTextContents()
      return graphs.length === 1 && graphs[0].includes('Live update 4')
    }, 'Latest Graphviz update did not render')
    assert.equal(await page.locator('.dot svg').count(), 1)
    assert.equal(await page.locator('.dot [role="alert"]').count(), 0)
    assert.deepEqual(errors, [])
  }
)

test(
  'finishing Graphviz initialization preserves the latest cursor-only scroll target',
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
    await page.addInitScript(() => {
      const instantiate = WebAssembly.instantiate
      let held = false
      WebAssembly.instantiate = (...args) => {
        if (held) return instantiate.apply(WebAssembly, args)
        held = true
        window.__vizInitializationWaiting = true
        return new Promise((resolve, reject) => {
          window.__releaseVizInitialization = () => {
            instantiate.apply(WebAssembly, args).then(resolve, reject)
          }
        })
      }
    })
    await page.route('**/*', (route) =>
      ['localhost', '127.0.0.1', '[::1]'].includes(
        new URL(route.request().url()).hostname
      )
        ? route.continue()
        : route.abort()
    )
    const lines = [
      '# Async renderer scroll',
      '',
      '```dot',
      'digraph { A -> B }',
      '```',
      ''
    ]
    for (let i = 1; i <= 400; i++)
      lines.push('Paragraph ' + i + ' for cursor synchronization.', '')
    await fs.writeFile(
      path.join(nvim.fixture, 'graphviz-scroll.md'),
      lines.join('\n')
    )
    await nvim.edit('graphviz-scroll.md')
    const url = await nvim.launched(() => nvim.command('MarkdownPreview'))
    await page.goto(url)
    await until(
      () => page.evaluate(() => window.__vizInitializationWaiting),
      'Graphviz initialization was not held'
    )
    await nvim.lua(`vim.api.nvim_win_set_cursor(0, {600, 0})
vim.api.nvim_exec_autocmds('CursorMoved', {buffer = 0})`)
    await until(
      () => page.evaluate(() => window.scrollY > 1000),
      'The newer cursor target did not scroll while Graphviz was initializing'
    )
    await page.evaluate(() => window.__releaseVizInitialization())
    await page.locator('.dot svg').waitFor()
    // Allow the deferred render's 400ms scroll animation to finish as well. Its
    // old cursor snapshot must not return the document to the first source line.
    await page.waitForTimeout(650)
    assert.ok(
      await page.evaluate(() => window.scrollY > 1000),
      'The completed renderer overwrote the newer scroll target'
    )
  }
)
