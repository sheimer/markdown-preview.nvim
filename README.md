# Markdown Preview for Neovim

An independently maintained Markdown preview plugin with live browser rendering,
linked-document navigation, independent previews per buffer, switchable palettes,
and improved tables and GitHub alerts.

This fork is maintained by [sheimer](https://github.com/sheimer) and has its own
development and release cycle. It retains the history and rendering stack of
[iamcco/markdown-preview.nvim](https://github.com/iamcco/markdown-preview.nvim),
starting at `a923f5fc5ba36a3b17e289dc35dc17f66d0548ee`. No upstream merge/rebase
workflow or upstream pull request is intended.

## Requirements and installation

- **Node.js 24** with **npm 11**, available in Neovim's environment.
- **Neovim 0.12.2+** is the supported target. See the actual tested versions
  and operating systems in [validation](docs/validation.md).
- A modern browser with ES modules, dynamic imports and WebAssembly. The default system browser works; no private Lua modules,
  custom application or personal stylesheet is required.
- Network access for the initial locked dependency installation. Rendering
  resources are served locally; PlantUML diagrams use an external service by
  default.

Clone into a directory on your Neovim runtime path, then build **from the plugin
root**, using Node 24:

```sh
git clone https://github.com/sheimer/markdown-preview.nvim.git
cd markdown-preview.nvim
npm ci
npm run build
```

For example, native `vim.pack` on Neovim 0.12.2+:

```lua
vim.pack.add({ 'https://github.com/sheimer/markdown-preview.nvim' })
```

Run `npm ci && npm run build` in the installed package after installing or
updating it. Existing package-manager hooks calling `mkdp#util#install_sync()`
can perform that local source build; failures are reported. Keep the root
`node_modules` directory: the server needs its runtime dependencies.

This is a source installation. `app/lib` and `app/out` are generated and ignored;
there are no downloaded upstream executables. Use the root npm lockfile only.
A checkout without a successful build reports an installation error when opened.
Run `:checkhealth markdown_preview` to check the source build, Node runtime and
browser hook without opening a preview.

## Preview behavior

Open a Markdown buffer and run `:MarkdownPreview`, `:MarkdownPreviewToggle`, or
`:MarkdownPreviewStop`. `<Plug>MarkdownPreview`, `<Plug>MarkdownPreviewToggle`
and `<Plug>MarkdownPreviewStop` mappings are also available.

- Each buffer has independent previews. Starting an existing connected preview
  refreshes it without opening another window. Toggle/stop affect the current
  buffer only.
- Switching buffers, splits or tabs leaves previews open. Unloading, deleting or
  wiping a buffer closes its previews. Neovim exit closes all previews. A
  manually closed preview can be opened again.
- Relative `.md` and `.markdown` links open live target previews using native
  browser links, including reference links, encoded spaces, parent directories
  and heading fragments. Browser new-tab/window and modified-click actions work.
  Same-document anchors and web links retain their browser behavior.
- Linked documents load in **listed, hidden Neovim buffers** without moving the
  editor. Existing buffers and unsaved changes are reused. Following a link
  repeatedly can create several previews for one buffer; edits update all of
  them. Missing documents display a readable error page.
- GitHub alerts, syntax highlighting, code language labels and code-block
  Cmd/Ctrl-A selection accompany the original math, diagram, task-list,
  footnote, table-of-contents and image support.
- The sticky header has independent palette and light/dark controls. Forestbones
  / Everforest, Gruvbox, Catppuccin and GitHub adaptations are included. Palette
  selection persists in browser storage per server origin (including port).
- The document width is capped at 64rem. Wide/tall Markdown tables scroll in a
  focusable region with complete selectable values and sticky column headers.

## Configuration

Set globals before loading the plugin. No setup call is needed.

```lua
vim.g.mkdp_theme = vim.o.background -- 'light' or 'dark'
vim.g.mkdp_filetypes = { 'markdown' } -- add other Markdown-producing filetypes
vim.g.mkdp_preview_options = {
  sync_scroll_type = 'relative', -- also 'middle' or 'top'
  disable_filename = 0,
}
vim.keymap.set('n', '<leader>mp', '<cmd>MarkdownPreviewToggle<cr>')
```

| Option | Purpose |
| --- | --- |
| `g:mkdp_preview_options` | Renderer options (`mkit`, `katex`, `uml`, `maid`, `toc`, `sequence_diagrams`, `flowchart_diagrams`) and `disable_sync_scroll`, `sync_scroll_type`, `hide_yaml_meta`, `content_editable`, `disable_filename` |
| `g:mkdp_markdown_css` | Absolute path to replacement Markdown stylesheet; default uses bundled palettes/layout |
| `g:mkdp_highlight_css` | Absolute path to replacement syntax stylesheet |
| `g:mkdp_browserfunc` | Name of a Vim function receiving the preview URL, for custom launchers |
| `g:mkdp_node_command` | Node executable override (default `node`); must be Node 24 |
| `g:mkdp_browser` | Browser executable passed to the default platform opener |
| `g:mkdp_echo_preview_url` | Echo launched URLs when set to `1` |
| `g:mkdp_port` | Fixed server port; empty or `0` lets the OS allocate a free local port |
| `g:mkdp_page_title` | Browser title template; `${name}` expands to filename |
| `g:mkdp_images_path` | Custom image root |
| `g:mkdp_open_ip` | Override host used in preview URLs |
| `g:mkdp_open_to_the_world` | Bind beyond loopback when `1`; default `0` |

`hide_yaml_meta` defaults to `1`: complete, valid YAML frontmatter at the start
of a document is hidden. Unclosed or malformed blocks remain ordinary Markdown,
preserving the document body. Set it to `0` to retain the existing ordinary
Markdown display of metadata; a dedicated frontmatter display is deferred.

The lifecycle uses independent per-buffer previews. Set `g:mkdp_auto_start = 1`
to opt into opening supported buffers on entry. Close-on-switch and
combined-preview settings are retired. Keep the server on
loopback. The preview server has no remote authentication. Browser socket
handshakes must match the preview server's HTTP origin. Clients without an
Origin header remain allowed; this check does not provide authentication or
DNS-rebinding protection.

A supported browser hook keeps application/profile choices in user configuration:

```vim
function! MyMarkdownBrowser(url) abort
  call jobstart(['firefox', '--new-window', a:url], {'detach': v:true})
endfunction
let g:mkdp_browserfunc = 'MyMarkdownBrowser'
```

Pass the URL as a separate argument; avoid interpolating document paths into shell
commands. With no hook, the default OS browser opener is used.

## Development and checks

```sh
npm ci
npm run build
npx playwright install chromium firefox
npm test
npm run test:firefox
```

The frontend uses esbuild with React 16 and the existing Markdown/diagram stack.
Renderer versions and retained source hashes are listed in
[the asset manifest](app/vendor-assets.json). Mermaid and Graphviz load locally
only when needed; math, chemistry and the other vendor assets are built from
locked packages. Mermaid zoom/pan/viewer features remain deferred.
It emits a static HTML shell and content-hashed browser bundle; no Next.js server
or OpenSSL legacy-provider option is needed. `npm run build-app` rebuilds only the
frontend; `npm run build-lib` rebuilds the Node server helpers. The full build
remains `npm run build`.

The browser suite runs a minimal Neovim instance with temporary documents,
isolated state directories and isolated browser contexts. See
[validation](docs/validation.md) for the completed checks, exact commands and
remaining limits. [Platform testing](docs/platform-testing.md) covers the CI
matrix, diagnostic artifacts, isolated Linux container and Windows/WSL commands.
Fixtures are in [fixtures](fixtures).

Build and generated-asset policy, dependency follow-up and release gates are in
[maintenance](docs/maintenance.md). The [roadmap](ROADMAP.md) distinguishes
routine maintenance, optional polish and deferred features. The renderer retains
React 16 and the existing Markdown/math/diagram libraries.
[Third-party notices](THIRD_PARTY_NOTICES.md)
record the renderer asset licenses and the replacement of the legacy metadata
dependency with a plugin-owned adapter.

## Changes from the original

| Original baseline | This fork |
| --- | --- |
| Upstream download/install and packaged executables | Node 24, one npm lockfile, local source builds |
| Shared preview/auto-close lifecycle | Independent buffers, explicit start/toggle/stop, cleanup on buffer disposal/exit |
| Local document links lack live buffer navigation | Native links resolve hidden Neovim buffers and reuse unsaved content |
| Original appearance | Independent palettes/modes, sticky controls, width and syntax improvements, scrollable tables |
| Next.js build/export pipeline | Static esbuild bundle with ordered local renderer assets |
| External runtime patch scripts in personal configuration | Features live in plugin source with browser regression tests |

## Limitations

Preview **trusted Markdown**: the retained renderer supports raw HTML, and links
can load relative Markdown documents outside the source directory. Raw HTML
links and absolute filesystem links are not rewritten. Relative document links
require a named source buffer. Ordinary browser tabs can refuse script-initiated
closure; browser policy controls whether windows close automatically.

The hosted matrix passes on Ubuntu 24.04, macOS 15 Intel and Windows Server 2022;
exact tested versions and limits are recorded in [validation](docs/validation.md).
WSL desktop interoperability remains unverified. Vim compatibility is no longer a supported target.
Remote and headless SSH browser forwarding require user configuration. Legacy dependencies
and bundled assets require the focused follow-up listed in maintenance.

## Attribution and licenses

Originally created by 年糕小豆汤 (iamcco) and contributors. Original Git history
and [MIT license](LICENSE) are preserved. Fork changes are distributed under the
same license. Bundled renderer assets have their own notices and licenses; see
[third-party notices](THIRD_PARTY_NOTICES.md). Palette names identify adaptations
and do not imply endorsement. The personal Firefox application/profile theme is
not part of this plugin.
