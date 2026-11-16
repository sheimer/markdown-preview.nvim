import { escape } from './utils'

let mermaidPromise
let nextDiagram = 0

function loadMermaid() {
  if (!mermaidPromise) {
    mermaidPromise = import('mermaid')
      .then((module) => module.default)
      .catch((error) => {
        mermaidPromise = undefined
        throw error
      })
  }
  return mermaidPromise
}

export async function renderMermaid(nodes, options = {}) {
  if (!nodes.length) return
  let mermaid
  try {
    mermaid = await loadMermaid()
  } catch (error) {
    for (const node of nodes) showError(node, error)
    return
  }
  for (const node of nodes) {
    if (!node.isConnected) continue
    const source = node.textContent
    try {
      mermaid.initialize({
        fontFamily: getComputedStyle(node).fontFamily,
        ...options,
        startOnLoad: false
      })
      const { svg, bindFunctions } = await mermaid.render(
        'mkdp-mermaid-' + ++nextDiagram,
        source,
        node
      )
      if (!node.isConnected) continue
      node.innerHTML = svg
      if (bindFunctions) bindFunctions(node)
      // Keep cluster labels above arrows after the asynchronous renderer finishes.
      node
        .querySelectorAll('.cluster-label')
        .forEach((label) => label.parentNode.appendChild(label))
    } catch (error) {
      showError(node, error)
    }
  }
}

function showError(node, error) {
  if (!node.isConnected) return
  const message = document.createElement('pre')
  message.className = 'md-diagram-error'
  message.setAttribute('role', 'alert')
  message.textContent =
    'Could not render Mermaid diagram: ' + (error.message || String(error))
  node.replaceChildren(message)
}

const mermaidChart = (code) => `<div class="mermaid">${escape(code)}</div>`

const MermaidPlugin = (md) => {
  const origin = md.renderer.rules.fence.bind(md.renderer.rules)
  md.renderer.rules.fence = (tokens, idx, options, env, slf) => {
    const token = tokens[idx]
    const code = token.content.trim()
    if (typeof token.info === 'string' && token.info.trim() === 'mermaid') {
      return mermaidChart(code)
    }
    const firstLine = code.split(/\n/)[0].trim()
    if (
      firstLine === 'gantt' ||
      firstLine === 'sequenceDiagram' ||
      firstLine === 'erDiagram' ||
      firstLine.match(/^graph (?:TB|BT|RL|LR|TD);?$/)
    ) {
      return mermaidChart(code)
    }
    return origin(tokens, idx, options, env, slf)
  }
}

export default MermaidPlugin
