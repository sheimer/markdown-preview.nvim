let animationFrame

function scroll (offsetTop) {
  if (animationFrame !== undefined) {
    window.cancelAnimationFrame(animationFrame)
    animationFrame = undefined
  }
  if (!Number.isFinite(offsetTop)) return

  const max = Math.max(0,
    document.documentElement.scrollHeight - document.documentElement.clientHeight)
  const target = Math.max(0, Math.min(offsetTop, max))
  const start = window.scrollY
  const move = top => window.scrollTo({ left: window.scrollX, top, behavior: 'instant' })
  if (start === target || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    move(target)
    return
  }

  const started = window.performance.now()
  const animate = now => {
    const progress = Math.max(0, Math.min(1, (now - started) / 400))
    // Match the previous 400 ms Power2 ease-out without a global animation library.
    const eased = 1 - Math.pow(1 - progress, 3)
    move(start + (target - start) * eased)
    if (progress < 1) animationFrame = window.requestAnimationFrame(animate)
    else animationFrame = undefined
  }
  animationFrame = window.requestAnimationFrame(animate)
}

function getAttrTag (line) {
  return `[data-source-line="${line}"]`
}

function getPreLineOffsetTop (line) {
  let currentLine = line - 1
  let ele = null
  while (currentLine > 0 && !ele) {
    ele = document.querySelector(getAttrTag(currentLine))
    if (!ele) {
      currentLine -= 1
    }
  }
  return [
    currentLine >= 0 ? currentLine : 0,
    ele ? ele.offsetTop : 0
  ]
}

function getNextLineOffsetTop (line, len) {
  let currentLine = line + 1
  let ele = null
  while (currentLine < len && !ele) {
    ele = document.querySelector(getAttrTag(currentLine))
    if (!ele) {
      currentLine += 1
    }
  }
  return [
    currentLine < len ? currentLine : len - 1,
    ele ? ele.offsetTop : document.documentElement.scrollHeight
  ]
}

function topOrBottom (line, len) {
  if (line === 0) {
    scroll(0)
  } else if (line === len - 1) {
    scroll(document.documentElement.scrollHeight)
  }
}

function relativeScroll (line, ratio, len) {
  line = Math.max(0, Math.min(line, len - 1))
  let offsetTop = 0
  const lineEle = document.querySelector(`[data-source-line="${line}"]`)
  if (lineEle) {
    offsetTop = lineEle.offsetTop
  } else {
    const pre = getPreLineOffsetTop(line)
    const next = getNextLineOffsetTop(line, len)
    const span = next[0] - pre[0]
    offsetTop = span > 0
      ? pre[1] + ((next[1] - pre[1]) * (line - pre[0]) / span)
      : pre[1]
  }
  scroll(offsetTop - document.documentElement.clientHeight * ratio)
}

export default {
  relative: function ({
    cursor,
    winline,
    winheight,
    len
  }) {
    const line = cursor - 1
    const ratio = winline / winheight
    if (line === 0 || line === len - 1) {
      topOrBottom(line, len)
    } else {
      relativeScroll(line, ratio, len)
    }
  },
  middle: function ({
    cursor,
    // winline,
    // winheight,
    len
  }) {
    const line = cursor - 1
    if (line === 0 || line === len - 1) {
      topOrBottom(line, len)
    } else {
      relativeScroll(line, 0.5, len)
    }
  },
  top: function ({
    cursor,
    winline,
    // winheight,
    len
  }) {
    let line = cursor - 1
    if (line === 0 || line === len - 1) {
      topOrBottom(line, len)
    } else {
      line = cursor - winline
      relativeScroll(line, 0, len)
    }
  }
}
