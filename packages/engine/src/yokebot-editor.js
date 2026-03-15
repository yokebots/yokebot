/**
 * yokebot-editor.js — Injected into sandbox preview iframes for visual editing.
 *
 * Features:
 *  - Element hover highlight (blue outline)
 *  - Click to select element → postMessage with element data
 *  - Double-click for inline text editing
 *  - Undo/redo support for style and text changes
 *  - React _debugSource → file:line mapping (Vite dev mode only)
 *  - Receives style/class updates from parent
 *
 * Communication protocol (postMessage):
 *  iframe → parent:
 *    yokebot:element-selected  { tagName, id, className, textContent, computedStyles, rect, sourceFile, sourceLine, selector }
 *    yokebot:element-hovered   { rect }
 *    yokebot:text-changed      { selector, newText, sourceFile, sourceLine }
 *    yokebot:history-state     { canUndo, canRedo }
 *  parent → iframe:
 *    yokebot:apply-style       { selector, className } — add Tailwind classes
 *    yokebot:toggle-picker     { enabled }
 *    yokebot:undo-change       — undo last change
 *    yokebot:redo-change       — redo last undone change
 */
(function () {
  'use strict'

  if (window.__yokebotEditor) return
  window.__yokebotEditor = true

  let pickerEnabled = false
  let highlightEl = null
  let lastHovered = null

  // ---- Undo/redo history (persisted via sessionStorage, capped at 50) ----
  var MAX_HISTORY = 50
  var changeHistory = []
  var historyIndex = -1

  // Restore history from sessionStorage on load
  try {
    var saved = sessionStorage.getItem('__yokebot_history')
    if (saved) {
      var parsed = JSON.parse(saved)
      changeHistory = parsed.entries || []
      historyIndex = parsed.index != null ? parsed.index : changeHistory.length - 1
    }
  } catch (e) { /* ignore parse errors */ }

  function saveHistory() {
    try {
      sessionStorage.setItem('__yokebot_history', JSON.stringify({
        entries: changeHistory,
        index: historyIndex,
      }))
    } catch (e) { /* storage full or unavailable */ }
  }

  function recordChange(entry) {
    // Truncate any redo entries beyond current index
    changeHistory = changeHistory.slice(0, historyIndex + 1)
    changeHistory.push(entry)
    // Cap at MAX_HISTORY — drop oldest entries
    if (changeHistory.length > MAX_HISTORY) {
      changeHistory = changeHistory.slice(changeHistory.length - MAX_HISTORY)
    }
    historyIndex = changeHistory.length - 1
    saveHistory()
    window.parent.postMessage({
      type: 'yokebot:history-state',
      canUndo: historyIndex >= 0,
      canRedo: false,
    }, '*')
  }

  // ---- Click vs double-click disambiguation ----
  var clickTimer = null
  var pendingClickEvent = null

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

    // Defer to disambiguate click vs double-click
    pendingClickEvent = { target: target }
    if (clickTimer) clearTimeout(clickTimer)
    clickTimer = setTimeout(function () {
      clickTimer = null
      if (!pendingClickEvent) return
      var t = pendingClickEvent.target
      pendingClickEvent = null

      var rect = t.getBoundingClientRect()
      var source = getReactSource(t)

      window.parent.postMessage({
        type: 'yokebot:element-selected',
        tagName: t.tagName,
        id: t.id || '',
        className: t.className || '',
        textContent: (t.textContent || '').slice(0, 200),
        computedStyles: getComputedSubset(t),
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        sourceFile: source ? source.fileName : null,
        sourceLine: source ? source.lineNumber : null,
        selector: buildSelector(t),
      }, '*')
    }, 250)
  }

  function onDblClick(e) {
    if (!pickerEnabled) return
    e.preventDefault()
    e.stopImmediatePropagation()

    // Cancel pending single-click
    if (clickTimer) { clearTimeout(clickTimer); clickTimer = null }
    pendingClickEvent = null

    var target = e.target
    if (target === highlightEl || target.id === '__yokebot-highlight') return

    // Only allow text editing on leaf-ish elements with text content
    var hasText = target.textContent && target.textContent.trim().length > 0
    // Skip elements with many children (e.g. layout containers)
    var childElements = target.querySelectorAll('*')
    if (!hasText || childElements.length > 5) return

    var selector = buildSelector(target)
    var source = getReactSource(target)
    var oldText = target.textContent

    // Enter inline text editing mode
    pickerEnabled = false
    hideHighlight()
    target.contentEditable = 'true'
    target.style.outline = '2px dashed #22c55e'
    target.style.outlineOffset = '2px'
    target.focus()

    // Select all text for easy replacement
    var range = document.createRange()
    range.selectNodeContents(target)
    var sel = window.getSelection()
    sel.removeAllRanges()
    sel.addRange(range)

    function onBlur() {
      target.removeEventListener('blur', onBlur)
      target.contentEditable = 'false'
      target.style.outline = ''
      target.style.outlineOffset = ''
      pickerEnabled = true

      var newText = target.textContent
      if (newText !== oldText) {
        // Record in history
        recordChange({
          selector: selector,
          property: '__text__',
          oldValue: oldText,
          newValue: newText,
        })

        window.parent.postMessage({
          type: 'yokebot:text-changed',
          selector: selector,
          oldText: oldText,
          newText: newText,
          sourceFile: source ? source.fileName : null,
          sourceLine: source ? source.lineNumber : null,
        }, '*')
      }
    }

    target.addEventListener('blur', onBlur)
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
      var selector = data.selector
      for (var prop in data.styles) {
        var oldVal = el.style[prop] || ''
        recordChange({
          selector: selector,
          property: prop,
          oldValue: oldVal,
          newValue: data.styles[prop],
        })
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
      case 'yokebot:undo-change':
        if (historyIndex >= 0) {
          var entry = changeHistory[historyIndex]
          var el = document.querySelector(entry.selector)
          if (el) {
            if (entry.property === '__text__') {
              el.textContent = entry.oldValue
            } else {
              el.style[entry.property] = entry.oldValue
            }
          }
          historyIndex--
          saveHistory()
          window.parent.postMessage({ type: 'yokebot:history-state', canUndo: historyIndex >= 0, canRedo: historyIndex < changeHistory.length - 1 }, '*')
        }
        break
      case 'yokebot:redo-change':
        if (historyIndex < changeHistory.length - 1) {
          historyIndex++
          var entry = changeHistory[historyIndex]
          var el = document.querySelector(entry.selector)
          if (el) {
            if (entry.property === '__text__') {
              el.textContent = entry.newValue
            } else {
              el.style[entry.property] = entry.newValue
            }
          }
          saveHistory()
          window.parent.postMessage({ type: 'yokebot:history-state', canUndo: historyIndex >= 0, canRedo: historyIndex < changeHistory.length - 1 }, '*')
        }
        break
    }
  })

  // ---- Register event listeners ----
  // Use capture phase so we intercept before app handlers
  document.addEventListener('mousemove', onMouseMove, true)
  document.addEventListener('mouseleave', onMouseLeave, true)
  document.addEventListener('click', onClick, true)
  document.addEventListener('dblclick', onDblClick, true)

  // Broadcast restored history state so parent knows undo/redo availability
  if (changeHistory.length > 0) {
    window.parent.postMessage({
      type: 'yokebot:history-state',
      canUndo: historyIndex >= 0,
      canRedo: historyIndex < changeHistory.length - 1,
    }, '*')
  }

  console.log('[yokebot-editor] Visual editor bridge loaded (' + changeHistory.length + ' history entries restored)')
})()
