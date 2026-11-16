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
an independent dependency tree inside `app`. Generated `app/lib`, `app/out` and
`app/.next` files are ignored and must be rebuilt after checkout/update. Static
vendor files under `app/_static` remain versioned source inputs. Installation
must build locally; no upstream release executable is downloaded.

A reproducible installation means exact locked packages, an explicit runtime
major, and a build from those source inputs. It does not promise byte-identical
Next.js output (the legacy builder includes a generated build identifier).
Keep all runtime dependencies installed after building.

## Dependency audit snapshot (v0.1.0)

`npm audit --json` on 2026-11-16 with the new lockfile reported 50 advisories:
9 low, 9 moderate, 29 high and 3 critical (including transitive packages).
This is an inherited-stack inventory, not a clean security bill. Direct packages
flagged include Next.js, markdown-it, next-routes, socket.io and socket.io-client.
Review runtime reachability separately from the legacy build toolchain; the
server serves exported static assets rather than running a Next.js server.
No automatic audit fix or major-version upgrade was mixed into this migration.

## First follow-up: runtime dependencies and input handling

The first review block updates the live socket and Markdown parser dependencies,
removes an unused router, and fixes two input-handling defects. It keeps Node 24,
Next 7 / React 16, the existing renderers and the per-buffer RPC contract.

| Dependency | Baseline lock | Review candidate |
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
The old webpack cannot consume the new parser's ESM dependency graph, so
`app/next.config.js` selects the package's self-contained browser distribution.
Remove that compatibility alias when replacing the frontend builder.

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

### Refreshed audit

`npm audit --json`, refreshed 2026-11-16 against each lockfile:

| Severity | v0.1.0 | Review candidate |
| --- | ---: | ---: |
| Low | 9 | 6 |
| Moderate | 9 | 6 |
| High | 29 | 23 |
| Critical | 3 | 3 |
| Total | 50 | 38 |

The audit no longer flags Markdown-It or either Socket.IO package. The remaining
38 findings are in the retained Next dependency graph; Next is the remaining
flagged direct dependency. Removing `next-routes` does not remove `path-to-regexp`,
which Next also uses. There is no claim that all remaining findings are
unreachable: the application uses `next/head` and exported Next browser assets,
even though its custom HTTP server never imports the Next server/router.
`npm audit --omit=dev` would still include the builder, which is currently a
production dependency. Moving it to devDependencies alone would not remediate it.

The next dependency block is the frontend-builder replacement below. Keep asset
refresh, platform coverage and a full document/remote-access trust design as
separate review blocks.

## Focused follow-up

1. Inventory and address dependency advisories, starting at the HTTP/socket and
   Markdown trust boundaries. Keep the browser behavior suite as the acceptance
   contract. The retained Next.js 7 / React 16 stack is old; baseline success
   does not mean that its dependency security work is complete.
2. Replace the legacy frontend builder and remove its scoped OpenSSL legacy
   provider requirement in a separate change. Preserve diagram/math/export
   rendering and the per-buffer RPC contract.
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
