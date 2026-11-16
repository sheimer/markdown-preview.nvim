# Baseline validation

Environment: macOS 26.6.2 (Darwin 25.6.0), Apple Silicon, Neovim 0.12.6,
Node.js 24.12.0, npm 11.10.0. Completed 2026-11-16. Automated CI is provided;
its hosted Linux run has not been observed in this local migration.

## Automated integration

The durable suite (`test/preview.test.cjs`) starts a minimal Neovim with the
plugin's runtime path, temporary Markdown fixture copies and independent XDG
configuration/data/state/cache directories. Swap and ShaDa are disabled. A
browser hook records URLs; real browser pages connect to the built HTTP/socket
server. Browser contexts/profiles are isolated. Non-local browser network
requests are blocked during renderer checks.

The final functional source revision was `1237c73` (documentation-only closeout
follows it). Clean checkout in a temporary directory named `plugin with spaces` passed
`npm ci`, the complete build, and both browser runs with no tracked changes:

| Browser | Result |
| --- | --- |
| Playwright Chromium 141 | 15/15 passed (17.0 seconds) |
| Playwright Firefox 142.0.1 | 15/15 passed (22.8 seconds) |

The arbitrary directory name and spaces also exercise loader/build paths without
assuming the checkout directory is named `markdown-preview.nvim`.

Commands (install browsers once):

```sh
npm ci
npm run build
npx playwright install chromium firefox
npm test
MKDP_TEST_BROWSER=firefox npm test
```

Local browser downloads were isolated using
`PLAYWRIGHT_BROWSERS_PATH=/tmp/markdown-preview-playwright` for both installation
and execution. Ordinary users can omit that override.

Coverage includes:

- Public start, stop and toggle; start refreshes an existing preview without a
  second launch; manual close followed by reopen.
- Independent buffers, several browser tabs for a buffer, preserved previews on
  buffer switches, unload/delete/wipe and Neovim shutdown cleanup.
- Encoded-space and reference links, parent traversal, native middle-click and
  modified-click behavior, local anchors and cross-document heading scrolling.
- Hidden listed target buffers, stable current editor buffer, reused unsaved
  target contents, unsaved live updates to all connected pages, missing-document
  errors and malformed resolver requests.
- Independent palettes and mode controls, palette persistence, actual sticky
  header positions, table overflow/keyboard scrolling/full values/sticky headers.
- GitHub alerts, syntax highlighting, code language labels and Cmd/Ctrl-A,
  Mermaid, KaTeX, Chart.js, sequence diagrams, flowcharts, Graphviz DOT,
  table of contents, definition lists, task lists, footnotes and local images.
- An occupied configured server port reports its bind error, clears the failed
  channel and allows Neovim shutdown within three seconds.
- A real HTTP/Socket.IO transport test holds a Neovim RPC response while stop
  arrives during connection. It proves the preview closes rather than escaping
  cleanup; the test was also confirmed to fail against the pre-fix server.
- Raw HTTP requests for static traversal, missing assets and resolver method
  handling. Static content stays under its declared roots.

## Actual personal Firefox launcher

The optional durable system-browser smoke uses Firefox's built-in Marionette
protocol, without an extra driver:

```sh
MKDP_SYSTEM_FIREFOX='/Applications/MD Preview.app/Contents/MacOS/firefox' \
MKDP_PERSONAL_BROWSER_HELPER="$HOME/dotfiles/nvim/.config/nvim/lua/sheimer/helpers/markdown_preview_browser.lua" \
node test/system-firefox.cjs
```

Omit `MKDP_PERSONAL_BROWSER_HELPER` to exercise only the plugin's public launcher
hook with another installed Firefox. The optional helper is test input; the
plugin and main suite have no dependency on it.


The actual `/Applications/MD Preview.app/Contents/MacOS/firefox` binary reported
Firefox 161.0b2 (Marionette capabilities 161.0, build 20261113104103). A separate
smoke used the existing personal Lua browser helper and its exact
`--profile <temporary-data>/markdown-preview-firefox-profile-MD Preview
--new-window <url>` launch arguments. `MOZ_HEADLESS=1`, `MOZ_NO_REMOTE=1` and
`MOZ_MARIONETTE=1` isolated and automated the process. The personal persistent
profile and application bundle were untouched.

Passed: source rendering, Forest palette and sticky header; a real element
click opened the encoded-space target in a native tab; target was hidden/listed
and the editor stayed put; unsaved updates rendered; stopping the target closed
its tab while the source stayed open; Neovim shutdown closed the source.

## Limits

Headless runs do not validate macOS window decorations, desktop focus behavior,
or the user's persistent profile/theme. Browser policies may reject
`window.close()` for ordinary tabs that were not script-opened. Tests deliberately
use script-opened pages for deterministic lifecycle checks.

Linux, Windows, WSL, Vim, remote-forwarding setups and Neovim versions other than
0.12.6 have not been run locally. CI targets Neovim 0.12.2 on Ubuntu but is not a
verified result yet. The MINGW cygpath and Windows image-root fixes have source
review only. External PlantUML service rendering and PDF/print output were not
browser-tested. Local-image accessibility and a complete legacy asset/license
inventory remain follow-up. The dependency audit is recorded in
[maintenance](maintenance.md); baseline tests do not resolve those advisories.
