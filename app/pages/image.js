function resolveHtmlImage (tokens, idx) {
  let content = tokens[idx].content || ''

  content = content.replace(/<img\s+([^>]*?)src\s*=\s*(["'])([^\2>]+?)\2([^>]*)>/gm, (m, g1, g2, g3, g4) => {
    if (/^(http|\/\/|data:)/.test(g3)) {
      return m
    }
    return `<img ${g1}src="/_local_image_${encodeURIComponent(g3)}"${g4}>`
  })

  return content
}

export default function localImage (md) {
  const renderImage = md.renderer.rules.image
  md.renderer.rules.image = (tokens, index, options, env, self) => {
    const token = tokens[index]
    const src = token.attrGet('src') || ''
    if (!/^(http|\/\/|data:)/.test(src)) {
      token.attrSet('src', '/_local_image_' + encodeURIComponent(src))
    }
    // Keep Markdown's attribute escaping, alt text and XHTML rendering rules.
    return renderImage(tokens, index, options, env, self)
  }
  md.renderer.rules.html_block = resolveHtmlImage
  md.renderer.rules.html_inline = resolveHtmlImage
}
