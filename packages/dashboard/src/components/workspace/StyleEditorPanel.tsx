import { useState, useCallback, useEffect } from 'react'

// ---- Types ----

export interface SelectedElement {
  tagName: string
  id: string
  className: string
  textContent: string
  computedStyles: Record<string, string>
  rect: { x: number; y: number; width: number; height: number }
  sourceFile: string | null
  sourceLine: number | null
  selector: string
}

interface StyleEditorPanelProps {
  element: SelectedElement
  onApplyStyle: (selector: string, changes: StyleChange[]) => void
  onClose: () => void
}

export interface StyleChange {
  property: string
  value: string
  tailwindClass: string
}

// ---- Tailwind Lookup Maps ----

const TW_FONT_SIZE: Record<string, string> = {
  '12px': 'text-xs', '14px': 'text-sm', '16px': 'text-base', '18px': 'text-lg',
  '20px': 'text-xl', '24px': 'text-2xl', '30px': 'text-3xl', '36px': 'text-4xl',
  '48px': 'text-5xl', '60px': 'text-6xl', '72px': 'text-7xl', '96px': 'text-8xl', '128px': 'text-9xl',
}

const TW_FONT_WEIGHT: Record<string, string> = {
  '100': 'font-thin', '200': 'font-extralight', '300': 'font-light', '400': 'font-normal',
  '500': 'font-medium', '600': 'font-semibold', '700': 'font-bold', '800': 'font-extrabold', '900': 'font-black',
}

const TW_SPACING: Record<string, string> = {
  '0px': '0', '1px': 'px', '2px': '0.5', '4px': '1', '6px': '1.5', '8px': '2',
  '10px': '2.5', '12px': '3', '14px': '3.5', '16px': '4', '20px': '5', '24px': '6',
  '28px': '7', '32px': '8', '36px': '9', '40px': '10', '44px': '11', '48px': '12',
  '56px': '14', '64px': '16', '80px': '20', '96px': '24',
}

const TW_BORDER_RADIUS: Record<string, string> = {
  '0px': 'rounded-none', '2px': 'rounded-sm', '4px': 'rounded',
  '6px': 'rounded-md', '8px': 'rounded-lg', '12px': 'rounded-xl',
  '16px': 'rounded-2xl', '24px': 'rounded-3xl', '9999px': 'rounded-full',
}

const TW_TEXT_ALIGN: Record<string, string> = {
  'left': 'text-left', 'center': 'text-center', 'right': 'text-right', 'justify': 'text-justify',
}

// Common Tailwind colors for the color picker
const PRESET_COLORS = [
  { name: 'white', hex: '#ffffff' }, { name: 'black', hex: '#000000' },
  { name: 'slate-50', hex: '#f8fafc' }, { name: 'slate-100', hex: '#f1f5f9' },
  { name: 'slate-200', hex: '#e2e8f0' }, { name: 'slate-500', hex: '#64748b' },
  { name: 'slate-700', hex: '#334155' }, { name: 'slate-900', hex: '#0f172a' },
  { name: 'red-500', hex: '#ef4444' }, { name: 'orange-500', hex: '#f97316' },
  { name: 'yellow-500', hex: '#eab308' }, { name: 'green-500', hex: '#22c55e' },
  { name: 'blue-500', hex: '#3b82f6' }, { name: 'indigo-500', hex: '#6366f1' },
  { name: 'purple-500', hex: '#a855f7' }, { name: 'pink-500', hex: '#ec4899' },
]

// Nearest Tailwind color matching
const TW_COLORS: Record<string, string> = {}
for (const c of PRESET_COLORS) TW_COLORS[c.hex] = c.name

function rgbToHex(rgb: string): string {
  const match = rgb.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/)
  if (!match) return rgb
  const [, r, g, b] = match
  return '#' + [r, g, b].map(v => parseInt(v).toString(16).padStart(2, '0')).join('')
}

function findNearestTwColor(hex: string): string | null {
  const target = hexToRgb(hex)
  if (!target) return null
  let nearest = ''
  let minDist = Infinity
  for (const [h, name] of Object.entries(TW_COLORS)) {
    const c = hexToRgb(h)
    if (!c) continue
    const dist = Math.sqrt((target.r - c.r) ** 2 + (target.g - c.g) ** 2 + (target.b - c.b) ** 2)
    if (dist < minDist) { minDist = dist; nearest = name }
  }
  // Only use Tailwind name if very close (< 30 distance), otherwise use arbitrary
  return minDist < 30 ? nearest : null
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = hex.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i)
  if (!m) return null
  return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) }
}

// ---- Component ----

export function StyleEditorPanel({ element, onApplyStyle, onClose }: StyleEditorPanelProps) {
  const cs = element.computedStyles

  // Local state for each editable property
  const [fontSize, setFontSize] = useState(cs.fontSize || '16px')
  const [fontWeight, setFontWeight] = useState(cs.fontWeight || '400')
  const [textColor, setTextColor] = useState(rgbToHex(cs.color || 'rgb(0,0,0)'))
  const [textAlign, setTextAlign] = useState(cs.textAlign || 'left')
  const [bgColor, setBgColor] = useState(rgbToHex(cs.backgroundColor || 'rgb(255,255,255)'))
  const [paddingTop, setPaddingTop] = useState(cs.paddingTop || '0px')
  const [paddingRight, setPaddingRight] = useState(cs.paddingRight || '0px')
  const [paddingBottom, setPaddingBottom] = useState(cs.paddingBottom || '0px')
  const [paddingLeft, setPaddingLeft] = useState(cs.paddingLeft || '0px')
  const [marginTop, setMarginTop] = useState(cs.marginTop || '0px')
  const [marginRight, setMarginRight] = useState(cs.marginRight || '0px')
  const [marginBottom, setMarginBottom] = useState(cs.marginBottom || '0px')
  const [marginLeft, setMarginLeft] = useState(cs.marginLeft || '0px')
  const [borderRadius, setBorderRadius] = useState(cs.borderRadius || '0px')
  const [borderWidth, setBorderWidth] = useState(cs.borderWidth || '0px')
  const [borderColor, setBorderColor] = useState(rgbToHex(cs.borderColor || 'rgb(0,0,0)'))
  const [width, setWidth] = useState(cs.width || 'auto')
  const [height, setHeight] = useState(cs.height || 'auto')

  // Reset state when element changes
  useEffect(() => {
    setFontSize(cs.fontSize || '16px')
    setFontWeight(cs.fontWeight || '400')
    setTextColor(rgbToHex(cs.color || 'rgb(0,0,0)'))
    setTextAlign(cs.textAlign || 'left')
    setBgColor(rgbToHex(cs.backgroundColor || 'rgb(255,255,255)'))
    setPaddingTop(cs.paddingTop || '0px')
    setPaddingRight(cs.paddingRight || '0px')
    setPaddingBottom(cs.paddingBottom || '0px')
    setPaddingLeft(cs.paddingLeft || '0px')
    setMarginTop(cs.marginTop || '0px')
    setMarginRight(cs.marginRight || '0px')
    setMarginBottom(cs.marginBottom || '0px')
    setMarginLeft(cs.marginLeft || '0px')
    setBorderRadius(cs.borderRadius || '0px')
    setBorderWidth(cs.borderWidth || '0px')
    setBorderColor(rgbToHex(cs.borderColor || 'rgb(0,0,0)'))
    setWidth(cs.width || 'auto')
    setHeight(cs.height || 'auto')
  }, [element]) // eslint-disable-line react-hooks/exhaustive-deps

  const toTailwindClass = useCallback((property: string, value: string): string => {
    // Known mappings
    if (property === 'fontSize') return TW_FONT_SIZE[value] || `text-[${value}]`
    if (property === 'fontWeight') return TW_FONT_WEIGHT[value] || `font-[${value}]`
    if (property === 'textAlign') return TW_TEXT_ALIGN[value] || `text-${value}`

    // Colors
    if (property === 'color') {
      const hex = value.startsWith('#') ? value : rgbToHex(value)
      const tw = findNearestTwColor(hex)
      return tw ? `text-${tw}` : `text-[${hex}]`
    }
    if (property === 'backgroundColor') {
      const hex = value.startsWith('#') ? value : rgbToHex(value)
      const tw = findNearestTwColor(hex)
      return tw ? `bg-${tw}` : `bg-[${hex}]`
    }
    if (property === 'borderColor') {
      const hex = value.startsWith('#') ? value : rgbToHex(value)
      const tw = findNearestTwColor(hex)
      return tw ? `border-${tw}` : `border-[${hex}]`
    }

    // Spacing
    const spacingPrefix: Record<string, string> = {
      paddingTop: 'pt', paddingRight: 'pr', paddingBottom: 'pb', paddingLeft: 'pl',
      marginTop: 'mt', marginRight: 'mr', marginBottom: 'mb', marginLeft: 'ml',
    }
    if (spacingPrefix[property]) {
      const prefix = spacingPrefix[property]
      const tw = TW_SPACING[value]
      return tw ? `${prefix}-${tw}` : `${prefix}-[${value}]`
    }

    // Border radius
    if (property === 'borderRadius') return TW_BORDER_RADIUS[value] || `rounded-[${value}]`
    if (property === 'borderWidth') {
      if (value === '0px') return 'border-0'
      if (value === '1px') return 'border'
      if (value === '2px') return 'border-2'
      if (value === '4px') return 'border-4'
      if (value === '8px') return 'border-8'
      return `border-[${value}]`
    }

    // Size
    if (property === 'width') {
      if (value === 'auto') return 'w-auto'
      if (value === '100%') return 'w-full'
      return `w-[${value}]`
    }
    if (property === 'height') {
      if (value === 'auto') return 'h-auto'
      if (value === '100%') return 'h-full'
      return `h-[${value}]`
    }

    return `[${property}:${value}]`
  }, [])

  const applyChange = useCallback((property: string, value: string) => {
    const twClass = toTailwindClass(property, value)
    onApplyStyle(element.selector, [{ property, value, tailwindClass: twClass }])
  }, [element.selector, onApplyStyle, toTailwindClass])

  // ---- Helpers ----

  function NumberInput({ label, value, onChange, property }: {
    label: string; value: string; onChange: (v: string) => void; property: string
  }) {
    const numVal = parseInt(value) || 0
    return (
      <div className="flex items-center gap-1.5">
        <label className="text-[10px] text-text-muted w-5 text-right shrink-0">{label}</label>
        <input
          type="number"
          value={numVal}
          onChange={e => {
            const v = `${e.target.value}px`
            onChange(v)
            applyChange(property, v)
          }}
          className="w-14 px-1.5 py-0.5 rounded border border-border-subtle bg-light-surface text-[11px] text-text-main font-mono focus:outline-none focus:ring-1 focus:ring-forest-green"
        />
      </div>
    )
  }

  function ColorInput({ label, value, onChange, property }: {
    label: string; value: string; onChange: (v: string) => void; property: string
  }) {
    return (
      <div className="flex items-center gap-2">
        <label className="text-[10px] text-text-muted w-16 shrink-0">{label}</label>
        <div className="flex items-center gap-1.5 flex-1">
          <input
            type="color"
            value={value}
            onChange={e => {
              onChange(e.target.value)
              applyChange(property, e.target.value)
            }}
            className="w-6 h-6 rounded border border-border-subtle cursor-pointer"
          />
          <input
            type="text"
            value={value}
            onChange={e => {
              onChange(e.target.value)
              if (/^#[0-9a-f]{6}$/i.test(e.target.value)) {
                applyChange(property, e.target.value)
              }
            }}
            className="flex-1 px-1.5 py-0.5 rounded border border-border-subtle bg-light-surface text-[11px] text-text-main font-mono focus:outline-none focus:ring-1 focus:ring-forest-green"
          />
        </div>
      </div>
    )
  }

  return (
    <div className="w-64 bg-light-surface border-l border-border-subtle flex flex-col h-full overflow-hidden shrink-0">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border-subtle shrink-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="material-symbols-outlined text-[14px] text-forest-green">edit</span>
          <span className="text-xs font-semibold text-text-main truncate">
            &lt;{element.tagName.toLowerCase()}&gt;
          </span>
        </div>
        <button onClick={onClose} className="text-text-muted hover:text-text-main shrink-0">
          <span className="material-symbols-outlined text-[16px]">close</span>
        </button>
      </div>

      {/* Source file info */}
      {element.sourceFile && (
        <div className="px-3 py-1.5 border-b border-border-subtle text-[10px] text-text-muted truncate">
          {element.sourceFile}{element.sourceLine ? `:${element.sourceLine}` : ''}
        </div>
      )}

      {/* Scrollable sections */}
      <div className="flex-1 overflow-y-auto">
        {/* Typography */}
        <Section title="Typography" icon="format_size">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <label className="text-[10px] text-text-muted w-16 shrink-0">Size</label>
              <select
                value={fontSize}
                onChange={e => { setFontSize(e.target.value); applyChange('fontSize', e.target.value) }}
                className="flex-1 px-1.5 py-0.5 rounded border border-border-subtle bg-light-surface text-[11px] text-text-main focus:outline-none focus:ring-1 focus:ring-forest-green"
              >
                {Object.entries(TW_FONT_SIZE).map(([px, tw]) => (
                  <option key={px} value={px}>{tw} ({px})</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-[10px] text-text-muted w-16 shrink-0">Weight</label>
              <select
                value={fontWeight}
                onChange={e => { setFontWeight(e.target.value); applyChange('fontWeight', e.target.value) }}
                className="flex-1 px-1.5 py-0.5 rounded border border-border-subtle bg-light-surface text-[11px] text-text-main focus:outline-none focus:ring-1 focus:ring-forest-green"
              >
                {Object.entries(TW_FONT_WEIGHT).map(([w, tw]) => (
                  <option key={w} value={w}>{tw}</option>
                ))}
              </select>
            </div>

            <ColorInput label="Color" value={textColor} onChange={setTextColor} property="color" />

            <div className="flex items-center gap-2">
              <label className="text-[10px] text-text-muted w-16 shrink-0">Align</label>
              <div className="flex gap-0.5">
                {(['left', 'center', 'right', 'justify'] as const).map(align => (
                  <button
                    key={align}
                    onClick={() => { setTextAlign(align); applyChange('textAlign', align) }}
                    className={`p-1 rounded text-[12px] ${
                      textAlign === align ? 'bg-forest-green/10 text-forest-green' : 'text-text-muted hover:text-text-main hover:bg-light-surface-alt'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[14px]">format_align_{align}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </Section>

        {/* Colors */}
        <Section title="Colors" icon="palette">
          <div className="space-y-2">
            <ColorInput label="Background" value={bgColor} onChange={setBgColor} property="backgroundColor" />
            {/* Quick color presets */}
            <div className="flex flex-wrap gap-1 mt-1">
              {PRESET_COLORS.slice(0, 8).map(c => (
                <button
                  key={c.hex}
                  onClick={() => { setBgColor(c.hex); applyChange('backgroundColor', c.hex) }}
                  className="w-5 h-5 rounded border border-border-subtle hover:ring-1 hover:ring-forest-green"
                  style={{ backgroundColor: c.hex }}
                  title={c.name}
                />
              ))}
            </div>
          </div>
        </Section>

        {/* Spacing */}
        <Section title="Spacing" icon="padding">
          <div className="space-y-3">
            {/* Visual box model */}
            <div className="relative bg-light-surface-alt rounded p-1">
              <div className="text-[9px] text-text-muted text-center mb-0.5">margin</div>
              <div className="flex items-center justify-center gap-1 mb-0.5">
                <NumberInput label="L" value={marginLeft} onChange={setMarginLeft} property="marginLeft" />
                <div className="flex flex-col items-center gap-0.5 bg-light-surface rounded p-1 border border-dashed border-border-subtle">
                  <div className="text-[9px] text-text-muted">padding</div>
                  <NumberInput label="T" value={paddingTop} onChange={setPaddingTop} property="paddingTop" />
                  <div className="flex items-center gap-1">
                    <NumberInput label="L" value={paddingLeft} onChange={setPaddingLeft} property="paddingLeft" />
                    <div className="w-6 h-4 bg-forest-green/20 rounded text-[8px] text-center leading-4">el</div>
                    <NumberInput label="R" value={paddingRight} onChange={setPaddingRight} property="paddingRight" />
                  </div>
                  <NumberInput label="B" value={paddingBottom} onChange={setPaddingBottom} property="paddingBottom" />
                </div>
                <NumberInput label="R" value={marginRight} onChange={setMarginRight} property="marginRight" />
              </div>
              <div className="flex justify-center gap-1">
                <NumberInput label="T" value={marginTop} onChange={setMarginTop} property="marginTop" />
                <NumberInput label="B" value={marginBottom} onChange={setMarginBottom} property="marginBottom" />
              </div>
            </div>
          </div>
        </Section>

        {/* Border */}
        <Section title="Border" icon="border_style">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <label className="text-[10px] text-text-muted w-16 shrink-0">Radius</label>
              <select
                value={borderRadius}
                onChange={e => { setBorderRadius(e.target.value); applyChange('borderRadius', e.target.value) }}
                className="flex-1 px-1.5 py-0.5 rounded border border-border-subtle bg-light-surface text-[11px] text-text-main focus:outline-none focus:ring-1 focus:ring-forest-green"
              >
                {Object.entries(TW_BORDER_RADIUS).map(([px, tw]) => (
                  <option key={px} value={px}>{tw} ({px})</option>
                ))}
              </select>
            </div>
            <NumberInput label="Width" value={borderWidth} onChange={setBorderWidth} property="borderWidth" />
            <ColorInput label="Color" value={borderColor} onChange={setBorderColor} property="borderColor" />
          </div>
        </Section>

        {/* Size */}
        <Section title="Size" icon="aspect_ratio">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <label className="text-[10px] text-text-muted w-16 shrink-0">Width</label>
              <input
                type="text"
                value={width}
                onChange={e => { setWidth(e.target.value); applyChange('width', e.target.value) }}
                className="flex-1 px-1.5 py-0.5 rounded border border-border-subtle bg-light-surface text-[11px] text-text-main font-mono focus:outline-none focus:ring-1 focus:ring-forest-green"
                placeholder="auto"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-[10px] text-text-muted w-16 shrink-0">Height</label>
              <input
                type="text"
                value={height}
                onChange={e => { setHeight(e.target.value); applyChange('height', e.target.value) }}
                className="flex-1 px-1.5 py-0.5 rounded border border-border-subtle bg-light-surface text-[11px] text-text-main font-mono focus:outline-none focus:ring-1 focus:ring-forest-green"
                placeholder="auto"
              />
            </div>
          </div>
        </Section>
      </div>
    </div>
  )
}

// ---- Section wrapper ----

function Section({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true)
  return (
    <div className="border-b border-border-subtle">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-1.5 px-3 py-2 text-[11px] font-semibold text-text-muted hover:text-text-main transition-colors"
      >
        <span className="material-symbols-outlined text-[14px] transition-transform" style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)' }}>
          chevron_right
        </span>
        <span className="material-symbols-outlined text-[13px]">{icon}</span>
        {title}
      </button>
      {open && <div className="px-3 pb-3">{children}</div>}
    </div>
  )
}
