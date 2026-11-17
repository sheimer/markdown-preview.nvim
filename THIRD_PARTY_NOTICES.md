# Third-party notices

The plugin retains the original [MIT license](LICENSE) and Git attribution.
Changes ported from sheimer's Neovim configuration remain under that license.
Do not strip source copyright headers or license notices when updating assets.

## Current browser assets

The browser build uses exact npm versions from `package-lock.json` and the
[asset manifest](app/vendor-assets.json). The build validates those versions,
copies the required files and complete notices under `app/out/assets/vendor`,
and serves them locally. No browser CDN is needed for these assets.

| Component | Version and provenance | Notices |
| --- | --- | --- |
| KaTeX, mhchem and KaTeX fonts | `katex` 0.19.1; JS, CSS, chemistry extension and all 60 fonts come from the same npm distribution | [MIT, Khan Academy and contributors](docs/licenses/KaTeX-0.19.1.txt), [KaTeX font source notice](docs/licenses/KaTeX-fonts.txt) |
| Underscore | `underscore` 1.13.8, published UMD browser distribution | [MIT, Jeremy Ashkenas and contributors](docs/licenses/Underscore-1.13.8.txt) |
| Web Font Loader | `webfontloader` 1.6.28; used by sequence diagrams to detect locally declared font families | [Apache 2.0](docs/licenses/WebFontLoader-1.6.28.txt) |
| Flowchart.js | `flowchart.js` 1.18.1, compiled from its published source with Raphael | [MIT, Adriano Raiano](docs/licenses/Flowchart-1.18.1.txt) |
| Raphael | `raphael` 2.3.0, included once in the Flowchart vendor bundle | [MIT, Dmitry Baranovskiy](docs/licenses/Raphael-2.3.0.txt) |
| Eve runtime in Raphael | `eve-raphael` 0.5.0, Apache-licensed source embedded by Raphael | [Apache 2.0, Adobe Systems](docs/licenses/Eve-Raphael-0.5.0.txt) |
| Kalam Bold | `@fontsource/kalam` 5.3.0, unchanged Latin 700 WOFF2 from its npm distribution; Indian Type Foundry | [SIL Open Font License 1.1](docs/licenses/Kalam-5.3.0.txt) |
| Mermaid | `mermaid` 12.3.0; imported through the browser build | [MIT source notice](docs/licenses/Mermaid-12.3.0.txt); its bundled dependency notices also remain in generated `.LEGAL.txt` files |
| Viz.js / Graphviz / Expat | `@viz-js/viz` 3.31.0; Graphviz 16.1.0, Expat 2.8.5; source archive and embedded-backend hashes are in [Viz provenance](app/vendor-viz.json) | [Viz MIT](docs/licenses/Viz-3.31.0.txt), [Graphviz EPL 2.0](docs/licenses/Graphviz-16.1.0.txt), [Expat MIT](docs/licenses/Expat-2.8.5.txt) |
| Compiler-runtime notices accompanying Viz | Emscripten 6.0.10 runtime; the record preserves source notices without claiming every optional SDK component is linked | [Emscripten](docs/licenses/Emscripten-6.0.10.txt), [musl](docs/licenses/Emscripten-6.0.10-musl.txt), [libc++](docs/licenses/Emscripten-6.0.10-libcxx.txt) |

Other npm packages, including React, Chart.js, highlight.js, Markdown-It and their
bundled dependencies, retain their package license files in `node_modules` and
recognized license comments in linked generated `.LEGAL.txt` output. Preserve
those files when distributing built installations.

## Browser module dependency closure

The [bundle notice writer](scripts/bundle-notices.js) derives package ownership
from esbuild's emitted module inputs and the longest matching root in
`package-lock.json`. It deliberately does not treat generated subdirectory
`package.json` stubs as independently licensed packages.

Every build writes `assets/vendor/bundled-modules.json` and
`assets/vendor/BUNDLED-LICENSES.txt` into `app/out`. They record exact package
versions, relative package paths, declared licenses and source notice files,
and concatenate the complete LICENSE / COPYING / NOTICE / UNLICENSE texts
supplied by those packages. The native Viz notices above supplement the files
omitted from its npm distribution. These reports contain no local absolute paths
or generated timestamps and accompany the linked minifier `.LEGAL.txt` files.

For dual-licensed dependencies, the inventory selects **EPL 2.0 for ELK.js**
(`EPL-2.0 OR GPL-3.0-or-later`) and **Apache 2.0 for DOMPurify**
(`MPL-2.0 OR Apache-2.0`), while retaining supplied alternative license texts.
ELK.js publication `0.12.1` is tied to source commit
[`624ae90`](https://github.com/kieler/elkjs/tree/624ae90aa37110033a8af59c5ccbb292708b4317);
its exact npm archive/integrity and source archive URL are recorded in the
[asset manifest](app/vendor-assets.json). ELK includes a GWT-generated worker from
the Eclipse ELK Java code; this record does not claim a complete Java/GWT build
closure audit.
Khroma's published metadata omits its license field; its complete source license
explicitly names MIT and its authors, which the inventory records.

The former **md-it-meta 0.0.2** dependency declared MIT and author `iamcco`, but
supplied no standalone full-text license notice. Its published
[source commit](https://github.com/iamcco/md-it-meta/tree/aaed79a1b42f840ca5292d52c7b369b735b415a1)
also contains no LICENSE, COPYING or NOTICE file. Neither its seven-commit
history nor its parent repository's five-commit history supplied a full notice.
The dependency is now removed from the lockfile and emitted browser code.
Historical attribution and the original integration remain in Git history;
no notice or copyright attribution has been invented for that package.

Frontmatter handling is independently implemented in
[app/pages/frontmatter.js](app/pages/frontmatter.js) under this fork's MIT
license. YAML validation retains the already-used `js-yaml` **3.15.2**, now an
exact direct dependency. Its complete MIT notice, copyright Vitaly Puzrin, is
included in generated `BUNDLED-LICENSES.txt` and recorded in the module inventory.
Every emitted npm module currently has recorded full-text notice files. This
closes the specific missing-notice dependency gap; the inventory remains evidence
of available notices, not a legal compliance certification or complete native
Viz/ELK dependency audit.

## Retained upstream sources

Two libraries have no newer maintained drop-in release appropriate to this
migration. They remain checked-in source inputs under [app/vendor](app/vendor),
with SHA-256 validation at build time and immutable upstream source URLs in the
[manifest](app/vendor-assets.json):

- **Snap.svg 0.5.1**, exact bytes from commit
  `d8f7508872b6e9c0059e1f714514244d08acdb7b`. The GitHub release differs slightly
  from its npm 0.5.1 publication, so its verified GitHub bytes are retained.
  Original Apache headers remain. See the [Apache license](docs/licenses/Apache-2.0.txt)
  and complete [upstream NOTICE](docs/licenses/Snap-0.5.1-NOTICE.txt), including
  Adobe's Eve notices. That upstream NOTICE also mentions development/demo
  dependencies; it is retained as supplied, not a statement that they all ship.
- **js-sequence-diagrams 2.0.1**, exact JavaScript from commit
  `a6c252b2ed0d1e6b1d16be066f582afd2895e6c9`. See the original
  [BSD 2-Clause license](docs/licenses/Sequence-diagrams.txt), copyright Andrew
  Brampton. The npm package name currently points to a security-holder placeholder,
  so the real release is retained by Git provenance instead of that npm name.
  Its stylesheet is adapted to use a local font while preserving source notice.

The sequence renderer's internal `danielbd` CSS family name is retained as an
alias backed by **Kalam Bold**, not Daniel font bytes. This avoids changing the
legacy renderer's API while keeping the actual font file unchanged and licensed
under OFL. Web Font Loader checks this locally declared custom family; the
sequence code does not configure a remote font provider or stylesheet URL.

## Removed inherited assets

- Legacy TweenLite 1.17.0 is removed in favor of the plugin's own browser scrolling
  code; its separate GreenSock license is not silently treated as MIT.
- Old Viz.js 2.1.2 / Graphviz 2.40.1 / Expat 2.2.5 browser bundles are replaced.
  The original [Viz notice](docs/licenses/Viz.txt) is retained as historical
  attribution; current output uses the versions and licenses above.
- KaTeX 0.13.10 and 0.15.3 JS/CSS and the unversioned mhchem copy are removed.
  Original [KaTeX attribution](docs/licenses/KaTeX.txt) remains in history/notices.
- The inherited Daniel font files are removed. The
  [author's notice](docs/licenses/Daniel-original-notice.txt) asks that modified
  copies not be distributed, while the
  [upstream sequence-diagram notes](docs/licenses/Daniel-upstream-notes.md)
  describe glyph modifications to the distributed files. The current build uses
  unchanged OFL Kalam font bytes instead. These records document the replacement
  rationale rather than make a legal determination about historical releases.

## Icons, palettes and copied modules

Embedded `ri-*` SVG masks in `app/_static/markdown.css` are adaptations of
[Remix Icon](https://github.com/Remix-Design/RemixIcon), Remix Design, from the v4
icon set under [Apache 2.0](docs/licenses/Apache-2.0.txt). The inherited favicon
comes from the original plugin's Git history and is retained with its attribution.

Palette values are adaptations inspired by
[Forestbones (part of Zenbones)](https://github.com/zenbones-theme/zenbones.nvim),
[Everforest](https://github.com/sainnhe/everforest),
[Gruvbox](https://github.com/morhetz/gruvbox),
[Catppuccin](https://github.com/catppuccin/palette) and
[GitHub Primer](https://github.com/primer/primitives). Names describe visual
compatibility, not affiliation. The personal Firefox theme/XPI remains in the
user's configuration and is not redistributed by this plugin.

`app/pages/katex.js` retains its source attribution to `markdown-it-katex` /
`markdown-it-math`. Original notices remain on retained code and in Git history.
