# Baseline validation

Original baseline environment: macOS 26.6.2 (Darwin 25.6.0), Apple Silicon,
Neovim 0.12.6, Node.js 24.12.0, npm 11.10.0. Completed 2026-11-16.
Later sections record follow-up checks and the current platform evidence.

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

At that revision, the build reported 74 emitted npm packages. The notice inventory explicitly
records `md-it-meta`'s missing full-text license notice and the limits of native
Viz/ELK provenance; see [third-party notices](../THIRD_PARTY_NOTICES.md). Zero npm
findings does not audit retained vendor code or establish a trust mode for
untrusted documents. The earlier intermittent Firefox timeout remains unproven
as described above; it was not reproduced in these completed runs.

The installed plugin and dotfiles remain at v0.1.0. The validated source changes
are recorded with this follow-up; no installation migration or release
publication is part of it.

## Platform follow-up review

The platform block adds a portable test command, health-check coverage and an
explicit hosted matrix; it does not change the rendering dependencies. Completed
local runs use isolated Neovim state, browser contexts and fixture copies. Node
24.12.0/npm 11.10.0 and locked Playwright 1.56.1 are retained.

| Environment | Neovim | Chromium 141.0.7390.37 | Firefox 142.0.1 |
| --- | --- | --- | --- |
| macOS 26.6.2 / ARM64 | 0.12.2 | 29/29 passed (24.3 s) | 29/29 passed (37.4 s) |
| macOS 26.6.2 / ARM64 | 0.12.6 | 29/29 passed (24.5 s) | 29/29 passed (35.5 s) |
| Ubuntu 24.04.3 / ARM64 container | 0.12.2 | 29/29 passed (20.4 s) | 29/29 passed (29.9 s) |

The Linux checks use the pinned test container on Colima's ARM64 Linux VM, not a
desktop Linux installation. Its Ubuntu 24.04.3 userspace runs with kernel
6.8.0-64-generic; the official Node/Neovim archive checksums are enforced by the
[Dockerfile](../test/platform/linux.Dockerfile). `npm ci` and the complete build
run inside that image, without host dependencies or generated output. Neither
the image nor its reports are published.

The macOS 0.12.2 release archive was downloaded into a temporary tools directory
and verified against its published SHA-256
`eeddee1009734f9071266e6b1b8a70308cb60cbcc45f5e1c1023adc471450fee`.
The installed Neovim binary and personal configuration were untouched. This is
evidence for the supported 0.12.2 floor; it is not a compatibility claim for
untested earlier editors or future major versions.

The new health integration exercises the public `:checkhealth markdown_preview`
command with a configured Node executable, verifies the actual source build and
runtime dependencies, and checks readable errors for a missing Node executable
and browser hook. It asserts that no preview is launched. The former check still
looked for retired packaged executables and ignored `g:mkdp_node_command`.

The runner captures the actual browser version, platform/architecture, Node/npm,
Neovim and Playwright versions, suite output, result status and optional isolated
session data. The browser selection rejects unknown values rather than silently
running Chromium. A failure-path smoke confirmed a nonzero exit for an invalid
browser. State-path containment is asserted in every Neovim session. An
`actionlint` 1.7.12 check of the expanded workflow passed.

The initial Linux Chromium run exposed an OS-font assumption in the wide-table
test: the fixture fit the original 1100-pixel window. The test now uses a
600-pixel viewport for that case, restoring the original size afterwards, while
retaining every full-value, selection, keyboard scrolling, sticky-header and
document-overflow assertion. Firefox also requires foregrounding that native
tab before resizing it; the background resize stalled on both macOS and Linux.
Those failed attempts were retained during investigation. They are separate
from the earlier unexplained Firefox multi-preview DOM timeout; its cause is
still unproven. No renderer CSS or product behavior was changed for these tests.

A missing-browser bootstrap smoke additionally produced exit status 1 and the
expected diagnostic/result files. The CI wrapper therefore preserves setup
failures rather than reporting a zero exit status without running the suite.

One earlier macOS 0.12.6/Chromium attempt passed 27/28 checks but timed out waiting
for the browser hook before the Graphviz scenario could open its page. Its saved
logs did not establish a cause. Ten isolated startup/shutdown probes then passed.
Session reports now retain `:messages` and captured Neovim stderr in
`nvim-diagnostics.json`; hook timeouts include those diagnostics in the error.
The final table records runs with those diagnostics and the port change below.
The original timeout remains an observed intermittent failure with unproven cause.

Default previews now bind port `0`, letting the OS reserve a free local port
atomically, and report the resulting port in their URL. This removes the prior
1000-port clock-based selection window. The real HTTP/socket transport regression
was confirmed to fail against that prior selection policy, then pass after the
change. A new two-editor integration checks distinct default ports, correct live
contents, and the second editor remaining available after the first shuts down.
The occupied-fixed-port regression still passes. This fixes a known collision
risk; it does not prove that a collision caused the startup timeout above.

The actual MD Preview.app / Firefox 161.0 launch-helper smoke also passed against
the final source with Neovim 0.12.2 and an isolated temporary profile. It checked
rendering, native document links, hidden buffers, unsaved updates, per-buffer
stop and shutdown, including URLs containing the OS-allocated server port.
The user's persistent Firefox profile, installed plugin and application bundle
were not modified.

The previously pushed source `d46c8b1` has an observed hosted failure in
[run 43882058739](https://github.com/sheimer/markdown-preview.nvim/actions/runs/43882058739).
It failed while installing browser dependencies: the runner selected Ubuntu
26.04, which Playwright 1.56.1 did not support. This is distinct from a plugin
test failure. The revised matrix pins Ubuntu 24.04, macOS 15 and Windows 2022,
each with Neovim 0.12.2/0.12.6 and Chromium/Firefox. At the package 4 commit that
hosted matrix had not run; the next section records its first results. Local
results alone do not establish native Windows, Linux x86-64 or WSL desktop
interoperability. The separate acceptance steps are
in [platform testing](platform-testing.md).

The `md-it-meta` notice gap was rechecked at that stage, including its parent repository, with
no full-text notice found. It remained recorded rather than being filled with
assumed attribution. No frontmatter or dependency replacement is included here.
The installed plugin/dotfiles remain at v0.1.0. The validated platform changes
are recorded with this follow-up, without a push, tag or release publication.

## Hosted CI annotations follow-up (2026-11-17)

Inspected [run 43908663860](https://github.com/sheimer/markdown-preview.nvim/actions/runs/43908663860)
for source `01753e3`, including job conclusions and test logs:

| Hosted target | Neovim / browser combinations | Result |
| --- | --- | --- |
| Ubuntu 24.04 / x86-64 | 0.12.2 and 0.12.6, Chromium and Firefox | 29/29 passed in each of four jobs |
| Windows Server 2022 / x86-64 | Same four combinations | Each stopped at the linked-buffer path assertion; remaining main-scenario assertions did not run |
| macOS 15 / ARM64 | Same four combinations | No runner acquired; no plugin tests executed |

Every Windows failure showed the same separator-only mismatch between a Neovim
`D:/.../detail with spaces.md` filename and Node's expected `D:\\...\\detail with spaces.md`.
The fix applies `path.normalize` to the actual filename before the strict
comparison, keeping the complete expected path. Eight captured assertion pairs
(the subtest and parent reports from all four jobs) were replayed locally with
Node's Windows path implementation and compared equal after normalization;
different filenames remain distinct. This is a test portability fix, with no
plugin link-resolution change. It does not establish a complete Windows pass.

With the corrected assertion, the affected navigation/lifecycle file passed
18/18 checks locally in both Chromium and Firefox on macOS ARM64 with Neovim
0.12.6 and Node 24.12.0. The revised workflow passed `actionlint` 1.7.12. No
production rendering or runtime dependency change required a rebuild.

The workflow uses Node 24-based v7 releases of checkout/setup-node/upload-artifact
to address their action-runtime deprecations. Its macOS target becomes the
documented `macos-15-intel` x86-64 runner to avoid the reported ARM64 capacity
constraint. The plugin's runtime remains Node 24.12.0. GitHub's internal-server
error and runner availability cannot be repaired in plugin source; the revised
jobs required a new hosted run. The successful rerun is recorded below; the agent
did not initiate it or change GitHub settings.

## Completed hosted matrix (2026-11-17)

[Run 44081811310, attempt 2](https://github.com/sheimer/markdown-preview.nvim/actions/runs/44081811310/attempts/2)
for source `6d59befcb82b7b59a6a269ef4f7150bdc0cba2bd` completed successfully.
All twelve job conclusions and their test totals were verified from the run logs:

| Hosted target | Neovim versions | Browsers | Result |
| --- | --- | --- | --- |
| Ubuntu 24.04 / x86-64 | 0.12.2, 0.12.6 | Chromium, Firefox | Four jobs, 29/29 checks each |
| macOS 15 Intel / x86-64 | 0.12.2, 0.12.6 | Chromium, Firefox | Four jobs, 29/29 checks each |
| Windows Server 2022 / x86-64 | 0.12.2, 0.12.6 | Chromium, Firefox | Four jobs, 29/29 checks each |

Attempt 1 passed ten jobs. The remaining two macOS/Firefox jobs executed zero
steps after failing to acquire hosted runners; GitHub also reported an internal
server error. The user triggered attempt 2 on the same commit, and every job
passed. This retry addresses runner allocation, rather than replacing a failing
plugin-test result. No test was skipped or made optional to obtain the pass.

This closes hosted matrix acceptance, including the Windows path assertion
correction and the Node 24 action-runtime updates. It does not establish WSL
desktop interoperability, general desktop focus/default-launcher behavior, or
the cause of the earlier intermittent startup and Firefox DOM timeouts. Those
limits remain explicit alongside the independent local ARM64 results above.

## Frontmatter dependency follow-up

The plugin-owned adapter replaces `md-it-meta`, retaining the same `js-yaml`
3.15.2 parser as a pinned direct dependency. The lockfile removes only
`md-it-meta`; no retained package version changes. A normal clean `npm ci`
installed 203 packages and the complete build passed on Node 24.12.0/npm 11.10.0.
The generated browser inventory has 72 emitted npm packages, all with recorded
full-text notice files and no declaration-only notice gaps. The locked npm audit
reports zero findings (2026-11-17). These facts close the specific dependency
notice gap, not the separately documented native Viz/ELK provenance limits.

| Environment | Neovim | Chromium 141.0.7390.37 | Firefox 142.0.1 |
| --- | --- | --- | --- |
| macOS 26.6.2 / ARM64 | 0.12.6 | 33/33 passed (26.1 s) | 33/33 passed (44.0 s) |
| Fresh Ubuntu 24.04.3 / ARM64 test image | 0.12.2 | 33/33 passed (21.8 s) | 33/33 passed (35.0 s) |

The Linux image built the source from scratch in `plugin with spaces`, using the
documented pinned Dockerfile and no host dependencies or generated output.
Both browser runs used disposable containers and isolated Neovim state. The
actual personal launch-helper smoke also passed with Firefox 161.0 (build
20261116103204) and an isolated temporary profile. It checked source rendering,
native linked documents, hidden buffers, unsaved updates, per-buffer stop and
shutdown. No installed plugin or dotfiles update is part of this follow-up.

Four new real-browser/Neovim regressions cover:

- Complete leading frontmatter with the existing `---`/`...` delimiter
  combinations, empty metadata, duplicate YAML keys, malformed YAML, non-leading
  blocks, indented markers and fenced YAML examples. Body source-line attributes
  retain their original buffer positions.
- Deleting a closing delimiter during live edits preserves headings and source
  text, for both opening delimiters. Adding the delimiter back hides only the
  valid metadata again. This regression was confirmed to fail against the old
  adapter: a valid YAML mapping followed by Markdown headings (also valid YAML
  comments) previously consumed and hid everything through EOF.
- Native heading-fragment navigation and cursor-driven editor scroll alignment
  after hidden metadata.
- `hide_yaml_meta = 0` retaining its existing ordinary-Markdown display, without
  a new formatted or collapsible metadata UI.

The reproducible-build check also verifies that `md-it-meta` is absent from the
emitted module inventory, `js-yaml` retains its full notice, and the current npm
module inventory has no full-text notice gaps. Repeated builds remain checked
for byte-identical output. The retired dependency's special Markdown-It CommonJS
alias and package-specific notice exception are removed.

### Hosted frontmatter matrix (2026-11-17)

[Run 44110039196, attempt 1](https://github.com/sheimer/markdown-preview.nvim/actions/runs/44110039196/attempts/1)
tested the pushed frontmatter revision `e4eb334`. All twelve jobs passed, and
their logs each record 33 tests, 33 passes, zero failures and zero skipped tests.

| Hosted environment | Neovim | Browsers | Result |
| --- | --- | --- | --- |
| Ubuntu 24.04 / x86-64 | 0.12.2, 0.12.6 | Chromium, Firefox | Four jobs, 33/33 checks each |
| macOS 15 Intel / x86-64 | 0.12.2, 0.12.6 | Chromium, Firefox | Four jobs, 33/33 checks each |
| Windows Server 2022 / x86-64 | 0.12.2, 0.12.6 | Chromium, Firefox | Four jobs, 33/33 checks each |

This brings hosted acceptance up to the frontmatter change. It does not extend
desktop/WSL coverage or establish the causes of the two earlier intermittent
failures. Those remain on the [roadmap watchlist](../ROADMAP.md#watchlist-investigate-only-if-a-failure-recurs).

## Limits

Headless runs do not validate macOS window decorations, desktop focus behavior,
or the user's persistent profile/theme. Browser policies may reject
`window.close()` for ordinary tabs that were not script-opened. Tests deliberately
use script-opened pages for deterministic lifecycle checks.

WSL desktop interoperability, remote-forwarding setups and editor versions
outside the recorded matrix have not been validated. Vim is not supported.
Hosted Ubuntu, macOS Intel and native Windows Server 2022 checks are verified.
The MINGW cygpath and untested Windows image-root fixes have source review only.
External PlantUML service rendering and PDF/print output were not browser-tested.
Local-image accessibility, legacy diagram dark-mode contrast and retained older
Snap/sequence libraries remain follow-up. The asset inventory records available provenance
without claiming a complete native dependency or legal compliance audit. The
current dependency audit and its scope are recorded in [maintenance](maintenance.md).
