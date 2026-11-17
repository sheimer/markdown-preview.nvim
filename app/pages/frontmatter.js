import { safeLoad } from 'js-yaml'

const delimiter = /^(?:---|\.\.\.)$/

export default function hideFrontmatter(md) {
  // Run after newline normalization, before Markdown block parsing. Blank the
  // metadata lines instead of deleting them so source-line scroll markers stay
  // aligned with the Neovim buffer. Inline rendering is never frontmatter.
  md.core.ruler.before('block', 'mkdp_frontmatter', (state) => {
    if (state.inlineMode || !/^(?:---|\.\.\.)(?:\n|$)/.test(state.src)) return
    const lines = state.src.split('\n')
    const closing = lines.findIndex(
      (line, index) => index > 0 && delimiter.test(line)
    )
    // An opening marker alone must never consume the remaining document.
    if (closing === -1) return
    try {
      // Preserve the existing YAML validation, including duplicate-key handling.
      // The preview uses no parsed metadata values.
      safeLoad(lines.slice(1, closing).join('\n'), { json: true })
    } catch (_) {
      return // Malformed YAML remains ordinary Markdown, as before.
    }
    lines.fill('', 0, closing + 1)
    state.src = lines.join('\n')
  })
}
