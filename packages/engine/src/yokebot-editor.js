/**
 * yokebot-editor.js — Injected into sandbox preview iframes for visual editing.
 *
 * Features:
 *  - Element hover highlight (blue outline)
 *  - Click to select element → postMessage with element data
 *  - React _debugSource → file:line mapping (Vite dev mode only)
 *  - Receives style/class updates from parent
 *
 * Communication protocol (postMessage):
 *  iframe → parent:
 *    yokebot:element-selected  { tagName, id, className, textContent, computedStyles, rect, sourceFile, sourceLine, selector }
 *    yokebot:element-hovered   { rect }
 *  parent → iframe:
 *    yokebot:apply-style       { selector, className } — add Tailwind classes
 *    yokebot:toggle-picker     { enabled }
 */
(function () {
  'use strict'

  if (window.__yokebotEditor) return
  window.__yokebotEditor = true

  let pickerEnabled = false
  let highlightEl = null
  let lastHovered = null

  // ---- Highlight overlay ----

  function createHighlight() {
    const el = document.createElement('div')
    el.id = '__yokebot-highlight'
    el.style.cssText =
      'position:fixed;pointer-events:none;z-index:999999;border:2px solid #3b82f6;' +
      'background:rgba(59,130,246,0.08);transition:all 0.1s ease;display:none;'
    document.body.appendChild(el)
    return el
  }

  function showHighlight(rect) {
    if (!highlightEl) highlightEl = createHighlight()
    highlightEl.style.display = 'block'
    highlightEl.style.left = rect.x + 'px'
    highlightEl.style.top = rect.y + 'px'
    highlightEl.style.width = rect.width + 'px'
    highlightEl.style.height = rect.height + 'px'
  }

  function hideHighlight() {
    if (highlightEl) highlightEl.style.display = 'none'
  }

  // ---- React fiber → source file mapping ----

  function getReactSource(el) {
    // Walk React fiber tree to find _debugSource
    const fiberKey = Object.keys(el).find(function (k) {
      return k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$')
    })
    if (!fiberKey) return null

    let fiber = el[fiberKey]
    // Walk up to find a fiber with _debugSource (usually the component, not the DOM node)
    for (let i = 0; i < 10 && fiber; i++) {
      if (fiber._debugSource) {
        return {
          fileName: fiber._debugSource.fileName,
          lineNumber: fiber._debugSource.lineNumber,
          columnNumber: fiber._debugSource.columnNumber || 0,
        }
      }
      fiber = fiber.return
    }
    return null
  }

  // ---- Build a CSS selector for an element ----

  function buildSelector(el) {
    if (el.id) return '#' + el.id
    var parts = []
    while (el && el !== document.body) {
      var tag = el.tagName.toLowerCase()
      if (el.id) {
        parts.unshift('#' + el.id)
        break
      }
      var parent = el.parentElement
      if (parent) {
        var siblings = Array.from(parent.children).filter(function (c) {
          return c.tagName === el.tagName
        })
        if (siblings.length > 1) {
          var idx = siblings.indexOf(el) + 1
          tag += ':nth-of-type(' + idx + ')'
        }
      }
      parts.unshift(tag)
      el = parent
    }
    return parts.join(' > ')
  }

  // ---- Get computed styles subset ----

  function getComputedSubset(el) {
    var cs = window.getComputedStyle(el)
    return {
      fontSize: cs.fontSize,
      fontWeight: cs.fontWeight,
      fontFamily: cs.fontFamily,
      color: cs.color,
      backgroundColor: cs.backgroundColor,
      textAlign: cs.textAlign,
      lineHeight: cs.lineHeight,
      letterSpacing: cs.letterSpacing,
      paddingTop: cs.paddingTop,
      paddingRight: cs.paddingRight,
      paddingBottom: cs.paddingBottom,
      paddingLeft: cs.paddingLeft,
      marginTop: cs.marginTop,
      marginRight: cs.marginRight,
      marginBottom: cs.marginBottom,
      marginLeft: cs.marginLeft,
      borderRadius: cs.borderRadius,
      borderWidth: cs.borderTopWidth,
      borderColor: cs.borderColor,
      borderStyle: cs.borderStyle,
      width: cs.width,
      height: cs.height,
      display: cs.display,
      opacity: cs.opacity,
    }
  }

  // ---- Event handlers ----

  function onMouseMove(e) {
    if (!pickerEnabled) return
    var target = e.target
    if (target === highlightEl || target.id === '__yokebot-highlight') return
    if (target === lastHovered) return
    lastHovered = target

    var rect = target.getBoundingClientRect()
    showHighlight(rect)

    window.parent.postMessage({
      type: 'yokebot:element-hovered',
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
    }, '*')
  }

  function onMouseLeave() {
    if (!pickerEnabled) return
    hideHighlight()
    lastHovered = null
  }

  function onClick(e) {
    if (!pickerEnabled) return
    e.preventDefault()
    e.stopImmediatePropagation()

    var target = e.target
    if (target === highlightEl || target.id === '__yokebot-highlight') return

    var rect = target.getBoundingClientRect()
    var source = getReactSource(target)

    window.parent.postMessage({
      type: 'yokebot:element-selected',
      tagName: target.tagName,
      id: target.id || '',
      className: target.className || '',
      textContent: (target.textContent || '').slice(0, 200),
      computedStyles: getComputedSubset(target),
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      sourceFile: source ? source.fileName : null,
      sourceLine: source ? source.lineNumber : null,
      selector: buildSelector(target),
    }, '*')
  }

  // ---- Apply styles from parent ----

  function applyStyle(data) {
    var el = null
    if (data.selector) {
      try { el = document.querySelector(data.selector) } catch (e) { /* invalid selector */ }
    }
    if (!el) return

    if (data.className) {
      // Add Tailwind class(es)
      var classes = data.className.split(/\s+/).filter(Boolean)
      for (var i = 0; i < classes.length; i++) {
        // Remove conflicting classes with same prefix
        var newClass = classes[i]
        var prefix = newClass.replace(/-[^-]+$/, '-') // e.g. "text-" from "text-2xl"
        if (prefix !== newClass) {
          var existing = Array.from(el.classList)
          for (var j = 0; j < existing.length; j++) {
            if (existing[j].startsWith(prefix) && existing[j] !== newClass) {
              el.classList.remove(existing[j])
            }
          }
        }
        el.classList.add(newClass)
      }
    }

    if (data.styles) {
      // Direct CSS style application for instant preview
      for (var prop in data.styles) {
        el.style[prop] = data.styles[prop]
      }
    }
  }

  // ---- Message listener ----

  window.addEventListener('message', function (e) {
    var data = e.data
    if (!data || typeof data.type !== 'string') return

    switch (data.type) {
      case 'yokebot:toggle-picker':
        pickerEnabled = !!data.enabled
        if (!pickerEnabled) {
          hideHighlight()
          lastHovered = null
          document.body.style.cursor = ''
        } else {
          document.body.style.cursor = 'crosshair'
        }
        break
      case 'yokebot:apply-style':
        applyStyle(data)
        break
    }
  })

  // ---- Register event listeners ----
  // Use capture phase so we intercept before app handlers
  document.addEventListener('mousemove', onMouseMove, true)
  document.addEventListener('mouseleave', onMouseLeave, true)
  document.addEventListener('click', onClick, true)

  console.log('[yokebot-editor] Visual editor bridge loaded')
})()
