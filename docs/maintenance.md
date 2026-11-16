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
checkout/update. Static
vendor files under `app/_static` remain versioned source inputs. Installation
must build locally; no upstream release executable is downloaded.

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

## Focused follow-up

1. Runtime dependency/input hardening is committed as `d1a649b`. Continue refreshing
   advisory data and retain the browser behavior suite as the acceptance contract.
2. The esbuild replacement is complete. It removes the old
   frontend-builder dependency graph and OpenSSL compatibility option while
   preserving the rendering stack and per-buffer RPC contract.
3. Inventory bundled assets and their transitive licenses/versions, especially
   legacy TweenLite, Graphviz/Viz.js and the unversioned Mermaid bundle. Refresh
   or replace them deliberately with rendering regression coverage.
4. Add verified Linux, Windows and WSL browser runs and choose a minimum Neovim
   version from actual CI coverage. Standalone executable bundles are deferred.
5. Consider a trust mode for untrusted Markdown and authenticated remote access
   only as separate designs. The current local renderer enables raw HTML and
   resolves relative local documents; preview trusted documents only.

Before a local version tag, run the documented clean-install/build and browser
checks and record their environment and limits in `docs/validation.md`. Tags
and commits are local until explicitly pushed. A tag is not a published release.
