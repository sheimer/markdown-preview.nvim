const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const { chromium, firefox } = require('playwright')
const { session, until } = require('./helpers/session.cjs')

test(
  'pinned Mermaid renders offline, follows palettes and recovers from live syntax errors',
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
    const requests = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('request', (request) =>
      requests.push(new URL(request.url()).pathname)
    )
    await page.route('**/*', (route) =>
      ['localhost', '127.0.0.1', '[::1]'].includes(
        new URL(route.request().url()).hostname
      )
        ? route.continue()
        : route.abort()
    )
    await fs.writeFile(
      path.join(nvim.fixture, 'mermaid.md'),
      '# Plain document\n'
    )
    await nvim.edit('mermaid.md')
    const url = await nvim.launched(() => nvim.command('MarkdownPreview'))
    await page.goto(url, { waitUntil: 'domcontentloaded' })
    await page.getByRole('heading', { name: 'Plain document' }).waitFor()
    assert.ok(
      !requests.some((url) => /mermaid|viz-/i.test(url)),
      'Plain documents must not download the optional diagram engines'
    )
    const update = (lines) =>
      nvim.lua(
        `local lines = ...
vim.api.nvim_buf_set_lines(0, 0, -1, false, lines)
vim.api.nvim_exec_autocmds('TextChanged', {buffer = 0})`,
        [lines]
      )
    await update([
      '# Mermaid maintenance',
      '',
      '```mermaid',
      'graph TD',
      'subgraph Group',
      'A[Start] -->|Label| B[End]',
      'end',
      '```'
    ])
    await page.locator('.mermaid svg').filter({ hasText: 'Group' }).waitFor()
    assert.ok((await page.locator('.mermaid').textContent()).includes('Group'))
    assert.ok((await page.locator('.mermaid').textContent()).includes('Start'))
    const fill = () =>
      page
        .locator('.mermaid .node rect')
        .first()
        .evaluate((el) => getComputedStyle(el).fill)
    const original = await fill()
    await page.locator('#preview-palette').selectOption('gruvbox')
    await until(
      async () => (await fill()) !== original,
      'Mermaid did not follow the selected palette'
    )
    const light = await fill()
    await page.locator('#theme').check()
    await until(
      async () => (await fill()) !== light,
      'Mermaid did not follow light/dark mode'
    )

    await update([
      '# Broken Mermaid',
      '',
      '```mermaid',
      'graph TD',
      'A[invalid',
      '```'
    ])
    await page.locator('.mermaid pre[role="alert"]').waitFor()
    assert.ok(
      (await page.locator('.mermaid pre').textContent()).includes(
        'Could not render Mermaid'
      )
    )
    for (let i = 0; i < 5; i++) {
      await update([
        '# Live Mermaid',
        '',
        '```mermaid',
        'graph LR',
        `A[Update ${i}] --> B[Ready]`,
        '```'
      ])
    }
    await until(async () => {
      const diagrams = await page.locator('.mermaid svg').allTextContents()
      return diagrams.length === 1 && diagrams[0].includes('Update 4')
    }, 'The latest Mermaid edit did not replace earlier renders')
    assert.equal(await page.locator('.mermaid pre[role="alert"]').count(), 0)

    await update([
      '# Mermaid diagram families',
      '',
      '```mermaid',
      'sequenceDiagram',
      'Alice->>Bob: Message',
      '```',
      '',
      '```mermaid',
      'erDiagram',
      'CUSTOMER ||--o{ ORDER : places',
      '```'
    ])
    await until(
      async () => (await page.locator('.mermaid svg').count()) === 2,
      'Sequence and entity relationship diagrams did not render'
    )
    await page
      .locator('.mermaid')
      .nth(1)
      .locator('svg')
      .filter({ hasText: 'CUSTOMER' })
      .waitFor()
    assert.ok(
      (await page.locator('.mermaid').allTextContents())
        .join(' ')
        .includes('CUSTOMER')
    )
    assert.deepEqual(errors, [])
  }
)

test(
  'an edit can remove Mermaid while its lazy renderer is still loading',
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
    let release
    const held = new Promise((resolve) => {
      release = resolve
    })
    let requested
    const started = new Promise((resolve) => {
      requested = resolve
    })
    t.after(() => release())
    await page.route('**/*', async (route) => {
      const url = new URL(route.request().url())
      if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
        return route.abort()
      if (url.pathname.includes('/chunks/mermaid')) {
        requested()
        await held
      }
      return route.continue()
    })
    await fs.writeFile(
      path.join(nvim.fixture, 'mermaid-lazy.md'),
      '# Lazy Mermaid\n\n```mermaid\ngraph TD\nA --> B\n```\n'
    )
    await nvim.edit('mermaid-lazy.md')
    const url = await nvim.launched(() => nvim.command('MarkdownPreview'))
    await page.goto(url, { waitUntil: 'domcontentloaded' })
    await started
    await nvim.lua(`vim.api.nvim_buf_set_lines(0, 0, -1, false, {'# Newest plain document'})
vim.api.nvim_exec_autocmds('TextChanged', {buffer = 0})`)
    await page.getByRole('heading', { name: 'Newest plain document' }).waitFor()
    release()
    await page.waitForLoadState('networkidle')
    assert.equal(await page.locator('.mermaid').count(), 0)
    assert.equal(await page.locator('pre[role="alert"]').count(), 0)
  }
)
