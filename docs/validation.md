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

## Runtime dependency follow-up review

Compared with v0.1.0, this follow-up retains the baseline environment and adds
acceptance coverage for the updated socket and parser dependencies. The baseline
results above remain historical evidence.

The review suite adds:

- Explicit polling and WebSocket clients receiving the same complete unsaved
  document above 1 MiB, followed by reconnection and per-buffer stop.
- Same-origin connections accepted and foreign, malformed or `null` browser
  Origins rejected on both transports. A polling HTTP handshake returns 403.
  The existing connection-race test also exercises a native client without Origin.
- Automatic browser transport upgrade, fuzzy links, email links, typographic
  replacements and rejection of Markdown `javascript:` links.
- A smartquotes input with 80,000 repetitions of each unmatched quote pattern,
  using the renderer's normal typographer setting,
  with a four-second completion budget and a subsequent live edit. The same
  browser regression fails against the unchanged installed v0.1.0 baseline.
- Image title/alt escaping, inert injected handler text, image dimensions and
  disabled raw HTML. Against the installed baseline, the image title actually
  created and executed an `onerror` handler with `mkit.html = false`.

The expanded suite passed 18/18 checks in both Chromium and Firefox. The locked
reinstall used `npm ci --ignore-scripts --no-audit --no-fund`, followed by
`npm run build`. Dependency inventory, audit counts and remaining origin/auth
limits are recorded in [maintenance](maintenance.md#first-follow-up-runtime-dependencies-and-input-handling).

The actual MD Preview.app / Firefox 161.0 launch-helper smoke also passed with
an isolated temporary profile against this follow-up. The installed plugin was
left at v0.1.0 for the review boundary.

One intermittent Firefox multi-preview DOM timeout remains unexplained. Five
repeat runs, an additional 20-second idle case, and two independent five-preview
stress runs (one including a 35-second idle) passed. The test now asserts socket
delivery to every preview separately before foregrounding each for DOM checks,
and retains bounded event/socket diagnostics on failure. Foregrounding does not
request another content refresh. This improves diagnosis and visible-UI checks;
it is not a claim that the original timeout's cause has been fixed.

## Frontend-builder follow-up review

The esbuild replacement was validated from an isolated source copy in a directory
named `plugin with spaces`, using a normal `npm ci --no-audit --no-fund` and
`npm run build`. That copy contains the uncommitted source changes and no shared
`node_modules`, generated output or private Lua configuration. Node 24/npm 11
and the baseline macOS/Neovim versions above were retained.

| Check | Result |
| --- | --- |
| Locked install and full build | Passed |
| Chromium 141 | 21/21 passed |
| Firefox 142.0.1 | 21/21 passed |
| Actual MD Preview.app / Firefox 161.0 helper smoke | Passed with isolated profile |
| Repeated frontend build output hashes | Identical |
| Current locked npm audit | 0 findings |

New assertions cover literal title/filename characters and reloads, hidden YAML
frontmatter, the real compiled bundle and linked license notices, confinement
and missing-file behavior on `/_assets/`, and a script-free 404 with no socket
requests. The build check runs from outside the checkout with empty
`NODE_OPTIONS` and compares every emitted file's bytes across two frontend builds.
A separate metafile inspection confirmed a single Markdown-It parser entry.

The final workspace browser runs additionally check that the emitted PlantUML
image URL decodes to the expected UML source without contacting its remote
service. All earlier lifecycle, link, unsaved-content, origin, table, palette,
code helper, math, chart and local diagram coverage remains in place. A successful
builder run does not establish the cause of the earlier intermittent Firefox
timeout noted above, or verify external PlantUML service rendering and print.

The source installation and public preview commands are unchanged. The installed
plugin and dotfiles lock remain at v0.1.0 until a separately authorized migration.
At this builder revision, vendor assets remain outside the npm advisory report; zero npm findings is
not a complete renderer security or licensing audit.

## Renderer-asset follow-up review

The asset follow-up was validated from a fresh source copy named `plugin with
spaces`, without shared dependencies, generated output or private configuration.
The normal locked `npm ci --no-audit --no-fund` installed 204 packages; the full
build passed with Node 24/npm 11 and the baseline environment above.

| Check | Result |
| --- | --- |
| Chromium 141 | 27/27 passed (23.9 seconds) |
| Firefox 142.0.1 | 27/27 passed (34.7 seconds) |
| Actual MD Preview.app / Firefox 161.0 helper smoke | Passed with isolated profile |
| Repeated frontend build output hashes | Identical |
| Current locked npm audit | 0 findings |

The existing lifecycle, navigation, heading scrolling, unsaved updates, multiple
previews, buffer deletion and shutdown checks remain in the suite. New coverage
checks:

- Offline Mermaid flowcharts, sequence/ER diagrams, palette/mode changes, visible
  syntax errors and recovery, rapid edits and removal during a held lazy import.
- Offline Viz/Graphviz aliases and HTML labels, safe syntax errors and recovery,
  and edits while the WebAssembly renderer initializes. A deterministic held-WASM
  case caught and now guards against late rendering resetting a newer editor
  cursor scroll position; it failed before the scroll-snapshot fix.
- Native scrolling in top/middle/relative modes, bounds, interrupted animations,
  reduced motion and wrapped editor lines, with no TweenLite global.
- Matched KaTeX math/chemistry assets and fonts, the local Kalam sequence hand
  font, literal markup in sequence/flowchart labels, and no Mermaid/Viz engine
  download for plain documents.
- Retained-source SHA-256 values, the emitted module/version inventory, full
  available notice output and repeated byte-identical frontend builds from an
  external working directory with empty `NODE_OPTIONS`.

Isolated light/dark screenshots were inspected for alerts, code, math/chemistry,
Mermaid, charts, sequence diagrams, flowcharts and DOT. The legacy non-Mermaid
renderers retain their existing styling limitations: some diagram backgrounds
stay white and some chart/sequence text has low contrast in dark mode. This
maintenance block does not add a new diagram viewer or harmonize those themes.

The build reports 74 emitted npm packages. The notice inventory explicitly
records `md-it-meta`'s missing full-text license notice and the limits of native
Viz/ELK provenance; see [third-party notices](../THIRD_PARTY_NOTICES.md). Zero npm
findings does not audit retained vendor code or establish a trust mode for
untrusted documents. The earlier intermittent Firefox timeout remains unproven
as described above; it was not reproduced in these completed runs.

The installed plugin and dotfiles remain at v0.1.0. The validated source changes
are recorded with this follow-up; no installation migration or release
publication is part of it.

## Limits

Headless runs do not validate macOS window decorations, desktop focus behavior,
or the user's persistent profile/theme. Browser policies may reject
`window.close()` for ordinary tabs that were not script-opened. Tests deliberately
use script-opened pages for deterministic lifecycle checks.

Linux, Windows, WSL, Vim, remote-forwarding setups and Neovim versions other than
0.12.6 have not been run locally. CI targets Neovim 0.12.2 on Ubuntu but is not a
verified result yet. The MINGW cygpath and Windows image-root fixes have source
review only. External PlantUML service rendering and PDF/print output were not
browser-tested. Local-image accessibility, legacy diagram dark-mode contrast,
the recorded `md-it-meta` full-text notice gap and retained older Snap/sequence
libraries remain follow-up. The asset inventory records available provenance
without claiming a complete native dependency or legal compliance audit. The
current dependency audit and its scope are recorded in [maintenance](maintenance.md).
