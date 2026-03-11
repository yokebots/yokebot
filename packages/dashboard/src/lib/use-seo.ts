import { useEffect } from 'react'

interface SEOProps {
  title: string
  description: string
  path: string
}

const SITE_NAME = 'YokeBot'
const SITE_URL = 'https://yokebot.com'
const OG_IMAGE = `${SITE_URL}/og-image.png`

function setMeta(attr: string, key: string, content: string) {
  let el = document.querySelector(`meta[${attr}="${key}"]`) as HTMLMetaElement | null
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, key)
    document.head.appendChild(el)
  }
  el.setAttribute('content', content)
}

function setCanonical(url: string) {
  let el = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null
  if (!el) {
    el = document.createElement('link')
    el.setAttribute('rel', 'canonical')
    document.head.appendChild(el)
  }
  el.setAttribute('href', url)
}

export function useSEO({ title, description, path }: SEOProps) {
  useEffect(() => {
    const fullTitle = path === '/' ? title : `${title} — ${SITE_NAME}`
    const fullUrl = `${SITE_URL}${path}`

    document.title = fullTitle

    // Standard meta
    setMeta('name', 'description', description)

    // Open Graph
    setMeta('property', 'og:title', fullTitle)
    setMeta('property', 'og:description', description)
    setMeta('property', 'og:type', 'website')
    setMeta('property', 'og:site_name', SITE_NAME)
    setMeta('property', 'og:url', fullUrl)
    setMeta('property', 'og:image', OG_IMAGE)

    // Twitter Card
    setMeta('name', 'twitter:card', 'summary_large_image')
    setMeta('name', 'twitter:site', '@yokebots')
    setMeta('name', 'twitter:title', fullTitle)
    setMeta('name', 'twitter:description', description)
    setMeta('name', 'twitter:image', OG_IMAGE)

    // Canonical
    setCanonical(fullUrl)

    return () => {
      document.title = `${SITE_NAME} — AI Agent Workforce Platform`
    }
  }, [title, description, path])
}
