import React from 'react'
import io from 'socket.io-client'
import MarkdownIt from 'markdown-it'
import hljs from 'highlight.js'
import emoji from 'markdown-it-emoji'
import taskLists from 'markdown-it-task-lists'
import footnote from 'markdown-it-footnote'
import markdownItAnchor from 'markdown-it-anchor'
import markdownItToc from 'markdown-it-toc-done-right'
import markdownDeflist from 'markdown-it-deflist'

import mk from './katex'
import chart from './chart'
import mkitMermaid, { renderMermaid } from './mermaid'
import linenumbers from './linenumbers'
import image from './image'
import diagram, { renderDiagram } from './diagram'
import flowchart, { renderFlowchart } from './flowchart'
import dot, { renderDot } from './dot'
import blockUml from './blockPlantuml'
import codeUml from './plantuml'
import scrollToLine from './scroll'
import { meta } from './meta';
import markdownImSize from './markdown-it-imsize'
import { escape} from './utils';

const GITHUB_ALERTS = {
  NOTE: { icon: 'ri-information-line', title: 'Note' },
  TIP: { icon: 'ri-lightbulb-flash-line', title: 'Tip' },
  IMPORTANT: { icon: 'ri-information-line', title: 'Important' },
  WARNING: { icon: 'ri-error-warning-line', title: 'Warning' },
  CAUTION: { icon: 'ri-alert-line', title: 'Caution' }
}

function githubAlerts(md) {
  md.core.ruler.after('block', 'github_alerts', (state) => {
    for (let index = 0; index < state.tokens.length - 2; index += 1) {
      const open = state.tokens[index]
      const inline = state.tokens[index + 2]
      if (open.type !== 'blockquote_open' || inline.type !== 'inline') continue
      const match = inline.content.match(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\][ \t]*(?:\n|$)([\s\S]*)$/)
      if (!match) continue
      const alert = GITHUB_ALERTS[match[1]]
      open.attrJoin('class', `md-callout md-callout-${match[1].toLowerCase()}`)
      inline.content = `<span class="md-callout-title"><span class="ri-icon ${alert.icon}" aria-hidden="true"></span>${alert.title}</span>${match[2]}`
    }
  })
}

const anchorSymbol = '<span class="ri-icon ri-link-m" aria-hidden="true"></span>'

const DEFAULT_OPTIONS = {
  mkit: {
    // Enable HTML tags in source
    html: true,
    // Use '/' to close single tags (<br />).
    // This is only for full CommonMark compatibility.
    xhtmlOut: true,
    // Convert '\n' in paragraphs into <br>
    breaks: false,
    // CSS language prefix for fenced blocks. Can be
    // useful for external highlighters.
    langPrefix: 'language-',
    // Autoconvert URL-like text to links
    linkify: true,
    // Enable some language-neutral replacement + quotes beautification
    typographer: true,
    // Double + single quotes replacement pairs, when typographer enabled,
    // and smartquotes on. Could be either a String or an Array.
    //
    // For example, you can use '«»„“' for Russian, '„“‚‘' for German,
    // and ['«\xA0', '\xA0»', '‹\xA0', '\xA0›'] for French (including nbsp).
    quotes: '“”‘’',
    // Highlighter function. Should return escaped HTML,
    // or '' if the source string is not changed and should be escaped externally.
    // If result starts with <pre... internal wrapper is skipped.
    highlight: function (str, lang) {
      if (lang && hljs.getLanguage(lang)) {
        try {
          return `<pre class="hljs" data-language="${escape(lang || 'text')}"><code>${
            hljs.highlight(lang, str, true).value
          }</code></pre>`;
        } catch (__) {}
      }

      return `<pre class="hljs" data-language="${escape(lang || 'text')}"><code>${escape(str)}</code></pre>`;
    },
  },
  katex: {
    'throwOnError': false,
    'errorColor': ' #cc0000'
  },
  uml: {},
  toc: {
    listType: 'ul'
  }
}

function scrollableTables(md) {
  const tableOpen = md.renderer.rules.table_open || ((tokens, index, options, env, self) => self.renderToken(tokens, index, options))
  md.renderer.rules.table_open = (tokens, index, options, env, self) =>
    '<div class="md-table-scroll" role="region" aria-label="Scrollable table" tabindex="0">' + tableOpen(tokens, index, options, env, self)
  md.renderer.rules.table_close = (tokens, index, options, env, self) =>
    self.renderToken(tokens, index, options) + '</div>\n'
}

function markdownLinks(md) {
  const original = md.renderer.rules.link_open || ((tokens, index, options, env, self) => self.renderToken(tokens, index, options))
  md.renderer.rules.link_open = (tokens, index, options, env, self) => {
    const token = tokens[index]
    const href = token.attrGet('href') || ''
    const pathname = href.split(/[?#]/)[0]
    // Leave web URLs, absolute paths and same-page anchors alone.
    if (env.bufnr && !/^(?:[a-z][a-z0-9+.-]*:|[/\\#])/i.test(href) && /\.(md|markdown)$/i.test(pathname)) {
      const hash = href.includes('#') ? href.slice(href.indexOf('#')) : ''
      token.attrSet('href', '/_markdown_link/' + env.bufnr + '/' + encodeURIComponent(pathname) + hash)
      token.attrSet('target', '_blank')
      token.attrJoin('rel', 'noopener')
    }
    return original(tokens, index, options, env, self)
  }
}

export default class PreviewPage extends React.Component {
  constructor(props) {
    super(props)

    this.preContent = ''
    this.timer = undefined
    this.bufnr = -1;
    this.renderVersion = 0

    this.state = {
      name: '',
      cursor: '',
      content: '',
      pageTitle: '',
      theme: '',
      palette: 'forest',
      contentEditable: false,
      disableFilename: 1
    }
    this.handleThemeChange = this.handleThemeChange.bind(this)
  }

  handleThemeChange() {
    this.setState((state) => ({
      theme: state.theme === 'light' ? 'dark' : 'light',
    }))
  }

  handlePaletteChange(palette) {
    this.setState({ palette })
    try {
      window.localStorage.setItem('markdown-preview-palette', palette)
    } catch (error) {
      // The selector still works when browser storage is disabled.
    }
  }

  startSocket(bufnr) {
    if (this.bufnr === bufnr) {
      return;
    }
    this.bufnr = bufnr;

    // Close the previous socket
    const tmpSocket = window.socket

    window.history.replaceState(null, '', `/page/${bufnr}` + window.location.hash)
    this.linkAnchorPending = !!window.location.hash

    const socket = io({
      query: {
        bufnr
      }
    })

    window.socket = socket

    socket.on('connect', this.onConnect.bind(this))

    socket.on('disconnect', this.onDisconnect.bind(this))

    socket.on('close', this.onClose.bind(this))

    socket.on('refresh_content', this.onRefreshContent.bind(this))

    socket.on('close_page', this.onClose.bind(this))

    socket.on('change_bufnr', this.onChangeBufnr.bind(this))

    if (tmpSocket) {
      tmpSocket.close()
    }
  }

  componentDidMount() {
    try {
      const palette = window.localStorage.getItem('markdown-preview-palette')
      if (['forest', 'gruvbox', 'catppuccin', 'github'].includes(palette)) {
        this.setState({ palette })
      }
    } catch (error) {
      // Keep the default palette when browser storage is disabled.
    }
    this.startSocket(parseFloat(window.location.pathname.split('/')[2]))
    this.codeBlockSelectAll = (event) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'a') return
      const selection = window.getSelection()
      const start = selection && selection.anchorNode
      const element = start && (start.nodeType === Node.ELEMENT_NODE ? start : start.parentElement)
      const block = element && element.closest('pre')
      if (!block) return
      const range = document.createRange()
      range.selectNodeContents(block)
      selection.removeAllRanges()
      selection.addRange(range)
      event.preventDefault()
    }
    window.addEventListener('keydown', this.codeBlockSelectAll)
  }

  componentDidUpdate() {
    document.title = (this.state.pageTitle || '').replace(/\$\{name\}/, this.state.name)
  }

  componentWillUnmount() {
    this.renderVersion += 1
    clearTimeout(this.timer)
    window.removeEventListener('keydown', this.codeBlockSelectAll)
  }

  onConnect() {
    console.log('connect success')
  }

  onDisconnect() {
    console.log('disconnect')
  }

  onClose() {
    console.log('close')
    window.close()
  }

  onChangeBufnr(bufnr) {
    this.startSocket(bufnr)
  }

  onRefreshContent({
    options = {},
    isActive,
    winline,
    winheight,
    cursor,
    pageTitle = '',
    theme,
    name = '',
    content
  }) {
    if (!this.md) {
      const {
        mkit = {},
        katex = {},
        uml = {},
        hide_yaml_meta: hideYamlMeta = 1,
        sequence_diagrams: sequenceDiagrams = {},
        flowchart_diagrams: flowchartDiagrams = {},
        toc = {}
      } = options
      // markdown-it
      this.md = new MarkdownIt({
        ...DEFAULT_OPTIONS.mkit,
        ...mkit
      })
      if (hideYamlMeta === 1) {
        this.md.use(meta([['---', '\\.\\.\\.'], ['---', '\\.\\.\\.']]))
      }
      // katex
      this.md
        .use(mk, {
          ...DEFAULT_OPTIONS.katex,
          ...katex
        })
        .use(blockUml, {
          ...DEFAULT_OPTIONS.uml,
          ...uml
        })
        .use(codeUml, {
          ...DEFAULT_OPTIONS.uml,
          ...uml
        })
        .use(emoji)
        .use(taskLists)
        .use(markdownDeflist)
        .use(footnote)
        .use(githubAlerts)
        .use(image)
        .use(markdownImSize)
        .use(linenumbers)
        .use(markdownLinks)
        .use(scrollableTables)
        .use(mkitMermaid)
        .use(chart.chartPlugin)
        .use(diagram, {
          ...sequenceDiagrams
        })
        .use(flowchart, flowchartDiagrams)
        .use(dot)
        .use(markdownItAnchor, {
          permalink: true,
          permalinkBefore: false,
          permalinkSymbol: anchorSymbol,
          permalinkClass: 'anchor'
        })
        .use(markdownItToc, {
          ...DEFAULT_OPTIONS.toc,
          ...toc
        })
    }

    // Theme already applied
    if (this.state.theme) {
      theme = this.state.theme
    }
    // Define the theme according to the preferences of the system
    else if (!theme || !['light', 'dark'].includes(theme)) {
      if (
        window.matchMedia &&
        window.matchMedia('(prefers-color-scheme: dark)').matches
      ) {
        theme = 'dark'
      }
    }

    const newContent = content.join('\n')
    const refreshContent = this.preContent !== newContent
    this.preContent = newContent
    if (refreshContent) this.renderVersion += 1
    const renderVersion = this.renderVersion

    const refreshScroll = () => {
      if (isActive && !options.disable_sync_scroll) {
        scrollToLine[options.sync_scroll_type || 'middle']({
          cursor: cursor[1],
          winline,
          winheight,
          len: content.length
        })
      }
    }
    // Cursor-only refreshes can arrive while an optional renderer initializes.
    // Use the latest editor position when asynchronous rendering completes.
    this.refreshScroll = refreshScroll

    const refreshRender = () => {
      this.setState({
        cursor,
        name: ((name) => {
          let tokens = name.split(/\\|\//).pop().split('.');
          return tokens.length > 1 ? tokens.slice(0, -1).join('.') : tokens[0];
        })(name),
        ...(
          refreshContent
          ? { content: this.md.render(newContent, { bufnr: this.bufnr }) }
          : {}
        ),
        pageTitle,
        theme,
        contentEditable: options.content_editable,
        disableFilename: options.disable_filename
      }, async () => {
        if (refreshContent) {
          chart.render()
          renderDiagram()
          renderFlowchart()
          await Promise.all([
            renderMermaid(document.querySelectorAll('.mermaid'), { theme: this.state.theme === 'dark' ? 'dark' : 'default', ...(options.maid || {}) }),
            renderDot()
          ])
        }
        // New edits can replace these nodes while a lazy renderer initializes.
        if (renderVersion !== this.renderVersion) return
        window.requestAnimationFrame(() => {
          if (renderVersion !== this.renderVersion) return
          if (this.linkAnchorPending) {
            this.linkAnchorPending = false
            try {
              const target = document.getElementById(decodeURIComponent(window.location.hash.slice(1)))
              if (target) target.scrollIntoView()
            } catch (error) { /* Ignore malformed fragments. */ }
          } else {
            this.refreshScroll()
          }
        })
      })
    }

    if (!this.preContent) {
      refreshRender()
    } else {
      if (!refreshContent) {
        refreshScroll()
      } else {
        if (this.timer) {
          clearTimeout(this.timer)
        }
        this.timer = setTimeout(() => {
          refreshRender()
        }, 16);
      }
    }
  }

  render() {
    const {
      theme,
      content,
      name,
      palette,
      contentEditable,
      disableFilename,
    } = this.state

    return (
      <React.Fragment>
        <main data-theme={theme} data-palette={palette}>
          <div id="page-ctn" contentEditable={contentEditable ? 'true' : 'false'}>
            { disableFilename == 0 &&
              <header
                id="page-header"
              >
                <h3>
                  <svg
                    viewBox="0 0 16 16"
                    version="1.1"
                    width="16"
                    height="16"
                    aria-hidden="true"
                  >
                    <path
                      fillRule="evenodd"
                      d="M3 5h4v1H3V5zm0 3h4V7H3v1zm0 2h4V9H3v1zm11-5h-4v1h4V5zm0 2h-4v1h4V7zm0 2h-4v1h4V9zm2-6v9c0 .55-.45 1-1 1H9.5l-1 1-1-1H2c-.55 0-1-.45-1-1V3c0-.55.45-1 1-1h5.5l1 1 1-1H15c.55 0 1 .45 1 1zm-8 .5L7.5 3H2v9h6V3.5zm7-.5H9.5l-.5.5V12h6V3z"
                    >
                    </path>
                  </svg>
                  {name}
                </h3>
                <div id="preview-controls" contentEditable={false}>
                  <label id="palette-label" htmlFor="preview-palette">Palette
                    <select
                      id="preview-palette"
                      value={palette}
                      onChange={(event) => this.handlePaletteChange(event.target.value)}
                    >
                      <option value="forest">Forestbones / Everforest</option>
                      <option value="gruvbox">Gruvbox</option>
                      <option value="catppuccin">Catppuccin</option>
                      <option value="github">GitHub</option>
                    </select>
                  </label>
                  <label id="toggle-theme" htmlFor="theme">
                    <input
                      id="theme"
                      type="checkbox"
                      checked={theme === "dark"}
                      onChange={this.handleThemeChange}
                    />
                    <span>Dark Mode</span>
                  </label>
                </div>
              </header>
            }
            <section
              className="markdown-body"
              dangerouslySetInnerHTML={{
                __html: content
              }}
            />
          </div>
        </main>
      </React.Fragment>
    )
  }
}
