const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const { chromium, firefox } = require('playwright')
const { session, until } = require('./helpers/session.cjs')

async function preview(t, lines, options = {}) {
  const nvim = await session()
  t.after(() => nvim.dispose())
  await nvim.lua(
    `local options = ...
vim.g.mkdp_preview_options = vim.tbl_extend('force', vim.g.mkdp_preview_options, options)`,
    [options]
  )
  await fs.writeFile(
    path.join(nvim.fixture, 'frontmatter.md'),
    lines.join('\n')
  )
  await nvim.edit('frontmatter.md')
  const engine =
    process.env.MKDP_TEST_BROWSER === 'firefox' ? firefox : chromium
  const browser = await engine.launch({
    headless: true,
    ...(process.env.MKDP_TEST_BROWSER_EXECUTABLE
      ? { executablePath: process.env.MKDP_TEST_BROWSER_EXECUTABLE }
      : {})
  })
  t.after(() => browser.close())
  const page = await browser.newPage({ viewport: { width: 1100, height: 800 } })
  await page.route('**/*', (route) =>
    ['localhost', '127.0.0.1', '[::1]'].includes(
      new URL(route.request().url()).hostname
    )
      ? route.continue()
      : route.abort()
  )
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  const url = await nvim.launched(() => nvim.command('MarkdownPreview'))
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  const update = (next) =>
    nvim.lua(
      `local lines = ...
vim.api.nvim_buf_set_lines(0, 0, -1, false, lines)
vim.api.nvim_win_set_cursor(0, {1, 0})
vim.api.nvim_exec_autocmds('TextChanged', {buffer = 0})`,
      [next]
    )
  return { nvim, page, update, errors }
}

test(
  'frontmatter hiding preserves valid delimiters, YAML validation and body source lines',
  { timeout: 60000 },
  async (t) => {
    const { page, update, errors } = await preview(t, ['# Ready'])
    await page.getByRole('heading', { name: 'Ready' }).waitFor()
    const marker = 'FRONTMATTER_VALUE'
    const variants = [
      {
        name: 'dashes',
        lines: [
          '---',
          'title: ' + marker,
          'tags:',
          '  - one',
          '  - two',
          '---'
        ],
        hidden: true
      },
      {
        name: 'dot closer',
        lines: ['---', 'title: ' + marker, '...'],
        hidden: true
      },
      {
        name: 'dot opener',
        lines: ['...', 'title: ' + marker, '---'],
        hidden: true
      },
      { name: 'dots', lines: ['...', 'title: ' + marker, '...'], hidden: true },
      { name: 'empty', lines: ['---', '---'], hidden: true },
      {
        name: 'duplicate keys',
        lines: ['---', 'title: ' + marker, 'title: Last value', '---'],
        hidden: true
      },
      {
        name: 'invalid YAML',
        lines: ['---', 'title: [' + marker, '---'],
        hidden: false
      },
      {
        name: 'leading blank',
        lines: ['', '---', 'title: ' + marker, '---'],
        hidden: false
      },
      {
        name: 'later block',
        lines: ['# Introduction', '', '---', 'title: ' + marker, '---'],
        hidden: false
      },
      {
        name: 'indented marker',
        lines: [' ---', 'title: ' + marker, ' ---'],
        hidden: false
      },
      {
        name: 'fenced example',
        lines: ['```yaml', '---', 'title: ' + marker, '---', '```'],
        hidden: false
      }
    ]
    for (const variant of variants) {
      const title = 'Body ' + variant.name
      const lines = [
        ...variant.lines,
        '',
        '# ' + title,
        '',
        'Visible paragraph.'
      ]
      await update(lines)
      const heading = page.getByRole('heading', { name: title })
      await heading.waitFor()
      assert.equal(
        await heading.getAttribute('data-source-line'),
        String(lines.indexOf('# ' + title)),
        variant.name
      )
      const text = await page.locator('.markdown-body').textContent()
      if (variant.name !== 'empty')
        assert.equal(text.includes(marker), !variant.hidden, variant.name)
      assert.ok(text.includes('Visible paragraph.'), variant.name)
    }
    assert.deepEqual(errors, [])
  }
)

test(
  'unclosed frontmatter preserves the document body during live edits',
  { timeout: 30000 },
  async (t) => {
    const { page, update, errors } = await preview(t, [
      '---',
      'title: SECRET_VALUE',
      '---',
      '',
      '# Initial body'
    ])
    await page.getByRole('heading', { name: 'Initial body' }).waitFor()
    for (const marker of ['---', '...']) {
      // These headings are also valid YAML comments. The old adapter consumed
      // everything to EOF and successfully parsed it, hiding the entire body.
      const title = 'Unclosed body ' + (marker === '---' ? 'dashes' : 'dots')
      await update([marker, 'title: SECRET_VALUE', '', '# ' + title])
      const heading = page.getByRole('heading', { name: title })
      await heading.waitFor({ timeout: 5000 })
      assert.equal(await heading.getAttribute('data-source-line'), '3')
      assert.ok(
        (await page.locator('.markdown-body').textContent()).includes(
          'SECRET_VALUE'
        )
      )
    }
    await update(['---', 'title: SECRET_VALUE', '---', '', '# Closed again'])
    await page.getByRole('heading', { name: 'Closed again' }).waitFor()
    assert.ok(
      !(await page.locator('.markdown-body').textContent()).includes(
        'SECRET_VALUE'
      )
    )
    assert.deepEqual(errors, [])
  }
)

test(
  'hidden frontmatter preserves heading anchors and editor scroll synchronization',
  { timeout: 30000 },
  async (t) => {
    const lines = [
      '---',
      'title: SECRET_VALUE',
      'tags:',
      '  - metadata',
      '---',
      '',
      '# Anchored body',
      '',
      '[Jump to target](#target-heading)',
      ''
    ]
    for (let i = 0; i < 55; i++)
      lines.push('Paragraph before the target ' + i + '.', '')
    const headingLine = lines.length
    lines.push('## Target heading', '')
    for (let i = 0; i < 35; i++)
      lines.push('Paragraph after the target ' + i + '.', '')
    const { nvim, page } = await preview(t, lines, {
      sync_scroll_type: 'middle'
    })
    const heading = page.locator('#target-heading')
    await heading.waitFor()
    assert.equal(
      await heading.getAttribute('data-source-line'),
      String(headingLine)
    )
    await page.getByRole('link', { name: 'Jump to target' }).click()
    await until(
      () =>
        heading.evaluate((el) => {
          const top = el.getBoundingClientRect().top
          return top >= -2 && top < 180 && window.scrollY > 500
        }),
      'The frontmatter document heading fragment did not scroll to its target'
    )
    await nvim.lua(
      `vim.api.nvim_win_set_cursor(0, {..., 0})
vim.api.nvim_exec_autocmds('CursorMoved', {buffer = 0})`,
      [headingLine + 1]
    )
    await until(
      () =>
        heading.evaluate((el) => {
          const top = el.getBoundingClientRect().top
          return top > 180 && top < window.innerHeight - 80
        }),
      'Editor scroll lost the original source line after hidden frontmatter'
    )
  }
)

test(
  'disabling frontmatter hiding retains the existing ordinary Markdown display',
  { timeout: 30000 },
  async (t) => {
    const { page, errors } = await preview(
      t,
      ['---', 'title: SHOWN_VALUE', '---', '', '# Visible body'],
      { hide_yaml_meta: 0 }
    )
    await page.getByRole('heading', { name: 'Visible body' }).waitFor()
    await page.getByRole('heading', { name: 'title: SHOWN_VALUE' }).waitFor()
    assert.equal(await page.locator('.markdown-body hr').count(), 1)
    assert.equal(await page.locator('.markdown-body pre').count(), 0)
    assert.deepEqual(errors, [])
  }
)
