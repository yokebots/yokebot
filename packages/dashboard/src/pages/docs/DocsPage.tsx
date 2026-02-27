import { useParams, Link } from 'react-router'
import { useEffect, useRef } from 'react'
import { docsContent, docsOrder } from '@/lib/docs-content'

function useDocMeta(title: string, description: string) {
  useEffect(() => {
    document.title = `${title} — YokeBot Docs`
    let meta = document.querySelector('meta[name="description"]') as HTMLMetaElement | null
    if (!meta) {
      meta = document.createElement('meta')
      meta.name = 'description'
      document.head.appendChild(meta)
    }
    meta.content = description

    // Open Graph
    const setOg = (property: string, content: string) => {
      let el = document.querySelector(`meta[property="${property}"]`) as HTMLMetaElement | null
      if (!el) {
        el = document.createElement('meta')
        el.setAttribute('property', property)
        document.head.appendChild(el)
      }
      el.content = content
    }
    setOg('og:title', `${title} — YokeBot Docs`)
    setOg('og:description', description)
    setOg('og:type', 'article')
    setOg('og:site_name', 'YokeBot')
    setOg('og:url', window.location.href)

    return () => {
      document.title = 'YokeBot — GET YOKED'
    }
  }, [title, description])
}

export function DocsPage() {
  const { slug, section } = useParams()
  const fullSlug = section ? `${section}/${slug}` : (slug ?? 'getting-started')
  const doc = docsContent[fullSlug]

  useDocMeta(
    doc?.title ?? 'Page Not Found',
    doc?.description ?? 'YokeBot documentation'
  )

  // Scroll to top on page change
  const articleRef = useRef<HTMLElement>(null)
  useEffect(() => {
    // The scrollable container is the <main> parent
    articleRef.current?.closest('main')?.scrollTo(0, 0)
  }, [fullSlug])

  if (!doc) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <span className="material-symbols-outlined mb-4 text-6xl text-text-muted">search_off</span>
        <h1 className="mb-2 font-display text-2xl font-bold text-text-main">Page Not Found</h1>
        <p className="mb-6 text-text-secondary">
          The documentation page <code className="rounded bg-light-surface-alt px-1.5 py-0.5 font-mono text-sm text-forest-green">{fullSlug}</code> doesn't exist.
        </p>
        <Link
          to="/docs"
          className="rounded-lg bg-forest-green px-4 py-2 text-sm font-medium text-white hover:bg-forest-green-hover transition-colors"
        >
          Back to Docs
        </Link>
      </div>
    )
  }

  // Prev / Next navigation
  const currentIndex = docsOrder.indexOf(fullSlug)
  const prevSlug = currentIndex > 0 ? docsOrder[currentIndex - 1] : null
  const nextSlug = currentIndex < docsOrder.length - 1 ? docsOrder[currentIndex + 1] : null
  const prevDoc = prevSlug ? docsContent[prevSlug] : null
  const nextDoc = nextSlug ? docsContent[nextSlug] : null

  // Breadcrumb
  const breadcrumbParts = fullSlug.split('/')
  const sectionLabel = doc.section

  return (
    <article ref={articleRef}>
      {/* Breadcrumb */}
      <div className="mb-6 flex items-center gap-2 text-sm text-text-muted">
        <Link to="/docs" className="hover:text-forest-green transition-colors">Docs</Link>
        <span className="material-symbols-outlined text-[14px]">chevron_right</span>
        {breadcrumbParts.length > 1 && (
          <>
            <span>{sectionLabel}</span>
            <span className="material-symbols-outlined text-[14px]">chevron_right</span>
          </>
        )}
        <span className="text-text-main font-medium">{doc.title}</span>
      </div>

      {/* Title */}
      <h1 className="mb-2 font-display text-3xl font-bold tracking-tight text-text-main">
        {doc.title}
      </h1>
      <p className="mb-8 text-lg text-text-secondary">{doc.description}</p>

      <hr className="mb-8 border-border-subtle" />

      {/* Content */}
      <div className="docs-content">
        {doc.content()}
      </div>

      {/* Prev / Next */}
      <hr className="my-8 border-border-subtle" />
      <div className="flex items-stretch gap-4">
        {prevDoc ? (
          <Link
            to={`/docs/${prevSlug}`}
            className="group flex flex-1 flex-col rounded-lg border border-border-subtle p-4 hover:border-forest-green/30 hover:bg-forest-green-light transition-colors"
          >
            <span className="mb-1 flex items-center gap-1 text-xs text-text-muted">
              <span className="material-symbols-outlined text-[14px]">arrow_back</span>
              Previous
            </span>
            <span className="text-sm font-medium text-text-main group-hover:text-forest-green transition-colors">
              {prevDoc.title}
            </span>
          </Link>
        ) : (
          <div className="flex-1" />
        )}
        {nextDoc ? (
          <Link
            to={`/docs/${nextSlug}`}
            className="group flex flex-1 flex-col items-end rounded-lg border border-border-subtle p-4 hover:border-forest-green/30 hover:bg-forest-green-light transition-colors"
          >
            <span className="mb-1 flex items-center gap-1 text-xs text-text-muted">
              Next
              <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
            </span>
            <span className="text-sm font-medium text-text-main group-hover:text-forest-green transition-colors">
              {nextDoc.title}
            </span>
          </Link>
        ) : (
          <div className="flex-1" />
        )}
      </div>
    </article>
  )
}
