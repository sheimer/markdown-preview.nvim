# Maintenance baseline

This repository has its own development and release cycle. It starts at
`a923f5fc5ba36a3b17e289dc35dc17f66d0548ee` of
[iamcco/markdown-preview.nvim](https://github.com/iamcco/markdown-preview.nvim).
Git history, the original MIT license and source attribution remain intact.
There is no planned upstream rebase, merge or upstream pull request workflow.

The first baseline ports the working dotfiles implementation directly into
source: per-buffer lifecycle, linked Markdown documents, GitHub alerts, code
helpers, Mermaid layering, palettes and table styling. Personal browser launch
choices remain in the Neovim configuration. Runtime source patching is retired.

## Builds and generated files

Node.js 24 and npm are the supported toolchain. The root `package-lock.json`
is the only dependency lock. Use `npm ci`; do not maintain a Yarn lock or install
an independent dependency tree inside `app`. Generated `app/lib` and `app/out` files are ignored and must be rebuilt after
checkout/update. Project styles/favicon remain under `app/_static`. The retained
vendor sources under `app/vendor` are hash-verified; other renderer assets come
from exact npm versions and are copied/bundled into `app/out`. Installation must
build locally; no upstream release executable is downloaded.

A reproducible installation means exact locked packages, an explicit runtime
major, and a build from those source inputs. The esbuild pipeline also checks
identical output bytes and filenames across repeated frontend builds in the same
environment. Cross-platform byte identity has not been verified. Keep all runtime
dependencies installed after building.

## Dependency audit snapshot (v0.1.0)

`npm audit --json` on 2026-11-16 with the new lockfile reported 50 advisories:
9 low, 9 moderate, 29 high and 3 critical (including transitive packages).
This is an inherited-stack inventory, not a clean security bill. Direct packages
flagged include Next.js, markdown-it, next-routes, socket.io and socket.io-client.
Review runtime reachability separately from the legacy build toolchain; the
server serves exported static assets rather than running a Next.js server.
No automatic audit fix or major-version upgrade was mixed into this migration.

## First follow-up: runtime dependencies and input handling

Committed as `d1a649b`, the first follow-up updates the live socket and Markdown parser dependencies,
removes an unused router, and fixes two input-handling defects. This block kept
Node 24, Next 7 / React 16, the existing renderers and the per-buffer RPC contract.

| Dependency | Baseline lock | Runtime follow-up |
| --- | --- | --- |
| `socket.io` | 2.4.1 | 4.8.4 |
| `socket.io-client` | 2.5.0 | 4.8.4 |
| `markdown-it` | 12.3.2 | 14.3.3 |
| `next-routes` | 1.4.2 | Removed; no source/configuration imports |

The server and exported browser client move together; restart previews and
reload their pages after rebuilding. Legacy Socket.IO 2 clients are not enabled.
The application sends document content from server to client; its large-document
regression checks both polling and WebSocket delivery above 1 MiB, reconnection,
and reuse of unsaved content despite Socket.IO's newer inbound payload limit.

Markdown-It 14.3.3 carries the current 14.x security backports. Staying on that
line preserves automatic fuzzy links and existing parser-plugin interfaces;
15 changes those behaviors. See the
[14.3.3 changelog](https://github.com/markdown-it/markdown-it/blob/14.3.3/CHANGELOG.md)
and [smartquotes advisory](https://github.com/markdown-it/markdown-it/security/advisories/GHSA-r7fv-28h4-cvq7).
At that step, the old webpack could not consume the new parser's ESM dependency
graph. A temporary `app/next.config.js` alias selected the package's self-contained
browser distribution; the second follow-up removes that configuration.

### Input handling

- Markdown image titles previously became unquoted HTML attributes. A normal
  image title could execute an injected event handler even with `mkit.html`
  disabled. The local-image adapter now rewrites only the source URL and delegates
  attribute rendering to Markdown-It, preserving escaping, ordinary alt labels,
  dimensions and XHTML formatting. Deliberately supported raw HTML is unchanged.
- The Socket.IO handshake now checks a browser's Origin against the request's
  HTTP origin for both polling and WebSocket. Foreign, malformed and literal
  `null` origins are rejected; native clients without Origin remain allowed.
  This preserves direct local previews and `mkdp_open_ip` because the browser's
  socket uses its page origin. TLS-terminating proxies need separate integration.
  **This is not authentication or DNS-rebinding protection**: a client can forge
  headers, and an attacker-controlled hostname may still match after rebinding.
  HTTP document/image routes are not given an authentication policy in this block.

### Audit after the runtime follow-up

`npm audit --json`, refreshed 2026-11-16 against each lockfile:

| Severity | v0.1.0 | Runtime follow-up |
| --- | ---: | ---: |
| Low | 9 | 6 |
| Moderate | 9 | 6 |
| High | 29 | 23 |
| Critical | 3 | 3 |
| Total | 50 | 38 |

At `d1a649b`, the audit no longer flagged Markdown-It or either Socket.IO package.
Its remaining 38 findings belonged to the retained Next dependency graph; Next
was the remaining flagged direct dependency. Removing `next-routes` does not remove `path-to-regexp`,
which Next also used. Those findings were not all declared unreachable: the
application used `next/head` and exported Next browser assets, even though its
custom HTTP server never imported the Next server/router.
`npm audit --omit=dev` still included the builder as a production dependency;
moving it to devDependencies alone would not have remediated it.

The frontend-builder replacement below addresses that remaining npm dependency
graph. Asset refresh, platform coverage and a full document/remote-access trust
design remain separate review blocks.

## Second follow-up: static frontend build

The second follow-up replaces Next 7 / webpack with esbuild 0.28.2. React 16,
Markdown rendering plugins, diagram/math libraries and the Neovim RPC contract
remain in place. The custom HTTP server continues to serve static frontend files.
No frontend framework rewrite or third-party asset refresh is included.

- `app/index.html` contains the styles and ordered vendor scripts. Classic
  `defer` scripts execute in document order, with the compiled entry last.
- `app/client.jsx` mounts the existing preview component. The `__next` mount ID
  remains for compatibility with bundled and user stylesheets; there is no Next
  dependency behind it. Browser titles use `document.title` as text.
- `scripts/build.js` compiles the server helpers with TypeScript and bundles the
  browser entry with esbuild. The source installation command remains
  `npm ci && npm run build`; frontend-only builds use `npm run build-app`.
- `app/out/index.html` points to a content-hashed script under `app/out/assets`.
  The server exposes those files through a confined `/_assets/` route. Linked
  `.LEGAL.txt` output is retained and served with a text MIME type.
- `app/404.html` is copied into the output as a standalone error page without
  preview scripts or a socket connection. The build-version marker is retained.
- The Next configuration, export machinery and scoped OpenSSL legacy-provider
  option are removed. Rebuilding also clears an old installation's `.next` cache.

The old parser/browser compatibility alias is gone with Next. A separate esbuild
alias shares Markdown-It's public CommonJS entry between the application and
`md-it-meta`'s CommonJS import, avoiding duplicate parser bundles. The native
esbuild compiler is a build dependency installed from the npm lockfile for the
host platform; it is not a standalone plugin executable or runtime requirement.

### Audit and validation

The refreshed npm audit on 2026-11-16 reports **0 findings** across the locked npm
dependency graph, down from 38 after the runtime follow-up and 50 at v0.1.0.
This does not audit the vendor files in `app/_static`, establish a trust mode for
untrusted Markdown, or provide remote authentication/DNS-rebinding protection.

Acceptance coverage adds custom title/filename text, hidden YAML metadata,
compiled bundle and linked notice responses, confinement of the new asset route,
a script-free 404, and offline verification of PlantUML URL encoding. A build test runs from outside the checkout with no
`NODE_OPTIONS` and compares every frontend output's hash across two builds.
The normal browser suites remain the behavior contract; see
[validation](validation.md) for current results and limits.

## Third follow-up: renderer asset maintenance

This follow-up replaces inherited runtime blobs with pinned, reproducible
assets and records the available licenses and provenance. It adds no Mermaid
zoom/pan controls or expanded viewer; those features remain deferred.

| Component | Previous source | Current source |
| --- | --- | --- |
| Mermaid | Unversioned filename, matching the Git update recorded as 10.2.3 (`a648af9`) | npm `mermaid` 12.3.0 |
| Viz / Graphviz | Viz 2.1.2 / Graphviz 2.40.1 | npm `@viz-js/viz` 3.31.0 / Graphviz 16.1.0 |
| KaTeX / mhchem / fonts | KaTeX 0.15.3 plus unused 0.13.10 and an unversioned chemistry file | Matched npm `katex` 0.19.1 distribution |
| Underscore | 1.9.1 | npm 1.13.8 |
| Web Font Loader | 1.6.26 | npm 1.6.28 |
| Flowchart | 1.13.0 | npm 1.18.1, bundled with Raphael 2.3.0 |
| Snap.svg / sequence diagrams | 0.5.1 / 2.0.1 | Same verified Git source bytes, pinned by commit and SHA-256 |
| TweenLite | GreenSock 1.17.0 browser global | Native 400 ms cubic ease-out scrolling, cancellation and reduced-motion support |
| Sequence handwriting font | Inherited modified Daniel font files | Unchanged OFL Kalam Bold from `@fontsource/kalam` 5.3.0 |

### Build and runtime behavior

- [app/vendor-assets.json](../app/vendor-assets.json) declares copied npm assets,
  retained sources, versions, hashes and source URLs. The build checks versions
  and retained-source hashes, copies assets/notices under `/_assets/vendor/`,
  and generates the ordered stylesheet/classic-script tags. `.gitattributes`
  prevents checkout line-ending conversion from changing verified source bytes.
- Mermaid and Viz are lazy ES-module imports. Plain documents do not download
  either engine. Mermaid's own diagram modules and Viz's embedded WebAssembly
  stay local; no browser CDN or external Graphviz service is introduced.
- Both diagram adapters use asynchronous rendering, safe visible syntax errors,
  cached initialization and detached-node checks. A generation guard prevents an
  old document render from scrolling a newer one. Completion also uses the latest
  cursor-only scroll snapshot; a deterministic held-WASM regression proves that
  a late renderer cannot overwrite a newer editor position.
- The server-side TypeScript configuration explicitly limits ambient types to
  Node. Frontend Mermaid/D3 types are handled by esbuild and do not force an
  unrelated TypeScript compiler upgrade for the Node helpers.
- Existing Mermaid palette overrides, code fences, Graphviz aliases, math,
  chemistry, sequence/flowchart rendering, links and preview lifecycle remain.
  New renderer versions can change diagram layout. The sequence hand theme has a
  different handwriting face while retaining its API-compatible CSS family alias.

Mermaid's optional internal math renderer currently resolves its own KaTeX
0.18.10 dependency; global Markdown math/chemistry uses 0.19.1. Both versions are
locked and represented in the relevant asset/module inventories. No forced
transitive-version override is used.

### Notices and limits

Every build produces `assets/vendor/bundled-modules.json` and
`assets/vendor/BUNDLED-LICENSES.txt`, alongside linked minifier `.LEGAL.txt`
files. The module report derives ownership from emitted esbuild inputs and the
lockfile, records exact versions, published repositories/archive integrity and
full available notices, and supplements the Viz package with its native runtime
notices and source-archive hashes. See [third-party notices](../THIRD_PARTY_NOTICES.md)
and [Viz provenance](../app/vendor-viz.json).

At the renderer-asset revision there was one full-text notice gap: `md-it-meta`
0.0.2 declared MIT but its package and source tree supplied no standalone full
notice. The inventory recorded that gap without inventing attribution. The
frontmatter follow-up below removes this dependency. The inventory is not a legal
compliance certification.
Snap.svg and sequence-diagrams remain older retained
libraries with verified provenance, rather than being presented as modernized.

The refreshed locked npm audit still reports **0 findings** (2026-11-16). This is
not a security audit of retained vendor code or a new untrusted-document mode.
Validation uses modern Chromium/Firefox with ES modules, dynamic imports and
WebAssembly. Other browsers/platforms remain unverified; the ES2020 build target
is not a promise that newer library APIs are polyfilled. Current checks and
remaining limits are recorded in [validation](validation.md).

## Fourth follow-up: platform checks and support policy

The platform block fixes the observed hosted-build failure in
[run 43882058739](https://github.com/sheimer/markdown-preview.nvim/actions/runs/43882058739):
`ubuntu-latest` selected Ubuntu 26.04, which locked Playwright 1.56.1 could not
provision. The workflow now pins Ubuntu 24.04 and adds macOS 15 and Windows 2022,
testing Neovim 0.12.2/0.12.6 with both Chromium and Firefox. Node 24.12.0 and npm
11.10.0 are explicit. Each checkout has spaces in its directory name. This
configuration is backed by the hosted results recorded below.

The local browser suite establishes 0.12.2 as the tested minimum Neovim target;
the loader, health check and README use that same floor. This is a supported
baseline, not a claim that every earlier editor version is broken. The new
`:checkhealth markdown_preview` checks the actual configured Node executable,
source build and browser hook, replacing the obsolete packaged-executable check.

The portable test runner enumerates files without relying on shell globs and
supports `npm run test:firefox` on PowerShell as well as POSIX shells. Optional
reports capture actual runtime/browser versions, exit status, suite output and
test-owned Neovim logs. Every session asserts that config/data/state/cache paths
stay inside its temporary directory; cleanup waits for forced child termination
before removing files and retries transient Windows file locks.

Default server ports are now allocated atomically by the OS rather than chosen
from a 1000-port clock-derived range. URLs use the actual listening port;
explicit fixed ports retain their existing behavior and bind-error regression.
The transport regression no longer overrides the server's chosen port, so it
guards this isolation contract as well as the stop-during-connection race.
One additional macOS startup timeout remains unexplained; ten startup/shutdown
probes passed. Improved diagnostics retain Neovim messages and stderr, and the
port change is not presented as proof of that timeout's cause.

A pinned test-only Linux container allows local clean-install/build/browser
validation without touching the installed plugin. WSL has separate Linux-side
and Windows-browser acceptance instructions; ordinary Linux/native Windows runs
cannot establish that interoperability. See [platform testing](platform-testing.md)
for reproducible commands and [validation](validation.md) for completed evidence.
The first hosted run and its follow-up below record the path assertion fix and
subsequent complete matrix pass. WSL desktop checks remain unverified.

At that stage, the read-only `md-it-meta` investigation checked its parent repository,
`CaliStyle/markdown-it-meta`, which has no standalone license notice either. The
gap remained explicit; closing it required a supplied notice or a separately
tested dependency replacement. Platform work does not invent license text or
change frontmatter behavior to remove that dependency incidentally.

### Hosted CI follow-up (2026-11-17)

[Run 43908663860](https://github.com/sheimer/markdown-preview.nvim/actions/runs/43908663860)
at `01753e3` passed all 29 checks in each Ubuntu/x86-64 combination. Windows jobs
stopped at a separator-only path assertion, now normalized using Node's native
path implementation. macOS ARM64 jobs never acquired runners; hosted checks now
use the documented `macos-15-intel` label. GitHub capacity is not guaranteed.
The three GitHub-maintained actions move to Node 24-based v7 releases, addressing
their Node 20 annotations without changing the plugin toolchain or acceptance
criteria. [Run 44081811310, attempt 2](https://github.com/sheimer/markdown-preview.nvim/actions/runs/44081811310/attempts/2)
at `6d59bef` passed all twelve jobs, with 29/29 checks in each. The first attempt's
two macOS/Firefox jobs never acquired runners; the user-triggered rerun completed
without another source change. Hosted matrix acceptance is complete; see
[validation](validation.md#hosted-ci-annotations-follow-up-2026-11-17).

## Frontmatter dependency follow-up

The legacy `md-it-meta` dependency is removed rather than supplied with an
invented notice. Its published source and both small upstream histories contain
no full-text grant/copyright notice. An independently written plugin adapter now
handles the preview's actual requirement: hiding valid leading frontmatter.
The already-used `js-yaml` version 3.15.2 is pinned directly, preserving YAML
validation and duplicate-key handling. No other locked package version changes.

The adapter blanks complete metadata lines before Markdown block parsing,
retaining their line count so headings and editor scroll synchronization stay
aligned with the source buffer. It accepts the existing exact column-zero `---`
and `...` delimiters. Invalid YAML stays visible as ordinary Markdown. A missing
closing delimiter now also leaves the document visible instead of consuming the
body through EOF. The browser regression was confirmed to fail before this fix.

The default `hide_yaml_meta = 1` and the existing ordinary-Markdown display when
set to `0` are retained. A formatted or collapsible metadata display remains
deferred. The adapter does not use parsed metadata for titles or other features.

Removing the dependency also removes its special CommonJS Markdown-It build
alias and its package-specific notice-gap exception. Generated reports now
record full-text files for every emitted npm module; build checks guard that
contract. Native Viz/ELK provenance limits remain separately documented in
[third-party notices](../THIRD_PARTY_NOTICES.md). Current acceptance evidence is
recorded in [validation](validation.md).

## Focused follow-up

1. Runtime dependency/input hardening is committed as `d1a649b`. Continue refreshing
   advisory data and retain the browser behavior suite as the acceptance contract.
2. The esbuild replacement is committed as `b0cad8c`. It removes the old
   frontend-builder dependency graph and OpenSSL compatibility option while
   preserving the rendering stack and per-buffer RPC contract.
3. Renderer asset maintenance is committed as `d46c8b1`. Keep the manifests and
   generated notices aligned when updating packages. The frontmatter follow-up
   removes the `md-it-meta` notice gap. Mermaid viewer features remain deferred.
4. Platform checks are implemented; see [platform testing](platform-testing.md).
   The full Ubuntu/macOS Intel/Windows hosted matrix passes. WSL desktop acceptance
   remains open before expanding support claims. Standalone executable bundles are deferred.
5. Consider a trust mode for untrusted Markdown and authenticated remote access
   only as separate designs. The current local renderer enables raw HTML and
   resolves relative local documents; preview trusted documents only.

Before a local version tag, run the documented clean-install/build and browser
checks and record their environment and limits in `docs/validation.md`. Tags
and commits are local until explicitly pushed. A tag is not a published release.
