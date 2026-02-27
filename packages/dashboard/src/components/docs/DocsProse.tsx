import { useState, type ReactNode } from 'react'

export function H2({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <h2 id={id} className="mt-10 mb-4 scroll-mt-20 font-display text-2xl font-bold text-text-main">
      {children}
    </h2>
  )
}

export function H3({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <h3 id={id} className="mt-8 mb-3 scroll-mt-20 font-display text-xl font-semibold text-text-main">
      {children}
    </h3>
  )
}

export function P({ children }: { children: ReactNode }) {
  return <p className="mb-4 text-text-secondary leading-relaxed">{children}</p>
}

export function Code({ children }: { children: ReactNode }) {
  return (
    <code className="rounded bg-light-surface-alt px-1.5 py-0.5 font-mono text-sm text-forest-green">
      {children}
    </code>
  )
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function CodeBlock({ children, title, language: _lang }: { children: string; title?: string; language?: string }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = () => {
    navigator.clipboard.writeText(children)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <div className="group/code relative mb-6 overflow-hidden rounded-lg border border-border-subtle">
      {title && (
        <div className="border-b border-border-subtle bg-light-surface-alt px-4 py-2 font-mono text-xs text-text-muted">
          {title}
        </div>
      )}
      <button
        onClick={handleCopy}
        className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-md bg-white/10 text-gray-400 opacity-0 transition-opacity hover:bg-white/20 hover:text-white group-hover/code:opacity-100"
        title="Copy to clipboard"
      >
        <span className="material-symbols-outlined text-[16px]">{copied ? 'check' : 'content_copy'}</span>
      </button>
      <pre className="overflow-x-auto bg-gray-950 p-4 pr-12 font-mono text-sm leading-relaxed text-gray-300">
        <code>{children}</code>
      </pre>
    </div>
  )
}

export function Tip({ children }: { children: ReactNode }) {
  return (
    <div className="mb-6 flex gap-3 rounded-lg border border-forest-green/20 bg-forest-green-light p-4 text-sm text-text-main">
      <span className="material-symbols-outlined shrink-0 text-forest-green text-[20px]">lightbulb</span>
      <div>{children}</div>
    </div>
  )
}

export function Warning({ children }: { children: ReactNode }) {
  return (
    <div className="mb-6 flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-text-main">
      <span className="material-symbols-outlined shrink-0 text-amber-600 text-[20px]">warning</span>
      <div>{children}</div>
    </div>
  )
}

export function UL({ children }: { children: ReactNode }) {
  return <ul className="mb-4 ml-6 list-disc space-y-2 text-text-secondary">{children}</ul>
}

export function OL({ children }: { children: ReactNode }) {
  return <ol className="mb-4 ml-6 list-decimal space-y-2 text-text-secondary">{children}</ol>
}

export function LI({ children }: { children: ReactNode }) {
  return <li className="leading-relaxed">{children}</li>
}

export function Table({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="mb-6 overflow-x-auto rounded-lg border border-border-subtle">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border-subtle bg-light-surface-alt">
            {headers.map((h, i) => (
              <th key={i} className="px-4 py-3 text-left font-semibold text-text-main">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-border-subtle last:border-0">
              {row.map((cell, j) => (
                <td key={j} className="px-4 py-3 text-text-secondary">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function HR() {
  return <hr className="my-8 border-border-subtle" />
}

export function A({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} className="text-forest-green hover:underline" target={href.startsWith('http') ? '_blank' : undefined} rel={href.startsWith('http') ? 'noopener noreferrer' : undefined}>
      {children}
    </a>
  )
}
