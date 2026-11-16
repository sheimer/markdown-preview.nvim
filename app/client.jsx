import React from 'react'
import ReactDOM from 'react-dom'
import PreviewPage from './pages/index'

// Retain the mount ID used by existing bundled and custom stylesheets.
ReactDOM.render(<PreviewPage />, document.getElementById('__next'))
