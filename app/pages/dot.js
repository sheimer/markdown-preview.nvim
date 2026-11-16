import { escape } from './utils'

let instancePromise
const rendered = new WeakSet()

function getViz() {
  if (!instancePromise) {
    instancePromise = import('@viz-js/viz')
      .then(({ instance }) => instance())
      .catch((error) => {
        instancePromise = undefined
        throw error
      })
  }
  return instancePromise
}

const dot = (md) => {
  const fence = md.renderer.rules.fence.bind(md.renderer.rules)
  md.renderer.rules.fence = (tokens, index, options, env, self) => {
    const token = tokens[index]
    const language = (token.info || '').trim()
    if (language === 'dot' || language === 'graphviz') {
      return `<div class="dot">${escape(token.content.trim())}</div>`
    }
    return fence(tokens, index, options, env, self)
  }
}

function showError(element, error) {
  if (!element.isConnected) return
  const message = document.createElement('pre')
  message.className = 'diagram-error'
  message.setAttribute('role', 'alert')
  message.textContent = 'Graphviz: ' + (error.message || String(error))
  element.replaceChildren(message)
}

export const renderDot = async () => {
  const diagrams = [...document.querySelectorAll('.dot')]
    .filter((element) => !rendered.has(element))
    .map((element) => {
      rendered.add(element)
      return { element, source: element.textContent }
    })
  if (!diagrams.length) return

  let viz
  try {
    viz = await getViz()
  } catch (error) {
    diagrams.forEach(({ element }) => showError(element, error))
    return
  }
  for (const { element, source } of diagrams) {
    // A live update can replace the original container while WASM initializes.
    if (!element.isConnected) continue
    try {
      const svg = viz.renderSVGElement(source)
      if (element.isConnected) element.replaceChildren(svg)
    } catch (error) {
      showError(element, error)
    }
  }
}

export default dot
