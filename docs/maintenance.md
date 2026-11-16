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

## Dependency audit snapshot

`npm audit --json` on 2026-11-16 with the new lockfile reported 50 advisories:
9 low, 9 moderate, 29 high and 3 critical (including transitive packages).
This is an inherited-stack inventory, not a clean security bill. Direct packages
flagged include Next.js, markdown-it, next-routes, socket.io and socket.io-client.
Review runtime reachability separately from the legacy build toolchain; the
server serves exported static assets rather than running a Next.js server.
No automatic audit fix or major-version upgrade was mixed into this migration.

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
