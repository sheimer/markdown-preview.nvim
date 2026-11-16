
module.exports = {
  pageExtensions: [ 'jsx' ],
  webpack: function (config) {
    // Next 7's webpack cannot consume the modern ESM dependency graph. Use
    // Markdown-It's self-contained browser build until the frontend builder moves.
    config.resolve.alias['markdown-it$'] = require.resolve('markdown-it/dist/markdown-it.js')
    return config
  },
  exportPathMap: async function () {
    return {
      '/': { page: '/' },
      '/404.html': { page: '/404' }
    }
  }
}

