# Third-party notices

The plugin retains the original [MIT license](LICENSE) and Git attribution.
Changes ported from sheimer's Neovim configuration are part of this fork under
that license. Do not strip notices from bundled JavaScript or copied modules.

The following assets are checked into `app/_static` rather than obtained from
the npm lockfile. This inventory records identifying notices from those files;
it is not a claim that the old vendor stack has been modernized. Where a version
is missing from the inherited file, that uncertainty is explicit.

| Asset | Attribution and license/source |
| --- | --- |
| `flowchart@1.13.0.min.js` | Copyright 2019 Adriano Raiano; [MIT license](docs/licenses/Flowchart.txt); [flowchart.js](https://github.com/adrai/flowchart.js) |
| `raphael@2.3.0.min.js` | Raphael contributors; [MIT license](docs/licenses/Raphael.txt); [source](https://github.com/DmitryBaranovskiy/raphael/tree/v2.3.0) |
| `underscore-min.js` (1.9.1) | Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors; [MIT license](docs/licenses/Underscore.txt) |
| `webfont.js` (1.6.26) | Small Batch, Inc.; Adobe Systems and Google; [Apache 2.0](docs/licenses/Apache-2.0.txt); [source](https://github.com/typekit/webfontloader) |
| `snap.svg.min.js` (header 0.5.1) | Copyright 2013-2017 Adobe Systems Incorporated; [Apache 2.0](docs/licenses/Apache-2.0.txt); [source](https://github.com/adobe-webplatform/Snap.svg) |
| `sequence-diagram-min.js` (2.0.1), CSS | Copyright 2012-2017 Andrew Brampton; [Simplified BSD license](docs/licenses/Sequence-diagrams.txt); [source](https://github.com/bramp/js-sequence-diagrams/tree/v2.0.1) |
| `katex@0.13.10.*`, `katex@0.15.3.*`, `mhchem.min.js` | KaTeX contributors; [MIT license](docs/licenses/KaTeX.txt); [source](https://github.com/KaTeX/KaTeX/tree/v0.15.3). Only 0.15.3 is loaded; older copies remain inherited assets. |
| `fonts/KaTeX_*` | KaTeX / Computer Modern derived font assets; [KaTeX font license](docs/licenses/KaTeX-fonts.txt) and [source](https://github.com/KaTeX/katex-fonts). Keep font-specific attribution when refreshing these files. |
| `mermaid.min.js` | Mermaid contributors; [MIT license text](docs/licenses/Mermaid.txt); [project source/license](https://github.com/mermaid-js/mermaid). Exact inherited bundled version has not been established. |
| `tweenlite.min.js` (1.17.0, 2015-05-27) | Copyright 2008-2015 GreenSock; **separate GreenSock standard license**, not the plugin's MIT license. Its original license URL and author header remain in the file. [Original notice](app/_static/tweenlite.min.js). Review or replace this legacy asset before broader redistribution changes. |
| `viz.js`, `full.render.js` (Viz.js 2.1.2) | Copyright 2014-2018 Michael Daines; [MIT license](docs/licenses/Viz.txt). Includes Graphviz 2.40.1 under EPL 1.0, Expat 2.2.5 under MIT, and zlib; see the full header in [viz.js](app/_static/viz.js) and [source distribution](https://github.com/mdaines/viz.js/tree/v2.1.2). |
| Embedded `ri-*` SVG masks in `markdown.css` | [Remix Icon](https://github.com/Remix-Design/RemixIcon), Remix Design; icons adapted into monochrome CSS masks; [Apache 2.0 license](docs/licenses/Apache-2.0.txt) from the v4 icon set. |

The bundled palette values are adaptations inspired by Forestbones/Everforest,
[Gruvbox](https://github.com/morhetz/gruvbox),
[Catppuccin](https://github.com/catppuccin/palette) and
[GitHub Primer](https://github.com/primer/primitives). Names describe visual
compatibility, not affiliation. The personal Firefox theme/XPI is deliberately
left in the user's configuration and is not redistributed by this fork.

`app/pages/katex.js` retains its original source attribution to
`markdown-it-katex` / `markdown-it-math`. Installed npm dependencies carry their
own license files in `node_modules`; preserve those when distributing built
installations. Full transitive asset/version and license inventory is a focused
follow-up in [maintenance](docs/maintenance.md).
