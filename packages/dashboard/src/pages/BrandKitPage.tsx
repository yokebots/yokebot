import { useState, useEffect } from 'react'
import * as engine from '@/lib/engine'
import type { BrandKit } from '@/lib/engine'
import { SettingsLayout } from '@/components/SettingsLayout'

type BrandKitForm = Omit<BrandKit, 'teamId'>

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

const FONT_OPTIONS = [
  'Inter', 'DM Sans', 'Playfair Display', 'Poppins', 'Roboto',
  'Space Grotesk', 'Montserrat', 'Lora',
]

const FONT_SIZE_OPTIONS = ['14px', '16px', '18px']

const COLOR_FIELDS: { key: keyof BrandKitForm; label: string }[] = [
  { key: 'primaryColor', label: 'Primary' },
  { key: 'secondaryColor', label: 'Secondary' },
  { key: 'accentColor', label: 'Accent' },
  { key: 'backgroundColor', label: 'Background' },
  { key: 'surfaceColor', label: 'Surface' },
  { key: 'textColor', label: 'Text' },
]

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
  const radius = kit.borderRadius
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

  return (
    <div
      className="overflow-hidden rounded-lg border border-border-subtle"
      style={{ backgroundColor: kit.backgroundColor, padding: spacing }}
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
            color: kit.textColor,
            fontFamily: kit.headingFont,
            fontSize: `calc(${kit.baseFontSize} * 1.25)`,
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
            color: kit.textColor,
            fontFamily: kit.bodyFont,
            fontSize: kit.baseFontSize,
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
              backgroundColor: kit.primaryColor,
              color: '#ffffff',
              borderRadius: btnRadius,
              padding: '8px 16px',
              fontSize: kit.baseFontSize,
              fontFamily: kit.bodyFont,
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
              color: kit.primaryColor,
              borderRadius: btnRadius,
              padding: '8px 16px',
              fontSize: kit.baseFontSize,
              fontFamily: kit.bodyFont,
              fontWeight: 500,
              border: `1px solid ${kit.primaryColor}`,
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
              style={{ backgroundColor: kit[c.key] as string }}
            />
            <span style={{ fontSize: '9px', color: kit.textColor, opacity: 0.5 }}>{c.label}</span>
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
    setKit((prev) => ({ ...prev, [key]: value, preset: null }))
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
                        value={kit[c.key] as string}
                        onChange={(e) => updateField(c.key, e.target.value)}
                        className="h-9 w-9 cursor-pointer rounded border border-border-subtle p-0.5"
                      />
                      <input
                        type="text"
                        value={kit[c.key] as string}
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
              <p className="mb-4 text-xs text-text-muted">Choose fonts and sizing for headings and body text.</p>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-text-secondary">Heading Font</label>
                    <select
                      value={kit.headingFont}
                      onChange={(e) => updateField('headingFont', e.target.value)}
                      className="w-full rounded-lg border border-border-subtle px-3 py-2 text-sm focus:border-forest-green focus:outline-none"
                    >
                      {FONT_OPTIONS.map((f) => (
                        <option key={f} value={f}>{f}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-text-secondary">Body Font</label>
                    <select
                      value={kit.bodyFont}
                      onChange={(e) => updateField('bodyFont', e.target.value)}
                      className="w-full rounded-lg border border-border-subtle px-3 py-2 text-sm focus:border-forest-green focus:outline-none"
                    >
                      {FONT_OPTIONS.map((f) => (
                        <option key={f} value={f}>{f}</option>
                      ))}
                    </select>
                  </div>
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
