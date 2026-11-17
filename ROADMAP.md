# Roadmap

The independent fork's working baseline is established. The current focus is
daily use and maintenance of trusted, local Markdown previews. No further
feature package is scheduled; the items below have no committed release dates.

Completed work and build/release policy live in [maintenance](docs/maintenance.md).
Exact test results and remaining coverage limits live in
[validation](docs/validation.md).

## Routine maintenance

- Address reproducible regressions in preview lifecycle, navigation, rendering
  and installation as they arise. Keep the browser suite as the behavior contract.
- When updating dependencies or supported runtimes, review advisories, refresh
  the lockfile and asset manifests/notices together, and run the documented
  clean-build and browser checks. Older React, Snap.svg and sequence-diagram
  dependencies deserve continued review; replacing them is not a scheduled rewrite.
- Revisit the native Viz/ELK source/build provenance limits when updating those
  renderers or changing distribution. Available notices are recorded in
  [third-party notices](THIRD_PARTY_NOTICES.md); a complete dependency-closure
  audit remains open.

## Watchlist: investigate only if a failure recurs

An earlier Firefox multi-preview DOM timeout and one macOS preview-startup
timeout remain unexplained. Subsequent suites passed, including the current
[twelve-job hosted matrix](docs/validation.md#hosted-frontmatter-matrix-2026-11-17).
There is no active investigation. Passing runs do not establish either cause
or prove a fix.

If either recurs, use the retained test diagnostics to record the source
revision, environment and failing scenario, then reproduce it before changing
timeouts or startup behavior. Diagnostic commands and artifacts are documented
in [platform testing](docs/platform-testing.md).

## Optional polish, driven by actual use

These are separate, small follow-ups rather than one required package.

| Area | Revisit when | Intended result |
| --- | --- | --- |
| Legacy diagram contrast | A diagram is difficult to read in a used palette/mode | Readable labels, lines and fills, with browser coverage for the affected renderer and theme changes. |
| Print/PDF | Exporting a preview becomes useful | Inspect actual output for page breaks, wide tables, code, diagrams and sticky controls. |
| External PlantUML | The external renderer is used | Verify real rendering and service-failure behavior with synthetic diagram content; keep the core suite independent of that service. Current tests check URL encoding only. |
| Local images | Image handling changes or a platform-specific problem appears | Extend existing loading/attribute checks for encoded paths, custom image roots, alt text and missing images. |
| Desktop/browser coverage | Adopting another desktop or browser setup | Verify launch, focus, native links and window cleanup with isolated profiles. Test WSL-to-Windows browser interoperability separately from native Windows CI. |
| Frontmatter display | Visible metadata becomes useful | Improve the opt-in display without changing the default hidden frontmatter, document-body preservation or source-line alignment. |

## Deferred designs and features

- **Untrusted-document handling and authenticated remote access:** separate
  designs, to be considered only when there is a concrete use case. Define HTML,
  local-file access and authentication boundaries before implementation. The
  current supported workflow remains trusted documents on a local preview server.
- **Mermaid zoom, pan and an expanded viewer:** low priority given current use;
  rendering maintenance does not imply viewer controls.
- **Standalone executables for multiple platforms:** deferred. Node 24 and the
  locked local source build remain the installation model. Revisit only if
  avoiding that toolchain justifies packaging, update and provenance work.

Future work should preserve independent per-buffer previews, unsaved-buffer
reuse, native linked-document navigation and reproducible installation. Choose
one bounded change at a time and record its validation before expanding scope.
