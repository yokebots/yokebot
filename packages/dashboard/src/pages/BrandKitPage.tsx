import { useState, useEffect, useRef } from 'react'
import * as engine from '@/lib/engine'
import type { BrandKit } from '@/lib/engine'
import { SettingsLayout } from '@/components/SettingsLayout'

type BrandKitForm = Omit<BrandKit, 'teamId'> & { preset?: string | null }

const DEFAULT_KIT: BrandKitForm = {
  primaryColor: '#6366f1',
  secondaryColor: '#06b6d4',
  accentColor: '#f59e0b',
  backgroundColor: '#ffffff',
  surfaceColor: '#f8fafc',
  textColor: '#0f172a',
  headingFont: 'Inter',
  bodyFont: 'Inter',
  baseFontSize: '16px',
  headingStyle: 'bold',
  borderRadius: '8px',
  spacingScale: 'comfortable',
  buttonStyle: 'rounded',
  cardStyle: 'elevated',
  preset: 'saas',
}

const PRESETS: { name: string; key: string; kit: BrandKitForm }[] = [
  {
    name: 'SaaS',
    key: 'saas',
    kit: {
      primaryColor: '#6366f1', secondaryColor: '#06b6d4', accentColor: '#f59e0b',
      backgroundColor: '#ffffff', surfaceColor: '#f8fafc', textColor: '#0f172a',
      headingFont: 'Inter', bodyFont: 'Inter', baseFontSize: '16px',
      headingStyle: 'bold', borderRadius: '8px', spacingScale: 'comfortable',
      buttonStyle: 'rounded', cardStyle: 'elevated', preset: 'saas',
    },
  },
  {
    name: 'E-commerce',
    key: 'ecommerce',
    kit: {
      primaryColor: '#dc2626', secondaryColor: '#059669', accentColor: '#d97706',
      backgroundColor: '#ffffff', surfaceColor: '#fafafa', textColor: '#171717',
      headingFont: 'DM Sans', bodyFont: 'Inter', baseFontSize: '16px',
      headingStyle: 'bold', borderRadius: '12px', spacingScale: 'comfortable',
      buttonStyle: 'pill', cardStyle: 'bordered', preset: 'ecommerce',
    },
  },
  {
    name: 'Portfolio',
    key: 'portfolio',
    kit: {
      primaryColor: '#1e293b', secondaryColor: '#64748b', accentColor: '#e11d48',
      backgroundColor: '#ffffff', surfaceColor: '#f1f5f9', textColor: '#0f172a',
      headingFont: 'Playfair Display', bodyFont: 'Inter', baseFontSize: '18px',
      headingStyle: 'light', borderRadius: '0px', spacingScale: 'spacious',
      buttonStyle: 'square', cardStyle: 'flat', preset: 'portfolio',
    },
  },
  {
    name: 'Dashboard',
    key: 'dashboard',
    kit: {
      primaryColor: '#2563eb', secondaryColor: '#7c3aed', accentColor: '#f59e0b',
      backgroundColor: '#0f172a', surfaceColor: '#1e293b', textColor: '#f1f5f9',
      headingFont: 'Inter', bodyFont: 'Inter', baseFontSize: '14px',
      headingStyle: 'bold', borderRadius: '6px', spacingScale: 'compact',
      buttonStyle: 'rounded', cardStyle: 'glass', preset: 'dashboard',
    },
  },
  {
    name: 'Minimal',
    key: 'minimal',
    kit: {
      primaryColor: '#000000', secondaryColor: '#525252', accentColor: '#dc2626',
      backgroundColor: '#ffffff', surfaceColor: '#fafafa', textColor: '#171717',
      headingFont: 'Inter', bodyFont: 'Inter', baseFontSize: '16px',
      headingStyle: 'uppercase', borderRadius: '4px', spacingScale: 'comfortable',
      buttonStyle: 'square', cardStyle: 'flat', preset: 'minimal',
    },
  },
]

// Top Google Fonts sorted by popularity
const GOOGLE_FONTS = [
  'Inter', 'Roboto', 'Open Sans', 'Noto Sans', 'Montserrat', 'Lato', 'Poppins',
  'Roboto Condensed', 'Source Sans 3', 'Oswald', 'Raleway', 'Nunito', 'Roboto Mono',
  'Ubuntu', 'Nunito Sans', 'Rubik', 'Playfair Display', 'Merriweather', 'PT Sans',
  'Roboto Slab', 'Noto Serif', 'Kanit', 'Work Sans', 'Lora', 'DM Sans', 'Fira Sans',
  'Quicksand', 'Barlow', 'Mulish', 'Manrope', 'IBM Plex Sans', 'PT Serif', 'Karla',
  'Heebo', 'Noto Sans JP', 'Libre Franklin', 'Libre Baskerville', 'Josefin Sans',
  'Hind', 'Arimo', 'Cabin', 'Dosis', 'Fira Code', 'Titillium Web', 'Archivo',
  'Mukta', 'Source Code Pro', 'Abel', 'Nanum Gothic', 'Exo 2', 'Overpass',
  'Bitter', 'Assistant', 'Cairo', 'Varela Round', 'Maven Pro', 'Space Grotesk',
  'Outfit', 'Comfortaa', 'Signika', 'Catamaran', 'Lexend', 'Crimson Text',
  'Prompt', 'EB Garamond', 'Cormorant Garamond', 'Figtree', 'Sora', 'Plus Jakarta Sans',
  'Jost', 'Urbanist', 'Red Hat Display', 'Geologica', 'Onest', 'Bricolage Grotesque',
  'Geist', 'Space Mono', 'JetBrains Mono', 'Inconsolata', 'Anonymous Pro',
  'IBM Plex Mono', 'Courier Prime', 'DM Mono',
  // Display & decorative
  'Bebas Neue', 'Righteous', 'Lobster', 'Pacifico', 'Permanent Marker',
  'Satisfy', 'Dancing Script', 'Shadows Into Light', 'Great Vibes', 'Caveat',
  'Architects Daughter', 'Sacramento', 'Abril Fatface', 'Alfa Slab One',
  'Fredoka', 'Lilita One', 'Bungee', 'Bangers',
  // Serif
  'Spectral', 'Cardo', 'Old Standard TT', 'Vollkorn', 'Alegreya',
  'Cormorant', 'Literata', 'Source Serif 4', 'Noto Serif Display',
  'DM Serif Display', 'DM Serif Text', 'Zilla Slab',
]

const FONT_SIZE_OPTIONS = ['12px', '14px', '16px', '18px', '20px']

const COLOR_FIELDS: { key: keyof BrandKitForm; label: string }[] = [
  { key: 'primaryColor', label: 'Primary' },
  { key: 'secondaryColor', label: 'Secondary' },
  { key: 'accentColor', label: 'Accent' },
  { key: 'backgroundColor', label: 'Background' },
  { key: 'surfaceColor', label: 'Surface' },
  { key: 'textColor', label: 'Text' },
]

// Load a Google Font dynamically
const loadedFonts = new Set<string>()
function loadGoogleFont(fontName: string) {
  if (loadedFonts.has(fontName)) return
  loadedFonts.add(fontName)
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(fontName)}:wght@300;400;500;600;700&display=swap`
  document.head.appendChild(link)
}

// Searchable font picker component
function FontPicker({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [customMode, setCustomMode] = useState(false)
  const [customValue, setCustomValue] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setSearch('')
        setCustomMode(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus()
  }, [open, customMode])

  // Load currently selected font
  useEffect(() => { loadGoogleFont(value) }, [value])

  const filtered = GOOGLE_FONTS.filter((f) =>
    f.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-text-secondary">{label}</label>
      <div ref={ref} className="relative">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="flex w-full items-center justify-between rounded-lg border border-border-subtle px-3 py-2 text-sm text-left focus:border-forest-green focus:outline-none hover:border-text-muted/40"
        >
          <span style={{ fontFamily: value }}>{value}</span>
          <span className="material-symbols-outlined text-[16px] text-text-muted">
            {open ? 'expand_less' : 'expand_more'}
          </span>
        </button>

        {open && (
          <div className="absolute z-50 mt-1 w-full rounded-lg border border-border-subtle bg-white shadow-lg">
            <div className="border-b border-border-subtle p-2">
              {customMode ? (
                <div className="flex gap-1">
                  <input
                    ref={inputRef}
                    type="text"
                    value={customValue}
                    onChange={(e) => setCustomValue(e.target.value)}
                    placeholder="Enter any font name..."
                    className="flex-1 rounded border border-border-subtle px-2 py-1.5 text-sm focus:border-forest-green focus:outline-none"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && customValue.trim()) {
                        loadGoogleFont(customValue.trim())
                        onChange(customValue.trim())
                        setOpen(false)
                        setCustomMode(false)
                        setCustomValue('')
                      }
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (customValue.trim()) {
                        loadGoogleFont(customValue.trim())
                        onChange(customValue.trim())
                        setOpen(false)
                        setCustomMode(false)
                        setCustomValue('')
                      }
                    }}
                    className="rounded bg-forest-green px-2 py-1 text-xs font-medium text-white"
                  >
                    Use
                  </button>
                  <button
                    type="button"
                    onClick={() => { setCustomMode(false); setCustomValue('') }}
                    className="rounded border border-border-subtle px-2 py-1 text-xs text-text-muted"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="flex gap-1">
                  <input
                    ref={inputRef}
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search fonts..."
                    className="flex-1 rounded border border-border-subtle px-2 py-1.5 text-sm focus:border-forest-green focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setCustomMode(true)}
                    className="shrink-0 rounded border border-border-subtle px-2 py-1 text-[11px] font-medium text-text-muted hover:bg-light-surface-alt"
                  >
                    Custom
                  </button>
                </div>
              )}
            </div>
            <div className="max-h-64 overflow-y-auto py-1">
              {filtered.length === 0 ? (
                <div className="px-3 py-4 text-center text-xs text-text-muted">
                  No fonts found.{' '}
                  <button
                    type="button"
                    onClick={() => { setCustomMode(true); setCustomValue(search) }}
                    className="text-forest-green underline"
                  >
                    Use custom font
                  </button>
                </div>
              ) : (
                filtered.map((f) => {
                  // Preload font on hover for preview
                  return (
                    <button
                      key={f}
                      type="button"
                      onMouseEnter={() => loadGoogleFont(f)}
                      onClick={() => {
                        loadGoogleFont(f)
                        onChange(f)
                        setOpen(false)
                        setSearch('')
                      }}
                      className={`flex w-full items-center justify-between px-3 py-2 text-sm transition-colors ${
                        value === f
                          ? 'bg-forest-green/10 text-forest-green font-medium'
                          : 'text-text-main hover:bg-light-surface-alt'
                      }`}
                    >
                      <span style={{ fontFamily: f }}>{f}</span>
                      {value === f && (
                        <span className="material-symbols-outlined text-[14px]">check</span>
                      )}
                    </button>
                  )
                })
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function PresetCard({ preset, active, onClick }: { preset: typeof PRESETS[number]; active: boolean; onClick: () => void }) {
  const k = preset.kit
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-2 rounded-lg border-2 p-3 transition-all hover:shadow-md ${
        active ? 'border-forest-green shadow-md' : 'border-border-subtle'
      }`}
    >
      {/* Mini preview */}
      <div
        className="flex h-16 w-full items-end gap-1 overflow-hidden rounded-md p-2"
        style={{ backgroundColor: k.backgroundColor }}
      >
        {/* Left side: mini card */}
        <div
          className="flex flex-1 flex-col gap-1 rounded p-1.5"
          style={{
            backgroundColor: k.surfaceColor,
            border: k.cardStyle === 'bordered' ? `1px solid ${k.primaryColor}33` : 'none',
            boxShadow: k.cardStyle === 'elevated' ? '0 1px 3px rgba(0,0,0,0.12)' : 'none',
          }}
        >
          <div
            className="h-1.5 w-10 rounded-sm"
            style={{
              backgroundColor: k.textColor,
              fontWeight: k.headingStyle === 'bold' ? 700 : 300,
            }}
          />
          <div className="h-1 w-14 rounded-sm" style={{ backgroundColor: k.textColor, opacity: 0.4 }} />
        </div>
        {/* Right side: color dots + button */}
        <div className="flex flex-col items-end gap-1">
          <div className="flex gap-0.5">
            <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: k.primaryColor }} />
            <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: k.secondaryColor }} />
            <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: k.accentColor }} />
          </div>
          <div
            className="h-3 w-10 rounded-sm"
            style={{
              backgroundColor: k.primaryColor,
              borderRadius: k.buttonStyle === 'pill' ? '99px' : k.buttonStyle === 'square' ? '0px' : '4px',
            }}
          />
        </div>
      </div>
      <span className="text-xs font-medium text-text-main">{preset.name}</span>
    </button>
  )
}

function LivePreview({ kit }: { kit: BrandKitForm }) {
  const radius = kit.borderRadius || '8px'
  const btnRadius = kit.buttonStyle === 'pill' ? '999px' : kit.buttonStyle === 'square' ? '0px' : radius
  const cardBorder = kit.cardStyle === 'bordered' ? `1px solid ${kit.primaryColor}33` : 'none'
  const cardShadow = kit.cardStyle === 'elevated'
    ? '0 4px 12px rgba(0,0,0,0.1)'
    : kit.cardStyle === 'glass'
      ? '0 8px 32px rgba(0,0,0,0.12)'
      : 'none'
  const cardBg = kit.cardStyle === 'glass'
    ? `${kit.surfaceColor}cc`
    : kit.surfaceColor
  const spacing = kit.spacingScale === 'compact' ? '12px' : kit.spacingScale === 'spacious' ? '24px' : '16px'
  const headingWeight = kit.headingStyle === 'bold' ? 700 : kit.headingStyle === 'light' ? 300 : 600
  const headingTransform = kit.headingStyle === 'uppercase' ? ('uppercase' as const) : ('none' as const)

  // Load fonts for preview
  useEffect(() => {
    if (kit.headingFont) loadGoogleFont(kit.headingFont)
    if (kit.bodyFont) loadGoogleFont(kit.bodyFont)
  }, [kit.headingFont, kit.bodyFont])

  return (
    <div
      className="overflow-hidden rounded-lg border border-border-subtle"
      style={{ backgroundColor: kit.backgroundColor || '#ffffff', padding: spacing }}
    >
      <p className="mb-3 text-xs font-medium text-text-muted">Live Preview</p>
      {/* Preview card */}
      <div
        style={{
          backgroundColor: cardBg,
          borderRadius: radius,
          border: cardBorder,
          boxShadow: cardShadow,
          padding: spacing,
          backdropFilter: kit.cardStyle === 'glass' ? 'blur(12px)' : undefined,
        }}
      >
        <h3
          style={{
            color: kit.textColor || '#0f172a',
            fontFamily: `"${kit.headingFont}", sans-serif`,
            fontSize: `calc(${kit.baseFontSize || '16px'} * 1.25)`,
            fontWeight: headingWeight,
            textTransform: headingTransform,
            marginBottom: '8px',
            lineHeight: 1.3,
          }}
        >
          Welcome Back
        </h3>
        <p
          style={{
            color: kit.textColor || '#0f172a',
            fontFamily: `"${kit.bodyFont}", sans-serif`,
            fontSize: kit.baseFontSize || '16px',
            opacity: 0.7,
            marginBottom: spacing,
            lineHeight: 1.5,
          }}
        >
          Your agents completed 12 tasks today. Review performance in the dashboard.
        </p>
        <div className="flex items-center gap-2">
          <button
            style={{
              backgroundColor: kit.primaryColor || '#6366f1',
              color: '#ffffff',
              borderRadius: btnRadius,
              padding: '8px 16px',
              fontSize: kit.baseFontSize || '16px',
              fontFamily: `"${kit.bodyFont}", sans-serif`,
              fontWeight: 500,
              border: 'none',
              cursor: 'pointer',
            }}
          >
            View Report
          </button>
          <button
            style={{
              backgroundColor: 'transparent',
              color: kit.primaryColor || '#6366f1',
              borderRadius: btnRadius,
              padding: '8px 16px',
              fontSize: kit.baseFontSize || '16px',
              fontFamily: `"${kit.bodyFont}", sans-serif`,
              fontWeight: 500,
              border: `1px solid ${kit.primaryColor || '#6366f1'}`,
              cursor: 'pointer',
            }}
          >
            Dismiss
          </button>
        </div>
      </div>
      {/* Color palette dots */}
      <div className="mt-3 flex items-center gap-2">
        {COLOR_FIELDS.map((c) => (
          <div key={c.key} className="flex flex-col items-center gap-1">
            <div
              className="h-5 w-5 rounded-full border border-black/10"
              style={{ backgroundColor: (kit[c.key] as string) || '#cccccc' }}
            />
            <span style={{ fontSize: '9px', color: kit.textColor || '#0f172a', opacity: 0.5 }}>{c.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function BrandKitPage() {
  const [kit, setKit] = useState<BrandKitForm>(DEFAULT_KIT)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    engine.getBrandKit()
      .then(({ teamId: _, ...data }) => setKit({ ...DEFAULT_KIT, ...data }))
      .catch(() => { /* use defaults */ })
      .finally(() => setLoading(false))
  }, [])

  const updateField = <K extends keyof BrandKitForm>(key: K, value: BrandKitForm[K]) => {
    setKit((prev) => ({ ...prev, [key]: value, preset: 'custom' }))
  }

  const applyPreset = (preset: typeof PRESETS[number]) => {
    setKit(preset.kit)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await engine.updateBrandKit(kit)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch { /* error */ }
    setSaving(false)
  }

  const radiusValue = parseInt(kit.borderRadius) || 0

  return (
    <SettingsLayout activeTab="brand-kit">
      {loading ? (
        <div className="py-12 text-center text-sm text-text-muted">Loading brand kit...</div>
      ) : (
        <div className="flex gap-8">
          {/* Left column: editors */}
          <div className="flex-1 space-y-6 max-w-3xl">
            {saved && (
              <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-700">
                <span className="material-symbols-outlined text-[16px]">check_circle</span>
                Saved successfully
              </div>
            )}

            {/* Presets */}
            <div className="rounded-lg border border-border-subtle bg-white p-5">
              <h3 className="mb-1 text-sm font-bold text-text-main">Presets</h3>
              <p className="mb-4 text-xs text-text-muted">Start with a preset, then customize to match your brand.</p>
              <div className="grid grid-cols-5 gap-3">
                {PRESETS.map((p) => (
                  <PresetCard key={p.key} preset={p} active={kit.preset === p.key} onClick={() => applyPreset(p)} />
                ))}
              </div>
            </div>

            {/* Colors */}
            <div className="rounded-lg border border-border-subtle bg-white p-5">
              <h3 className="mb-1 text-sm font-bold text-text-main">Colors</h3>
              <p className="mb-4 text-xs text-text-muted">Define your color palette for generated apps.</p>
              <div className="grid grid-cols-3 gap-4">
                {COLOR_FIELDS.map((c) => (
                  <div key={c.key}>
                    <label className="mb-1.5 block text-xs font-medium text-text-secondary">{c.label}</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={(kit[c.key] as string) || '#000000'}
                        onChange={(e) => updateField(c.key, e.target.value)}
                        className="h-9 w-9 cursor-pointer rounded border border-border-subtle p-0.5"
                      />
                      <input
                        type="text"
                        value={(kit[c.key] as string) || ''}
                        onChange={(e) => updateField(c.key, e.target.value)}
                        className="flex-1 rounded-lg border border-border-subtle px-3 py-2 text-sm font-mono focus:border-forest-green focus:outline-none"
                        maxLength={7}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Typography */}
            <div className="rounded-lg border border-border-subtle bg-white p-5">
              <h3 className="mb-1 text-sm font-bold text-text-main">Typography</h3>
              <p className="mb-4 text-xs text-text-muted">Choose from 100+ Google Fonts or enter any custom font name.</p>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <FontPicker
                    label="Heading Font"
                    value={kit.headingFont}
                    onChange={(v) => updateField('headingFont', v)}
                  />
                  <FontPicker
                    label="Body Font"
                    value={kit.bodyFont}
                    onChange={(v) => updateField('bodyFont', v)}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-text-secondary">Base Font Size</label>
                  <select
                    value={kit.baseFontSize}
                    onChange={(e) => updateField('baseFontSize', e.target.value)}
                    className="w-48 rounded-lg border border-border-subtle px-3 py-2 text-sm focus:border-forest-green focus:outline-none"
                  >
                    {FONT_SIZE_OPTIONS.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-text-secondary">Heading Style</label>
                  <div className="flex gap-3">
                    {['bold', 'light', 'uppercase'].map((style) => (
                      <label
                        key={style}
                        className={`flex cursor-pointer items-center gap-2 rounded-lg border-2 px-4 py-2.5 text-sm transition-colors ${
                          kit.headingStyle === style
                            ? 'border-forest-green bg-forest-green/5 text-forest-green'
                            : 'border-border-subtle text-text-muted hover:border-text-muted/30'
                        }`}
                      >
                        <input
                          type="radio"
                          name="headingStyle"
                          value={style}
                          checked={kit.headingStyle === style}
                          onChange={(e) => updateField('headingStyle', e.target.value)}
                          className="sr-only"
                        />
                        <span
                          style={{
                            fontWeight: style === 'bold' ? 700 : style === 'light' ? 300 : 600,
                            textTransform: style === 'uppercase' ? 'uppercase' : 'none',
                            fontSize: '13px',
                          }}
                        >
                          {style === 'bold' ? 'Bold' : style === 'light' ? 'Light' : 'UPPERCASE'}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Components */}
            <div className="rounded-lg border border-border-subtle bg-white p-5">
              <h3 className="mb-1 text-sm font-bold text-text-main">Components</h3>
              <p className="mb-4 text-xs text-text-muted">Configure how UI elements look in generated apps.</p>
              <div className="space-y-5">
                {/* Border Radius */}
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-text-secondary">
                    Border Radius: {kit.borderRadius}
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min={0}
                      max={24}
                      value={radiusValue}
                      onChange={(e) => updateField('borderRadius', `${e.target.value}px`)}
                      className="flex-1 accent-forest-green"
                    />
                    <div
                      className="h-10 w-16 border-2 border-forest-green bg-forest-green/10"
                      style={{ borderRadius: kit.borderRadius }}
                    />
                  </div>
                </div>

                {/* Spacing Scale */}
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-text-secondary">Spacing Scale</label>
                  <div className="flex gap-3">
                    {(['compact', 'comfortable', 'spacious'] as const).map((scale) => (
                      <label
                        key={scale}
                        className={`flex cursor-pointer flex-col items-center gap-1.5 rounded-lg border-2 px-5 py-3 transition-colors ${
                          kit.spacingScale === scale
                            ? 'border-forest-green bg-forest-green/5'
                            : 'border-border-subtle hover:border-text-muted/30'
                        }`}
                      >
                        <input
                          type="radio"
                          name="spacingScale"
                          value={scale}
                          checked={kit.spacingScale === scale}
                          onChange={(e) => updateField('spacingScale', e.target.value)}
                          className="sr-only"
                        />
                        <div className="flex flex-col items-center" style={{ gap: scale === 'compact' ? '2px' : scale === 'spacious' ? '6px' : '4px' }}>
                          <div className="h-1.5 w-8 rounded-full bg-text-muted/40" />
                          <div className="h-1.5 w-8 rounded-full bg-text-muted/40" />
                          <div className="h-1.5 w-8 rounded-full bg-text-muted/40" />
                        </div>
                        <span className="text-xs font-medium capitalize text-text-main">{scale}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Button Style */}
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-text-secondary">Button Style</label>
                  <div className="flex gap-3">
                    {(['rounded', 'pill', 'square'] as const).map((style) => {
                      const btnRadius = style === 'pill' ? '999px' : style === 'square' ? '0px' : '8px'
                      return (
                        <label
                          key={style}
                          className={`flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 px-5 py-3 transition-colors ${
                            kit.buttonStyle === style
                              ? 'border-forest-green bg-forest-green/5'
                              : 'border-border-subtle hover:border-text-muted/30'
                          }`}
                        >
                          <input
                            type="radio"
                            name="buttonStyle"
                            value={style}
                            checked={kit.buttonStyle === style}
                            onChange={(e) => updateField('buttonStyle', e.target.value)}
                            className="sr-only"
                          />
                          <div
                            className="flex h-7 w-16 items-center justify-center bg-forest-green text-[10px] font-medium text-white"
                            style={{ borderRadius: btnRadius }}
                          >
                            Button
                          </div>
                          <span className="text-xs font-medium capitalize text-text-main">{style}</span>
                        </label>
                      )
                    })}
                  </div>
                </div>

                {/* Card Style */}
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-text-secondary">Card Style</label>
                  <div className="flex gap-3">
                    {(['flat', 'elevated', 'bordered', 'glass'] as const).map((style) => {
                      const cardStyles: React.CSSProperties = {
                        borderRadius: '6px',
                        padding: '8px',
                        width: '64px',
                        height: '40px',
                        backgroundColor: style === 'glass' ? 'rgba(255,255,255,0.6)' : '#f8fafc',
                        border: style === 'bordered' ? '1px solid #e2e8f0' : 'none',
                        boxShadow: style === 'elevated' ? '0 2px 8px rgba(0,0,0,0.1)' : style === 'glass' ? '0 4px 16px rgba(0,0,0,0.08)' : 'none',
                        backdropFilter: style === 'glass' ? 'blur(8px)' : undefined,
                      }
                      return (
                        <label
                          key={style}
                          className={`flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 px-4 py-3 transition-colors ${
                            kit.cardStyle === style
                              ? 'border-forest-green bg-forest-green/5'
                              : 'border-border-subtle hover:border-text-muted/30'
                          }`}
                        >
                          <input
                            type="radio"
                            name="cardStyle"
                            value={style}
                            checked={kit.cardStyle === style}
                            onChange={(e) => updateField('cardStyle', e.target.value)}
                            className="sr-only"
                          />
                          <div style={cardStyles}>
                            <div className="h-1.5 w-8 rounded-sm bg-text-muted/30" />
                            <div className="mt-1 h-1 w-10 rounded-sm bg-text-muted/20" />
                          </div>
                          <span className="text-xs font-medium capitalize text-text-main">{style}</span>
                        </label>
                      )
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Save */}
            <div className="flex items-center gap-3">
              <button
                onClick={handleSave}
                disabled={saving}
                className="rounded-lg bg-forest-green px-6 py-2.5 text-sm font-medium text-white hover:bg-forest-green/90 disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Brand Kit'}
              </button>
              {saved && <span className="text-sm text-green-600">Saved!</span>}
            </div>
          </div>

          {/* Right column: live preview (sticky) */}
          <div className="hidden w-80 shrink-0 lg:block">
            <div className="sticky top-6">
              <LivePreview kit={kit} />
            </div>
          </div>
        </div>
      )}
    </SettingsLayout>
  )
}
